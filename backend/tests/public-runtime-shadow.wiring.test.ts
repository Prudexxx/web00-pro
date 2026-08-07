import { readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { parseCloudRuRuntimeEnv } from "../src/config/cloudru-runtime-env.js";
import { AppError } from "../src/lib/errors.js";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { notFoundMiddleware } from "../src/middleware/not-found.js";
import { createAdminRouter } from "../src/modules/admin/admin.routes.js";
import type { AdminAuditLogService } from "../src/modules/admin/audit/audit-log.service.js";
import type { AdminCategoryService } from "../src/modules/admin/categories/category.service.js";
import type { AdminSiteService } from "../src/modules/admin/sites/site.service.js";
import type { AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";
import type { PublicCatalogService } from "../src/modules/public-catalog/public-catalog.service.js";
import {
  PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION,
  createPublicRuntimeShadowDependencies,
  type PublicRuntimeShadowDependencies
} from "../src/modules/public-catalog/public-runtime-shadow.js";
import type { PublicRuntimeStorage } from "../src/modules/public-catalog/public-runtime-storage.js";

const env = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
} as const;

const enabledEnv = {
  CLOUDRU_PUBLIC_BASE_URL: "https://web00-public-runtime.example.test",
  CLOUDRU_RUNTIME_PREFIX: "canary/shadow",
  CLOUDRU_S3_ACCESS_KEY_ID: "tenant_id:key_id",
  CLOUDRU_S3_BUCKET: "web00-public-runtime",
  CLOUDRU_S3_ENDPOINT: "https://s3.cloud.example.test",
  CLOUDRU_S3_REGION: "ru-central-1",
  CLOUDRU_S3_SECRET_ACCESS_KEY: "redacted-runtime-placeholder",
  WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED: "true"
};

describe("public runtime shadow config and dependency factory", () => {
  it("keeps shadow disabled by default without Cloud.ru env and constructs no storage", () => {
    const createStorage = vi.fn();
    const config = parseCloudRuRuntimeEnv({});
    const dependencies = createPublicRuntimeShadowDependencies({
      createStorage,
      env: config,
      prisma: {} as never
    });

    expect(config).toEqual({ enabled: false });
    expect(dependencies).toBeNull();
    expect(createStorage).not.toHaveBeenCalled();
  });

  it.each(["", "catalog", "shadow/canary"])("rejects unsafe shadow prefix %j", (prefix) => {
    expect(() =>
      parseCloudRuRuntimeEnv({
        ...enabledEnv,
        CLOUDRU_RUNTIME_PREFIX: prefix
      })
    ).toThrow(AppError);
  });

  it("accepts only the canonical canary/shadow prefix while preserving credentials internally", () => {
    const config = parseCloudRuRuntimeEnv(enabledEnv);

    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error("Expected enabled shadow config.");
    expect(config.storage.prefix).toBe("canary/shadow");
    expect(config.storage.accessKeyId).toBe("tenant_id:key_id");
  });

  it("returns a sanitized config error when required enabled env is missing", () => {
    try {
      parseCloudRuRuntimeEnv({
        CLOUDRU_S3_SECRET_ACCESS_KEY: "must-not-leak",
        WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED: "true"
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: "CONFIGURATION_ERROR",
        statusCode: 503
      });
      expect(JSON.stringify(error)).not.toContain("must-not-leak");
      return;
    }

    throw new Error("Expected enabled shadow env without required settings to fail.");
  });

  it("maps actual missing public_catalog_control reads to setup_required without storage writes", async () => {
    const storage = createStorage();
    const config = parseCloudRuRuntimeEnv(enabledEnv);
    const dependencies = createPublicRuntimeShadowDependencies({
      createStorage: vi.fn(() => storage),
      env: config,
      prisma: {
        publicCatalogControl: {
          findUnique: vi.fn().mockRejectedValue(
            new Error('42P01: relation "public_catalog_control" does not exist')
          )
        }
      } as never
    });
    if (dependencies === null) throw new Error("Expected enabled dependencies.");

    const status = await dependencies.statusService.getStatus();
    const syncResponse = await request(createAdminApp(dependencies))
      .post("/api/admin/maintenance/public-runtime/sync")
      .set("Authorization", "Bearer admin")
      .set("X-CSRF-Token", "web00-admin")
      .send({ confirmation: PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION })
      .expect(503);

    expect(status.status).toBe("setup_required");
    expect(syncResponse.body.error.code).toBe("CONFIGURATION_ERROR");
    expect(storage.putImmutableObject).not.toHaveBeenCalled();
    expect(storage.putMutableManifest).not.toHaveBeenCalled();
  });
});

describe("public runtime shadow admin maintenance routes", () => {
  it("does not mount the shadow route when shadow dependencies are absent", async () => {
    const response = await request(createAdminApp())
      .get("/api/admin/maintenance/public-runtime")
      .set("Authorization", "Bearer admin")
      .expect(404);

    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("requires authentication and admin authorization for status and sync", async () => {
    const shadow = createShadowDependencies();
    const app = createAdminApp(shadow);

    await request(app).get("/api/admin/maintenance/public-runtime").expect(401);
    await request(app)
      .post("/api/admin/maintenance/public-runtime/sync")
      .send({ confirmation: PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION })
      .expect(401);
    await request(app)
      .get("/api/admin/maintenance/public-runtime")
      .set("Authorization", "Bearer editor")
      .expect(403);
    await request(app)
      .post("/api/admin/maintenance/public-runtime/sync")
      .set("Authorization", "Bearer editor")
      .set("X-CSRF-Token", "web00-admin")
      .send({ confirmation: PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION })
      .expect(403);

    expect(shadow.syncService.syncOnce).not.toHaveBeenCalled();
  });

  it("returns a safe normalized status DTO without storage writes or secret-shaped values", async () => {
    const storage = createStorage();
    const shadow = createShadowDependencies({
      statusService: {
        getStatus: vi.fn().mockResolvedValue({
          desiredRevision: 12,
          enabled: true,
          itemsCount: 16,
          lastSyncErrorCode: "raw provider endpoint tenant_id:key_id redacted-runtime-placeholder",
          mode: "shadow",
          publishedRevision: 11,
          status: "failed"
        })
      },
      storage
    });

    const response = await request(createAdminApp(shadow))
      .get("/api/admin/maintenance/public-runtime")
      .set("Authorization", "Bearer admin")
      .expect(200);

    expect(response.body).toEqual({
      data: {
        desiredRevision: 12,
        enabled: true,
        itemsCount: 16,
        lastSyncErrorCode: "PUBLIC_CATALOG_SYNC_FAILED",
        mode: "shadow",
        publishedRevision: 11,
        status: "failed"
      }
    });
    expect(storage.putImmutableObject).not.toHaveBeenCalled();
    expect(storage.putMutableManifest).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toMatch(/tenant_id:key_id|redacted-runtime-placeholder|endpoint/i);
  });

  it("rejects missing or wrong confirmation before invoking sync", async () => {
    const shadow = createShadowDependencies();
    const app = createAdminApp(shadow);

    for (const body of [{}, { confirmation: "wrong" }]) {
      const response = await request(app)
        .post("/api/admin/maintenance/public-runtime/sync")
        .set("Authorization", "Bearer admin")
        .set("X-CSRF-Token", "web00-admin")
        .send(body)
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }

    expect(shadow.syncService.syncOnce).not.toHaveBeenCalled();
  });

  it("enforces the existing admin CSRF write boundary before manual sync", async () => {
    const shadow = createShadowDependencies();

    const response = await request(createAdminApp(shadow))
      .post("/api/admin/maintenance/public-runtime/sync")
      .set("Authorization", "Bearer admin")
      .send({ confirmation: PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION })
      .expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(shadow.syncService.syncOnce).not.toHaveBeenCalled();
  });

  it("invokes sync exactly once for a confirmed admin request and maps ready deterministically", async () => {
    const shadow = createShadowDependencies({
      syncService: {
        syncOnce: vi.fn().mockResolvedValue({
          desiredRevision: 12,
          itemsCount: 16,
          publishedRevision: 12,
          requestId: "req_shadow_ready",
          snapshotPath: "canary/shadow/catalog/v1/releases/revision-12-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
          status: "ready"
        })
      }
    });

    const response = await request(createAdminApp(shadow))
      .post("/api/admin/maintenance/public-runtime/sync")
      .set("Authorization", "Bearer admin")
      .set("X-CSRF-Token", "web00-admin")
      .set("X-Request-Id", "req_shadow_ready")
      .send({ confirmation: PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION })
      .expect(200);

    expect(shadow.syncService.syncOnce).toHaveBeenCalledTimes(1);
    expect(shadow.syncService.syncOnce).toHaveBeenCalledWith({ requestId: "req_shadow_ready" });
    expect(response.body).toEqual({
      data: {
        desiredRevision: 12,
        enabled: true,
        itemsCount: 16,
        lastSyncErrorCode: null,
        mode: "shadow",
        publishedRevision: 12,
        status: "ready"
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("snapshotPath");
  });

  it("maps pending or active lease sync results to one non-terminal response without duplicate invocation", async () => {
    const shadow = createShadowDependencies({
      syncService: {
        syncOnce: vi.fn().mockResolvedValue({
          desiredRevision: 13,
          publishedRevision: 12,
          requestId: "req_shadow_pending",
          status: "pending"
        })
      }
    });

    const response = await request(createAdminApp(shadow))
      .post("/api/admin/maintenance/public-runtime/sync")
      .set("Authorization", "Bearer admin")
      .set("X-CSRF-Token", "web00-admin")
      .set("X-Request-Id", "req_shadow_pending")
      .send({ confirmation: PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION })
      .expect(202);

    expect(shadow.syncService.syncOnce).toHaveBeenCalledTimes(1);
    expect(response.body.data).toMatchObject({
      desiredRevision: 13,
      publishedRevision: 12,
      status: "pending"
    });
  });

  it("reports setup_required before sync and performs no storage write when the control table is absent", async () => {
    const storage = createStorage();
    const shadow = createShadowDependencies({
      statusService: {
        getStatus: vi.fn().mockResolvedValue({
          desiredRevision: 0,
          enabled: true,
          itemsCount: 0,
          lastSyncErrorCode: null,
          mode: "shadow",
          publishedRevision: 0,
          status: "setup_required"
        })
      },
      storage
    });

    const status = await request(createAdminApp(shadow))
      .get("/api/admin/maintenance/public-runtime")
      .set("Authorization", "Bearer admin")
      .expect(200);
    const sync = await request(createAdminApp(shadow))
      .post("/api/admin/maintenance/public-runtime/sync")
      .set("Authorization", "Bearer admin")
      .set("X-CSRF-Token", "web00-admin")
      .send({ confirmation: PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION })
      .expect(503);

    expect(status.body.data.status).toBe("setup_required");
    expect(sync.body.error.code).toBe("CONFIGURATION_ERROR");
    expect(shadow.syncService.syncOnce).not.toHaveBeenCalled();
    expect(storage.putImmutableObject).not.toHaveBeenCalled();
    expect(storage.putMutableManifest).not.toHaveBeenCalled();
  });

  it("keeps safe storage AppErrors sanitized and lets raw errors use the existing safe boundary", async () => {
    const storageFailure = createShadowDependencies({
      syncService: {
        syncOnce: vi.fn().mockRejectedValue(new AppError({
          code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
          message: "Public runtime storage is unavailable.",
          statusCode: 503
        }))
      }
    });
    const rawFailure = createShadowDependencies({
      syncService: {
        syncOnce: vi.fn().mockRejectedValue(new Error("raw provider secret endpoint leaked"))
      }
    });

    const storageResponse = await request(createAdminApp(storageFailure))
      .post("/api/admin/maintenance/public-runtime/sync")
      .set("Authorization", "Bearer admin")
      .set("X-CSRF-Token", "web00-admin")
      .send({ confirmation: PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION })
      .expect(503);
    const rawResponse = await request(createAdminApp(rawFailure))
      .post("/api/admin/maintenance/public-runtime/sync")
      .set("Authorization", "Bearer admin")
      .set("X-CSRF-Token", "web00-admin")
      .send({ confirmation: PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION })
      .expect(500);

    expect(storageResponse.body.error.code).toBe("PUBLIC_CATALOG_STORAGE_UNAVAILABLE");
    expect(rawResponse.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(rawResponse.body)).not.toContain("raw provider secret endpoint leaked");
  });

  it("does not auto-sync on app construction or ordinary card CRUD", async () => {
    const shadow = createShadowDependencies();
    const app = createAdminApp(shadow);

    expect(shadow.syncService.syncOnce).not.toHaveBeenCalled();

    await request(app)
      .post("/api/admin/sites")
      .set("Authorization", "Bearer admin")
      .send(validCreatePayload())
      .expect(201);

    expect(shadow.syncService.syncOnce).not.toHaveBeenCalled();
    expect(shadow.storage.putImmutableObject).not.toHaveBeenCalled();
    expect(shadow.storage.putMutableManifest).not.toHaveBeenCalled();
  });
});

describe("public runtime shadow public API non-regression", () => {
  it("keeps /api/sites on the existing public catalog service and exposes no public runtime namespace", async () => {
    const publicCatalogService = createPublicCatalogService();
    const app = createApp({
      env,
      publicCatalogService
    });

    await request(app).get("/api/sites").expect(200);
    await request(app).get("/api/public-runtime").expect(404);
    await request(app).post("/api/public-runtime/sync").expect(404);

    expect(publicCatalogService.listSites).toHaveBeenCalledTimes(1);
  });

  it("keeps Direct Pages route modules free from public-runtime shadow wiring", () => {
    const publicationRoutes = readFileSync(
      join(process.cwd(), "src", "modules", "admin", "publication", "publication.routes.ts"),
      "utf8"
    );
    const publicationController = readFileSync(
      join(process.cwd(), "src", "modules", "admin", "publication", "publication.controller.ts"),
      "utf8"
    );

    expect(publicationRoutes).toContain("/publication/pages");
    expect(publicationRoutes).not.toMatch(/public-runtime|shadow/i);
    expect(publicationController).toContain("assertCsrfBoundary");
    expect(publicationController).not.toMatch(/public-runtime|shadow/i);
  });
});

function createAdminApp(
  publicRuntimeShadow?: PublicRuntimeShadowDependencies
): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(
    "/api/admin",
    createAdminRouter({
      auditLogService: { listAuditLogs: vi.fn() } as unknown as AdminAuditLogService,
      authService: createAuthService(),
      categoryService: createCategoryService(),
      ...(publicRuntimeShadow === undefined ? {} : { publicRuntimeShadow }),
      siteService: createSiteService()
    })
  );
  app.use(notFoundMiddleware);
  app.use(errorHandler);

  return app;
}

function createAuthService() {
  return {
    authenticateAccessToken: vi.fn(async (token: string) => {
      if (token === "admin") return principal("admin");
      if (token === "editor") return principal("editor");
      throw new AppError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
        statusCode: 401
      });
    })
  };
}

function principal(role: "admin" | "editor"): AuthenticatedPrincipal {
  return {
    email: `${role}@example.test`,
    id: role === "admin"
      ? "00000000-0000-4000-8000-000000000001"
      : "00000000-0000-4000-8000-000000000011",
    role,
    sessionId: role === "admin"
      ? "00000000-0000-4000-8000-000000000002"
      : "00000000-0000-4000-8000-000000000012",
    tokenId: role === "admin"
      ? "00000000-0000-4000-8000-000000000003"
      : "00000000-0000-4000-8000-000000000013"
  };
}

function createSiteService(): AdminSiteService {
  return {
    createDraft: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000101",
      slug: "shadow-crud-sentinel",
      status: "draft",
      title: "Shadow CRUD Sentinel"
    }),
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

function createCategoryService(): AdminCategoryService {
  return {
    createCategory: vi.fn(),
    deleteCategory: vi.fn(),
    getCategory: vi.fn(),
    listCategories: vi.fn(),
    updateCategory: vi.fn()
  };
}

function createPublicCatalogService(): PublicCatalogService {
  return {
    getCategoryBySlug: vi.fn(),
    getSiteBySlug: vi.fn(),
    listCategories: vi.fn(),
    listPopularSites: vi.fn(),
    listSites: vi.fn().mockResolvedValue({
      data: [],
      meta: { limit: 12, page: 1, total: 0, totalPages: 0 }
    })
  };
}

function createShadowDependencies(
  overrides: Partial<PublicRuntimeShadowDependencies> = {}
): PublicRuntimeShadowDependencies {
  const storage = overrides.storage ?? createStorage();

  return {
    statusService: {
      getStatus: vi.fn().mockResolvedValue({
        desiredRevision: 12,
        enabled: true,
        itemsCount: 16,
        lastSyncErrorCode: null,
        mode: "shadow",
        publishedRevision: 11,
        status: "pending"
      })
    },
    storage,
    syncService: {
      syncOnce: vi.fn().mockResolvedValue({
        desiredRevision: 12,
        itemsCount: 16,
        publishedRevision: 12,
        requestId: "req_shadow_default",
        snapshotPath: "canary/shadow/catalog/v1/releases/revision-12-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
        status: "ready"
      })
    },
    ...overrides
  };
}

function createStorage(): PublicRuntimeStorage {
  return {
    getAuthenticatedObject: vi.fn(),
    getPublicObject: vi.fn(),
    getPublicUrl: vi.fn((path: string) => `https://web00-public-runtime.example.test/${path}`),
    putImmutableObject: vi.fn(),
    putMutableManifest: vi.fn()
  };
}

function validCreatePayload() {
  return {
    categoryId: "00000000-0000-4000-8000-000000000201",
    shortDescription: "Short description",
    slug: "shadow-crud-sentinel",
    title: "Shadow CRUD Sentinel"
  };
}
