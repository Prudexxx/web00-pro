import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import type { AuthRequest } from "../src/modules/auth/auth.types.js";
import {
  B5_PERMISSIONS,
  createPermissionPolicy
} from "../src/modules/admin/rbac.policy.js";
import { createPermissionMiddleware } from "../src/modules/admin/rbac.middleware.js";
import type { B5Permission } from "../src/modules/admin/rbac.types.js";

describe("admin RBAC policy", () => {
  it("grants exactly the approved editor permission set", () => {
    const policy = createPermissionPolicy();

    expect(policy.list("editor")).toEqual([
      "site.read",
      "site.createDraft",
      "site.updateDraft",
      "category.read"
    ]);

    for (const permission of B5_PERMISSIONS) {
      expect(policy.has("editor", permission)).toBe(
        ["site.read", "site.createDraft", "site.updateDraft", "category.read"].includes(
          permission
        )
      );
    }
  });

  it("grants every B5 permission to admin and denies unknown roles or permissions", () => {
    const policy = createPermissionPolicy();

    expect(policy.list("admin")).toEqual(B5_PERMISSIONS);
    for (const permission of B5_PERMISSIONS) {
      expect(policy.has("admin", permission)).toBe(true);
    }
    expect(policy.list("owner")).toEqual([]);
    expect(policy.has("owner", "site.read")).toBe(false);
    expect(policy.has("admin", "site.fly" as B5Permission)).toBe(false);
  });
});

describe("admin permission middleware", () => {
  it("returns UNAUTHORIZED when auth principal is missing", async () => {
    const downstream = vi.fn();
    const app = createMiddlewareApp("site.read", downstream);

    const response = await request(app).get("/admin-test").expect(401);

    expect(response.body.error).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Authentication required."
    });
    expect(downstream).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN before downstream code for an authenticated principal without permission", async () => {
    const downstream = vi.fn();
    const app = createMiddlewareApp("audit.read", downstream, {
      email: "editor@example.com",
      id: "00000000-0000-4000-8000-000000000001",
      role: "editor",
      sessionId: "00000000-0000-4000-8000-000000000002",
      tokenId: "00000000-0000-4000-8000-000000000003"
    });

    const response = await request(app).get("/admin-test").expect(403);

    expect(response.body.error).toMatchObject({
      code: "FORBIDDEN",
      message: "Forbidden."
    });
    expect(downstream).not.toHaveBeenCalled();
  });

  it("passes control when the authenticated principal has permission", async () => {
    const downstream = vi.fn((_request, response) => response.status(204).end());
    const app = createMiddlewareApp("audit.read", downstream, {
      email: "admin@example.com",
      id: "00000000-0000-4000-8000-000000000004",
      role: "admin",
      sessionId: "00000000-0000-4000-8000-000000000005",
      tokenId: "00000000-0000-4000-8000-000000000006"
    });

    await request(app).get("/admin-test").expect(204);

    expect(downstream).toHaveBeenCalledTimes(1);
  });
});

it("allows B5 FORBIDDEN errors to use the approved error envelope", () => {
  const error = new AppError({
    code: "FORBIDDEN",
    message: "Forbidden.",
    statusCode: 403
  });

  expect(error.code).toBe("FORBIDDEN");
});

function createMiddlewareApp(
  permission: B5Permission,
  downstream: express.RequestHandler,
  principal?: AuthRequest["auth"]
): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.get(
    "/admin-test",
    (request, _response, next) => {
      if (principal !== undefined) {
        (request as AuthRequest).auth = principal;
      }
      next();
    },
    createPermissionMiddleware({ permission }),
    downstream
  );
  app.use(errorHandler);

  return app;
}
