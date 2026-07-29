import { describe, expect, it } from "vitest";
import { mapAdminSiteDetail } from "../src/modules/admin/sites/site.mapper.js";
import type { AdminSiteRecord } from "../src/modules/admin/sites/site.types.js";

describe("admin site mapper", () => {
  it("includes editor identifiers but omits privileged fields", () => {
    const mapped = mapAdminSiteDetail(createSiteRecord(), "editor");

    expect(mapped).toMatchObject({
      category: {
        id: "00000000-0000-4000-8000-000000000002",
        slug: "category",
        title: "Category"
      },
      categoryId: "00000000-0000-4000-8000-000000000002",
      id: "00000000-0000-4000-8000-000000000001",
      slug: "site"
    });
    expect(mapped).not.toHaveProperty("active");
    expect(mapped).not.toHaveProperty("deletedAt");
    expect(mapped).not.toHaveProperty("views");
  });

  it("includes privileged state fields for admin", () => {
    const mapped = mapAdminSiteDetail(createSiteRecord(), "admin");

    expect(mapped).toMatchObject({
      active: true,
      deletedAt: null,
      views: 42
    });
  });
});

function createSiteRecord(): AdminSiteRecord {
  return {
    active: true,
    category: {
      id: "00000000-0000-4000-8000-000000000002",
      slug: "category",
      title: "Category"
    },
    categoryId: "00000000-0000-4000-8000-000000000002",
    createdAt: new Date("2026-07-25T00:00:00.000Z"),
    deletedAt: null,
    deliveryLabel: null,
    demoLocalUrl: null,
    demoMode: null,
    demoUrl: null,
    developmentDays: null,
    externalDemoUrl: null,
    featured: false,
    features: [],
    fullDescription: null,
    galleryImages: [],
    id: "00000000-0000-4000-8000-000000000001",
    legacyTitle: null,
    originalDemoUrl: null,
    previewImageUrl: null,
    previewType: null,
    priceAmountCents: null,
    priceLabel: null,
    publishedAt: null,
    shortDescription: "Short",
    siteUrl: null,
    slug: "site",
    sortOrder: 0,
    status: "draft",
    tags: [],
    title: "Site",
    updatedAt: new Date("2026-07-25T00:00:00.000Z"),
    views: 42
  };
}
