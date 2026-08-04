import { describe, expect, it, vi } from "vitest";

import { createPrismaSiteImageRepository } from "../src/modules/admin/images/site-image.repository.js";
import { createPrismaSiteMediaAssetsRepository } from "../src/modules/admin/images/site-media-assets.repository.js";
import type { AdminMutationContext } from "../src/modules/admin/admin.types.js";
import type { PersistedSiteImageAssetInput } from "../src/modules/admin/images/site-media-assets.repository.js";
import type { ManagedGalleryImage } from "../src/modules/images/image.types.js";

const siteId = "11111111-1111-4111-8111-111111111111";
const assetId = "33333333-3333-4333-8333-333333333333";
const otherAssetId = "44444444-4444-4444-8444-444444444444";

describe("site image repository lifecycle recheck", () => {
  it("creates, replays and rejects conflicting canonical media asset identities", async () => {
    const repository = createPrismaSiteMediaAssetsRepository();
    const asset = galleryAssetInput();
    const tx = createMediaAssetTx();

    await expect(repository.upsertAsset(asset, tx)).resolves.toBeUndefined();
    expect(tx.siteImageAsset.create).toHaveBeenCalledTimes(1);

    tx.siteImageAsset.findUnique.mockResolvedValueOnce(persistedAssetRecord(asset));

    await expect(repository.upsertAsset(asset, tx)).resolves.toBeUndefined();
    expect(tx.siteImageAsset.create).toHaveBeenCalledTimes(1);

    tx.siteImageAsset.findUnique.mockResolvedValueOnce(
      persistedAssetRecord({ ...asset, sourceSha256: "b".repeat(64) })
    );

    await expect(repository.upsertAsset(asset, tx)).rejects.toMatchObject({
      code: "UPLOAD_ID_CONFLICT"
    });
  });

  it("replays a concurrent canonical asset unique race when the persisted identity matches", async () => {
    const repository = createPrismaSiteMediaAssetsRepository();
    const asset = galleryAssetInput();
    const tx = createMediaAssetTx();
    tx.siteImageAsset.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persistedAssetRecord(asset));
    tx.siteImageAsset.create.mockRejectedValueOnce(
      Object.assign(new Error("unique conflict"), { code: "P2002" })
    );

    await expect(repository.upsertAsset(asset, tx)).resolves.toBeUndefined();

    expect(tx.siteImageAsset.create).toHaveBeenCalledTimes(1);
    expect(tx.siteImageAsset.findUnique).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed canonical asset hashes and unsafe variant paths before DB write", async () => {
    const repository = createPrismaSiteMediaAssetsRepository();
    const tx = createMediaAssetTx();

    await expect(
      repository.upsertAsset(galleryAssetInput({ sourceSha256: "A".repeat(64) }), tx)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      repository.upsertAsset(galleryAssetInput({
        variants: [
          {
            contentType: "image/webp",
            format: "webp",
            height: 600,
            path: "https://example.test/object.webp?token=secret",
            width: 1200
          }
        ]
      }), tx)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(tx.siteImageAsset.create).not.toHaveBeenCalled();
  });

  it("rejects editor gallery attach when the final transaction sees a published site", async () => {
    const db = createFakePrisma(siteRecord({ status: "published" }));
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.addGalleryImage({
        asset: galleryAssetInput(),
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
    expect(db.tx.siteGalleryImage.deleteMany).toHaveBeenCalledWith({
      where: { assetId, siteId }
    });
    expect(db.tx.sitePreviewImage.deleteMany).toHaveBeenCalledWith({
      where: { siteId }
    });
    expect(db.tx.storageCleanupJob.create).toHaveBeenCalledTimes(2);
    expect(db.tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it("uses a bounded transaction and transaction-local statement timeout for gallery attach", async () => {
    const db = createFakePrisma(siteRecord());
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.addGalleryImage({
        asset: galleryAssetInput({
          assetId: "33333333-3333-4333-8333-333333333334"
        }),
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

  it("dual-writes preview canonical asset, membership and compatibility mirror atomically", async () => {
    const db = createFakePrisma(siteRecord());
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.replacePreview({
        asset: previewAssetInput(),
        assetId,
        cleanupPaths: [],
        context: mutationContext("admin"),
        previewImageUrl: previewUrl(),
        siteId,
        uploadReservationIds: ["reservation-1"]
      })
    ).resolves.toMatchObject({
      previewAssetId: assetId,
      previewImageUrl: previewUrl()
    });

    expect(db.tx.siteImageAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId,
        decodedFormat: "png",
        height: 600,
        siteId,
        slot: "preview",
        sourceMime: "image/png",
        sourceSha256: "a".repeat(64),
        storagePath: `sites/${siteId}/preview/${assetId}`,
        width: 1200
      })
    });
    expect(db.tx.sitePreviewImage.upsert).toHaveBeenCalledWith({
      create: { assetId, siteId, slot: "preview" },
      update: { assetId, slot: "preview" },
      where: { siteId }
    });
    expect(db.tx.site.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          previewAssetId: assetId,
          previewImageUrl: previewUrl()
        }
      })
    );
    expect(db.tx.storageCleanupJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["reservation-1"] }
        })
      })
    );
  });

  it("replays an already attached preview inside the final transaction without duplicate audit or cleanup", async () => {
    const db = createFakePrisma(siteRecord({
      previewAssetId: assetId,
      previewImageUrl: previewUrl()
    }));
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    db.tx.siteImageAsset.findUnique.mockResolvedValueOnce(
      persistedAssetRecord(previewAssetInput())
    );

    await expect(
      repository.replacePreview({
        asset: previewAssetInput(),
        assetId,
        cleanupPaths: [`sites/${siteId}/preview/${assetId}/1200.webp`],
        context: mutationContext("admin"),
        previewImageUrl: previewUrl(),
        siteId,
        uploadReservationIds: ["reservation-1"]
      })
    ).resolves.toMatchObject({
      previewAssetId: assetId,
      previewImageUrl: previewUrl()
    });

    expect(db.tx.site.update).not.toHaveBeenCalled();
    expect(db.tx.storageCleanupJob.create).not.toHaveBeenCalled();
    expect(db.tx.auditLog.create).not.toHaveBeenCalled();
    expect(db.tx.storageCleanupJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["reservation-1"] }
        })
      })
    );
  });

  it("repairs preview mirror split state instead of replaying by assetId alone", async () => {
    const stalePreviewUrl = previewUrl(otherAssetId);
    const db = createFakePrisma(siteRecord({
      previewAssetId: assetId,
      previewImageUrl: stalePreviewUrl
    }));
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    db.tx.siteImageAsset.findUnique.mockResolvedValueOnce(
      persistedAssetRecord(previewAssetInput())
    );

    await expect(
      repository.replacePreview({
        asset: previewAssetInput(),
        assetId,
        cleanupPaths: [`sites/${siteId}/preview/${otherAssetId}/1200.webp`],
        context: mutationContext("admin"),
        previewImageUrl: previewUrl(),
        siteId,
        uploadReservationIds: ["reservation-1"]
      })
    ).resolves.toMatchObject({
      previewAssetId: assetId,
      previewImageUrl: previewUrl()
    });

    expect(db.tx.site.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          previewAssetId: assetId,
          previewImageUrl: previewUrl()
        }
      })
    );
    expect(db.tx.storageCleanupJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storagePath: `sites/${siteId}/preview/${otherAssetId}/1200.webp`
        })
      })
    );
    expect(db.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("dual-writes gallery canonical asset, membership order and legacy mirror atomically", async () => {
    const nextAssetId = otherAssetId;
    const db = createFakePrisma(siteRecord());
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.addGalleryImage({
        asset: galleryAssetInput({ assetId: nextAssetId }),
        context: mutationContext("admin"),
        image: galleryImage({ assetId: nextAssetId, sortOrder: 1 }),
        siteId,
        uploadReservationIds: ["reservation-1"]
      })
    ).resolves.toMatchObject({
      galleryImages: [
        expect.objectContaining({ assetId, sortOrder: 0 }),
        expect.objectContaining({ assetId: nextAssetId, sortOrder: 1 })
      ]
    });

    expect(db.tx.siteImageAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: nextAssetId,
        siteId,
        slot: "gallery",
        sourceSha256: "a".repeat(64),
        storagePath: `sites/${siteId}/gallery/${nextAssetId}`
      })
    });
    expect(db.tx.siteGalleryImage.create).toHaveBeenCalledWith({
      data: {
        alt: "Gallery",
        assetId: nextAssetId,
        siteId,
        slot: "gallery",
        sortOrder: 1
      }
    });
  });

  it("replays an already attached gallery asset inside the final transaction without duplicating mirror or audit", async () => {
    const db = createFakePrisma(siteRecord());
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    db.tx.siteImageAsset.findUnique.mockResolvedValueOnce(
      persistedAssetRecord(galleryAssetInput())
    );

    await expect(
      repository.addGalleryImage({
        asset: galleryAssetInput(),
        context: mutationContext("admin"),
        image: galleryImage(),
        siteId,
        uploadReservationIds: ["reservation-1"]
      })
    ).resolves.toMatchObject({
      galleryImages: [expect.objectContaining({ assetId, sortOrder: 0 })]
    });

    expect(db.tx.site.update).not.toHaveBeenCalled();
    expect(db.tx.siteGalleryImage.create).not.toHaveBeenCalled();
    expect(db.tx.auditLog.create).not.toHaveBeenCalled();
    expect(db.tx.storageCleanupJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["reservation-1"] }
        })
      })
    );
  });

  it("updates canonical gallery order and legacy mirror from the same ordered asset list", async () => {
    const db = createFakePrisma(siteRecord({
      galleryImages: [
        galleryImage({ assetId, sortOrder: 0 }),
        galleryImage({ assetId: otherAssetId, sortOrder: 1 })
      ]
    }), {
      canonicalGalleryRows: [
        { assetId },
        { assetId: otherAssetId }
      ]
    });
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.reorderGallery({
        context: mutationContext("admin"),
        images: [
          galleryImage({ assetId: otherAssetId, sortOrder: 0 }),
          galleryImage({ assetId, sortOrder: 1 })
        ],
        siteId
      })
    ).resolves.toMatchObject({
      galleryImages: [
        expect.objectContaining({ assetId: otherAssetId, sortOrder: 0 }),
        expect.objectContaining({ assetId, sortOrder: 1 })
      ]
    });

    expect(db.tx.siteGalleryImage.updateMany).toHaveBeenCalledWith({
      data: { sortOrder: { increment: 1_000_000 } },
      where: { siteId }
    });
    expect(db.tx.siteGalleryImage.update).toHaveBeenNthCalledWith(1, {
      data: {
        alt: "Gallery",
        sortOrder: 0
      },
      where: {
        siteId_assetId: {
          assetId: otherAssetId,
          siteId
        }
      }
    });
    expect(db.tx.siteGalleryImage.update).toHaveBeenNthCalledWith(2, {
      data: {
        alt: "Gallery",
        sortOrder: 1
      },
      where: {
        siteId_assetId: {
          assetId,
          siteId
        }
      }
    });
  });

  it("preserves V1 legacy-only gallery reorder when canonical rows have not been backfilled", async () => {
    const db = createFakePrisma(siteRecord({
      galleryImages: [
        galleryImage({ assetId, sortOrder: 0 }),
        galleryImage({ assetId: otherAssetId, sortOrder: 1 })
      ]
    }));
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.reorderGallery({
        context: mutationContext("admin"),
        images: [
          galleryImage({ assetId: otherAssetId, sortOrder: 0 }),
          galleryImage({ assetId, sortOrder: 1 })
        ],
        siteId
      })
    ).resolves.toMatchObject({
      galleryImages: [
        expect.objectContaining({ assetId: otherAssetId, sortOrder: 0 }),
        expect.objectContaining({ assetId, sortOrder: 1 })
      ]
    });

    expect(db.tx.siteGalleryImage.updateMany).not.toHaveBeenCalled();
    expect(db.tx.siteGalleryImage.update).not.toHaveBeenCalled();
    expect(db.tx.site.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          galleryImages: [
            expect.objectContaining({ assetId: otherAssetId, sortOrder: 0 }),
            expect.objectContaining({ assetId, sortOrder: 1 })
          ]
        }
      })
    );
  });

  it("preserves V1 reorder for mixed legacy-only and newly canonical gallery rows", async () => {
    const db = createFakePrisma(siteRecord({
      galleryImages: [
        galleryImage({ assetId, sortOrder: 0 }),
        galleryImage({ assetId: otherAssetId, sortOrder: 1 })
      ]
    }), {
      canonicalGalleryRows: [
        { assetId: otherAssetId }
      ]
    });
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.reorderGallery({
        context: mutationContext("admin"),
        images: [
          galleryImage({ assetId: otherAssetId, sortOrder: 0 }),
          galleryImage({ assetId, sortOrder: 1 })
        ],
        siteId
      })
    ).resolves.toMatchObject({
      galleryImages: [
        expect.objectContaining({ assetId: otherAssetId, sortOrder: 0 }),
        expect.objectContaining({ assetId, sortOrder: 1 })
      ]
    });

    expect(db.tx.siteGalleryImage.updateMany).toHaveBeenCalledWith({
      data: { sortOrder: { increment: 1_000_000 } },
      where: { siteId }
    });
    expect(db.tx.siteGalleryImage.update).toHaveBeenCalledTimes(1);
    expect(db.tx.siteGalleryImage.update).toHaveBeenCalledWith({
      data: {
        alt: "Gallery",
        sortOrder: 0
      },
      where: {
        siteId_assetId: {
          assetId: otherAssetId,
          siteId
        }
      }
    });
  });

  it("rejects stale gallery reorder when the final transaction gallery has a different asset set", async () => {
    const db = createFakePrisma(siteRecord({
      galleryImages: [
        galleryImage({ assetId, sortOrder: 0 }),
        galleryImage({ assetId: otherAssetId, sortOrder: 1 })
      ]
    }), {
      canonicalGalleryRows: [
        { assetId },
        { assetId: otherAssetId }
      ]
    });
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });

    await expect(
      repository.reorderGallery({
        context: mutationContext("admin"),
        images: [galleryImage({ assetId, sortOrder: 0 })],
        siteId
      })
    ).rejects.toMatchObject({ code: "GALLERY_DATA_INVALID" });

    expect(db.tx.siteGalleryImage.updateMany).not.toHaveBeenCalled();
    expect(db.tx.site.update).not.toHaveBeenCalled();
    expect(db.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("maps repeated gallery membership unique races to a safe concurrent modification error", async () => {
    const db = createFakePrisma(siteRecord());
    const repository = createPrismaSiteImageRepository({ prisma: db.prisma });
    db.tx.siteGalleryImage.create.mockRejectedValue(
      Object.assign(new Error("unique conflict"), { code: "P2002" })
    );

    await expect(
      repository.addGalleryImage({
        asset: galleryAssetInput({ assetId: otherAssetId }),
        context: mutationContext("admin"),
        image: galleryImage({ assetId: otherAssetId, sortOrder: 1 }),
        siteId,
        uploadReservationIds: ["reservation-1"]
      })
    ).rejects.toMatchObject({ code: "CONCURRENT_MODIFICATION" });

    expect(db.rawPrisma.$transaction).toHaveBeenCalledTimes(5);
    expect(db.tx.site.update).not.toHaveBeenCalled();
    expect(db.tx.auditLog.create).not.toHaveBeenCalled();
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
        asset: galleryAssetInput({
          assetId: "33333333-3333-4333-8333-333333333334"
        }),
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
        asset: galleryAssetInput({
          assetId: "33333333-3333-4333-8333-333333333334"
        }),
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
  options: {
    canonicalGalleryRows?: Array<{ assetId: string }>;
    transactionError?: unknown;
  } = {}
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
    siteGalleryImage: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(async () => options.canonicalGalleryRows ?? []),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn()
    },
    siteImageAsset: {
      create: vi.fn(),
      findUnique: vi.fn(async (): Promise<unknown> => null)
    },
    sitePreviewImage: {
      deleteMany: vi.fn(),
      upsert: vi.fn()
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

  return { prisma: prisma as never, rawPrisma: prisma, transactionOptions, tx };
}

function createMediaAssetTx() {
  const tx = {
    siteImageAsset: {
      create: vi.fn(),
      findUnique: vi.fn(async (): Promise<unknown> => null)
    }
  };

  return tx as typeof tx &
    Parameters<ReturnType<typeof createPrismaSiteMediaAssetsRepository>["upsertAsset"]>[1];
}

function siteRecord(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    deletedAt: null,
    galleryImages: [galleryImage()],
    id: siteId,
    previewAssetId: null,
    previewImage: null,
    previewImageUrl: null,
    status: "draft",
    title: "Site title",
    ...overrides
  };
}

function previewUrl(id = assetId): string {
  return `https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/${siteId}/preview/${id}/1200.webp`;
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

function previewAssetInput(
  overrides: Partial<PersistedSiteImageAssetInput> = {}
): PersistedSiteImageAssetInput {
  return assetInput({
    slot: "preview",
    storagePath: `sites/${siteId}/preview/${assetId}`,
    ...overrides
  });
}

function galleryAssetInput(
  overrides: Partial<PersistedSiteImageAssetInput> = {}
): PersistedSiteImageAssetInput {
  const nextAssetId = overrides.assetId ?? assetId;

  return assetInput({
    assetId: nextAssetId,
    slot: "gallery",
    storagePath: `sites/${siteId}/gallery/${nextAssetId}`,
    ...overrides
  });
}

function assetInput(
  overrides: Partial<PersistedSiteImageAssetInput> = {}
): PersistedSiteImageAssetInput {
  const nextAssetId = overrides.assetId ?? assetId;
  const slot = overrides.slot ?? "gallery";
  const storagePath = overrides.storagePath ?? `sites/${siteId}/${slot}/${nextAssetId}`;

  return {
    assetId: nextAssetId,
    decodedFormat: "png",
    height: 600,
    siteId,
    slot,
    sourceMime: "image/png",
    sourceSha256: "a".repeat(64),
    storagePath,
    variants: [
      {
        contentType: "image/webp",
        format: "webp",
        height: 600,
        path: `${storagePath}/1200.webp`,
        width: 1200
      },
      {
        contentType: "image/avif",
        format: "avif",
        height: 600,
        path: `${storagePath}/1200.avif`,
        width: 1200
      }
    ],
    width: 1200,
    ...overrides
  };
}

function persistedAssetRecord(asset: PersistedSiteImageAssetInput) {
  return {
    assetId: asset.assetId,
    decodedFormat: asset.decodedFormat,
    height: asset.height,
    siteId: asset.siteId,
    slot: asset.slot,
    sourceMime: asset.sourceMime,
    sourceSha256: asset.sourceSha256,
    storagePath: asset.storagePath,
    variants: asset.variants,
    width: asset.width
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
