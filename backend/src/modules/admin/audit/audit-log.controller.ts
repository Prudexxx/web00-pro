import type { RequestHandler } from "express";
import { parseAdminAuditLogQuery } from "./audit-log.schemas.js";
import type { AdminAuditLogService } from "./audit-log.service.js";

export function createAdminAuditLogController(
  options: { service: AdminAuditLogService }
): { listAuditLogs: RequestHandler } {
  return {
    listAuditLogs: async (request, response, next) => {
      try {
        response.json(await options.service.listAuditLogs(parseAdminAuditLogQuery(request.query)));
      } catch (error) {
        next(error);
      }
    }
  };
}
