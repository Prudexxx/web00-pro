import type { RequestHandler, Response } from "express";
import { AppError } from "../../../lib/errors.js";
import type { AuthRequest } from "../../auth/auth.types.js";
import { RECONCILIATION_STATE_CHANGED_MESSAGE } from "../sites/canonical-asset-reconciliation.js";
import { parseCanonicalAssetsApplyInput } from "./maintenance.schemas.js";
import type { AdminMaintenanceService } from "./maintenance.service.js";

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

        if (report.blockers.includes("RECONCILIATION_STATE_CHANGED")) {
          throw new AppError({
            code: "RECONCILIATION_STATE_CHANGED",
            message: report.message ?? RECONCILIATION_STATE_CHANGED_MESSAGE,
            statusCode: 409
          });
        }

        response.json({ data: report });
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

function createContext(request: AuthRequest, response: Response, now: () => Date) {
  return {
    actor: request.auth!,
    now: now(),
    requestId:
      typeof response.locals.requestId === "string" ? response.locals.requestId : "unknown"
  };
}
