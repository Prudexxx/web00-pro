import type { RequestHandler, Response } from "express";
import type { AuthRequest } from "../../auth/auth.types.js";
import {
  parseAdminSiteListQuery,
  parseCreateAdminSiteInput,
  parseSiteIdParams,
  parseUpdateAdminSiteInput
} from "./site.schemas.js";
import type { AdminSiteService } from "./site.service.js";

export interface AdminSiteController {
  createDraft: RequestHandler;
  deleteSite: RequestHandler;
  getSite: RequestHandler;
  listSites: RequestHandler;
  permanentlyDeleteSite: RequestHandler;
  publishSite: RequestHandler;
  restoreSite: RequestHandler;
  unpublishSite: RequestHandler;
  updateSite: RequestHandler;
}

export function createAdminSiteController(
  options: { now?: () => Date; service: AdminSiteService }
): AdminSiteController {
  const now = options.now ?? (() => new Date());

  return {
    createDraft: async (request, response, next) => {
      try {
        response.status(201).json({
          data: await options.service.createDraft(
            parseCreateAdminSiteInput(request.body),
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    },
    deleteSite: async (request, response, next) => {
      try {
        const { id } = parseSiteIdParams(request.params);

        response.json({
          data: await options.service.deleteSite(
            id,
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    },
    getSite: async (request, response, next) => {
      try {
        const { id } = parseSiteIdParams(request.params);

        response.json({
          data: await options.service.getSite(id, (request as AuthRequest).auth!)
        });
      } catch (error) {
        next(error);
      }
    },
    listSites: async (request, response, next) => {
      try {
        response.json(
          await options.service.listSites(
            parseAdminSiteListQuery(request.query),
            (request as AuthRequest).auth!
          )
        );
      } catch (error) {
        next(error);
      }
    },
    permanentlyDeleteSite: async (request, response, next) => {
      try {
        const { id } = parseSiteIdParams(request.params);

        await options.service.permanentlyDeleteSite(
          id,
          createContext(request as AuthRequest, response, now)
        );
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
    publishSite: async (request, response, next) => {
      try {
        const { id } = parseSiteIdParams(request.params);

        response.json({
          data: await options.service.publishSite(
            id,
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    },
    restoreSite: async (request, response, next) => {
      try {
        const { id } = parseSiteIdParams(request.params);

        response.json({
          data: await options.service.restoreSite(
            id,
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    },
    unpublishSite: async (request, response, next) => {
      try {
        const { id } = parseSiteIdParams(request.params);

        response.json({
          data: await options.service.unpublishSite(
            id,
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    },
    updateSite: async (request, response, next) => {
      try {
        const principal = (request as AuthRequest).auth!;
        const { id } = parseSiteIdParams(request.params);

        response.json({
          data: await options.service.updateSite(
            id,
            parseUpdateAdminSiteInput(request.body, principal.role),
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
) {
  return {
    actor: request.auth!,
    now: now(),
    requestId:
      typeof response.locals.requestId === "string" ? response.locals.requestId : "unknown"
  };
}
