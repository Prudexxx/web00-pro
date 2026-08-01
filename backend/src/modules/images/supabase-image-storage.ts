import { createClient } from "@supabase/supabase-js";
import type { StorageConfig } from "../../config/storage-env.js";
import { createImageAppError } from "./image.errors.js";
import {
  attachPreviewUploadDiagnostic,
  createPreviewStorageDiagnostic,
  type PreviewStorageDiagnosticCode
} from "./preview-upload-observability.js";
import type {
  ImageStorage,
  ImageStorageOperationContext,
  StorageBucketConfig,
  StorageBucketInspection,
  StorageBucketResult,
  StorageObjectInspection,
  StorageRemoveResult,
  StorageUploadResult,
  UploadImageObjectInput
} from "./image-storage.js";

export interface SupabaseStorageLike {
  storage: {
    createBucket?: (
      bucket: string,
      options: {
        allowedMimeTypes: string[];
        fileSizeLimit: number;
        public: boolean;
      }
    ) => Promise<{ data: unknown; error: unknown }>;
    from(bucket: string): {
      getPublicUrl?: (path: string) => { data: { publicUrl: string } };
      list?: (
        prefix: string
      ) => Promise<{ data: Array<{ name: string }> | null; error: unknown }>;
      remove?: (paths: string[]) => Promise<{ data: unknown; error: unknown }>;
      upload?: (
        path: string,
        body: Buffer,
        options: {
          cacheControl: "31536000";
          contentType: "image/avif" | "image/webp";
          upsert: false;
        }
      ) => Promise<{ data: unknown; error: unknown }>;
    };
    getBucket?: (bucket: string) => Promise<{ data: unknown; error: unknown }>;
  };
}

export interface SupabaseImageStorageOptions {
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

const variantPathPattern =
  /^sites\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(preview|gallery)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([1-9]\d*)\.(webp|avif)$/;

export function createSupabaseImageStorage(
  config: StorageConfig,
  client: SupabaseStorageLike = createClient(
    config.credentials.supabaseUrl,
    config.credentials.serviceRoleKey,
    {
      auth: {
        persistSession: false
      }
    }
  ) as SupabaseStorageLike,
  options: SupabaseImageStorageOptions = {}
): ImageStorage {
  const storageClient = client.storage;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    async createBucket(input) {
      assertBucketConfig(input, config.bucket);

      if (storageClient.createBucket === undefined) {
        throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
      }

      const result = await storageClient.createBucket(input.id, {
        allowedMimeTypes: [...input.allowedMimeTypes],
        fileSizeLimit: input.fileSizeLimit,
        public: input.public
      });

      if (result.error !== null) {
        throw storageConfigurationInvalid("STORAGE_CONFIGURATION", result.error);
      }

      return { created: true };
    },
    getPublicUrl(path) {
      assertVariantPath(path);

      const publicUrl = storageClient.from(config.bucket).getPublicUrl?.(path).data
        .publicUrl ?? deterministicPublicUrl(config, path);

      assertSafePublicUrl(config, publicUrl, path);
      return publicUrl;
    },
    async inspectBucket(bucket) {
      if (bucket !== config.bucket) {
        throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
      }

      if (storageClient.getBucket === undefined) {
        return {
          compatible: true,
          exists: true
        };
      }

      const result = await storageClient.getBucket(bucket);

      if (result.error !== null) {
        return { exists: false };
      }

      return {
        compatible: isCompatibleBucket(result.data),
        exists: true
      };
    },
    async inspectObjects(paths, context) {
      if (paths.length === 0) {
        return { existingPaths: [], missingPaths: [] };
      }

      const prefix = commonCanonicalPrefix(paths);

      if (context !== undefined) {
        return inspectObjectsWithFetch(config, paths, prefix, context, fetchImpl);
      }

      const bucketClient = storageClient.from(config.bucket);

      if (bucketClient.list === undefined) {
        throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
      }

      const result = await bucketClient.list(prefix);

      if (result.error !== null || result.data === null) {
        throw storageOperationFailed(
          "STORAGE_UNAVAILABLE",
          "Storage is unavailable.",
          503,
          "STORAGE_INSPECT",
          result.error
        );
      }

      const names = new Set(result.data.map((item) => item.name));
      const existingPaths: string[] = [];
      const missingPaths: string[] = [];

      for (const path of paths) {
        const name = path.slice(prefix.length + 1);

        if (names.has(name)) {
          existingPaths.push(path);
        } else {
          missingPaths.push(path);
        }
      }

      return { existingPaths, missingPaths };
    },
    async removeObjects(paths, context) {
      for (const path of paths) {
        assertVariantPath(path);
      }

      if (context !== undefined) {
        return removeObjectsWithFetch(config, paths, context, fetchImpl);
      }

      const bucketClient = storageClient.from(config.bucket);

      if (bucketClient.remove === undefined) {
        throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
      }

      const result = await bucketClient.remove([...paths]);

      if (result.error !== null) {
        throw storageOperationFailed(
          "STORAGE_UNAVAILABLE",
          "Storage is unavailable.",
          503,
          "STORAGE_REMOVE",
          result.error
        );
      }

      return { removedPaths: [...paths] };
    },
    async uploadObject(input) {
      assertUploadInput(input);

      if (input.context !== undefined) {
        return uploadObjectWithFetch(config, input, fetchImpl, () =>
          this.getPublicUrl(input.path)
        );
      }

      const bucketClient = storageClient.from(config.bucket);

      if (bucketClient.upload === undefined) {
        throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
      }

      const result = await bucketClient.upload(input.path, input.body, {
        cacheControl: input.cacheControl,
        contentType: input.contentType,
        upsert: false
      });

      if (result.error !== null) {
        throw storageOperationFailed(
          "STORAGE_WRITE_FAILED",
          "Storage write failed.",
          503,
          "STORAGE_UPLOAD",
          result.error
        );
      }

      return {
        path: input.path,
        publicUrl: this.getPublicUrl(input.path)
      } satisfies StorageUploadResult;
    }
  };
}

async function uploadObjectWithFetch(
  config: StorageConfig,
  input: UploadImageObjectInput,
  fetchImpl: SupabaseImageStorageOptions["fetchImpl"],
  getPublicUrl: () => string
): Promise<StorageUploadResult> {
  if (fetchImpl === undefined) {
    throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
  }

  const timed = createTimedOperationSignal(input.context);

  try {
    const result = await fetchImpl(buildObjectUploadUrl(config, input.path), {
      body: input.body as unknown as BodyInit,
      headers: {
        apikey: config.credentials.serviceRoleKey,
        authorization: `Bearer ${config.credentials.serviceRoleKey}`,
        "cache-control": "max-age=31536000",
        "content-type": input.contentType,
        "x-upsert": "false"
      },
      method: "POST",
      signal: timed.signal
    });

    if (!result.ok) {
      await disposeResponseBody(result);
      throw storageOperationFailed(
        "STORAGE_WRITE_FAILED",
        "Storage write failed.",
        503,
        "STORAGE_UPLOAD"
      );
    }

    await disposeResponseBody(result);

    return {
      path: input.path,
      publicUrl: getPublicUrl()
    };
  } catch (error) {
    throw mapTimedStorageError(error, timed, {
      fallback: () => error,
      operation: "STORAGE_UPLOAD",
      temporaryCode: "STORAGE_WRITE_FAILED",
      temporaryMessage: "Storage write failed.",
      timeoutMessage: "Storage upload timed out."
    });
  } finally {
    timed.cleanup();
  }
}

async function inspectObjectsWithFetch(
  config: StorageConfig,
  paths: readonly string[],
  prefix: string,
  context: ImageStorageOperationContext,
  fetchImpl: SupabaseImageStorageOptions["fetchImpl"]
): Promise<StorageObjectInspection> {
  if (fetchImpl === undefined) {
    throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
  }

  const timed = createTimedOperationSignal(context);

  try {
    const result = await fetchImpl(buildObjectListUrl(config), {
      body: JSON.stringify({
        limit: Math.max(paths.length, 100),
        offset: 0,
        prefix,
        sortBy: {
          column: "name",
          order: "asc"
        }
      }),
      headers: serviceRoleJsonHeaders(config),
      method: "POST",
      signal: timed.signal
    });

    if (!result.ok) {
      await disposeResponseBody(result);
      throw storageOperationFailed(
        "STORAGE_UNAVAILABLE",
        "Storage is unavailable.",
        503,
        "STORAGE_INSPECT",
        result
      );
    }

    const payload = await result.json();

    if (!Array.isArray(payload)) {
      throw storageOperationFailed(
        "STORAGE_UNAVAILABLE",
        "Storage is unavailable.",
        503,
        "STORAGE_INSPECT"
      );
    }

    const names = new Set(
      payload
        .map((item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { name?: unknown }).name === "string"
            ? (item as { name: string }).name
            : null
        )
        .filter((name: string | null): name is string => name !== null)
    );
    const existingPaths: string[] = [];
    const missingPaths: string[] = [];

    for (const path of paths) {
      const name = path.slice(prefix.length + 1);

      if (names.has(name)) {
        existingPaths.push(path);
      } else {
        missingPaths.push(path);
      }
    }

    return { existingPaths, missingPaths };
  } catch (error) {
    throw mapTimedStorageError(error, timed, {
      fallback: () => error,
      operation: "STORAGE_INSPECT",
      temporaryCode: "STORAGE_UNAVAILABLE",
      temporaryMessage: "Storage is unavailable.",
      timeoutMessage: "Storage inspect timed out."
    });
  } finally {
    timed.cleanup();
  }
}

async function removeObjectsWithFetch(
  config: StorageConfig,
  paths: readonly string[],
  context: ImageStorageOperationContext,
  fetchImpl: SupabaseImageStorageOptions["fetchImpl"]
): Promise<StorageRemoveResult> {
  if (fetchImpl === undefined) {
    throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
  }

  const timed = createTimedOperationSignal(context);

  try {
    const result = await fetchImpl(buildObjectDeleteUrl(config), {
      body: JSON.stringify({ prefixes: [...paths] }),
      headers: serviceRoleJsonHeaders(config),
      method: "DELETE",
      signal: timed.signal
    });

    if (!result.ok) {
      await disposeResponseBody(result);
      throw storageOperationFailed(
        "STORAGE_UNAVAILABLE",
        "Storage is unavailable.",
        503,
        "STORAGE_REMOVE",
        result
      );
    }

    await disposeResponseBody(result);

    return { removedPaths: [...paths] };
  } catch (error) {
    throw mapTimedStorageError(error, timed, {
      fallback: () => error,
      operation: "STORAGE_REMOVE",
      temporaryCode: "STORAGE_UNAVAILABLE",
      temporaryMessage: "Storage is unavailable.",
      timeoutMessage: "Storage remove timed out."
    });
  } finally {
    timed.cleanup();
  }
}

function mapTimedStorageError(
  error: unknown,
  timed: ReturnType<typeof createTimedOperationSignal>,
  input: {
    fallback: () => unknown;
    operation: PreviewStorageDiagnosticCode;
    temporaryCode: "STORAGE_UNAVAILABLE" | "STORAGE_WRITE_FAILED";
    temporaryMessage: string;
    timeoutMessage: string;
  }
): unknown {
  const abortKind = timed.abortKind();

  if (abortKind === "timeout") {
    return storageOperationFailed(
      "IMAGE_STORAGE_TIMEOUT",
      input.timeoutMessage,
      503,
      input.operation
    );
  }
  if (abortKind === "request") {
    return requestCancelled();
  }
  if (abortKind === "client" || isAbortError(error)) {
    return clientAborted();
  }
  if (error instanceof Response) {
    return storageOperationFailed(
      input.temporaryCode,
      input.temporaryMessage,
      503,
      input.operation,
      error
    );
  }
  if (error instanceof Error && error.name === "SyntaxError") {
    return storageOperationFailed(
      input.temporaryCode,
      input.temporaryMessage,
      503,
      input.operation
    );
  }
  if (error instanceof Error && error.name === "TypeError") {
    return storageOperationFailed(
      "STORAGE_UNAVAILABLE",
      "Storage is unavailable.",
      503,
      input.operation
    );
  }

  return input.fallback();
}

function buildObjectUploadUrl(config: StorageConfig, path: string): string {
  const base = new URL(config.credentials.supabaseUrl);

  base.pathname = `/storage/v1/object/${config.bucket}/${path}`;
  base.search = "";
  base.hash = "";

  return base.toString();
}

function buildObjectListUrl(config: StorageConfig): string {
  const base = new URL(config.credentials.supabaseUrl);

  base.pathname = `/storage/v1/object/list/${config.bucket}`;
  base.search = "";
  base.hash = "";

  return base.toString();
}

async function disposeResponseBody(response: Response): Promise<void> {
  try {
    if (response.bodyUsed) {
      return;
    }
    if (response.body !== null) {
      await response.body.cancel();
    }
  } catch {
    // Best-effort cleanup only; disposal errors must not replace the main outcome.
  }
}

function buildObjectDeleteUrl(config: StorageConfig): string {
  const base = new URL(config.credentials.supabaseUrl);

  base.pathname = `/storage/v1/object/${config.bucket}`;
  base.search = "";
  base.hash = "";

  return base.toString();
}

function serviceRoleJsonHeaders(config: StorageConfig): Record<string, string> {
  return {
    apikey: config.credentials.serviceRoleKey,
    authorization: `Bearer ${config.credentials.serviceRoleKey}`,
    "content-type": "application/json"
  };
}

function createTimedOperationSignal(
  context: ImageStorageOperationContext | undefined
): {
  abortKind: () => "client" | "request" | "timeout" | undefined;
  cleanup: () => void;
  didTimeout: () => boolean;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  let abortKind: "client" | "request" | "timeout" | undefined;
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;
  let abortListener: (() => void) | undefined;

  if (context?.signal?.aborted === true) {
    abortKind = classifyExternalAbort(context.signal.reason);
    controller.abort(context.signal.reason);
  } else if (context?.signal !== undefined) {
    abortListener = () => {
      if (abortKind === undefined) {
        abortKind = classifyExternalAbort(context.signal?.reason);
        controller.abort(context.signal?.reason);
      }
    };
    context.signal.addEventListener("abort", abortListener, { once: true });
  }

  if (context?.timeoutMs !== undefined) {
    timer = setTimeout(() => {
      if (abortKind === undefined) {
        timedOut = true;
        abortKind = "timeout";
        controller.abort(new Error("IMAGE_STORAGE_TIMEOUT"));
      }
    }, context.timeoutMs);
  }

  return {
    abortKind: () => abortKind,
    cleanup() {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      if (abortListener !== undefined && context?.signal !== undefined) {
        context.signal.removeEventListener("abort", abortListener);
      }
    },
    didTimeout: () => timedOut,
    signal: controller.signal
  };
}

function classifyExternalAbort(reason: unknown): "client" | "request" {
  return reason instanceof Error &&
    "code" in reason &&
    (reason as { code?: unknown }).code === "REQUEST_CANCELLED"
    ? "request"
    : "client";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function assertUploadInput(input: UploadImageObjectInput): void {
  assertVariantPath(input.path);

  if (
    input.cacheControl !== "31536000" ||
    input.upsert !== false ||
    (input.contentType !== "image/webp" && input.contentType !== "image/avif")
  ) {
    throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
  }
}

function assertVariantPath(path: string): void {
  if (!variantPathPattern.test(path)) {
    throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
  }
}

function commonCanonicalPrefix(paths: readonly string[]): string {
  let prefix: string | undefined;

  for (const path of paths) {
    assertVariantPath(path);
    const nextPrefix = path.slice(0, path.lastIndexOf("/"));

    if (prefix === undefined) {
      prefix = nextPrefix;
      continue;
    }
    if (prefix !== nextPrefix) {
      throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
    }
  }

  if (prefix === undefined) {
    throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
  }

  return prefix;
}

function deterministicPublicUrl(config: StorageConfig, path: string): string {
  return `${new URL(config.publicBaseUrl).origin}/storage/v1/object/public/${config.bucket}/${path}`;
}

function assertSafePublicUrl(
  config: StorageConfig,
  publicUrl: string,
  path: string
): void {
  let url: URL;

  try {
    url = new URL(publicUrl);
  } catch {
    throw storageConfigurationInvalid("STORAGE_PUBLIC_URL");
  }

  const expected = new URL(deterministicPublicUrl(config, path));

  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw storageConfigurationInvalid("STORAGE_PUBLIC_URL");
  }
}

function assertBucketConfig(
  input: StorageBucketConfig,
  bucket: "web00-catalog-images"
): void {
  if (
    input.id !== bucket ||
    input.public !== true ||
    input.fileSizeLimit !== 5 * 1024 * 1024 ||
    input.allowedMimeTypes[0] !== "image/webp" ||
    input.allowedMimeTypes[1] !== "image/avif"
  ) {
    throw storageConfigurationInvalid("STORAGE_CONFIGURATION");
  }
}

function isCompatibleBucket(data: unknown): boolean {
  if (typeof data !== "object" || data === null) {
    return true;
  }

  const record = data as Record<string, unknown>;
  const publicValue = record.public;
  const fileSizeLimit = record.file_size_limit ?? record.fileSizeLimit;
  const allowedMimeTypes = record.allowed_mime_types ?? record.allowedMimeTypes;

  return (
    (publicValue === undefined || publicValue === true) &&
    (fileSizeLimit === undefined || fileSizeLimit === 5 * 1024 * 1024) &&
    (allowedMimeTypes === undefined ||
      (Array.isArray(allowedMimeTypes) &&
        allowedMimeTypes.includes("image/webp") &&
        allowedMimeTypes.includes("image/avif")))
  );
}

function storageOperationFailed(
  code: "IMAGE_STORAGE_TIMEOUT" | "STORAGE_UNAVAILABLE" | "STORAGE_WRITE_FAILED",
  message: string,
  statusCode: number,
  operation: PreviewStorageDiagnosticCode,
  providerError?: unknown
): ReturnType<typeof createImageAppError> {
  return attachPreviewUploadDiagnostic(
    createImageAppError(code, message, statusCode),
    createPreviewStorageDiagnostic(operation, providerError)
  );
}

function clientAborted(): ReturnType<typeof createImageAppError> {
  return createImageAppError(
    "CLIENT_ABORTED",
    "Image storage request was aborted.",
    499
  );
}

function requestCancelled(): ReturnType<typeof createImageAppError> {
  return createImageAppError(
    "REQUEST_CANCELLED",
    "Image storage request was cancelled.",
    499
  );
}

function storageConfigurationInvalid(
  operation: PreviewStorageDiagnosticCode,
  providerError?: unknown
): ReturnType<typeof createImageAppError> {
  return attachPreviewUploadDiagnostic(
    createImageAppError(
      "STORAGE_CONFIGURATION_INVALID",
      "Storage configuration is invalid.",
      503
    ),
    createPreviewStorageDiagnostic(operation, providerError)
  );
}
