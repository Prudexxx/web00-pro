import { Router } from "express";
import { createPermissionMiddleware } from "../rbac.middleware.js";
import { createAdminAuditLogController } from "./audit-log.controller.js";
import type { AdminAuditLogService } from "./audit-log.service.js";

export function createAdminAuditLogRouter(
  options: { service: AdminAuditLogService }
): Router {
  const router = Router();
  const controller = createAdminAuditLogController({ service: options.service });

  router.get(
    "/audit-logs",
    createPermissionMiddleware({ permission: "audit.read" }),
    controller.listAuditLogs
  );

  return router;
}
