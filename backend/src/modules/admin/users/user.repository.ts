import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import {
  revokeActiveUserSessions,
  runSerializableWithRetry
} from "../../../cli/cli-user.repository.js";
import type {
  AdminUserListQuery,
  AdminUserRecord,
  UserMutationContext,
  UserMutationResult
} from "./user.types.js";
import {
  lastActiveAdmin,
  userAlreadyActive,
  userAlreadyDisabled,
  userNotFound,
  userRoleUnchanged
} from "./user.service.js";

export interface ChangeUserRoleRepositoryInput {
  context: UserMutationContext;
  id: string;
  role: "admin" | "editor";
}

export interface DisableUserRepositoryInput {
  context: UserMutationContext;
  id: string;
}

export interface EnableUserRepositoryInput {
  context: UserMutationContext;
  id: string;
}

export interface AdminUserRepository {
  changeRole(input: ChangeUserRoleRepositoryInput): Promise<UserMutationResult>;
  disable(input: DisableUserRepositoryInput): Promise<UserMutationResult>;
  enable(input: EnableUserRepositoryInput): Promise<UserMutationResult>;
  getUser(id: string): Promise<AdminUserRecord | null>;
  listUsers(query: AdminUserListQuery): Promise<{ rows: AdminUserRecord[]; total: number }>;
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

export function createPrismaAdminUserRepository(options: {
  prisma: PrismaClient;
}): AdminUserRepository {
  const prisma = options.prisma;

  return {
    changeRole(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await findUserOrThrow(tx, input.id);

        if (before.role === input.role) {
          throw userRoleUnchanged();
        }

        if (before.active && before.role === "admin" && input.role !== "admin") {
          await assertCanRemoveActiveAdmin(tx);
        }

        const after = await tx.user.update({
          data: { role: input.role },
          select: userSelect,
          where: { id: input.id }
        });
        const sessionsRevoked = await revokeActiveUserSessions(
          tx,
          input.id,
          input.context.now
        );

        await createUserAudit(tx, {
          action: "user.role_change",
          afterJson: {
            ...safeUserProjection(after),
            sessionsRevoked,
            source: input.context.source
          },
          beforeJson: safeUserProjection(before),
          context: input.context,
          entityId: input.id
        });

        return { sessionsRevoked, user: toAdminUserRecord(after) };
      });
    },
    disable(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await findUserOrThrow(tx, input.id);

        if (!before.active) {
          throw userAlreadyDisabled();
        }
        if (before.role === "admin") {
          await assertCanRemoveActiveAdmin(tx);
        }

        const after = await tx.user.update({
          data: { active: false },
          select: userSelect,
          where: { id: input.id }
        });
        const sessionsRevoked = await revokeActiveUserSessions(
          tx,
          input.id,
          input.context.now
        );

        await createUserAudit(tx, {
          action: "user.disable",
          afterJson: {
            ...safeUserProjection(after),
            sessionsRevoked,
            source: input.context.source
          },
          beforeJson: safeUserProjection(before),
          context: input.context,
          entityId: input.id
        });

        return { sessionsRevoked, user: toAdminUserRecord(after) };
      });
    },
    enable(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await findUserOrThrow(tx, input.id);

        if (before.active) {
          throw userAlreadyActive();
        }

        const after = await tx.user.update({
          data: { active: true },
          select: userSelect,
          where: { id: input.id }
        });

        await createUserAudit(tx, {
          action: "user.enable",
          afterJson: {
            ...safeUserProjection(after),
            source: input.context.source
          },
          beforeJson: safeUserProjection(before),
          context: input.context,
          entityId: input.id
        });

        return { sessionsRevoked: 0, user: toAdminUserRecord(after) };
      });
    },
    async getUser(id) {
      const user = await prisma.user.findUnique({
        select: userSelect,
        where: { id }
      });

      return user === null ? null : toAdminUserRecord(user);
    },
    async listUsers(query) {
      const where = createListWhere(query);
      const orderBy = [
        { [query.sort]: query.direction },
        { id: query.direction }
      ] satisfies Prisma.UserOrderByWithRelationInput[];
      const [total, rows] = await prisma.$transaction([
        prisma.user.count({ where }),
        prisma.user.findMany({
          orderBy,
          select: userSelect,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          where
        })
      ]);

      return {
        rows: rows.map(toAdminUserRecord),
        total
      };
    }
  };
}

async function findUserOrThrow(
  tx: Prisma.TransactionClient,
  id: string
): Promise<AdminUserRecord> {
  const user = await tx.user.findUnique({
    select: userSelect,
    where: { id }
  });

  if (user === null) {
    throw userNotFound();
  }

  return toAdminUserRecord(user);
}

async function assertCanRemoveActiveAdmin(tx: Prisma.TransactionClient): Promise<void> {
  const activeAdminCount = await tx.user.count({
    where: {
      active: true,
      role: "admin"
    }
  });

  if (activeAdminCount <= 1) {
    throw lastActiveAdmin();
  }
}

function createListWhere(query: AdminUserListQuery): Prisma.UserWhereInput {
  return {
    ...(query.active === undefined ? {} : { active: query.active }),
    ...(query.role === undefined ? {} : { role: query.role }),
    ...(query.search === undefined
      ? {}
      : {
          email: {
            contains: query.search,
            mode: "insensitive"
          }
        })
  };
}

async function createUserAudit(
  tx: Prisma.TransactionClient,
  input: {
    action: string;
    afterJson: Prisma.InputJsonValue;
    beforeJson: Prisma.InputJsonValue;
    context: UserMutationContext;
    entityId: string;
  }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.context.actorUserId,
      afterJson: input.afterJson,
      beforeJson: input.beforeJson,
      entityId: input.entityId,
      entityType: "user",
      ipHash: null,
      requestId: input.context.requestId,
      userAgentHash: null
    }
  });
}

function safeUserProjection(input: {
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

function toAdminUserRecord(input: {
  active: boolean;
  createdAt: Date;
  email: string;
  id: string;
  lastLoginAt: Date | null;
  role: string;
  updatedAt: Date;
}): AdminUserRecord {
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
