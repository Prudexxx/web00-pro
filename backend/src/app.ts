import express, { type Express } from "express";
import type { AppEnv } from "./config/env.js";
import { createLogger, type AppLogger, requestLogger } from "./lib/logger.js";
import { requestIdMiddleware } from "./lib/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundMiddleware } from "./middleware/not-found.js";
import { createHealthRouter } from "./modules/health/health.route.js";

export interface CreateAppOptions {
  env: AppEnv;
  logger?: AppLogger;
  registerTestRoutes?: (app: Express) => void;
  now?: () => Date;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? createLogger({ env: options.env });

  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "100kb" }));
  app.use(requestLogger({ env: options.env, logger, now }));
  app.use("/api/health", createHealthRouter({ env: options.env, now }));

  if (options.registerTestRoutes) {
    options.registerTestRoutes(app);
  }

  app.use(notFoundMiddleware);
  app.use(errorHandler);

  return app;
}
