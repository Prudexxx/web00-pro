import { Router } from "express";
import type { RequestHandler } from "express";
import { AppError } from "../../../lib/errors.js";
import type { AuthRequest } from "../../auth/auth.types.js";
import { createPermissionPolicy } from "../rbac.policy.js";
import type { B5Permission, PermissionPolicy } from "../rbac.types.js";
import { createAdminPublicationController } from "./publication.controller.js";
import type { AdminPublicationService } from "./publication.service.js";

export function createAdminPublicationRouter(options: {
  now?: () => Date;
  policy?: PermissionPolicy;
  service: AdminPublicationService;
}): Router {
  const router = Router();
  const controller = createAdminPublicationController(options);
  const policy = options.policy ?? createPermissionPolicy();

  router.post(
    "/sites/:id/publication",
    createPublicationActionPermissionMiddleware(policy),
    controller.startPublication
  );
  router.get(
    "/public-catalog/operations/:id",
    createPermissionMiddleware(policy, "site.read"),
    controller.getOperation
  );

  return router;
}

function createPublicationActionPermissionMiddleware(policy: PermissionPolicy): RequestHandler {
  return (request, _response, next) => {
    const permission = readPublicationActionPermission(request.body);

    return createPermissionMiddleware(policy, permission)(request, _response, next);
  };
}

function readPublicationActionPermission(body: unknown): B5Permission {
  if (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    (body as { action?: unknown }).action === "unpublish"
  ) {
    return "site.unpublish";
  }

  return "site.publish";
}

function createPermissionMiddleware(policy: PermissionPolicy, permission: B5Permission): RequestHandler {
  return (request, _response, next) => {
    const principal = (request as AuthRequest).auth;

    if (principal === undefined) {
      next(new AppError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
        statusCode: 401
      }));
      return;
    }

    if (!policy.has(principal.role, permission)) {
      next(new AppError({
        code: "FORBIDDEN",
        message: "Forbidden.",
        statusCode: 403
      }));
      return;
    }

    next();
  };
}
