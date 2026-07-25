import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type {
  AuthRepository,
  AuthRole,
  AuthUserRecord,
  CommitLoginSuccessInput,
  RefreshSessionRecord,
  RevokeRefreshFamilyWithAuditInput,
  RotateRefreshSessionInput,
  RotateRefreshSessionResult,
  SafeAuditInput,
  SafeAuthUser,
  UserSessionContext
} from "./auth.types.js";

export interface CreateAuthRepositoryOptions {
  prisma: PrismaClient;
}

class RotationConflict extends Error {}

export function createAuthRepository(options: CreateAuthRepositoryOptions): AuthRepository {
  return {
    findActiveUserById: async (userId) => {
      const user = await options.prisma.user.findFirst({
        select: {
          email: true,
          id: true,
          role: true
        },
        where: {
          active: true,
          id: userId
        }
      });

      return user === null ? null : toSafeUser(user);
    },
    findRefreshSessionByTokenHash: async (tokenHash) => {
      const session = await options.prisma.refreshSession.findUnique({
        where: { tokenHash }
      });

      return session === null ? null : toRefreshSessionRecord(session);
    },
    findSessionContext: async (input) => {
      const session = await options.prisma.refreshSession.findFirst({
        select: {
          expiresAt: true,
          id: true,
          revokedAt: true,
          user: {
            select: {
              active: true,
              email: true,
              id: true,
              role: true
            }
          },
          userId: true
        },
        where: {
          id: input.sessionId,
          userId: input.userId
        }
      });

      return session === null ? null : toUserSessionContext(session);
    },
    findUserByEmail: async (email) => {
      const user = await options.prisma.user.findUnique({
        where: { email }
      });

      return user === null ? null : toAuthUserRecord(user);
    },
    commitLoginSuccess: (input) => commitLoginSuccess(options.prisma, input),
    revokeRefreshFamilyWithAudit: (input) =>
      revokeRefreshFamilyWithAudit(options.prisma, input),
    rotateRefreshSession: (input) => rotateRefreshSession(options.prisma, input)
  };
}

async function commitLoginSuccess(
  prisma: PrismaClient,
  input: CommitLoginSuccessInput
): Promise<RefreshSessionRecord> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.refreshSession.create({
      data: {
        expiresAt: input.session.expiresAt,
        familyId: input.session.familyId,
        id: input.session.id,
        ipHash: input.session.ipHash ?? null,
        tokenHash: input.session.tokenHash,
        userAgentHash: input.session.userAgentHash ?? null,
        userId: input.session.userId
      }
    });

    await tx.user.update({
      data: { lastLoginAt: input.lastLoginAt },
      where: { id: input.session.userId }
    });
    await createAuditLog(tx, input.audit);

    return toRefreshSessionRecord(session);
  });
}

async function rotateRefreshSession(
  prisma: PrismaClient,
  input: RotateRefreshSessionInput
): Promise<RotateRefreshSessionResult> {
  try {
    const session = await prisma.$transaction(async (tx) => {
      const successor = await tx.refreshSession.create({
        data: {
          expiresAt: input.currentSession.expiresAt,
          familyId: input.currentSession.familyId,
          id: input.successor.id,
          ipHash: input.successor.ipHash ?? null,
          tokenHash: input.successor.tokenHash,
          userAgentHash: input.successor.userAgentHash ?? null,
          userId: input.currentSession.userId
        }
      });
      const updated = await tx.refreshSession.updateMany({
        data: {
          replacedBySessionId: successor.id,
          revokedAt: input.now
        },
        where: {
          expiresAt: { gt: input.now },
          id: input.currentSession.id,
          replacedBySessionId: null,
          revokedAt: null
        }
      });

      if (updated.count !== 1) {
        throw new RotationConflict("refresh session was already rotated");
      }

      return successor;
    });

    return { kind: "rotated", session: toRefreshSessionRecord(session) };
  } catch (error) {
    if (error instanceof RotationConflict) {
      return { kind: "reuse" };
    }

    throw error;
  }
}

async function revokeRefreshFamilyWithAudit(
  prisma: PrismaClient,
  input: RevokeRefreshFamilyWithAuditInput
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.refreshSession.updateMany({
      data: { revokedAt: input.now },
      where: {
        familyId: input.familyId,
        revokedAt: null
      }
    });
    await createAuditLog(tx, input.audit);
  });
}

async function createAuditLog(
  tx: Prisma.TransactionClient,
  input: SafeAuditInput
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      afterJson: Prisma.DbNull,
      beforeJson: Prisma.DbNull,
      entityId: input.entityId ?? null,
      entityType: "auth",
      ipHash: input.ipHash ?? null,
      requestId: input.requestId,
      userAgentHash: input.userAgentHash ?? null
    }
  });
}

function toAuthUserRecord(input: {
  active: boolean;
  email: string;
  id: string;
  passwordHash: string;
  role: string;
}): AuthUserRecord {
  return {
    active: input.active,
    email: input.email,
    id: input.id,
    passwordHash: input.passwordHash,
    role: toAuthRole(input.role)
  };
}

function toSafeUser(input: { email: string; id: string; role: string }): SafeAuthUser {
  return {
    email: input.email,
    id: input.id,
    role: toAuthRole(input.role)
  };
}

function toAuthRole(value: string): AuthRole {
  return value === "admin" ? "admin" : "editor";
}

function toRefreshSessionRecord(input: {
  expiresAt: Date;
  familyId: string;
  id: string;
  replacedBySessionId: string | null;
  revokedAt: Date | null;
  tokenHash: string;
  userId: string;
}): RefreshSessionRecord {
  return {
    expiresAt: input.expiresAt,
    familyId: input.familyId,
    id: input.id,
    replacedBySessionId: input.replacedBySessionId,
    revokedAt: input.revokedAt,
    tokenHash: input.tokenHash,
    userId: input.userId
  };
}

function toUserSessionContext(input: {
  expiresAt: Date;
  id: string;
  revokedAt: Date | null;
  user: {
    active: boolean;
    email: string;
    id: string;
    role: string;
  };
  userId: string;
}): UserSessionContext {
  return {
    session: {
      expiresAt: input.expiresAt,
      id: input.id,
      revokedAt: input.revokedAt,
      userId: input.userId
    },
    user: {
      active: input.user.active,
      email: input.user.email,
      id: input.user.id,
      role: toAuthRole(input.user.role)
    }
  };
}
