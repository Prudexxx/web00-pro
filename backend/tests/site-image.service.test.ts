import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import type { AdminMutationContext } from "../src/modules/admin/admin.types.js";
import {
  createSiteImageService,
  type SiteImageRepository
} from "../src/modules/admin/images/site-image.service.js";
import type { StorageCleanupRepository } from "../src/modules/storage-cleanup/storage-cleanup.types.js";
import type { ImageProcessor } from "../src/modules/images/image.types.js";
import type { ImageStorage } from "../src/modules/images/image-storage.js";
import { createAssetUploadCoordinator } from "../src/modules/images/asset-upload-coordinator.js";
import { createManagedImageUrlPolicy } from "../src/modules/images/image-paths.js";

const siteId = "11111111-1111-4111-8111-111111111111";
const assetId = "33333333-3333-4333-8333-333333333333";
const otherAssetId = "44444444-4444-4444-8444-444444444444";
const thirdAssetId = "66666666-6666-4666-8666-666666666666";
const actor = {
  active: true,
  email: "admin@example.com",
  id: "55555555-5555-4555-8555-555555555555",
  role: "admin" as const,
  sessionId: "session",
  tokenId: "token"
};
const context: AdminMutationContext = {
  actor,
  now: new Date("2026-07-26T00:00:00.000Z"),
  requestId: "req_images"
};
const policy = createManagedImageUrlPolicy({
  bucket: "web00-catalog-images",
  publicBaseUrl: "https://storage.example.test"
});

function variantPath(
  width: number,
  format: "avif" | "webp",
  slot = "preview",
  id = assetId
) {
  return `sites/${siteId}/${slot}/${id}/${width}.${format}`;
}

function publicUrl(width: number, format: "avif" | "webp", slot = "preview", id = assetId) {
  return `https://storage.example.test/storage/v1/object/public/web00-catalog-images/${variantPath(width, format, slot, id)}`;
}

function processedImageFor(
  id: string,
  slot: "gallery" | "preview"
): Awaited<ReturnType<ImageProcessor["process"]>> {
  return {
    assetId: id,
    originalFormat: "png",
    originalHeight: 600,
    originalOrientation: null,
    originalPixels: 720_000,
    originalWidth: 1200,
    variants: [480, 960, 1200].flatMap((width) => [
      {
        body: Buffer.from(`webp-${id}-${width}`),
        contentType: "image/webp" as const,
        format: "webp" as const,
        height: width / 2,
        path: variantPath(width, "webp", slot, id),
        width
      },
      {
        body: Buffer.from(`avif-${id}-${width}`),
        contentType: "image/avif" as const,
        format: "avif" as const,
        height: width / 2,
        path: variantPath(width, "avif", slot, id),
        width
      }
    ]),
    widths: [480, 960, 1200]
  };
}

function createFakes(overrides: {
  site?: Partial<Awaited<ReturnType<SiteImageRepository["getSiteForImageMutation"]>>>;
} = {}) {
  const events: string[] = [];
  const site = {
    active: true,
    deletedAt: null,
    galleryImages: [],
    id: siteId,
    previewImageUrl: null,
    status: "draft",
    title: "Site title",
    ...overrides.site
  };
  const repository: SiteImageRepository = {
    addGalleryImage: vi.fn(async (input) => {
      events.push("db:add-gallery");
      return {
        ...site,
        galleryImages: [...(site.galleryImages as unknown[]), input.image]
      };
    }),
    deleteGalleryImage: vi.fn(async (input) => {
      events.push("db:delete-gallery");
      return {
        ...site,
        galleryImages: (site.galleryImages as unknown[]).filter(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            "assetId" in item &&
            item.assetId !== input.assetId
        )
      };
    }),
    deletePreview: vi.fn(async () => {
      events.push("db:delete-preview");
      return { ...site, previewImageUrl: null };
    }),
    getSiteForImageMutation: vi.fn(async () => site),
    replacePreview: vi.fn(async (input) => {
      events.push("db:replace-preview");
      return { ...site, previewImageUrl: input.previewImageUrl };
    }),
    reorderGallery: vi.fn(async (input) => {
      events.push("db:reorder-gallery");
      return { ...site, galleryImages: input.images };
    })
  };
  const processor: ImageProcessor = {
    timeoutMs: 150_000,
    process: vi.fn(async (input) => {
      events.push("process");

      return processedImageFor(input.assetId, input.slot);
    })
  };
  const storage: ImageStorage = {
    createBucket: vi.fn(),
    getPublicUrl: vi.fn((path) =>
      `https://storage.example.test/storage/v1/object/public/web00-catalog-images/${path}`
    ),
    inspectBucket: vi.fn(),
    inspectObjects: vi.fn(async () => ({ existingPaths: [], missingPaths: [] })),
    removeObjects: vi.fn(),
    uploadObject: vi.fn(async (input) => {
      events.push(`upload:${input.path}`);
      return {
        path: input.path,
        publicUrl:
          `https://storage.example.test/storage/v1/object/public/web00-catalog-images/${input.path}`
      };
    })
  };
  const cleanup: StorageCleanupRepository = {
    claimDueJobs: vi.fn(),
    createJobs: vi.fn(async () => {
      events.push("cleanup:jobs");
    }),
    createUploadReservations: vi.fn(async (input) => {
      events.push("cleanup:reservations");
      return input.paths.map((path: string, index: number) => ({
        attempts: 0,
        completedAt: null,
        entityId: siteId,
        entityType: "site_image",
        id: `reservation-${index}`,
        lastError: null,
        reason: "upload_reservation",
        runAfter: context.now,
        status: "pending",
        storagePath: path,
        updatedAt: context.now
      }));
    }),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    markUploadReservationsCompleted: vi.fn(),
    recoverStaleProcessing: vi.fn()
  };

  return { cleanup, events, processor, repository, site, storage };
}

describe("PreviewImageService", () => {
  it("creates cleanup reservations before upload and attaches preview atomically after upload", async () => {
    const fakes = createFakes();
    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.preview.replacePreview({
        context,
        file: {
          alt: "",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).resolves.toMatchObject({
      previewImage: {
        assetId,
        url: publicUrl(1200, "webp")
      },
      replaced: false,
      replayed: false
    });
    expect(fakes.events.slice(0, 3)).toEqual([
      "process",
      "cleanup:reservations",
      `upload:${variantPath(480, "webp")}`
    ]);
    expect(fakes.events).toContain("db:replace-preview");
    expect(fakes.repository.replacePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        previewImageUrl: publicUrl(1200, "webp"),
        uploadReservationIds: expect.arrayContaining(["reservation-0"])
      })
    );
  });

  it("does not let preview observability logger failures replace the original error", async () => {
    const fakes = createFakes();

    fakes.storage.uploadObject = vi.fn(async () => {
      throw new AppError({
        code: "STORAGE_WRITE_FAILED",
        message: "Storage write failed.",
        statusCode: 503
      });
    });

    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      diagnostics: {
        environment: "test",
        logger: {
          log() {
            throw new Error("logger unavailable");
          }
        },
        now: () => context.now,
        service: "web00-backend"
      },
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.preview.replacePreview({
        context,
        file: {
          alt: "",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).rejects.toMatchObject({
      code: "STORAGE_WRITE_FAILED",
      message: "Storage write failed."
    });
  });

  it("cleans stale unattached preview objects before uploading deterministic paths", async () => {
    const fakes = createFakes();

    fakes.storage.inspectObjects = vi
      .fn()
      .mockResolvedValueOnce({
        existingPaths: [variantPath(480, "webp")],
        missingPaths: [variantPath(480, "avif")]
      })
      .mockResolvedValueOnce({
        existingPaths: [],
        missingPaths: [variantPath(480, "webp"), variantPath(480, "avif")]
      });
    fakes.storage.removeObjects = vi.fn(async (paths) => {
      fakes.events.push(`remove:${paths.join(",")}`);
      return { removedPaths: [...paths] };
    });

    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.preview.replacePreview({
        context,
        file: {
          alt: "",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).resolves.toMatchObject({ replayed: false });

    expect(fakes.storage.inspectObjects).toHaveBeenCalledTimes(2);
    expect(fakes.cleanup.createJobs).toHaveBeenCalledWith([
      expect.objectContaining({
        reason: "partial_upload_retry",
        storagePath: variantPath(480, "webp")
      })
    ]);
    expect(fakes.events.indexOf("cleanup:jobs")).toBeLessThan(
      fakes.events.indexOf(`remove:${variantPath(480, "webp")}`)
    );
    expect(fakes.events.indexOf(`remove:${variantPath(480, "webp")}`)).toBeLessThan(
      fakes.events.indexOf("cleanup:reservations")
    );
  });

  it("replays an attached preview without processing, upload, audit, or cleanup", async () => {
    const fakes = createFakes({
      site: {
        previewImageUrl: publicUrl(1200, "webp")
      }
    });
    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.preview.replacePreview({
        context,
        file: {
          alt: "",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).resolves.toMatchObject({
      replaced: false,
      replayed: true
    });
    expect(fakes.processor.process).not.toHaveBeenCalled();
    expect(fakes.storage.uploadObject).not.toHaveBeenCalled();
    expect(fakes.cleanup.createUploadReservations).not.toHaveBeenCalled();
    expect(fakes.repository.replacePreview).not.toHaveBeenCalled();
  });

  it("applies central site-state policy for image mutations", async () => {
    const fakes = createFakes({
      site: {
        status: "published"
      }
    });
    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.preview.replacePreview({
        context: { ...context, actor: { ...actor, role: "editor" } },
        file: {
          alt: "",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    fakes.site.status = "archived";

    await expect(
      service.preview.replacePreview({
        context,
        file: {
          alt: "",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).rejects.toMatchObject({ code: "SITE_IMAGE_STATE_FORBIDDEN" });
  });

  it("deletes draft managed previews through cleanup jobs and blocks published preview removal", async () => {
    const fakes = createFakes({
      site: {
        previewImageUrl: publicUrl(1200, "webp")
      }
    });
    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(service.preview.deletePreview({ context, siteId })).resolves.toMatchObject({
      previewImage: null
    });
    expect(fakes.repository.deletePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupPaths: expect.arrayContaining([variantPath(1200, "webp")])
      })
    );

    fakes.site.galleryImages = [];
    fakes.site.galleryImages = [];
    fakes.site.galleryImages = [];
    fakes.site.previewImageUrl = publicUrl(1200, "webp");
    fakes.site.status = "published";

    await expect(service.preview.deletePreview({ context, siteId })).rejects.toMatchObject({
      code: "SITE_PREVIEW_REQUIRED"
    });
  });

  it("allows admin cleanup of preview on a soft-deleted site while keeping upload blocked", async () => {
    const fakes = createFakes({
      site: {
        active: false,
        deletedAt: new Date("2026-07-30T00:00:00.000Z"),
        previewImageUrl: publicUrl(1200, "webp"),
        status: "draft"
      }
    });
    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(service.preview.deletePreview({ context, siteId })).resolves.toMatchObject({
      previewImage: null
    });
    expect(fakes.repository.deletePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupPaths: expect.arrayContaining([variantPath(1200, "webp")])
      })
    );

    await expect(
      service.preview.replacePreview({
        context,
        file: {
          alt: "",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).rejects.toMatchObject({ code: "SITE_IMAGE_STATE_FORBIDDEN" });
    expect(fakes.processor.process).not.toHaveBeenCalled();
  });
});

describe("GalleryImageService", () => {
  it("appends a managed gallery image, allows replay, and rejects preview asset conflicts", async () => {
    const fakes = createFakes();
    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.gallery.addSingle({
        context,
        file: {
          alt: " Gallery alt ",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).resolves.toMatchObject({
      image: {
        alt: "Gallery alt",
        assetId,
        sortOrder: 0
      },
      replayed: false
    });

    fakes.site.galleryImages = [
      {
        alt: "Gallery alt",
        assetId,
        sortOrder: 0,
        storagePath: `sites/${siteId}/gallery/${assetId}`,
        url: publicUrl(1200, "webp", "gallery")
      }
    ];

    await expect(
      service.gallery.addSingle({
        context,
        file: {
          alt: "ignored",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).resolves.toMatchObject({ replayed: true });

    fakes.site.galleryImages = [];
    fakes.site.previewImageUrl = publicUrl(1200, "webp");

    await expect(
      service.gallery.addSingle({
        context,
        file: {
          alt: "",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).rejects.toMatchObject({ code: "UPLOAD_ID_CONFLICT" });
  });

  it("cleans stale unattached gallery objects before single upload", async () => {
    const fakes = createFakes();

    fakes.storage.inspectObjects = vi
      .fn()
      .mockResolvedValueOnce({
        existingPaths: [variantPath(480, "webp", "gallery")],
        missingPaths: [variantPath(480, "avif", "gallery")]
      })
      .mockResolvedValueOnce({
        existingPaths: [],
        missingPaths: [
          variantPath(480, "webp", "gallery"),
          variantPath(480, "avif", "gallery")
        ]
      });
    fakes.storage.removeObjects = vi.fn(async (paths) => {
      fakes.events.push(`remove:${paths.join(",")}`);
      return { removedPaths: [...paths] };
    });

    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.gallery.addSingle({
        context,
        file: {
          alt: "Gallery",
          assetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).resolves.toMatchObject({ replayed: false });

    expect(fakes.storage.inspectObjects).toHaveBeenCalledTimes(2);
    expect(fakes.cleanup.createJobs).toHaveBeenCalledWith([
      expect.objectContaining({
        reason: "partial_upload_retry",
        storagePath: variantPath(480, "webp", "gallery")
      })
    ]);
  });

  it("canonicalizes reorder input and creates cleanup jobs for managed delete", async () => {
    const fakes = createFakes({
      site: {
        galleryImages: [
          {
            alt: "Old",
            assetId,
            sortOrder: 0,
            storagePath: `sites/${siteId}/gallery/${assetId}`,
            url: publicUrl(1200, "webp", "gallery")
          },
          {
            alt: "Other",
            assetId: otherAssetId,
            sortOrder: 1,
            storagePath: `sites/${siteId}/gallery/${otherAssetId}`,
            url: `https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/${siteId}/gallery/${otherAssetId}/1200.webp`
          }
        ]
      }
    });
    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.gallery.reorder({
        context,
        items: [
          { alt: " Other ", assetId: otherAssetId, sortOrder: 10 },
          { alt: "", assetId, sortOrder: 5 }
        ],
        siteId
      })
    ).resolves.toMatchObject({
      images: [
        { assetId: otherAssetId, sortOrder: 0 },
        { alt: "Site title", assetId, sortOrder: 1 }
      ]
    });

    await expect(
      service.gallery.deleteImage({ assetId, context, siteId })
    ).resolves.toMatchObject({
      images: expect.arrayContaining([expect.objectContaining({ assetId: otherAssetId })])
    });
    expect(fakes.repository.deleteGalleryImage).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupPaths: expect.arrayContaining([variantPath(1200, "webp", "gallery")])
      })
    );
  });

  it("allows admin cleanup of gallery images on a soft-deleted site while keeping add and reorder blocked", async () => {
    const fakes = createFakes({
      site: {
        active: false,
        deletedAt: new Date("2026-07-30T00:00:00.000Z"),
        galleryImages: [
          {
            alt: "Deleted gallery",
            assetId,
            sortOrder: 0,
            storagePath: `sites/${siteId}/gallery/${assetId}`,
            url: publicUrl(1200, "webp", "gallery")
          }
        ],
        status: "draft"
      }
    });
    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.gallery.deleteImage({ assetId, context, siteId })
    ).resolves.toMatchObject({ images: [] });
    expect(fakes.repository.deleteGalleryImage).toHaveBeenCalledWith(
      expect.objectContaining({
        cleanupPaths: expect.arrayContaining([variantPath(1200, "webp", "gallery")])
      })
    );

    await expect(
      service.gallery.addSingle({
        context,
        file: {
          alt: "Gallery",
          assetId: otherAssetId,
          declaredMimeType: "image/png",
          index: 0,
          source: Buffer.from("source")
        },
        siteId
      })
    ).rejects.toMatchObject({ code: "SITE_IMAGE_STATE_FORBIDDEN" });
    await expect(
      service.gallery.reorder({
        context,
        items: [{ alt: "Deleted gallery", assetId, sortOrder: 0 }],
        siteId
      })
    ).rejects.toMatchObject({ code: "SITE_IMAGE_STATE_FORBIDDEN" });
  });

  it("rejects gallery lookalikes before scheduling managed cleanup", async () => {
    const fakes = createFakes({
      site: {
        galleryImages: [
          {
            alt: "Lookalike",
            assetId,
            sortOrder: 0,
            storagePath: `sites/${siteId}/gallery/${assetId}`,
            url:
              "https://legacy.example.test/storage/v1/object/public/web00-catalog-images/" +
              `sites/${siteId}/gallery/${assetId}/1200.webp`
          }
        ]
      }
    });
    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.gallery.deleteImage({ assetId, context, siteId })
    ).rejects.toMatchObject({
      code: "GALLERY_DATA_INVALID"
    });
    expect(fakes.repository.deleteGalleryImage).not.toHaveBeenCalled();
  });

  it("processes gallery batches with concurrency two and attaches in input order", async () => {
    const fakes = createFakes();
    const attachOrder: string[] = [];
    let activeProcessors = 0;
    let maxActiveProcessors = 0;

    fakes.processor.process = vi.fn(async (input) => {
      fakes.events.push(`process:start:${input.assetId}`);
      activeProcessors += 1;
      maxActiveProcessors = Math.max(maxActiveProcessors, activeProcessors);
      await new Promise((resolve) =>
        setTimeout(resolve, input.assetId === assetId ? 50 : 5)
      );
      activeProcessors -= 1;
      fakes.events.push(`process:end:${input.assetId}`);

      return {
        assetId: input.assetId,
        originalHeight: 600,
        originalWidth: 1200,
        variants: [480, 960, 1200].flatMap((width) => [
          {
            body: Buffer.from(`webp-${input.assetId}-${width}`),
            contentType: "image/webp" as const,
            format: "webp" as const,
            height: width / 2,
            path: variantPath(width, "webp", input.slot, input.assetId),
            width
          },
          {
            body: Buffer.from(`avif-${input.assetId}-${width}`),
            contentType: "image/avif" as const,
            format: "avif" as const,
            height: width / 2,
            path: variantPath(width, "avif", input.slot, input.assetId),
            width
          }
        ]),
        widths: [480, 960, 1200]
      };
    });
    fakes.repository.addGalleryImage = vi.fn(async (input) => {
      attachOrder.push(input.image.assetId);
      fakes.site.galleryImages = [
        ...(fakes.site.galleryImages as unknown[]),
        input.image
      ];
      return { ...fakes.site };
    });

    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.gallery.addBatch({
        context,
        files: [assetId, otherAssetId, thirdAssetId].map((id, index) => ({
          alt: `Image ${index}`,
          assetId: id,
          declaredMimeType: "image/png",
          index,
          source: Buffer.from(`source-${index}`)
        })),
        siteId
      })
    ).resolves.toMatchObject({
      failed: [],
      succeeded: [{ index: 0 }, { index: 1 }, { index: 2 }]
    });

    expect(maxActiveProcessors).toBe(2);
    expect(
      fakes.events.indexOf(`process:end:${otherAssetId}`)
    ).toBeLessThan(fakes.events.indexOf(`process:end:${assetId}`));
    expect(attachOrder).toEqual([assetId, otherAssetId, thirdAssetId]);
  });

  it("preserves three successes and two timed-out failures in the owner five-gallery batch without orphaned uploads", async () => {
    const fakes = createFakes();
    const galleryIds = [
      "00000000-0000-4000-8000-000000000401",
      "00000000-0000-4000-8000-000000000402",
      "00000000-0000-4000-8000-000000000403",
      "00000000-0000-4000-8000-000000000404",
      "00000000-0000-4000-8000-000000000405"
    ];
    const timedOutIds = new Set(galleryIds.slice(3));
    const logger = { log: vi.fn() };

    fakes.processor.process = vi.fn(async (input) => {
      input.onDiagnostic?.({
        durationMs: 7,
        format: "png",
        height: 600,
        orientation: null,
        pixels: 720_000,
        stage: "METADATA_READ",
        width: 1200
      });

      if (timedOutIds.has(input.assetId)) {
        throw new AppError({
          code: "IMAGE_PROCESSING_TIMEOUT",
          message: "Image processing timed out.",
          statusCode: 503
        });
      }

      return processedImageFor(input.assetId, input.slot);
    });

    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      diagnostics: {
        environment: "production",
        logger,
        now: () => new Date("2026-07-31T12:00:00.000Z"),
        service: "web00-backend"
      },
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });
    const result = await service.gallery.addBatch({
      context: { ...context, requestId: "req_owner_gallery_batch" },
      files: galleryIds.map((id, index) => ({
        alt: `Gallery ${index + 1}`,
        assetId: id,
        declaredMimeType: "image/png",
        index,
        source: Buffer.from(`source-${index}`)
      })),
      siteId
    });

    expect(result.succeeded.map((item) => item.clientFileId)).toEqual(galleryIds.slice(0, 3));
    expect(result.failed).toEqual([
      {
        clientFileId: galleryIds[3],
        code: "IMAGE_PROCESSING_TIMEOUT",
        index: 3,
        message: "Image processing timed out.",
        requestId: "req_owner_gallery_batch"
      },
      {
        clientFileId: galleryIds[4],
        code: "IMAGE_PROCESSING_TIMEOUT",
        index: 4,
        message: "Image processing timed out.",
        requestId: "req_owner_gallery_batch"
      }
    ]);
    expect(fakes.cleanup.createUploadReservations).toHaveBeenCalledTimes(3);
    expect(fakes.storage.uploadObject).toHaveBeenCalledTimes(18);
    expect(fakes.repository.addGalleryImage).toHaveBeenCalledTimes(3);

    const loggedStages = logger.log.mock.calls.map(([entry]) => entry.stage);

    expect(loggedStages).toEqual(
      expect.arrayContaining([
        "PROCESSING_STARTED",
        "METADATA_READ",
        "PROCESSING_COMPLETED",
        "PROCESSING_TIMEOUT",
        "STORAGE_UPLOAD_STARTED",
        "STORAGE_UPLOAD_COMPLETED",
        "FILE_COMPLETED"
      ])
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        clientFileId: galleryIds[3],
        errorCategory: "IMAGE_PROCESSING_TIMEOUT",
        requestId: "req_owner_gallery_batch",
        stage: "PROCESSING_TIMEOUT",
        timeoutMs: expect.any(Number)
      })
    );
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(
      /Screenshot_|storage\/v1|postgres|prisma|libvips|token|secret/i
    );
  });

  it("treats retry/replay of an already attached batch clientFileId as idempotent without duplicate assets", async () => {
    const existingAssetId = "00000000-0000-4000-8000-000000000501";
    const fakes = createFakes({
      site: {
        galleryImages: [
          {
            alt: "Already uploaded",
            assetId: existingAssetId,
            sortOrder: 0,
            storagePath: `sites/${siteId}/gallery/${existingAssetId}`,
            url: publicUrl(1200, "webp", "gallery", existingAssetId),
            widths: [480, 960, 1200]
          }
        ]
      }
    });
    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });

    await expect(
      service.gallery.addBatch({
        context,
        files: [
          {
            alt: "Retry",
            assetId: existingAssetId,
            declaredMimeType: "image/png",
            index: 0,
            source: Buffer.from("same-file")
          }
        ],
        siteId
      })
    ).resolves.toMatchObject({
      failed: [],
      succeeded: [
        {
          clientFileId: existingAssetId,
          index: 0,
          replayed: true
        }
      ]
    });
    expect(fakes.processor.process).not.toHaveBeenCalled();
    expect(fakes.cleanup.createUploadReservations).not.toHaveBeenCalled();
    expect(fakes.storage.uploadObject).not.toHaveBeenCalled();
    expect(fakes.repository.addGalleryImage).not.toHaveBeenCalled();
  });

  it("lets two PNG files exceed the old 45s processor timeout and still complete under the bounded batch policy", async () => {
    vi.useFakeTimers();

    try {
      const fakes = createFakes();

      fakes.processor.process = vi.fn(
        (input) =>
          new Promise<Awaited<ReturnType<ImageProcessor["process"]>>>((resolve) => {
            setTimeout(() => resolve(processedImageFor(input.assetId, input.slot)), 46_000);
          })
      );

      const service = createSiteImageService({
        cleanup: fakes.cleanup,
        coordinator: createAssetUploadCoordinator(),
        imageUrlPolicy: policy,
        processor: fakes.processor,
        repository: fakes.repository,
        storage: fakes.storage
      });
      const result = service.gallery.addBatch({
        context,
        files: [assetId, otherAssetId].map((id, index) => ({
          alt: `Slow PNG ${index + 1}`,
          assetId: id,
          declaredMimeType: "image/png",
          index,
          source: Buffer.from(`slow-${index}`)
        })),
        siteId
      });

      await vi.advanceTimersByTimeAsync(46_000);

      await expect(result).resolves.toMatchObject({
        failed: [],
        succeeded: [{ clientFileId: assetId }, { clientFileId: otherAssetId }]
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels streamed gallery batch work after request abort before reservations or uploads", async () => {
    const fakes = createFakes();
    const abortController = new AbortController();
    const abortError = new AppError({
      code: "VALIDATION_ERROR",
      message: "Invalid multipart request.",
      statusCode: 400
    });
    let resolveProcessorStarted!: () => void;
    let releaseProcessor!: () => void;
    const processorStarted = new Promise<void>((resolve) => {
      resolveProcessorStarted = resolve;
    });
    const processorReleased = new Promise<void>((resolve) => {
      releaseProcessor = resolve;
    });

    fakes.processor.process = vi.fn(async (input) => {
      fakes.events.push(`process:start:${input.assetId}`);
      resolveProcessorStarted();
      await processorReleased;

      return {
        assetId: input.assetId,
        originalHeight: 600,
        originalWidth: 1200,
        variants: [480, 960, 1200].flatMap((width) => [
          {
            body: Buffer.from(`webp-${input.assetId}-${width}`),
            contentType: "image/webp" as const,
            format: "webp" as const,
            height: width / 2,
            path: variantPath(width, "webp", input.slot, input.assetId),
            width
          },
          {
            body: Buffer.from(`avif-${input.assetId}-${width}`),
            contentType: "image/avif" as const,
            format: "avif" as const,
            height: width / 2,
            path: variantPath(width, "avif", input.slot, input.assetId),
            width
          }
        ]),
        widths: [480, 960, 1200]
      };
    });

    async function* abortingFiles(): AsyncIterable<{
      alt: string;
      assetId: string;
      declaredMimeType: string;
      index: number;
      source: Buffer;
    }> {
      yield {
        alt: "Image 0",
        assetId,
        declaredMimeType: "image/png",
        index: 0,
        source: Buffer.from("source-0")
      };
      await new Promise<never>((_, reject) => {
        abortController.signal.addEventListener(
          "abort",
          () => reject(abortError),
          { once: true }
        );
      });
    }

    const service = createSiteImageService({
      cleanup: fakes.cleanup,
      coordinator: createAssetUploadCoordinator(),
      imageUrlPolicy: policy,
      processor: fakes.processor,
      repository: fakes.repository,
      storage: fakes.storage
    });
    const batchResult = service.gallery.addBatchStream({
      context,
      files: abortingFiles(),
      signal: abortController.signal,
      siteId
    });

    await processorStarted;
    abortController.abort(abortError);
    releaseProcessor();
    await expect(batchResult).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fakes.processor.process).toHaveBeenCalledTimes(1);
    expect(fakes.cleanup.createUploadReservations).not.toHaveBeenCalled();
    expect(fakes.storage.uploadObject).not.toHaveBeenCalled();
    expect(fakes.repository.addGalleryImage).not.toHaveBeenCalled();
  });

  it("times out gallery batches after the B7 batch window", async () => {
    vi.useFakeTimers();

    try {
      const fakes = createFakes();

      fakes.processor.process = vi.fn(
        () =>
          new Promise<Awaited<ReturnType<ImageProcessor["process"]>>>(
            () => undefined
          )
      );

      const service = createSiteImageService({
        cleanup: fakes.cleanup,
        coordinator: createAssetUploadCoordinator(),
        imageUrlPolicy: policy,
        processor: fakes.processor,
        repository: fakes.repository,
        storage: fakes.storage
      });
      const batchError = service.gallery.addBatch({
        context,
        files: [
          {
            alt: "Image",
            assetId,
            declaredMimeType: "image/png",
            index: 0,
            source: Buffer.from("source")
          }
        ],
        siteId
      }).catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(180_000);

      await expect(batchError).resolves.toMatchObject({
        code: "IMAGE_PROCESSING_TIMEOUT"
      });
      expect(fakes.repository.addGalleryImage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
