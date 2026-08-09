import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createAdminSiteRouter } from "../src/modules/admin/sites/site.routes.js";
import type { AdminSiteService } from "../src/modules/admin/sites/site.service.js";
import type { AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";

const int32Max = 2_147_483_647;

describe("admin site route validation", () => {
  it("returns field validation and does not call create service for invalid demo mode", async () => {
    const service = createSiteService();
    const response = await request(createApp(service))
      .post("/api/admin/sites")
      .send({
        ...validCreatePayload(),
        demoMode: "iframe"
      })
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: [
        {
          message: "Выберите допустимый режим демо.",
          path: "demoMode"
        }
      ]
    });
    expect(service.createDraft).not.toHaveBeenCalled();
  });

  it("returns field validation and does not call update service for invalid demo mode", async () => {
    const service = createSiteService();
    const response = await request(createApp(service))
      .patch("/api/admin/sites/00000000-0000-4000-8000-000000000101")
      .send({ demoMode: "external" })
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: [
        {
          message: "Выберите допустимый режим демо.",
          path: "demoMode"
        }
      ]
    });
    expect(service.updateSite).not.toHaveBeenCalled();
  });

  it("returns field validation before create service for PostgreSQL integer overflow", async () => {
    for (const path of ["priceAmountCents", "developmentDays", "sortOrder"] as const) {
      const service = createSiteService();
      const response = await request(createApp(service))
        .post("/api/admin/sites")
        .send({
          ...validCreatePayload(),
          [path]: int32Max + 1
        })
        .expect(400);

      expect(response.body.error).toMatchObject({
        code: "VALIDATION_ERROR",
        details: [
          {
            message: "Must be at most 2147483647.",
            path
          }
        ]
      });
      expect(service.createDraft).not.toHaveBeenCalled();
    }
  });

  it.each([
    "not a URL",
    "https://",
    "https://exa mple.test",
    "http://"
  ])("returns validation before create service for invalid URLs", async (demoUrl) => {
    const service = createSiteService();
    const response = await request(createApp(service))
      .post("/api/admin/sites")
      .send({
        ...validCreatePayload(),
        demoUrl
      })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "demoUrl"
        })
      ])
    );
    expect(service.createDraft).not.toHaveBeenCalled();
  });

  it("returns conflict without leaking raw database details for duplicate slug", async () => {
    const service = createSiteService();

    vi.mocked(service.createDraft).mockRejectedValue(new AppError({
      code: "SLUG_CONFLICT",
      message: "Slug already exists.",
      statusCode: 409
    }));

    const response = await request(createApp(service))
      .post("/api/admin/sites")
      .send(validCreatePayload())
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: "SLUG_CONFLICT",
      message: "Slug already exists."
    });
    expect(JSON.stringify(response.body)).not.toMatch(/duplicate key|sites_slug_key|SQL|valid-site/i);
  });

  it("returns safe internal error with requestId for unknown database failures", async () => {
    const service = createSiteService();

    vi.mocked(service.createDraft).mockRejectedValue(new Error(
      "INSERT INTO sites VALUES ('secret-title', 'https://private.example.test') failed"
    ));

    const response = await request(createApp(service))
      .post("/api/admin/sites")
      .set("X-Request-Id", "req_unknown_db")
      .send(validCreatePayload())
      .expect(500);

    expect(response.body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "Internal server error.",
      requestId: "req_unknown_db"
    });
    expect(JSON.stringify(response.body)).not.toMatch(/INSERT|secret-title|private\.example|valid-site/i);
  });

  it("publishes sites through the admin lifecycle service", async () => {
    const service = createSiteService();
    vi.mocked(service.publishSite).mockResolvedValue(siteResult({ status: "published" }));

    const response = await request(createApp(service))
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publish")
      .set("X-Request-Id", "req_publish_site")
      .expect(200);

    expect(response.body.data).toMatchObject({ id: "00000000-0000-4000-8000-000000000101", status: "published" });
    expect(service.publishSite).toHaveBeenCalledTimes(1);
    expect(service.publishSite).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000101",
      expect.objectContaining({
        actor: principal(),
        requestId: "req_publish_site"
      })
    );
    expect(service.unpublishSite).not.toHaveBeenCalled();
    expect(service.deleteSite).not.toHaveBeenCalled();
  });

  it("unpublishes sites through the admin lifecycle service", async () => {
    const service = createSiteService();
    vi.mocked(service.unpublishSite).mockResolvedValue(siteResult({ status: "draft" }));

    const response = await request(createApp(service))
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/unpublish")
      .set("X-Request-Id", "req_unpublish_site")
      .expect(200);

    expect(response.body.data).toMatchObject({ id: "00000000-0000-4000-8000-000000000101", status: "draft" });
    expect(service.unpublishSite).toHaveBeenCalledTimes(1);
    expect(service.unpublishSite).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000101",
      expect.objectContaining({
        actor: principal(),
        requestId: "req_unpublish_site"
      })
    );
    expect(service.publishSite).not.toHaveBeenCalled();
    expect(service.deleteSite).not.toHaveBeenCalled();
  });

  it("soft-deletes sites through the admin lifecycle service", async () => {
    const service = createSiteService();
    vi.mocked(service.deleteSite).mockResolvedValue(siteResult({ deletedAt: "2026-07-30T12:00:00.000Z" }));

    const response = await request(createApp(service))
      .delete("/api/admin/sites/00000000-0000-4000-8000-000000000101")
      .set("X-Request-Id", "req_delete_site")
      .expect(200);

    expect(response.body.data).toMatchObject({
      deletedAt: "2026-07-30T12:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000101"
    });
    expect(service.deleteSite).toHaveBeenCalledTimes(1);
    expect(service.deleteSite).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000101",
      expect.objectContaining({
        actor: principal(),
        requestId: "req_delete_site"
      })
    );
    expect(service.publishSite).not.toHaveBeenCalled();
    expect(service.unpublishSite).not.toHaveBeenCalled();
  });
});

function createApp(service: AdminSiteService) {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use((request_, _response, next) => {
    (request_ as { auth?: AuthenticatedPrincipal }).auth = principal();
    next();
  });
  app.use(
    "/api/admin",
    createAdminSiteRouter({
      now: () => new Date("2026-07-30T12:00:00.000Z"),
      service
    })
  );
  app.use(errorHandler);

  return app;
}

function createSiteService(): AdminSiteService {
  return {
    createDraft: vi.fn(),
    deleteSite: vi.fn(),
    getSite: vi.fn(),
    listSites: vi.fn(),
    permanentlyDeleteSite: vi.fn(),
    publishSite: vi.fn(),
    restoreSite: vi.fn(),
    unpublishSite: vi.fn(),
    updateSite: vi.fn()
  };
}

function principal(): AuthenticatedPrincipal {
  return {
    email: "admin@example.test",
    id: "00000000-0000-4000-8000-000000000001",
    role: "admin",
    sessionId: "00000000-0000-4000-8000-000000000002",
    tokenId: "00000000-0000-4000-8000-000000000003"
  };
}

function validCreatePayload() {
  return {
    categoryId: "00000000-0000-4000-8000-000000000201",
    shortDescription: "Short description",
    slug: "valid-site",
    title: "Valid Site"
  };
}

function siteResult(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: "00000000-0000-4000-8000-000000000201",
    deletedAt: null,
    id: "00000000-0000-4000-8000-000000000101",
    shortDescription: "Short description",
    slug: "valid-site",
    status: "draft",
    title: "Valid Site",
    ...overrides
  } as never;
}
