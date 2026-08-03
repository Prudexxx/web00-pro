import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import express, { type Router } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { requestIdMiddleware } from "../src/lib/request-id.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createAdminSiteRouter } from "../src/modules/admin/sites/site.routes.js";
import { createAdminSiteService } from "../src/modules/admin/sites/site.service.js";
import type { AdminSiteRepository } from "../src/modules/admin/sites/site.repository.js";
import type { AdminSiteRecord } from "../src/modules/admin/sites/site.types.js";
import type { AuthenticatedPrincipal } from "../src/modules/auth/auth.types.js";
import {
  syntheticGalleryAssets,
  syntheticPreviewAsset
} from "./helpers/public-catalog-v2-synthetic-fixtures.js";

const publicationRoutesModulePath = "../src/modules/admin/publication/publication.routes.js";
const publicationContractModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.publication.js";
const parityModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.builder.js";
const adminUiDomHelperPath = "./helpers/admin-ui-wave5-dom.mjs";
const siteEditorModulePath = "../src/admin/assets/screens/site-editor.js";

async function importContractModule(modulePath: string, description: string): Promise<Record<string, unknown>> {
  try {
    return await import(modulePath);
  } catch (error) {
    throw new Error(`Expected ${description} to exist for One-Click Publish V2; OPV2-1 is RED until it is implemented.`, {
      cause: error
    });
  }
}

function readFunction(module: Record<string, unknown>, name: string): (...args: unknown[]) => unknown {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`Expected One-Click Publish V2 export ${name} to be a function.`);
  }
  return value as (...args: unknown[]) => unknown;
}

describe("One-Click Publish V2 publication and media contracts", () => {
  it("ordinary admin site editor renders one primary publication control and keeps maintenance controls out of the routine flow", async () => {
    const { createFakeDocument } = await import(adminUiDomHelperPath);
    const { createSiteEditorScreen } = await import(siteEditorModulePath);
    const documentRef = createFakeDocument();
    const apiClient = {
      requestJson: vi.fn((requestPath: string, options: { method?: string } = {}) => {
        if (requestPath === "/api/admin/categories?limit=100&page=1") {
          return Promise.resolve({
            data: [{ id: "00000000-0000-4000-8000-000000000201", slug: "synthetic", title: "Synthetic" }],
            meta: { limit: 100, page: 1, total: 1, totalPages: 1 }
          });
        }
        if (
          requestPath === "/api/admin/sites/00000000-0000-4000-8000-000000000101" &&
          options.method === "GET"
        ) {
          return Promise.resolve({ data: adminSiteDto({ status: "draft" }) });
        }
        throw new Error(`Unexpected admin UI request ${requestPath}`);
      })
    };
    const screen = createSiteEditorScreen({
      apiClient,
      documentRef,
      mode: "edit",
      onCancel: vi.fn(),
      onImages: vi.fn(),
      onSaved: vi.fn(),
      onStatus: vi.fn(),
      role: "admin",
      siteId: "00000000-0000-4000-8000-000000000101"
    });

    await screen.load();

    const buttons = screen.element.querySelectorAll("button");
    const primaryPublicationControls = buttons.filter(
      (button: { getAttribute(name: string): string | null }) =>
        button.getAttribute("data-primary-publication-control") === "true"
    );
    const forbiddenActions = new Set([
      "sync-public-catalog",
      "public-catalog-dry-run",
      "check-public-catalog",
      "save-public-catalog-settings",
      "apply-canonical-assets",
      "publish-site-lifecycle-only",
      "unpublish-site-lifecycle-only"
    ]);
    const forbiddenRoutineButtons = buttons.filter(
      (button: { getAttribute(name: string): string | null }) => forbiddenActions.has(button.getAttribute("data-action") ?? "")
    );

    expect(primaryPublicationControls).toHaveLength(1);
    expect(primaryPublicationControls[0]?.textContent).toMatch(
      /Опубликовать|Сохраняем|Загружаем изображения|Проверяем|Публикуем|Опубликовано|Повторить публикацию/
    );
    expect(forbiddenRoutineButtons).toEqual([]);
    expect(screen.element.textContent).not.toMatch(/dry-run|sync|Revision:|Snapshot:|bucket|manifest|lease/i);
  });

  it("mounts the real one-click publication route with RBAC, CSRF, idempotency headers and async operation DTO", async () => {
    const module = await importContractModule(publicationRoutesModulePath, "admin publication route module");
    const createAdminPublicationRouter = readFunction(module, "createAdminPublicationRouter") as (options: {
      now: () => Date;
      service: ReturnType<typeof createPublicationServiceFake>;
    }) => Router;
    const service = createPublicationServiceFake();
    const app = createPublicationRouteApp(createAdminPublicationRouter({ now: fixedNow, service }));

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
      .set("Idempotency-Key", randomUUID())
      .send({ action: "publish" })
      .expect(403);

    await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("X-Request-Id", "req_missing_csrf")
      .set("Idempotency-Key", randomUUID())
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

    const idempotencyKey = randomUUID();
    const first = await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .set("X-Request-Id", "req_publish_first")
      .set("Idempotency-Key", idempotencyKey)
      .send({ action: "publish" })
      .expect(202);
    const replay = await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .set("X-Request-Id", "req_publish_replay")
      .set("Idempotency-Key", idempotencyKey)
      .send({ action: "publish" })
      .expect(202);
    const conflict = await request(app)
      .post("/api/admin/sites/00000000-0000-4000-8000-000000000101/publication")
      .set("Authorization", "Bearer admin")
      .set("Cookie", "web00-admin-session=synthetic")
      .set("X-CSRF-Token", "synthetic-csrf")
      .set("X-Request-Id", "req_publish_conflict")
      .set("Idempotency-Key", idempotencyKey)
      .send({ action: "unpublish" })
      .expect(409);

    expect(first.body.data).toMatchObject({
      buttonLabel: "Публикуется",
      id: "00000000-0000-4000-8000-00000000feed",
      stableStatus: "publishing",
      statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed"
    });
    expect(first.body.data.buttonLabel).not.toBe("Опубликовано");
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(service.startPublication).toHaveBeenCalledTimes(3);
    expect(service.startPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "publish",
        actor: expect.objectContaining({ id: adminPrincipal().id, role: "admin" }),
        idempotencyKey,
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        requestId: "req_publish_first",
        siteId: "00000000-0000-4000-8000-000000000101"
      })
    );
    const routedInputs = service.startPublication.mock.calls.map(([input]) => input);
    expect(routedInputs[1]!.requestFingerprint).toBe(routedInputs[0]!.requestFingerprint);
    expect(routedInputs[2]!.requestFingerprint).not.toBe(routedInputs[0]!.requestFingerprint);
    expect(JSON.stringify(first.body)).not.toMatch(/requestFingerprint|csrf|manifest|bucket|sha256/i);
  });

  it("requires durable operation service to persist request fingerprints, replay duplicates and reject changed fingerprints", async () => {
    const module = await importContractModule(publicationContractModulePath, "durable publication operation service");
    const createDurablePublicationOperationService = readFunction(
      module,
      "createDurablePublicationOperationService"
    ) as (options: {
      now: () => Date;
      repository: ReturnType<typeof createDurableOperationRepositoryFake>;
    }) => {
      startPublication(input: DurablePublicationInput): Promise<Record<string, unknown>>;
    };
    const repository = createDurableOperationRepositoryFake();
    const service = createDurablePublicationOperationService({ now: fixedNow, repository });

    const first = await service.startPublication(durablePublicationInput({
      idempotencyKey: "one-click-publish-key",
      requestFingerprint: "a".repeat(64)
    }));
    const replay = await service.startPublication(durablePublicationInput({
      idempotencyKey: "one-click-publish-key",
      requestFingerprint: "a".repeat(64)
    }));

    await expect(service.startPublication(durablePublicationInput({
      idempotencyKey: "one-click-publish-key",
      requestFingerprint: "b".repeat(64)
    }))).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED"
    });

    expect(first).toMatchObject({ id: "00000000-0000-4000-8000-00000000feed", replayed: false });
    expect(replay).toMatchObject({ id: "00000000-0000-4000-8000-00000000feed", replayed: true });
    expect(repository.createOrReplayPublicationOperation).toHaveBeenCalledTimes(3);
    expect(repository.createOrReplayPublicationOperation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      idempotencyKey: "one-click-publish-key",
      operationGroupKey: "public_catalog:00000000-0000-4000-8000-000000000101",
      requestFingerprint: "a".repeat(64),
      status: "queued",
      targetRevision: expect.any(Number)
    }));
  });

  it("requires migration SQL for durable operation, release, activation event and nonterminal coalescing constraints", () => {
    const sql = collectMigrationSql();

    expect(sql).toMatch(/CREATE TABLE "public_catalog_publication_operations"/);
    expect(sql).toMatch(/"idempotency_key"\s+TEXT\s+NOT NULL/);
    expect(sql).toMatch(/"request_fingerprint"\s+(CHAR\(64\)|TEXT)\s+NOT NULL/);
    expect(sql).toMatch(/"operation_group_key"\s+TEXT\s+NOT NULL/);
    expect(sql).toMatch(/"target_revision"\s+INTEGER\s+NOT NULL/);
    expect(sql).toMatch(/"last_checkpoint"\s+JSONB/);
    expect(sql).toMatch(/"lease_id"\s+TEXT/);
    expect(sql).toMatch(/"retry_count"\s+INTEGER\s+NOT NULL/);
    expect(sql).toMatch(/CREATE TABLE "public_catalog_releases"/);
    expect(sql).toMatch(/CREATE TABLE "public_catalog_activation_events"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX .*public_catalog.*nonterminal.*operation.*WHERE .*status.*queued.*running.*retry_wait/is);
  });

  it("requires published success to depend on DB state, verified immutable release, active pointer read-back and exact public card parity", async () => {
    const repository = createSiteRepositoryFake();
    const service = createAdminSiteService({ repository });
    const lifecycleOnlyResult = await service.publishSite("00000000-0000-4000-8000-000000000101", {
      actor: adminPrincipal(),
      now: fixedNow(),
      requestId: "req_lifecycle_publish"
    });
    expect(lifecycleOnlyResult).toMatchObject({ status: "published" });
    expect((lifecycleOnlyResult as { publication?: unknown }).publication).toBeUndefined();

    const module = await importContractModule(publicationContractModulePath, "publication success finalizer");
    const finalizePublicationSuccess = readFunction(module, "finalizePublicationSuccess") as (
      input: { requestedRevision: number; requestId: string; siteId: string },
      dependencies: ReturnType<typeof createPublicationSuccessDependenciesFake>
    ) => Promise<Record<string, unknown>>;
    const dependencies = createPublicationSuccessDependenciesFake();

    const result = await finalizePublicationSuccess({
      requestedRevision: 7,
      requestId: "req_finalize_success",
      siteId: "00000000-0000-4000-8000-000000000101"
    }, dependencies);

    expect(result).toMatchObject({
      activePointerReadBack: "verified",
      buttonLabel: "Опубликовано",
      dbFinalized: true,
      immutableReleaseVerified: true,
      publicCardParity: "verified",
      stableStatus: "published"
    });
    expect(dependencies.readDbContentState).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000101");
    expect(dependencies.readActivePointer).toHaveBeenCalledWith(7);
    expect(dependencies.readImmutableRelease).toHaveBeenCalledWith(expect.objectContaining({
      manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
      revision: 7
    }));
    expect(dependencies.assertPublicCardParity).toHaveBeenCalledWith(expect.objectContaining({
      siteId: "00000000-0000-4000-8000-000000000101"
    }), expect.objectContaining({
      revision: 7
    }));
    expect(dependencies.finalizeDbPublication).toHaveBeenCalledWith(expect.objectContaining({
      activeRevision: 7,
      siteId: "00000000-0000-4000-8000-000000000101"
    }));
    expect(dependencies.callOrder).toEqual([
      "db_content_state",
      "active_pointer_read_back",
      "immutable_release_read_back",
      "public_card_parity",
      "db_finalize"
    ]);
  });

  it.each([
    ["active pointer revision does not match requested revision", {
      readActivePointer: vi.fn(async () => ({
        manifestPath: "public-catalog/v2/releases/revision-8/manifest.json",
        manifestSha256: "a".repeat(64),
        revision: 8
      }))
    }],
    ["immutable release read-back is missing", {
      readImmutableRelease: vi.fn(async () => null)
    }],
    ["exact public card parity fails", {
      assertPublicCardParity: vi.fn(async () => {
        throw new Error("Synthetic parity mismatch.");
      })
    }],
    ["DB finalization cannot be persisted", {
      finalizeDbPublication: vi.fn(async () => {
        throw new Error("Synthetic DB finalization failure.");
      })
    }]
  ])("does not report Опубликовано when %s", async (_caseName, overrides) => {
    const module = await importContractModule(publicationContractModulePath, "publication success finalizer");
    const finalizePublicationSuccess = readFunction(module, "finalizePublicationSuccess") as (
      input: { requestedRevision: number; requestId: string; siteId: string },
      dependencies: ReturnType<typeof createPublicationSuccessDependenciesFake>
    ) => Promise<Record<string, unknown>>;
    const dependencies = createPublicationSuccessDependenciesFake(overrides);

    await expect(finalizePublicationSuccess({
      requestedRevision: 7,
      requestId: "req_finalize_negative",
      siteId: "00000000-0000-4000-8000-000000000101"
    }, dependencies)).rejects.toBeDefined();

    if (_caseName !== "DB finalization cannot be persisted") {
      expect(dependencies.finalizeDbPublication).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["public DTO field", (actual: PublicCatalogParityFixture) => { actual.description = "Changed"; }],
    ["preview assetId", (actual: PublicCatalogParityFixture) => { actual.previewImage.assetId = "preview-b"; }],
    ["preview sourceSha256", (actual: PublicCatalogParityFixture) => { actual.previewImage.sourceSha256 = "e".repeat(64); }],
    ["preview dimensions", (actual: PublicCatalogParityFixture) => { actual.previewImage.width = 1024; }],
    ["preview storagePath", (actual: PublicCatalogParityFixture) => { actual.previewImage.storagePath = "sites/other/preview.png"; }],
    ["preview variants", (actual: PublicCatalogParityFixture) => { actual.previewImage.variants = [{ format: "webp", path: "other.webp", width: 480 }]; }],
    ["Gallery ordered assetId list", (actual: PublicCatalogParityFixture) => { actual.galleryImages = [...actual.galleryImages].reverse(); }],
    ["Gallery sourceSha256", (actual: PublicCatalogParityFixture) => { actual.galleryImages[0]!.sourceSha256 = "f".repeat(64); }],
    ["Gallery dimensions", (actual: PublicCatalogParityFixture) => { actual.galleryImages[0]!.height = 721; }],
    ["Gallery storagePath", (actual: PublicCatalogParityFixture) => { actual.galleryImages[0]!.storagePath = "sites/other/gallery.png"; }],
    ["Gallery variants", (actual: PublicCatalogParityFixture) => { actual.galleryImages[0]!.variants = [{ format: "avif", path: "other.avif", width: 320 }]; }],
    ["Gallery sortOrder", (actual: PublicCatalogParityFixture) => { actual.galleryImages[0]!.sortOrder = 4; }],
    ["item count", (actual: PublicCatalogParityFixture) => { actual.itemCount = 2; }],
    ["unique slug count", (actual: PublicCatalogParityFixture) => { actual.uniqueSlugCount = 2; }],
    ["revision", (actual: PublicCatalogParityFixture) => { actual.revision = 2; }],
    ["JSON bucket ID", (actual: PublicCatalogParityFixture) => { actual.bucketId = "wrong-bucket"; }],
    ["content type", (actual: PublicCatalogParityFixture) => { actual.contentType = "text/plain"; }],
    ["artifact SHA", (actual: PublicCatalogParityFixture) => { actual.sha256 = "0".repeat(64); }]
  ])("rejects %s mismatch before publication success", async (_caseName, mutate) => {
    const module = await importContractModule(parityModulePath, "Public Catalog V2 read-back parity function");
    const assertPublicCatalogV2ReadBackParity = readFunction(module, "assertPublicCatalogV2ReadBackParity");
    const expected = publicCatalogParityFixture();
    const actual = structuredClone(expected);
    mutate(actual);

    expect(() => assertPublicCatalogV2ReadBackParity(expected, actual)).toThrow(
      "Public Catalog V2 read-back parity mismatch."
    );
  });
});

interface PublicCatalogParityFixture {
  bucketId: string;
  contentType: string;
  description: string;
  galleryImages: ReturnType<typeof syntheticGalleryAssets>;
  itemCount: number;
  previewImage: ReturnType<typeof syntheticPreviewAsset>;
  revision: number;
  sha256: string;
  slug: string;
  uniqueSlugCount: number;
}

interface DurablePublicationInput {
  action: string;
  actor: AuthenticatedPrincipal;
  idempotencyKey: string;
  requestFingerprint: string;
  requestId: string;
  siteId: string;
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

function adminSiteDto(overrides: Partial<AdminSiteRecord> = {}): AdminSiteRecord {
  return {
    active: true,
    category: { id: "00000000-0000-4000-8000-000000000201", slug: "synthetic", title: "Synthetic" },
    categoryId: "00000000-0000-4000-8000-000000000201",
    createdAt: fixedNow(),
    deletedAt: null,
    deliveryLabel: null,
    demoLocalUrl: null,
    demoMode: null,
    demoUrl: null,
    developmentDays: null,
    externalDemoUrl: null,
    featured: false,
    features: [],
    fullDescription: null,
    galleryImages: [],
    id: "00000000-0000-4000-8000-000000000101",
    legacyTitle: null,
    originalDemoUrl: null,
    previewImageUrl: null,
    previewType: "image",
    priceAmountCents: null,
    priceLabel: null,
    publishedAt: null,
    shortDescription: "Synthetic short",
    siteUrl: null,
    slug: "synthetic-fixture",
    sortOrder: 1,
    status: "draft",
    tags: [],
    title: "Synthetic fixture",
    updatedAt: fixedNow(),
    views: 0,
    ...overrides
  };
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
    getOperation: vi.fn(async (id: string) => ({
      buttonLabel: "Публикуется",
      id,
      stableStatus: "publishing",
      statusUrl: `/api/admin/public-catalog/operations/${id}`
    })),
    startPublication: vi.fn(async (input: {
      action: string;
      idempotencyKey: string;
      requestFingerprint: string;
    }) => {
      if (input.action !== "publish") {
        throw new AppError({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Idempotency key was already used for a different publication request.",
          statusCode: 409
        });
      }

      return {
        buttonLabel: "Публикуется",
        id: "00000000-0000-4000-8000-00000000feed",
        stableStatus: "publishing",
        statusUrl: "/api/admin/public-catalog/operations/00000000-0000-4000-8000-00000000feed"
      };
    })
  };
}

function createDurableOperationRepositoryFake() {
  const rows = new Map<string, { operation: Record<string, unknown>; requestFingerprint: string }>();
  return {
    createOrReplayPublicationOperation: vi.fn(async (input: {
      idempotencyKey: string;
      requestFingerprint: string;
    }) => {
      const existing = rows.get(input.idempotencyKey);
      if (existing !== undefined) {
        if (existing.requestFingerprint !== input.requestFingerprint) {
          throw new AppError({
            code: "IDEMPOTENCY_KEY_REUSED",
            message: "Idempotency key was already used for a different publication request.",
            statusCode: 409
          });
        }
        return { ...existing.operation, replayed: true };
      }

      const operation = {
        id: "00000000-0000-4000-8000-00000000feed",
        replayed: false,
        stage: "queued",
        status: "queued"
      };
      rows.set(input.idempotencyKey, { operation, requestFingerprint: input.requestFingerprint });
      return operation;
    })
  };
}

function createPublicationSuccessDependenciesFake(overrides: Record<string, unknown> = {}) {
  const callOrder: string[] = [];
  return {
    callOrder,
    assertPublicCardParity: vi.fn(async () => {
      callOrder.push("public_card_parity");
      return { matched: true };
    }),
    finalizeDbPublication: vi.fn(async () => {
      callOrder.push("db_finalize");
      return { status: "published" };
    }),
    readActivePointer: vi.fn(async () => {
      callOrder.push("active_pointer_read_back");
      return {
      manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
      manifestSha256: "a".repeat(64),
      revision: 7
      };
    }),
    readDbContentState: vi.fn(async () => {
      callOrder.push("db_content_state");
      return {
      siteId: "00000000-0000-4000-8000-000000000101",
      status: "published"
      };
    }),
    readImmutableRelease: vi.fn(async () => {
      callOrder.push("immutable_release_read_back");
      return {
      itemCount: 1,
      revision: 7,
      sha256: "b".repeat(64)
      };
    }),
    ...overrides
  };
}

function durablePublicationInput(overrides: Partial<DurablePublicationInput> = {}): DurablePublicationInput {
  return {
    action: "publish",
    actor: adminPrincipal(),
    idempotencyKey: randomUUID(),
    requestFingerprint: "c".repeat(64),
    requestId: "req_durable_publish",
    siteId: "00000000-0000-4000-8000-000000000101",
    ...overrides
  };
}

function createSiteRepositoryFake(): AdminSiteRepository {
  return {
    createDraft: vi.fn(),
    getSite: vi.fn(),
    listSites: vi.fn(),
    permanentlyDeleteSite: vi.fn(),
    publishSite: vi.fn(async () => adminSiteDto({
      publishedAt: fixedNow(),
      status: "published"
    })),
    restoreSite: vi.fn(),
    softDeleteSite: vi.fn(),
    unpublishSite: vi.fn(),
    updateSite: vi.fn()
  };
}

function collectMigrationSql(): string {
  const migrationRoot = "prisma/migrations";
  if (!existsSync(migrationRoot)) {
    return "";
  }
  return readdirSync(migrationRoot)
    .map((directory) => join(migrationRoot, directory, "migration.sql"))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n\n");
}

function publicCatalogParityFixture(): PublicCatalogParityFixture {
  return {
    bucketId: "web00-public-catalog",
    contentType: "application/json",
    description: "Exact public field",
    galleryImages: syntheticGalleryAssets(["gallery-a", "gallery-b"]),
    itemCount: 1,
    previewImage: syntheticPreviewAsset("preview-a"),
    revision: 1,
    sha256: "d".repeat(64),
    slug: "synthetic-v2-fixture",
    uniqueSlugCount: 1
  };
}
