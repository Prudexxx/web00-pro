import { Router } from "express";
import type { NodeEnvironment } from "../../config/env.js";
import { createAdminUiSecurityMiddleware } from "./admin-ui-security.js";
import {
  createAdminUiAssetHandler,
  createAdminUiIndexHandler,
  resolveAdminUiStaticPaths,
  type AdminUiStaticPaths
} from "./admin-ui-static.js";

export interface AdminUiRouterOptions {
  nodeEnv: NodeEnvironment;
  staticPaths?: AdminUiStaticPaths;
  storagePublicOrigin: string;
}

export function createAdminUiRouter(options: AdminUiRouterOptions): Router {
  const router = Router();
  const staticPaths = options.staticPaths ?? resolveAdminUiStaticPaths();

  router.use(
    createAdminUiSecurityMiddleware({
      nodeEnv: options.nodeEnv,
      storagePublicOrigin: options.storagePublicOrigin
    })
  );
  router.get("/", createAdminUiIndexHandler(staticPaths));
  router.use("/assets", createAdminUiAssetHandler(staticPaths));

  return router;
}
