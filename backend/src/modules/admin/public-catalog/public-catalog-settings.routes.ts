import { Router, type RequestHandler, type Response } from "express";
import { AppError, type ErrorDetail } from "../../../lib/errors.js";
import type { AuthRequest, AuthenticatedPrincipal } from "../../auth/auth.types.js";
import type { PublicCatalogReconciler } from "../../public-catalog/public-catalog-reconciler.js";
import type {
  PublicCatalogControlState,
  PublicCatalogControlStatusReader,
  PublicCatalogSyncStatus,
  UpdatePublicCatalogSettingsResult
} from "../../public-catalog/public-catalog-control.repository.js";
import type { PublicCatalogSnapshotSettings } from "../../public-catalog/public-catalog-sync.service.js";
import { createPermissionMiddleware } from "../rbac.middleware.js";

export interface AdminPublicCatalogSettingsContext {
  actor: AuthenticatedPrincipal;
  requestId: string;
}

export interface AdminPublicCatalogSettingsRouterOptions {
  reconciler: Pick<PublicCatalogReconciler, "requestReconcile">;
  statusReader: PublicCatalogControlStatusReader;
  updateSettings: (
    input: PublicCatalogSnapshotSettings,
    context: AdminPublicCatalogSettingsContext
  ) => Promise<UpdatePublicCatalogSettingsResult>;
}

export function createAdminPublicCatalogSettingsRouter(
  options: AdminPublicCatalogSettingsRouterOptions
): Router {
  const router = Router();

  router.get(
    "/public-catalog/status",
    createPermissionMiddleware({ permission: "audit.read" }),
    createGetStatusHandler(options)
  );
  router.patch(
    "/public-catalog/settings",
    createPermissionMiddleware({ permission: "audit.read" }),
    createPatchSettingsHandler(options)
  );

  return router;
}

function createGetStatusHandler(
  options: AdminPublicCatalogSettingsRouterOptions
): RequestHandler {
  return async (_request, response, next) => {
    try {
      response.json({
        data: await readStatusDto(options.statusReader)
      });
    } catch (error) {
      next(error);
    }
  };
}

function createPatchSettingsHandler(
  options: AdminPublicCatalogSettingsRouterOptions
): RequestHandler {
  return async (request, response, next) => {
    try {
      assertCsrfBoundary(request);
      const input = parseSettingsBody(request.body);
      const context = readMutationContext(request as AuthRequest, response);
      const result = await options.updateSettings(input, context);

      if (result.marked) {
        options.reconciler.requestReconcile({
          reason: "settings.show_demo_in_modal",
          requestId: context.requestId
        });
      }

      const status = await readStatusDto(options.statusReader);

      response.json({
        data: {
          showDemoInModal: result.settings.showDemoInModal,
          status,
          sync: {
            status: normalizePatchSyncStatus(result, status)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

async function readStatusDto(
  statusReader: PublicCatalogControlStatusReader
): Promise<PublicCatalogStatusDto> {
  const result = await statusReader.readState();

  if (result.kind === "setup_required" || result.state === null) {
    throw new AppError({
      code: "CONFIGURATION_ERROR",
      message: "Public catalog runtime is not configured.",
      statusCode: 503
    });
  }

  return toStatusDto(result.state);
}

function toStatusDto(state: PublicCatalogControlState): PublicCatalogStatusDto {
  return {
    currentItemsCount: state.currentItemsCount,
    currentSnapshotPath: state.currentSnapshotPath,
    desiredRevision: state.desiredRevision,
    lastSyncErrorCode: state.lastSyncErrorCode,
    lastSyncRequestId: state.lastSyncRequestId,
    publishedRevision: state.publishedRevision,
    showDemoInModal: state.showDemoInModal,
    syncStatus: state.syncStatus
  };
}

function normalizePatchSyncStatus(
  result: UpdatePublicCatalogSettingsResult,
  status: PublicCatalogStatusDto
): "failed" | "pending" | "ready" {
  if (result.marked) {
    return "pending";
  }
  if (status.syncStatus === "failed") {
    return "failed";
  }
  if (status.syncStatus === "ready") {
    return "ready";
  }
  return "pending";
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

function parseSettingsBody(body: unknown): PublicCatalogSnapshotSettings {
  if (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    typeof (body as { showDemoInModal?: unknown }).showDemoInModal === "boolean"
  ) {
    return {
      showDemoInModal: (body as { showDemoInModal: boolean }).showDemoInModal
    };
  }

  throw validationError([
    {
      message: "showDemoInModal must be a boolean.",
      path: "showDemoInModal"
    }
  ]);
}

function readMutationContext(
  request: AuthRequest,
  response: Response
): AdminPublicCatalogSettingsContext {
  if (request.auth === undefined) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
      statusCode: 401
    });
  }

  return {
    actor: request.auth,
    requestId: readRequestId(response)
  };
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

interface PublicCatalogStatusDto {
  currentItemsCount: number | null;
  currentSnapshotPath: string | null;
  desiredRevision: number;
  lastSyncErrorCode: string | null;
  lastSyncRequestId: string | null;
  publishedRevision: number;
  showDemoInModal: boolean;
  syncStatus: PublicCatalogSyncStatus;
}
