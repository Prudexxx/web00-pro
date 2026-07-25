import express, { type Express, type Router } from "express";
import type { AppEnv } from "./config/env.js";
import { createLogger, type AppLogger, requestLogger } from "./lib/logger.js";
import { requestIdMiddleware } from "./lib/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundMiddleware } from "./middleware/not-found.js";
import { createHealthRouter } from "./modules/health/health.route.js";
import { createPublicCatalogRouter } from "./modules/public-catalog/public-catalog.routes.js";
import type { PublicCatalogService } from "./modules/public-catalog/public-catalog.service.js";

export interface CreateAppOptions {
  adminRoutes?: Router;
  authRoutes?: Router;
  env: AppEnv;
  logger?: AppLogger;
  publicCatalogService?: PublicCatalogService;
  registerTestRoutes?: (app: Express) => void;
  now?: () => Date;
  trustProxyHops?: number;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? createLogger({ env: options.env });

  app.disable("x-powered-by");
  if (options.trustProxyHops !== undefined && options.trustProxyHops > 0) {
    app.set("trust proxy", options.trustProxyHops);
  }
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "100kb" }));
  app.use(requestLogger({ env: options.env, logger, now }));
  app.use("/api/health", createHealthRouter({ env: options.env, now }));

  if (options.publicCatalogService) {
    app.use("/api", createPublicCatalogRouter({ service: options.publicCatalogService }));
  }

  if (options.authRoutes) {
    app.use("/api/auth", options.authRoutes);
  }

  if (options.adminRoutes) {
    app.use("/api/admin", options.adminRoutes);
  }

  if (options.registerTestRoutes) {
    options.registerTestRoutes(app);
  }

  app.use(notFoundMiddleware);
  app.use(errorHandler);

  return app;
}
