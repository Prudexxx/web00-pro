import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import type {
  PublicCategoryDetail,
  PublicCategoryRecord,
  PublicCategorySummary,
  PublicGalleryImage,
  PublicSiteDetail,
  PublicSiteRecord,
  PublicSiteSummary
} from "./public-catalog.types.js";

export const publicGalleryImageSchema = z.object({
  alt: z.string().min(1),
  sortOrder: z.number().int().min(0),
  storagePath: z.string().min(1),
  url: z.string().min(1)
});

export const publicGalleryImagesSchema = z.array(publicGalleryImageSchema);

export function parsePublicGalleryImages(value: unknown): PublicGalleryImage[] {
  const parsed = publicGalleryImagesSchema.safeParse(value);

  if (!parsed.success) {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "Internal server error.",
      statusCode: 500
    });
  }

  return parsed.data;
}

export function mapSiteSummary(record: PublicSiteRecord): PublicSiteSummary {
  return {
    category: {
      slug: record.category.slug,
      title: record.category.title
    },
    deliveryLabel: record.deliveryLabel,
    demoMode: record.demoMode,
    demoUrl: record.demoUrl,
    developmentDays: record.developmentDays,
    featured: record.featured,
    features: record.features,
    galleryImages: parsePublicGalleryImages(record.galleryImages),
    previewImageUrl: record.previewImageUrl,
    previewType: record.previewType,
    priceAmountCents: record.priceAmountCents,
    priceLabel: record.priceLabel,
    shortDescription: record.shortDescription,
    siteUrl: record.siteUrl,
    slug: record.slug,
    tags: record.tags,
    title: record.title
  };
}

export function mapSiteDetail(record: PublicSiteRecord): PublicSiteDetail {
  return {
    ...mapSiteSummary(record),
    fullDescription: record.fullDescription,
    publishedAt: record.publishedAt === null ? null : record.publishedAt.toISOString()
  };
}

export function mapCategory(record: PublicCategoryRecord): PublicCategorySummary {
  const mapped: PublicCategorySummary = {
    description: record.description,
    slug: record.slug,
    sortOrder: record.sortOrder,
    title: record.title
  };

  if (record.siteCount !== undefined) {
    mapped.siteCount = record.siteCount;
  }

  return mapped;
}

export function mapCategoryDetail(
  record: PublicCategoryRecord,
  sites?: PublicSiteSummary[]
): PublicCategoryDetail {
  const mapped: PublicCategoryDetail = mapCategory(record);

  if (sites !== undefined) {
    mapped.sites = sites;
  }

  return mapped;
}
