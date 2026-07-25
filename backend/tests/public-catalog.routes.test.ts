import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createPublicCatalogRouter } from "../src/modules/public-catalog/public-catalog.routes.js";
import type { PublicCatalogService } from "../src/modules/public-catalog/public-catalog.service.js";

function createService(overrides: Partial<PublicCatalogService> = {}): PublicCatalogService {
  return {
    getCategoryBySlug: vi.fn().mockResolvedValue({ data: { description: null, slug: "goods", sortOrder: 20, title: "Товары" } }),
    getSiteBySlug: vi.fn().mockResolvedValue({ data: { slug: "site" } }),
    listCategories: vi.fn().mockResolvedValue({ data: [] }),
    listPopularSites: vi.fn().mockResolvedValue({ data: [] }),
    listSites: vi.fn().mockResolvedValue({ data: [], meta: { limit: 12, page: 1, total: 0, totalPages: 0 } }),
    ...overrides
  } as PublicCatalogService;
}

function createTestApp(service: PublicCatalogService): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use("/api", createPublicCatalogRouter({ service }));
  app.use(errorHandler);

  return app;
}

describe("public catalog routes", () => {
  it("routes /api/sites/popular before /api/sites/:slug", async () => {
    const service = createService();

    await request(createTestApp(service)).get("/api/sites/popular").expect(200);

    expect(service.listPopularSites).toHaveBeenCalledTimes(1);
    expect(service.getSiteBySlug).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_ERROR with requestId for invalid query", async () => {
    const response = await request(createTestApp(createService()))
      .get("/api/sites?limit=21")
      .set("X-Request-Id", "req_validation")
      .expect(400)
      .expect("Content-Type", /application\/json/);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Invalid request.",
      requestId: "req_validation"
    });
  });

  it("returns safe INTERNAL_ERROR with requestId when a public API dependency fails", async () => {
    const response = await request(
      createTestApp(createService({ listSites: vi.fn().mockRejectedValue(new Error("database url leaked")) }))
    )
      .get("/api/sites")
      .set("X-Request-Id", "req_internal")
      .expect(500)
      .expect("Content-Type", /application\/json/);

    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
        requestId: "req_internal"
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("database url leaked");
  });

  it("validates category list and detail queries", async () => {
    const service = createService();

    await request(createTestApp(service)).get("/api/categories?includeCounts=true").expect(200);
    expect(service.listCategories).toHaveBeenCalledWith({ includeCounts: true });

    await request(createTestApp(service))
      .get("/api/categories/goods?includeSites=true&page=2&limit=5&sort=title")
      .expect(200);
    expect(service.getCategoryBySlug).toHaveBeenCalledWith("goods", {
      includeSites: true,
      limit: 5,
      page: 2,
      sort: "title"
    });
  });

  it("rejects unknown category query fields", async () => {
    const response = await request(createTestApp(createService()))
      .get("/api/categories?sites=true")
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
  });
});
