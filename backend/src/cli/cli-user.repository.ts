import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../lib/errors.js";
import type { CliUserRole } from "./cli.types.js";

export const MAX_SERIALIZABLE_ATTEMPTS = 5;
export const SERIALIZABLE_MAX_WAIT_MS = 10_000;
export const SERIALIZABLE_TIMEOUT_MS = 30_000;

export interface SafeCliUserRecord {
  active: boolean;
  createdAt: Date;
  email: string;
  id: string;
  lastLoginAt: Date | null;
  role: CliUserRole;
  updatedAt: Date;
}

export interface BootstrapFirstAdminRepositoryInput {
  email: string;
  now: Date;
  passwordHash: string;
  requestId: string;
}

export interface CreateCliUserRepositoryInput {
  email: string;
  now: Date;
  passwordHash: string;
  requestId: string;
  role: CliUserRole;
}

export interface SetUserPasswordRepositoryInput {
  email: string;
  now: Date;
  passwordHash: string;
  requestId: string;
}

export interface SetUserPasswordResult {
  sessionsRevoked: number;
  user: SafeCliUserRecord;
}

export interface CliUserRepository {
  bootstrapFirstAdmin(input: BootstrapFirstAdminRepositoryInput): Promise<SafeCliUserRecord>;
  createUser(input: CreateCliUserRepositoryInput): Promise<SafeCliUserRecord>;
  setPassword(input: SetUserPasswordRepositoryInput): Promise<SetUserPasswordResult>;
}

interface SerializablePrisma {
  $transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    options: {
      isolationLevel: Prisma.TransactionIsolationLevel;
      maxWait: number;
      timeout: number;
    }
  ): Promise<T>;
}

const userSelect = {
  active: true,
  createdAt: true,
  email: true,
  id: true,
  lastLoginAt: true,
  role: true,
  updatedAt: true
} satisfies Prisma.UserSelect;

export async function runSerializableWithRetry<T>(
  prisma: SerializablePrisma,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: SERIALIZABLE_MAX_WAIT_MS,
        timeout: SERIALIZABLE_TIMEOUT_MS
      });
    } catch (error) {
      if (error instanceof AppError || !isRetryableSerializableConflict(error)) {
        throw error;
      }

      if (attempt === MAX_SERIALIZABLE_ATTEMPTS) {
        throw concurrentModification();
      }
    }
  }

  throw concurrentModification();
}

export function createPrismaCliUserRepository(options: {
  prisma: PrismaClient;
}): CliUserRepository {
  const prisma = options.prisma;

  return {
    async bootstrapFirstAdmin(input) {
      try {
        return await runSerializableWithRetry(prisma, async (tx) => {
          const adminCount = await tx.user.count({
            where: { role: "admin" }
          });

          if (adminCount > 0) {
            throw appError("BOOTSTRAP_ALREADY_COMPLETED", 409);
          }

          const user = await tx.user.create({
            data: {
              active: true,
              email: input.email,
              lastLoginAt: null,
              passwordHash: input.passwordHash,
              role: "admin"
            },
            select: userSelect
          });

          await createUserAudit(tx, {
            action: "user.bootstrap_admin",
            afterJson: withCliSource(toSafeUserAuditProjection(user)),
            beforeJson: Prisma.DbNull,
            entityId: user.id,
            requestId: input.requestId
          });

          return toSafeCliUserRecord(user);
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          throw appError("USER_EMAIL_CONFLICT", 409);
        }

        throw error;
      }
    },
    async createUser(input) {
      try {
        return await runSerializableWithRetry(prisma, async (tx) => {
          const activeAdminCount = await tx.user.count({
            where: {
              active: true,
              role: "admin"
            }
          });

          if (activeAdminCount < 1) {
            throw appError("LAST_ACTIVE_ADMIN", 409);
          }

          const user = await tx.user.create({
            data: {
              active: true,
              email: input.email,
              lastLoginAt: null,
              passwordHash: input.passwordHash,
              role: input.role
            },
            select: userSelect
          });

          await createUserAudit(tx, {
            action: "user.create_cli",
            afterJson: withCliSource(toSafeUserAuditProjection(user)),
            beforeJson: Prisma.DbNull,
            entityId: user.id,
            requestId: input.requestId
          });

          return toSafeCliUserRecord(user);
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          throw appError("USER_EMAIL_CONFLICT", 409);
        }

        throw error;
      }
    },
    async setPassword(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await tx.user.findUnique({
          select: userSelect,
          where: { email: input.email }
        });

        if (before === null) {
          throw appError("USER_NOT_FOUND", 404);
        }

        const user = await tx.user.update({
          data: { passwordHash: input.passwordHash },
          select: userSelect,
          where: { id: before.id }
        });
        const sessionsRevoked = await revokeActiveUserSessions(tx, before.id, input.now);

        await createUserAudit(tx, {
          action: "user.password_set_cli",
          afterJson: {
            passwordChanged: true,
            sessionsRevoked,
            source: "cli"
          },
          beforeJson: { passwordChanged: false },
          entityId: before.id,
          requestId: input.requestId
        });

        return {
          sessionsRevoked,
          user: toSafeCliUserRecord(user)
        };
      });
    }
  };
}

export async function revokeActiveUserSessions(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date
): Promise<number> {
  const result = await tx.refreshSession.updateMany({
    data: { revokedAt: now },
    where: {
      revokedAt: null,
      userId
    }
  });

  return result.count;
}

export function appError(
  code: AppError["code"],
  statusCode: number,
  message = defaultErrorMessage(code)
): AppError {
  return new AppError({
    code,
    message,
    statusCode
  });
}

export function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isRetryableSerializableConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("code" in error && (error as { code?: unknown }).code === "P2034") {
    return true;
  }

  const cause = "cause" in error ? (error as { cause?: unknown }).cause : undefined;

  return (
    typeof cause === "object" &&
    cause !== null &&
    "kind" in cause &&
    "originalCode" in cause &&
    (cause as { kind?: unknown }).kind === "TransactionWriteConflict" &&
    (cause as { originalCode?: unknown }).originalCode === "40001"
  );
}

function concurrentModification(): AppError {
  return appError("CONCURRENT_MODIFICATION", 409);
}

async function createUserAudit(
  tx: Prisma.TransactionClient,
  input: {
    action: string;
    afterJson: Prisma.InputJsonValue | typeof Prisma.DbNull;
    beforeJson: Prisma.InputJsonValue | typeof Prisma.DbNull;
    entityId: string;
    requestId: string;
  }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      actorUserId: null,
      afterJson: input.afterJson,
      beforeJson: input.beforeJson,
      entityId: input.entityId,
      entityType: "user",
      ipHash: null,
      requestId: input.requestId,
      userAgentHash: null
    }
  });
}

function toSafeCliUserRecord(input: {
  active: boolean;
  createdAt: Date;
  email: string;
  id: string;
  lastLoginAt: Date | null;
  role: string;
  updatedAt: Date;
}): SafeCliUserRecord {
  return {
    active: input.active,
    createdAt: input.createdAt,
    email: input.email,
    id: input.id,
    lastLoginAt: input.lastLoginAt,
    role: input.role === "admin" ? "admin" : "editor",
    updatedAt: input.updatedAt
  };
}

function toSafeUserAuditProjection(input: {
  active: boolean;
  email: string;
  id: string;
  role: string;
}): Prisma.InputJsonObject {
  return {
    active: input.active,
    email: input.email,
    id: input.id,
    role: input.role === "admin" ? "admin" : "editor"
  };
}

function withCliSource(
  projection: Prisma.InputJsonObject
): Prisma.InputJsonObject {
  return {
    ...projection,
    source: "cli"
  };
}

function defaultErrorMessage(code: AppError["code"]): string {
  switch (code) {
    case "BOOTSTRAP_ALREADY_COMPLETED":
      return "Admin bootstrap has already been completed.";
    case "CONCURRENT_MODIFICATION":
      return "The operation conflicted with another update. Try again.";
    case "LAST_ACTIVE_ADMIN":
      return "At least one active admin must remain.";
    case "USER_EMAIL_CONFLICT":
      return "Email is already in use.";
    case "USER_NOT_FOUND":
      return "User was not found.";
    default:
      return "Request failed.";
  }
}
