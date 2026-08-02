import {
  createDefaultPublicCatalogControlState,
  PUBLIC_CATALOG_CONTROL_ID,
  validatePublicCatalogControlState,
  type PublicCatalogControlState,
  type PublicCatalogSyncStatus
} from "./public-catalog-control.repository.js";
import { publicSiteSelect } from "./public-catalog.repository.js";
import { siteOrderBy } from "./public-catalog.sort.js";
import type { PublicCatalogSnapshotSettings } from "./public-catalog.snapshot.js";
import type { PublicCatalogReadOnlyTx } from "./public-catalog-readonly-transaction.js";
import type { PublicSiteRecord } from "./public-catalog.types.js";
import {
  publicCategoryVisibilityWhere,
  publicSiteVisibilityWhere
} from "./public-catalog.visibility.js";

export interface PublicCatalogDryRunRepository {
  listSnapshotSites(): Promise<PublicSiteRecord[]>;
  readControlState(): Promise<PublicCatalogControlState>;
  readSettings(): Promise<PublicCatalogSnapshotSettings>;
}

export function createPrismaPublicCatalogDryRunRepository(
  options: { tx: PublicCatalogReadOnlyTx }
): PublicCatalogDryRunRepository {
  const tx = options.tx;

  return {
    async listSnapshotSites() {
      return tx.site.findMany({
        orderBy: siteOrderBy("sortOrder"),
        select: publicSiteSelect,
        where: {
          ...publicSiteVisibilityWhere(),
          category: publicCategoryVisibilityWhere()
        }
      });
    },

    async readControlState() {
      const row = await tx.publicCatalogControl.findUnique({
        select: {
          currentItemsCount: true,
          currentSnapshotChecksum: true,
          currentSnapshotPath: true,
          desiredRevision: true,
          id: true,
          lastSyncErrorCode: true,
          lastSyncRequestId: true,
          publishedRevision: true,
          showDemoInModal: true,
          syncLeaseExpiresAt: true,
          syncLeaseId: true,
          syncStatus: true
        },
        where: { id: PUBLIC_CATALOG_CONTROL_ID }
      });

      return row === null
        ? createDefaultPublicCatalogControlState()
        : validatePublicCatalogControlState({
            ...row,
            syncStatus: row.syncStatus as PublicCatalogSyncStatus
          });
    },

    async readSettings() {
      const state = await this.readControlState();

      return {
        showDemoInModal: state.showDemoInModal
      };
    }
  };
}
