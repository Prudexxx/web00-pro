import { Router } from "express";
import type { PublicCorsConfig } from "../../config/public-cors-env.js";
import { createPublicCatalogController } from "./public-catalog.controller.js";
import {
  createPublicCatalogCorsMiddleware,
  createPublicCatalogPreflightHandler
} from "./public-cors.middleware.js";
import type { PublicCatalogService } from "./public-catalog.service.js";

export interface PublicCatalogRouterOptions {
  publicCorsConfig?: PublicCorsConfig;
  service: PublicCatalogService;
}

export function createPublicCatalogRouter(options: PublicCatalogRouterOptions): Router {
  const router = Router();
  const controller = createPublicCatalogController({ service: options.service });
  const routeCors =
    options.publicCorsConfig === undefined
      ? []
      : [createPublicCatalogCorsMiddleware(options.publicCorsConfig)];

  if (options.publicCorsConfig !== undefined) {
    const preflight = createPublicCatalogPreflightHandler(options.publicCorsConfig);

    router.options("/sites", preflight);
    router.options("/sites/popular", preflight);
    router.options("/sites/:slug", preflight);
    router.options("/categories", preflight);
    router.options("/categories/:slug", preflight);
  }

  router.get("/sites", ...routeCors, controller.listSites);
  router.get("/sites/popular", ...routeCors, controller.listPopularSites);
  router.get("/sites/:slug", ...routeCors, controller.getSiteBySlug);
  router.get("/categories", ...routeCors, controller.listCategories);
  router.get("/categories/:slug", ...routeCors, controller.getCategoryBySlug);

  return router;
}
