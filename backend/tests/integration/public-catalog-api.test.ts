import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { assertTestDatabaseUrl, parseTestDatabaseEnv } from "../../src/config/database-env.js";
import type { AppEnv } from "../../src/config/env.js";
import type { PublicCorsConfig } from "../../src/config/public-cors-env.js";
import { createPrismaClient } from "../../src/db/prisma.js";
import type { Prisma } from "../../src/generated/prisma/client.js";
import { createPrismaPublicCatalogRepository } from "../../src/modules/public-catalog/public-catalog.repository.js";
import { createPublicCatalogService } from "../../src/modules/public-catalog/public-catalog.service.js";
import type { PublicCatalogService } from "../../src/modules/public-catalog/public-catalog.service.js";

const fixturePrefix = "b3-";
const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};
const databaseEnv = parseTestDatabaseEnv(process.env);
assertTestDatabaseUrl(databaseEnv);
const prisma = createPrismaClient({
  databaseUrl: databaseEnv.TEST_DATABASE_URL,
  poolMax: 1
});
const allowedOrigin = "https://web00.example.com";
const publicCorsConfig: PublicCorsConfig = {
  allowedMethods: ["GET", "HEAD", "OPTIONS"],
  allowedOrigins: new Set([allowedOrigin]),
  maxOrigins: 10
};
const repository = createPrismaPublicCatalogRepository({ prisma });
const service = createPublicCatalogService({ repository });
const app = createApp({ env: testEnv, publicCatalogService: service, publicCorsConfig });

interface FixtureCategory {
  active?: boolean;
  description?: string | null;
  slug: string;
  sortOrder: number;
  title: string;
}

interface FixtureSite {
  active?: boolean;
  categorySlug: string;
  createdAt: Date;
  deletedAt?: Date | null;
  featured?: boolean;
  galleryImages?: Prisma.InputJsonValue;
  shortDescription: string;
  slug: string;
  sortOrder: number;
  status: "archived" | "draft" | "published";
  tags?: string[];
  title: string;
  views?: number;
}

async function cleanPublicCatalogFixtures(): Promise<void> {
  await prisma.site.deleteMany({
    where: { slug: { startsWith: fixturePrefix } }
  });
  await prisma.category.deleteMany({
    where: { slug: { startsWith: fixturePrefix } }
  });
}

async function createCategory(input: FixtureCategory): Promise<void> {
  await prisma.category.create({
    data: {
      active: input.active ?? true,
      description: input.description ?? null,
      slug: input.slug,
      sortOrder: input.sortOrder,
      title: input.title
    }
  });
}

async function createSite(input: FixtureSite): Promise<void> {
  await prisma.site.create({
    data: {
      active: input.active ?? true,
      category: { connect: { slug: input.categorySlug } },
      createdAt: input.createdAt,
      deletedAt: input.deletedAt ?? null,
      deliveryLabel: "от 3 дней",
      demoMode: "external-iframe",
      demoUrl: `https://demo.example.test/${input.slug}`,
      developmentDays: 3,
      featured: input.featured ?? false,
      features: ["Responsive", "SEO"],
      fullDescription: `Full description for ${input.slug}`,
      galleryImages: input.galleryImages ?? [
        {
          alt: input.title,
          sortOrder: 0,
          storagePath: `catalog/sites/${input.slug}/gallery/${input.slug}-01.png`,
          url: `assets/img/solution-gallery/${input.slug}-01.png`
        }
      ],
      previewImageUrl: `assets/img/previews/${input.slug}.png`,
      previewType: "iframe",
      priceAmountCents: 500000,
      priceLabel: "от 5 000 ₽",
      publishedAt: input.status === "published" ? input.createdAt : null,
      shortDescription: input.shortDescription,
      siteUrl: `https://site.example.test/${input.slug}`,
      slug: input.slug,
      sortOrder: input.sortOrder,
      status: input.status,
      tags: input.tags ?? [],
      title: input.title,
      views: input.views ?? 0
    }
  });
}

async function createPublicCatalogFixtures(): Promise<void> {
  await createCategory({ slug: "b3-goods", sortOrder: 20, title: "Товары" });
  await createCategory({ slug: "b3-services", sortOrder: 10, title: "Услуги" });
  await createCategory({ active: false, slug: "b3-hidden-category", sortOrder: 30, title: "Hidden" });

  await createSite({
    categorySlug: "b3-goods",
    createdAt: new Date("2026-07-03T00:00:00.000Z"),
    shortDescription: "Fast shop landing",
    slug: "b3-alpha",
    sortOrder: 20,
    status: "published",
    tags: ["design", "seo"],
    title: "Alpha Landing",
    views: 5
  });
  await createSite({
    categorySlug: "b3-goods",
    createdAt: new Date("2026-07-02T00:00:00.000Z"),
    featured: true,
    shortDescription: "Medical services landing",
    slug: "b3-beta",
    sortOrder: 10,
    status: "published",
    tags: ["design", "fast"],
    title: "Beta Site",
    views: 50
  });
  await createSite({
    categorySlug: "b3-services",
    createdAt: new Date("2026-07-04T00:00:00.000Z"),
    featured: true,
    shortDescription: "Delivery and SEO platform",
    slug: "b3-gamma",
    sortOrder: 10,
    status: "published",
    tags: ["seo", "fast"],
    title: "Gamma Portal",
    views: 50
  });
  await createSite({
    categorySlug: "b3-goods",
    createdAt: new Date("2026-07-05T00:00:00.000Z"),
    shortDescription: "Hidden draft",
    slug: "b3-draft",
    sortOrder: 1,
    status: "draft",
    title: "Draft"
  });
  await createSite({
    categorySlug: "b3-goods",
    createdAt: new Date("2026-07-06T00:00:00.000Z"),
    shortDescription: "Hidden archived",
    slug: "b3-archived",
    sortOrder: 1,
    status: "archived",
    title: "Archived"
  });
  await createSite({
    active: false,
    categorySlug: "b3-goods",
    createdAt: new Date("2026-07-07T00:00:00.000Z"),
    shortDescription: "Hidden inactive",
    slug: "b3-inactive",
    sortOrder: 1,
    status: "published",
    title: "Inactive"
  });
  await createSite({
    categorySlug: "b3-goods",
    createdAt: new Date("2026-07-08T00:00:00.000Z"),
    deletedAt: new Date("2026-07-09T00:00:00.000Z"),
    shortDescription: "Hidden deleted",
    slug: "b3-deleted",
    sortOrder: 1,
    status: "published",
    title: "Deleted"
  });
  await createSite({
    categorySlug: "b3-hidden-category",
    createdAt: new Date("2026-07-10T00:00:00.000Z"),
    shortDescription: "Hidden category site",
    slug: "b3-hidden-category-site",
    sortOrder: 1,
    status: "published",
    title: "Hidden category site"
  });
}

function dataSlugs(data: Array<{ slug: string }>): string[] {
  return data.map((site) => site.slug);
}

describe("public catalog API integration", () => {
  beforeEach(async () => {
    await cleanPublicCatalogFixtures();
    await createPublicCatalogFixtures();
  });

  afterAll(async () => {
    await cleanPublicCatalogFixtures();
    await prisma.$disconnect();
  });

  it("GET /api/sites returns 200 with pagination meta and hides non-public records", async () => {
    const response = await request(app)
      .get("/api/sites")
      .expect(200)
      .expect("Content-Type", /application\/json/);

    expect(response.body.meta).toEqual({ limit: 12, page: 1, total: 3, totalPages: 1 });
    expect(dataSlugs(response.body.data)).toEqual(["b3-gamma", "b3-beta", "b3-alpha"]);
    expect(JSON.stringify(response.body)).not.toContain("b3-draft");
    expect(JSON.stringify(response.body)).not.toContain("b3-archived");
    expect(JSON.stringify(response.body)).not.toContain("b3-inactive");
    expect(JSON.stringify(response.body)).not.toContain("b3-deleted");
    expect(JSON.stringify(response.body)).not.toContain("b3-hidden-category-site");
  });

  it("adds exact public CORS headers for allowed catalog GET and HEAD requests", async () => {
    const getResponse = await request(app)
      .get("/api/sites")
      .set("Origin", allowedOrigin)
      .expect(200);
    const headResponse = await request(app)
      .head("/api/sites")
      .set("Origin", allowedOrigin)
      .expect(200);

    expect(getResponse.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(getResponse.headers.vary).toContain("Origin");
    expect(getResponse.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(headResponse.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(headResponse.text).toBeUndefined();
  });

  it("handles public catalog preflight without exposing arbitrary origins", async () => {
    const allowed = await request(app)
      .options("/api/sites")
      .set("Origin", allowedOrigin)
      .expect(204);
    const forbidden = await request(app)
      .options("/api/sites")
      .set("Origin", "https://evil.example.com")
      .expect(403);
    const untrustedGet = await request(app)
      .get("/api/sites")
      .set("Origin", "https://evil.example.com")
      .expect(200);

    expect(allowed.text).toBe("");
    expect(allowed.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(forbidden.body.error.code).toBe("CORS_ORIGIN_FORBIDDEN");
    expect(JSON.stringify(forbidden.body)).not.toContain("evil.example.com");
    expect(untrustedGet.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("paginates public sites with stable metadata", async () => {
    const response = await request(app).get("/api/sites?limit=2&page=2").expect(200);

    expect(response.body.meta).toEqual({ limit: 2, page: 2, total: 3, totalPages: 2 });
    expect(dataSlugs(response.body.data)).toEqual(["b3-alpha"]);
  });

  it("filters by case-insensitive search, category, and tags hasEvery", async () => {
    await expect(request(app).get("/api/sites?search=MEDICAL").expect(200)).resolves.toMatchObject({
      body: { data: [expect.objectContaining({ slug: "b3-beta" })] }
    });
    await expect(request(app).get("/api/sites?category=b3-goods").expect(200)).resolves.toMatchObject({
      body: { meta: expect.objectContaining({ total: 2 }) }
    });
    await expect(request(app).get("/api/sites?tags=design,fast").expect(200)).resolves.toMatchObject({
      body: { data: [expect.objectContaining({ slug: "b3-beta" })] }
    });
  });

  it("supports all approved sort modes", async () => {
    await expect(request(app).get("/api/sites?sort=sortOrder").expect(200)).resolves.toMatchObject({
      body: { data: [{ slug: "b3-gamma" }, { slug: "b3-beta" }, { slug: "b3-alpha" }] }
    });
    await expect(request(app).get("/api/sites?sort=newest").expect(200)).resolves.toMatchObject({
      body: { data: [{ slug: "b3-gamma" }, { slug: "b3-alpha" }, { slug: "b3-beta" }] }
    });
    await expect(request(app).get("/api/sites?sort=popular").expect(200)).resolves.toMatchObject({
      body: { data: [{ slug: "b3-gamma" }, { slug: "b3-beta" }, { slug: "b3-alpha" }] }
    });
    await expect(request(app).get("/api/sites?sort=title").expect(200)).resolves.toMatchObject({
      body: { data: [{ slug: "b3-alpha" }, { slug: "b3-beta" }, { slug: "b3-gamma" }] }
    });
  });

  it("returns VALIDATION_ERROR with requestId for invalid limit or unknown query", async () => {
    const invalidLimit = await request(app)
      .get("/api/sites?limit=21")
      .set("X-Request-Id", "req_limit")
      .expect(400);
    const unknownQuery = await request(app)
      .get("/api/sites?preview=true")
      .set("X-Request-Id", "req_unknown")
      .expect(400);

    expect(invalidLimit.body.error).toMatchObject({ code: "VALIDATION_ERROR", requestId: "req_limit" });
    expect(unknownQuery.body.error).toMatchObject({ code: "VALIDATION_ERROR", requestId: "req_unknown" });
  });

  it("routes /api/sites/popular before slug and uses popular ordering without changing views", async () => {
    const before = await prisma.site.findUniqueOrThrow({ where: { slug: "b3-beta" } });
    const response = await request(app).get("/api/sites/popular?limit=2").expect(200);
    const after = await prisma.site.findUniqueOrThrow({ where: { slug: "b3-beta" } });

    expect(dataSlugs(response.body.data)).toEqual(["b3-gamma", "b3-beta"]);
    expect(after.views).toBe(before.views);
  });

  it("returns site detail and never leaks internal fields", async () => {
    const response = await request(app)
      .get("/api/sites/b3-alpha")
      .expect(200)
      .expect("Content-Type", /application\/json/);
    const serialized = JSON.stringify(response.body);

    expect(response.body.data).toMatchObject({
      fullDescription: "Full description for b3-alpha",
      publishedAt: "2026-07-03T00:00:00.000Z",
      slug: "b3-alpha"
    });
    for (const field of ["id", "categoryId", "legacyTitle", "views", "active", "status", "deletedAt", "createdAt", "updatedAt"]) {
      expect(response.body.data).not.toHaveProperty(field);
    }
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("returns SITE_NOT_FOUND for missing and hidden sites", async () => {
    for (const slug of ["missing", "b3-draft", "b3-archived", "b3-inactive", "b3-deleted", "b3-hidden-category-site"]) {
      const response = await request(app).get(`/api/sites/${slug}`).expect(404);

      expect(response.body.error.code).toBe("SITE_NOT_FOUND");
      expect(response.body.error.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    }
  });

  it("returns active categories only and counts public sites only", async () => {
    const response = await request(app).get("/api/categories?includeCounts=true").expect(200);

    expect(response.body.data).toEqual([
      { description: null, siteCount: 1, slug: "b3-services", sortOrder: 10, title: "Услуги" },
      { description: null, siteCount: 2, slug: "b3-goods", sortOrder: 20, title: "Товары" }
    ]);
    expect(JSON.stringify(response.body)).not.toContain("b3-hidden-category");
  });

  it("returns category detail without sites when includeSites is false", async () => {
    const response = await request(app).get("/api/categories/b3-goods").expect(200);

    expect(response.body).toEqual({
      data: { description: null, slug: "b3-goods", sortOrder: 20, title: "Товары" }
    });
    expect(response.body.data).not.toHaveProperty("sites");
    expect(response.body).not.toHaveProperty("meta");
  });

  it("returns category detail with public sites and meta when includeSites is true", async () => {
    const response = await request(app)
      .get("/api/categories/b3-goods?includeSites=true&limit=1&page=2&sort=title")
      .expect(200);

    expect(response.body.meta).toEqual({ limit: 1, page: 2, total: 2, totalPages: 2 });
    expect(response.body.data).toMatchObject({ siteCount: 2, slug: "b3-goods" });
    expect(dataSlugs(response.body.data.sites)).toEqual(["b3-beta"]);
  });

  it("returns CATEGORY_NOT_FOUND for inactive or missing categories", async () => {
    for (const slug of ["b3-hidden-category", "missing-category"]) {
      const response = await request(app).get(`/api/categories/${slug}`).expect(404);

      expect(response.body.error.code).toBe("CATEGORY_NOT_FOUND");
      expect(response.body.error.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    }
  });

  it("returns safe INTERNAL_ERROR when a public API dependency fails", async () => {
    const failingService = {
      listSites: vi.fn().mockRejectedValue(new Error("raw database secret"))
    } as unknown as PublicCatalogService;
    const failingApp = createApp({ env: testEnv, publicCatalogService: failingService });
    const response = await request(failingApp)
      .get("/api/sites")
      .set("X-Request-Id", "req_db_failure")
      .expect(500);

    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
        requestId: "req_db_failure"
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("raw database secret");
  });
});
