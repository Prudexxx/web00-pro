import type { RequestHandler } from "express";
import { AppError } from "../../lib/errors.js";
import type { AuthRequest } from "../auth/auth.types.js";
import { createPermissionPolicy } from "./rbac.policy.js";
import type { B5Permission, PermissionPolicy } from "./rbac.types.js";

export interface PermissionMiddlewareOptions {
  permission: B5Permission;
  policy?: PermissionPolicy;
}

export function createPermissionMiddleware(
  options: PermissionMiddlewareOptions
): RequestHandler {
  const policy = options.policy ?? createPermissionPolicy();

  return (request, _response, next) => {
    const principal = (request as AuthRequest).auth;

    if (principal === undefined) {
      next(
        new AppError({
          code: "UNAUTHORIZED",
          message: "Authentication required.",
          statusCode: 401
        })
      );
      return;
    }

    if (!policy.has(principal.role, options.permission)) {
      next(
        new AppError({
          code: "FORBIDDEN",
          message: "Forbidden.",
          statusCode: 403
        })
      );
      return;
    }

    next();
  };
}
