import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError, type ErrorCode } from "../../lib/errors.js";
import { publicSiteSelect } from "./public-catalog.repository.js";
import { siteOrderBy } from "./public-catalog.sort.js";
import {
  publicCategoryVisibilityWhere,
  publicSiteVisibilityWhere
} from "./public-catalog.visibility.js";
import type { PublicSiteRecord } from "./public-catalog.types.js";
import type {
  PublicCatalogSyncLease,
  PublicCatalogSyncRepository
} from "./public-catalog-sync.service.js";

export const PUBLIC_CATALOG_CONTROL_ID = "public-catalog";

export const PUBLIC_CATALOG_SYNC_STATUSES = ["pending", "syncing", "ready", "failed"] as const;

export type PublicCatalogSyncStatus = (typeof PUBLIC_CATALOG_SYNC_STATUSES)[number];

export interface PublicCatalogControlState {
  currentItemsCount: number | null;
  currentSnapshotChecksum: string | null;
  currentSnapshotPath: string | null;
  desiredRevision: number;
  id: string;
  lastSyncErrorCode: string | null;
  lastSyncRequestId: string | null;
  publishedRevision: number;
  showDemoInModal: boolean;
  syncLeaseExpiresAt: Date | null;
  syncLeaseId: string | null;
  syncStatus: PublicCatalogSyncStatus;
}

export interface AcquirePublicCatalogLeaseOptions {
  leaseId: string;
  now: Date;
  ttlMs: number;
}

export interface AcquiredPublicCatalogLease {
  revision: number;
  state: PublicCatalogControlState;
}

export interface FinalizePublicCatalogLeaseOptions {
  checksum: string;
  itemsCount: number;
  leaseId: string;
  publishedRevision: number;
  requestId: string;
  snapshotPath: string;
}

export interface PublicCatalogDirtyContext {
  actorUserId?: string;
  reasonContext?: Record<string, unknown>;
  requestId: string;
}

export type MarkPublicCatalogDirtyResult =
  | { desiredRevision: number; marked: true }
  | { marked: false; reason: "control_table_missing" | "no_public_change" };

type PublicCatalogControlRow = Omit<PublicCatalogControlState, "syncStatus"> & {
  syncStatus: string;
};

export function assertPublicCatalogRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Invalid public catalog revision.");
  }

  return value;
}

export function validatePublicCatalogControlState(
  state: PublicCatalogControlState
): PublicCatalogControlState {
  if (state.id !== PUBLIC_CATALOG_CONTROL_ID) {
    throw new Error("Invalid public catalog singleton id.");
  }

  if (!isPublicCatalogSyncStatus(state.syncStatus)) {
    throw new Error("Invalid public catalog syncStatus.");
  }

  assertPublicCatalogRevision(state.desiredRevision);

  if (!Number.isSafeInteger(state.publishedRevision) || state.publishedRevision < 0) {
    throw new Error("Invalid public catalog published revision.");
  }

  if (state.desiredRevision < state.publishedRevision) {
    throw new Error("Invalid public catalog desiredRevision invariant.");
  }

  if (state.syncStatus === "ready" && state.desiredRevision !== state.publishedRevision) {
    throw new Error("Invalid ready public catalog revision invariant.");
  }

  return state;
}

export function markPublicCatalogDirtyState(
  state: PublicCatalogControlState,
  _reason: string
): PublicCatalogControlState {
  validatePublicCatalogControlState(state);

  const desiredRevision = assertPublicCatalogRevision(state.desiredRevision + 1);

  return validatePublicCatalogControlState({
    ...state,
    desiredRevision,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    syncStatus: "pending"
  });
}

export function recoverStalePublicCatalogLeaseState(
  state: PublicCatalogControlState,
  now: Date
): PublicCatalogControlState {
  validatePublicCatalogControlState(state);

  if (
    state.syncStatus !== "syncing" ||
    state.syncLeaseExpiresAt === null ||
    state.syncLeaseExpiresAt.getTime() > now.getTime()
  ) {
    return state;
  }

  return validatePublicCatalogControlState({
    ...state,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "pending"
  });
}

export function acquirePublicCatalogLeaseState(
  state: PublicCatalogControlState,
  options: AcquirePublicCatalogLeaseOptions
): AcquiredPublicCatalogLease {
  const recovered = recoverStalePublicCatalogLeaseState(state, options.now);

  if (recovered.syncStatus === "syncing") {
    throw new Error("Public catalog sync lease is already active.");
  }

  if (recovered.syncStatus === "ready" && recovered.desiredRevision === recovered.publishedRevision) {
    throw new Error("Public catalog has no pending revision.");
  }

  const revision = assertPublicCatalogRevision(recovered.publishedRevision + 1);
  const targetRevision = Math.min(revision, recovered.desiredRevision);

  return {
    revision: targetRevision,
    state: validatePublicCatalogControlState({
      ...recovered,
      syncLeaseExpiresAt: new Date(options.now.getTime() + options.ttlMs),
      syncLeaseId: options.leaseId,
      syncStatus: "syncing"
    })
  };
}

export function finalizePublicCatalogLeaseState(
  state: PublicCatalogControlState,
  options: FinalizePublicCatalogLeaseOptions
): PublicCatalogControlState {
  validatePublicCatalogControlState(state);

  if (state.syncLeaseId !== options.leaseId) {
    throw new Error("Public catalog lease mismatch.");
  }

  if (
    !Number.isSafeInteger(options.publishedRevision) ||
    options.publishedRevision <= state.publishedRevision ||
    options.publishedRevision > state.desiredRevision
  ) {
    throw new Error("Invalid public catalog finalize revision.");
  }

  if (!/^[a-f0-9]{64}$/.test(options.checksum)) {
    throw new Error("Invalid public catalog checksum.");
  }

  if (!Number.isSafeInteger(options.itemsCount) || options.itemsCount < 0) {
    throw new Error("Invalid public catalog items count.");
  }

  const nextStatus: PublicCatalogSyncStatus =
    options.publishedRevision === state.desiredRevision ? "ready" : "pending";

  return validatePublicCatalogControlState({
    ...state,
    currentItemsCount: options.itemsCount,
    currentSnapshotChecksum: options.checksum,
    currentSnapshotPath: options.snapshotPath,
    lastSyncErrorCode: null,
    lastSyncRequestId: options.requestId,
    publishedRevision: options.publishedRevision,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: nextStatus
  });
}

export async function ensurePublicCatalogControl(
  prisma: PrismaClient
): Promise<PublicCatalogControlState> {
  const row = (await prisma.publicCatalogControl.upsert({
    create: {
      id: PUBLIC_CATALOG_CONTROL_ID
    },
    update: {},
    where: {
      id: PUBLIC_CATALOG_CONTROL_ID
    }
  })) as PublicCatalogControlRow;

  return rowToState(row);
}

export async function markPublicCatalogDirty(
  tx: Prisma.TransactionClient,
  reason: string,
  context: PublicCatalogDirtyContext
): Promise<MarkPublicCatalogDirtyResult> {
  try {
    const existing = (await tx.publicCatalogControl.findUnique({
      where: { id: PUBLIC_CATALOG_CONTROL_ID }
    })) as PublicCatalogControlRow | null;
    const before =
      existing === null
        ? defaultControlState()
        : rowToState(existing);
    const next = markPublicCatalogDirtyState(before, reason);

    await tx.publicCatalogControl.upsert({
      create: {
        desiredRevision: next.desiredRevision,
        id: PUBLIC_CATALOG_CONTROL_ID,
        lastSyncErrorCode: null,
        lastSyncRequestId: null,
        syncStatus: next.syncStatus
      },
      update: {
        desiredRevision: next.desiredRevision,
        lastSyncErrorCode: null,
        lastSyncRequestId: null,
        syncStatus: next.syncStatus
      },
      where: { id: PUBLIC_CATALOG_CONTROL_ID }
    });

    await tx.auditLog.create({
      data: {
        action: "public_catalog.dirty",
        actorUserId: context.actorUserId ?? null,
        afterJson: {
          desiredRevision: next.desiredRevision,
          reason,
          reasonContext:
            context.reasonContext === undefined
              ? null
              : (context.reasonContext as Prisma.InputJsonObject)
        } satisfies Prisma.InputJsonObject,
        beforeJson: {
          desiredRevision: before.desiredRevision,
          publishedRevision: before.publishedRevision
        },
        entityId: null,
        entityType: "public_catalog",
        ipHash: null,
        requestId: context.requestId,
        userAgentHash: null
      }
    });

    return {
      desiredRevision: next.desiredRevision,
      marked: true
    };
  } catch (error) {
    if (isMissingPublicCatalogControlTable(error)) {
      return {
        marked: false,
        reason: "control_table_missing"
      };
    }

    throw error;
  }
}

export function createPrismaPublicCatalogSyncRepository(
  options: { prisma: PrismaClient }
): PublicCatalogSyncRepository {
  const prisma = options.prisma;

  return {
    async acquireLease(input) {
      let state: PublicCatalogControlState;
      try {
        state = await ensurePublicCatalogControl(prisma);
      } catch (error) {
        if (isMissingPublicCatalogControlTable(error)) {
          return null;
        }

        throw error;
      }

      if (state.syncStatus === "ready" && state.desiredRevision === state.publishedRevision) {
        return null;
      }

      const acquired = acquirePublicCatalogLeaseState(state, input);

      const updated = await prisma.publicCatalogControl.updateMany({
        data: {
          syncLeaseExpiresAt: acquired.state.syncLeaseExpiresAt,
          syncLeaseId: acquired.state.syncLeaseId,
          syncStatus: acquired.state.syncStatus
        },
        where: {
          desiredRevision: state.desiredRevision,
          id: PUBLIC_CATALOG_CONTROL_ID,
          publishedRevision: state.publishedRevision,
          syncLeaseExpiresAt: state.syncLeaseExpiresAt,
          syncLeaseId: state.syncLeaseId,
          syncStatus: state.syncStatus
        }
      });

      if (updated.count !== 1) {
        return null;
      }

      return {
        leaseId: input.leaseId,
        revision: acquired.revision,
        state: acquired.state
      } satisfies PublicCatalogSyncLease;
    },

    async failLease(input) {
      const existing = (await prisma.publicCatalogControl.findUnique({
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      })) as PublicCatalogControlRow | null;

      if (existing === null || existing.syncLeaseId !== input.leaseId) {
        throw publicCatalogSyncConflict();
      }

      const status: PublicCatalogSyncStatus =
        existing.desiredRevision > existing.publishedRevision ? "failed" : "ready";
      const row = (await prisma.publicCatalogControl.update({
        data: {
          lastSyncErrorCode: input.errorCode,
          lastSyncRequestId: input.requestId,
          syncLeaseExpiresAt: null,
          syncLeaseId: null,
          syncStatus: status
        },
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      })) as PublicCatalogControlRow;

      return rowToState(row);
    },

    async finalizeLease(input) {
      const existing = (await prisma.publicCatalogControl.findUnique({
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      })) as PublicCatalogControlRow | null;

      if (existing === null) {
        throw publicCatalogSyncConflict();
      }

      const next = finalizePublicCatalogLeaseState(rowToState(existing), input);
      const updated = await prisma.publicCatalogControl.updateMany({
        data: {
          currentItemsCount: next.currentItemsCount,
          currentSnapshotChecksum: next.currentSnapshotChecksum,
          currentSnapshotPath: next.currentSnapshotPath,
          currentSnapshotGeneratedAt: new Date(),
          lastSyncErrorCode: next.lastSyncErrorCode,
          lastSyncRequestId: next.lastSyncRequestId,
          publishedRevision: next.publishedRevision,
          syncLeaseExpiresAt: null,
          syncLeaseId: null,
          syncStatus: next.syncStatus
        },
        where: {
          id: PUBLIC_CATALOG_CONTROL_ID,
          syncLeaseId: input.leaseId
        }
      });

      if (updated.count !== 1) {
        throw publicCatalogSyncConflict();
      }

      const row = (await prisma.publicCatalogControl.findUniqueOrThrow({
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      })) as PublicCatalogControlRow;

      return rowToState(row);
    },

    async listSnapshotSites() {
      const rows = await prisma.site.findMany({
        orderBy: siteOrderBy("sortOrder"),
        select: publicSiteSelect,
        where: {
          ...publicSiteVisibilityWhere(),
          category: publicCategoryVisibilityWhere()
        }
      });

      return rows as PublicSiteRecord[];
    },

    async readSettings() {
      try {
        const row = await prisma.publicCatalogControl.findUnique({
          select: { showDemoInModal: true },
          where: { id: PUBLIC_CATALOG_CONTROL_ID }
        });

        return {
          showDemoInModal: row?.showDemoInModal ?? false
        };
      } catch (error) {
        if (isMissingPublicCatalogControlTable(error)) {
          return { showDemoInModal: false };
        }

        throw error;
      }
    }
  };
}

function isPublicCatalogSyncStatus(value: string): value is PublicCatalogSyncStatus {
  return PUBLIC_CATALOG_SYNC_STATUSES.includes(value as PublicCatalogSyncStatus);
}

function rowToState(row: PublicCatalogControlRow): PublicCatalogControlState {
  return validatePublicCatalogControlState({
    currentItemsCount: row.currentItemsCount,
    currentSnapshotChecksum: row.currentSnapshotChecksum,
    currentSnapshotPath: row.currentSnapshotPath,
    desiredRevision: row.desiredRevision,
    id: row.id,
    lastSyncErrorCode: row.lastSyncErrorCode,
    lastSyncRequestId: row.lastSyncRequestId,
    publishedRevision: row.publishedRevision,
    showDemoInModal: row.showDemoInModal,
    syncLeaseExpiresAt: row.syncLeaseExpiresAt,
    syncLeaseId: row.syncLeaseId,
    syncStatus: row.syncStatus as PublicCatalogSyncStatus
  });
}

function defaultControlState(): PublicCatalogControlState {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotPath: null,
    desiredRevision: 1,
    id: PUBLIC_CATALOG_CONTROL_ID,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 0,
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "pending"
  };
}

function isMissingPublicCatalogControlTable(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") ||
    (error instanceof Error &&
      (error.message.includes("public_catalog_control") ||
        error.message.includes("does not exist") ||
        error.message.includes("42P01")))
  );
}

function publicCatalogSyncConflict(): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_SYNC_CONFLICT",
    message: "Public catalog sync state changed.",
    statusCode: 409
  });
}
