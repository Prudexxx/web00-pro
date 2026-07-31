import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { createManagedImageUrlPolicy } from "../src/modules/images/image-paths.js";
import {
  mapCategory,
  mapCategoryDetail,
  mapSiteDetail,
  mapSiteSummary,
  parsePublicGalleryImages
} from "../src/modules/public-catalog/public-catalog.mapper.js";
import type {
  PublicCategoryRecord,
  PublicSiteRecord
} from "../src/modules/public-catalog/public-catalog.types.js";

const siteRecord = {
  active: true,
  category: { slug: "goods", title: "Товары" },
  categoryId: "50764c20-cc4c-4206-9d6a-f50fb17bdc5b",
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  deletedAt: null,
  deliveryLabel: "от 3 дней",
  demoLocalUrl: "/internal-demo",
  demoMode: "external-iframe",
  demoUrl: "https://demo.example.test",
  developmentDays: 3,
  externalDemoUrl: "https://external.example.test",
  featured: true,
  features: ["Fast", "Responsive"],
  fullDescription: "Detailed public description",
  galleryImages: [
    {
      alt: "Preview",
      sortOrder: 0,
      storagePath: "catalog/sites/example/gallery/example-01.png",
      url: "assets/img/solution-gallery/example-01.png"
    }
  ],
  id: "3c205371-b407-4d27-8e5c-0dd2a3be8092",
  legacyTitle: "Legacy",
  originalDemoUrl: "https://original.example.test",
  previewImageUrl: "assets/img/previews/example.png",
  previewType: "iframe",
  priceAmountCents: 500000,
  priceLabel: "от 5 000 ₽",
  publishedAt: new Date("2026-07-24T00:00:00.000Z"),
  shortDescription: "Short public description",
  siteUrl: "https://site.example.test",
  slug: "example",
  status: "published",
  tags: ["design", "seo"],
  title: "Example Site",
  updatedAt: new Date("2026-07-02T00:00:00.000Z"),
  views: 100
} satisfies PublicSiteRecord & Record<string, unknown>;

describe("public catalog mapper", () => {
  it("maps a site summary without leaking internal fields", () => {
    const summary = mapSiteSummary(siteRecord);
    const serialized = JSON.stringify(summary);

    expect(summary).toEqual({
      category: { slug: "goods", title: "Товары" },
      deliveryLabel: "от 3 дней",
      demoMode: "external-iframe",
      demoUrl: "https://demo.example.test",
      developmentDays: 3,
      featured: true,
      features: ["Fast", "Responsive"],
      galleryImages: [
        {
          alt: "Preview",
          sortOrder: 0,
          storagePath: "catalog/sites/example/gallery/example-01.png",
          url: "https://prudexxx.github.io/web00-pro/assets/img/solution-gallery/example-01.png"
        }
      ],
      previewImage: null,
      previewImageUrl: "https://prudexxx.github.io/web00-pro/assets/img/previews/example.png",
      previewType: "iframe",
      priceAmountCents: 500000,
      priceLabel: "от 5 000 ₽",
      shortDescription: "Short public description",
      siteUrl: "https://site.example.test",
      slug: "example",
      tags: ["design", "seo"],
      title: "Example Site"
    });
    expect(serialized).not.toContain("3c205371-b407-4d27-8e5c-0dd2a3be8092");
    for (const field of [
      "categoryId",
      "legacyTitle",
      "demoLocalUrl",
      "externalDemoUrl",
      "originalDemoUrl",
      "views",
      "status",
      "deletedAt",
      "createdAt",
      "updatedAt"
    ]) {
      expect(summary).not.toHaveProperty(field);
    }
  });

  it("normalizes legacy image URLs without mutating the source DB object", () => {
    const record: PublicSiteRecord = {
      ...siteRecord,
      galleryImages: [
        {
          alt: "Legacy gallery",
          sortOrder: 2,
          storagePath: "catalog/sites/example/gallery/example-02.png",
          url: "./assets/img/solution-gallery/example-02.png"
        }
      ],
      previewImageUrl: "/web00-pro/assets/img/previews/example.png"
    };
    const originalPreview = record.previewImageUrl;
    const originalGallery = JSON.stringify(record.galleryImages);

    const summary = mapSiteSummary(record);

    expect(summary.previewImageUrl).toBe(
      "https://prudexxx.github.io/web00-pro/assets/img/previews/example.png"
    );
    expect(summary.galleryImages).toEqual([
      {
        alt: "Legacy gallery",
        sortOrder: 2,
        storagePath: "catalog/sites/example/gallery/example-02.png",
        url: "https://prudexxx.github.io/web00-pro/assets/img/solution-gallery/example-02.png"
      }
    ]);
    expect(record.previewImageUrl).toBe(originalPreview);
    expect(JSON.stringify(record.galleryImages)).toBe(originalGallery);
  });

  it("adds managed preview and gallery variants while preserving legacy fields", () => {
    const policy = createManagedImageUrlPolicy({
      bucket: "web00-catalog-images",
      publicBaseUrl: "https://storage.example.test"
    });
    const managedRecord: PublicSiteRecord = {
      ...siteRecord,
      category: { slug: "goods", title: "Goods" },
      galleryImages: [
        {
          alt: "",
          assetId: "33333333-3333-4333-8333-333333333333",
          sortOrder: 0,
          storagePath:
            "sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/gallery/33333333-3333-4333-8333-333333333333",
          url:
            "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/gallery/33333333-3333-4333-8333-333333333333/1200.webp"
        }
      ],
      previewImageUrl:
        "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/preview/44444444-4444-4444-8444-444444444444/1200.webp"
    };

    const summary = mapSiteSummary(managedRecord, policy);

    expect(summary.previewImageUrl).toBe(managedRecord.previewImageUrl);
    expect(summary.previewImage).toMatchObject({
      assetId: "44444444-4444-4444-8444-444444444444",
      variants: [
        expect.objectContaining({ width: 480 }),
        expect.objectContaining({ width: 960 }),
        expect.objectContaining({ width: 1200 })
      ]
    });
    expect(summary.galleryImages[0]).toMatchObject({
      alt: "Example Site",
      assetId: "33333333-3333-4333-8333-333333333333",
      variants: [
        expect.objectContaining({ width: 480 }),
        expect.objectContaining({ width: 960 }),
        expect.objectContaining({ width: 1200 })
      ]
    });
  });

  it("does not classify gallery lookalikes as managed variants", () => {
    const policy = createManagedImageUrlPolicy({
      bucket: "web00-catalog-images",
      publicBaseUrl: "https://storage.example.test"
    });
    const record: PublicSiteRecord = {
      ...siteRecord,
      galleryImages: [
        {
          alt: "Legacy lookalike",
          assetId: "33333333-3333-4333-8333-333333333333",
          sortOrder: 0,
          storagePath:
            "sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/gallery/33333333-3333-4333-8333-333333333333",
          url:
            "https://legacy.example.test/storage/v1/object/public/web00-catalog-images/sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/gallery/33333333-3333-4333-8333-333333333333/1200.webp"
        }
      ]
    };

    const summary = mapSiteSummary(record, policy);

    expect(summary.galleryImages[0]).toMatchObject({
      alt: "Legacy lookalike",
      assetId: "33333333-3333-4333-8333-333333333333",
      url:
        "https://legacy.example.test/storage/v1/object/public/web00-catalog-images/sites/3c205371-b407-4d27-8e5c-0dd2a3be8092/gallery/33333333-3333-4333-8333-333333333333/1200.webp"
    });
    expect(summary.galleryImages[0]).not.toHaveProperty("variants");
  });

  it("does not publish unsafe image URLs as working public URLs", () => {
    const record: PublicSiteRecord = {
      ...siteRecord,
      galleryImages: [
        {
          alt: "Unsafe gallery",
          sortOrder: 0,
          storagePath: "catalog/sites/example/gallery/unsafe.png",
          url: "javascript:alert(1)"
        },
        {
          alt: "Unexpected relative",
          sortOrder: 1,
          storagePath: "catalog/sites/example/gallery/unexpected.png",
          url: "img/unexpected.png"
        }
      ],
      previewImageUrl: "data:image/svg+xml,<svg></svg>"
    };

    const summary = mapSiteSummary(record);

    expect(summary.previewImageUrl).toBeNull();
    expect(summary.previewImage).toBeNull();
    expect(summary.galleryImages).toEqual([]);
  });

  it("maps a site detail with only the approved additional fields", () => {
    expect(mapSiteDetail(siteRecord)).toMatchObject({
      fullDescription: "Detailed public description",
      publishedAt: "2026-07-24T00:00:00.000Z",
      slug: "example"
    });
  });

  it("rejects malformed gallery JSON with a safe internal error", () => {
    expect(() => parsePublicGalleryImages([{ url: "x", storagePath: "y", alt: "", sortOrder: -1 }])).toThrow(AppError);

    try {
      parsePublicGalleryImages([{ raw: "database content" }]);
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }

      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe("Internal server error.");
      expect(JSON.stringify(error)).not.toContain("database content");
    }
  });

  it("maps categories with optional public counts and details", () => {
    const category: PublicCategoryRecord = {
      description: null,
      siteCount: 2,
      slug: "goods",
      sortOrder: 20,
      title: "Товары"
    };

    expect(mapCategory(category)).toEqual({
      description: null,
      siteCount: 2,
      slug: "goods",
      sortOrder: 20,
      title: "Товары"
    });
    expect(mapCategoryDetail(category, [mapSiteSummary(siteRecord)])).toEqual({
      description: null,
      siteCount: 2,
      sites: [mapSiteSummary(siteRecord)],
      slug: "goods",
      sortOrder: 20,
      title: "Товары"
    });
  });
});
