import { createClient } from "@supabase/supabase-js";
import type { StorageConfig } from "../../config/storage-env.js";
import { AppError } from "../../lib/errors.js";
import type {
  AppLogger,
  PublicCatalogSnapshotStorageOperation
} from "../../lib/logger.js";
import type { SupabaseStorageLike } from "../images/supabase-image-storage.js";

export const PUBLIC_CATALOG_STORAGE_BUCKET = "web00-public-catalog";

export const PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG = {
  allowedMimeTypes: ["application/json"],
  fileSizeLimit: 2_097_152,
  id: PUBLIC_CATALOG_STORAGE_BUCKET,
  public: true
} as const;

export interface PublicCatalogBucketInspection {
  compatible: boolean;
  exists: boolean;
}

export type PublicCatalogStorageBucketInspection = PublicCatalogBucketInspection;

export type PublicCatalogStorageBucketEnsureResult =
  | {
      status: "created";
    }
  | {
      status: "ready";
    };

export interface PublicCatalogStorageBucketManager {
  ensureReady(input: PublicCatalogStorageBucketOperationInput): Promise<PublicCatalogStorageBucketEnsureResult>;
  inspect(input: PublicCatalogStorageBucketOperationInput): Promise<PublicCatalogStorageBucketInspection>;
}

export interface PublicCatalogStorageBucketOperationInput {
  requestId: string;
}

export interface PublicCatalogStorageBucketManagerOptions {
  client?: SupabaseStorageLike;
  logger?: Pick<AppLogger, "log">;
  now?: () => number;
}

type ProviderResult = {
  data: unknown;
  error: unknown;
};

type CreateBucketResult =
  | {
      status: "created";
    }
  | {
      startedAt: number;
      status: "failed";
      upstreamStatus: number | null;
    };

export function createPublicCatalogStorageBucketManager(
  config: StorageConfig,
  options: PublicCatalogStorageBucketManagerOptions = {}
): PublicCatalogStorageBucketManager {
  const client =
    options.client ??
    (createClient(config.credentials.supabaseUrl, config.credentials.serviceRoleKey, {
      auth: {
        persistSession: false
      }
    }) as SupabaseStorageLike);
  const storageClient = client.storage;
  const now = options.now ?? Date.now;

  async function inspectWithOperation(input: {
    operation: PublicCatalogSnapshotStorageOperation;
    requestId: string;
  }): Promise<PublicCatalogStorageBucketInspection> {
    const startedAt = now();

    try {
      if (storageClient.getBucket === undefined) {
        logBucketStorageFailure({
          logger: options.logger,
          now,
          operation: input.operation,
          requestId: input.requestId,
          startedAt,
          upstreamStatus: null
        });
        throw storageUnavailable();
      }

      const result = await storageClient.getBucket(PUBLIC_CATALOG_STORAGE_BUCKET);
      assertProviderResult(result);

      if (result.error !== null) {
        if (isMissingBucketError(result.error)) {
          return {
            compatible: false,
            exists: false
          };
        }

        logBucketStorageFailure({
          logger: options.logger,
          now,
          operation: input.operation,
          requestId: input.requestId,
          startedAt,
          upstreamStatus: safeUpstreamStatus(readProviderHttpStatus(result.error))
        });
        throw storageUnavailable();
      }

      if (typeof result.data !== "object" || result.data === null) {
        logBucketStorageFailure({
          logger: options.logger,
          now,
          operation: input.operation,
          requestId: input.requestId,
          startedAt,
          upstreamStatus: null
        });
        throw storageUnavailable();
      }

      return {
        compatible: isCompatiblePublicCatalogBucket(result.data),
        exists: true
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logBucketStorageFailure({
        logger: options.logger,
        now,
        operation: input.operation,
        requestId: input.requestId,
        startedAt,
        upstreamStatus: null
      });
      throw storageUnavailable();
    }
  }

  async function createBucket(input: {
    requestId: string;
  }): Promise<CreateBucketResult> {
    const startedAt = now();

    try {
      if (storageClient.createBucket === undefined) {
        return {
          startedAt,
          status: "failed",
          upstreamStatus: null
        };
      }

      const result = await storageClient.createBucket(PUBLIC_CATALOG_STORAGE_BUCKET, {
        allowedMimeTypes: [...PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG.allowedMimeTypes],
        fileSizeLimit: PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG.fileSizeLimit,
        public: PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG.public
      });
      assertProviderResult(result);

      if (result.error !== null) {
        return {
          startedAt,
          status: "failed",
          upstreamStatus: safeUpstreamStatus(readProviderHttpStatus(result.error))
        };
      }

      return { status: "created" };
    } catch {
      return {
        startedAt,
        status: "failed",
        upstreamStatus: null
      };
    }
  }

  return {
    async ensureReady(input) {
      const firstInspection = await inspectWithOperation({
        operation: "bucket_inspect",
        requestId: input.requestId
      });

      if (firstInspection.exists && firstInspection.compatible) {
        return { status: "ready" };
      }

      if (firstInspection.exists && !firstInspection.compatible) {
        throw storageConfigurationInvalid();
      }

      const createResult = await createBucket(input);
      let verified: PublicCatalogStorageBucketInspection;

      try {
        verified = await inspectWithOperation({
          operation: "bucket_verify",
          requestId: input.requestId
        });
      } catch (error) {
        logDeferredCreateFailure({
          createResult,
          logger: options.logger,
          now,
          requestId: input.requestId
        });
        throw error;
      }

      if (verified.exists && verified.compatible) {
        return {
          status: createResult.status === "created" ? "created" : "ready"
        };
      }

      logDeferredCreateFailure({
        createResult,
        logger: options.logger,
        now,
        requestId: input.requestId
      });

      if (verified.exists && !verified.compatible) {
        throw storageConfigurationInvalid();
      }

      throw storageUnavailable();
    },
    inspect(input) {
      return inspectWithOperation({
        operation: "bucket_inspect",
        requestId: input.requestId
      });
    }
  };
}

function logDeferredCreateFailure(input: {
  createResult: CreateBucketResult;
  logger: Pick<AppLogger, "log"> | undefined;
  now: () => number;
  requestId: string;
}): void {
  if (input.createResult.status !== "failed") {
    return;
  }

  logBucketStorageFailure({
    logger: input.logger,
    now: input.now,
    operation: "bucket_create",
    requestId: input.requestId,
    startedAt: input.createResult.startedAt,
    upstreamStatus: input.createResult.upstreamStatus
  });
}

function assertProviderResult(value: unknown): asserts value is ProviderResult {
  if (typeof value !== "object" || value === null || !("data" in value) || !("error" in value)) {
    throw storageUnavailable();
  }
}

function isCompatiblePublicCatalogBucket(data: object): boolean {
  const record = data as Record<string, unknown>;
  const id = record.id;
  const name = record.name;
  const publicValue = record.public;
  const fileSizeLimit = record.file_size_limit ?? record.fileSizeLimit;
  const allowedMimeTypes = record.allowed_mime_types ?? record.allowedMimeTypes;
  const parsedFileSizeLimit = readNumber(fileSizeLimit);

  return (
    (id === undefined || id === PUBLIC_CATALOG_STORAGE_BUCKET) &&
    (name === undefined || name === PUBLIC_CATALOG_STORAGE_BUCKET) &&
    (publicValue === undefined || publicValue === true) &&
    (fileSizeLimit === undefined ||
      (parsedFileSizeLimit !== null &&
        parsedFileSizeLimit >= PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG.fileSizeLimit)) &&
    (allowedMimeTypes === undefined ||
      (Array.isArray(allowedMimeTypes) &&
        allowedMimeTypes.includes("application/json")))
  );
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return Number(value);
  }

  return null;
}

function isMissingBucketError(error: unknown): boolean {
  const code = readProviderCode(error);
  const statusCode = readProviderStatusCode(error);
  const httpStatus = readProviderHttpStatus(error);

  if (code === "NoSuchBucket") {
    return true;
  }

  if (code !== null) {
    return false;
  }

  if (statusCode !== null) {
    return statusCode === "404";
  }

  return httpStatus === 404;
}

function readProviderCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const value = (error as Record<string, unknown>).code;

  return typeof value === "string" && value.length > 0 ? value : null;
}

function readProviderStatusCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const value = (error as Record<string, unknown>).statusCode;

  if (typeof value === "string" && /^[0-9]{3}$/.test(value)) {
    return value;
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }

  return null;
}

function readProviderHttpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const record = error as Record<string, unknown>;
  const rawStatus = record.status;

  if (typeof rawStatus === "number" && Number.isInteger(rawStatus)) {
    return rawStatus;
  }

  if (typeof rawStatus === "string" && /^[0-9]{3}$/.test(rawStatus)) {
    return Number(rawStatus);
  }

  return null;
}

function safeUpstreamStatus(status: number | null): number | null {
  return status !== null && status >= 400 && status <= 599 ? status : null;
}

function logBucketStorageFailure(input: {
  logger: Pick<AppLogger, "log"> | undefined;
  now: () => number;
  operation: PublicCatalogSnapshotStorageOperation;
  requestId: string;
  startedAt: number;
  upstreamStatus: number | null;
}): void {
  try {
    input.logger?.log({
      durationMs: Math.max(0, input.now() - input.startedAt),
      operation: input.operation,
      pathKind: "bucket",
      requestId: input.requestId,
      upstreamStatus: input.upstreamStatus
    });
  } catch {
    // Diagnostics must never replace the storage failure being reported.
  }
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
