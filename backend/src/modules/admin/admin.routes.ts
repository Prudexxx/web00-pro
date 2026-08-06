import { Router } from "express";
import { adminCacheControl } from "./admin-cache-control.js";
import { createAdminAuthMiddleware } from "./admin-auth.middleware.js";
import { createAdminAuditLogRouter } from "./audit/audit-log.routes.js";
import type { AdminAuditLogService } from "./audit/audit-log.service.js";
import { createAdminCategoryRouter } from "./categories/category.routes.js";
import type { AdminCategoryService } from "./categories/category.service.js";
import { createAdminSiteRouter } from "./sites/site.routes.js";
import type { AdminSiteService } from "./sites/site.service.js";
import { createSiteImageRouter } from "./images/site-image.routes.js";
import type { SiteImageService } from "./images/site-image.service.js";
import type { MultipartImageParser } from "../images/image.types.js";
import { createAdminUserRouter } from "./users/user.routes.js";
import type { AdminUserService } from "./users/user.service.js";
import type { AuthService } from "../auth/auth.types.js";
import { createAdminPublicationRouter } from "./publication/publication.routes.js";
import type {
  AdminPublicationService,
  PagesCatalogPublicationService
} from "./publication/publication.service.js";

export interface AdminRouterOptions {
  authService: Pick<AuthService, "authenticateAccessToken">;
  auditLogService: AdminAuditLogService;
  categoryService: AdminCategoryService;
  imageParser?: MultipartImageParser;
  imageService?: SiteImageService;
  now?: () => Date;
  pagesPublicationService?: PagesCatalogPublicationService;
  publicationService?: AdminPublicationService;
  siteService: AdminSiteService;
  userService?: AdminUserService;
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
  const userRouterOptions =
    options.userService === undefined
      ? undefined
      : options.now === undefined
        ? { service: options.userService }
        : { now: options.now, service: options.userService };

  router.use(adminCacheControl());
  router.use(createAdminAuthMiddleware({ service: options.authService }));
  if (options.imageService !== undefined && options.imageParser !== undefined) {
    router.use(
      createSiteImageRouter(
        options.now === undefined
          ? { parser: options.imageParser, service: options.imageService }
          : { now: options.now, parser: options.imageParser, service: options.imageService }
      )
    );
  }
  router.use(createAdminSiteRouter(siteRouterOptions));
  router.use(createAdminCategoryRouter(categoryRouterOptions));
  if (userRouterOptions !== undefined) {
    router.use(createAdminUserRouter(userRouterOptions));
  }
  if (options.publicationService !== undefined) {
    router.use(createAdminPublicationRouter({
      service: options.publicationService,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.pagesPublicationService === undefined ? {} : { pagesService: options.pagesPublicationService })
    }));
  }
  router.use(createAdminAuditLogRouter({ service: options.auditLogService }));

  return router;
}
