import { Router } from "express";
import type { RequestHandler } from "express";
import { AppError } from "../../../lib/errors.js";
import type { AuthRequest } from "../../auth/auth.types.js";
import { createPermissionPolicy } from "../rbac.policy.js";
import type { B5Permission, PermissionPolicy } from "../rbac.types.js";
import { createAdminPublicationController } from "./publication.controller.js";
import type {
  AdminPublicationService,
  PagesCatalogPublicationService
} from "./publication.service.js";

export function createAdminPublicationRouter(options: {
  enabled?: boolean;
  now?: () => Date;
  pagesService?: PagesCatalogPublicationService;
  policy?: PermissionPolicy;
  service: AdminPublicationService;
}): Router {
  const router = Router();
  const controller = createAdminPublicationController(options);
  const policy = options.policy ?? createPermissionPolicy();

  router.get(
    "/publication/pages/card/:cardId",
    createPermissionMiddleware(policy, "site.read"),
    controller.getPagesCatalogCard
  );
  router.post(
    "/publication/pages",
    createPagesPublicationActionPermissionMiddleware(policy),
    controller.startPagesPublication
  );
  router.get(
    "/publication/pages/:requestId",
    createPermissionMiddleware(policy, "site.read"),
    controller.getPagesPublicationStatus
  );
  router.post(
    "/sites/:id/publication",
    createPublicationActionPermissionMiddleware(policy),
    createDirectPagesRequiredMiddleware()
  );
  router.get(
    "/public-catalog/operations/:id",
    createPermissionMiddleware(policy, "site.read"),
    controller.getOperation
  );

  return router;
}

function createDirectPagesRequiredMiddleware(): RequestHandler {
  return (_request, _response, next) => {
    next(new AppError({
      code: "DIRECT_PAGES_PUBLICATION_REQUIRED",
      message: "Direct Pages publication is required for public catalog lifecycle changes.",
      statusCode: 409
    }));
  };
}

function createPublicationActionPermissionMiddleware(policy: PermissionPolicy): RequestHandler {
  return (request, _response, next) => {
    const permission = readPublicationActionPermission(request.body);

    return createPermissionMiddleware(policy, permission)(request, _response, next);
  };
}

function createPagesPublicationActionPermissionMiddleware(policy: PermissionPolicy): RequestHandler {
  return (request, _response, next) => {
    const permission = readPagesPublicationActionPermission(request.body);

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

function readPagesPublicationActionPermission(body: unknown): B5Permission {
  if (readDirectPagesLifecycleAction(body) === "delete") {
    return "site.softDelete";
  }
  if (readDirectPagesLifecycleAction(body) === "unpublish") {
    return "site.unpublish";
  }

  return "site.publish";
}

function readDirectPagesLifecycleAction(body: unknown): "delete" | "publish" | "unpublish" {
  if (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body)
  ) {
    const action = (body as { lifecycleAction?: unknown }).lifecycleAction;
    if (action === "delete" || action === "publish" || action === "unpublish") {
      return action;
    }
  }

  return "publish";
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
