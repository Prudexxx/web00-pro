import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  PUBLIC_CATALOG_CONTROL_ID,
  type PublicCatalogControlState
} from "../src/modules/public-catalog/public-catalog-control.repository.js";
import {
  createPublicCatalogSyncService,
  type PublicCatalogSyncRepository
} from "../src/modules/public-catalog/public-catalog-sync.service.js";
import {
  createPublicRuntimeTargetKey,
  type PublicRuntimeTargetConfig
} from "../src/modules/public-catalog/public-runtime-target.js";
import type { PublicRuntimeStorage, RuntimeReadResult } from "../src/modules/public-catalog/public-runtime-storage.js";
import type { PublicSiteRecord } from "../src/modules/public-catalog/public-catalog.types.js";

const now = new Date("2026-08-07T12:00:00.000Z");
const snapshotShaRe = /^[a-f0-9]{64}$/;

const siteRecord = {
  category: { slug: "goods", title: "Goods" },
  deliveryLabel: null,
  demoMode: null,
  demoUrl: "https://example.test/demo",
  developmentDays: null,
  featured: false,
  features: ["Fast"],
  fullDescription: "Full",
  galleryImages: [],
  id: "33333333-3333-4333-8333-333333333333",
  previewImageUrl: "https://example.test/preview.webp",
  previewType: "image",
  priceAmountCents: null,
  priceLabel: null,
  publishedAt: new Date("2026-08-07T11:00:00.000Z"),
  shortDescription: "Short",
  siteUrl: "https://example.test/site",
  slug: "site-one",
  tags: ["tag"],
  title: "Site One"
} satisfies PublicSiteRecord;

function control(overrides: Partial<PublicCatalogControlState> = {}): PublicCatalogControlState {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotGeneratedAt: null,
    currentSnapshotPath: null,
    desiredRevision: 1,
    id: PUBLIC_CATALOG_CONTROL_ID,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 0,
    publishedRuntimeTargetKey: null,
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "pending",
    ...overrides
  };
}

function createRepository(overrides: Partial<PublicCatalogSyncRepository> = {}): PublicCatalogSyncRepository {
  return {
    acquireLease: vi.fn().mockResolvedValue({
      leaseId: "lease-1",
      revision: 1,
      state: control({ syncLeaseId: "lease-1", syncStatus: "syncing" })
    }),
    failLease: vi.fn().mockResolvedValue(control({ lastSyncErrorCode: "PUBLIC_CATALOG_SYNC_FAILED", syncStatus: "failed" })),
    finalizeLease: vi.fn().mockImplementation(async (input) => control({
      currentItemsCount: input.itemsCount,
      currentSnapshotChecksum: input.checksum,
      currentSnapshotGeneratedAt: input.generatedAt,
      currentSnapshotPath: input.snapshotPath,
      desiredRevision: input.publishedRevision,
      publishedRevision: input.publishedRevision,
      publishedRuntimeTargetKey: input.publishedRuntimeTargetKey,
      syncStatus: "ready"
    })),
    listSnapshotSites: vi.fn().mockResolvedValue([siteRecord]),
    readCurrentState: vi.fn().mockResolvedValue(control()),
    readSettings: vi.fn().mockResolvedValue({ showDemoInModal: false }),
    verifyLeaseOwnership: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

function createStorage(): PublicRuntimeStorage & { operations: string[]; objects: Map<string, Buffer> } {
  const operations: string[] = [];
  const objects = new Map<string, Buffer>();
  const read = (path: string): RuntimeReadResult => {
    const body = objects.get(path);
    if (body === undefined) throw new Error(`missing ${path}`);
    return {
      body,
      cacheControl: path.endsWith("manifest.json") ? "no-store, no-cache, must-revalidate, max-age=0" : "public, max-age=31536000, immutable",
      contentType: "application/json; charset=utf-8"
    };
  };

  return {
    objects,
    operations,
    getAuthenticatedObject: vi.fn(async ({ path }) => {
      operations.push(`auth:${path}`);
      return read(path);
    }),
    getPublicObject: vi.fn(async ({ addNonce, path }) => {
      operations.push(`public:${path}:${addNonce === true}`);
      return read(path);
    }),
    getPublicUrl(path) {
      return `https://web00-public-runtime.s3-website.cloud.ru/${path}`;
    },
    putImmutableObject: vi.fn(async ({ body, path }) => {
      operations.push(`put-snapshot:${path}`);
      objects.set(path, Buffer.from(body));
      return { versionId: `version-${path}` };
    }),
    putMutableManifest: vi.fn(async ({ body, path }) => {
      operations.push(`put-manifest:${path}`);
      objects.set(path, Buffer.from(body));
      return { versionId: "manifest-version" };
    })
  };
}

function storedSnapshot(options: {
  generatedAt?: string;
  revision: number;
  showDemoInModal?: boolean;
}): { body: Buffer; sha256: string } {
  const body = Buffer.from(JSON.stringify({
    generatedAt: options.generatedAt ?? "2026-08-07T12:00:00.000Z",
    items: [],
    itemsCount: 0,
    revision: options.revision,
    schemaVersion: 1,
    settings: { showDemoInModal: options.showDemoInModal ?? false }
  }) + "\n", "utf8");
  return {
    body,
    sha256: createHash("sha256").update(body).digest("hex")
  };
}

function storedManifest(options: {
  generatedAt?: string;
  itemsCount?: number;
  revision: number;
  sha256: string;
  snapshotPath: string;
  snapshotUrl?: string;
}): Buffer {
  return Buffer.from(JSON.stringify({
    generatedAt: options.generatedAt ?? "2026-08-07T12:00:00.000Z",
    itemsCount: options.itemsCount ?? 0,
    revision: options.revision,
    schemaVersion: 1,
    sha256: options.sha256,
    snapshotPath: options.snapshotPath,
    snapshotUrl: options.snapshotUrl ?? `https://web00-public-runtime.s3-website.cloud.ru/${options.snapshotPath}`
  }) + "\n", "utf8");
}

describe("public catalog sync service manifest-last protocol", () => {
  it("writes snapshot before manifest and finalizes only after authenticated and public read-back", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const service = createPublicCatalogSyncService({
      createLeaseId: () => "lease-1",
      now: () => now,
      pathPrefix: "",
      repository,
      storage,
      target: runtimeTargetFixture("")
    });

    const result = await service.syncOnce({ requestId: "req-sync" });
    const operations = storage.operations.map((operation) =>
      operation.replace(/revision-1-[a-f0-9]{64}\.json/g, "revision-1-<sha>.json")
    );

    expect(result).toMatchObject({
      itemsCount: 1,
      publishedRevision: 1,
      status: "ready"
    });
    expect(operations).toEqual([
      "public:catalog/v1/manifest.json:true",
      "put-snapshot:catalog/v1/releases/revision-1-<sha>.json",
      "auth:catalog/v1/releases/revision-1-<sha>.json",
      "public:catalog/v1/releases/revision-1-<sha>.json:true",
      "put-manifest:catalog/v1/manifest.json",
      "public:catalog/v1/manifest.json:true"
    ]);
    expect(operations.indexOf("put-snapshot:catalog/v1/releases/revision-1-<sha>.json")).toBeLessThan(
      operations.indexOf("put-manifest:catalog/v1/manifest.json")
    );
    expect(repository.finalizeLease).toHaveBeenCalledWith(expect.objectContaining({
      checksum: expect.stringMatching(snapshotShaRe),
      itemsCount: 1,
      leaseId: "lease-1",
      publishedRevision: 1,
      requestId: "req-sync",
      snapshotPath: expect.stringMatching(/^catalog\/v1\/releases\/revision-1-[a-f0-9]{64}\.json$/)
    }));
  });

  it("prevents manifest publication and DB finalize when authenticated snapshot SHA mismatches", async () => {
    const repository = createRepository();
    const storage = createStorage();
    vi.mocked(storage.getAuthenticatedObject).mockImplementationOnce(async ({ path }) => {
      storage.operations.push(`auth:${path}`);
      return {
        body: Buffer.from("{\"schemaVersion\":1,\"tampered\":true}\n", "utf8"),
        contentType: "application/json; charset=utf-8"
      };
    });
    const service = createPublicCatalogSyncService({
      now: () => now,
      repository,
      storage,
      target: runtimeTargetFixture("")
    });

    const result = await service.syncOnce({ requestId: "req-sha-mismatch" });

    expect(result).toMatchObject({
      errorCode: "PUBLIC_CATALOG_SNAPSHOT_INVALID",
      publishedRevision: 0,
      status: "failed"
    });
    expect(storage.operations.some((operation) => operation.startsWith("put-manifest:"))).toBe(false);
    expect(repository.finalizeLease).not.toHaveBeenCalled();
    expect(repository.failLease).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "PUBLIC_CATALOG_SNAPSHOT_INVALID",
      leaseId: "lease-1",
      requestId: "req-sha-mismatch"
    }));
  });

  it("uses durable settings from the repository when building snapshot bytes", async () => {
    const repository = createRepository({
      readSettings: vi.fn().mockResolvedValue({ showDemoInModal: true })
    });
    const storage = createStorage();
    const service = createPublicCatalogSyncService({
      now: () => now,
      repository,
      storage,
      target: runtimeTargetFixture("")
    });

    await service.syncOnce({ requestId: "req-settings-snapshot" });
    const snapshotPath = storage.operations
      .find((operation) => operation.startsWith("put-snapshot:"))
      ?.slice("put-snapshot:".length);
    if (snapshotPath === undefined) {
      throw new Error("Expected immutable snapshot write.");
    }
    const snapshot = JSON.parse(storage.objects.get(snapshotPath)!.toString("utf8"));

    expect(repository.readSettings).toHaveBeenCalledTimes(1);
    expect(snapshot.settings).toEqual({ showDemoInModal: true });
  });

  it("prevents finalize when public snapshot read-back fails", async () => {
    const repository = createRepository();
    const storage = createStorage();
    vi.mocked(storage.getPublicObject).mockImplementation(async ({ addNonce, path }) => {
      storage.operations.push(`public:${path}:true`);
      if (path.includes("/releases/")) {
        throw new Error("public network unavailable");
      }
      const body = storage.objects.get(path);
      if (body === undefined) throw new Error(`missing ${path}`);
      return {
        body,
        cacheControl: path.endsWith("manifest.json") ? "no-store, no-cache, must-revalidate, max-age=0" : "public, max-age=31536000, immutable",
        contentType: "application/json; charset=utf-8"
      };
    });
    const service = createPublicCatalogSyncService({
      now: () => now,
      repository,
      storage,
      target: runtimeTargetFixture("")
    });

    const result = await service.syncOnce({ requestId: "req-public-fail" });

    expect(result).toMatchObject({ status: "failed" });
    expect(storage.operations.some((operation) => operation.startsWith("put-manifest:"))).toBe(false);
    expect(repository.finalizeLease).not.toHaveBeenCalled();
  });

  it("does not write the mutable manifest after losing lease ownership before the manifest switch", async () => {
    const repository = {
      ...createRepository(),
      verifyLeaseOwnership: vi.fn().mockResolvedValue(false)
    };
    const storage = createStorage();
    const service = createPublicCatalogSyncService({
      createLeaseId: () => "lease-1",
      maxPasses: 1,
      now: () => now,
      repository,
      storage,
      target: runtimeTargetFixture("")
    });

    const result = await service.syncOnce({ requestId: "req-lost-lease-before-manifest" });

    expect(result).toMatchObject({
      publishedRevision: 0,
      status: "pending"
    });
    expect(storage.operations.some((operation) => operation.startsWith("put-snapshot:"))).toBe(true);
    expect(storage.operations.some((operation) => operation.startsWith("put-manifest:"))).toBe(false);
    expect(repository.finalizeLease).not.toHaveBeenCalled();
  });

  it("leaves the previous published revision authoritative when snapshot or manifest writes fail", async () => {
    const snapshotFailureStorage = createStorage();
    vi.mocked(snapshotFailureStorage.putImmutableObject).mockImplementationOnce(async ({ path }) => {
      snapshotFailureStorage.operations.push(`put-snapshot:${path}`);
      throw new Error("snapshot storage failed");
    });
    const snapshotFailureRepository = createRepository();
    const serviceA = createPublicCatalogSyncService({
      now: () => now,
      repository: snapshotFailureRepository,
      storage: snapshotFailureStorage,
      target: runtimeTargetFixture("")
    });

    const snapshotFailure = await serviceA.syncOnce({ requestId: "req-snapshot-fail" });

    expect(snapshotFailure).toMatchObject({ publishedRevision: 0, status: "failed" });
    expect(snapshotFailureStorage.operations.some((operation) => operation.startsWith("put-manifest:"))).toBe(false);
    expect(snapshotFailureRepository.finalizeLease).not.toHaveBeenCalled();

    const manifestFailureStorage = createStorage();
    vi.mocked(manifestFailureStorage.putMutableManifest).mockImplementationOnce(async ({ path }) => {
      manifestFailureStorage.operations.push(`put-manifest:${path}`);
      throw new Error("manifest storage failed");
    });
    const manifestFailureRepository = createRepository();
    const serviceB = createPublicCatalogSyncService({
      now: () => now,
      repository: manifestFailureRepository,
      storage: manifestFailureStorage,
      target: runtimeTargetFixture("")
    });

    const manifestFailure = await serviceB.syncOnce({ requestId: "req-manifest-fail" });

    expect(manifestFailure).toMatchObject({ publishedRevision: 0, status: "failed" });
    expect(manifestFailureRepository.finalizeLease).not.toHaveBeenCalled();
  });

  it("coalesces rapid edits and leaves pending when desired revision advances during sync", async () => {
    const repository = createRepository();
    vi.mocked(repository.acquireLease)
      .mockResolvedValueOnce({
        leaseId: "lease-1",
        revision: 1,
        state: control({ desiredRevision: 3, publishedRevision: 0, syncLeaseId: "lease-1", syncStatus: "syncing" })
      })
      .mockResolvedValueOnce({
        leaseId: "lease-2",
        revision: 2,
        state: control({ desiredRevision: 3, publishedRevision: 1, syncLeaseId: "lease-2", syncStatus: "syncing" })
      });
    vi.mocked(repository.finalizeLease)
      .mockResolvedValueOnce(control({ desiredRevision: 3, publishedRevision: 1, syncStatus: "pending" }))
      .mockResolvedValueOnce(control({ desiredRevision: 3, publishedRevision: 2, syncStatus: "pending" }));
    const storage = createStorage();
    const service = createPublicCatalogSyncService({
      createLeaseId: () => "lease-any",
      maxPasses: 2,
      now: () => now,
      repository,
      storage,
      target: runtimeTargetFixture("")
    });

    const result = await service.syncOnce({ requestId: "req-edit-edit" });

    expect(result).toEqual({
      desiredRevision: 3,
      publishedRevision: 2,
      requestId: "req-edit-edit",
      status: "pending"
    });
    expect(repository.acquireLease).toHaveBeenCalledTimes(2);
  });

  it("recovers crash after manifest switch before DB finalize by verifying public manifest and snapshot first", async () => {
    const storage = createStorage();
    const repository = createRepository();
    const snapshotBody = Buffer.from("{\"generatedAt\":\"2026-08-07T12:00:00.000Z\",\"items\":[],\"itemsCount\":0,\"revision\":1,\"schemaVersion\":1,\"settings\":{\"showDemoInModal\":false}}\n", "utf8");
    const sha256 = createHash("sha256").update(snapshotBody).digest("hex");
    const snapshotPath = `catalog/v1/releases/revision-1-${sha256}.json`;
    const manifestBody = Buffer.from(JSON.stringify({
      generatedAt: "2026-08-07T12:00:00.000Z",
      itemsCount: 0,
      revision: 1,
      schemaVersion: 1,
      sha256,
      snapshotPath,
      snapshotUrl: `https://web00-public-runtime.s3-website.cloud.ru/${snapshotPath}`
    }) + "\n", "utf8");
    storage.objects.set("catalog/v1/manifest.json", manifestBody);
    storage.objects.set(snapshotPath, snapshotBody);
    vi.mocked(repository.listSnapshotSites).mockResolvedValueOnce([]);
    const service = createPublicCatalogSyncService({
      now: () => now,
      repository,
      storage,
      target: runtimeTargetFixture("")
    });

    const result = await service.syncOnce({ requestId: "req-recover-manifest" });

    expect(result).toMatchObject({
      itemsCount: 0,
      publishedRevision: 1,
      status: "ready"
    });
    expect(storage.operations).toEqual([
      "public:catalog/v1/manifest.json:true",
      `public:${snapshotPath}:true`
    ]);
    expect(repository.finalizeLease).toHaveBeenCalledWith(expect.objectContaining({
      checksum: sha256,
      itemsCount: 0,
      publishedRevision: 1,
      snapshotPath
    }));
  });

  it("recovers a prefixed manifest switch by reading only the canonical prefixed manifest path", async () => {
    const storage = createStorage();
    const repository = createRepository();
    const snapshot = storedSnapshot({ revision: 1 });
    const snapshotPath = `canary/shadow/catalog/v1/releases/revision-1-${snapshot.sha256}.json`;
    const manifestPath = "canary/shadow/catalog/v1/manifest.json";
    storage.objects.set(manifestPath, storedManifest({
      revision: 1,
      sha256: snapshot.sha256,
      snapshotPath
    }));
    storage.objects.set(snapshotPath, snapshot.body);
    const service = createPublicCatalogSyncService({
      now: () => now,
      pathPrefix: "canary/shadow",
      repository,
      storage,
      target: runtimeTargetFixture("canary/shadow")
    });

    const result = await service.syncOnce({ requestId: "req-prefixed-recover" });

    expect(result).toMatchObject({
      itemsCount: 0,
      publishedRevision: 1,
      status: "ready"
    });
    expect(storage.operations).toEqual([
      `public:${manifestPath}:true`,
      `public:${snapshotPath}:true`
    ]);
    expect(repository.listSnapshotSites).not.toHaveBeenCalled();
    expect(storage.operations).not.toContain("public:catalog/v1/manifest.json:true");
    expect(repository.finalizeLease).toHaveBeenCalledWith(expect.objectContaining({
      checksum: snapshot.sha256,
      itemsCount: 0,
      publishedRevision: 1,
      snapshotPath
    }));
  });

  it("rejects a prefixed manifest that points at an unprefixed snapshot path", async () => {
    const storage = createStorage();
    const repository = createRepository({
      listSnapshotSites: vi.fn().mockRejectedValue(new Error("recovery rejected"))
    });
    const snapshot = storedSnapshot({ revision: 1 });
    const unprefixedSnapshotPath = `catalog/v1/releases/revision-1-${snapshot.sha256}.json`;
    storage.objects.set("canary/shadow/catalog/v1/manifest.json", storedManifest({
      revision: 1,
      sha256: snapshot.sha256,
      snapshotPath: unprefixedSnapshotPath
    }));
    storage.objects.set(unprefixedSnapshotPath, snapshot.body);
    const service = createPublicCatalogSyncService({
      maxPasses: 1,
      now: () => now,
      pathPrefix: "canary/shadow",
      repository,
      storage,
      target: runtimeTargetFixture("canary/shadow")
    });

    await service.syncOnce({ requestId: "req-prefixed-reject-unprefixed-snapshot" });

    expect(storage.operations).toEqual([
      "public:canary/shadow/catalog/v1/manifest.json:true"
    ]);
    expect(repository.finalizeLease).not.toHaveBeenCalled();
  });

  it("rejects a prefixed manifest whose snapshotUrl does not match the runtime public URL", async () => {
    const storage = createStorage();
    const repository = createRepository({
      listSnapshotSites: vi.fn().mockRejectedValue(new Error("recovery rejected"))
    });
    const snapshot = storedSnapshot({ revision: 1 });
    const snapshotPath = `canary/shadow/catalog/v1/releases/revision-1-${snapshot.sha256}.json`;
    storage.objects.set("canary/shadow/catalog/v1/manifest.json", storedManifest({
      revision: 1,
      sha256: snapshot.sha256,
      snapshotPath,
      snapshotUrl: `https://wrong-origin.example/${snapshotPath}`
    }));
    storage.objects.set(snapshotPath, snapshot.body);
    const service = createPublicCatalogSyncService({
      maxPasses: 1,
      now: () => now,
      pathPrefix: "canary/shadow",
      repository,
      storage,
      target: runtimeTargetFixture("canary/shadow")
    });

    await service.syncOnce({ requestId: "req-prefixed-reject-wrong-url" });

    expect(storage.operations).toEqual([
      "public:canary/shadow/catalog/v1/manifest.json:true"
    ]);
    expect(repository.finalizeLease).not.toHaveBeenCalled();
  });

  it("ignores a stale unprefixed manifest when recovering a prefixed target revision", async () => {
    const storage = createStorage();
    const repository = createRepository();
    const prefixedSnapshot = storedSnapshot({ revision: 1 });
    const prefixedSnapshotPath = `canary/shadow/catalog/v1/releases/revision-1-${prefixedSnapshot.sha256}.json`;
    const staleSnapshot = storedSnapshot({ revision: 1, showDemoInModal: true });
    const staleSnapshotPath = `catalog/v1/releases/revision-1-${staleSnapshot.sha256}.json`;
    storage.objects.set("canary/shadow/catalog/v1/manifest.json", storedManifest({
      revision: 1,
      sha256: prefixedSnapshot.sha256,
      snapshotPath: prefixedSnapshotPath
    }));
    storage.objects.set(prefixedSnapshotPath, prefixedSnapshot.body);
    storage.objects.set("catalog/v1/manifest.json", storedManifest({
      revision: 1,
      sha256: staleSnapshot.sha256,
      snapshotPath: staleSnapshotPath
    }));
    storage.objects.set(staleSnapshotPath, staleSnapshot.body);
    const service = createPublicCatalogSyncService({
      now: () => now,
      pathPrefix: "canary/shadow",
      repository,
      storage,
      target: runtimeTargetFixture("canary/shadow")
    });

    const result = await service.syncOnce({ requestId: "req-prefixed-ignore-unprefixed" });

    expect(result).toMatchObject({
      itemsCount: 0,
      publishedRevision: 1,
      snapshotPath: prefixedSnapshotPath,
      status: "ready"
    });
    expect(storage.operations).toEqual([
      "public:canary/shadow/catalog/v1/manifest.json:true",
      `public:${prefixedSnapshotPath}:true`
    ]);
    expect(repository.finalizeLease).toHaveBeenCalledWith(expect.objectContaining({
      checksum: prefixedSnapshot.sha256,
      snapshotPath: prefixedSnapshotPath
    }));
  });

  it("returns ready without storage writes when durable state is already clean", async () => {
    const cleanState = control({
      currentItemsCount: 2,
      currentSnapshotChecksum: "a".repeat(64),
      currentSnapshotGeneratedAt: now,
      currentSnapshotPath: "canary/shadow/catalog/v1/releases/revision-4-clean.json",
      desiredRevision: 4,
      publishedRevision: 4,
      publishedRuntimeTargetKey: runtimeTargetKey(""),
      syncStatus: "ready"
    });
    const readCurrentState = vi.fn(async () => cleanState);
    const repository = {
      ...createRepository({
        acquireLease: vi.fn().mockResolvedValue(null)
      }),
      readCurrentState
    } as PublicCatalogSyncRepository & { readCurrentState: typeof readCurrentState };
    const storage = createStorage();
    const service = createPublicCatalogSyncService({
      now: () => now,
      repository,
      storage,
      target: runtimeTargetFixture("")
    });

    const result = await service.syncOnce({ requestId: "req-clean-ready" });

    expect(result).toEqual({
      desiredRevision: 4,
      itemsCount: 2,
      publishedRevision: 4,
      requestId: "req-clean-ready",
      snapshotPath: "canary/shadow/catalog/v1/releases/revision-4-clean.json",
      status: "ready"
    });
    expect(storage.operations).toEqual([]);
    expect(readCurrentState).toHaveBeenCalledTimes(1);
    expect(repository.finalizeLease).not.toHaveBeenCalled();
  });

  it("returns pending without storage writes when durable state is ready for a different target", async () => {
    const readCurrentState = vi.fn(async () => control({
      desiredRevision: 4,
      publishedRevision: 4,
      publishedRuntimeTargetKey: runtimeTargetKey("canary/shadow"),
      syncStatus: "ready"
    }));
    const repository = {
      ...createRepository({
        acquireLease: vi.fn().mockResolvedValue(null)
      }),
      readCurrentState
    } as PublicCatalogSyncRepository & { readCurrentState: typeof readCurrentState };
    const storage = createStorage();
    const service = createPublicCatalogSyncService({
      now: () => now,
      repository,
      storage,
      target: runtimeTargetFixture("")
    });

    const result = await service.syncOnce({ requestId: "req-target-mismatch" });

    expect(result).toEqual({
      desiredRevision: 4,
      publishedRevision: 4,
      requestId: "req-target-mismatch",
      status: "pending"
    });
    expect(storage.operations).toEqual([]);
    expect(repository.finalizeLease).not.toHaveBeenCalled();
  });

  it("returns pending without storage writes when another publisher owns an active lease", async () => {
    const activeLeaseState = control({
      desiredRevision: 5,
      publishedRevision: 4,
      syncLeaseExpiresAt: new Date(now.getTime() + 30_000),
      syncLeaseId: "lease-active",
      syncStatus: "syncing"
    });
    const readCurrentState = vi.fn(async () => activeLeaseState);
    const repository = {
      ...createRepository({
        acquireLease: vi.fn().mockResolvedValue(null)
      }),
      readCurrentState
    } as PublicCatalogSyncRepository & { readCurrentState: typeof readCurrentState };
    const storage = createStorage();
    const service = createPublicCatalogSyncService({
      now: () => now,
      repository,
      storage,
      target: runtimeTargetFixture("")
    });

    const result = await service.syncOnce({ requestId: "req-active-lease" });

    expect(result).toMatchObject({
      desiredRevision: 5,
      publishedRevision: 4,
      status: "pending"
    });
    expect(storage.operations).toEqual([]);
    expect(readCurrentState).toHaveBeenCalledTimes(1);
    expect(repository.finalizeLease).not.toHaveBeenCalled();
  });
});

function runtimeTargetFixture(prefix: string): PublicRuntimeTargetConfig {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const manifestPath = normalizedPrefix === ""
    ? "catalog/v1/manifest.json"
    : `${normalizedPrefix}/catalog/v1/manifest.json`;
  return {
    bucket: "web00-public-runtime",
    catalogVersion: "v1",
    manifestPath,
    prefix: normalizedPrefix,
    provider: "cloudru",
    publicBaseUrl: "https://web00-public-runtime.s3-website.cloud.ru",
    role: normalizedPrefix === "canary/shadow" ? "shadow" : "primary"
  };
}

function runtimeTargetKey(prefix: string): string {
  return createPublicRuntimeTargetKey(runtimeTargetFixture(prefix));
}
