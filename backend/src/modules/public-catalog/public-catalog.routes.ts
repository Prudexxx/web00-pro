import { Router } from "express";
import { createPublicCatalogController } from "./public-catalog.controller.js";
import type { PublicCatalogService } from "./public-catalog.service.js";

export function createPublicCatalogRouter(
  options: { service: PublicCatalogService }
): Router {
  const router = Router();
  const controller = createPublicCatalogController({ service: options.service });

  router.get("/sites", controller.listSites);
  router.get("/sites/popular", controller.listPopularSites);
  router.get("/sites/:slug", controller.getSiteBySlug);
  router.get("/categories", controller.listCategories);
  router.get("/categories/:slug", controller.getCategoryBySlug);

  return router;
}
