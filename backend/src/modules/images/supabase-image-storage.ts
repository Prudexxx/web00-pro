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
    async inspectObjects(paths) {
      if (paths.length === 0) {
        return { existingPaths: [], missingPaths: [] };
      }

      const prefix = commonCanonicalPrefix(paths);
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
    async removeObjects(paths) {
      for (const path of paths) {
        assertVariantPath(path);
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
      throw storageOperationFailed(
        "STORAGE_WRITE_FAILED",
        "Storage write failed.",
        503,
        "STORAGE_UPLOAD"
      );
    }

    return {
      path: input.path,
      publicUrl: getPublicUrl()
    };
  } catch (error) {
    if (timed.didTimeout() || isAbortError(error)) {
      throw storageOperationFailed(
        "IMAGE_STORAGE_TIMEOUT",
        "Storage upload timed out.",
        503,
        "STORAGE_UPLOAD"
      );
    }

    throw error;
  } finally {
    timed.cleanup();
  }
}

function buildObjectUploadUrl(config: StorageConfig, path: string): string {
  const base = new URL(config.credentials.supabaseUrl);

  base.pathname = `/storage/v1/object/${config.bucket}/${path}`;
  base.search = "";
  base.hash = "";

  return base.toString();
}

function createTimedOperationSignal(
  context: ImageStorageOperationContext | undefined
): {
  cleanup: () => void;
  didTimeout: () => boolean;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;
  let abortListener: (() => void) | undefined;

  if (context?.signal?.aborted === true) {
    controller.abort(context.signal.reason);
  } else if (context?.signal !== undefined) {
    abortListener = () => {
      controller.abort(context.signal?.reason);
    };
    context.signal.addEventListener("abort", abortListener, { once: true });
  }

  if (context?.timeoutMs !== undefined) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("IMAGE_STORAGE_TIMEOUT"));
    }, context.timeoutMs);
  }

  return {
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
