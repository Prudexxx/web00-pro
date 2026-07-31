import type { RequestHandler, Response } from "express";
import { AppError } from "../../../lib/errors.js";
import type { AuthRequest } from "../../auth/auth.types.js";
import {
  RECONCILIATION_STATE_CHANGED_MESSAGE,
  type CanonicalAssetReconciliationReport
} from "../sites/canonical-asset-reconciliation.js";
import { parseCanonicalAssetsApplyInput } from "./maintenance.schemas.js";
import type { AdminMaintenanceService } from "./maintenance.service.js";

const RECONCILIATION_PRECONDITION_FAILED_MESSAGE =
  "Восстановление не выполнено. Повторите проверку состояния.";

export interface AdminMaintenanceController {
  applyCanonicalAssets: RequestHandler;
  dryRunCanonicalAssets: RequestHandler;
}

export function createAdminMaintenanceController(
  options: { now?: () => Date; service: AdminMaintenanceService }
): AdminMaintenanceController {
  const now = options.now ?? (() => new Date());

  return {
    applyCanonicalAssets: async (request, response, next) => {
      try {
        const report = await options.service.apply(
          parseCanonicalAssetsApplyInput(request.body),
          createContext(request as AuthRequest, response, now)
        );

        sendApplyReport(response, report);
      } catch (error) {
        next(error);
      }
    },
    dryRunCanonicalAssets: async (request, response, next) => {
      try {
        response.json({
          data: await options.service.dryRun(
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    }
  };
}

function sendApplyReport(
  response: Response,
  report: CanonicalAssetReconciliationReport
): void {
  if (report.status === "applied" || report.status === "already-reconciled") {
    response.json({ data: report });
    return;
  }

  if (report.blockers.includes("RECONCILIATION_STATE_CHANGED")) {
    throw new AppError({
      code: "RECONCILIATION_STATE_CHANGED",
      details: blockerDetails(report),
      message: report.message ?? RECONCILIATION_STATE_CHANGED_MESSAGE,
      statusCode: 409
    });
  }

  if (report.status === "blocked") {
    throw new AppError({
      code: "RECONCILIATION_PRECONDITION_FAILED",
      details: blockerDetails(report),
      message: RECONCILIATION_PRECONDITION_FAILED_MESSAGE,
      statusCode: 409
    });
  }

  throw new AppError({
    code: "INTERNAL_ERROR",
    message: "Internal server error.",
    statusCode: 500
  });
}

function blockerDetails(
  report: CanonicalAssetReconciliationReport
): { message: string; path: string }[] {
  const blockers = new Set<string>();

  for (const blocker of report.blockers) {
    blockers.add(blocker);
  }
  for (const target of report.targets) {
    for (const blocker of target.blockers) {
      blockers.add(blocker);
    }
  }

  return [...blockers].map((blocker) => ({
    message: blocker,
    path: "blockers"
  }));
}

function createContext(request: AuthRequest, response: Response, now: () => Date) {
  return {
    actor: request.auth!,
    now: now(),
    requestId:
      typeof response.locals.requestId === "string" ? response.locals.requestId : "unknown"
  };
}
