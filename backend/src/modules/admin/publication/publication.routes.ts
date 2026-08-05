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
    createPublicationEnabledMiddleware(options.enabled ?? false),
    controller.startPublication
  );
  router.get(
    "/public-catalog/operations/:id",
    createPermissionMiddleware(policy, "site.read"),
    controller.getOperation
  );

  return router;
}

function createPublicationEnabledMiddleware(enabled: boolean): RequestHandler {
  return (_request, _response, next) => {
    if (!enabled) {
      next(new AppError({
        code: "PUBLIC_CATALOG_V2_DISABLED",
        message: "Public catalog V2 publication is disabled.",
        statusCode: 503
      }));
      return;
    }

    next();
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
  if (isDirectPagesUnpublish(body)) {
    return "site.unpublish";
  }

  return "site.publish";
}

function isDirectPagesUnpublish(body: unknown): boolean {
  if (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body)
  ) {
    const record = body as { action?: unknown; card?: unknown };
    if (record.action === "delete") {
      return true;
    }
    if (
      record.action === "update" &&
      typeof record.card === "object" &&
      record.card !== null &&
      !Array.isArray(record.card) &&
      (record.card as { active?: unknown }).active === false
    ) {
      return true;
    }
  }

  return false;
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
