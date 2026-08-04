import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  createSyntheticTenThousandProjectionPages,
  syntheticProjectionPages
} from "./helpers/public-catalog-v2-synthetic-fixtures.js";

const builderModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.builder.js";
const storageModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.storage.js";

async function importStorageModule(): Promise<Record<string, unknown>> {
  try {
    return await import(storageModulePath);
  } catch (error) {
    throw new Error(
      "Expected Public Catalog V2 storage verifier module to exist; OPV2-4 is RED until immutable read-back verification is implemented.",
      { cause: error }
    );
  }
}

async function importBuilderModule(): Promise<Record<string, unknown>> {
  try {
    return await import(builderModulePath);
  } catch (error) {
    throw new Error(
      "Expected Public Catalog V2 builder module to exist; OPV2-4 is RED until immutable release building is implemented.",
      { cause: error }
    );
  }
}

function readFunction(module: Record<string, unknown>, name: string): (...args: unknown[]) => unknown {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`Expected Public Catalog V2 storage export ${name} to be a function.`);
  }
  return value as (...args: unknown[]) => unknown;
}

describe("Public Catalog V2 storage verifier", () => {
  it("uploads immutable artifacts with read-back verification before active pointer activation", async () => {
    const builderModule = await importBuilderModule();
    const storageModule = await importStorageModule();
    const buildPublicCatalogV2Release = readFunction(builderModule, "buildPublicCatalogV2Release");
    const uploadAndVerifyPublicCatalogV2Release = readFunction(storageModule, "uploadAndVerifyPublicCatalogV2Release");
    const storage = createFakeV2Storage();

    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: syntheticProjectionPages([{ slug: "synthetic-storage-fixture", sortOrder: 1 }]),
      revision: 7,
      settings: { showDemoInModal: true }
    });
    const result = await uploadAndVerifyPublicCatalogV2Release({
      activatedAt: new Date("2026-08-03T16:05:00.000Z"),
      release,
      storage
    }) as {
      activePointer: { manifestSha256: string; path: string; revision: number };
      immutableArtifactsVerified: number;
      uploadOrder: string[];
    };

    expect(storage.maxConcurrentUploads()).toBeLessThanOrEqual(2);
    expect(result.activePointer).toMatchObject({
      path: "public-catalog/v2/active.json",
      revision: 7
    });
    expect(result.immutableArtifactsVerified).toBeGreaterThanOrEqual(5);
    expect(result.uploadOrder.at(-1)).toBe("public-catalog/v2/active.json");
    expect(storage.fetches.every((fetch) => fetch.bucketId === "web00-public-catalog")).toBe(true);
    expect(storage.objects.get("web00-public-catalog/public-catalog/v2/active.json")?.contentType).toBe(
      "application/json"
    );
  });

  it.each([
    ["wrong bucket", { bucketOverride: "web00-catalog-images" }],
    ["wrong content type", { contentTypeOverride: "text/plain" }],
    ["changed immutable bytes", { corruptReadBackPathIncludes: "chunk-000001" }]
  ])("blocks activation when immutable read-back has %s", async (_caseName, overrides) => {
    const builderModule = await importBuilderModule();
    const storageModule = await importStorageModule();
    const buildPublicCatalogV2Release = readFunction(builderModule, "buildPublicCatalogV2Release");
    const uploadAndVerifyPublicCatalogV2Release = readFunction(storageModule, "uploadAndVerifyPublicCatalogV2Release");
    const storage = createFakeV2Storage(overrides);
    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: syntheticProjectionPages([{ slug: "synthetic-storage-negative", sortOrder: 1 }]),
      revision: 8,
      settings: { showDemoInModal: true }
    });

    await expect(
      uploadAndVerifyPublicCatalogV2Release({
        activatedAt: new Date("2026-08-03T16:05:00.000Z"),
        release,
        storage
      })
    ).rejects.toThrow("PUBLIC_CATALOG_V2_ARTIFACT_VERIFY_FAILED");

    expect(storage.uploads).not.toContain("public-catalog/v2/active.json");
  });

  it("blocks activation when active pointer metadata does not match the verified manifest artifact", async () => {
    const builderModule = await importBuilderModule();
    const storageModule = await importStorageModule();
    const buildPublicCatalogV2Release = readFunction(builderModule, "buildPublicCatalogV2Release");
    const uploadAndVerifyPublicCatalogV2Release = readFunction(storageModule, "uploadAndVerifyPublicCatalogV2Release");
    const storage = createFakeV2Storage();
    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: syntheticProjectionPages([{ slug: "synthetic-storage-pointer-negative", sortOrder: 1 }]),
      revision: 12,
      settings: { showDemoInModal: true }
    }) as {
      activationInput: { manifestPath: string; manifestSha256: string; revision: number };
    };

    await expect(
      uploadAndVerifyPublicCatalogV2Release({
        activatedAt: new Date("2026-08-03T16:05:00.000Z"),
        release: {
          ...release,
          activationInput: {
            ...release.activationInput,
            manifestSha256: "b".repeat(64)
          }
        },
        storage
      })
    ).rejects.toThrow("PUBLIC_CATALOG_V2_ARTIFACT_VERIFY_FAILED");

    expect(storage.uploads).not.toContain("public-catalog/v2/active.json");
  });

  it("blocks activation when active pointer manifest URL points outside the JSON bucket", async () => {
    const builderModule = await importBuilderModule();
    const storageModule = await importStorageModule();
    const buildPublicCatalogV2Release = readFunction(builderModule, "buildPublicCatalogV2Release");
    const uploadAndVerifyPublicCatalogV2Release = readFunction(storageModule, "uploadAndVerifyPublicCatalogV2Release");
    const storage = createFakeV2Storage({
      manifestUrlBucketOverride: "web00-catalog-images"
    });
    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: syntheticProjectionPages([{ slug: "synthetic-storage-url-negative", sortOrder: 1 }]),
      revision: 13,
      settings: { showDemoInModal: true }
    });

    await expect(
      uploadAndVerifyPublicCatalogV2Release({
        activatedAt: new Date("2026-08-03T16:05:00.000Z"),
        release,
        storage
      })
    ).rejects.toThrow("PUBLIC_CATALOG_V2_ARTIFACT_VERIFY_FAILED");

    expect(storage.uploads).not.toContain("public-catalog/v2/active.json");
  });

  it("blocks activation when manifest artifact descriptors do not match release artifacts", async () => {
    const builderModule = await importBuilderModule();
    const storageModule = await importStorageModule();
    const buildPublicCatalogV2Release = readFunction(builderModule, "buildPublicCatalogV2Release");
    const uploadAndVerifyPublicCatalogV2Release = readFunction(storageModule, "uploadAndVerifyPublicCatalogV2Release");
    const storage = createFakeV2Storage();
    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: syntheticProjectionPages([{ slug: "synthetic-storage-manifest-negative", sortOrder: 1 }]),
      revision: 14,
      settings: { showDemoInModal: true }
    }) as {
      activationInput: { manifestPath: string; manifestSha256: string; revision: number };
      artifacts: Array<{
        byteLength: number;
        bytes: string;
        kind: string;
        parsed: Record<string, unknown>;
        path: string;
        sha256: string;
      }>;
    };
    const manifestArtifact = release.artifacts.find((artifact) => artifact.kind === "manifest");
    if (manifestArtifact === undefined) {
      throw new Error("Synthetic release missing manifest artifact.");
    }
    const tamperedParsed = {
      ...manifestArtifact.parsed,
      artifacts: (manifestArtifact.parsed.artifacts as Array<Record<string, unknown>>).map((artifact, index) =>
        index === 0
          ? {
              ...artifact,
              path: "public-catalog/v2/releases/revision-14/chunks/chunk-999999.json"
            }
          : artifact
      )
    };
    const tamperedBytes = stableSerializeForTest(tamperedParsed);
    const tamperedSha256 = createHash("sha256").update(tamperedBytes, "utf8").digest("hex");
    const tamperedManifestArtifact = {
      ...manifestArtifact,
      byteLength: Buffer.byteLength(tamperedBytes, "utf8"),
      bytes: tamperedBytes,
      parsed: tamperedParsed,
      sha256: tamperedSha256
    };

    await expect(
      uploadAndVerifyPublicCatalogV2Release({
        activatedAt: new Date("2026-08-03T16:05:00.000Z"),
        release: {
          ...release,
          activationInput: {
            ...release.activationInput,
            manifestSha256: tamperedSha256
          },
          artifacts: release.artifacts.map((artifact) =>
            artifact.kind === "manifest" ? tamperedManifestArtifact : artifact
          )
        },
        storage
      })
    ).rejects.toThrow("PUBLIC_CATALOG_V2_ARTIFACT_VERIFY_FAILED");

    expect(storage.uploads).not.toContain("public-catalog/v2/active.json");
  });

  it("blocks activation when a read-back artifact checksum differs from the manifest checksum chain", async () => {
    const builderModule = await importBuilderModule();
    const storageModule = await importStorageModule();
    const buildPublicCatalogV2Release = readFunction(builderModule, "buildPublicCatalogV2Release");
    const uploadAndVerifyPublicCatalogV2Release = readFunction(storageModule, "uploadAndVerifyPublicCatalogV2Release");
    const storage = createFakeV2Storage();
    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: syntheticProjectionPages([{ slug: "synthetic-storage-chain-negative", sortOrder: 1 }]),
      revision: 18,
      settings: { showDemoInModal: true }
    }) as {
      artifacts: Array<{
        byteLength: number;
        bytes: string;
        kind: string;
        parsed: Record<string, unknown>;
        path: string;
        sha256: string;
      }>;
    };
    const firstChunk = release.artifacts.find((artifact) => artifact.kind === "chunk");
    if (firstChunk === undefined) {
      throw new Error("Synthetic release missing chunk artifact.");
    }
    const tamperedParsed = {
      ...firstChunk.parsed,
      items: (firstChunk.parsed.items as Array<Record<string, unknown>>).map((item, index) =>
        index === 0 ? { ...item, title: "Tampered after manifest" } : item
      )
    };
    const tamperedBytes = stableSerializeForTest(tamperedParsed);
    const tamperedSha256 = createHash("sha256").update(tamperedBytes, "utf8").digest("hex");

    await expect(
      uploadAndVerifyPublicCatalogV2Release({
        activatedAt: new Date("2026-08-03T16:05:00.000Z"),
        release: {
          ...release,
          artifacts: release.artifacts.map((artifact) =>
            artifact.path === firstChunk.path
              ? {
                  ...artifact,
                  byteLength: Buffer.byteLength(tamperedBytes, "utf8"),
                  bytes: tamperedBytes,
                  parsed: tamperedParsed,
                  sha256: tamperedSha256
                }
              : artifact
          )
        },
        storage
      })
    ).rejects.toThrow("PUBLIC_CATALOG_V2_ARTIFACT_VERIFY_FAILED");

    expect(storage.uploads).not.toContain("public-catalog/v2/active.json");
  });

  it("replays an uncertain immutable upload only when existing bytes match exactly", async () => {
    const builderModule = await importBuilderModule();
    const storageModule = await importStorageModule();
    const buildPublicCatalogV2Release = readFunction(builderModule, "buildPublicCatalogV2Release");
    const uploadAndVerifyPublicCatalogV2Release = readFunction(storageModule, "uploadAndVerifyPublicCatalogV2Release");
    const storage = createFakeV2Storage({ failFirstImmutableUploadAfterWrite: true });
    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: createSyntheticTenThousandProjectionPages(100).pages,
      revision: 9,
      settings: { showDemoInModal: true }
    });

    await expect(
      uploadAndVerifyPublicCatalogV2Release({
        activatedAt: new Date("2026-08-03T16:05:00.000Z"),
        release,
        storage
      })
    ).resolves.toMatchObject({
      replayedImmutableArtifacts: expect.arrayContaining([
        "public-catalog/v2/releases/revision-9/chunks/chunk-000001.json"
      ])
    });
  }, 30_000);
});

function createFakeV2Storage(options: {
  bucketOverride?: string;
  contentTypeOverride?: string;
  corruptReadBackPathIncludes?: string;
  failFirstImmutableUploadAfterWrite?: boolean;
  manifestUrlBucketOverride?: string;
} = {}) {
  let activeUploads = 0;
  let maxConcurrent = 0;
  let failedFirstImmutable = false;
  const objects = new Map<string, { body: string; contentType: string }>();
  const uploads: string[] = [];
  const fetches: Array<{ bucketId: string; path: string }> = [];

  return {
    fetches,
    objects,
    uploads,
    fetchJsonArtifact: vi.fn(async (input: { bucketId: string; path: string }) => {
      const bucketId = options.bucketOverride ?? input.bucketId;
      fetches.push({ bucketId, path: input.path });
      const object = objects.get(`${input.bucketId}/${input.path}`);
      if (object === undefined) {
        throw new Error("Synthetic missing object.");
      }
      return {
        body:
          options.corruptReadBackPathIncludes !== undefined &&
          input.path.includes(options.corruptReadBackPathIncludes)
            ? `${object.body.trimEnd()} \n`
            : object.body,
        bucketId,
        contentType: options.contentTypeOverride ?? object.contentType,
        path: input.path
      };
    }),
    maxConcurrentUploads: () => maxConcurrent,
    getPublicUrl: vi.fn((path: string) =>
      `https://storage.web00.invalid/storage/v1/object/public/${options.manifestUrlBucketOverride ?? "web00-public-catalog"}/${path}`
    ),
    uploadActivePointer: vi.fn(async (input: { body: string; bucketId: string; path: string }) => {
      uploads.push(input.path);
      objects.set(`${input.bucketId}/${input.path}`, { body: input.body, contentType: "application/json" });
    }),
    uploadImmutableJsonArtifact: vi.fn(async (input: { body: string; bucketId: string; path: string }) => {
      activeUploads += 1;
      maxConcurrent = Math.max(maxConcurrent, activeUploads);
      try {
        uploads.push(input.path);
        objects.set(`${input.bucketId}/${input.path}`, { body: input.body, contentType: "application/json" });
        if (options.failFirstImmutableUploadAfterWrite === true && !failedFirstImmutable) {
          failedFirstImmutable = true;
          throw new Error("Synthetic uncertain upload failure.");
        }
      } finally {
        activeUploads -= 1;
      }
    })
  };
}

function stableSerializeForTest(value: unknown): string {
  return `${JSON.stringify(sortJsonValueForTest(value))}\n`;
}

function sortJsonValueForTest(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValueForTest);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValueForTest(nestedValue)])
    );
  }
  return value;
}
