import { Router } from "express";
import { createPermissionMiddleware } from "../rbac.middleware.js";
import { createAdminMaintenanceController } from "./maintenance.controller.js";
import type { AdminMaintenanceService } from "./maintenance.service.js";

export function createAdminMaintenanceRouter(
  options: { now?: () => Date; service: AdminMaintenanceService }
): Router {
  const router = Router();
  const controller = createAdminMaintenanceController(options);
  const requireCanonicalAssetMaintenance = createPermissionMiddleware({
    permission: "maintenance.canonicalAssets"
  });

  router.get(
    "/maintenance/canonical-assets",
    requireCanonicalAssetMaintenance,
    controller.dryRunCanonicalAssets
  );
  router.post(
    "/maintenance/canonical-assets/reconcile",
    requireCanonicalAssetMaintenance,
    controller.applyCanonicalAssets
  );

  return router;
}
