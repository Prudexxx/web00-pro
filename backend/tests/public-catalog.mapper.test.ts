import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
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
          url: "assets/img/solution-gallery/example-01.png"
        }
      ],
      previewImageUrl: "assets/img/previews/example.png",
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
