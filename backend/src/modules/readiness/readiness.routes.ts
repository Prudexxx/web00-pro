import { Router } from "express";
import type { ReadinessResponse, ReadinessService } from "./readiness.types.js";

export interface ReadinessRouterOptions {
  service: ReadinessService;
}

export function createReadinessRouter(options: ReadinessRouterOptions): Router {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      const status = await options.service.check();
      const body: ReadinessResponse = { status };

      response.setHeader("Cache-Control", "no-store");
      response.status(status === "ready" ? 200 : 503).json(body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
