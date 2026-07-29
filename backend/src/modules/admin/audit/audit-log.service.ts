import { mapAdminAuditLog } from "./audit-log.mapper.js";
import type { AdminAuditLogRepository } from "./audit-log.repository.js";
import type { AdminAuditLogQuery, AdminAuditLogResponse } from "./audit-log.types.js";

export interface CreateAdminAuditLogServiceOptions {
  repository: AdminAuditLogRepository;
}

export interface AdminAuditLogService {
  listAuditLogs(query: AdminAuditLogQuery): Promise<AdminAuditLogResponse>;
}

export function createAdminAuditLogService(
  options: CreateAdminAuditLogServiceOptions
): AdminAuditLogService {
  return {
    async listAuditLogs(query) {
      const result = await options.repository.listAuditLogs(query);

      return {
        data: result.rows.map((row) => mapAdminAuditLog(row)),
        meta: {
          limit: query.limit,
          page: query.page,
          total: result.total,
          totalPages: result.total === 0 ? 0 : Math.ceil(result.total / query.limit)
        }
      };
    }
  };
}
