import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { AppError } from "../../../lib/errors.js";
import {
  MAX_SERIALIZABLE_ATTEMPTS,
  SERIALIZABLE_MAX_WAIT_MS,
  runSerializableWithRetry
} from "../../../cli/cli-user.repository.js";
import type { ManagedGalleryImage } from "../../images/image.types.js";
import type { PreviewUploadStage } from "../../images/preview-upload-observability.js";
import { markPublicCatalogDirty } from "../../public-catalog/public-catalog-control.repository.js";
import { createPrismaSiteMediaAssetsRepository } from "./site-media-assets.repository.js";
import type { SiteImageMutationSite } from "./site-image.types.js";
import {
  assertCanDeleteSiteImages,
  assertCanMutateSiteImages,
  type SiteImageRepository
} from "./site-image.service.js";

const siteImageSelect = {
  active: true,
  deletedAt: true,
  galleryImages: true,
  id: true,
  previewAssetId: true,
  previewImage: {
    select: {
      assetId: true
    }
  },
  previewImageUrl: true,
  status: true,
  title: true
} satisfies Prisma.SiteSelect;

export const SITE_IMAGE_DATABASE_ATTACH_TIMEOUT_MS = 10_000;

export function createPrismaSiteImageRepository(options: {
  prisma: PrismaClient;
}): SiteImageRepository {
  const prisma = options.prisma;
  const mediaAssets = createPrismaSiteMediaAssetsRepository();

  return {
    async addGalleryImage(input) {
      return runSiteImageSerializableWithDeadline(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        assertCanMutateSiteImages(input.context.actor, before);
        const gallery = readGalleryArray(before.galleryImages);
        const existingIndex = findGalleryAssetIndex(gallery, input.image.assetId);

        if (existingIndex !== -1) {
          await mediaAssets.upsertAsset(input.asset, tx);
          await tx.siteGalleryImage.upsert({
            create: {
              alt: String(gallery[existingIndex]?.alt ?? input.image.alt),
              assetId: input.image.assetId,
              siteId: input.siteId,
              slot: "gallery",
              sortOrder: existingIndex
            },
            update: {
              alt: String(gallery[existingIndex]?.alt ?? input.image.alt),
              slot: "gallery",
              sortOrder: existingIndex
            },
            where: {
              siteId_assetId: {
                assetId: input.image.assetId,
                siteId: input.siteId
              }
            }
          });
          await markReservationsCompleted(tx, input.uploadReservationIds, input.context.now);

          return before;
        }

        if (gallery.length >= 20) {
          throw new AppError({
            code: "GALLERY_LIMIT_EXCEEDED",
            message: "Gallery image limit exceeded.",
            statusCode: 409
          });
        }

        await mediaAssets.upsertAsset(input.asset, tx);
        await tx.siteGalleryImage.create({
          data: {
            alt: input.image.alt,
            assetId: input.image.assetId,
            siteId: input.siteId,
            slot: "gallery",
            sortOrder: gallery.length
          }
        });

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
        if (hasPublicProjection(before) || hasPublicProjection(after as SiteImageMutationSite)) {
          await markPublicCatalogDirty(tx, "site.image.gallery_add", {
            actorUserId: input.context.actor.id,
            reasonContext: { siteId: input.siteId },
            requestId: input.context.requestId
          });
        }

        return after as SiteImageMutationSite;
      });
    },
    async deleteGalleryImage(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        assertCanDeleteSiteImages(input.context.actor, before);
        const gallery = readGalleryArray(before.galleryImages);
        await tx.siteGalleryImage.deleteMany({
          where: {
            assetId: input.assetId,
            siteId: input.siteId
          }
        });

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
        if (hasPublicProjection(before) || hasPublicProjection(after as SiteImageMutationSite)) {
          await markPublicCatalogDirty(tx, "site.image.gallery_delete", {
            actorUserId: input.context.actor.id,
            reasonContext: { siteId: input.siteId },
            requestId: input.context.requestId
          });
        }

        return after as SiteImageMutationSite;
      });
    },
    async deletePreview(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        assertCanDeleteSiteImages(input.context.actor, before);
        await tx.sitePreviewImage.deleteMany({
          where: { siteId: input.siteId }
        });
        const after = await tx.site.update({
          data: { previewAssetId: null, previewImageUrl: null },
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
        if (hasPublicProjection(before) || hasPublicProjection(after as SiteImageMutationSite)) {
          await markPublicCatalogDirty(tx, "site.image.preview_delete", {
            actorUserId: input.context.actor.id,
            reasonContext: { siteId: input.siteId },
            requestId: input.context.requestId
          });
        }

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
      const after = await runSiteImageSerializableWithDeadline(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        assertCanMutateSiteImages(input.context.actor, before);
        onStage("DB_SITE_UPDATED");
        if (
          before.previewAssetId === input.assetId &&
          before.previewImageUrl === input.previewImageUrl
        ) {
          await mediaAssets.upsertAsset(input.asset, tx);
          await tx.sitePreviewImage.upsert({
            create: {
              assetId: input.assetId,
              siteId: input.siteId,
              slot: "preview"
            },
            update: {
              assetId: input.assetId,
              slot: "preview"
            },
            where: { siteId: input.siteId }
          });
          await markReservationsCompleted(tx, input.uploadReservationIds, input.context.now);

          return before;
        }
        await mediaAssets.upsertAsset(input.asset, tx);
        await tx.sitePreviewImage.upsert({
          create: {
            assetId: input.assetId,
            siteId: input.siteId,
            slot: "preview"
          },
          update: {
            assetId: input.assetId,
            slot: "preview"
          },
          where: { siteId: input.siteId }
        });
        const after = await tx.site.update({
          data: {
            previewAssetId: input.assetId,
            previewImageUrl: input.previewImageUrl
          },
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
        if (hasPublicProjection(before) || hasPublicProjection(after as SiteImageMutationSite)) {
          await markPublicCatalogDirty(tx, "site.image.preview_replace", {
            actorUserId: input.context.actor.id,
            reasonContext: { siteId: input.siteId },
            requestId: input.context.requestId
          });
        }

        return after as SiteImageMutationSite;
      });

      onStage("DB_ATTACH_COMMITTED");

      return after;
    },
    async reorderGallery(input) {
      return runSiteImageSerializableWithDeadline(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        assertCanMutateSiteImages(input.context.actor, before);
        const next = normalizeGallery(input.images.map(storedGalleryImage));
        assertGalleryReorderMatchesCurrent(readGalleryArray(before.galleryImages), next);
        const canonicalRows = await tx.siteGalleryImage.findMany({
          orderBy: [
            { sortOrder: "asc" },
            { assetId: "asc" }
          ],
          select: { assetId: true },
          where: { siteId: input.siteId }
        });
        if (canonicalRows.length > 0) {
          const canonicalAssetIds = assertCanonicalGallerySubsetOfMirror(
            canonicalRows,
            next
          );
          await tx.siteGalleryImage.updateMany({
            data: { sortOrder: { increment: 1_000_000 } },
            where: { siteId: input.siteId }
          });
          for (const image of next) {
            if (!canonicalAssetIds.has(String(image.assetId))) {
              continue;
            }

            await tx.siteGalleryImage.update({
              data: {
                alt: String(image.alt),
                sortOrder: Number(image.sortOrder)
              },
              where: {
                siteId_assetId: {
                  assetId: String(image.assetId),
                  siteId: input.siteId
                }
              }
            });
          }
        }
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
        if (hasPublicProjection(before) || hasPublicProjection(after as SiteImageMutationSite)) {
          await markPublicCatalogDirty(tx, "site.image.gallery_update", {
            actorUserId: input.context.actor.id,
            reasonContext: { siteId: input.siteId },
            requestId: input.context.requestId
          });
        }

        return after as SiteImageMutationSite;
      });
    }
  };
}

async function runSiteImageSerializableWithDeadline<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await setLocalStatementTimeout(tx, SITE_IMAGE_DATABASE_ATTACH_TIMEOUT_MS);

        return operation(tx);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: Math.min(
          SERIALIZABLE_MAX_WAIT_MS,
          SITE_IMAGE_DATABASE_ATTACH_TIMEOUT_MS
        ),
        timeout: SITE_IMAGE_DATABASE_ATTACH_TIMEOUT_MS
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (isDatabaseTimeoutError(error)) {
        throw databaseTemporary();
      }
      if (!isRetryableSerializableConflict(error) && !isUniqueConflict(error)) {
        throw error;
      }
      if (attempt === MAX_SERIALIZABLE_ATTEMPTS) {
        throw concurrentModification();
      }
    }
  }

  throw concurrentModification();
}

async function setLocalStatementTimeout(
  tx: Prisma.TransactionClient,
  timeoutMs: number
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('statement_timeout', ${String(timeoutMs)}, true)`;
}

function isDatabaseTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const message = error instanceof Error ? error.message : "";
  const meta = "meta" in error ? (error as { meta?: unknown }).meta : undefined;

  return (
    code === "P2028" ||
    code === "57014" ||
    /statement timeout|transaction.*timed out|timed out|timeout/i.test(message) ||
    (typeof meta === "object" &&
      meta !== null &&
      JSON.stringify(meta).includes("57014"))
  );
}

function isRetryableSerializableConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("code" in error && (error as { code?: unknown }).code === "P2034") {
    return true;
  }

  const cause = "cause" in error ? (error as { cause?: unknown }).cause : undefined;

  return (
    typeof cause === "object" &&
    cause !== null &&
    "kind" in cause &&
    "originalCode" in cause &&
    (cause as { kind?: unknown }).kind === "TransactionWriteConflict" &&
    (cause as { originalCode?: unknown }).originalCode === "40001"
  );
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function databaseTemporary(): AppError {
  return new AppError({
    code: "DATABASE_TEMPORARY",
    message: "Database operation timed out.",
    statusCode: 503
  });
}

function concurrentModification(): AppError {
  return new AppError({
    code: "CONCURRENT_MODIFICATION",
    message: "The operation conflicted with another update. Try again.",
    statusCode: 409
  });
}

function galleryDataInvalid(): AppError {
  return new AppError({
    code: "GALLERY_DATA_INVALID",
    message: "Gallery image data is invalid.",
    statusCode: 409
  });
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

function findGalleryAssetIndex(
  gallery: readonly Record<string, unknown>[],
  assetId: string
): number {
  return gallery.findIndex((item) => item.assetId === assetId);
}

function assertGalleryReorderMatchesCurrent(
  current: readonly Record<string, unknown>[],
  next: readonly Record<string, unknown>[]
): void {
  assertSameAssetSet(readGalleryAssetIds(current), readGalleryAssetIds(next));
}

function assertCanonicalGallerySubsetOfMirror(
  canonicalRows: readonly { assetId: string }[],
  next: readonly Record<string, unknown>[]
): Set<string> {
  const nextIds = readGalleryAssetIds(next);
  const nextSet = new Set(nextIds);
  if (nextSet.size !== nextIds.length) {
    throw galleryDataInvalid();
  }

  const canonicalIds = canonicalRows.map((row) => row.assetId);
  const canonicalSet = new Set(canonicalIds);
  if (canonicalSet.size !== canonicalIds.length) {
    throw galleryDataInvalid();
  }

  for (const assetId of canonicalSet) {
    if (!nextSet.has(assetId)) {
      throw galleryDataInvalid();
    }
  }

  return canonicalSet;
}

function assertSameAssetSet(current: readonly string[], next: readonly string[]): void {
  if (current.length !== next.length) {
    throw galleryDataInvalid();
  }

  const currentSet = new Set(current);
  const nextSet = new Set(next);
  if (currentSet.size !== current.length || nextSet.size !== next.length) {
    throw galleryDataInvalid();
  }

  for (const assetId of nextSet) {
    if (!currentSet.has(assetId)) {
      throw galleryDataInvalid();
    }
  }
}

function readGalleryAssetIds(items: readonly Record<string, unknown>[]): string[] {
  return items.map((item) => {
    if (typeof item.assetId !== "string" || item.assetId.trim() === "") {
      throw galleryDataInvalid();
    }

    return item.assetId;
  });
}

function hasPublicProjection(site: Pick<SiteImageMutationSite, "active" | "deletedAt" | "status">): boolean {
  return site.status === "published" && site.active && site.deletedAt === null;
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
