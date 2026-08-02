import { describe, expect, it, vi } from "vitest";
import {
  createPublicCatalogSyncService,
  type PublicCatalogSyncRepository
} from "../src/modules/public-catalog/public-catalog-sync.service.js";
import {
  PUBLIC_CATALOG_CONTROL_ID,
  type PublicCatalogControlState
} from "../src/modules/public-catalog/public-catalog-control.repository.js";
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
    async fetchText(input) {
      operations.push(`fetch:${input.path}:${input.cacheBust}`);
      const text = uploaded.get(input.path);
      if (text === undefined) {
        throw new Error(`missing ${input.path}`);
      }
      return text;
    },
    getPublicUrl(path) {
      return `https://storage.example.test/storage/v1/object/public/web00-catalog-images/${path}`;
    },
    async uploadJson(input) {
      operations.push(`upload:${input.path}:${input.upsert}`);
      uploaded.set(input.path, input.body);
    }
  };
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
    const service = createPublicCatalogSyncService({
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
      "upload:public-catalog/v1/snapshots/revision-1.json:false",
      "fetch:public-catalog/v1/snapshots/revision-1.json:false",
      "upload:public-catalog/v1/manifest.json:true",
      "fetch:public-catalog/v1/manifest.json:true"
    ]);
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
