import { Router } from "express";
import type { RequestHandler } from "express";
import { AppError } from "../../../lib/errors.js";
import { createPermissionMiddleware } from "../rbac.middleware.js";
import { createAdminSiteController } from "./site.controller.js";
import type { AdminSiteService } from "./site.service.js";

export function createAdminSiteRouter(
  options: { now?: () => Date; service: AdminSiteService }
): Router {
  const router = Router();
  const controller = createAdminSiteController(options);

  router.get(
    "/sites",
    createPermissionMiddleware({ permission: "site.read" }),
    controller.listSites
  );
  router.get(
    "/sites/:id",
    createPermissionMiddleware({ permission: "site.read" }),
    controller.getSite
  );
  router.post(
    "/sites",
    createPermissionMiddleware({ permission: "site.createDraft" }),
    controller.createDraft
  );
  router.patch(
    "/sites/:id",
    createPermissionMiddleware({ permission: "site.updateDraft" }),
    controller.updateSite
  );
  router.post(
    "/sites/:id/publish",
    createPermissionMiddleware({ permission: "site.publish" }),
    createDirectPagesRequiredMiddleware()
  );
  router.post(
    "/sites/:id/unpublish",
    createPermissionMiddleware({ permission: "site.unpublish" }),
    createDirectPagesRequiredMiddleware()
  );
  router.delete(
    "/sites/:id",
    createPermissionMiddleware({ permission: "site.softDelete" }),
    createDirectPagesRequiredMiddleware()
  );
  router.post(
    "/sites/:id/restore",
    createPermissionMiddleware({ permission: "site.restore" }),
    controller.restoreSite
  );
  router.delete(
    "/sites/:id/permanent",
    createPermissionMiddleware({ permission: "site.permanentDelete" }),
    controller.permanentlyDeleteSite
  );

  return router;
}

function createDirectPagesRequiredMiddleware(): RequestHandler {
  return (_request, _response, next) => {
    next(new AppError({
      code: "DIRECT_PAGES_PUBLICATION_REQUIRED",
      message: "Direct Pages publication is required for public catalog lifecycle changes.",
      statusCode: 409
    }));
  };
}
