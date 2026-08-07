import { AppError, type ErrorCode } from "../../lib/errors.js";
import { mapSiteDetail } from "./public-catalog.mapper.js";
import {
  buildPublicCatalogManifest,
  buildPublicCatalogSnapshot,
  serializePublicCatalogManifest,
  sha256Hex,
  validatePublicCatalogManifest,
  validatePublicCatalogSnapshot,
  type PublicCatalogManifest,
  type PublicCatalogSnapshotSettings
} from "./public-catalog.snapshot.js";
import type {
  PublicCatalogControlState,
  PublicCatalogSyncStatus
} from "./public-catalog-control.repository.js";
import type { PublicSiteRecord } from "./public-catalog.types.js";
import {
  createPublicRuntimePathBuilder,
  type PublicRuntimePathBuilder,
  type PublicRuntimeStorage,
  type RuntimeReadResult
} from "./public-runtime-storage.js";

export type { PublicCatalogSnapshotSettings } from "./public-catalog.snapshot.js";

export interface PublicCatalogSyncLease {
  leaseId: string;
  revision: number;
  state: PublicCatalogControlState;
}

export interface PublicCatalogSyncRepository {
  acquireLease(input: {
    leaseId: string;
    now: Date;
    ttlMs: number;
  }): Promise<PublicCatalogSyncLease | null>;
  failLease(input: {
    errorCode: ErrorCode;
    leaseId: string;
    requestId: string;
  }): Promise<PublicCatalogControlState>;
  finalizeLease(input: {
    checksum: string;
    generatedAt: Date;
    itemsCount: number;
    leaseId: string;
    publishedRevision: number;
    requestId: string;
    snapshotPath: string;
  }): Promise<PublicCatalogControlState>;
  listSnapshotSites(): Promise<PublicSiteRecord[]>;
  readCurrentState(): Promise<PublicCatalogControlState | null>;
  readSettings(): Promise<PublicCatalogSnapshotSettings>;
  verifyLeaseOwnership(input: {
    leaseId: string;
    now: Date;
    targetRevision: number;
    ttlMs: number;
  }): Promise<boolean>;
}

export interface PublicCatalogSyncService {
  syncOnce(input: { requestId: string }): Promise<PublicCatalogSyncResult>;
}

export type PublicCatalogSyncResult =
  | {
      desiredRevision: number;
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
      desiredRevision: number;
      errorCode: ErrorCode;
      publishedRevision: number;
      requestId: string;
      status: "failed";
    };

export function createPublicCatalogSyncService(options: {
  createLeaseId?: () => string;
  leaseTtlMs?: number;
  maxPasses?: number;
  now?: () => Date;
  pathPrefix?: string;
  repository: PublicCatalogSyncRepository;
  storage: PublicRuntimeStorage;
}): PublicCatalogSyncService {
  const now = options.now ?? (() => new Date());
  const createLeaseId = options.createLeaseId ?? (() => crypto.randomUUID());
  const leaseTtlMs = options.leaseTtlMs ?? 60_000;
  const maxPasses = options.maxPasses ?? 3;
  const pathBuilder = createPublicRuntimePathBuilder({
    prefix: options.pathPrefix ?? "",
    publicBaseUrl: "https://public-runtime.invalid"
  });

  return {
    async syncOnce(input) {
      let lastPending: PublicCatalogSyncResult | null = null;
      for (let pass = 0; pass < maxPasses; pass += 1) {
        const leaseNow = now();
        const lease = await options.repository.acquireLease({
          leaseId: createLeaseId(),
          now: leaseNow,
          ttlMs: leaseTtlMs
        });

        if (lease === null) {
          return noLeaseResult(
            await options.repository.readCurrentState(),
            input.requestId,
            leaseNow
          ) ?? lastPending ?? zeroPending(input.requestId);
        }

        try {
          const recovered = await recoverManifestIfAlreadyPublished({
            lease,
            pathBuilder,
            repository: options.repository,
            requestId: input.requestId,
            storage: options.storage
          });
          if (recovered !== null) {
            if (recovered.status === "pending") {
              lastPending = recovered;
              continue;
            }
            return recovered;
          }

          const generatedAt = now();
          const records = await options.repository.listSnapshotSites();
          const settings = await options.repository.readSettings();
          const built = await buildPublicCatalogSnapshot({
            generatedAt,
            items: records.map((record) => mapSiteDetail(record)),
            revision: lease.revision,
            settings
          });
          const snapshotPath = pathBuilder.snapshotPath(lease.revision, built.sha256);

          await options.storage.putImmutableObject({
            body: built.bytes,
            contentType: "application/json; charset=utf-8",
            path: snapshotPath,
            sha256: built.sha256
          });
          await verifySnapshotReadBack(
            await options.storage.getAuthenticatedObject({ path: snapshotPath }),
            built.sha256,
            lease.revision
          );
          await verifySnapshotReadBack(
            await options.storage.getPublicObject({ addNonce: true, path: snapshotPath }),
            built.sha256,
            lease.revision
          );
          const ownsLease = await options.repository.verifyLeaseOwnership({
            leaseId: lease.leaseId,
            now: now(),
            targetRevision: lease.revision,
            ttlMs: leaseTtlMs
          });
          if (!ownsLease) {
            return {
              desiredRevision: lease.state.desiredRevision,
              publishedRevision: lease.state.publishedRevision,
              requestId: input.requestId,
              status: "pending"
            };
          }

          const manifest = buildPublicCatalogManifest({
            generatedAt,
            itemsCount: built.snapshot.itemsCount,
            revision: lease.revision,
            sha256: built.sha256,
            snapshotPath,
            snapshotUrl: options.storage.getPublicUrl(snapshotPath)
          });
          const manifestBytes = serializePublicCatalogManifest(manifest);
          await options.storage.putMutableManifest({
            body: manifestBytes,
            contentType: "application/json; charset=utf-8",
            path: pathBuilder.manifestPath(),
            sha256: sha256Hex(manifestBytes)
          });
          await verifyManifestReadBack(
            await options.storage.getPublicObject({ addNonce: true, path: pathBuilder.manifestPath() }),
            manifest
          );

          const finalized = await options.repository.finalizeLease({
            checksum: built.sha256,
            generatedAt,
            itemsCount: built.snapshot.itemsCount,
            leaseId: lease.leaseId,
            publishedRevision: lease.revision,
            requestId: input.requestId,
            snapshotPath
          });
          const result = stateToResult(finalized, input.requestId);
          if (result.status === "pending") {
            lastPending = result;
            continue;
          }
          return result;
        } catch (error) {
          const errorCode = toSyncErrorCode(error);
          const failed = await options.repository.failLease({
            errorCode,
            leaseId: lease.leaseId,
            requestId: input.requestId
          });
          return {
            desiredRevision: failed.desiredRevision,
            errorCode,
            publishedRevision: failed.publishedRevision,
            requestId: input.requestId,
            status: "failed"
          };
        }
      }

      return lastPending ?? zeroPending(input.requestId);
    }
  };
}

async function recoverManifestIfAlreadyPublished(input: {
  lease: PublicCatalogSyncLease;
  pathBuilder: PublicRuntimePathBuilder;
  repository: PublicCatalogSyncRepository;
  requestId: string;
  storage: PublicRuntimeStorage;
}): Promise<PublicCatalogSyncResult | null> {
  let manifest: PublicCatalogManifest;
  try {
    const publicManifest = await input.storage.getPublicObject({
      addNonce: true,
      path: input.pathBuilder.manifestPath()
    });
    manifest = validatePublicCatalogManifest(JSON.parse(publicManifest.body.toString("utf8")));
  } catch {
    return null;
  }

  if (manifest.revision !== input.lease.revision) {
    return null;
  }
  const expectedSnapshotPath = input.pathBuilder.snapshotPath(manifest.revision, manifest.sha256);
  if (
    manifest.snapshotPath !== expectedSnapshotPath ||
    manifest.snapshotUrl !== input.storage.getPublicUrl(expectedSnapshotPath)
  ) {
    return null;
  }

  await verifySnapshotReadBack(
    await input.storage.getPublicObject({ addNonce: true, path: manifest.snapshotPath }),
    manifest.sha256,
    manifest.revision
  );
  const finalized = await input.repository.finalizeLease({
    checksum: manifest.sha256,
    generatedAt: new Date(manifest.generatedAt),
    itemsCount: manifest.itemsCount,
    leaseId: input.lease.leaseId,
    publishedRevision: manifest.revision,
    requestId: input.requestId,
    snapshotPath: manifest.snapshotPath
  });
  return stateToResult(finalized, input.requestId);
}

async function verifySnapshotReadBack(
  read: RuntimeReadResult,
  expectedSha256: string,
  expectedRevision: number
): Promise<void> {
  if (sha256Hex(read.body) !== expectedSha256) {
    throw snapshotInvalid();
  }
  const snapshot = validatePublicCatalogSnapshot(JSON.parse(read.body.toString("utf8")));
  if (snapshot.revision !== expectedRevision) {
    throw snapshotInvalid();
  }
}

async function verifyManifestReadBack(
  read: RuntimeReadResult,
  expected: PublicCatalogManifest
): Promise<void> {
  const manifest = validatePublicCatalogManifest(JSON.parse(read.body.toString("utf8")));
  if (
    manifest.revision !== expected.revision ||
    manifest.sha256 !== expected.sha256 ||
    manifest.snapshotPath !== expected.snapshotPath ||
    manifest.itemsCount !== expected.itemsCount
  ) {
    throw snapshotInvalid();
  }
}

function stateToResult(
  state: PublicCatalogControlState,
  requestId: string
): PublicCatalogSyncResult {
  if (state.syncStatus === "ready") {
    return {
      desiredRevision: state.desiredRevision,
      itemsCount: state.currentItemsCount ?? 0,
      publishedRevision: state.publishedRevision,
      requestId,
      snapshotPath: state.currentSnapshotPath ?? "",
      status: "ready"
    };
  }
  return {
    desiredRevision: state.desiredRevision,
    publishedRevision: state.publishedRevision,
    requestId,
    status: state.syncStatus === "failed" ? "failed" : "pending",
    ...(state.syncStatus === "failed"
      ? { errorCode: safeErrorCode(state.lastSyncErrorCode) }
      : {})
  } as PublicCatalogSyncResult;
}

function noLeaseResult(
  state: PublicCatalogControlState | null,
  requestId: string,
  now: Date
): PublicCatalogSyncResult {
  if (state === null) {
    throw setupRequired();
  }
  if (isCleanReadyState(state, now)) {
    return stateToResult(state, requestId);
  }
  return {
    desiredRevision: state.desiredRevision,
    publishedRevision: state.publishedRevision,
    requestId,
    status: "pending"
  };
}

function isCleanReadyState(state: PublicCatalogControlState, now: Date): boolean {
  return (
    state.syncStatus === "ready" &&
    state.desiredRevision === state.publishedRevision &&
    (state.syncLeaseId === null ||
      state.syncLeaseExpiresAt === null ||
      state.syncLeaseExpiresAt.getTime() <= now.getTime())
  );
}

function zeroPending(requestId: string): PublicCatalogSyncResult {
  return {
    desiredRevision: 0,
    publishedRevision: 0,
    requestId,
    status: "pending"
  };
}

function toSyncErrorCode(error: unknown): ErrorCode {
  if (error instanceof AppError) {
    if (
      error.code === "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID" ||
      error.code === "PUBLIC_CATALOG_STORAGE_TIMEOUT" ||
      error.code === "PUBLIC_CATALOG_STORAGE_UNAVAILABLE" ||
      error.code === "PUBLIC_CATALOG_SNAPSHOT_INVALID" ||
      error.code === "PUBLIC_CATALOG_SYNC_CONFLICT"
    ) {
      return error.code;
    }
  }
  return "PUBLIC_CATALOG_SYNC_FAILED";
}

function safeErrorCode(value: string | null): ErrorCode {
  if (value === "PUBLIC_CATALOG_SNAPSHOT_INVALID") return value;
  if (value === "PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID") return value;
  if (value === "PUBLIC_CATALOG_STORAGE_TIMEOUT") return value;
  if (value === "PUBLIC_CATALOG_STORAGE_UNAVAILABLE") return value;
  if (value === "PUBLIC_CATALOG_SYNC_CONFLICT") return value;
  return "PUBLIC_CATALOG_SYNC_FAILED";
}

function snapshotInvalid(): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_SNAPSHOT_INVALID",
    message: "Public catalog snapshot verification failed.",
    statusCode: 503
  });
}

function setupRequired(): AppError {
  return new AppError({
    code: "CONFIGURATION_ERROR",
    message: "Public catalog runtime setup is required.",
    statusCode: 503
  });
}

export function isPublicCatalogTerminalSyncStatus(
  status: PublicCatalogSyncStatus
): boolean {
  return status === "ready" || status === "failed";
}
