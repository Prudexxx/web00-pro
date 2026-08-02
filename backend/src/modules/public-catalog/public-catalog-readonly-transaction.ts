import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { publicSiteSelect } from "./public-catalog.repository.js";
import type { PublicSiteRecord } from "./public-catalog.types.js";

export interface PublicCatalogControlReadRow {
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
  syncStatus: string;
}

export interface PublicCatalogControlReadDelegate {
  findUnique(args: {
    select: {
      currentItemsCount: true;
      currentSnapshotChecksum: true;
      currentSnapshotPath: true;
      desiredRevision: true;
      id: true;
      lastSyncErrorCode: true;
      lastSyncRequestId: true;
      publishedRevision: true;
      showDemoInModal: true;
      syncLeaseExpiresAt: true;
      syncLeaseId: true;
      syncStatus: true;
    };
    where: { id: string };
  }): Promise<PublicCatalogControlReadRow | null>;
}

export interface SiteReadDelegate {
  findMany(args: {
    orderBy: Prisma.SiteOrderByWithRelationInput | Prisma.SiteOrderByWithRelationInput[];
    select: typeof publicSiteSelect;
    where: Prisma.SiteWhereInput;
  }): Promise<PublicSiteRecord[]>;
}

export interface PublicCatalogReadOnlyTx {
  publicCatalogControl: PublicCatalogControlReadDelegate;
  site: SiteReadDelegate;
}

export async function withPublicCatalogReadOnlyTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: PublicCatalogReadOnlyTx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const readOnlyTx: PublicCatalogReadOnlyTx = {
        publicCatalogControl: {
          findUnique: (args) => tx.publicCatalogControl.findUnique(args)
        },
        site: {
          findMany: (args) => tx.site.findMany(args)
        }
      };

      return operation(readOnlyTx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}
