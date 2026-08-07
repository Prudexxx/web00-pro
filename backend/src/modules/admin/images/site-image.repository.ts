import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { AppError } from "../../../lib/errors.js";
import { runSerializableWithRetry } from "../../../cli/cli-user.repository.js";
import type { ManagedGalleryImage } from "../../images/image.types.js";
import type { PreviewUploadStage } from "../../images/preview-upload-observability.js";
import { markPublicCatalogDirty } from "../../public-catalog/public-catalog-control.repository.js";
import type { SiteImageMutationSite } from "./site-image.types.js";
import type { SiteImageRepository } from "./site-image.service.js";

const siteImageSelect = {
  active: true,
  deletedAt: true,
  galleryImages: true,
  id: true,
  previewImageUrl: true,
  status: true,
  title: true
} satisfies Prisma.SiteSelect;

export function createPrismaSiteImageRepository(options: {
  prisma: PrismaClient;
}): SiteImageRepository {
  const prisma = options.prisma;

  return {
    async addGalleryImage(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        const gallery = readGalleryArray(before.galleryImages);

        if (gallery.length >= 20) {
          throw new AppError({
            code: "GALLERY_LIMIT_EXCEEDED",
            message: "Gallery image limit exceeded.",
            statusCode: 409
          });
        }

        const next = normalizeGallery([...gallery, storedGalleryImage(input.image)]);
        const after = await tx.site.update({
          data: { galleryImages: next as Prisma.InputJsonValue },
          select: siteImageSelect,
          where: { id: input.siteId }
        });

        await markReservationsCompleted(tx, input.uploadReservationIds, input.context.now);
        await createImageAudit(tx, {
          action: "site.image.gallery_add",
          afterJson: {
            assetId: input.image.assetId,
            siteId: input.siteId,
            slot: "gallery"
          },
          beforeJson: Prisma.DbNull,
          context: input.context,
          siteId: input.siteId
        });
        await markDirtyForPublicImageMutation(tx, before, after as SiteImageMutationSite, "site.image.gallery_add", input.context);

        return after as SiteImageMutationSite;
      });
    },
    async deleteGalleryImage(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        const gallery = readGalleryArray(before.galleryImages);
        const next = normalizeGallery(
          gallery.filter(
            (item) =>
              typeof item === "object" &&
              item !== null &&
              "assetId" in item &&
              item.assetId !== input.assetId
          )
        );
        const after = await tx.site.update({
          data: { galleryImages: next as Prisma.InputJsonValue },
          select: siteImageSelect,
          where: { id: input.siteId }
        });

        await createCleanupJobs(tx, input.cleanupPaths, {
          context: input.context,
          reason: "gallery_delete",
          siteId: input.siteId
        });
        await createImageAudit(tx, {
          action: "site.image.gallery_delete",
          afterJson: { assetId: input.assetId, siteId: input.siteId },
          beforeJson: Prisma.DbNull,
          context: input.context,
          siteId: input.siteId
        });
        await markDirtyForPublicImageMutation(tx, before, after as SiteImageMutationSite, "site.image.gallery_delete", input.context);

        return after as SiteImageMutationSite;
      });
    },
    async deletePreview(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        const after = await tx.site.update({
          data: { previewImageUrl: null },
          select: siteImageSelect,
          where: { id: input.siteId }
        });

        await createCleanupJobs(tx, input.cleanupPaths, {
          context: input.context,
          reason: "preview_delete",
          siteId: input.siteId
        });
        await createImageAudit(tx, {
          action: "site.image.preview_delete",
          afterJson: { previewImageUrl: null, siteId: input.siteId },
          beforeJson: { previewImageUrl: before.previewImageUrl, siteId: input.siteId },
          context: input.context,
          siteId: input.siteId
        });
        await markDirtyForPublicImageMutation(tx, before, after as SiteImageMutationSite, "site.image.preview_delete", input.context);

        return after as SiteImageMutationSite;
      });
    },
    async getSiteForImageMutation(siteId) {
      const site = await prisma.site.findUnique({
        select: siteImageSelect,
        where: { id: siteId }
      });

      return site as SiteImageMutationSite | null;
    },
    async replacePreview(input) {
      const onStage = input.onStage ?? noopPreviewStage;

      onStage("DB_ATTACH_STARTED");
      const after = await runSerializableWithRetry(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        onStage("DB_SITE_UPDATED");
        const after = await tx.site.update({
          data: { previewImageUrl: input.previewImageUrl },
          select: siteImageSelect,
          where: { id: input.siteId }
        });

        onStage("DB_RESERVATIONS_COMPLETED");
        await markReservationsCompleted(tx, input.uploadReservationIds, input.context.now);
        onStage("DB_CLEANUP_JOBS_CREATED");
        await createCleanupJobs(tx, input.cleanupPaths, {
          context: input.context,
          reason: "preview_replace",
          siteId: input.siteId
        });
        onStage("DB_AUDIT_CREATED");
        await createImageAudit(tx, {
          action: "site.image.preview_replace",
          afterJson: {
            assetId: input.assetId,
            siteId: input.siteId,
            slot: "preview"
          },
          beforeJson: { previewImageUrl: before.previewImageUrl, siteId: input.siteId },
          context: input.context,
          siteId: input.siteId
        });
        await markDirtyForPublicImageMutation(tx, before, after as SiteImageMutationSite, "site.image.preview_replace", input.context);

        return after as SiteImageMutationSite;
      });

      onStage("DB_ATTACH_COMMITTED");

      return after;
    },
    async reorderGallery(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        const next = normalizeGallery(input.images.map(storedGalleryImage));
        const after = await tx.site.update({
          data: { galleryImages: next as Prisma.InputJsonValue },
          select: siteImageSelect,
          where: { id: input.siteId }
        });

        await createImageAudit(tx, {
          action: "site.image.gallery_update",
          afterJson: {
            assetIds: next.map((item) => String(item.assetId)),
            siteId: input.siteId
          },
          beforeJson: Prisma.DbNull,
          context: input.context,
          siteId: input.siteId
        });
        await markDirtyForPublicImageMutation(tx, before, after as SiteImageMutationSite, "site.image.gallery_update", input.context);

        return after as SiteImageMutationSite;
      });
    }
  };
}

async function getSiteOrThrow(
  tx: Prisma.TransactionClient,
  siteId: string
): Promise<SiteImageMutationSite> {
  const site = await tx.site.findUnique({
    select: siteImageSelect,
    where: { id: siteId }
  });

  if (site === null) {
    throw new AppError({
      code: "SITE_NOT_FOUND",
      message: "Site not found.",
      statusCode: 404
    });
  }

  return site as SiteImageMutationSite;
}

function readGalleryArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function storedGalleryImage(image: ManagedGalleryImage): Record<string, unknown> {
  return {
    alt: image.alt,
    assetId: image.assetId,
    sortOrder: image.sortOrder,
    storagePath: image.storagePath,
    url: image.url
  };
}

function normalizeGallery(items: Record<string, unknown>[]): Record<string, unknown>[] {
  return items.map((item, index) => ({
    ...item,
    sortOrder: index
  }));
}

function noopPreviewStage(_stage: PreviewUploadStage): void {
  return undefined;
}

async function markReservationsCompleted(
  tx: Prisma.TransactionClient,
  reservationIds: readonly string[],
  now: Date
): Promise<void> {
  if (reservationIds.length === 0) {
    return;
  }

  await tx.storageCleanupJob.updateMany({
    data: {
      completedAt: now,
      lastError: null,
      status: "completed"
    },
    where: {
      id: { in: [...reservationIds] },
      reason: "upload_reservation"
    }
  });
}

async function createCleanupJobs(
  tx: Prisma.TransactionClient,
  paths: readonly string[],
  input: {
    context: { now: Date };
    reason: string;
    siteId: string;
  }
): Promise<void> {
  for (const path of paths) {
    await tx.storageCleanupJob.create({
      data: {
        entityId: input.siteId,
        entityType: "site_image",
        reason: input.reason,
        runAfter: input.context.now,
        status: "pending",
        storagePath: path
      }
    });
  }
}

async function createImageAudit(
  tx: Prisma.TransactionClient,
  input: {
    action: string;
    afterJson: Prisma.InputJsonValue | typeof Prisma.DbNull;
    beforeJson: Prisma.InputJsonValue | typeof Prisma.DbNull;
    context: {
      actor: { id: string };
      requestId: string;
    };
    siteId: string;
  }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.context.actor.id,
      afterJson: input.afterJson,
      beforeJson: input.beforeJson,
      entityId: input.siteId,
      entityType: "site",
      ipHash: null,
      requestId: input.context.requestId,
      userAgentHash: null
    }
  });
}

async function markDirtyForPublicImageMutation(
  tx: Prisma.TransactionClient,
  before: SiteImageMutationSite,
  after: SiteImageMutationSite,
  reason: string,
  context: {
    actor: { id: string };
    requestId: string;
  }
): Promise<void> {
  if (!isPublicCatalogImageSite(before) && !isPublicCatalogImageSite(after)) {
    return;
  }
  if (
    before.previewImageUrl === after.previewImageUrl &&
    JSON.stringify(before.galleryImages) === JSON.stringify(after.galleryImages)
  ) {
    return;
  }

  await markPublicCatalogDirty(tx, reason, {
    actorUserId: context.actor.id,
    reasonContext: { siteId: after.id },
    requestId: context.requestId
  });
}

function isPublicCatalogImageSite(site: SiteImageMutationSite): boolean {
  return site.active && site.deletedAt === null && site.status === "published";
}
