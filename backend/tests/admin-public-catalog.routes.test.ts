import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createAdminPublicCatalogRouter } from "../src/modules/admin/public-catalog/public-catalog-admin.routes.js";
import type { AdminPublicCatalogService } from "../src/modules/admin/public-catalog/public-catalog-admin.service.js";
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
