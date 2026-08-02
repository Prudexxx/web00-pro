import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import {
  PUBLIC_CATALOG_CONTROL_ID,
  ensurePublicCatalogControl,
  markPublicCatalogDirty,
  type PublicCatalogSyncStatus
} from "../../public-catalog/public-catalog-control.repository.js";
import type { AdminMutationContext } from "../admin.types.js";
import type {
  AdminPublicCatalogRepository,
  AdminPublicCatalogStatus
} from "./public-catalog-admin.service.js";

type PublicCatalogControlRow = {
  currentItemsCount: number | null;
  currentSnapshotChecksum: string | null;
  currentSnapshotPath: string | null;
  desiredRevision: number;
  lastSyncErrorCode: string | null;
  lastSyncRequestId: string | null;
  publishedRevision: number;
  showDemoInModal: boolean;
  syncStatus: string;
};

export function createPrismaAdminPublicCatalogRepository(
  options: { prisma: PrismaClient }
): AdminPublicCatalogRepository {
  const prisma = options.prisma;

  return {
    async getStatus() {
      try {
        const state = await ensurePublicCatalogControl(prisma);

        return stateToStatus(state);
      } catch (error) {
        if (isMissingPublicCatalogControlTable(error)) {
          return unavailableStatus();
        }

        throw error;
      }
    },

    async updateSettings(input, context) {
      try {
        return await prisma.$transaction(async (tx) => {
          const existing = await tx.publicCatalogControl.findUnique({
            where: { id: PUBLIC_CATALOG_CONTROL_ID }
          });
          const currentShowDemo = existing?.showDemoInModal ?? false;

          if (existing === null) {
            await tx.publicCatalogControl.create({
              data: {
                id: PUBLIC_CATALOG_CONTROL_ID,
                showDemoInModal: input.showDemoInModal
              }
            });
          } else if (currentShowDemo !== input.showDemoInModal) {
            await tx.publicCatalogControl.update({
              data: { showDemoInModal: input.showDemoInModal },
              where: { id: PUBLIC_CATALOG_CONTROL_ID }
            });
          }

          if (currentShowDemo !== input.showDemoInModal) {
            await markPublicCatalogDirty(tx, "settings.showDemoInModal", {
              actorUserId: context.actor.id,
              reasonContext: { showDemoInModal: input.showDemoInModal },
              requestId: context.requestId
            });
          }

          const row = (await tx.publicCatalogControl.findUniqueOrThrow({
            where: { id: PUBLIC_CATALOG_CONTROL_ID }
          })) as PublicCatalogControlRow;

          return rowToStatus(row);
        });
      } catch (error) {
        if (isMissingPublicCatalogControlTable(error)) {
          return unavailableStatus();
        }

        throw error;
      }
    }
  };
}

function stateToStatus(state: {
  currentItemsCount: number | null;
  currentSnapshotChecksum: string | null;
  currentSnapshotPath: string | null;
  desiredRevision: number;
  lastSyncErrorCode: string | null;
  lastSyncRequestId: string | null;
  publishedRevision: number;
  showDemoInModal: boolean;
  syncStatus: PublicCatalogSyncStatus;
}): AdminPublicCatalogStatus {
  return {
    currentItemsCount: state.currentItemsCount,
    currentSnapshotChecksum: state.currentSnapshotChecksum,
    currentSnapshotPath: state.currentSnapshotPath,
    desiredRevision: state.desiredRevision,
    lastSyncErrorCode: state.lastSyncErrorCode,
    lastSyncRequestId: state.lastSyncRequestId,
    publishedRevision: state.publishedRevision,
    showDemoInModal: state.showDemoInModal,
    syncStatus: state.syncStatus
  };
}

function rowToStatus(row: PublicCatalogControlRow): AdminPublicCatalogStatus {
  return stateToStatus({
    currentItemsCount: row.currentItemsCount,
    currentSnapshotChecksum: row.currentSnapshotChecksum,
    currentSnapshotPath: row.currentSnapshotPath,
    desiredRevision: row.desiredRevision,
    lastSyncErrorCode: row.lastSyncErrorCode,
    lastSyncRequestId: row.lastSyncRequestId,
    publishedRevision: row.publishedRevision,
    showDemoInModal: row.showDemoInModal,
    syncStatus: row.syncStatus as PublicCatalogSyncStatus
  });
}

function unavailableStatus(): AdminPublicCatalogStatus {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotPath: null,
    desiredRevision: 0,
    lastSyncErrorCode: "PUBLIC_CATALOG_CONTROL_UNAVAILABLE",
    lastSyncRequestId: null,
    publishedRevision: 0,
    showDemoInModal: false,
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
