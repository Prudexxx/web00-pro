import { Router } from "express";
import type { AppEnv } from "../../config/env.js";
import type { HealthResponse } from "./health.schema.js";

export interface HealthRouterOptions {
  env: AppEnv;
  now: () => Date;
}

export function createHealthRouter(options: HealthRouterOptions): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    const body: HealthResponse = {
      data: {
        service: options.env.SERVICE_NAME,
        status: "ok",
        time: options.now().toISOString()
      }
    };

    response.json(body);
  });

  return router;
}
