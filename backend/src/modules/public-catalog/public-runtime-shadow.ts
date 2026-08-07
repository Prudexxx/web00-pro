import type {
  CloudRuRuntimeEnvConfig,
  CloudRuRuntimeStorageConfig
} from "../../config/cloudru-runtime-env.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError, type ErrorCode } from "../../lib/errors.js";
import { createCloudRuS3PublicRuntimeStorage } from "./cloudru-s3-public-runtime-storage.js";
import {
  createPrismaPublicCatalogControlStatusReader,
  createPrismaPublicCatalogSyncRepository,
  type PublicCatalogControlStatusReader,
  type PublicCatalogControlState
} from "./public-catalog-control.repository.js";
import {
  createPublicCatalogSyncService,
  type PublicCatalogSyncResult,
  type PublicCatalogSyncService
} from "./public-catalog-sync.service.js";
import type { PublicRuntimeStorage } from "./public-runtime-storage.js";

export const PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION = "WEB00-PUBLIC-RUNTIME-SHADOW-SYNC-V1";

export type PublicRuntimeShadowStatus =
  | "ready"
  | "pending"
  | "syncing"
  | "failed"
  | "setup_required"
  | "idle";

export interface PublicRuntimeShadowStatusDto {
  desiredRevision: number;
  enabled: true;
  itemsCount: number;
  lastSyncErrorCode: ErrorCode | null;
  mode: "shadow";
  publishedRevision: number;
  status: PublicRuntimeShadowStatus;
}

export interface PublicRuntimeShadowStatusService {
  getStatus(): Promise<PublicRuntimeShadowStatusDto>;
}

export interface PublicRuntimeShadowDependencies {
  statusService: PublicRuntimeShadowStatusService;
  storage: PublicRuntimeStorage;
  syncService: PublicCatalogSyncService;
}

export function createPublicRuntimeShadowDependencies(options: {
  createLeaseId?: () => string;
  createStorage?: (config: CloudRuRuntimeStorageConfig) => PublicRuntimeStorage;
  env: CloudRuRuntimeEnvConfig;
  now?: () => Date;
  prisma: PrismaClient;
}): PublicRuntimeShadowDependencies | null {
  if (!options.env.enabled) {
    return null;
  }

  const createStorage = options.createStorage ??
    ((config: CloudRuRuntimeStorageConfig) => createCloudRuS3PublicRuntimeStorage({ config }));
  const storage = createStorage(options.env.storage);
  const repository = createPrismaPublicCatalogSyncRepository({ prisma: options.prisma });

  return {
    statusService: createPublicRuntimeShadowStatusService({
      reader: createPrismaPublicCatalogControlStatusReader({ prisma: options.prisma })
    }),
    storage,
    syncService: createPublicCatalogSyncService({
      ...(options.createLeaseId === undefined ? {} : { createLeaseId: options.createLeaseId }),
      ...(options.now === undefined ? {} : { now: options.now }),
      pathPrefix: options.env.storage.prefix,
      repository,
      storage
    })
  };
}

export function createPublicRuntimeShadowStatusService(options: {
  reader: PublicCatalogControlStatusReader;
}): PublicRuntimeShadowStatusService {
  return {
    async getStatus() {
      const result = await options.reader.readState();

      if (result.kind === "setup_required") {
        return setupRequiredStatus();
      }
      if (result.state === null) {
        return idleStatus();
      }

      return normalizePublicRuntimeShadowStatusDto(stateToStatus(result.state));
    }
  };
}

export function normalizePublicRuntimeShadowStatusDto(
  status: PublicRuntimeShadowStatusDto
): PublicRuntimeShadowStatusDto {
  return {
    desiredRevision: safeNonNegativeInteger(status.desiredRevision),
    enabled: true,
    itemsCount: safeNonNegativeInteger(status.itemsCount),
    lastSyncErrorCode: safeLastSyncErrorCode(status.lastSyncErrorCode),
    mode: "shadow",
    publishedRevision: safeNonNegativeInteger(status.publishedRevision),
    status: safeStatus(status.status)
  };
}

export function normalizePublicRuntimeShadowSyncResult(
  result: PublicCatalogSyncResult
): { data: PublicRuntimeShadowStatusDto; statusCode: number } {
  if (result.status === "ready") {
    return {
      data: normalizePublicRuntimeShadowStatusDto({
        desiredRevision: result.desiredRevision,
        enabled: true,
        itemsCount: result.itemsCount,
        lastSyncErrorCode: null,
        mode: "shadow",
        publishedRevision: result.publishedRevision,
        status: "ready"
      }),
      statusCode: 200
    };
  }
  if (result.status === "pending") {
    return {
      data: normalizePublicRuntimeShadowStatusDto({
        desiredRevision: result.desiredRevision,
        enabled: true,
        itemsCount: 0,
        lastSyncErrorCode: null,
        mode: "shadow",
        publishedRevision: result.publishedRevision,
        status: "pending"
      }),
      statusCode: 202
    };
  }

  throw publicRuntimeShadowSyncError(result.errorCode);
}

export function publicRuntimeShadowSetupRequired(): AppError {
  return new AppError({
    code: "CONFIGURATION_ERROR",
    message: "Public runtime shadow setup is required.",
    statusCode: 503
  });
}

function stateToStatus(state: PublicCatalogControlState): PublicRuntimeShadowStatusDto {
  return {
    desiredRevision: state.desiredRevision,
    enabled: true,
    itemsCount: state.currentItemsCount ?? 0,
    lastSyncErrorCode: safeLastSyncErrorCode(state.lastSyncErrorCode),
    mode: "shadow",
    publishedRevision: state.publishedRevision,
    status: state.syncStatus
  };
}

function setupRequiredStatus(): PublicRuntimeShadowStatusDto {
  return {
    desiredRevision: 0,
    enabled: true,
    itemsCount: 0,
    lastSyncErrorCode: null,
    mode: "shadow",
    publishedRevision: 0,
    status: "setup_required"
  };
}

function idleStatus(): PublicRuntimeShadowStatusDto {
  return {
    desiredRevision: 0,
    enabled: true,
    itemsCount: 0,
    lastSyncErrorCode: null,
    mode: "shadow",
    publishedRevision: 0,
    status: "idle"
  };
}

function publicRuntimeShadowSyncError(value: string): AppError {
  const code = safeLastSyncErrorCode(value) ?? "PUBLIC_CATALOG_SYNC_FAILED";
  return new AppError({
    code,
    message: "Public runtime shadow sync failed.",
    statusCode: statusCodeForSyncError(code)
  });
}

function statusCodeForSyncError(code: ErrorCode): number {
  if (code === "PUBLIC_CATALOG_STORAGE_TIMEOUT") return 504;
  if (code === "PUBLIC_CATALOG_SYNC_CONFLICT") return 409;
  return 503;
}

function safeStatus(value: unknown): PublicRuntimeShadowStatus {
  if (
    value === "ready" ||
    value === "pending" ||
    value === "syncing" ||
    value === "failed" ||
    value === "setup_required" ||
    value === "idle"
  ) {
    return value;
  }
  return "failed";
}

function safeLastSyncErrorCode(value: unknown): ErrorCode | null {
  if (value === null || value === undefined) return null;
  if (
    value === "CONFIGURATION_ERROR" ||
    value === "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID" ||
    value === "PUBLIC_CATALOG_STORAGE_TIMEOUT" ||
    value === "PUBLIC_CATALOG_STORAGE_UNAVAILABLE" ||
    value === "PUBLIC_CATALOG_SNAPSHOT_INVALID" ||
    value === "PUBLIC_CATALOG_SYNC_CONFLICT" ||
    value === "PUBLIC_CATALOG_SYNC_FAILED"
  ) {
    return value;
  }
  return "PUBLIC_CATALOG_SYNC_FAILED";
}

function safeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
