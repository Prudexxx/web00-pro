import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { PublicCorsConfig } from "../src/config/public-cors-env.js";
import type { AppEnv } from "../src/config/env.js";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import {
  createPublicCatalogCorsMiddleware,
  createPublicCatalogPreflightHandler
} from "../src/modules/public-catalog/public-cors.middleware.js";
import type { PublicCatalogService } from "../src/modules/public-catalog/public-catalog.service.js";

const allowedOrigin = "https://web00.example.com";
const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};

function createConfig(): PublicCorsConfig {
  return {
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    allowedOrigins: new Set([allowedOrigin]),
    maxOrigins: 10
  };
}

function createTestApp() {
  const app = express();
  const handler = vi.fn((_request, response) => {
    response.json({ data: "public" });
  });
  const config = createConfig();

  app.use(requestIdMiddleware);
  app.options("/api/sites", createPublicCatalogPreflightHandler(config));
  app.get("/api/sites", createPublicCatalogCorsMiddleware(config), handler);
  app.get("/api/auth/session", (_request, response) => {
    response.json({ data: "auth" });
  });
  app.get("/api/admin/sites", (_request, response) => {
    response.json({ data: "admin" });
  });
  app.use(errorHandler);

  return { app, handler };
}

describe("public catalog CORS middleware", () => {
  it("sets exact public CORS headers for an allowed GET origin", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get("/api/sites")
      .set("Origin", allowedOrigin)
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers.vary).toBe("Origin");
    expect(response.headers["access-control-allow-methods"]).toBe("GET, HEAD, OPTIONS");
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(response.headers["access-control-allow-origin"]).not.toBe("*");
  });

  it("does not reflect an untrusted GET origin", async () => {
    const { app, handler } = createTestApp();
    const response = await request(app)
      .get("/api/sites")
      .set("Origin", "https://evil.example.com")
      .expect(200);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(response.headers.vary).toBe("Origin");
  });

  it("returns 204 for allowed OPTIONS without calling the route handler", async () => {
    const { app, handler } = createTestApp();
    const response = await request(app)
      .options("/api/sites")
      .set("Origin", allowedOrigin)
      .expect(204);

    expect(response.text).toBe("");
    expect(handler).not.toHaveBeenCalled();
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-methods"]).toBe("GET, HEAD, OPTIONS");
    expect(response.headers["access-control-allow-headers"]).toBe("Content-Type, X-Request-Id");
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("returns controlled 403 for untrusted OPTIONS", async () => {
    const { app, handler } = createTestApp();
    const response = await request(app)
      .options("/api/sites")
      .set("Origin", "https://evil.example.com")
      .set("X-Request-Id", "req_cors_forbidden")
      .expect(403);

    expect(handler).not.toHaveBeenCalled();
    expect(response.body.error).toMatchObject({
      code: "CORS_ORIGIN_FORBIDDEN",
      message: "Origin is not allowed.",
      requestId: "req_cors_forbidden"
    });
    expect(response.headers.vary).toBe("Origin");
    expect(JSON.stringify(response.body)).not.toContain("evil.example.com");
  });

  it("does not add public CORS headers to auth or admin routes", async () => {
    const { app } = createTestApp();

    for (const path of ["/api/auth/session", "/api/admin/sites"]) {
      const response = await request(app)
        .get(path)
        .set("Origin", allowedOrigin)
        .expect(200);

      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
      expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    }
  });

  it("is injected by createApp only for public catalog routes", async () => {
    const authRoutes = express.Router();
    const adminRoutes = express.Router();
    const publicCatalogService = {
      getCategoryBySlug: vi.fn(),
      getSiteBySlug: vi.fn(),
      listCategories: vi.fn(),
      listPopularSites: vi.fn(),
      listSites: vi.fn().mockResolvedValue({
        data: [],
        meta: { limit: 12, page: 1, total: 0, totalPages: 0 }
      })
    } as unknown as PublicCatalogService;

    authRoutes.get("/session", (_request, response) => {
      response.json({ data: "auth" });
    });
    adminRoutes.get("/sites", (_request, response) => {
      response.json({ data: "admin" });
    });

    const app = createApp({
      adminRoutes,
      authRoutes,
      env: testEnv,
      publicCatalogService,
      publicCorsConfig: createConfig()
    });
    const publicResponse = await request(app)
      .get("/api/sites")
      .set("Origin", allowedOrigin)
      .expect(200);
    const authResponse = await request(app)
      .get("/api/auth/session")
      .set("Origin", allowedOrigin)
      .expect(200);
    const adminResponse = await request(app)
      .get("/api/admin/sites")
      .set("Origin", allowedOrigin)
      .expect(200);

    expect(publicResponse.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(authResponse.headers["access-control-allow-origin"]).toBeUndefined();
    expect(adminResponse.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
