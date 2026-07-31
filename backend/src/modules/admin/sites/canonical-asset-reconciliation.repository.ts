import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import type {
  CanonicalAssetReconciliationChange,
  CanonicalAssetGalleryImage,
  CanonicalAssetReconciliationRepository,
  CanonicalAssetReconciliationSite
} from "./canonical-asset-reconciliation.js";
import {
  CANONICAL_LEGACY_ASSET_LOCK_ORDER,
  ReconciliationStateChangedError
} from "./canonical-asset-reconciliation.js";

const reconciliationSiteSelect = {
  active: true,
  category: {
    select: {
      slug: true
    }
  },
  deletedAt: true,
  galleryImages: true,
  id: true,
  previewImageUrl: true,
  publishedAt: true,
  slug: true,
  status: true,
  title: true
} satisfies Prisma.SiteSelect;

export function createPrismaCanonicalAssetReconciliationRepository(
  options: { prisma: PrismaClient }
): CanonicalAssetReconciliationRepository {
  const prisma = options.prisma;

  return {
    async findSitesBySlugs(slugs) {
      const rows = await prisma.site.findMany({
        select: reconciliationSiteSelect,
        where: {
          slug: {
            in: [...slugs]
          }
        }
      });

      return rows.map(mapReconciliationSiteRow);
    },
    async applyCanonicalAssetChanges(input) {
      await prisma.$transaction(async (tx) => {
        await lockCanonicalAssetSites(tx);
        const lockedSites = await findLockedCanonicalAssetSites(tx);
        assertSitesMatchExpected(lockedSites, input.expectedSites);

        for (const change of input.changes) {
          await applySingleCanonicalAssetChange(tx, change, input.context);
        }
      });
    }
  };
}

async function lockCanonicalAssetSites(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM sites
    WHERE slug IN (${Prisma.join([...CANONICAL_LEGACY_ASSET_LOCK_ORDER])})
    ORDER BY slug
    FOR UPDATE
  `;
}

async function findLockedCanonicalAssetSites(
  tx: Prisma.TransactionClient
): Promise<CanonicalAssetReconciliationSite[]> {
  const rows = await tx.site.findMany({
    orderBy: {
      slug: "asc"
    },
    select: reconciliationSiteSelect,
    where: {
      slug: {
        in: [...CANONICAL_LEGACY_ASSET_LOCK_ORDER]
      }
    }
  });

  return rows.map(mapReconciliationSiteRow);
}

async function applySingleCanonicalAssetChange(
  tx: Prisma.TransactionClient,
  change: CanonicalAssetReconciliationChange,
  context: Parameters<CanonicalAssetReconciliationRepository["applyCanonicalAssetChanges"]>[0]["context"]
): Promise<void> {
  const updated = await tx.site.updateMany({
    data: {
      galleryImages: change.after.galleryImages as Prisma.InputJsonValue,
      previewImageUrl: change.after.previewImageUrl
    },
    where: {
      active: true,
      deletedAt: null,
      id: change.siteId,
      slug: change.slug,
      status: "draft"
    }
  });

  if (updated.count !== 1) {
    throw new ReconciliationStateChangedError();
  }

  await tx.auditLog.create({
    data: {
      action: "site.reconcile_canonical_assets",
      actorUserId: context.actorUserId,
      afterJson: change.audit.afterJson as unknown as Prisma.InputJsonValue,
      beforeJson: change.audit.beforeJson as unknown as Prisma.InputJsonValue,
      entityId: change.siteId,
      entityType: "site",
      ipHash: context.ipHash,
      requestId: context.requestId,
      userAgentHash: context.userAgentHash
    }
  });
}

function mapReconciliationSiteRow(row: Prisma.SiteGetPayload<{
  select: typeof reconciliationSiteSelect;
}>): CanonicalAssetReconciliationSite {
  return {
    active: row.active,
    categorySlug: row.category.slug,
    deletedAt: row.deletedAt,
    galleryImages: readGalleryImages(row.galleryImages),
    id: row.id,
    previewImageUrl: row.previewImageUrl,
    publishedAt: row.publishedAt,
    slug: row.slug,
    status: row.status,
    title: row.title
  };
}

function assertSitesMatchExpected(
  currentSites: CanonicalAssetReconciliationSite[],
  expectedSites: CanonicalAssetReconciliationSite[]
): void {
  const current = normalizeSiteListForComparison(currentSites);
  const expected = normalizeSiteListForComparison(expectedSites);

  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new ReconciliationStateChangedError();
  }
}

function normalizeSiteListForComparison(
  sites: CanonicalAssetReconciliationSite[]
): unknown {
  return [...sites]
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map((site) => normalizeComparableValue(site));
}

function normalizeComparableValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparableValue(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeComparableValue(value[key])])
  );
}

function readGalleryImages(value: unknown): CanonicalAssetGalleryImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const alt = typeof item.alt === "string" ? item.alt : "";
    const sortOrder = typeof item.sortOrder === "number" && Number.isInteger(item.sortOrder)
      ? item.sortOrder
      : -1;
    const storagePath = typeof item.storagePath === "string" ? item.storagePath : "";
    const url = typeof item.url === "string" ? item.url : "";

    return [
      {
        ...item,
        alt,
        sortOrder,
        storagePath,
        url
      } satisfies CanonicalAssetGalleryImage
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
