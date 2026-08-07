import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { createCloudRuS3PublicRuntimeStorage } from "../src/modules/public-catalog/cloudru-s3-public-runtime-storage.js";
import type { CloudRuRuntimeStorageConfig } from "../src/config/cloudru-runtime-env.js";

const providerSensitiveValue = "cloudru-sensitive-value-must-not-leak";

const config: CloudRuRuntimeStorageConfig = {
  accessKeyId: "tenant:key",
  bucket: "web00-public-runtime",
  endpoint: "https://s3.cloud.ru",
  prefix: "",
  publicBaseUrl: "https://web00-public-runtime.s3-website.cloud.ru",
  region: "ru-central-1",
  secretAccessKey: providerSensitiveValue
};

const snapshotPath = "catalog/v1/releases/revision-1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json";
const manifestPath = "catalog/v1/manifest.json";
const body = Buffer.from("{\"schemaVersion\":1}\n", "utf8");
const checksum = createHash("sha256").update(body).digest("hex");
const checksumBase64 = createHash("sha256").update(body).digest("base64");

function createS3Client(responseFactory: (command: { input: Record<string, unknown>; constructor: { name: string } }) => unknown) {
  return {
    send: vi.fn(async (command) => responseFactory(command as never))
  };
}

describe("Cloud.ru S3 public runtime storage", () => {
  it("puts immutable snapshots with immutable Cache-Control and SHA-256 checksum", async () => {
    const s3Client = createS3Client(() => ({ ETag: "\"etag\"", VersionId: "version-1" }));
    const storage = createCloudRuS3PublicRuntimeStorage({ config, s3Client: s3Client as never });

    const result = await storage.putImmutableObject({
      body,
      contentType: "application/json; charset=utf-8",
      path: snapshotPath,
      sha256: checksum
    });

    expect(result).toMatchObject({ etag: "\"etag\"", versionId: "version-1" });
    expect(s3Client.send).toHaveBeenCalledTimes(1);
    expect(s3Client.send.mock.calls[0]![0]).toMatchObject({
      input: {
        Bucket: config.bucket,
        CacheControl: "public, max-age=31536000, immutable",
        ChecksumSHA256: checksumBase64,
        ContentType: "application/json; charset=utf-8",
        Key: snapshotPath
      }
    });
  });

  it("puts the mutable manifest with no-store Cache-Control and SHA-256 checksum", async () => {
    const s3Client = createS3Client(() => ({ VersionId: "version-manifest" }));
    const storage = createCloudRuS3PublicRuntimeStorage({ config, s3Client: s3Client as never });

    await storage.putMutableManifest({
      body,
      contentType: "application/json; charset=utf-8",
      path: manifestPath,
      sha256: checksum
    });

    expect(s3Client.send.mock.calls[0]![0]).toMatchObject({
      input: {
        Bucket: config.bucket,
        CacheControl: "no-store, no-cache, must-revalidate, max-age=0",
        ChecksumSHA256: checksumBase64,
        ContentType: "application/json; charset=utf-8",
        Key: manifestPath
      }
    });
  });

  it("returns exact authenticated read-back bytes and metadata without exposing AWS SDK types", async () => {
    const s3Client = createS3Client(() => ({
      Body: body,
      CacheControl: "public, max-age=31536000, immutable",
      ContentType: "application/json; charset=utf-8",
      ETag: "\"etag\"",
      VersionId: "version-1"
    }));
    const storage = createCloudRuS3PublicRuntimeStorage({ config, s3Client: s3Client as never });

    const read = await storage.getAuthenticatedObject({ path: snapshotPath });

    expect(read.body.equals(body)).toBe(true);
    expect(read).toMatchObject({
      cacheControl: "public, max-age=31536000, immutable",
      contentType: "application/json; charset=utf-8",
      etag: "\"etag\"",
      versionId: "version-1"
    });
    expect(read).not.toHaveProperty("$metadata");
  });

  it("performs public read-back with a unique nonce for manifest verification", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(body, {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-amz-version-id": "public-version"
      },
      status: 200
    }));
    const storage = createCloudRuS3PublicRuntimeStorage({
      config,
      fetchFn,
      nonce: () => "nonce-1"
    });

    const read = await storage.getPublicObject({
      addNonce: true,
      path: manifestPath
    });
    const url = new URL(fetchFn.mock.calls[0]![0].toString());

    expect(read.body.equals(body)).toBe(true);
    expect(url.href).toBe(`${config.publicBaseUrl}/catalog/v1/manifest.json?v=nonce-1`);
    expect(fetchFn.mock.calls[0]![1]).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      method: "GET",
      redirect: "error"
    });
  });

  it("maps provider 429/5xx failures to safe retryable storage errors without raw provider payloads", async () => {
    const s3Client = createS3Client(() => {
      const error = new Error(`provider raw body ${providerSensitiveValue}`);
      Object.assign(error, { $metadata: { httpStatusCode: 503 } });
      throw error;
    });
    const storage = createCloudRuS3PublicRuntimeStorage({ config, s3Client: s3Client as never });

    await expect(
      storage.putImmutableObject({
        body,
        contentType: "application/json; charset=utf-8",
        path: snapshotPath,
        sha256: checksum
      })
    ).rejects.toMatchObject({
      code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
      statusCode: 503
    });

    try {
      await storage.putImmutableObject({
        body,
        contentType: "application/json; charset=utf-8",
        path: snapshotPath,
        sha256: checksum
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(JSON.stringify(error)).not.toContain(providerSensitiveValue);
      expect(JSON.stringify(error)).not.toContain("provider raw body");
    }
  });

  it("aborts hung authenticated reads and maps timeout to a safe storage error", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const s3Client = {
      send: vi.fn((_command, options?: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException(`provider raw body ${providerSensitiveValue}`, "AbortError"));
          });
        })
      )
    };
    const storage = createCloudRuS3PublicRuntimeStorage({ config, s3Client: s3Client as never });

    try {
      const read = storage.getAuthenticatedObject({
        path: snapshotPath,
        timeoutMs: 25
      });
      const expectation = expect(read).rejects.toMatchObject({
        code: "PUBLIC_CATALOG_STORAGE_TIMEOUT",
        statusCode: 504
      });

      await vi.advanceTimersByTimeAsync(25);
      await expectation;
      expect(aborted).toBe(true);
      await read.catch((error) => {
        expect(error).toBeInstanceOf(AppError);
        expect(JSON.stringify(error)).not.toContain(providerSensitiveValue);
        expect(JSON.stringify(error)).not.toContain("provider raw body");
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
