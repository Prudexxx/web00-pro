import { z } from "zod";
import {
  resolveCatalogAssetUrl,
  toCatalogAssetUrl
} from "../../lib/catalog-asset-url.js";
import { AppError } from "../../lib/errors.js";
import type { ManagedImageUrlPolicy } from "../images/image.types.js";
import type {
  PublicCategoryDetail,
  PublicCategoryRecord,
  PublicCategorySummary,
  PublicGalleryImage,
  PublicPreviewImage,
  PublicSiteDetail,
  PublicSiteRecord,
  PublicSiteSummary
} from "./public-catalog.types.js";

export const publicGalleryImageSchema = z.object({
  alt: z.string(),
  assetId: z.string().uuid().optional(),
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

  return parsed.data.map((image) =>
    image.assetId === undefined
      ? {
          alt: image.alt,
          sortOrder: image.sortOrder,
          storagePath: image.storagePath,
          url: image.url
        }
      : {
          alt: image.alt,
          assetId: image.assetId,
          sortOrder: image.sortOrder,
          storagePath: image.storagePath,
          url: image.url
        }
  );
}

export function mapSiteSummary(
  record: PublicSiteRecord,
  imageUrlPolicy?: ManagedImageUrlPolicy
): PublicSiteSummary {
  const siteId = typeof record.id === "string" ? record.id : "";
  const previewImageUrl = toCatalogAssetUrl(record.previewImageUrl);

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
    galleryImages: mapGalleryImages(
      parsePublicGalleryImages(record.galleryImages),
      record.title,
      siteId,
      imageUrlPolicy
    ),
    previewImage:
      imageUrlPolicy === undefined || record.previewImageUrl === null || siteId === ""
        ? null
        : toPublicPreviewImage(
            imageUrlPolicy.parseManagedPreview(siteId, record.previewImageUrl),
            imageUrlPolicy
          ),
    previewImageUrl,
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

export function mapSiteDetail(
  record: PublicSiteRecord,
  imageUrlPolicy?: ManagedImageUrlPolicy
): PublicSiteDetail {
  return {
    ...mapSiteSummary(record, imageUrlPolicy),
    fullDescription: record.fullDescription,
    publishedAt: record.publishedAt === null ? null : record.publishedAt.toISOString()
  };
}

export function mapSiteToPublicCatalogItem(
  record: PublicSiteRecord,
  imageUrlPolicy?: ManagedImageUrlPolicy
): PublicSiteDetail {
  return mapSiteDetail(record, imageUrlPolicy);
}

function mapGalleryImages(
  images: PublicGalleryImage[],
  siteTitle: string,
  siteId: string,
  imageUrlPolicy?: ManagedImageUrlPolicy
): PublicGalleryImage[] {
  return images.flatMap((image) => {
    const resolved = resolveCatalogAssetUrl(image.url);
    if (resolved === null) {
      return [];
    }

    const normalizedImage: PublicGalleryImage =
      resolved.url === image.url
        ? image
        : {
            ...image,
            url: resolved.url
          };

    if (image.assetId === undefined || imageUrlPolicy === undefined || siteId === "") {
      return [normalizedImage];
    }

    const managed = toManagedGalleryDescriptor(normalizedImage, siteId, imageUrlPolicy);

    if (managed === null) {
      return [normalizedImage];
    }

    return [
      {
        ...normalizedImage,
        alt: normalizedImage.alt.trim() === "" ? siteTitle : normalizedImage.alt,
        variants: imageUrlPolicy.buildVariants(managed)
      }
    ];
  });
}

function toPublicPreviewImage(
  preview: ReturnType<ManagedImageUrlPolicy["parseManagedPreview"]>,
  imageUrlPolicy: ManagedImageUrlPolicy
): PublicPreviewImage | null {
  if (preview === null) {
    return null;
  }

  return {
    assetId: preview.assetId,
    url: preview.url,
    variants: imageUrlPolicy.buildVariants(preview)
  };
}

function toManagedGalleryDescriptor(
  image: PublicGalleryImage,
  siteId: string,
  imageUrlPolicy: ManagedImageUrlPolicy
): ReturnType<ManagedImageUrlPolicy["parseManagedGallery"]> {
  if (
    image.assetId === undefined
  ) {
    return null;
  }

  const managed = imageUrlPolicy.parseManagedGallery(siteId, image.url);

  if (
    managed === null ||
    managed.assetId !== image.assetId ||
    managed.storagePath !== image.storagePath
  ) {
    return null;
  }

  return managed;
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
