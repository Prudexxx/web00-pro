import { Router } from "express";
import { createPermissionMiddleware } from "../rbac.middleware.js";
import { createAdminPublicCatalogController } from "./public-catalog-admin.controller.js";
import type { AdminPublicCatalogService } from "./public-catalog-admin.service.js";

export function createAdminPublicCatalogRouter(
  options: { now?: () => Date; service: AdminPublicCatalogService }
): Router {
  const router = Router();
  const controller = createAdminPublicCatalogController(options);
  const requirePublicCatalogMaintenance = createPermissionMiddleware({
    permission: "maintenance.publicCatalog"
  });

  router.get("/public-catalog/status", requirePublicCatalogMaintenance, controller.getStatus);
  router.patch(
    "/public-catalog/settings",
    requirePublicCatalogMaintenance,
    controller.updateSettings
  );
  router.post("/public-catalog/sync", requirePublicCatalogMaintenance, controller.sync);

  return router;
}
