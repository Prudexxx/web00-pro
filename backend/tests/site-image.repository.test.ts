import { describe, expect, it, vi } from "vitest";

import { createPrismaSiteImageRepository } from "../src/modules/admin/images/site-image.repository.js";
import type { AdminMutationContext } from "../src/modules/admin/admin.types.js";
import type { ManagedGalleryImage } from "../src/modules/images/image.types.js";

const siteId = "11111111-1111-4111-8111-111111111111";
const assetId = "33333333-3333-4333-8333-333333333333";

describe("site image repository lifecycle recheck", () => {
  it("rejects editor gallery attach when the final transaction sees a published site", async () => {
    const db = createFakePrisma(siteRecord({ status: "published" }));
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.addGalleryImage({
        context: mutationContext("editor"),
        image: galleryImage(),
        siteId,
        uploadReservationIds: ["reservation-1"]
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.tx.site.update).not.toHaveBeenCalled();
    expect(db.tx.auditLog.create).not.toHaveBeenCalled();
    expect(db.tx.storageCleanupJob.updateMany).not.toHaveBeenCalled();
  });

  it("rejects gallery reorder when the final transaction sees a deleted site", async () => {
    const db = createFakePrisma(siteRecord({ deletedAt: new Date("2026-07-30T00:00:00.000Z") }));
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.reorderGallery({
        context: mutationContext("admin"),
        images: [galleryImage()],
        siteId
      })
    ).rejects.toMatchObject({ code: "SITE_IMAGE_STATE_FORBIDDEN" });

    expect(db.tx.site.update).not.toHaveBeenCalled();
    expect(db.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects gallery delete when the final transaction sees an archived site", async () => {
    const db = createFakePrisma(siteRecord({ status: "archived" }));
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.deleteGalleryImage({
        assetId,
        cleanupPaths: [`sites/${siteId}/gallery/${assetId}/1200.webp`],
        context: mutationContext("admin"),
        siteId
      })
    ).rejects.toMatchObject({ code: "SITE_IMAGE_STATE_FORBIDDEN" });

    expect(db.tx.site.update).not.toHaveBeenCalled();
    expect(db.tx.storageCleanupJob.create).not.toHaveBeenCalled();
    expect(db.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("allows final transaction preview and gallery cleanup when the site is soft-deleted", async () => {
    const db = createFakePrisma(siteRecord({
      active: false,
      deletedAt: new Date("2026-07-30T00:00:00.000Z"),
      previewImageUrl: `https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/${siteId}/preview/${assetId}/1200.webp`,
      status: "draft"
    }));
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.deleteGalleryImage({
        assetId,
        cleanupPaths: [`sites/${siteId}/gallery/${assetId}/1200.webp`],
        context: mutationContext("admin"),
        siteId
      })
    ).resolves.toMatchObject({
      galleryImages: []
    });
    await expect(
      repository.deletePreview({
        cleanupPaths: [`sites/${siteId}/preview/${assetId}/1200.webp`],
        context: mutationContext("admin"),
        siteId
      })
    ).resolves.toMatchObject({
      previewImageUrl: null
    });

    expect(db.tx.site.update).toHaveBeenCalledTimes(2);
    expect(db.tx.storageCleanupJob.create).toHaveBeenCalledTimes(2);
    expect(db.tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("uses a bounded transaction and transaction-local statement timeout for gallery attach", async () => {
    const db = createFakePrisma(siteRecord());
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.addGalleryImage({
        context: mutationContext("editor"),
        image: galleryImage({
          assetId: "33333333-3333-4333-8333-333333333334"
        }),
        siteId,
        uploadReservationIds: ["reservation-1"]
      })
    ).resolves.toMatchObject({
      id: siteId
    });

    expect(db.transactionOptions[0]).toMatchObject({
      maxWait: 10000,
      timeout: 10000
    });
    expect(db.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(db.tx.$executeRaw.mock.calls[0]?.[1]).toBe("10000");
    expect(db.tx.site.findUnique.mock.invocationCallOrder[0] as number).toBeLessThan(
      db.tx.site.update.mock.invocationCallOrder[0] as number
    );
    expect(db.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("maps a transaction deadline overrun to a safe retryable database temporary error", async () => {
    const transactionError = Object.assign(
      new Error("Transaction already closed: transaction timed out"),
      { code: "P2028" }
    );
    const db = createFakePrisma(siteRecord(), { transactionError });
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.addGalleryImage({
        context: mutationContext("editor"),
        image: galleryImage({
          assetId: "33333333-3333-4333-8333-333333333334"
        }),
        siteId,
        uploadReservationIds: ["reservation-1"]
      })
    ).rejects.toMatchObject({
      code: "DATABASE_TEMPORARY",
      message: "Database operation timed out.",
      statusCode: 503
    });

    expect(db.tx.site.update).not.toHaveBeenCalled();
    expect(db.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rolls back gallery attach when the audit write fails", async () => {
    const db = createFakePrisma(siteRecord());
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    db.tx.auditLog.create.mockRejectedValueOnce(new Error("audit failed"));

    await expect(
      repository.addGalleryImage({
        context: mutationContext("editor"),
        image: galleryImage({
          assetId: "33333333-3333-4333-8333-333333333334"
        }),
        siteId,
        uploadReservationIds: ["reservation-1"]
      })
    ).rejects.toThrow("audit failed");

    await expect(repository.getSiteForImageMutation(siteId)).resolves.toMatchObject({
      galleryImages: [galleryImage()]
    });
    expect(db.tx.site.update).toHaveBeenCalledTimes(1);
    expect(db.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

function createFakePrisma(
  site: ReturnType<typeof siteRecord>,
  options: { transactionError?: unknown } = {}
) {
  const transactionOptions: unknown[] = [];
  const tx = {
    $executeRaw: vi.fn(),
    auditLog: {
      create: vi.fn()
    },
    site: {
      findUnique: vi.fn(async () => site),
      update: vi.fn(async (input) => ({ ...site, ...input.data }))
    },
    storageCleanupJob: {
      create: vi.fn(),
      updateMany: vi.fn()
    }
  };
  type FakeTx = typeof tx;
  const prisma = {
    $transaction: vi.fn(
      async (
        operation: (tx: FakeTx) => Promise<unknown>,
        nextTransactionOptions?: unknown
      ) => {
        transactionOptions.push(nextTransactionOptions);
        if (options.transactionError !== undefined) {
          throw options.transactionError;
        }

        return operation(tx);
      }
    ),
    site: {
      findUnique: vi.fn(async () => site)
    }
  };

  return { prisma: prisma as never, transactionOptions, tx };
}

function siteRecord(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    deletedAt: null,
    galleryImages: [galleryImage()],
    id: siteId,
    previewImageUrl: null,
    status: "draft",
    title: "Site title",
    ...overrides
  };
}

function galleryImage(overrides: Partial<ManagedGalleryImage> = {}): ManagedGalleryImage {
  const nextAssetId = overrides.assetId ?? assetId;

  return {
    alt: "Gallery",
    assetId: nextAssetId,
    sortOrder: 0,
    storagePath: `sites/${siteId}/gallery/${nextAssetId}`,
    url: `https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/${siteId}/gallery/${nextAssetId}/1200.webp`,
    ...overrides
  };
}

function mutationContext(role: "admin" | "editor"): AdminMutationContext {
  return {
    actor: {
      email: `${role}@example.test`,
      id: "55555555-5555-4555-8555-555555555555",
      role,
      sessionId: "66666666-6666-4666-8666-666666666666",
      tokenId: "77777777-7777-4777-8777-777777777777"
    },
    now: new Date("2026-07-30T00:00:00.000Z"),
    requestId: "req_image_recheck"
  };
}
