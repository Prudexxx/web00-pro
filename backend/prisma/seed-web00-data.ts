import type { Prisma, PrismaClient } from "../src/generated/prisma/client.js";

export interface CatalogSnapshotCategory {
  active: boolean;
  description: string | null;
  slug: string;
  sortOrder: number;
  title: string;
}

export interface CatalogSnapshotGalleryImage {
  alt: string;
  sortOrder: number;
  storagePath: string;
  url: string;
}

export interface CatalogSnapshotSite {
  active: boolean;
  categorySlug: string;
  deliveryLabel: string | null;
  demoLocalUrl: string | null;
  demoMode: string | null;
  demoUrl: string | null;
  developmentDays: number | null;
  externalDemoUrl: string | null;
  featured: boolean;
  features: string[];
  fullDescription: string | null;
  galleryImages: CatalogSnapshotGalleryImage[];
  legacyTitle: string | null;
  originalDemoUrl: string | null;
  previewImageUrl: string | null;
  previewType: string | null;
  priceAmountCents: number | null;
  priceLabel: string | null;
  publishedAt: string | null;
  shortDescription: string;
  siteUrl: string | null;
  slug: string;
  sortOrder: number;
  status: string;
  tags: string[];
  title: string;
  views: number;
}

export interface CatalogSnapshot {
  categories: CatalogSnapshotCategory[];
  generatedAt: string;
  sites: CatalogSnapshotSite[];
  sourceCommit: string;
  sourceFile: string;
  sourceRepository: string;
  sourceSha256: string;
}

export interface SeedEntitySummary {
  conflicts: number;
  created: number;
  unchanged: number;
}

export interface SeedSummary {
  categories: SeedEntitySummary;
  sites: SeedEntitySummary;
}

export interface SeedConflict {
  fields: string[];
  slug: string;
  type: "category" | "site";
}

export interface SeedWeb00CatalogResult {
  conflicts: SeedConflict[];
  summary: SeedSummary;
}

type SeedSiteRecord = NonNullable<
  Awaited<
    ReturnType<
      PrismaClient["site"]["findUnique"]
    >
  >
> & {
  category: { slug: string };
};

export async function seedWeb00Catalog(
  prisma: PrismaClient,
  snapshot: CatalogSnapshot
): Promise<SeedWeb00CatalogResult> {
  const result: SeedWeb00CatalogResult = {
    conflicts: [],
    summary: {
      categories: { conflicts: 0, created: 0, unchanged: 0 },
      sites: { conflicts: 0, created: 0, unchanged: 0 }
    }
  };
  const categoriesBySlug = new Map<string, { id: string; slug: string }>();

  for (const category of snapshot.categories) {
    const existing = await prisma.category.findUnique({
      where: { slug: category.slug }
    });

    if (existing === null) {
      const created = await prisma.category.create({
        data: {
          active: category.active,
          description: category.description,
          slug: category.slug,
          sortOrder: category.sortOrder,
          title: category.title
        }
      });
      categoriesBySlug.set(category.slug, created);
      result.summary.categories.created += 1;
      continue;
    }

    categoriesBySlug.set(category.slug, existing);
    recordCategoryOutcome(result, category, existing);
  }

  for (const site of snapshot.sites) {
    const category = categoriesBySlug.get(site.categorySlug);

    if (category === undefined) {
      throw new Error(`Snapshot site ${site.slug} references missing category ${site.categorySlug}.`);
    }

    const existing = await prisma.site.findUnique({
      include: { category: { select: { slug: true } } },
      where: { slug: site.slug }
    });

    if (existing === null) {
      await prisma.site.create({
        data: {
          active: site.active,
          categoryId: category.id,
          deliveryLabel: site.deliveryLabel,
          demoLocalUrl: site.demoLocalUrl,
          demoMode: site.demoMode,
          demoUrl: site.demoUrl,
          developmentDays: site.developmentDays,
          externalDemoUrl: site.externalDemoUrl,
          featured: site.featured,
          features: site.features,
          fullDescription: site.fullDescription,
          galleryImages: site.galleryImages as unknown as Prisma.InputJsonValue,
          legacyTitle: site.legacyTitle,
          originalDemoUrl: site.originalDemoUrl,
          previewImageUrl: site.previewImageUrl,
          previewType: site.previewType,
          priceAmountCents: site.priceAmountCents,
          priceLabel: site.priceLabel,
          publishedAt: parseOptionalDate(site.publishedAt),
          shortDescription: site.shortDescription,
          siteUrl: site.siteUrl,
          slug: site.slug,
          sortOrder: site.sortOrder,
          status: site.status,
          tags: site.tags,
          title: site.title,
          views: site.views
        }
      });
      result.summary.sites.created += 1;
      continue;
    }

    recordSiteOutcome(result, site, existing as SeedSiteRecord);
  }

  return result;
}

function recordCategoryOutcome(
  result: SeedWeb00CatalogResult,
  expected: CatalogSnapshotCategory,
  actual: {
    active: boolean;
    description: string | null;
    sortOrder: number;
    slug: string;
    title: string;
  }
): void {
  const fields = collectChangedFields([
    ["active", expected.active, actual.active],
    ["description", expected.description, actual.description],
    ["sortOrder", expected.sortOrder, actual.sortOrder],
    ["title", expected.title, actual.title]
  ]);

  if (fields.length === 0) {
    result.summary.categories.unchanged += 1;
    return;
  }

  result.summary.categories.conflicts += 1;
  result.conflicts.push({ fields, slug: expected.slug, type: "category" });
}

function recordSiteOutcome(
  result: SeedWeb00CatalogResult,
  expected: CatalogSnapshotSite,
  actual: SeedSiteRecord
): void {
  const fields = collectChangedFields([
    ["title", expected.title, actual.title],
    ["categorySlug", expected.categorySlug, actual.category.slug],
    ["legacyTitle", expected.legacyTitle, actual.legacyTitle],
    ["shortDescription", expected.shortDescription, actual.shortDescription],
    ["fullDescription", expected.fullDescription, actual.fullDescription],
    ["features", expected.features, actual.features],
    ["tags", expected.tags, actual.tags],
    ["demoUrl", expected.demoUrl, actual.demoUrl],
    ["siteUrl", expected.siteUrl, actual.siteUrl],
    ["previewImageUrl", expected.previewImageUrl, actual.previewImageUrl],
    ["galleryImages", expected.galleryImages, actual.galleryImages],
    ["previewType", expected.previewType, actual.previewType],
    ["demoMode", expected.demoMode, actual.demoMode],
    ["demoLocalUrl", expected.demoLocalUrl, actual.demoLocalUrl],
    ["externalDemoUrl", expected.externalDemoUrl, actual.externalDemoUrl],
    ["originalDemoUrl", expected.originalDemoUrl, actual.originalDemoUrl],
    ["priceAmountCents", expected.priceAmountCents, actual.priceAmountCents],
    ["priceLabel", expected.priceLabel, actual.priceLabel],
    ["developmentDays", expected.developmentDays, actual.developmentDays],
    ["deliveryLabel", expected.deliveryLabel, actual.deliveryLabel],
    ["status", expected.status, actual.status],
    ["active", expected.active, actual.active],
    ["featured", expected.featured, actual.featured],
    ["views", expected.views, actual.views],
    ["sortOrder", expected.sortOrder, actual.sortOrder],
    ["publishedAt", expected.publishedAt, formatOptionalDate(actual.publishedAt)]
  ]);

  if (fields.length === 0) {
    result.summary.sites.unchanged += 1;
    return;
  }

  result.summary.sites.conflicts += 1;
  result.conflicts.push({ fields, slug: expected.slug, type: "site" });
}

function collectChangedFields(
  checks: Array<[field: string, expected: unknown, actual: unknown]>
): string[] {
  return checks
    .filter(([, expected, actual]) => !sameValue(expected, actual))
    .map(([field]) => field);
}

function sameValue(expected: unknown, actual: unknown): boolean {
  return JSON.stringify(toComparableValue(expected)) === JSON.stringify(toComparableValue(actual));
}

function toComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toComparableValue(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, toComparableValue(nestedValue)])
    );
  }

  return value;
}

function parseOptionalDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function formatOptionalDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}
