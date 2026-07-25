import { Router } from "express";
import { adminCacheControl } from "./admin-cache-control.js";
import { createAdminAuthMiddleware } from "./admin-auth.middleware.js";
import { createAdminAuditLogRouter } from "./audit/audit-log.routes.js";
import type { AdminAuditLogService } from "./audit/audit-log.service.js";
import { createAdminCategoryRouter } from "./categories/category.routes.js";
import type { AdminCategoryService } from "./categories/category.service.js";
import { createAdminSiteRouter } from "./sites/site.routes.js";
import type { AdminSiteService } from "./sites/site.service.js";
import type { AuthService } from "../auth/auth.types.js";

export interface AdminRouterOptions {
  authService: Pick<AuthService, "authenticateAccessToken">;
  auditLogService: AdminAuditLogService;
  categoryService: AdminCategoryService;
  now?: () => Date;
  siteService: AdminSiteService;
}

export function createAdminRouter(options: AdminRouterOptions): Router {
  const router = Router();
  const siteRouterOptions =
    options.now === undefined
      ? { service: options.siteService }
      : { now: options.now, service: options.siteService };
  const categoryRouterOptions =
    options.now === undefined
      ? { service: options.categoryService }
      : { now: options.now, service: options.categoryService };

  router.use(adminCacheControl());
  router.use(createAdminAuthMiddleware({ service: options.authService }));
  router.use(createAdminSiteRouter(siteRouterOptions));
  router.use(createAdminCategoryRouter(categoryRouterOptions));
  router.use(createAdminAuditLogRouter({ service: options.auditLogService }));

  return router;
}
