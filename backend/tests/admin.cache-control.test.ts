import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { adminCacheControl } from "../src/modules/admin/admin-cache-control.js";
import { createAdminAuthMiddleware } from "../src/modules/admin/admin-auth.middleware.js";
import type { AuthService } from "../src/modules/auth/auth.types.js";

describe("admin cache-control middleware", () => {
  it("sets no-store before authentication failures", async () => {
    const app = express();

    app.use(requestIdMiddleware);
    app.use("/api/admin", adminCacheControl(), createAdminAuthMiddleware({
      service: createAuthService()
    }));
    app.use(errorHandler);

    await request(app)
      .get("/api/admin/sites")
      .expect("Cache-Control", "no-store")
      .expect(401);
  });

  it("sets Pragma on mutation failures without ending the response", async () => {
    const app = express();

    app.use(requestIdMiddleware);
    app.use(
      "/api/admin",
      adminCacheControl(),
      (_request, _response, next) => next(new Error("repository exploded"))
    );
    app.use(errorHandler);

    const response = await request(app)
      .post("/api/admin/sites")
      .expect("Cache-Control", "no-store")
      .expect("Pragma", "no-cache")
      .expect(500);

    expect(response.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("does not add Pragma for read requests and does not read body, env, or token", async () => {
    const downstream = vi.fn((_request, response) => response.status(204).end());
    const app = express();

    app.use(
      "/api/admin",
      adminCacheControl(),
      express.json(),
      downstream
    );

    const response = await request(app)
      .get("/api/admin/sites")
      .set("Authorization", "Bearer ignored")
      .send({ ignored: true })
      .expect("Cache-Control", "no-store")
      .expect(204);

    expect(response.headers.pragma).toBeUndefined();
    expect(downstream).toHaveBeenCalledTimes(1);
  });
});

describe("admin auth middleware", () => {
  it("authenticates with Bearer access token only", async () => {
    const service = createAuthService({
      authenticateAccessToken: vi.fn().mockResolvedValue({
        email: "admin@example.com",
        id: "00000000-0000-4000-8000-000000000001",
        role: "admin",
        sessionId: "00000000-0000-4000-8000-000000000002",
        tokenId: "00000000-0000-4000-8000-000000000003"
      })
    });
    const app = express();

    app.use(
      "/api/admin",
      createAdminAuthMiddleware({ service }),
      (request, response) => response.json({ user: (request as { auth?: unknown }).auth })
    );
    app.use(errorHandler);

    const response = await request(app)
      .get("/api/admin/me")
      .set("Authorization", "Bearer access-token")
      .set("Cookie", "web00_refresh=not-accepted-for-auth")
      .expect(200);

    expect(service.authenticateAccessToken).toHaveBeenCalledWith("access-token");
    expect(response.body.user).toMatchObject({
      email: "admin@example.com",
      role: "admin"
    });
  });
});

function createAuthService(
  overrides: Partial<Pick<AuthService, "authenticateAccessToken">> = {}
): Pick<AuthService, "authenticateAccessToken"> {
  return {
    authenticateAccessToken: vi.fn(),
    ...overrides
  };
}
