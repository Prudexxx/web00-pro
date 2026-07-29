import type { RequestHandler, Response } from "express";
import type { AuthRequest } from "../../auth/auth.types.js";
import {
  parseAdminCategoryListQuery,
  parseCategoryIdParams,
  parseCreateAdminCategoryInput,
  parseUpdateAdminCategoryInput
} from "./category.schemas.js";
import type { AdminCategoryService } from "./category.service.js";

export interface AdminCategoryController {
  createCategory: RequestHandler;
  deleteCategory: RequestHandler;
  getCategory: RequestHandler;
  listCategories: RequestHandler;
  updateCategory: RequestHandler;
}

export function createAdminCategoryController(
  options: { service: AdminCategoryService; now?: () => Date }
): AdminCategoryController {
  const now = options.now ?? (() => new Date());

  return {
    createCategory: async (request, response, next) => {
      try {
        response.status(201).json({
          data: await options.service.createCategory(
            parseCreateAdminCategoryInput(request.body),
            createContext(request as AuthRequest, response, now)
          )
        });
      } catch (error) {
        next(error);
      }
    },
    deleteCategory: async (request, response, next) => {
      try {
        const { id } = parseCategoryIdParams(request.params);

        await options.service.deleteCategory(
          id,
          createContext(request as AuthRequest, response, now)
        );
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
    getCategory: async (request, response, next) => {
      try {
        const { id } = parseCategoryIdParams(request.params);

        response.json({
          data: await options.service.getCategory(id, (request as AuthRequest).auth!)
        });
      } catch (error) {
        next(error);
      }
    },
    listCategories: async (request, response, next) => {
      try {
        response.json(
          await options.service.listCategories(
            parseAdminCategoryListQuery(request.query),
            (request as AuthRequest).auth!
          )
        );
      } catch (error) {
        next(error);
      }
    },
    updateCategory: async (request, response, next) => {
      try {
        const { id } = parseCategoryIdParams(request.params);

        response.json({
          data: await options.service.updateCategory(
            id,
            parseUpdateAdminCategoryInput(request.body),
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
