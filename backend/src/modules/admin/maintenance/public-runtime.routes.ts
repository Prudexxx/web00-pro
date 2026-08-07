import { Router, type RequestHandler, type Response } from "express";
import { AppError, type ErrorDetail } from "../../../lib/errors.js";
import { createPermissionMiddleware } from "../rbac.middleware.js";
import {
  PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION,
  normalizePublicRuntimeShadowStatusDto,
  normalizePublicRuntimeShadowSyncResult,
  publicRuntimeShadowSetupRequired,
  type PublicRuntimeShadowDependencies
} from "../../public-catalog/public-runtime-shadow.js";

export function createAdminPublicRuntimeMaintenanceRouter(options: {
  dependencies: PublicRuntimeShadowDependencies;
}): Router {
  const router = Router();

  router.get(
    "/maintenance/public-runtime",
    createPermissionMiddleware({ permission: "audit.read" }),
    createGetStatusHandler(options.dependencies)
  );
  router.post(
    "/maintenance/public-runtime/sync",
    createPermissionMiddleware({ permission: "audit.read" }),
    createSyncHandler(options.dependencies)
  );

  return router;
}

function createGetStatusHandler(
  dependencies: PublicRuntimeShadowDependencies
): RequestHandler {
  return async (_request, response, next) => {
    try {
      response.json({
        data: normalizePublicRuntimeShadowStatusDto(
          await dependencies.statusService.getStatus()
        )
      });
    } catch (error) {
      next(error);
    }
  };
}

function createSyncHandler(
  dependencies: PublicRuntimeShadowDependencies
): RequestHandler {
  return async (request, response, next) => {
    try {
      assertCsrfBoundary(request);
      parseConfirmation(request.body);

      const currentStatus = normalizePublicRuntimeShadowStatusDto(
        await dependencies.statusService.getStatus()
      );
      if (currentStatus.status === "setup_required") {
        throw publicRuntimeShadowSetupRequired();
      }

      const result = normalizePublicRuntimeShadowSyncResult(
        await dependencies.syncService.syncOnce({ requestId: readRequestId(response) })
      );

      response.status(result.statusCode).json({ data: result.data });
    } catch (error) {
      next(error);
    }
  };
}

function assertCsrfBoundary(request: Parameters<RequestHandler>[0]): void {
  const csrf = request.get("X-CSRF-Token")?.trim();

  if (csrf !== "web00-admin") {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Forbidden.",
      statusCode: 403
    });
  }
}

function parseConfirmation(body: unknown): void {
  if (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    (body as { confirmation?: unknown }).confirmation === PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION
  ) {
    return;
  }

  throw validationError([
    {
      message: "Manual shadow sync confirmation is required.",
      path: "confirmation"
    }
  ]);
}

function readRequestId(response: Response): string {
  return typeof response.locals.requestId === "string" ? response.locals.requestId : "unknown";
}

function validationError(details: readonly ErrorDetail[]): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    details,
    message: "Invalid request.",
    statusCode: 400
  });
}
