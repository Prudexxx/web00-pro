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
import type { PublicationOperationRecord } from "../src/modules/public-catalog-v2/public-catalog-v2.types.js";
import {
  syntheticGalleryAssets,
  syntheticPreviewAsset
} from "./helpers/public-catalog-v2-synthetic-fixtures.js";

const publicationRoutesModulePath = "../src/modules/admin/publication/publication.routes.js";
const publicationContractModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.publication.js";
const parityModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.builder.js";
const siteMediaAssetsModulePath = "../src/modules/admin/images/site-media-assets.repository.js";
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
  it("projects exact canonical Preview and ordered Gallery media for future release parity", async () => {
    const module = await importContractModule(
      siteMediaAssetsModulePath,
      "OPV2-3 canonical media asset repository"
    );
    const createPrismaSiteMediaAssetsRepository = readFunction(
      module,
      "createPrismaSiteMediaAssetsRepository"
    ) as () => {
      readSitePublicationMediaParity?: (siteId: string, tx: ReturnType<typeof createCanonicalMediaTxFake>) => Promise<unknown>;
    };
    const repository = createPrismaSiteMediaAssetsRepository();

    expect(repository.readSitePublicationMediaParity).toBeTypeOf("function");

    await expect(
      repository.readSitePublicationMediaParity?.(
        "00000000-0000-4000-8000-000000000101",
        createCanonicalMediaTxFake()
      )
    ).resolves.toEqual({
      galleryImages: [
        syntheticMediaAsset("gallery-b", "gallery", 0),
        syntheticMediaAsset("gallery-a", "gallery", 1)
      ],
      previewImage: syntheticMediaAsset("preview-a", "preview", null),
      siteId: "00000000-0000-4000-8000-000000000101"
    });
  });

  it("classifies media parity mismatches without slug, title or fallback substitution", async () => {
    const module = await importContractModule(
      siteMediaAssetsModulePath,
      "OPV2-3 media parity verifier"
    );
    const verifySitePublicationMediaParity = readFunction(
      module,
      "verifySitePublicationMediaParity"
    );
    const expected = {
      galleryImages: [
        syntheticMediaAsset("gallery-a", "gallery", 0),
        syntheticMediaAsset("gallery-b", "gallery", 1)
      ],
      previewImage: syntheticMediaAsset("preview-a", "preview", null),
      siteId: "00000000-0000-4000-8000-000000000101"
    };

    expect(verifySitePublicationMediaParity(expected, structuredClone(expected))).toEqual({
      code: "MATCH",
      matched: true
    });
    expect(verifySitePublicationMediaParity(expected, {
      ...expected,
      previewImage: null
    })).toMatchObject({ code: "PREVIEW_MISSING", matched: false });
    expect(verifySitePublicationMediaParity(expected, {
      ...expected,
      previewImage: {
        ...expected.previewImage,
        assetId: "preview-b",
        variants: expected.previewImage.variants
      }
    })).toMatchObject({ code: "PREVIEW_ASSET_MISMATCH", matched: false });
    expect(verifySitePublicationMediaParity(expected, {
      ...expected,
      previewImage: {
        ...expected.previewImage,
        sourceSha256: "f".repeat(64)
      }
    })).toMatchObject({ code: "PREVIEW_HASH_MISMATCH", matched: false });
    expect(verifySitePublicationMediaParity(expected, {
      ...expected,
      previewImage: {
        ...expected.previewImage,
        assetId: expected.previewImage.assetId,
        sourceSha256: "f".repeat(64),
        storagePath: "sites/fallback/preview/image",
        variants: expected.previewImage.variants
      }
    })).toMatchObject({ code: "PREVIEW_ASSET_MISMATCH", matched: false });
    expect(verifySitePublicationMediaParity(expected, {
      ...expected,
      galleryImages: [...expected.galleryImages].reverse()
    })).toMatchObject({ code: "GALLERY_ORDER_MISMATCH", matched: false });
    expect(verifySitePublicationMediaParity(expected, {
      ...expected,
      galleryImages: [
        {
          ...expected.galleryImages[0],
          sourceSha256: "e".repeat(64)
        },
        expected.galleryImages[1]
      ]
    })).toMatchObject({ code: "GALLERY_HASH_MISMATCH", matched: false });
    expect(verifySitePublicationMediaParity(expected, {
      ...expected,
      previewImage: {
        ...expected.previewImage,
        sourceMime: "image/webp"
      }
    })).toMatchObject({ code: "PREVIEW_ASSET_MISMATCH", matched: false });
    expect(verifySitePublicationMediaParity(expected, {
      ...expected,
      previewImage: {
        ...expected.previewImage,
        decodedFormat: "webp"
      }
    })).toMatchObject({ code: "PREVIEW_ASSET_MISMATCH", matched: false });
    expect(verifySitePublicationMediaParity(expected, {
      ...expected,
      galleryImages: [
        {
          ...expected.galleryImages[0],
          slot: "preview"
        },
        expected.galleryImages[1]
      ]
    })).toMatchObject({ code: "GALLERY_ASSET_MISMATCH", matched: false });
    expect(verifySitePublicationMediaParity(expected, {
      ...expected,
      galleryImages: [
        {
          ...expected.galleryImages[0],
          siteId: "00000000-0000-4000-8000-000000000999"
        },
        expected.galleryImages[1]
      ]
    })).toMatchObject({ code: "GALLERY_ASSET_MISMATCH", matched: false });
    expect(verifySitePublicationMediaParity({
      galleryImages: [],
      previewImage: null,
      siteId: "00000000-0000-4000-8000-000000000101"
    }, {
      galleryImages: [],
      previewImage: null,
      siteId: "00000000-0000-4000-8000-000000000999"
    })).toMatchObject({
      code: "GALLERY_ASSET_MISMATCH",
      fieldPath: "siteId",
      matched: false
    });
  });

  it("rejects corrupted persisted canonical media before future release projection can consume it", async () => {
    const module = await importContractModule(
      siteMediaAssetsModulePath,
      "OPV2-3 canonical media asset repository"
    );
    const createPrismaSiteMediaAssetsRepository = readFunction(
      module,
      "createPrismaSiteMediaAssetsRepository"
    ) as () => {
      readSitePublicationMediaParity?: (siteId: string, tx: ReturnType<typeof createCanonicalMediaTxFake>) => Promise<unknown>;
    };
    const repository = createPrismaSiteMediaAssetsRepository();
    const tx = createCanonicalMediaTxFake({
      previewImage: {
        ...syntheticMediaAsset("preview-a", "preview", null),
        storagePath: "https://storage.example.test/sites/preview-a?token=secret"
      }
    });

    await expect(
      repository.readSitePublicationMediaParity?.(
        "00000000-0000-4000-8000-000000000101",
        tx
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

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
      buttonLabel: "Публикуется…",
      operationId: "00000000-0000-4000-8000-00000000feed",
      retryable: false,
      stableStatus: "Публикуется",
      status: "queued"
    });
    expect(first.body.data.buttonLabel).not.toBe("Опубликовано");
    expect(replay.body.data.operationId).toBe(first.body.data.operationId);
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

    expect(first).toMatchObject({
      buttonLabel: "Публикуется…",
      operationId: "00000000-0000-4000-8000-00000000feed",
      stableStatus: "Публикуется",
      status: "queued"
    });
    expect(replay).toMatchObject({
      buttonLabel: "Публикуется…",
      operationId: "00000000-0000-4000-8000-00000000feed",
      stableStatus: "Публикуется",
      status: "queued"
    });
    expect(repository.createOrCoalescePublicationOperation).toHaveBeenCalledTimes(3);
    expect(repository.createOrCoalescePublicationOperation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      idempotencyKey: "one-click-publish-key",
      operationGroupKey: "public-catalog",
      operationScope: "site:00000000-0000-4000-8000-000000000101",
      requestFingerprint: "a".repeat(64),
      stage: "content_transaction",
      targetRevision: 7
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
      input: {
        activePointer: Record<string, unknown>;
        dependencies: ReturnType<typeof createPublicationSuccessDependenciesFake>;
        leaseId: string;
        now: () => Date;
        operation: PublicationOperationRecord;
        release: Record<string, unknown>;
      }
    ) => Promise<Record<string, unknown>>;
    const dependencies = createPublicationSuccessDependenciesFake();

    const result = await finalizePublicationSuccess({
      activePointer: activePointerFixture(),
      dependencies,
      leaseId: "synthetic-lease",
      now: fixedNow,
      operation: publicationOperationRecord(),
      release: releaseFixture()
    });

    expect(result).toMatchObject({
      activePointerReadBack: "verified",
      buttonLabel: "Опубликовано",
      dbFinalized: true,
      immutableReleaseVerified: true,
      operationId: "00000000-0000-4000-8000-00000000feed",
      publicCardParity: "verified",
      stableStatus: "Опубликовано",
      status: "succeeded"
    });
    expect(dependencies.readDbContentState).toHaveBeenCalledWith(expect.objectContaining({
      siteId: "00000000-0000-4000-8000-000000000101"
    }));
    expect(dependencies.readActivePointer).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 7
    }));
    expect(dependencies.readImmutableRelease).toHaveBeenCalledWith(expect.objectContaining({
      manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
      revision: 7
    }));
    expect(dependencies.assertPublicCardParity).toHaveBeenCalledWith(expect.objectContaining({
      operation: expect.objectContaining({
        siteId: "00000000-0000-4000-8000-000000000101"
      })
    }));
    expect(dependencies.finalizePublicationTransaction).toHaveBeenCalledWith(expect.objectContaining({
      activePointerSha256: "e".repeat(64),
      eventType: "activate",
      expectedPublicState: "published",
      revision: 7,
      siteId: "00000000-0000-4000-8000-000000000101"
    }));
    expect(dependencies.callOrder).toEqual([
      "db_content_state",
      "active_pointer_read_back",
      "immutable_release_read_back",
      "public_card_parity",
      "finalize_transaction"
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
      finalizePublicationTransaction: vi.fn(async () => {
        throw new Error("Synthetic DB finalization failure.");
      })
    }]
  ])("does not report Опубликовано when %s", async (_caseName, overrides) => {
    const module = await importContractModule(publicationContractModulePath, "publication success finalizer");
    const finalizePublicationSuccess = readFunction(module, "finalizePublicationSuccess") as (
      input: {
        activePointer: Record<string, unknown>;
        dependencies: ReturnType<typeof createPublicationSuccessDependenciesFake>;
        leaseId: string;
        now: () => Date;
        operation: PublicationOperationRecord;
        release: Record<string, unknown>;
      }
    ) => Promise<Record<string, unknown>>;
    const dependencies = createPublicationSuccessDependenciesFake(overrides);

    await expect(finalizePublicationSuccess({
      activePointer: activePointerFixture(),
      dependencies,
      leaseId: "synthetic-lease",
      now: fixedNow,
      operation: publicationOperationRecord(),
      release: releaseFixture()
    })).rejects.toBeDefined();

    if (_caseName !== "DB finalization cannot be persisted") {
      expect(dependencies.finalizePublicationTransaction).not.toHaveBeenCalled();
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
  action: "publish" | "unpublish";
  actor: AuthenticatedPrincipal;
  idempotencyKey: string;
  requestFingerprint: string;
  requestId: string;
  siteId: string;
  targetRevision: number;
}

function fixedNow(): Date {
  return new Date("2026-08-03T16:00:00.000Z");
}

function createCanonicalMediaTxFake(
  overrides: {
    galleryImages?: Array<ReturnType<typeof syntheticMediaAsset>>;
    previewImage?: ReturnType<typeof syntheticMediaAsset>;
  } = {}
) {
  const siteId = "00000000-0000-4000-8000-000000000101";
  const previewImage = overrides.previewImage ?? syntheticMediaAsset("preview-a", "preview", null);
  const galleryImages = overrides.galleryImages ?? [
    syntheticMediaAsset("gallery-b", "gallery", 0),
    syntheticMediaAsset("gallery-a", "gallery", 1)
  ];

  return {
    site: {
      findUnique: vi.fn(async () => ({
        galleryImageAssets: galleryImages.map((image) => ({
          alt: `Alt ${image.assetId}`,
          asset: canonicalMediaAssetRecord(image),
          assetId: image.assetId,
          siteId,
          slot: "gallery",
          sortOrder: image.sortOrder
        })),
        id: siteId,
        previewImage: {
          asset: canonicalMediaAssetRecord(previewImage),
          assetId: previewImage.assetId,
          siteId,
          slot: "preview"
        }
      }))
    }
  };
}

function canonicalMediaAssetRecord(image: ReturnType<typeof syntheticMediaAsset>) {
  return {
    assetId: image.assetId,
    decodedFormat: image.decodedFormat,
    height: image.height,
    siteId: image.siteId,
    slot: image.slot,
    sourceMime: image.sourceMime,
    sourceSha256: image.sourceSha256,
    storagePath: image.storagePath,
    variants: image.variants,
    width: image.width
  };
}

function syntheticMediaAsset(
  assetId: string,
  slot: "gallery" | "preview",
  sortOrder: number | null
) {
  const siteId = "00000000-0000-4000-8000-000000000101";
  const storagePath = `sites/${siteId}/${slot}/${assetId}`;

  return {
    assetId,
    decodedFormat: "png",
    height: 600,
    siteId,
    slot,
    sortOrder,
    sourceMime: "image/png",
    sourceSha256: slot === "preview" ? "a".repeat(64) : "b".repeat(64),
    storagePath,
    variants: [
      {
        contentType: "image/webp",
        format: "webp",
        height: 600,
        path: `${storagePath}/1200.webp`,
        width: 1200
      },
      {
        contentType: "image/avif",
        format: "avif",
        height: 600,
        path: `${storagePath}/1200.avif`,
        width: 1200
      }
    ],
    width: 1200
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
      buttonLabel: "Публикуется…",
      operationId: id,
      retryable: false,
      stableStatus: "Публикуется",
      status: "queued"
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
        buttonLabel: "Публикуется…",
        operationId: "00000000-0000-4000-8000-00000000feed",
        retryable: false,
        stableStatus: "Публикуется",
        status: "queued"
      };
    })
  };
}

function createDurableOperationRepositoryFake() {
  const rows = new Map<string, { operation: PublicationOperationRecord; requestFingerprint: string }>();
  return {
    createOrCoalescePublicationOperation: vi.fn(async (input: {
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
        return existing.operation;
      }

      const operation = publicationOperationRecord({
        action: "publish",
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        status: "queued"
      });
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
    finalizePublicationTransaction: vi.fn(async () => {
      callOrder.push("finalize_transaction");
      return { status: "succeeded" };
    }),
    readActivePointer: vi.fn(async () => {
      callOrder.push("active_pointer_read_back");
      return {
      manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
      manifestSha256: "a".repeat(64),
      revision: 7,
      sha256: "e".repeat(64)
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
      artifacts: [{
        kind: "index",
        path: "public-catalog/v2/releases/revision-7/index.json",
        sha256: "b".repeat(64)
      }],
      chunks: [{
        path: "public-catalog/v2/releases/revision-7/chunks/chunk-000001.json",
        sha256: "d".repeat(64)
      }],
      index: {
        path: "public-catalog/v2/releases/revision-7/index.json",
        sha256: "b".repeat(64)
      },
      itemsCount: 1,
      manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
      manifestSha256: "a".repeat(64),
      revision: 7,
      sha256: "a".repeat(64)
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
    targetRevision: 7,
    ...overrides
  };
}

function publicationOperationRecord(overrides: Partial<PublicationOperationRecord> = {}): PublicationOperationRecord {
  const now = fixedNow();

  return {
    action: "publish",
    actorUserId: adminPrincipal().id,
    completedAt: null,
    createdAt: now,
    id: "00000000-0000-4000-8000-00000000feed",
    idempotencyKey: "00000000-0000-4000-8000-0000000000a7",
    lastCheckpoint: {},
    lastErrorCode: null,
    leaseId: "synthetic-lease",
    lockedAt: now,
    lockedBy: "synthetic-worker",
    nextRetryAt: null,
    operationGroupKey: "public-catalog",
    operationScope: "site:00000000-0000-4000-8000-000000000101",
    projectionHash: null,
    requestFingerprint: "a".repeat(64),
    requestId: "req_finalize_success",
    retryCount: 0,
    siteId: "00000000-0000-4000-8000-000000000101",
    stage: "active_verify",
    status: "running",
    targetRevision: 7,
    trigger: "site_publication",
    updatedAt: now,
    ...overrides
  };
}

function releaseFixture(): Record<string, unknown> {
  return {
    activationInput: {
      manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
      manifestSha256: "a".repeat(64),
      revision: 7
    },
    manifest: {
      artifacts: [{
        kind: "index",
        path: "public-catalog/v2/releases/revision-7/index.json",
        sha256: "b".repeat(64)
      }],
      chunks: [{
        path: "public-catalog/v2/releases/revision-7/chunks/chunk-000001.json",
        sha256: "d".repeat(64)
      }],
      index: {
        path: "public-catalog/v2/releases/revision-7/index.json",
        sha256: "b".repeat(64)
      },
      itemsCount: 1,
      revision: 7,
      sha256: "a".repeat(64)
    }
  };
}

function activePointerFixture(): Record<string, unknown> {
  return {
    manifestPath: "public-catalog/v2/releases/revision-7/manifest.json",
    manifestSha256: "a".repeat(64),
    path: "public-catalog/v2/active.json",
    revision: 7,
    sha256: "e".repeat(64)
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
