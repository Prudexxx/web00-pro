import express, { type Router } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import type { AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";
import type { B5Permission, PermissionPolicy } from "../src/modules/admin/rbac.types.js";

const publicationRoutesModulePath = "../src/modules/admin/publication/publication.routes.js";

describe("admin publication routes", () => {
  it("fails closed for legacy DB-only publication POST even when the V2 feature gate is enabled", async () => {
    const module = await importPublicationRoutesModule();
    const createAdminPublicationRouter = readFunction(module, "createAdminPublicationRouter") as (options: {
      enabled?: boolean;
      now: () => Date;
      service: ReturnType<typeof createPublicationServiceFake>;
    }) => Router;
    const service = createPublicationServiceFake();
    const app = createPublicationRouteApp(createAdminPublicationRouter({
      enabled: true,
      now: fixedNow,
      service
    }));

    const response = await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .set("X-Request-Id", "req_publish_disabled")
      .set("Idempotency-Key", "00000000-0000-4000-8000-0000000000d1")
      .send({ action: "publish" })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: "DIRECT_PAGES_PUBLICATION_REQUIRED"
    });
    expect(service.startPublication).not.toHaveBeenCalled();
  });

  it("keeps auth and RBAC boundaries before rejecting the legacy DB-only publication route", async () => {
    const module = await importPublicationRoutesModule();
    const createAdminPublicationRouter = readFunction(module, "createAdminPublicationRouter") as (options: {
      enabled?: boolean;
      now: () => Date;
      service: ReturnType<typeof createPublicationServiceFake>;
    }) => Router;
    const service = createPublicationServiceFake();
    const app = createPublicationRouteApp(createAdminPublicationRouter({
      enabled: true,
      now: fixedNow,
      service
    }));

    await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .send({ action: "publish" })
      .expect(401);

    await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer editor")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .set("X-Request-Id", "req_editor_publish")
      .set("Idempotency-Key", "00000000-0000-4000-8000-0000000000a1")
      .send({ action: "publish" })
      .expect(403);

    await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("X-Request-Id", "req_missing_csrf")
      .set("Idempotency-Key", "00000000-0000-4000-8000-0000000000a2")
      .send({ action: "publish" })
      .expect(409);

    await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .set("X-Request-Id", "req_missing_idempotency")
      .send({ action: "publish" })
      .expect(409);

    const response = await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .set("X-Request-Id", "req_publish_first")
      .set("Idempotency-Key", "00000000-0000-4000-8000-0000000000a3")
      .send({ action: "publish" })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: "DIRECT_PAGES_PUBLICATION_REQUIRED"
    });
    expect(service.startPublication).not.toHaveBeenCalled();
    expect(service.claimWorkerLease).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toMatch(/lease|lockedBy|lockedAt|requestFingerprint|csrf|manifest|bucket|sha256/i);
  });

  it("requires the action-specific unpublish permission before enqueueing unpublish", async () => {
    const module = await importPublicationRoutesModule();
    const createAdminPublicationRouter = readFunction(module, "createAdminPublicationRouter") as (options: {
      now: () => Date;
      policy?: PermissionPolicy;
      service: ReturnType<typeof createPublicationServiceFake>;
    }) => Router;
    const service = createPublicationServiceFake();
    const app = createPublicationRouteApp(createAdminPublicationRouter({
      now: fixedNow,
      policy: publishOnlyPolicy(),
      service
    }));

    await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .set("X-Request-Id", "req_unpublish_without_permission")
      .set("Idempotency-Key", "00000000-0000-4000-8000-0000000000b1")
      .send({ action: "unpublish" })
      .expect(403);

    expect(service.startPublication).not.toHaveBeenCalled();
  });

  it("requires action-specific Direct Pages permissions before starting a public catalog mutation", async () => {
    const module = await importPublicationRoutesModule();
    const createAdminPublicationRouter = readFunction(module, "createAdminPublicationRouter") as (options: {
      now: () => Date;
      pagesService: ReturnType<typeof createPagesPublicationServiceFake>;
      policy?: PermissionPolicy;
      service: ReturnType<typeof createPublicationServiceFake>;
    }) => Router;
    const service = createPublicationServiceFake();
    const pagesService = createPagesPublicationServiceFake();
    const app = createPublicationRouteApp(createAdminPublicationRouter({
      now: fixedNow,
      pagesService,
      policy: publishOnlyPolicy(),
      service
    }));

    await request(app)
      .post("/api/admin/publication/pages")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .send({
        action: "update",
        card: {
          active: false,
          id: "direct-pages-unpublish",
          slug: "direct-pages-unpublish"
        },
        cardId: "direct-pages-unpublish",
        expectedBlobSha: "sha-existing",
        requestId: "00000000-0000-4000-8000-000000000991"
      })
      .expect(403);

    expect(pagesService.startPagesPublication).not.toHaveBeenCalled();

    await request(app)
      .post("/api/admin/publication/pages")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .send({
        action: "delete",
        card: null,
        cardId: "direct-pages-delete",
        expectedBlobSha: "sha-existing",
        requestId: "00000000-0000-4000-8000-000000000992",
        siteId: "00000000-0000-4000-8000-000000000101"
      })
      .expect(403);

    expect(pagesService.startPagesPublication).not.toHaveBeenCalled();
  });
});

async function importPublicationRoutesModule(): Promise<Record<string, unknown>> {
  try {
    return await import(publicationRoutesModulePath);
  } catch (error) {
    throw new Error("Expected admin publication route module to exist for OPV2-5.", { cause: error });
  }
}

function readFunction(module: Record<string, unknown>, name: string): (...args: unknown[]) => unknown {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`Expected admin publication route export ${name} to be a function.`);
  }
  return value as (...args: unknown[]) => unknown;
}

function createPublicationRouteApp(publicationRouter: Router) {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use((request_, _response, next) => {
    const authorization = request_.get("Authorization");
    if (authorization === "Bearer admin") {
      (request_ as { auth?: AuthenticatedPrincipal }).auth = adminPrincipal();
    } else if (authorization === "Bearer editor") {
      (request_ as { auth?: AuthenticatedPrincipal }).auth = editorPrincipal();
    }
    next();
  });
  app.use("/api/admin", publicationRouter);
  app.use(errorHandler);

  return app;
}

function createPublicationServiceFake() {
  return {
    claimWorkerLease: vi.fn(),
    getOperation: vi.fn(),
    startPublication: vi.fn(async () => ({
      buttonLabel: "Публикуется…",
      operationId: "00000000-0000-4000-8000-00000000feed",
      retryable: false,
      stableStatus: "Публикуется",
      status: "queued",
      statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed"
    }))
  };
}

function createPagesPublicationServiceFake() {
  return {
    getCatalogCard: vi.fn(),
    getPagesPublicationStatus: vi.fn(),
    startPagesPublication: vi.fn(async () => ({
      action: "update",
      buttonLabel: "Проверяется",
      cardId: "direct-pages-unpublish",
      noOp: false,
      operationId: "00000000-0000-4000-8000-000000000991",
      requestId: "00000000-0000-4000-8000-000000000991",
      retryable: false,
      stableStatus: "Проверяется",
      status: "validating",
      statusUrl: "/api/admin/publication/pages/00000000-0000-4000-8000-000000000991"
    }))
  };
}

function fixedNow(): Date {
  return new Date("2026-08-03T16:00:00.000Z");
}

function adminPrincipal(): AuthenticatedPrincipal {
  return {
    email: "admin@example.test",
    id: "00000000-0000-4000-8000-000000000001",
    role: "admin",
    sessionId: "00000000-0000-4000-8000-000000000002",
    tokenId: "00000000-0000-4000-8000-000000000003"
  };
}

function editorPrincipal(): AuthenticatedPrincipal {
  return {
    ...adminPrincipal(),
    email: "editor@example.test",
    role: "editor"
  };
}

function publishOnlyPolicy(): PermissionPolicy {
  const granted = new Set<B5Permission>(["site.publish", "site.read"]);

  return {
    has: (_role, permission) => granted.has(permission),
    list: () => [...granted]
  };
}
