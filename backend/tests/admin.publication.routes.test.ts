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
  it("enqueues a new publication operation as queued without claiming a worker lease in the HTTP request", async () => {
    const module = await importPublicationRoutesModule();
    const createAdminPublicationRouter = readFunction(module, "createAdminPublicationRouter") as (options: {
      now: () => Date;
      service: ReturnType<typeof createPublicationServiceFake>;
    }) => Router;
    const service = createPublicationServiceFake();
    const app = createPublicationRouteApp(createAdminPublicationRouter({
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
      .expect(403);

    await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .set("X-Request-Id", "req_missing_idempotency")
      .send({ action: "publish" })
      .expect(400);

    const response = await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .set("X-Request-Id", "req_publish_first")
      .set("Idempotency-Key", "00000000-0000-4000-8000-0000000000a3")
      .send({ action: "publish" })
      .expect(202);

    expect(response.body.data).toEqual({
      buttonLabel: "Публикуется…",
      operationId: "00000000-0000-4000-8000-00000000feed",
      retryable: false,
      stableStatus: "Публикуется",
      status: "queued",
      statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed"
    });
    expect(service.startPublication).toHaveBeenCalledWith(expect.objectContaining({
      action: "publish",
      actor: expect.objectContaining({ id: adminPrincipal().id, role: "admin" }),
      idempotencyKey: "00000000-0000-4000-8000-0000000000a3",
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      requestId: "req_publish_first",
      siteId: "00000000-0000-4000-8000-000000000101"
    }));
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
