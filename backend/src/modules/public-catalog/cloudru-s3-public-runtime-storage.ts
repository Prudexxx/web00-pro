import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
  type PutObjectCommandOutput
} from "@aws-sdk/client-s3";
import type { CloudRuRuntimeStorageConfig } from "../../config/cloudru-runtime-env.js";
import { AppError, type ErrorCode } from "../../lib/errors.js";
import {
  assertRuntimeObjectPath,
  assertSha256,
  createPublicRuntimePathBuilder,
  type PublicRuntimeStorage,
  type RuntimePutObjectInput,
  type RuntimePutResult,
  type RuntimeReadResult
} from "./public-runtime-storage.js";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const MANIFEST_CACHE_CONTROL = "no-store, no-cache, must-revalidate, max-age=0";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

interface S3SendClient {
  send(
    command: GetObjectCommand | PutObjectCommand,
    options?: { abortSignal?: AbortSignal }
  ): Promise<unknown>;
}

type FetchLike = typeof fetch;

export function createCloudRuS3PublicRuntimeStorage(options: {
  config: CloudRuRuntimeStorageConfig;
  fetchFn?: FetchLike;
  nonce?: () => string;
  s3Client?: S3SendClient;
}): PublicRuntimeStorage {
  const pathBuilder = createPublicRuntimePathBuilder({
    prefix: options.config.prefix,
    publicBaseUrl: options.config.publicBaseUrl
  });
  const s3Client = options.s3Client ?? createS3Client(options.config);
  const fetchFn = options.fetchFn ?? fetch;
  const createNonce = options.nonce ?? (() => crypto.randomUUID());

  return {
    async getAuthenticatedObject(input) {
      const path = pathBuilder.validatePath(input.path);
      const timeout = createRequestTimeout(input.timeoutMs);
      try {
        const output = await s3Client.send(new GetObjectCommand({
          Bucket: options.config.bucket,
          Key: path
        }), { abortSignal: timeout.signal }) as GetObjectCommandOutput;
        return toRuntimeReadResult(output);
      } catch (error) {
        throw mapStorageError(error);
      } finally {
        timeout.cancel();
      }
    },

    async getPublicObject(input) {
      const path = pathBuilder.validatePath(input.path);
      const url = new URL(pathBuilder.publicUrl(path));
      if (input.addNonce === true) {
        url.searchParams.set("v", createNonce());
      }

      const timeout = createRequestTimeout(input.timeoutMs);
      let response: Response;
      try {
        response = await fetchFn(url, {
          cache: "no-store",
          credentials: "omit",
          method: "GET",
          redirect: "error",
          signal: timeout.signal
        });

        if (!response.ok) {
          throw storageUnavailable(response.status);
        }

        const body = Buffer.from(await response.arrayBuffer());
        const result: RuntimeReadResult = { body };
        const cacheControl = response.headers.get("cache-control");
        const contentType = response.headers.get("content-type");
        const etag = response.headers.get("etag");
        const versionId = response.headers.get("x-amz-version-id");
        if (cacheControl !== null) result.cacheControl = cacheControl;
        if (contentType !== null) result.contentType = contentType;
        if (etag !== null) result.etag = etag;
        if (versionId !== null) result.versionId = versionId;
        return result;
      } catch (error) {
        throw mapStorageError(error);
      } finally {
        timeout.cancel();
      }
    },

    getPublicUrl(path) {
      return pathBuilder.publicUrl(assertRuntimeObjectPath(path));
    },

    async putImmutableObject(input) {
      return putObject(s3Client, options.config.bucket, input, IMMUTABLE_CACHE_CONTROL);
    },

    async putMutableManifest(input) {
      return putObject(s3Client, options.config.bucket, input, MANIFEST_CACHE_CONTROL);
    }
  };
}

function createS3Client(config: CloudRuRuntimeStorageConfig): S3Client {
  return new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    endpoint: config.endpoint,
    forcePathStyle: true,
    maxAttempts: 1,
    region: config.region
  });
}

async function putObject(
  s3Client: S3SendClient,
  bucket: string,
  input: RuntimePutObjectInput,
  cacheControl: string
): Promise<RuntimePutResult> {
  const path = assertRuntimeObjectPath(input.path);
  const sha256 = assertSha256(input.sha256);
  const actualSha256 = createHash("sha256").update(input.body).digest("hex");
  if (actualSha256 !== sha256) {
    throw snapshotInvalid();
  }

  const timeout = createRequestTimeout(undefined);
  try {
    const output = await s3Client.send(new PutObjectCommand({
      Body: input.body,
      Bucket: bucket,
      CacheControl: cacheControl,
      ChecksumSHA256: createHash("sha256").update(input.body).digest("base64"),
      ContentType: input.contentType,
      Key: path
    }), { abortSignal: timeout.signal }) as PutObjectCommandOutput;

    const result: RuntimePutResult = { checksumSha256: sha256 };
    if (output.ETag !== undefined) result.etag = output.ETag;
    if (output.VersionId !== undefined) result.versionId = output.VersionId;
    return result;
  } catch (error) {
    throw mapStorageError(error);
  } finally {
    timeout.cancel();
  }
}

function createRequestTimeout(timeoutMs: number | undefined): {
  cancel: () => void;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  return {
    cancel: () => clearTimeout(timeout),
    signal: controller.signal
  };
}

async function toRuntimeReadResult(output: GetObjectCommandOutput): Promise<RuntimeReadResult> {
  const result: RuntimeReadResult = {
    body: await bodyToBuffer(output.Body)
  };
  if (output.CacheControl !== undefined) result.cacheControl = output.CacheControl;
  if (output.ContentType !== undefined) result.contentType = output.ContentType;
  if (output.ETag !== undefined) result.etag = output.ETag;
  if (output.VersionId !== undefined) result.versionId = output.VersionId;
  return result;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (body === undefined || body === null) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(body)) {
    return Buffer.from(body);
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }
  if (typeof body === "object" && "transformToByteArray" in body) {
    const transformed = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(transformed);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (isAsyncIterable(body)) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw storageUnavailable(503);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Buffer | Uint8Array | string> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

function mapStorageError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return storageError("PUBLIC_CATALOG_STORAGE_TIMEOUT", 504);
  }
  const statusCode = readProviderStatus(error);
  if (statusCode === 408 || statusCode === 429 || statusCode >= 500) {
    return storageUnavailable(statusCode);
  }
  if (statusCode === 401 || statusCode === 403) {
    return storageError("PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID", 503);
  }
  return storageError("PUBLIC_CATALOG_STORAGE_UNAVAILABLE", 503);
}

function readProviderStatus(error: unknown): number {
  if (typeof error !== "object" || error === null) return 503;
  const metadata = "$metadata" in error
    ? (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata
    : undefined;
  if (typeof metadata?.httpStatusCode === "number") {
    return metadata.httpStatusCode;
  }
  if ("status" in error && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  return 503;
}

function storageUnavailable(statusCode: number): AppError {
  return storageError("PUBLIC_CATALOG_STORAGE_UNAVAILABLE", statusCode >= 500 ? statusCode : 503);
}

function storageError(code: ErrorCode, statusCode: number): AppError {
  return new AppError({
    code,
    message: "Public runtime storage is unavailable.",
    statusCode
  });
}

function snapshotInvalid(): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_SNAPSHOT_INVALID",
    message: "Public catalog snapshot checksum mismatch.",
    statusCode: 503
  });
}
