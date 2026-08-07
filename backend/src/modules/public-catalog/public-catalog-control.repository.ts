import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { publicSiteSelect } from "./public-catalog.repository.js";
import { siteOrderBy } from "./public-catalog.sort.js";
import {
  publicCategoryVisibilityWhere,
  publicSiteVisibilityWhere
} from "./public-catalog.visibility.js";
import type { PublicSiteRecord } from "./public-catalog.types.js";
import type {
  PublicCatalogSnapshotSettings,
  PublicCatalogSyncLease,
  PublicCatalogSyncRepository
} from "./public-catalog-sync.service.js";

export const PUBLIC_CATALOG_CONTROL_ID = "public-catalog";
export const PUBLIC_CATALOG_SYNC_STATUSES = ["pending", "syncing", "ready", "failed"] as const;

export type PublicCatalogSyncStatus = (typeof PUBLIC_CATALOG_SYNC_STATUSES)[number];

export interface PublicCatalogControlState {
  currentItemsCount: number | null;
  currentSnapshotChecksum: string | null;
  currentSnapshotGeneratedAt: Date | null;
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
  generatedAt: Date;
  itemsCount: number;
  leaseId: string;
  publishedRevision: number;
  requestId: string;
  snapshotPath: string;
}

export interface PublicCatalogDirtyContext {
  actorUserId?: string | null;
  reasonContext?: Record<string, unknown> | undefined;
  requestId: string;
}

export type MarkPublicCatalogDirtyResult =
  | { desiredRevision: number; marked: true }
  | { marked: false; reason: "control_table_missing" };

export type UpdatePublicCatalogSettingsResult =
  | {
      desiredRevision: number;
      marked: true;
      settings: PublicCatalogSnapshotSettings;
    }
  | {
      marked: false;
      reason: "control_table_missing" | "unchanged";
      settings: PublicCatalogSnapshotSettings;
    };

export type PublicCatalogControlStatusReadResult =
  | { kind: "state"; state: PublicCatalogControlState | null }
  | { kind: "setup_required" };

export interface PublicCatalogControlStatusReader {
  readState(): Promise<PublicCatalogControlStatusReadResult>;
}

type PublicCatalogControlRow = Omit<PublicCatalogControlState, "syncStatus"> & {
  syncStatus: string;
};

type PublicCatalogTx = Pick<Prisma.TransactionClient, "auditLog" | "publicCatalogControl">;

export function validatePublicCatalogControlState(
  state: PublicCatalogControlState
): PublicCatalogControlState {
  if (state.id !== PUBLIC_CATALOG_CONTROL_ID) {
    throw new Error("Invalid public catalog singleton id.");
  }
  if (!isPublicCatalogSyncStatus(state.syncStatus)) {
    throw new Error("Invalid public catalog syncStatus.");
  }
  if (typeof state.showDemoInModal !== "boolean") {
    throw new Error("Invalid public catalog showDemoInModal setting.");
  }
  assertPositiveRevision(state.desiredRevision);
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
  state: PublicCatalogControlState
): PublicCatalogControlState {
  validatePublicCatalogControlState(state);
  return validatePublicCatalogControlState({
    ...state,
    desiredRevision: assertPositiveRevision(state.desiredRevision + 1),
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
  if (hasUnexpiredPublicCatalogLease(state, now)) {
    return state;
  }
  if (state.syncLeaseId === null && state.syncLeaseExpiresAt === null) {
    return state;
  }
  return validatePublicCatalogControlState({
    ...state,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: state.desiredRevision === state.publishedRevision ? "ready" : "pending"
  });
}

export function acquirePublicCatalogLeaseState(
  state: PublicCatalogControlState,
  options: AcquirePublicCatalogLeaseOptions
): AcquiredPublicCatalogLease {
  const recovered = recoverStalePublicCatalogLeaseState(state, options.now);
  if (hasUnexpiredPublicCatalogLease(recovered, options.now)) {
    throw new Error("Public catalog sync lease is already active.");
  }
  if (recovered.syncStatus === "ready" && recovered.desiredRevision === recovered.publishedRevision) {
    throw new Error("Public catalog has no pending revision.");
  }
  const revision = assertPositiveRevision(recovered.publishedRevision + 1);
  return {
    revision: Math.min(revision, recovered.desiredRevision),
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
  const syncStatus: PublicCatalogSyncStatus =
    options.publishedRevision === state.desiredRevision ? "ready" : "pending";

  return validatePublicCatalogControlState({
    ...state,
    currentItemsCount: options.itemsCount,
    currentSnapshotChecksum: options.checksum,
    currentSnapshotGeneratedAt: options.generatedAt,
    currentSnapshotPath: options.snapshotPath,
    lastSyncErrorCode: null,
    lastSyncRequestId: options.requestId,
    publishedRevision: options.publishedRevision,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus
  });
}

export async function markPublicCatalogDirty(
  tx: PublicCatalogTx,
  reason: string,
  context: PublicCatalogDirtyContext
): Promise<MarkPublicCatalogDirtyResult> {
  try {
    const row = await tx.publicCatalogControl.upsert({
      create: {
        desiredRevision: 1,
        id: PUBLIC_CATALOG_CONTROL_ID,
        lastSyncErrorCode: null,
        lastSyncRequestId: null,
        syncStatus: "pending"
      },
      update: {
        desiredRevision: { increment: 1 },
        lastSyncErrorCode: null,
        lastSyncRequestId: null,
        syncStatus: "pending"
      },
      where: { id: PUBLIC_CATALOG_CONTROL_ID }
    }) as PublicCatalogControlRow;
    const next = rowToDirtyResultState(row);

    await tx.auditLog.create({
      data: {
        action: "public_catalog.dirty",
        actorUserId: context.actorUserId ?? null,
        afterJson: {
          desiredRevision: next.desiredRevision,
          reason,
          reasonContext: context.reasonContext === undefined
            ? null
            : (context.reasonContext as Prisma.InputJsonObject)
        },
        beforeJson: {
          desiredRevision: Math.max(1, next.desiredRevision - 1),
          publishedRevision: next.publishedRevision
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
      return { marked: false, reason: "control_table_missing" };
    }
    throw error;
  }
}

export async function updatePublicCatalogSettings(
  tx: PublicCatalogTx,
  input: PublicCatalogSnapshotSettings,
  context: PublicCatalogDirtyContext
): Promise<UpdatePublicCatalogSettingsResult> {
  const showDemoInModal = input.showDemoInModal === true;
  try {
    const updated = await tx.publicCatalogControl.updateMany({
      data: {
        desiredRevision: { increment: 1 },
        lastSyncErrorCode: null,
        lastSyncRequestId: null,
        showDemoInModal,
        syncStatus: "pending"
      },
      where: {
        id: PUBLIC_CATALOG_CONTROL_ID,
        showDemoInModal: { not: showDemoInModal }
      }
    });
    if (updated.count === 1) {
      const row = await tx.publicCatalogControl.findUnique({
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      }) as PublicCatalogControlRow | null;
      if (row === null) {
        throw new Error("Public catalog settings row disappeared after update.");
      }
      const next = rowToState(row);
      await writeSettingsDirtyAudit(tx, {
        context,
        next,
        previousShowDemoInModal: !showDemoInModal,
        showDemoInModal
      });

      return {
        desiredRevision: next.desiredRevision,
        marked: true,
        settings: { showDemoInModal: next.showDemoInModal }
      };
    }

    const row = await tx.publicCatalogControl.findUnique({
      where: { id: PUBLIC_CATALOG_CONTROL_ID }
    }) as PublicCatalogControlRow | null;
    if (row === null) {
      if (!showDemoInModal) {
        return {
          marked: false,
          reason: "unchanged",
          settings: { showDemoInModal: false }
        };
      }

      const created = await tx.publicCatalogControl.upsert({
        create: {
          desiredRevision: 1,
          id: PUBLIC_CATALOG_CONTROL_ID,
          lastSyncErrorCode: null,
          lastSyncRequestId: null,
          showDemoInModal,
          syncStatus: "pending"
        },
        update: {
          desiredRevision: { increment: 1 },
          lastSyncErrorCode: null,
          lastSyncRequestId: null,
          showDemoInModal,
          syncStatus: "pending"
        },
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      }) as PublicCatalogControlRow;
      const next = rowToState(created);
      await writeSettingsDirtyAudit(tx, {
        context,
        next,
        previousShowDemoInModal: false,
        showDemoInModal
      });

      return {
        desiredRevision: next.desiredRevision,
        marked: true,
        settings: { showDemoInModal: next.showDemoInModal }
      };
    }

    const before = rowToState(row);
    if (before.showDemoInModal === showDemoInModal) {
      return {
        marked: false,
        reason: "unchanged",
        settings: { showDemoInModal: before.showDemoInModal }
      };
    }

    return updatePublicCatalogSettings(tx, input, context);
  } catch (error) {
    if (isMissingPublicCatalogControlTable(error)) {
      return {
        marked: false,
        reason: "control_table_missing",
        settings: { showDemoInModal: false }
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
        if (isMissingPublicCatalogControlTable(error)) return null;
        throw error;
      }
      if (state.syncStatus === "ready" && state.desiredRevision === state.publishedRevision) {
        return null;
      }
      const recovered = recoverStalePublicCatalogLeaseState(state, input.now);
      if (hasUnexpiredPublicCatalogLease(recovered, input.now)) {
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
      if (updated.count !== 1) return null;

      return {
        leaseId: input.leaseId,
        revision: acquired.revision,
        state: acquired.state
      } satisfies PublicCatalogSyncLease;
    },

    async failLease(input) {
      const existing = await prisma.publicCatalogControl.findUnique({
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      }) as PublicCatalogControlRow | null;
      if (existing === null || existing.syncLeaseId !== input.leaseId) {
        throw syncConflict();
      }
      const nextStatus: PublicCatalogSyncStatus =
        existing.desiredRevision > existing.publishedRevision ? "failed" : "ready";
      const row = await prisma.publicCatalogControl.update({
        data: {
          lastSyncErrorCode: input.errorCode,
          lastSyncRequestId: input.requestId,
          syncLeaseExpiresAt: null,
          syncLeaseId: null,
          syncStatus: nextStatus
        },
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      }) as PublicCatalogControlRow;
      return rowToState(row);
    },

    async finalizeLease(input) {
      const existing = await prisma.publicCatalogControl.findUnique({
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      }) as PublicCatalogControlRow | null;
      if (existing === null) throw syncConflict();
      const next = finalizePublicCatalogLeaseState(rowToState(existing), input);
      const updated = await prisma.publicCatalogControl.updateMany({
        data: {
          currentItemsCount: next.currentItemsCount,
          currentSnapshotChecksum: next.currentSnapshotChecksum,
          currentSnapshotGeneratedAt: next.currentSnapshotGeneratedAt,
          currentSnapshotPath: next.currentSnapshotPath,
          lastSyncErrorCode: next.lastSyncErrorCode,
          lastSyncRequestId: next.lastSyncRequestId,
          publishedRevision: next.publishedRevision,
          syncLeaseExpiresAt: null,
          syncLeaseId: null,
          syncStatus: next.syncStatus
        },
        where: {
          desiredRevision: existing.desiredRevision,
          id: PUBLIC_CATALOG_CONTROL_ID,
          publishedRevision: existing.publishedRevision,
          syncLeaseExpiresAt: existing.syncLeaseExpiresAt,
          syncLeaseId: input.leaseId,
          syncStatus: existing.syncStatus
        }
      });
      if (updated.count !== 1) throw syncConflict();

      const row = await prisma.publicCatalogControl.findUniqueOrThrow({
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      }) as PublicCatalogControlRow;
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

    async readCurrentState() {
      try {
        const row = await prisma.publicCatalogControl.findUnique({
          where: { id: PUBLIC_CATALOG_CONTROL_ID }
        }) as PublicCatalogControlRow | null;
        return row === null ? null : rowToState(row);
      } catch (error) {
        if (isMissingPublicCatalogControlTable(error)) {
          return null;
        }
        throw error;
      }
    },

    async readSettings(): Promise<PublicCatalogSnapshotSettings> {
      try {
        const state = await ensurePublicCatalogControl(prisma);
        return { showDemoInModal: state.showDemoInModal };
      } catch (error) {
        if (isMissingPublicCatalogControlTable(error)) {
          return { showDemoInModal: false };
        }
        throw error;
      }
    },

    async verifyLeaseOwnership(input) {
      assertPositiveRevision(input.targetRevision);
      const updated = await prisma.publicCatalogControl.updateMany({
        data: {
          syncLeaseExpiresAt: new Date(input.now.getTime() + input.ttlMs)
        },
        where: {
          desiredRevision: { gte: input.targetRevision },
          id: PUBLIC_CATALOG_CONTROL_ID,
          publishedRevision: input.targetRevision - 1,
          syncLeaseExpiresAt: { gt: input.now },
          syncLeaseId: input.leaseId
        }
      });
      return updated.count === 1;
    }
  };
}

export function createPrismaPublicCatalogControlStatusReader(
  options: { prisma: PrismaClient }
): PublicCatalogControlStatusReader {
  return {
    async readState() {
      try {
        const row = await options.prisma.publicCatalogControl.findUnique({
          where: { id: PUBLIC_CATALOG_CONTROL_ID }
        }) as PublicCatalogControlRow | null;

        return {
          kind: "state",
          state: row === null ? null : rowToState(row)
        };
      } catch (error) {
        if (isMissingPublicCatalogControlTable(error)) {
          return { kind: "setup_required" };
        }
        throw error;
      }
    }
  };
}

async function writeSettingsDirtyAudit(
  tx: PublicCatalogTx,
  input: {
    context: PublicCatalogDirtyContext;
    next: PublicCatalogControlState;
    previousShowDemoInModal: boolean;
    showDemoInModal: boolean;
  }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: "public_catalog.dirty",
      actorUserId: input.context.actorUserId ?? null,
      afterJson: {
        desiredRevision: input.next.desiredRevision,
        reason: "settings.show_demo_in_modal",
        reasonContext: { showDemoInModal: input.showDemoInModal }
      },
      beforeJson: {
        desiredRevision: Math.max(1, input.next.desiredRevision - 1),
        publishedRevision: input.next.publishedRevision,
        showDemoInModal: input.previousShowDemoInModal
      },
      entityId: null,
      entityType: "public_catalog",
      ipHash: null,
      requestId: input.context.requestId,
      userAgentHash: null
    }
  });
}

async function ensurePublicCatalogControl(prisma: PrismaClient): Promise<PublicCatalogControlState> {
  const row = await prisma.publicCatalogControl.upsert({
    create: {
      id: PUBLIC_CATALOG_CONTROL_ID
    },
    update: {},
    where: { id: PUBLIC_CATALOG_CONTROL_ID }
  }) as PublicCatalogControlRow;
  return rowToState(row);
}

function rowToState(row: PublicCatalogControlRow): PublicCatalogControlState {
  return validatePublicCatalogControlState({
    currentItemsCount: row.currentItemsCount,
    currentSnapshotChecksum: row.currentSnapshotChecksum,
    currentSnapshotGeneratedAt: row.currentSnapshotGeneratedAt,
    currentSnapshotPath: row.currentSnapshotPath,
    desiredRevision: row.desiredRevision,
    id: row.id,
    lastSyncErrorCode: row.lastSyncErrorCode,
    lastSyncRequestId: row.lastSyncRequestId,
    publishedRevision: row.publishedRevision,
    showDemoInModal: row.showDemoInModal === true,
    syncLeaseExpiresAt: row.syncLeaseExpiresAt,
    syncLeaseId: row.syncLeaseId,
    syncStatus: row.syncStatus as PublicCatalogSyncStatus
  });
}

function rowToDirtyResultState(row: PublicCatalogControlRow): PublicCatalogControlState {
  if (
    typeof row.id !== "string" &&
    typeof row.desiredRevision !== "number" &&
    typeof row.publishedRevision !== "number"
  ) {
    return defaultControlState();
  }
  return rowToState(row);
}

function defaultControlState(): PublicCatalogControlState {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotGeneratedAt: null,
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

function assertPositiveRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Invalid public catalog revision.");
  }
  return value;
}

function hasUnexpiredPublicCatalogLease(
  state: PublicCatalogControlState,
  now: Date
): boolean {
  return (
    state.syncLeaseId !== null &&
    state.syncLeaseExpiresAt !== null &&
    state.syncLeaseExpiresAt.getTime() > now.getTime()
  );
}

function isPublicCatalogSyncStatus(value: string): value is PublicCatalogSyncStatus {
  return PUBLIC_CATALOG_SYNC_STATUSES.includes(value as PublicCatalogSyncStatus);
}

function isMissingPublicCatalogControlTable(error: unknown): boolean {
  const diagnostic = publicCatalogControlErrorDiagnostic(error);
  if (!diagnostic.includes("public_catalog_control")) {
    return false;
  }
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") ||
    (error instanceof Error &&
      (diagnostic.includes("does not exist") ||
        diagnostic.includes("42p01")))
  );
}

function publicCatalogControlErrorDiagnostic(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
  }
  if (typeof error === "object" && error !== null && "meta" in error) {
    try {
      parts.push(JSON.stringify((error as { meta?: unknown }).meta));
    } catch {
      return parts.join(" ").toLocaleLowerCase("en-US");
    }
  }
  return parts.join(" ").toLocaleLowerCase("en-US");
}

function syncConflict(): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_SYNC_CONFLICT",
    message: "Public catalog sync state changed.",
    statusCode: 409
  });
}
