import { Router } from "express";
import { createPermissionMiddleware } from "../rbac.middleware.js";
import type { MultipartImageParser } from "../../images/image.types.js";
import type { SiteImageService } from "./site-image.service.js";
import { createSiteImageController } from "./site-image.controller.js";
import { createSiteImageUploadRateLimit } from "./site-image-rate-limit.js";

export function createSiteImageRouter(options: {
  now?: () => Date;
  parser: MultipartImageParser;
  service: SiteImageService;
}): Router {
  const router = Router();
  const controller = createSiteImageController(options);
  const singleUploadLimit = createSiteImageUploadRateLimit({
    max: 30,
    windowMs: 15 * 60_000
  });
  const batchUploadLimit = createSiteImageUploadRateLimit({
    max: 6,
    windowMs: 15 * 60_000
  });

  router.put(
    "/sites/:id/images/preview",
    createPermissionMiddleware({ permission: "site.updateDraft" }),
    singleUploadLimit,
    controller.replacePreview
  );
  router.delete(
    "/sites/:id/images/preview",
    createPermissionMiddleware({ permission: "site.updateDraft" }),
    controller.deletePreview
  );
  router.post(
    "/sites/:id/images/gallery/batch",
    createPermissionMiddleware({ permission: "site.updateDraft" }),
    batchUploadLimit,
    controller.addGalleryBatch
  );
  router.post(
    "/sites/:id/images/gallery",
    createPermissionMiddleware({ permission: "site.updateDraft" }),
    singleUploadLimit,
    controller.addGallerySingle
  );
  router.patch(
    "/sites/:id/images/gallery",
    createPermissionMiddleware({ permission: "site.updateDraft" }),
    controller.reorderGallery
  );
  router.delete(
    "/sites/:id/images/gallery/:assetId",
    createPermissionMiddleware({ permission: "site.updateDraft" }),
    controller.deleteGalleryImage
  );

  return router;
}
