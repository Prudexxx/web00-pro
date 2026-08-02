import type { AdminMutationContext } from "../admin.types.js";
import type { PublicCatalogSyncResult, PublicCatalogSyncService } from "../../public-catalog/public-catalog-sync.service.js";

export interface AdminPublicCatalogStatus {
  currentItemsCount: number | null;
  currentSnapshotChecksum: string | null;
  currentSnapshotPath: string | null;
  desiredRevision: number;
  lastSyncErrorCode: string | null;
  lastSyncRequestId: string | null;
  publishedRevision: number;
  showDemoInModal: boolean;
  syncStatus: "pending" | "syncing" | "ready" | "failed";
}

export interface AdminPublicCatalogRepository {
  getStatus(): Promise<AdminPublicCatalogStatus>;
  updateSettings(
    input: { showDemoInModal: boolean },
    context: AdminMutationContext
  ): Promise<AdminPublicCatalogStatus>;
}

export interface AdminPublicCatalogService {
  getStatus(): Promise<AdminPublicCatalogStatus>;
  sync(context: AdminMutationContext): Promise<PublicCatalogSyncResult>;
  updateSettings(
    input: { showDemoInModal: boolean },
    context: AdminMutationContext
  ): Promise<{ status: AdminPublicCatalogStatus; sync: PublicCatalogSyncResult }>;
}

export function createAdminPublicCatalogService(options: {
  repository: AdminPublicCatalogRepository;
  syncService: PublicCatalogSyncService;
}): AdminPublicCatalogService {
  return {
    async getStatus() {
      return options.repository.getStatus();
    },

    async sync(context) {
      return options.syncService.syncOnce({ requestId: context.requestId });
    },

    async updateSettings(input, context) {
      const status = await options.repository.updateSettings(input, context);
      const sync = await options.syncService.syncOnce({ requestId: context.requestId });

      return { status, sync };
    }
  };
}
