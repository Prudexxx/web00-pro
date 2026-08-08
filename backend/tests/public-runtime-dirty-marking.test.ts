import { describe, expect, it, vi } from "vitest";
import { createPrismaAdminCategoryRepository } from "../src/modules/admin/categories/category.repository.js";
import type { AdminCategoryRecord } from "../src/modules/admin/categories/category.types.js";
import { createAdminCategoryService } from "../src/modules/admin/categories/category.service.js";
import { createPrismaSiteImageRepository } from "../src/modules/admin/images/site-image.repository.js";
import { createSiteImageService, type SiteImageRepository } from "../src/modules/admin/images/site-image.service.js";
import { createPrismaAdminSiteRepository } from "../src/modules/admin/sites/site.repository.js";
import type { AdminMutationContext } from "../src/modules/admin/admin.types.js";
import { createAdminSiteService } from "../src/modules/admin/sites/site.service.js";
import type { AdminSiteRepository } from "../src/modules/admin/sites/site.repository.js";
import type { AdminSiteRecord } from "../src/modules/admin/sites/site.types.js";

function adminContext(requestId = "req-dirty"): AdminMutationContext {
  return {
    actor: {
      email: "owner@example.test",
      id: "11111111-1111-4111-8111-111111111111",
      role: "admin",
      sessionId: "11111111-1111-4111-8111-111111111112",
      tokenId: "11111111-1111-4111-8111-111111111113"
    },
    now: new Date("2026-08-07T12:00:00.000Z"),
    requestId
  };
}

function siteRecord(overrides: Partial<AdminSiteRecord> = {}): AdminSiteRecord {
  return {
    active: true,
    category: { id: "22222222-2222-4222-8222-222222222222", slug: "goods", title: "Goods" },
    categoryId: "22222222-2222-4222-8222-222222222222",
    createdAt: new Date("2026-08-07T10:00:00.000Z"),
    deletedAt: null,
    deliveryLabel: "7 days",
    demoLocalUrl: null,
    demoMode: "external",
    demoUrl: "https://example.test/demo",
    developmentDays: 7,
    externalDemoUrl: null,
    featured: false,
    features: ["Fast"],
    fullDescription: "Full",
    galleryImages: [],
    id: "33333333-3333-4333-8333-333333333333",
    legacyTitle: null,
    originalDemoUrl: null,
    previewImageUrl: "https://example.test/preview.webp",
    previewType: "image",
    priceAmountCents: 100000,
    priceLabel: "from 1000",
    publishedAt: new Date("2026-08-07T11:00:00.000Z"),
    shortDescription: "Short",
    siteUrl: "https://example.test/site",
    slug: "site-one",
    sortOrder: 10,
    status: "published",
    tags: ["tag"],
    title: "Site One",
    updatedAt: new Date("2026-08-07T11:30:00.000Z"),
    views: 12,
    ...overrides
  };
}

function categoryRecord(overrides: Partial<AdminCategoryRecord> = {}): AdminCategoryRecord {
  return {
    active: true,
    createdAt: new Date("2026-08-07T10:00:00.000Z"),
    description: "Category",
    id: "22222222-2222-4222-8222-222222222222",
    slug: "goods",
    sortOrder: 1,
    title: "Goods",
    updatedAt: new Date("2026-08-07T11:00:00.000Z"),
    ...overrides
  };
}

function galleryImage(assetId: string, sortOrder: number) {
  return {
    alt: `Image ${assetId}`,
    assetId,
    sortOrder,
    storagePath: `sites/33333333-3333-4333-8333-333333333333/gallery/${assetId}` as const,
    url: `https://example.test/${assetId}.webp`
  };
}

function controlMocks() {
  const state = {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotGeneratedAt: null,
    currentSnapshotPath: null,
    desiredRevision: 1,
    id: "public-catalog",
    lastSyncErrorCode: null as string | null,
    lastSyncRequestId: null as string | null,
    publishedRevision: 1,
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "ready"
  };
  return {
    findUnique: vi.fn().mockResolvedValue({ ...state }),
    upsert: vi.fn().mockImplementation(async (input) => {
      const data = input.update ?? input.create;
      if (typeof data.desiredRevision === "number") {
        state.desiredRevision = data.desiredRevision;
      } else if (typeof data.desiredRevision?.increment === "number") {
        state.desiredRevision += data.desiredRevision.increment;
      }
      if (typeof data.syncStatus === "string") {
        state.syncStatus = data.syncStatus;
      }
      if ("lastSyncErrorCode" in data) {
        state.lastSyncErrorCode = data.lastSyncErrorCode;
      }
      if ("lastSyncRequestId" in data) {
        state.lastSyncRequestId = data.lastSyncRequestId;
      }
      return { ...state };
    })
  };
}

describe("public runtime transactional dirty marking", () => {
  it("schedules reconcile after a published site update commits", async () => {
    const requestReconcile = vi.fn();
    const repository = {
      getSite: vi.fn(async () => siteRecord()),
      updateSite: vi.fn(async () => siteRecord({ title: "Site One Updated" }))
    } as unknown as AdminSiteRepository;
    const service = createAdminSiteService({
      publicCatalogReconciler: { requestReconcile },
      repository
    });

    await service.updateSite(
      "33333333-3333-4333-8333-333333333333",
      { title: "Site One Updated" },
      adminContext("req-service-site-update")
    );

    expect(requestReconcile).toHaveBeenCalledWith({
      reason: "site.update",
      requestId: "req-service-site-update"
    });
  });

  it("does not schedule reconcile when a site repository mutation fails", async () => {
    const requestReconcile = vi.fn();
    const repository = {
      getSite: vi.fn(async () => siteRecord()),
      updateSite: vi.fn(async () => {
        throw new Error("repository failed");
      })
    } as unknown as AdminSiteRepository;
    const service = createAdminSiteService({
      publicCatalogReconciler: { requestReconcile },
      repository
    });

    await expect(service.updateSite(
      "33333333-3333-4333-8333-333333333333",
      { title: "Site One Updated" },
      adminContext("req-service-site-fail")
    )).rejects.toThrow("repository failed");

    expect(requestReconcile).not.toHaveBeenCalled();
  });

  it("schedules reconcile after category public projection update commits", async () => {
    const requestReconcile = vi.fn();
    const service = createAdminCategoryService({
      publicCatalogReconciler: { requestReconcile },
      repository: {
        updateCategory: vi.fn(async () => categoryRecord({ title: "Goods Updated" }))
      } as never
    });

    await service.updateCategory(
      "22222222-2222-4222-8222-222222222222",
      { title: "Goods Updated" },
      adminContext("req-service-category-update")
    );

    expect(requestReconcile).toHaveBeenCalledWith({
      reason: "category.update",
      requestId: "req-service-category-update"
    });
  });

  it("schedules reconcile once after a gallery reorder commits", async () => {
    const imageA = galleryImage("88888888-8888-4888-8888-888888888888", 0);
    const imageB = galleryImage("99999999-9999-4999-8999-999999999999", 1);
    const requestReconcile = vi.fn();
    const repository = {
      getSiteForImageMutation: vi.fn(async () => siteRecord({ galleryImages: [imageA, imageB] })),
      reorderGallery: vi.fn(async () => siteRecord({
        galleryImages: [{ ...imageB, sortOrder: 0 }, { ...imageA, sortOrder: 1 }]
      }))
    } as unknown as SiteImageRepository;
    const service = createSiteImageService({
      cleanup: {} as never,
      coordinator: {} as never,
      imageUrlPolicy: {
        buildVariants: vi.fn(() => []),
        parseManagedGallery: vi.fn((siteId: string, url: string) => {
          const record = [imageA, imageB].find((image) => image.url === url);
          return record === undefined
            ? null
            : {
                assetId: record.assetId,
                siteId,
                slot: "gallery" as const,
                storagePath: record.storagePath,
                url,
                widths: [320]
              };
        }),
        parseManagedPreview: vi.fn(() => null)
      },
      processor: {} as never,
      publicCatalogReconciler: { requestReconcile },
      repository,
      storage: {} as never
    });

    await service.gallery.reorder({
      context: adminContext("req-service-gallery-reorder"),
      items: [
        { alt: imageB.alt, assetId: imageB.assetId, sortOrder: 0 },
        { alt: imageA.alt, assetId: imageA.assetId, sortOrder: 1 }
      ],
      siteId: "33333333-3333-4333-8333-333333333333"
    });

    expect(requestReconcile).toHaveBeenCalledTimes(1);
    expect(requestReconcile).toHaveBeenCalledWith({
      reason: "site.image.gallery_update",
      requestId: "req-service-gallery-reorder"
    });
  });

  it("increments desired revision for a published public site field update in the same transaction", async () => {
    const before = siteRecord();
    const after = siteRecord({ title: "Site One Updated" });
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: controlMocks(),
      site: {
        findUnique: vi.fn().mockResolvedValue(before),
        update: vi.fn().mockResolvedValue(after)
      }
    };
    const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
    const repository = createPrismaAdminSiteRepository({ prisma: prisma as never });

    await repository.updateSite(before.id, { title: after.title }, adminContext("req-site-update"));

    expect(tx.publicCatalogControl.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ desiredRevision: { increment: 1 }, syncStatus: "pending" })
    }));
    expect(tx.auditLog.create.mock.calls.map(([input]) => input.data.action)).toContain("public_catalog.dirty");
  });

  it("does not increment desired revision for a published no-op site update", async () => {
    const before = siteRecord();
    const after = siteRecord({ updatedAt: new Date("2026-08-07T12:01:00.000Z") });
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: controlMocks(),
      site: {
        findUnique: vi.fn().mockResolvedValue(before),
        update: vi.fn().mockResolvedValue(after)
      }
    };
    const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
    const repository = createPrismaAdminSiteRepository({ prisma: prisma as never });

    await repository.updateSite(before.id, { title: before.title }, adminContext("req-site-noop"));

    expect(tx.publicCatalogControl.upsert).not.toHaveBeenCalled();
  });

  it("increments desired revision for lifecycle changes that enter or leave public visibility", async () => {
    const actions = [
      ["publishSite", siteRecord({ publishedAt: null, status: "draft" }), siteRecord({ status: "published" })],
      ["unpublishSite", siteRecord(), siteRecord({ publishedAt: null, status: "draft" })],
      ["softDeleteSite", siteRecord(), siteRecord({ active: false, deletedAt: new Date("2026-08-07T12:00:00.000Z"), publishedAt: null, status: "draft" })]
    ] as const;

    for (const [method, before, after] of actions) {
      const tx = {
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        category: { findUnique: vi.fn().mockResolvedValue({ active: true }) },
        publicCatalogControl: controlMocks(),
        site: {
          findUnique: vi.fn().mockResolvedValue(before),
          findUniqueOrThrow: vi.fn().mockResolvedValue(after),
          updateMany: vi.fn().mockResolvedValue({ count: 1 })
        }
      };
      const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
      const repository = createPrismaAdminSiteRepository({ prisma: prisma as never });

      await repository[method](before.id, adminContext(`req-${method}`));

      expect(tx.publicCatalogControl.upsert, method).toHaveBeenCalled();
    }
  });

  it("does not dirty for lifecycle changes that remain outside public visibility", async () => {
    const actions = [
      ["softDeleteSite", siteRecord({ publishedAt: null, status: "draft" }), siteRecord({ active: false, deletedAt: new Date("2026-08-07T12:00:00.000Z"), publishedAt: null, status: "draft" })],
      ["restoreSite", siteRecord({ active: false, deletedAt: new Date("2026-08-07T11:00:00.000Z"), publishedAt: null, status: "draft" }), siteRecord({ publishedAt: null, status: "draft" })]
    ] as const;

    for (const [method, before, after] of actions) {
      const tx = {
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        category: { findUnique: vi.fn().mockResolvedValue({ active: true }) },
        publicCatalogControl: controlMocks(),
        site: {
          findUnique: vi.fn().mockResolvedValue(before),
          findUniqueOrThrow: vi.fn().mockResolvedValue(after),
          updateMany: vi.fn().mockResolvedValue({ count: 1 })
        }
      };
      const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
      const repository = createPrismaAdminSiteRepository({ prisma: prisma as never });

      await repository[method](before.id, adminContext(`req-${method}-invisible`));

      expect(tx.publicCatalogControl.upsert, method).not.toHaveBeenCalled();
    }

    const deleted = siteRecord({ active: false, deletedAt: new Date("2026-08-07T11:00:00.000Z"), publishedAt: null, status: "draft" });
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: controlMocks(),
      site: {
        delete: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue(deleted)
      }
    };
    const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
    const repository = createPrismaAdminSiteRepository({ prisma: prisma as never });

    await repository.permanentlyDeleteSite(deleted.id, adminContext("req-permanent-delete"));

    expect(tx.publicCatalogControl.upsert).not.toHaveBeenCalled();
  });

  it("increments desired revision for category projection changes only when linked public sites can change", async () => {
    const before = categoryRecord();
    const after = categoryRecord({ title: "Goods Updated" });
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      category: {
        findUnique: vi.fn().mockResolvedValue(before),
        update: vi.fn().mockResolvedValue(after)
      },
      publicCatalogControl: controlMocks(),
      site: {
        count: vi.fn().mockResolvedValue(2)
      }
    };
    const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
    const repository = createPrismaAdminCategoryRepository({ prisma: prisma as never });

    await repository.updateCategory(before.id, { title: after.title }, adminContext("req-category"));

    expect(tx.site.count).toHaveBeenCalled();
    expect(tx.publicCatalogControl.upsert).toHaveBeenCalled();
  });

  it("does not dirty for real mutable site and category fields outside the public projection", async () => {
    const beforeSite = siteRecord({ legacyTitle: "Internal old title" });
    const afterSite = siteRecord({ legacyTitle: "Internal new title" });
    const siteTx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: controlMocks(),
      site: {
        findUnique: vi.fn().mockResolvedValue(beforeSite),
        update: vi.fn().mockResolvedValue(afterSite)
      }
    };
    const siteRepository = createPrismaAdminSiteRepository({
      prisma: { $transaction: vi.fn(async (callback) => callback(siteTx)) } as never
    });

    await siteRepository.updateSite(beforeSite.id, { legacyTitle: afterSite.legacyTitle }, adminContext("req-site-internal"));

    expect(siteTx.publicCatalogControl.upsert).not.toHaveBeenCalled();

    const beforeCategory = categoryRecord({ description: "Internal category note" });
    const afterCategory = categoryRecord({ description: "Internal category note updated" });
    const categoryTx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      category: {
        findUnique: vi.fn().mockResolvedValue(beforeCategory),
        update: vi.fn().mockResolvedValue(afterCategory)
      },
      publicCatalogControl: controlMocks(),
      site: {
        count: vi.fn().mockResolvedValue(2)
      }
    };
    const categoryRepository = createPrismaAdminCategoryRepository({
      prisma: { $transaction: vi.fn(async (callback) => callback(categoryTx)) } as never
    });

    await categoryRepository.updateCategory(
      beforeCategory.id,
      { description: afterCategory.description },
      adminContext("req-category-internal")
    );

    expect(categoryTx.site.count).not.toHaveBeenCalled();
    expect(categoryTx.publicCatalogControl.upsert).not.toHaveBeenCalled();
  });

  it("keeps ordinary admin public mutations successful when public_catalog_control is absent during staged deploy", async () => {
    const before = siteRecord();
    const after = siteRecord({ title: "Site One Updated While Control Missing" });
    const missingTableError = Object.assign(
      new Error("P2021: relation public_catalog_control does not exist"),
      { code: "P2021", clientVersion: "test" }
    );
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: {
        findUnique: vi.fn().mockRejectedValue(missingTableError),
        upsert: vi.fn().mockRejectedValue(missingTableError)
      },
      site: {
        findUnique: vi.fn().mockResolvedValue(before),
        update: vi.fn().mockResolvedValue(after)
      }
    };
    const repository = createPrismaAdminSiteRepository({
      prisma: { $transaction: vi.fn(async (callback) => callback(tx)) } as never
    });

    await expect(
      repository.updateSite(before.id, { title: after.title }, adminContext("req-staged-missing-control"))
    ).resolves.toMatchObject({
      id: before.id,
      title: after.title
    });

    expect(tx.publicCatalogControl.upsert).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create.mock.calls.map(([input]) => input.data.action)).toEqual(["site.update"]);
  });

  it("increments desired revision for published preview/gallery public image mutations but not drafts", async () => {
    const published = siteRecord();
    const tx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: controlMocks(),
      site: {
        findUnique: vi.fn().mockResolvedValue(published),
        update: vi.fn().mockResolvedValue({ ...published, previewImageUrl: "https://example.test/new.webp" })
      },
      storageCleanupJob: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      }
    };
    const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
    const repository = createPrismaSiteImageRepository({ prisma: prisma as never });

    await repository.replacePreview({
      assetId: "44444444-4444-4444-8444-444444444444",
      cleanupPaths: [],
      context: adminContext("req-preview"),
      onStage: () => undefined,
      previewImageUrl: "https://example.test/new.webp",
      siteId: published.id,
      uploadReservationIds: []
    });

    expect(tx.publicCatalogControl.upsert).toHaveBeenCalled();

    const draft = siteRecord({ publishedAt: null, status: "draft" });
    const draftTx = {
      ...tx,
      publicCatalogControl: controlMocks(),
      site: {
        findUnique: vi.fn().mockResolvedValue(draft),
        update: vi.fn().mockResolvedValue({ ...draft, previewImageUrl: "https://example.test/draft-new.webp" })
      }
    };
    const draftRepository = createPrismaSiteImageRepository({
      prisma: { $transaction: vi.fn(async (callback) => callback(draftTx)) } as never
    });

    await draftRepository.replacePreview({
      assetId: "55555555-5555-4555-8555-555555555555",
      cleanupPaths: [],
      context: adminContext("req-preview-draft"),
      onStage: () => undefined,
      previewImageUrl: "https://example.test/draft-new.webp",
      siteId: draft.id,
      uploadReservationIds: []
    });

    expect(draftTx.publicCatalogControl.upsert).not.toHaveBeenCalled();
  });

  it("marks dirty once for published preview add, replace, and delete mutations", async () => {
    const cases = [
      {
        action: "replacePreview" as const,
        after: siteRecord({ previewImageUrl: "https://example.test/preview-added.webp" }),
        before: siteRecord({ previewImageUrl: null }),
        input: {
          assetId: "66666666-6666-4666-8666-666666666666",
          cleanupPaths: [],
          context: adminContext("req-preview-add"),
          onStage: () => undefined,
          previewImageUrl: "https://example.test/preview-added.webp",
          siteId: "33333333-3333-4333-8333-333333333333",
          uploadReservationIds: []
        }
      },
      {
        action: "replacePreview" as const,
        after: siteRecord({ previewImageUrl: "https://example.test/preview-replaced.webp" }),
        before: siteRecord({ previewImageUrl: "https://example.test/preview-old.webp" }),
        input: {
          assetId: "77777777-7777-4777-8777-777777777777",
          cleanupPaths: [],
          context: adminContext("req-preview-replace"),
          onStage: () => undefined,
          previewImageUrl: "https://example.test/preview-replaced.webp",
          siteId: "33333333-3333-4333-8333-333333333333",
          uploadReservationIds: []
        }
      },
      {
        action: "deletePreview" as const,
        after: siteRecord({ previewImageUrl: null }),
        before: siteRecord({ previewImageUrl: "https://example.test/preview-old.webp" }),
        input: {
          cleanupPaths: [],
          context: adminContext("req-preview-delete"),
          siteId: "33333333-3333-4333-8333-333333333333"
        }
      }
    ];

    for (const testCase of cases) {
      const tx = {
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        publicCatalogControl: controlMocks(),
        site: {
          findUnique: vi.fn().mockResolvedValue(testCase.before),
          update: vi.fn().mockResolvedValue(testCase.after)
        },
        storageCleanupJob: {
          create: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 0 })
        }
      };
      const repository = createPrismaSiteImageRepository({
        prisma: { $transaction: vi.fn(async (callback) => callback(tx)) } as never
      });

      await repository[testCase.action](testCase.input as never);

      expect(tx.publicCatalogControl.upsert, testCase.input.context.requestId).toHaveBeenCalledTimes(1);
    }
  });

  it("marks dirty once for published gallery add, delete, and actual reorder mutations", async () => {
    const imageA = galleryImage("88888888-8888-4888-8888-888888888888", 0);
    const imageB = galleryImage("99999999-9999-4999-8999-999999999999", 1);
    const cases = [
      {
        action: "addGalleryImage" as const,
        after: siteRecord({ galleryImages: [imageA] }),
        before: siteRecord({ galleryImages: [] }),
        input: {
          context: adminContext("req-gallery-add"),
          image: imageA,
          siteId: "33333333-3333-4333-8333-333333333333",
          uploadReservationIds: []
        }
      },
      {
        action: "deleteGalleryImage" as const,
        after: siteRecord({ galleryImages: [] }),
        before: siteRecord({ galleryImages: [imageA] }),
        input: {
          assetId: imageA.assetId,
          cleanupPaths: [],
          context: adminContext("req-gallery-delete"),
          siteId: "33333333-3333-4333-8333-333333333333"
        }
      },
      {
        action: "reorderGallery" as const,
        after: siteRecord({ galleryImages: [{ ...imageB, sortOrder: 0 }, { ...imageA, sortOrder: 1 }] }),
        before: siteRecord({ galleryImages: [imageA, imageB] }),
        input: {
          context: adminContext("req-gallery-reorder"),
          images: [{ ...imageB, sortOrder: 0 }, { ...imageA, sortOrder: 1 }],
          siteId: "33333333-3333-4333-8333-333333333333"
        }
      }
    ];

    for (const testCase of cases) {
      const tx = {
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        publicCatalogControl: controlMocks(),
        site: {
          findUnique: vi.fn().mockResolvedValue(testCase.before),
          update: vi.fn().mockResolvedValue(testCase.after)
        },
        storageCleanupJob: {
          create: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 0 })
        }
      };
      const repository = createPrismaSiteImageRepository({
        prisma: { $transaction: vi.fn(async (callback) => callback(tx)) } as never
      });

      await repository[testCase.action](testCase.input as never);

      expect(tx.publicCatalogControl.upsert, testCase.input.context.requestId).toHaveBeenCalledTimes(1);
    }
  });

  it("does not dirty for identical gallery reorder or draft gallery mutation", async () => {
    const imageA = galleryImage("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 0);
    const imageB = galleryImage("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1);
    const identicalTx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: controlMocks(),
      site: {
        findUnique: vi.fn().mockResolvedValue(siteRecord({ galleryImages: [imageA, imageB] })),
        update: vi.fn().mockResolvedValue(siteRecord({ galleryImages: [imageA, imageB] }))
      }
    };
    const identicalRepository = createPrismaSiteImageRepository({
      prisma: { $transaction: vi.fn(async (callback) => callback(identicalTx)) } as never
    });

    await identicalRepository.reorderGallery({
      context: adminContext("req-gallery-identical"),
      images: [imageA, imageB],
      siteId: "33333333-3333-4333-8333-333333333333"
    });

    expect(identicalTx.publicCatalogControl.upsert).not.toHaveBeenCalled();

    const draft = siteRecord({ galleryImages: [], publishedAt: null, status: "draft" });
    const draftTx = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      publicCatalogControl: controlMocks(),
      site: {
        findUnique: vi.fn().mockResolvedValue(draft),
        update: vi.fn().mockResolvedValue({ ...draft, galleryImages: [imageA] })
      },
      storageCleanupJob: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      }
    };
    const draftRepository = createPrismaSiteImageRepository({
      prisma: { $transaction: vi.fn(async (callback) => callback(draftTx)) } as never
    });

    await draftRepository.addGalleryImage({
      context: adminContext("req-gallery-draft"),
      image: imageA,
      siteId: draft.id,
      uploadReservationIds: []
    });

    expect(draftTx.publicCatalogControl.upsert).not.toHaveBeenCalled();
  });
});
