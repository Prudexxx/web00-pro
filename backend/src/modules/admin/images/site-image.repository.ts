import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { AppError } from "../../../lib/errors.js";
import {
  MAX_SERIALIZABLE_ATTEMPTS,
  SERIALIZABLE_MAX_WAIT_MS,
  runSerializableWithRetry
} from "../../../cli/cli-user.repository.js";
import type { ManagedGalleryImage } from "../../images/image.types.js";
import type { PreviewUploadStage } from "../../images/preview-upload-observability.js";
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
  previewImageUrl: true,
  status: true,
  title: true
} satisfies Prisma.SiteSelect;

export const SITE_IMAGE_DATABASE_ATTACH_TIMEOUT_MS = 10_000;

export function createPrismaSiteImageRepository(options: {
  prisma: PrismaClient;
}): SiteImageRepository {
  const prisma = options.prisma;

  return {
    async addGalleryImage(input) {
      return runSiteImageSerializableWithDeadline(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        assertCanMutateSiteImages(input.context.actor, before);
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

        return after as SiteImageMutationSite;
      });
    },
    async deleteGalleryImage(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        assertCanDeleteSiteImages(input.context.actor, before);
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

        return after as SiteImageMutationSite;
      });
    },
    async deletePreview(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        assertCanDeleteSiteImages(input.context.actor, before);
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

        return after as SiteImageMutationSite;
      });

      onStage("DB_ATTACH_COMMITTED");

      return after;
    },
    async reorderGallery(input) {
      return runSerializableWithRetry(prisma, async (tx) => {
        const before = await getSiteOrThrow(tx, input.siteId);
        assertCanMutateSiteImages(input.context.actor, before);
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
      if (!isRetryableSerializableConflict(error)) {
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
