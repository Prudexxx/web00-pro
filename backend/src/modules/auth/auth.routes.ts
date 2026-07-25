import { Router } from "express";
import type { AuthEnv } from "../../config/auth-env.js";
import type { NodeEnvironment } from "../../config/env.js";
import { authNoStore } from "./auth-cache-control.js";
import type { AuthCookieService, AuthRequest, AuthService } from "./auth.types.js";
import { createAuthController } from "./auth.controller.js";
import { parseBearerToken } from "./auth.middleware.js";
import { createOriginGuard } from "./auth-origin.js";
import {
  createLoginRateLimiter,
  createRefreshRateLimiter
} from "./auth-rate-limit.js";

export interface AuthRouterOptions {
  authEnv: AuthEnv;
  cookies: AuthCookieService;
  nodeEnv: NodeEnvironment;
  service: AuthService;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const controller = createAuthController({
    cookies: options.cookies,
    service: options.service
  });
  const originGuard = createOriginGuard({
    authOrigin: options.authEnv.AUTH_ORIGIN,
    nodeEnv: options.nodeEnv
  });
  const authenticate = async (
    request: AuthRequest,
    _response: import("express").Response,
    next: import("express").NextFunction
  ): Promise<void> => {
    try {
      request.auth = await options.service.authenticateAccessToken(
        parseBearerToken(request.get("Authorization"))
      );
      next();
    } catch (error) {
      next(error);
    }
  };

  router.post(
    "/login",
    authNoStore({ pragma: true }),
    originGuard,
    createLoginRateLimiter(),
    controller.login
  );
  router.post(
    "/refresh",
    authNoStore({ pragma: true }),
    originGuard,
    createRefreshRateLimiter(),
    controller.refresh
  );
  router.post("/logout", authNoStore(), originGuard, controller.logout);
  router.get("/me", authNoStore(), authenticate, controller.me);

  return router;
}
