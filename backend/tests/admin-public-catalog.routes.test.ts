import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createAdminPublicCatalogRouter } from "../src/modules/admin/public-catalog/public-catalog-admin.routes.js";
import type { AdminPublicCatalogService } from "../src/modules/admin/public-catalog/public-catalog-admin.service.js";
import { AppError } from "../src/lib/errors.js";
import type { AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";

describe("admin public catalog routes", () => {
  it("requires admin RBAC and exact confirmation for manual sync", async () => {
    const service = createPublicCatalogService();

    await request(createApp(service)).post("/api/admin/public-catalog/sync").send({
      confirmation: "WEB00-PUBLIC-CATALOG-SYNC-V1"
    }).expect(401);
    await request(createApp(service, editorPrincipal())).post("/api/admin/public-catalog/sync").send({
      confirmation: "WEB00-PUBLIC-CATALOG-SYNC-V1"
    }).expect(403);

    const wrong = await request(createApp(service, adminPrincipal()))
      .post("/api/admin/public-catalog/sync")
      .send({ confirmation: "wrong" })
      .expect(400);

    expect(wrong.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(service.sync).not.toHaveBeenCalled();

    const response = await request(createApp(service, adminPrincipal()))
      .post("/api/admin/public-catalog/sync")
      .set("X-Request-Id", "req_public_catalog_sync")
      .send({ confirmation: "WEB00-PUBLIC-CATALOG-SYNC-V1" })
      .expect(200);

    expect(response.body.data).toMatchObject({
      publishedRevision: 7,
      status: "ready"
    });
    expect(service.sync).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ id: adminPrincipal().id, role: "admin" }),
        requestId: "req_public_catalog_sync"
      })
    );
  });

  it("requires admin RBAC and exact confirmation for dry-run", async () => {
    const service = createPublicCatalogService();

    await request(createApp(service))
      .post("/api/admin/public-catalog/dry-run")
      .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
      .expect(401);

    await request(createApp(service, editorPrincipal()))
      .post("/api/admin/public-catalog/dry-run")
      .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
      .expect(403);

    await request(createApp(service, adminPrincipal()))
      .post("/api/admin/public-catalog/dry-run")
      .send({ confirmation: "WEB00-PUBLIC-CATALOG-SYNC-V1" })
      .expect(400);

    expect(service.dryRun).not.toHaveBeenCalled();

    const response = await request(createApp(service, adminPrincipal()))
      .post("/api/admin/public-catalog/dry-run")
      .set("X-Request-Id", "req_public_catalog_dry_run")
      .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
      .expect(200);

    expect(response.body.data).toMatchObject({
      requestId: "req_public_catalog_dry_run",
      status: "ready"
    });
    expect(service.sync).not.toHaveBeenCalled();
  });

  it("surfaces singleton dry-run concurrency guard across requests in the same app", async () => {
    const started = createDeferredValue<void>();
    const release = createDeferredValue<void>();
    let active = false;
    const service = createPublicCatalogService();
    service.dryRun = vi.fn(async () => {
      if (active) {
        throw new AppError({
          code: "PUBLIC_CATALOG_DRY_RUN_IN_PROGRESS",
          message: "Public catalog dry-run is already in progress.",
          statusCode: 409
        });
      }
      active = true;
      try {
        started.resolve();
        await release.promise;
        return {
          blockers: [],
          blockersTruncated: false,
          byteLength: 1200,
          durationMs: 10,
          itemsCount: 16,
          requestId: "req_first",
          revision: 8,
          sha256: "b".repeat(64),
          status: "ready" as const
        };
      } finally {
        active = false;
      }
    });
    const app = createApp(service, adminPrincipal());

    const first = request(app)
      .post("/api/admin/public-catalog/dry-run")
      .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
      .expect(200);
    const firstResponse = first.then((response) => response);
    await started.promise;

    await request(app)
      .post("/api/admin/public-catalog/dry-run")
      .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
      .expect(409)
      .expect((response) => {
        expect(response.body.error.code).toBe("PUBLIC_CATALOG_DRY_RUN_IN_PROGRESS");
      });

    release.resolve();
    await firstResponse;

    await request(app)
      .post("/api/admin/public-catalog/dry-run")
      .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
      .expect(200);
  });
});

function createApp(service: AdminPublicCatalogService, principal?: AuthenticatedPrincipal) {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use((request_, _response, next) => {
    if (principal !== undefined) {
      (request_ as { auth?: AuthenticatedPrincipal }).auth = principal;
    }
    next();
  });
  app.use("/api/admin", createAdminPublicCatalogRouter({
    now: () => new Date("2026-08-01T12:00:00.000Z"),
    service
  }));
  app.use(errorHandler);

  return app;
}

function createPublicCatalogService(): AdminPublicCatalogService {
  return {
    dryRun: vi.fn(async () => ({
      blockers: [],
      blockersTruncated: false,
      byteLength: 1200,
      durationMs: 10,
      itemsCount: 16,
      requestId: "req_public_catalog_dry_run",
      revision: 8,
      sha256: "b".repeat(64),
      status: "ready" as const
    })),
    getStatus: vi.fn(async () => ({
      currentItemsCount: 16,
      currentSnapshotChecksum: "a".repeat(64),
      currentSnapshotPath: "public-catalog/v1/snapshots/revision-7.json",
      desiredRevision: 7,
      lastSyncErrorCode: null,
      lastSyncRequestId: null,
      publishedRevision: 7,
      showDemoInModal: false,
      syncStatus: "ready" as const
    })),
    sync: vi.fn(async () => ({
      checksum: "a".repeat(64),
      itemsCount: 16,
      publishedRevision: 7,
      requestId: "req_public_catalog_sync",
      snapshotPath: "public-catalog/v1/snapshots/revision-7.json",
      status: "ready" as const
    })),
    updateSettings: vi.fn(async () => ({
      status: {
        currentItemsCount: 16,
        currentSnapshotChecksum: "a".repeat(64),
        currentSnapshotPath: "public-catalog/v1/snapshots/revision-7.json",
        desiredRevision: 7,
        lastSyncErrorCode: null,
        lastSyncRequestId: null,
        publishedRevision: 7,
        showDemoInModal: false,
        syncStatus: "ready" as const
      },
      sync: {
        checksum: "a".repeat(64),
        itemsCount: 16,
        publishedRevision: 7,
        requestId: "req_public_catalog_sync",
        snapshotPath: "public-catalog/v1/snapshots/revision-7.json",
        status: "ready" as const
      }
    }))
  };
}

function createDeferredValue<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
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
    id: "00000000-0000-4000-8000-000000000004",
    role: "editor"
  };
}
