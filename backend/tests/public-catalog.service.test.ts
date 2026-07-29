import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { createPublicCatalogService } from "../src/modules/public-catalog/public-catalog.service.js";
import type {
  PublicCatalogRepository,
  PublicCategoryRecord,
  PublicSiteRecord
} from "../src/modules/public-catalog/public-catalog.types.js";

const siteRecord: PublicSiteRecord = {
  category: { slug: "goods", title: "Товары" },
  deliveryLabel: null,
  demoMode: null,
  demoUrl: null,
  developmentDays: null,
  featured: false,
  features: ["Responsive"],
  fullDescription: "Full",
  galleryImages: [],
  previewImageUrl: null,
  previewType: null,
  priceAmountCents: null,
  priceLabel: null,
  publishedAt: new Date("2026-07-24T00:00:00.000Z"),
  shortDescription: "Short",
  siteUrl: null,
  slug: "published-site",
  tags: ["design"],
  title: "Published site"
};
const categoryRecord: PublicCategoryRecord = {
  description: null,
  siteCount: 1,
  slug: "goods",
  sortOrder: 20,
  title: "Товары"
};

function createRepository(overrides: Partial<PublicCatalogRepository> = {}): PublicCatalogRepository {
  return {
    getPublicCategoryBySlug: vi.fn().mockResolvedValue(categoryRecord),
    getPublicCategoryWithSites: vi.fn().mockResolvedValue({
      category: categoryRecord,
      meta: { limit: 12, page: 1, total: 1, totalPages: 1 },
      sites: [siteRecord]
    }),
    getPublicSiteBySlug: vi.fn().mockResolvedValue(siteRecord),
    listCategories: vi.fn().mockResolvedValue([categoryRecord]),
    listPopularSites: vi.fn().mockResolvedValue([siteRecord]),
    listSites: vi.fn().mockResolvedValue({
      meta: { limit: 12, page: 1, total: 1, totalPages: 1 },
      rows: [siteRecord]
    }),
    ...overrides
  };
}

describe("public catalog service", () => {
  it("maps list sites records and pagination meta", async () => {
    const repository = createRepository();
    const service = createPublicCatalogService({ repository });

    await expect(
      service.listSites({ limit: 12, page: 1, sort: "sortOrder", tags: [] })
    ).resolves.toEqual({
      data: [expect.objectContaining({ slug: "published-site" })],
      meta: { limit: 12, page: 1, total: 1, totalPages: 1 }
    });
  });

  it("maps popular sites without exposing views", async () => {
    const service = createPublicCatalogService({ repository: createRepository() });
    const response = await service.listPopularSites({ limit: 6 });

    expect(response.data).toHaveLength(1);
    expect(response.data[0]).not.toHaveProperty("views");
  });

  it("throws SITE_NOT_FOUND for a hidden or missing site", async () => {
    const service = createPublicCatalogService({
      repository: createRepository({ getPublicSiteBySlug: vi.fn().mockResolvedValue(null) })
    });

    await expect(service.getSiteBySlug("draft-site")).rejects.toMatchObject({
      code: "SITE_NOT_FOUND",
      message: "Site not found.",
      statusCode: 404
    });
  });

  it("maps active categories and public-only counts", async () => {
    const service = createPublicCatalogService({ repository: createRepository() });

    await expect(service.listCategories({ includeCounts: true })).resolves.toEqual({
      data: [
        {
          description: null,
          siteCount: 1,
          slug: "goods",
          sortOrder: 20,
          title: "Товары"
        }
      ]
    });
  });

  it("throws CATEGORY_NOT_FOUND for an inactive or missing category", async () => {
    const service = createPublicCatalogService({
      repository: createRepository({ getPublicCategoryBySlug: vi.fn().mockResolvedValue(null) })
    });

    await expect(
      service.getCategoryBySlug("hidden-category", { includeSites: false, limit: 12, page: 1, sort: "sortOrder" })
    ).rejects.toMatchObject({
      code: "CATEGORY_NOT_FOUND",
      message: "Category not found.",
      statusCode: 404
    });
  });

  it("omits sites and pagination meta when category detail includeSites is false", async () => {
    const service = createPublicCatalogService({
      repository: createRepository({ getPublicCategoryBySlug: vi.fn().mockResolvedValue(categoryRecord) })
    });

    await expect(
      service.getCategoryBySlug("goods", { includeSites: false, limit: 12, page: 1, sort: "sortOrder" })
    ).resolves.toEqual({
      data: {
        description: null,
        siteCount: 1,
        slug: "goods",
        sortOrder: 20,
        title: "Товары"
      }
    });
  });

  it("includes public sites and pagination meta when category detail includeSites is true", async () => {
    const service = createPublicCatalogService({ repository: createRepository() });

    await expect(
      service.getCategoryBySlug("goods", { includeSites: true, limit: 12, page: 1, sort: "sortOrder" })
    ).resolves.toEqual({
      data: expect.objectContaining({
        sites: [expect.objectContaining({ slug: "published-site" })],
        slug: "goods"
      }),
      meta: { limit: 12, page: 1, total: 1, totalPages: 1 }
    });
  });

  it("preserves unexpected repository failures for the final safe error middleware", async () => {
    const service = createPublicCatalogService({
      repository: createRepository({ listSites: vi.fn().mockRejectedValue(new Error("raw DB failure")) })
    });

    await expect(service.listSites({ limit: 12, page: 1, sort: "sortOrder", tags: [] })).rejects.toThrow("raw DB failure");
  });

  it("uses AppError for public not found responses", async () => {
    const service = createPublicCatalogService({
      repository: createRepository({ getPublicSiteBySlug: vi.fn().mockResolvedValue(null) })
    });

    await expect(service.getSiteBySlug("missing")).rejects.toBeInstanceOf(AppError);
  });
});
