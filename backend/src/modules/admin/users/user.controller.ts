import type { RequestHandler, Response } from "express";
import type { AuthRequest } from "../../auth/auth.types.js";
import {
  parseAdminUserListQuery,
  parseChangeUserRoleBody,
  parseUserIdParams
} from "./user.schemas.js";
import type { AdminUserService } from "./user.service.js";
import type { UserMutationContext } from "./user.types.js";

export interface AdminUserController {
  changeRole: RequestHandler;
  disable: RequestHandler;
  enable: RequestHandler;
  getUser: RequestHandler;
  listUsers: RequestHandler;
}

export function createAdminUserController(options: {
  now?: () => Date;
  service: AdminUserService;
}): AdminUserController {
  const now = options.now ?? (() => new Date());

  return {
    changeRole: async (request, response, next) => {
      try {
        const { id } = parseUserIdParams(request.params);
        const { role } = parseChangeUserRoleBody(request.body);

        response.json({
          data: await options.service.changeRole(
            id,
            role,
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    },
    disable: async (request, response, next) => {
      try {
        const { id } = parseUserIdParams(request.params);

        response.json({
          data: await options.service.disable(
            id,
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    },
    enable: async (request, response, next) => {
      try {
        const { id } = parseUserIdParams(request.params);

        response.json({
          data: await options.service.enable(
            id,
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    },
    getUser: async (request, response, next) => {
      try {
        const { id } = parseUserIdParams(request.params);

        response.json({
          data: await options.service.getUser(id)
        });
      } catch (error) {
        next(error);
      }
    },
    listUsers: async (request, response, next) => {
      try {
        response.json(await options.service.listUsers(parseAdminUserListQuery(request.query)));
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
): UserMutationContext {
  return {
    actorUserId: request.auth!.id,
    now: now(),
    requestId:
      typeof response.locals.requestId === "string" ? response.locals.requestId : "unknown",
    source: "api"
  };
}
