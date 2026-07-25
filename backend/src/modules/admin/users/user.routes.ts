import { Router } from "express";
import { createPermissionMiddleware } from "../rbac.middleware.js";
import { createAdminUserController } from "./user.controller.js";
import type { AdminUserService } from "./user.service.js";

export function createAdminUserRouter(
  options: { now?: () => Date; service: AdminUserService }
): Router {
  const router = Router();
  const controller = createAdminUserController(options);

  router.get(
    "/users",
    createPermissionMiddleware({ permission: "user.read" }),
    controller.listUsers
  );
  router.get(
    "/users/:id",
    createPermissionMiddleware({ permission: "user.read" }),
    controller.getUser
  );
  router.patch(
    "/users/:id/role",
    createPermissionMiddleware({ permission: "user.changeRole" }),
    controller.changeRole
  );
  router.post(
    "/users/:id/disable",
    createPermissionMiddleware({ permission: "user.disable" }),
    controller.disable
  );
  router.post(
    "/users/:id/enable",
    createPermissionMiddleware({ permission: "user.enable" }),
    controller.enable
  );

  return router;
}
