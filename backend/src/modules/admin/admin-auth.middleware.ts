import type { RequestHandler } from "express";
import { parseBearerToken } from "../auth/auth.middleware.js";
import type { AuthRequest, AuthService } from "../auth/auth.types.js";

export interface AdminAuthMiddlewareOptions {
  service: Pick<AuthService, "authenticateAccessToken">;
}

export function createAdminAuthMiddleware(
  options: AdminAuthMiddlewareOptions
): RequestHandler {
  return async (request, _response, next) => {
    try {
      const token = parseBearerToken(request.get("Authorization"));

      (request as AuthRequest).auth = await options.service.authenticateAccessToken(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
