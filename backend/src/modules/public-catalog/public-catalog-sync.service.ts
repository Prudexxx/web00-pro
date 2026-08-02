import { createHash } from "node:crypto";
import { AppError, type ErrorCode } from "../../lib/errors.js";
import type { AppLogger, PublicCatalogSyncFailedStage } from "../../lib/logger.js";
import type { ManagedImageUrlPolicy } from "../images/image.types.js";
import {
  buildPublicCatalogManifest,
  validatePublicCatalogManifest,
  validatePublicCatalogSnapshot,
  type PublicCatalogSnapshotSettings
} from "./public-catalog.snapshot.js";
import {
  preparePublicCatalogSnapshotCandidate
} from "./public-catalog-snapshot-preparation.js";
import type {
  FinalizePublicCatalogLeaseOptions,
  PublicCatalogControlState
} from "./public-catalog-control.repository.js";
import {
  PUBLIC_CATALOG_MANIFEST_PATH,
  buildPublicCatalogSnapshotPath,
  type PublicCatalogSnapshotStorage
} from "./public-catalog-snapshot-storage.js";
import type { PublicSiteRecord } from "./public-catalog.types.js";
import type {
  CreateStorageCleanupJobInput,
  StorageCleanupRepository
} from "../storage-cleanup/storage-cleanup.types.js";

export interface PublicCatalogSyncRepository {
  acquireLease(options: {
    leaseId: string;
    now: Date;
    ttlMs: number;
  }): Promise<PublicCatalogSyncLease | null>;
  failLease(options: PublicCatalogFailLeaseOptions): Promise<PublicCatalogControlState>;
  finalizeLease(options: FinalizePublicCatalogLeaseOptions): Promise<PublicCatalogControlState>;
  listSnapshotSites(): Promise<PublicSiteRecord[]>;
  readSettings(): Promise<PublicCatalogSnapshotSettings>;
}

export interface PublicCatalogSyncLease {
  leaseId: string;
  revision: number;
  state: PublicCatalogControlState;
}

export interface PublicCatalogFailLeaseOptions {
  errorCode: ErrorCode;
  leaseId: string;
  requestId: string;
}

export interface PublicCatalogSyncService {
  syncOnce(input: { requestId: string }): Promise<PublicCatalogSyncResult>;
}

export type PublicCatalogSyncResult =
  | {
      checksum: string;
      itemsCount: number;
      publishedRevision: number;
      requestId: string;
      snapshotPath: string;
      status: "ready";
    }
  | {
      desiredRevision: number;
      publishedRevision: number;
      requestId: string;
      status: "pending";
    }
  | {
      errorCode: ErrorCode;
      publishedRevision: number;
      requestId: string;
      status: "failed";
    };

export interface PublicCatalogSyncServiceOptions {
  cleanup?: Pick<StorageCleanupRepository, "createJobs">;
  createLeaseId?: () => string;
  imageUrlPolicy?: ManagedImageUrlPolicy;
  leaseTtlMs?: number;
  logger?: Pick<AppLogger, "log">;
  now?: () => Date;
  repository: PublicCatalogSyncRepository;
  storage: PublicCatalogSnapshotStorage;
  storageTimeoutMs?: number;
}

const defaultLeaseTtlMs = 60_000;
const defaultStorageTimeoutMs = 15_000;
const maxCoalescedSyncPasses = 2;

export function createPublicCatalogSyncService(
  options: PublicCatalogSyncServiceOptions
): PublicCatalogSyncService {
  const now = options.now ?? (() => new Date());
  const createLeaseId = options.createLeaseId ?? (() => crypto.randomUUID());
  const leaseTtlMs = options.leaseTtlMs ?? defaultLeaseTtlMs;
  const storageTimeoutMs = options.storageTimeoutMs ?? defaultStorageTimeoutMs;

  return {
    async syncOnce(input) {
      let lastPending:
        | { desiredRevision: number; publishedRevision: number }
        | null = null;

      for (let pass = 0; pass < maxCoalescedSyncPasses; pass += 1) {
        const lease = await runPublicCatalogSyncStage(
          {
            logger: options.logger,
            requestId: input.requestId,
            revision: null,
            stage: "lease"
          },
          () =>
            options.repository.acquireLease({
              leaseId: createLeaseId(),
              now: now(),
              ttlMs: leaseTtlMs
            })
        );

        if (lease === null) {
          return {
            desiredRevision: lastPending?.desiredRevision ?? 0,
            publishedRevision: lastPending?.publishedRevision ?? 0,
            requestId: input.requestId,
            status: "pending"
          };
        }

        try {
          const settings = await runPublicCatalogSyncStage(
            {
              logger: options.logger,
              requestId: input.requestId,
              revision: lease.revision,
              stage: "settings"
            },
            () => options.repository.readSettings()
          );
          const records = await runPublicCatalogSyncStage(
            {
              logger: options.logger,
              requestId: input.requestId,
              revision: lease.revision,
              stage: "projection"
            },
            () => options.repository.listSnapshotSites()
          );
          const { built, snapshotPath } = await runPublicCatalogSyncStage(
            {
              logger: options.logger,
              requestId: input.requestId,
              revision: lease.revision,
              stage: "snapshot_build"
            },
            async () => {
              const preparationInput = {
                generatedAt: now(),
                records,
                revision: lease.revision,
                settings
              };
              const prepared = await preparePublicCatalogSnapshotCandidate(
                options.imageUrlPolicy === undefined
                  ? preparationInput
                  : { ...preparationInput, imageUrlPolicy: options.imageUrlPolicy }
              );
              if (prepared.status === "blocked") {
                throw new Error("Public catalog snapshot candidate blocked.");
              }

              return {
                built: prepared.built,
                snapshotPath: buildPublicCatalogSnapshotPath(lease.revision)
              };
            }
          );

          await runPublicCatalogSyncStage(
            {
              logger: options.logger,
              requestId: input.requestId,
              revision: lease.revision,
              stage: "snapshot_upload"
            },
            () =>
              options.storage.uploadJson({
                body: built.bytes,
                path: snapshotPath,
                requestId: input.requestId,
                timeoutMs: storageTimeoutMs,
                upsert: false
              })
          );

          await runPublicCatalogSyncStage(
            {
              logger: options.logger,
              requestId: input.requestId,
              revision: lease.revision,
              stage: "snapshot_verify"
            },
            async () => {
              const fetchedSnapshot = await options.storage.fetchText({
                cacheBust: false,
                path: snapshotPath,
                requestId: input.requestId,
                timeoutMs: storageTimeoutMs
              });

              assertFetchedSnapshot(fetchedSnapshot, built.bytes, built.sha256);
            }
          );

          await runPublicCatalogSyncStage(
            {
              logger: options.logger,
              requestId: input.requestId,
              revision: lease.revision,
              stage: "manifest_upload"
            },
            async () => {
              const manifest = buildPublicCatalogManifest({
                generatedAt: now(),
                itemsCount: built.snapshot.itemsCount,
                revision: built.snapshot.revision,
                sha256: built.sha256,
                snapshotPath,
                snapshotUrl: options.storage.getPublicUrl(snapshotPath)
              });
              const manifestBytes = `${JSON.stringify(manifest)}\n`;

              await options.storage.uploadJson({
                body: manifestBytes,
                path: PUBLIC_CATALOG_MANIFEST_PATH,
                requestId: input.requestId,
                timeoutMs: storageTimeoutMs,
                upsert: true
              });
            }
          );

          await runPublicCatalogSyncStage(
            {
              logger: options.logger,
              requestId: input.requestId,
              revision: lease.revision,
              stage: "manifest_verify"
            },
            async () => {
              const fetchedManifest = await options.storage.fetchText({
                cacheBust: true,
                path: PUBLIC_CATALOG_MANIFEST_PATH,
                requestId: input.requestId,
                timeoutMs: storageTimeoutMs
              });
              const verifiedManifest = validatePublicCatalogManifest(JSON.parse(fetchedManifest));

              if (
                verifiedManifest.revision !== built.snapshot.revision ||
                verifiedManifest.sha256 !== built.sha256 ||
                verifiedManifest.itemsCount !== built.snapshot.itemsCount ||
                verifiedManifest.snapshotPath !== snapshotPath
              ) {
                throw snapshotInvalid();
              }
            }
          );

          const finalized = await runPublicCatalogSyncStage(
            {
              logger: options.logger,
              requestId: input.requestId,
              revision: lease.revision,
              stage: "db_finalize"
            },
            () =>
              options.repository.finalizeLease({
                checksum: built.sha256,
                itemsCount: built.snapshot.itemsCount,
                leaseId: lease.leaseId,
                publishedRevision: lease.revision,
                requestId: input.requestId,
                snapshotPath
              })
          );

          await enqueuePublicCatalogRetentionCleanup({
            cleanup: options.cleanup,
            now: now(),
            previousPublishedRevision: lease.state.publishedRevision,
            publishedRevision: lease.revision,
            timeoutMs: storageTimeoutMs
          });

          if (finalized.syncStatus === "pending") {
            lastPending = {
              desiredRevision: finalized.desiredRevision,
              publishedRevision: finalized.publishedRevision
            };
            continue;
          }

          return {
            checksum: built.sha256,
            itemsCount: built.snapshot.itemsCount,
            publishedRevision: lease.revision,
            requestId: input.requestId,
            snapshotPath,
            status: "ready"
          };
        } catch (error) {
          const errorCode = toPublicCatalogSyncErrorCode(error);
          const failed = await options.repository.failLease({
            errorCode,
            leaseId: lease.leaseId,
            requestId: input.requestId
          });

          return {
            errorCode,
            publishedRevision: failed.publishedRevision,
            requestId: input.requestId,
            status: "failed"
          };
        }
      }

      return {
        desiredRevision: lastPending?.desiredRevision ?? 0,
        publishedRevision: lastPending?.publishedRevision ?? 0,
        requestId: input.requestId,
        status: "pending"
      };
    }
  };
}

async function runPublicCatalogSyncStage<T>(
  input: {
    logger: Pick<AppLogger, "log"> | undefined;
    requestId: string;
    revision: number | null;
    stage: PublicCatalogSyncFailedStage;
  },
  operation: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();

  try {
    return await operation();
  } catch (error) {
    logPublicCatalogSyncStageFailure({
      durationMs: Math.max(0, Date.now() - startedAt),
      error,
      logger: input.logger,
      requestId: input.requestId,
      revision: input.revision,
      stage: input.stage
    });
    throw error;
  }
}

function logPublicCatalogSyncStageFailure(input: {
  durationMs: number;
  error: unknown;
  logger: Pick<AppLogger, "log"> | undefined;
  requestId: string;
  revision: number | null;
  stage: PublicCatalogSyncFailedStage;
}): void {
  try {
    input.logger?.log({
      durationMs: input.durationMs,
      errorClass: safeErrorClass(input.error),
      errorCode: toPublicCatalogSyncErrorCode(input.error),
      requestId: input.requestId,
      revision: input.revision,
      stage: input.stage
    });
  } catch {
    // Diagnostics must never replace the sync failure being reported.
  }
}

async function enqueuePublicCatalogRetentionCleanup(options: {
  cleanup: Pick<StorageCleanupRepository, "createJobs"> | undefined;
  now: Date;
  previousPublishedRevision: number;
  publishedRevision: number;
  timeoutMs: number;
}): Promise<void> {
  if (options.cleanup === undefined) {
    return;
  }

  const firstNewlyObsoleteRevision = Math.max(1, options.previousPublishedRevision - 19);
  const lastObsoleteRevision = options.publishedRevision - 20;
  if (lastObsoleteRevision < firstNewlyObsoleteRevision) {
    return;
  }

  const jobs: CreateStorageCleanupJobInput[] = [];
  for (
    let revision = firstNewlyObsoleteRevision;
    revision <= lastObsoleteRevision;
    revision += 1
  ) {
    jobs.push({
      entityId: String(revision),
      entityType: "public_catalog_snapshot",
      reason: "public_catalog_retention",
      runAfter: options.now,
      storagePath: buildPublicCatalogSnapshotPath(revision)
    });
  }

  try {
    await options.cleanup.createJobs(jobs, { timeoutMs: options.timeoutMs });
  } catch {
    // Snapshot retention is best-effort after a verified manifest. The current
    // and previous manifest versions remain valid; cleanup retries can be
    // scheduled by a later successful sync.
  }
}

function assertFetchedSnapshot(
  fetchedSnapshot: string,
  expectedBytes: string,
  expectedSha256: string
): void {
  if (fetchedSnapshot !== expectedBytes) {
    throw snapshotInvalid();
  }

  const parsed = validatePublicCatalogSnapshot(JSON.parse(fetchedSnapshot));
  const actualBytes = `${JSON.stringify(parsed)}\n`;
  const actualSha256 = createHash("sha256").update(fetchedSnapshot, "utf8").digest("hex");

  if (
    actualBytes.length === 0 ||
    expectedSha256.length !== 64 ||
    actualSha256 !== expectedSha256
  ) {
    throw snapshotInvalid();
  }
}

function toPublicCatalogSyncErrorCode(error: unknown): ErrorCode {
  if (
    error instanceof AppError &&
    (error.code === "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID" ||
      error.code === "PUBLIC_CATALOG_STORAGE_TIMEOUT" ||
      error.code === "PUBLIC_CATALOG_STORAGE_UNAVAILABLE" ||
      error.code === "PUBLIC_CATALOG_SNAPSHOT_INVALID" ||
      error.code === "PUBLIC_CATALOG_SYNC_CONFLICT")
  ) {
    return error.code;
  }

  return "PUBLIC_CATALOG_SYNC_FAILED";
}

function safeErrorClass(error: unknown): string {
  const value =
    error instanceof Error
      ? error.name || error.constructor.name
      : typeof error === "object" && error !== null
        ? "NonErrorObject"
        : "NonError";

  return /^[A-Za-z][A-Za-z0-9_.-]{0,80}$/.test(value) ? value : "Error";
}

function snapshotInvalid(): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_SNAPSHOT_INVALID",
    message: "Public catalog snapshot is invalid.",
    statusCode: 503
  });
}
