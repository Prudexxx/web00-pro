import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import type {
  CanonicalAssetGalleryImage,
  CanonicalAssetReconciliationRepository,
  CanonicalAssetReconciliationSite
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

      return rows.map((row) => ({
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
      }));
    },
    async applyCanonicalAssetChanges(input) {
      await prisma.$transaction(async (tx) => {
        for (const change of input.changes) {
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
            throw new Error("Canonical asset reconciliation precondition changed.");
          }

          await tx.auditLog.create({
            data: {
              action: "site.reconcile_canonical_assets",
              actorUserId: input.context.actorUserId,
              afterJson: change.audit.afterJson as unknown as Prisma.InputJsonValue,
              beforeJson: change.audit.beforeJson as unknown as Prisma.InputJsonValue,
              entityId: change.siteId,
              entityType: "site",
              ipHash: input.context.ipHash,
              requestId: input.context.requestId,
              userAgentHash: input.context.userAgentHash
            }
          });
        }
      });
    }
  };
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
