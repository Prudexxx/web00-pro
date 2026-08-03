import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import type { ManagedImageUrlPolicy } from "../src/modules/images/image.types.js";
import { mapSiteToPublicCatalogItem } from "../src/modules/public-catalog/public-catalog.mapper.js";
import {
  buildPublicCatalogSnapshot
} from "../src/modules/public-catalog/public-catalog.snapshot.js";
import {
  createPublicCatalogSyncService as createPublicCatalogSyncServiceBase,
  type PublicCatalogSyncRepository,
  type PublicCatalogSyncServiceOptions
} from "../src/modules/public-catalog/public-catalog-sync.service.js";
import {
  preparePublicCatalogSnapshotCandidate
} from "../src/modules/public-catalog/public-catalog-snapshot-preparation.js";
import {
  PUBLIC_CATALOG_CONTROL_ID,
  type PublicCatalogControlState
} from "../src/modules/public-catalog/public-catalog-control.repository.js";
import type {
  PublicCatalogStorageBucketManager
} from "../src/modules/public-catalog/public-catalog-storage-bucket.js";
import type { PublicCatalogSnapshotStorage } from "../src/modules/public-catalog/public-catalog-snapshot-storage.js";
import type { PublicSiteRecord } from "../src/modules/public-catalog/public-catalog.types.js";

const now = new Date("2026-08-01T16:00:00.000Z");

const siteRecord = {
  category: { slug: "goods", title: "Товары" },
  deliveryLabel: null,
  demoMode: null,
  demoUrl: "https://prudexxx.github.io/web00-pro/demo.html",
  developmentDays: null,
  featured: false,
  features: ["Responsive"],
  fullDescription: "Full",
  galleryImages: [],
  id: "3c205371-b407-4d27-8e5c-0dd2a3be8092",
  previewImageUrl: "https://prudexxx.github.io/web00-pro/assets/preview.webp",
  previewType: "image",
  priceAmountCents: null,
  priceLabel: null,
  publishedAt: new Date("2026-07-24T00:00:00.000Z"),
  shortDescription: "Short",
  siteUrl: null,
  slug: "published-site",
  tags: ["design"],
  title: "Published site"
} satisfies PublicSiteRecord;

function control(overrides: Partial<PublicCatalogControlState> = {}): PublicCatalogControlState {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotPath: null,
    desiredRevision: 1,
    id: PUBLIC_CATALOG_CONTROL_ID,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 0,
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "pending",
    ...overrides
  };
}

function createRepository(): PublicCatalogSyncRepository {
  return {
    acquireLease: vi.fn().mockResolvedValue({
      leaseId: "lease_test",
      revision: 1,
      state: control({
        syncLeaseExpiresAt: new Date("2026-08-01T16:01:00.000Z"),
        syncLeaseId: "lease_test",
        syncStatus: "syncing"
      })
    }),
    failLease: vi.fn().mockResolvedValue(control({ syncStatus: "failed" })),
    finalizeLease: vi.fn().mockResolvedValue(
      control({
        currentItemsCount: 1,
        currentSnapshotPath: "public-catalog/v1/snapshots/revision-1.json",
        desiredRevision: 1,
        publishedRevision: 1,
        syncStatus: "ready"
      })
    ),
    listSnapshotSites: vi.fn().mockResolvedValue([siteRecord]),
    readSettings: vi.fn().mockResolvedValue({ showDemoInModal: true })
  };
}

function createStorage(): PublicCatalogSnapshotStorage & { operations: string[] } {
  const operations: string[] = [];
  const uploaded = new Map<string, string>();

  return {
    operations,
    fetchText: vi.fn(async (input) => {
      operations.push(`fetch:${input.path}:${input.cacheBust}`);
      const text = uploaded.get(input.path);
      if (text === undefined) {
        throw new Error(`missing ${input.path}`);
      }
      return text;
    }),
    getPublicUrl: vi.fn((path) => {
      return `https://storage.example.test/storage/v1/object/public/web00-public-catalog/${path}`;
    }),
    uploadJson: vi.fn(async (input) => {
      operations.push(`upload:${input.path}:${input.upsert}`);
      uploaded.set(input.path, input.body);
    })
  };
}

function createStorageBucket(
  operations: string[] = []
): Pick<PublicCatalogStorageBucketManager, "ensureReady"> {
  return {
    ensureReady: vi.fn(async () => {
      operations.push("bucket_ensure");
      return { status: "ready" as const };
    })
  };
}

type PublicCatalogSyncServiceOptionsForTest =
  Omit<PublicCatalogSyncServiceOptions, "bucketManager"> & {
    bucketManager?: Pick<PublicCatalogStorageBucketManager, "ensureReady">;
    imageUrlPolicy?: ManagedImageUrlPolicy;
    storage: PublicCatalogSnapshotStorage & { operations?: string[] };
  };

function createPublicCatalogSyncService(options: PublicCatalogSyncServiceOptionsForTest) {
  const { bucketManager, imageUrlPolicy: _imageUrlPolicy, ...serviceOptions } = options;

  return createPublicCatalogSyncServiceBase({
    ...serviceOptions,
    bucketManager: bucketManager ?? createStorageBucket(options.storage.operations)
  });
}

type FailedSyncStage =
  | "bucket_ensure"
  | "lease"
  | "settings"
  | "projection"
  | "snapshot_build"
  | "snapshot_upload"
  | "snapshot_verify"
  | "manifest_upload"
  | "manifest_verify"
  | "db_finalize";

function secretBearingError(): Error {
  return new Error(
    "provider body postgres://user:password@db.example/render?token=secret storage/v1/object"
  );
}

function expectSafeStageLog(input: {
  logger: { log: ReturnType<typeof vi.fn> };
  requestId: string;
  revision: number | null;
  stage: FailedSyncStage;
}): void {
  expect(input.logger.log).toHaveBeenCalledTimes(1);
  const entry = input.logger.log.mock.calls[0]?.[0] as Record<string, unknown>;

  expect(Object.keys(entry).sort()).toEqual([
    "durationMs",
    "errorClass",
    "errorCode",
    "requestId",
    "revision",
    "stage"
  ]);
  expect(entry).toMatchObject({
    durationMs: expect.any(Number),
    errorClass: expect.any(String),
    errorCode: expect.any(String),
    requestId: input.requestId,
    revision: input.revision,
    stage: input.stage
  });
  expect(Number.isFinite(entry.durationMs)).toBe(true);
  expect(entry.durationMs as number).toBeGreaterThanOrEqual(0);
}

describe("public catalog sync service", () => {
  it("returns pending without storage writes when no sync lease is available", async () => {
    const repository = createRepository();
    vi.mocked(repository.acquireLease).mockResolvedValueOnce(null);
    const storage = createStorage();
    const service = createPublicCatalogSyncService({
      createLeaseId: () => "lease_missing_table",
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_pending" });

    expect(result).toEqual({
      desiredRevision: 0,
      publishedRevision: 0,
      requestId: "req_pending",
      status: "pending"
    });
    expect(storage.operations).toEqual([]);
    expect(repository.finalizeLease).not.toHaveBeenCalled();
    expect(repository.failLease).not.toHaveBeenCalled();
  });

  it("publishes version then manifest and finalizes only after verification", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const bucketManager = createStorageBucket(storage.operations);
    const service = createPublicCatalogSyncService({
      bucketManager,
      createLeaseId: () => "lease_test",
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_sync" });

    expect(result).toMatchObject({
      itemsCount: 1,
      publishedRevision: 1,
      status: "ready"
    });
    expect(storage.operations).toEqual([
      "bucket_ensure",
      "upload:public-catalog/v1/snapshots/revision-1.json:false",
      "fetch:public-catalog/v1/snapshots/revision-1.json:false",
      "upload:public-catalog/v1/manifest.json:true",
      "fetch:public-catalog/v1/manifest.json:true"
    ]);
    expect(bucketManager.ensureReady).toHaveBeenCalledTimes(1);
    expect(bucketManager.ensureReady).toHaveBeenCalledWith({ requestId: "req_sync" });
    expect(repository.finalizeLease).toHaveBeenCalledWith(
      expect.objectContaining({
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        itemsCount: 1,
        leaseId: "lease_test",
        publishedRevision: 1,
        requestId: "req_sync",
        snapshotPath: "public-catalog/v1/snapshots/revision-1.json"
      })
    );
    expect(repository.failLease).not.toHaveBeenCalled();
  });

  it("continues publication when bucket ensure creates the bucket", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const bucketManager = {
      ensureReady: vi.fn(async () => {
        storage.operations.push("bucket_ensure:created");
        return { status: "created" as const };
      })
    };
    const service = createPublicCatalogSyncService({
      bucketManager,
      createLeaseId: () => "lease_bucket_created",
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_bucket_created" });

    expect(result).toMatchObject({
      itemsCount: 1,
      publishedRevision: 1,
      status: "ready"
    });
    expect(bucketManager.ensureReady).toHaveBeenCalledTimes(1);
    expect(storage.operations).toEqual([
      "bucket_ensure:created",
      "upload:public-catalog/v1/snapshots/revision-1.json:false",
      "fetch:public-catalog/v1/snapshots/revision-1.json:false",
      "upload:public-catalog/v1/manifest.json:true",
      "fetch:public-catalog/v1/manifest.json:true"
    ]);
    expect(repository.failLease).not.toHaveBeenCalled();
  });

  it("keeps sync on the storage upload, fetch, and public URL contract", async () => {
    const repository = createRepository();
    const storage = createStorage();
    storage.getPublicUrl = vi.fn(storage.getPublicUrl);
    const service = createPublicCatalogSyncService({
      createLeaseId: () => "lease_storage_contract",
      now: () => now,
      repository,
      storage
    });

    await service.syncOnce({ requestId: "req_storage_contract" });

    expect(storage.uploadJson).toHaveBeenCalledTimes(2);
    expect(storage.fetchText).toHaveBeenCalledTimes(2);
    expect(storage.getPublicUrl).toHaveBeenCalledWith(
      "public-catalog/v1/snapshots/revision-1.json"
    );
  });

  it("uses the shared pure preparation result inside snapshot_build", async () => {
    const direct = await preparePublicCatalogSnapshotCandidate({
      generatedAt: now,
      records: [siteRecord],
      revision: 1,
      settings: { showDemoInModal: true }
    });

    expect(direct.status).toBe("ready");
    if (direct.status !== "ready") {
      throw new Error("Expected shared preparation to be ready.");
    }

    const repository = createRepository();
    const storage = createStorage();
    const service = createPublicCatalogSyncService({
      createLeaseId: () => "lease_shared_preparation",
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_shared_preparation" });

    expect(result).toMatchObject({
      checksum: direct.built.sha256,
      itemsCount: direct.itemsCount,
      status: "ready"
    });
  });

  it("preserves pre-AP0 no-policy snapshot bytes even if a managed policy is present", async () => {
    const imageUrlPolicy = createManagedImageUrlPolicyFixture();
    const managedRecord = createManagedSiteRecord();
    const direct = await buildPublicCatalogSnapshot({
      generatedAt: now,
      items: [mapSiteToPublicCatalogItem(managedRecord)],
      revision: 1,
      settings: { showDemoInModal: true }
    });

    const repository = createRepository();
    vi.mocked(repository.listSnapshotSites).mockResolvedValue([managedRecord]);
    const storage = createStorage();
    const service = createPublicCatalogSyncService({
      createLeaseId: () => "lease_managed_preparation",
      imageUrlPolicy,
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_managed_preparation" });
    const snapshotUpload = vi.mocked(storage.uploadJson).mock.calls.find(
      ([input]) => input.path === "public-catalog/v1/snapshots/revision-1.json"
    )?.[0];

    expect(result).toMatchObject({
      checksum: direct.sha256,
      itemsCount: direct.snapshot.itemsCount,
      status: "ready"
    });
    expect(snapshotUpload?.body).toBe(direct.bytes);
    expect(snapshotUpload?.body).not.toContain("\"variants\"");
    expect(snapshotUpload?.body).not.toContain("\"previewImage\":{\"assetId\"");
  });

  it("does not ensure the bucket when snapshot build is blocked", async () => {
    const repository = createRepository();
    vi.mocked(repository.listSnapshotSites).mockResolvedValueOnce([
      { ...siteRecord, slug: "" }
    ]);
    const storage = createStorage();
    const bucketManager = createStorageBucket(storage.operations);
    const service = createPublicCatalogSyncService({
      bucketManager,
      createLeaseId: () => "lease_build_blocked",
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_build_blocked" });

    expect(result).toMatchObject({
      errorCode: "PUBLIC_CATALOG_SYNC_FAILED",
      publishedRevision: 0,
      status: "failed"
    });
    expect(bucketManager.ensureReady).not.toHaveBeenCalled();
    expect(storage.operations).toEqual([]);
    expect(storage.uploadJson).not.toHaveBeenCalled();
    expect(repository.finalizeLease).not.toHaveBeenCalled();
  });

  it("runs one bounded second pass when dirty state remains pending after finalize", async () => {
    const repository = createRepository();
    vi.mocked(repository.acquireLease)
      .mockResolvedValueOnce({
        leaseId: "lease_first",
        revision: 1,
        state: control({
          desiredRevision: 2,
          publishedRevision: 0,
          syncLeaseExpiresAt: new Date("2026-08-01T16:01:00.000Z"),
          syncLeaseId: "lease_first",
          syncStatus: "syncing"
        })
      })
      .mockResolvedValueOnce({
        leaseId: "lease_second",
        revision: 2,
        state: control({
          desiredRevision: 2,
          publishedRevision: 1,
          syncLeaseExpiresAt: new Date("2026-08-01T16:01:00.000Z"),
          syncLeaseId: "lease_second",
          syncStatus: "syncing"
        })
      });
    vi.mocked(repository.finalizeLease)
      .mockResolvedValueOnce(
        control({
          desiredRevision: 2,
          publishedRevision: 1,
          syncStatus: "pending"
        })
      )
      .mockResolvedValueOnce(
        control({
          currentItemsCount: 1,
          currentSnapshotPath: "public-catalog/v1/snapshots/revision-2.json",
          desiredRevision: 2,
          publishedRevision: 2,
          syncStatus: "ready"
        })
      );
    const storage = createStorage();
    const leaseIds = ["lease_first", "lease_second"];
    const service = createPublicCatalogSyncService({
      createLeaseId: () => leaseIds.shift() ?? "unexpected_lease",
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_dirty_during_sync" });

    expect(result).toMatchObject({
      publishedRevision: 2,
      status: "ready"
    });
    expect(repository.acquireLease).toHaveBeenCalledTimes(2);
    expect(storage.operations).toEqual([
      "bucket_ensure",
      "upload:public-catalog/v1/snapshots/revision-1.json:false",
      "fetch:public-catalog/v1/snapshots/revision-1.json:false",
      "upload:public-catalog/v1/manifest.json:true",
      "fetch:public-catalog/v1/manifest.json:true",
      "bucket_ensure",
      "upload:public-catalog/v1/snapshots/revision-2.json:false",
      "fetch:public-catalog/v1/snapshots/revision-2.json:false",
      "upload:public-catalog/v1/manifest.json:true",
      "fetch:public-catalog/v1/manifest.json:true"
    ]);
    expect(repository.failLease).not.toHaveBeenCalled();
  });

  it("does not finalize DB state when manifest upload fails", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const originalUpload = storage.uploadJson.bind(storage);
    storage.uploadJson = vi.fn(async (input) => {
      if (input.path === "public-catalog/v1/manifest.json") {
        throw new Error("manifest unavailable raw provider body");
      }
      await originalUpload(input);
    });
    const service = createPublicCatalogSyncService({
      createLeaseId: () => "lease_test",
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_failed" });

    expect(result).toMatchObject({
      errorCode: "PUBLIC_CATALOG_SYNC_FAILED",
      publishedRevision: 0,
      status: "failed"
    });
    expect(repository.finalizeLease).not.toHaveBeenCalled();
    expect(repository.failLease).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "PUBLIC_CATALOG_SYNC_FAILED",
        leaseId: "lease_test",
        requestId: "req_failed"
      })
    );
    expect(JSON.stringify(result)).not.toContain("manifest unavailable raw provider body");
  });

  it("preserves storage configuration invalid instead of collapsing it to generic sync failed", async () => {
    const repository = createRepository();
    vi.mocked(repository.acquireLease).mockResolvedValueOnce({
      leaseId: "lease_config_invalid",
      revision: 1,
      state: control({
        syncLeaseExpiresAt: new Date("2026-08-01T16:01:00.000Z"),
        syncLeaseId: "lease_config_invalid",
        syncStatus: "syncing"
      })
    });
    const storage = createStorage();
    storage.getPublicUrl = vi.fn(() => {
      throw new AppError({
        code: "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID",
        message: "Storage public origin is invalid and must not leak.",
        statusCode: 503
      });
    });
    const logger = { log: vi.fn() };
    const service = createPublicCatalogSyncService({
      createLeaseId: () => "lease_config_invalid",
      logger,
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_config_invalid" });

    expect(result).toMatchObject({
      errorCode: "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID",
      publishedRevision: 0,
      requestId: "req_config_invalid",
      status: "failed"
    });
    expect(repository.failLease).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID",
        leaseId: "lease_config_invalid",
        requestId: "req_config_invalid"
      })
    );
    expectSafeStageLog({
      logger,
      requestId: "req_config_invalid",
      revision: 1,
      stage: "manifest_upload"
    });
  });

  it("stops before snapshot upload when bucket ensure reports storage unavailable", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const logger = { log: vi.fn() };
    const bucketManager = {
      ensureReady: vi.fn(async () => {
        throw new AppError({
          code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
          message: "Public catalog storage is unavailable.",
          statusCode: 503
        });
      })
    };
    const service = createPublicCatalogSyncService({
      bucketManager,
      createLeaseId: () => "lease_bucket_unavailable",
      logger,
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_bucket_unavailable" });

    expect(result).toMatchObject({
      errorCode: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
      publishedRevision: 0,
      requestId: "req_bucket_unavailable",
      status: "failed"
    });
    expect(storage.uploadJson).not.toHaveBeenCalled();
    expect(storage.fetchText).not.toHaveBeenCalled();
    expect(repository.finalizeLease).not.toHaveBeenCalled();
    expect(repository.failLease).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
        requestId: "req_bucket_unavailable"
      })
    );
    expectSafeStageLog({
      logger,
      requestId: "req_bucket_unavailable",
      revision: 1,
      stage: "bucket_ensure"
    });
  });

  it("stops before snapshot upload when bucket ensure reports configuration invalid", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const logger = { log: vi.fn() };
    const storageBucket = {
      ensureReady: vi.fn(async () => {
        throw new AppError({
          code: "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID",
          message: "Public catalog storage configuration is invalid.",
          statusCode: 503
        });
      })
    };
    const service = createPublicCatalogSyncService({
      bucketManager: storageBucket,
      createLeaseId: () => "lease_bucket_invalid",
      logger,
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_bucket_invalid" });

    expect(result).toMatchObject({
      errorCode: "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID",
      publishedRevision: 0,
      requestId: "req_bucket_invalid",
      status: "failed"
    });
    expect(storageBucket.ensureReady).toHaveBeenCalledWith({
      requestId: "req_bucket_invalid"
    });
    expect(storage.uploadJson).not.toHaveBeenCalled();
    expect(storage.fetchText).not.toHaveBeenCalled();
    expect(repository.finalizeLease).not.toHaveBeenCalled();
    expect(repository.failLease).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID",
        leaseId: "lease_test",
        requestId: "req_bucket_invalid"
      })
    );
    expectSafeStageLog({
      logger,
      requestId: "req_bucket_invalid",
      revision: 1,
      stage: "bucket_ensure"
    });
  });

  it("keeps unknown provider errors generic and excludes secrets from diagnostics", async () => {
    const repository = createRepository();
    vi.mocked(repository.acquireLease).mockResolvedValueOnce({
      leaseId: "lease_unknown",
      revision: 1,
      state: control({
        syncLeaseExpiresAt: new Date("2026-08-01T16:01:00.000Z"),
        syncLeaseId: "lease_unknown",
        syncStatus: "syncing"
      })
    });
    const storage = createStorage();
    const originalUpload = storage.uploadJson.bind(storage);
    storage.uploadJson = vi.fn(async (input) => {
      if (input.path === "public-catalog/v1/manifest.json") {
        throw secretBearingError();
      }
      await originalUpload(input);
    });
    const logger = { log: vi.fn() };
    const service = createPublicCatalogSyncService({
      createLeaseId: () => "lease_unknown",
      logger,
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_unknown" });

    expect(result).toMatchObject({
      errorCode: "PUBLIC_CATALOG_SYNC_FAILED",
      publishedRevision: 0,
      requestId: "req_unknown",
      status: "failed"
    });
    expect(repository.failLease).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "PUBLIC_CATALOG_SYNC_FAILED",
        leaseId: "lease_unknown",
        requestId: "req_unknown"
      })
    );
    expectSafeStageLog({
      logger,
      requestId: "req_unknown",
      revision: 1,
      stage: "manifest_upload"
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(
      /postgres:\/\/|password|token|secret|storage\/v1|provider body/i
    );
  });

  it.each([
    "lease",
    "settings",
    "projection",
    "snapshot_build",
    "bucket_ensure",
    "snapshot_upload",
    "snapshot_verify",
    "manifest_upload",
    "manifest_verify",
    "db_finalize"
  ] as const)("logs a safe diagnostic event when %s fails", async (stage) => {
    const repository = createRepository();
    const storage = createStorage();
    const storageBucket = createStorageBucket(storage.operations);
    const logger = { log: vi.fn() };
    const requestId = `req_stage_${stage}`;
    const failure = secretBearingError();

    if (stage === "lease") {
      vi.mocked(repository.acquireLease).mockRejectedValueOnce(failure);
    } else {
      vi.mocked(repository.acquireLease).mockResolvedValueOnce({
        leaseId: "lease_stage",
        revision: 1,
        state: control({
          syncLeaseExpiresAt: new Date("2026-08-01T16:01:00.000Z"),
          syncLeaseId: "lease_stage",
          syncStatus: "syncing"
        })
      });
    }

    if (stage === "settings") {
      vi.mocked(repository.readSettings).mockRejectedValueOnce(failure);
    } else if (stage === "projection") {
      vi.mocked(repository.listSnapshotSites).mockRejectedValueOnce(failure);
    } else if (stage === "snapshot_build") {
      vi.mocked(repository.listSnapshotSites).mockResolvedValueOnce([
        { ...siteRecord, slug: "" }
      ]);
    } else if (stage === "bucket_ensure") {
      vi.mocked(storageBucket.ensureReady).mockRejectedValueOnce(failure);
    } else if (stage === "snapshot_upload") {
      storage.uploadJson = vi.fn(async (input) => {
        if (input.path.endsWith("/revision-1.json")) {
          throw failure;
        }
      });
    } else if (stage === "snapshot_verify") {
      storage.fetchText = vi.fn(async (input) => {
        if (input.path.endsWith("/revision-1.json")) {
          throw failure;
        }
        return "{\"schemaVersion\":1}\n";
      });
    } else if (stage === "manifest_upload") {
      const originalUpload = storage.uploadJson.bind(storage);
      storage.uploadJson = vi.fn(async (input) => {
        if (input.path === "public-catalog/v1/manifest.json") {
          throw failure;
        }
        await originalUpload(input);
      });
    } else if (stage === "manifest_verify") {
      const originalFetch = storage.fetchText.bind(storage);
      storage.fetchText = vi.fn(async (input) => {
        if (input.path === "public-catalog/v1/manifest.json") {
          throw failure;
        }
        return originalFetch(input);
      });
    } else if (stage === "db_finalize") {
      vi.mocked(repository.finalizeLease).mockRejectedValueOnce(failure);
    }

    const service = createPublicCatalogSyncService({
      bucketManager: storageBucket,
      createLeaseId: () => "lease_stage",
      logger,
      now: () => now,
      repository,
      storage
    });

    if (stage === "lease") {
      await expect(service.syncOnce({ requestId })).rejects.toThrow(/provider body/);
      expect(repository.failLease).not.toHaveBeenCalled();
    } else {
      const result = await service.syncOnce({ requestId });

      expect(result).toMatchObject({
        errorCode: "PUBLIC_CATALOG_SYNC_FAILED",
        requestId,
        status: "failed"
      });
      expect(repository.failLease).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: "PUBLIC_CATALOG_SYNC_FAILED",
          leaseId: "lease_stage",
          requestId
        })
      );
    }

    expectSafeStageLog({
      logger,
      requestId,
      revision: stage === "lease" ? null : 1,
      stage
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(
      /postgres:\/\/|password|token|secret|storage\/v1|provider body/i
    );
  });

  it("enqueues stale immutable versions after a verified manifest while preserving current and previous 19", async () => {
    const repository = createRepository();
    vi.mocked(repository.acquireLease).mockResolvedValueOnce({
      leaseId: "lease_retention",
      revision: 21,
      state: control({
        desiredRevision: 21,
        publishedRevision: 20,
        syncLeaseExpiresAt: new Date("2026-08-01T16:01:00.000Z"),
        syncLeaseId: "lease_retention",
        syncStatus: "syncing"
      })
    });
    const storage = createStorage();
    const cleanup = {
      createJobs: vi.fn().mockResolvedValue(undefined)
    };
    const service = createPublicCatalogSyncService({
      cleanup,
      createLeaseId: () => "lease_retention",
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_retention" });

    expect(result).toMatchObject({
      publishedRevision: 21,
      status: "ready"
    });
    expect(cleanup.createJobs).toHaveBeenCalledWith([
      {
        entityId: "1",
        entityType: "public_catalog_snapshot",
        reason: "public_catalog_retention",
        runAfter: now,
        storagePath: "public-catalog/v1/snapshots/revision-1.json"
      }
    ], { timeoutMs: 15_000 });
    expect(repository.failLease).not.toHaveBeenCalled();
  });

  it("does not fail a verified sync when stale snapshot cleanup enqueue fails", async () => {
    const repository = createRepository();
    vi.mocked(repository.acquireLease).mockResolvedValueOnce({
      leaseId: "lease_cleanup_failed",
      revision: 21,
      state: control({
        desiredRevision: 21,
        publishedRevision: 20,
        syncLeaseExpiresAt: new Date("2026-08-01T16:01:00.000Z"),
        syncLeaseId: "lease_cleanup_failed",
        syncStatus: "syncing"
      })
    });
    const storage = createStorage();
    const cleanup = {
      createJobs: vi.fn().mockRejectedValue(new Error("cleanup table temporarily unavailable"))
    };
    const service = createPublicCatalogSyncService({
      cleanup,
      createLeaseId: () => "lease_cleanup_failed",
      now: () => now,
      repository,
      storage
    });

    const result = await service.syncOnce({ requestId: "req_cleanup_failed" });

    expect(result).toMatchObject({
      publishedRevision: 21,
      status: "ready"
    });
    expect(repository.finalizeLease).toHaveBeenCalledWith(
      expect.objectContaining({
        leaseId: "lease_cleanup_failed",
        publishedRevision: 21
      })
    );
    expect(repository.failLease).not.toHaveBeenCalled();
  });
});

function createManagedSiteRecord(): PublicSiteRecord {
  return {
    ...siteRecord,
    galleryImages: [
      {
        alt: "",
        assetId: "00000000-0000-4000-8000-000000000902",
        sortOrder: 0,
        storagePath:
          "sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/gallery/00000000-0000-4000-8000-000000000902.webp",
        url:
          "https://cdn.example.test/sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/gallery/00000000-0000-4000-8000-000000000902.webp"
      }
    ],
    previewImageUrl:
      "https://cdn.example.test/sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/preview/00000000-0000-4000-8000-000000000901.webp"
  };
}

function createManagedImageUrlPolicyFixture(): ManagedImageUrlPolicy {
  return {
    buildVariants: (input) =>
      input.widths.map((width) => ({
        avifUrl: `https://cdn.example.test/variants/${input.assetId}-${width}.avif`,
        webpUrl: `https://cdn.example.test/variants/${input.assetId}-${width}.webp`,
        width
      })),
    parseManagedGallery: (siteId, url) =>
      siteId === "3c205371-b407-4d27-8e5c-0dd2a3be8092" &&
      url ===
        "https://cdn.example.test/sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/gallery/00000000-0000-4000-8000-000000000902.webp"
        ? {
            assetId: "00000000-0000-4000-8000-000000000902",
            siteId,
            slot: "gallery",
            storagePath:
              "sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/gallery/00000000-0000-4000-8000-000000000902.webp",
            url,
            widths: [320, 640]
          }
        : null,
    parseManagedPreview: (siteId, url) =>
      siteId === "3c205371-b407-4d27-8e5c-0dd2a3be8092" &&
      url ===
        "https://cdn.example.test/sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/preview/00000000-0000-4000-8000-000000000901.webp"
        ? {
            assetId: "00000000-0000-4000-8000-000000000901",
            siteId,
            slot: "preview",
            storagePath:
              "sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/preview/00000000-0000-4000-8000-000000000901.webp",
            url,
            widths: [320, 640]
          }
        : null
  };
}
