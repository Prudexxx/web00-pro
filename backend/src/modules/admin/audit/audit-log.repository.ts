import type { Prisma, PrismaClient } from "../../../generated/prisma/client.js";
import type { AdminAuditLogQuery, AdminAuditLogRecord } from "./audit-log.types.js";

export interface AdminAuditLogRepository {
  listAuditLogs(query: AdminAuditLogQuery): Promise<{
    rows: AdminAuditLogRecord[];
    total: number;
  }>;
}

export function createPrismaAdminAuditLogRepository(
  options: { prisma: PrismaClient }
): AdminAuditLogRepository {
  const prisma = options.prisma;

  return {
    async listAuditLogs(query) {
      const where = createWhere(query);
      const orderBy = [
        { createdAt: query.sort === "oldest" ? "asc" : "desc" },
        { id: query.sort === "oldest" ? "asc" : "desc" }
      ] satisfies Prisma.AuditLogOrderByWithRelationInput[];
      const [total, rows] = await prisma.$transaction([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          orderBy,
          select: {
            action: true,
            actorUser: {
              select: {
                email: true,
                id: true,
                role: true
              }
            },
            afterJson: true,
            beforeJson: true,
            createdAt: true,
            entityId: true,
            entityType: true,
            id: true,
            requestId: true
          },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          where
        })
      ]);

      return {
        rows: rows.map((row) => ({
          ...row,
          actor: row.actorUser
        })),
        total
      };
    }
  };
}

function createWhere(query: AdminAuditLogQuery): Prisma.AuditLogWhereInput {
  return {
    ...(query.action === undefined ? {} : { action: query.action }),
    ...(query.actorUserId === undefined ? {} : { actorUserId: query.actorUserId }),
    ...(query.entityId === undefined ? {} : { entityId: query.entityId }),
    ...(query.entityType === undefined ? {} : { entityType: query.entityType }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : {
          createdAt: {
            ...(query.from === undefined ? {} : { gte: query.from }),
            ...(query.to === undefined ? {} : { lte: query.to })
          }
        })
  };
}
