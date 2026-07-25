import { Router } from "express";
import { createPermissionMiddleware } from "../rbac.middleware.js";
import { createAdminCategoryController } from "./category.controller.js";
import type { AdminCategoryService } from "./category.service.js";

export function createAdminCategoryRouter(
  options: { now?: () => Date; service: AdminCategoryService }
): Router {
  const router = Router();
  const controller = createAdminCategoryController(options);

  router.get(
    "/categories",
    createPermissionMiddleware({ permission: "category.read" }),
    controller.listCategories
  );
  router.get(
    "/categories/:id",
    createPermissionMiddleware({ permission: "category.read" }),
    controller.getCategory
  );
  router.post(
    "/categories",
    createPermissionMiddleware({ permission: "category.create" }),
    controller.createCategory
  );
  router.patch(
    "/categories/:id",
    createPermissionMiddleware({ permission: "category.update" }),
    controller.updateCategory
  );
  router.delete(
    "/categories/:id",
    createPermissionMiddleware({ permission: "category.delete" }),
    controller.deleteCategory
  );

  return router;
}
