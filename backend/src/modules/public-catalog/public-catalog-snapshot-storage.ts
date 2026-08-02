import type { StorageConfig } from "../../config/storage-env.js";
import { AppError } from "../../lib/errors.js";

export const PUBLIC_CATALOG_MANIFEST_PATH = "public-catalog/v1/manifest.json";

export interface PublicCatalogSnapshotStorageOptions {
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export interface PublicCatalogSnapshotUploadInput {
  body: string;
  path: string;
  requestId: string;
  timeoutMs: number;
  upsert: boolean;
}

export interface PublicCatalogSnapshotFetchInput {
  cacheBust: boolean;
  path: string;
  requestId: string;
  timeoutMs: number;
}

export interface PublicCatalogSnapshotStorage {
  fetchText(input: PublicCatalogSnapshotFetchInput): Promise<string>;
  getPublicUrl(path: string): string;
  uploadJson(input: PublicCatalogSnapshotUploadInput): Promise<void>;
}

export function buildPublicCatalogSnapshotPath(revision: number): string {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw storageConfigurationInvalid();
  }

  return `public-catalog/v1/snapshots/revision-${revision}.json`;
}

export function createPublicCatalogSnapshotStorage(
  config: StorageConfig,
  options: PublicCatalogSnapshotStorageOptions = {}
): PublicCatalogSnapshotStorage {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    async fetchText(input) {
      assertPublicCatalogStoragePath(input.path);
      const timed = createTimedSignal(input.timeoutMs);

      try {
        const result = await fetchImpl(buildPublicObjectUrl(config, input), {
          cache: "no-store",
          credentials: "omit",
          method: "GET",
          redirect: "error",
          signal: timed.signal
        });

        if (!result.ok) {
          await disposeResponseBody(result);
          throw storageUnavailable();
        }

        const contentType = result.headers.get("content-type") ?? "";
        if (!contentType.toLocaleLowerCase("en-US").includes("application/json")) {
          await disposeResponseBody(result);
          throw snapshotInvalid();
        }

        return await result.text();
      } catch (error) {
        throw mapStorageError(error, timed);
      } finally {
        timed.cleanup();
      }
    },

    getPublicUrl(path) {
      assertPublicCatalogStoragePath(path);
      return buildPublicObjectUrl(config, {
        cacheBust: false,
        path,
        requestId: "",
        timeoutMs: 1
      }).toString();
    },

    async uploadJson(input) {
      assertPublicCatalogStoragePath(input.path);
      const timed = createTimedSignal(input.timeoutMs);

      try {
        const result = await fetchImpl(buildServiceObjectUrl(config, input.path), {
          body: input.body,
          headers: {
            apikey: config.credentials.serviceRoleKey,
            authorization: `Bearer ${config.credentials.serviceRoleKey}`,
            "cache-control":
              input.path === PUBLIC_CATALOG_MANIFEST_PATH
                ? "no-cache"
                : "max-age=31536000, immutable",
            "content-type": "application/json; charset=utf-8",
            "x-upsert": input.upsert ? "true" : "false"
          },
          method: "POST",
          signal: timed.signal
        });

        if (!result.ok) {
          await disposeResponseBody(result);
          throw storageUnavailable();
        }

        await disposeResponseBody(result);
      } catch (error) {
        throw mapStorageError(error, timed);
      } finally {
        timed.cleanup();
      }
    }
  };
}

function assertPublicCatalogStoragePath(path: string): void {
  if (
    path !== PUBLIC_CATALOG_MANIFEST_PATH &&
    !/^public-catalog\/v1\/snapshots\/revision-[1-9][0-9]*\.json$/.test(path)
  ) {
    throw storageConfigurationInvalid();
  }
}

function buildServiceObjectUrl(config: StorageConfig, path: string): URL {
  const url = new URL(config.credentials.supabaseUrl);
  url.pathname = `/storage/v1/object/${config.bucket}/${path}`;
  url.search = "";
  url.hash = "";
  return url;
}

function buildPublicObjectUrl(
  config: StorageConfig,
  input: PublicCatalogSnapshotFetchInput
): URL {
  const url = new URL(config.publicBaseUrl);
  url.pathname = `/storage/v1/object/public/${config.bucket}/${input.path}`;
  url.hash = "";
  url.search = "";
  if (input.cacheBust) {
    url.searchParams.set("v", `${input.requestId}-${Date.now()}`);
  }
  return url;
}

function createTimedSignal(timeoutMs: number): {
  cleanup: () => void;
  didTimeout: () => boolean;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("PUBLIC_CATALOG_STORAGE_TIMEOUT"));
  }, timeoutMs);

  return {
    cleanup() {
      clearTimeout(timer);
    },
    didTimeout: () => timedOut,
    signal: controller.signal
  };
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

function mapStorageError(
  error: unknown,
  timed: ReturnType<typeof createTimedSignal>
): unknown {
  if (error instanceof AppError) {
    return error;
  }

  if (timed.didTimeout() || isAbortError(error)) {
    return new AppError({
      code: "PUBLIC_CATALOG_STORAGE_TIMEOUT",
      message: "Public catalog storage timed out.",
      statusCode: 503
    });
  }

  if (error instanceof TypeError) {
    return storageUnavailable();
  }

  return error;
}

function storageConfigurationInvalid(): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID",
    message: "Public catalog storage configuration is invalid.",
    statusCode: 503
  });
}

function storageUnavailable(): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
    message: "Public catalog storage is unavailable.",
    statusCode: 503
  });
}

function snapshotInvalid(): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_SNAPSHOT_INVALID",
    message: "Public catalog snapshot is invalid.",
    statusCode: 503
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
