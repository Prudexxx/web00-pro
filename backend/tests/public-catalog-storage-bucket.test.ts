import { describe, expect, it, vi } from "vitest";
import type { StorageConfig } from "../src/config/storage-env.js";
import {
  PUBLIC_CATALOG_STORAGE_BUCKET,
  PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG,
  createPublicCatalogStorageBucketManager
} from "../src/modules/public-catalog/public-catalog-storage-bucket.js";

const config: StorageConfig = {
  bucket: "web00-catalog-images",
  credentials: {
    serviceRoleKey: "service-role-secret",
    supabaseUrl: "https://project.supabase.co"
  },
  publicBaseUrl: "https://storage.example.test",
  workerEnabled: false,
  workerPollIntervalSeconds: 60
};

const compatibleBucket = {
  allowed_mime_types: ["application/json"],
  file_size_limit: 2_097_152,
  id: "web00-public-catalog",
  name: "web00-public-catalog",
  public: true
};

const imageOnlyBucket = {
  ...compatibleBucket,
  allowed_mime_types: ["image/webp", "image/avif"]
};

type ProviderResult = { data: unknown; error: unknown };

type BucketCall =
  | `createBucket:${string}:${string}:${number}:${boolean}`
  | `getBucket:${string}`;

function createStorageClient(script: ProviderResult[]) {
  const calls: BucketCall[] = [];
  const storage = {
    async createBucket(
      bucket: string,
      options: {
        allowedMimeTypes: string[];
        fileSizeLimit: number;
        public: boolean;
      }
    ) {
      calls.push(
        `createBucket:${bucket}:${options.allowedMimeTypes.join(",")}:${options.fileSizeLimit}:${options.public}`
      );
      return script.shift() ?? { data: {}, error: null };
    },
    from() {
      throw new Error("object storage is not used by bucket manager");
    },
    async getBucket(bucket: string) {
      calls.push(`getBucket:${bucket}`);
      return script.shift() ?? { data: compatibleBucket, error: null };
    }
  };

  return {
    calls,
    client: { storage }
  };
}

function providerError(status: number, message = "raw provider body service-role-secret") {
  return { message, status };
}

describe("public catalog storage bucket manager", () => {
  it("inspects a compatible public catalog bucket and ensureReady skips creation", async () => {
    const { calls, client } = createStorageClient([
      { data: compatibleBucket, error: null },
      { data: compatibleBucket, error: null }
    ]);
    const manager = createPublicCatalogStorageBucketManager(config, { client });

    await expect(manager.inspect({ requestId: "req_inspect_ready" })).resolves.toEqual({
      compatible: true,
      exists: true
    });
    await expect(manager.ensureReady({ requestId: "req_ensure_ready" })).resolves.toEqual({
      status: "ready"
    });
    expect(calls).toEqual([
      "getBucket:web00-public-catalog",
      "getBucket:web00-public-catalog"
    ]);
  });

  it("creates an absent public catalog bucket with exact config then verifies it", async () => {
    const { calls, client } = createStorageClient([
      { data: null, error: providerError(404) },
      { data: {}, error: null },
      { data: compatibleBucket, error: null }
    ]);
    const manager = createPublicCatalogStorageBucketManager(config, { client });

    await expect(manager.ensureReady({ requestId: "req_create_bucket" })).resolves.toEqual({
      status: "created"
    });
    expect(PUBLIC_CATALOG_STORAGE_BUCKET).toBe("web00-public-catalog");
    expect(PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG).toEqual({
      allowedMimeTypes: ["application/json"],
      fileSizeLimit: 2_097_152,
      id: "web00-public-catalog",
      public: true
    });
    expect(calls).toEqual([
      "getBucket:web00-public-catalog",
      "createBucket:web00-public-catalog:application/json:2097152:true",
      "getBucket:web00-public-catalog"
    ]);
  });

  it("fails closed for an incompatible existing public catalog bucket", async () => {
    const { calls, client } = createStorageClient([
      { data: imageOnlyBucket, error: null }
    ]);
    const manager = createPublicCatalogStorageBucketManager(config, { client });

    await expect(manager.ensureReady({ requestId: "req_incompatible" })).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID",
      message: "Public catalog storage configuration is invalid.",
      statusCode: 503
    });
    expect(calls).toEqual(["getBucket:web00-public-catalog"]);
  });

  it("treats a create conflict race as ready when reinspection is compatible", async () => {
    const { calls, client } = createStorageClient([
      { data: null, error: providerError(404) },
      { data: null, error: providerError(409, "bucket already exists service-role-secret") },
      { data: compatibleBucket, error: null }
    ]);
    const manager = createPublicCatalogStorageBucketManager(config, { client });

    await expect(manager.ensureReady({ requestId: "req_create_race" })).resolves.toEqual({
      status: "ready"
    });
    expect(calls).toEqual([
      "getBucket:web00-public-catalog",
      "createBucket:web00-public-catalog:application/json:2097152:true",
      "getBucket:web00-public-catalog"
    ]);
  });

  it("fails unavailable when create fails and the bucket remains absent", async () => {
    const { calls, client } = createStorageClient([
      { data: null, error: providerError(404) },
      { data: null, error: providerError(500) },
      { data: null, error: providerError(404) }
    ]);
    const manager = createPublicCatalogStorageBucketManager(config, { client });

    await expect(manager.ensureReady({ requestId: "req_create_failed" })).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
      message: "Public catalog storage is unavailable.",
      statusCode: 503
    });
    expect(calls).toEqual([
      "getBucket:web00-public-catalog",
      "createBucket:web00-public-catalog:application/json:2097152:true",
      "getBucket:web00-public-catalog"
    ]);
  });

  it.each([401, 403])(
    "treats unauthorized inspect status %i as storage unavailable",
    async (status) => {
      const { calls, client } = createStorageClient([
        { data: null, error: providerError(status) }
      ]);
      const manager = createPublicCatalogStorageBucketManager(config, { client });

      await expect(manager.inspect({ requestId: `req_auth_${status}` })).rejects.toMatchObject({
        code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
        message: "Public catalog storage is unavailable.",
        statusCode: 503
      });
      expect(calls).toEqual(["getBucket:web00-public-catalog"]);
    }
  );

  it("treats malformed provider responses as storage unavailable", async () => {
    const { client } = createStorageClient([{ data: null, error: null }]);
    const manager = createPublicCatalogStorageBucketManager(config, { client });

    await expect(manager.inspect({ requestId: "req_malformed" })).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
      message: "Public catalog storage is unavailable.",
      statusCode: 503
    });
  });

  it("marks image-only MIME configuration incompatible", async () => {
    const { client } = createStorageClient([{ data: imageOnlyBucket, error: null }]);
    const manager = createPublicCatalogStorageBucketManager(config, { client });

    await expect(manager.inspect({ requestId: "req_image_only" })).resolves.toEqual({
      compatible: false,
      exists: true
    });
  });

  it("treats a larger compatible file size limit as ready", async () => {
    const { client } = createStorageClient([
      {
        data: {
          ...compatibleBucket,
          file_size_limit: 4_194_304
        },
        error: null
      }
    ]);
    const manager = createPublicCatalogStorageBucketManager(config, { client });

    await expect(manager.inspect({ requestId: "req_larger_limit" })).resolves.toEqual({
      compatible: true,
      exists: true
    });
  });

  it("treats omitted optional provider metadata as compatible", async () => {
    const { client } = createStorageClient([
      {
        data: {
          id: "web00-public-catalog",
          name: "web00-public-catalog"
        },
        error: null
      }
    ]);
    const manager = createPublicCatalogStorageBucketManager(config, { client });

    await expect(manager.inspect({ requestId: "req_omitted_optional" })).resolves.toEqual({
      compatible: true,
      exists: true
    });
  });

  it("accepts camelCase metadata and MIME lists containing application/json", async () => {
    const { client } = createStorageClient([
      {
        data: {
          allowedMimeTypes: ["application/json", "text/plain"],
          fileSizeLimit: 4_194_304,
          name: "web00-public-catalog",
          public: true
        },
        error: null
      }
    ]);
    const manager = createPublicCatalogStorageBucketManager(config, { client });

    await expect(manager.inspect({ requestId: "req_camel_case_metadata" })).resolves.toEqual({
      compatible: true,
      exists: true
    });
  });

  it("rejects present wrong identity, private, and too-small limits", async () => {
    for (const [name, data] of [
      ["wrong-name", { ...compatibleBucket, name: "other-bucket" }],
      ["wrong-id", { ...compatibleBucket, id: "other-bucket" }],
      ["private", { ...compatibleBucket, public: false }],
      ["too-small", { ...compatibleBucket, file_size_limit: 1_048_576 }]
    ] as const) {
      const { client } = createStorageClient([{ data, error: null }]);
      const manager = createPublicCatalogStorageBucketManager(config, { client });

      await expect(manager.inspect({ requestId: `req_${name}` })).resolves.toEqual({
        compatible: false,
        exists: true
      });
    }
  });

  it("does not expose service-role keys or provider bodies through thrown errors or logs", async () => {
    const { client } = createStorageClient([
      {
        data: null,
        error: providerError(
          500,
          "raw provider body Authorization Bearer service-role-secret storage/v1/bucket"
        )
      }
    ]);
    const logger = { log: vi.fn() };
    const manager = createPublicCatalogStorageBucketManager(config, {
      client,
      logger,
      now: () => 10
    });

    let caught: unknown;
    try {
      await manager.inspect({ requestId: "req_secret_safe" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
      message: "Public catalog storage is unavailable."
    });
    expect(JSON.stringify(caught)).not.toMatch(
      /Authorization|Bearer|service-role-secret|storage\/v1\/bucket|raw provider body/i
    );
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(
      /Authorization|Bearer|service-role-secret|storage\/v1\/bucket|raw provider body/i
    );
  });
});
