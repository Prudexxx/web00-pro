import type { RequestHandler, Response } from "express";
import type { AuthRequest } from "../../auth/auth.types.js";
import type { AdminMutationContext } from "../admin.types.js";
import { parsePublicCatalogSettingsInput } from "./public-catalog-admin.schemas.js";
import type { AdminPublicCatalogService } from "./public-catalog-admin.service.js";

export interface AdminPublicCatalogController {
  getStatus: RequestHandler;
  sync: RequestHandler;
  updateSettings: RequestHandler;
}

export function createAdminPublicCatalogController(options: {
  now?: () => Date;
  service: AdminPublicCatalogService;
}): AdminPublicCatalogController {
  const now = options.now ?? (() => new Date());

  return {
    getStatus: async (_request, response, next) => {
      try {
        response.json({ data: await options.service.getStatus() });
      } catch (error) {
        next(error);
      }
    },

    sync: async (request, response, next) => {
      try {
        response.json({
          data: await options.service.sync(createContext(request as AuthRequest, response, now))
        });
      } catch (error) {
        next(error);
      }
    },

    updateSettings: async (request, response, next) => {
      try {
        response.json({
          data: await options.service.updateSettings(
            parsePublicCatalogSettingsInput(request.body),
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    }
  };
}

function createContext(
  request: AuthRequest,
  response: Response,
  now: () => Date
): AdminMutationContext {
  return {
    actor: request.auth!,
    now: now(),
    requestId:
      typeof response.locals.requestId === "string" ? response.locals.requestId : "unknown"
  };
}
