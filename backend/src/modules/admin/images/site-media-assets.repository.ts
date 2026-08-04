import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../../lib/errors.js";
import type { ImageSlot, OutputFormat } from "../../images/image.types.js";

export interface PersistedSiteImageAssetVariant {
  contentType: "image/avif" | "image/webp";
  format: OutputFormat;
  height: number;
  path: string;
  width: number;
}

export interface PersistedSiteImageAssetInput {
  assetId: string;
  decodedFormat: string;
  height: number;
  siteId: string;
  slot: ImageSlot;
  sourceMime: string;
  sourceSha256: string;
  storagePath: string;
  variants: PersistedSiteImageAssetVariant[];
  width: number;
}

export interface SiteMediaAssetsRepository {
  readSitePublicationMediaParity(
    siteId: string,
    tx: Prisma.TransactionClient
  ): Promise<SitePublicationMediaParity>;
  upsertAsset(
    input: PersistedSiteImageAssetInput,
    tx: Prisma.TransactionClient
  ): Promise<void>;
}

export interface SitePublicationMediaAsset extends PersistedSiteImageAssetInput {
  sortOrder: number | null;
}

export interface SitePublicationMediaParity {
  galleryImages: SitePublicationMediaAsset[];
  previewImage: SitePublicationMediaAsset | null;
  siteId: string;
}

export type SitePublicationMediaParityMismatchCode =
  | "GALLERY_ASSET_MISMATCH"
  | "GALLERY_COUNT_MISMATCH"
  | "GALLERY_HASH_MISMATCH"
  | "GALLERY_ORDER_MISMATCH"
  | "GALLERY_VARIANTS_MISMATCH"
  | "MATCH"
  | "PREVIEW_ASSET_MISMATCH"
  | "PREVIEW_HASH_MISMATCH"
  | "PREVIEW_MISSING"
  | "PREVIEW_UNEXPECTED"
  | "PREVIEW_VARIANTS_MISMATCH";

export type SitePublicationMediaParityResult =
  | {
      code: "MATCH";
      matched: true;
    }
  | {
      code: Exclude<SitePublicationMediaParityMismatchCode, "MATCH">;
      fieldPath: string;
      matched: false;
    };

export function createPrismaSiteMediaAssetsRepository(): SiteMediaAssetsRepository {
  return {
    async readSitePublicationMediaParity(siteId, tx) {
      const site = await tx.site.findUnique({
        select: {
          galleryImageAssets: {
            orderBy: [
              { sortOrder: "asc" },
              { assetId: "asc" }
            ],
            select: {
              asset: true,
              assetId: true,
              sortOrder: true
            }
          },
          id: true,
          previewImage: {
            select: {
              asset: true,
              assetId: true
            }
          }
        },
        where: { id: siteId }
      });

      if (site === null) {
        throw new AppError({
          code: "SITE_NOT_FOUND",
          message: "Site not found.",
          statusCode: 404
        });
      }

      return {
        galleryImages: site.galleryImageAssets.map((image) =>
          toPublicationMediaAsset(image.asset, image.sortOrder)
        ),
        previewImage:
          site.previewImage === null
            ? null
            : toPublicationMediaAsset(site.previewImage.asset, null),
        siteId: site.id
      };
    },
    async upsertAsset(input, tx) {
      assertPersistedAssetInput(input);

      const existing = await tx.siteImageAsset.findUnique({
        where: { assetId: input.assetId }
      });

      if (existing !== null) {
        if (!persistedAssetMatchesInput(existing, input)) {
          throw uploadIdConflict();
        }

        return;
      }

      try {
        await tx.siteImageAsset.create({
          data: {
            assetId: input.assetId,
            decodedFormat: input.decodedFormat,
            height: input.height,
            siteId: input.siteId,
            slot: input.slot,
            sourceMime: input.sourceMime,
            sourceSha256: input.sourceSha256,
            storagePath: input.storagePath,
            variants: input.variants as unknown as Prisma.InputJsonValue,
            width: input.width
          }
        });
      } catch (error) {
        if (!isUniqueConflict(error)) {
          throw error;
        }

        const raced = await tx.siteImageAsset.findUnique({
          where: { assetId: input.assetId }
        });
        if (raced !== null && persistedAssetMatchesInput(raced, input)) {
          return;
        }

        throw uploadIdConflict();
      }
    }
  };
}

export function verifySitePublicationMediaParity(
  expected: SitePublicationMediaParity,
  actual: SitePublicationMediaParity
): SitePublicationMediaParityResult {
  if (expected.siteId !== actual.siteId) {
    return mismatch("GALLERY_ASSET_MISMATCH", "siteId");
  }
  if (expected.previewImage === null && actual.previewImage !== null) {
    return mismatch("PREVIEW_UNEXPECTED", "previewImage");
  }
  if (expected.previewImage !== null && actual.previewImage === null) {
    return mismatch("PREVIEW_MISSING", "previewImage");
  }
  if (expected.previewImage !== null && actual.previewImage !== null) {
    const previewResult = compareMediaAsset(
      expected.previewImage,
      actual.previewImage,
      "previewImage",
      "PREVIEW"
    );
    if (!previewResult.matched) {
      return previewResult;
    }
  }

  if (expected.galleryImages.length !== actual.galleryImages.length) {
    return mismatch("GALLERY_COUNT_MISMATCH", "galleryImages");
  }

  for (let index = 0; index < expected.galleryImages.length; index += 1) {
    const expectedImage = expected.galleryImages[index]!;
    const actualImage = actual.galleryImages[index]!;
    if (
      expectedImage.assetId !== actualImage.assetId ||
      expectedImage.sortOrder !== actualImage.sortOrder
    ) {
      return mismatch("GALLERY_ORDER_MISMATCH", `galleryImages.${index}`);
    }

    const galleryResult = compareMediaAsset(
      expectedImage,
      actualImage,
      `galleryImages.${index}`,
      "GALLERY"
    );
    if (!galleryResult.matched) {
      return galleryResult;
    }
  }

  return { code: "MATCH", matched: true };
}

function compareMediaAsset(
  expected: SitePublicationMediaAsset,
  actual: SitePublicationMediaAsset,
  fieldPath: string,
  scope: "GALLERY" | "PREVIEW"
): SitePublicationMediaParityResult {
  if (
    expected.assetId !== actual.assetId ||
    expected.decodedFormat !== actual.decodedFormat ||
    expected.siteId !== actual.siteId ||
    expected.slot !== actual.slot ||
    expected.sourceMime !== actual.sourceMime ||
    expected.storagePath !== actual.storagePath
  ) {
    return mismatch(`${scope}_ASSET_MISMATCH`, fieldPath);
  }
  if (expected.sourceSha256 !== actual.sourceSha256) {
    return mismatch(`${scope}_HASH_MISMATCH`, `${fieldPath}.sourceSha256`);
  }
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return mismatch(`${scope}_ASSET_MISMATCH`, fieldPath);
  }
  if (!variantsEqual(expected.variants, actual.variants)) {
    return mismatch(`${scope}_VARIANTS_MISMATCH`, `${fieldPath}.variants`);
  }

  return { code: "MATCH", matched: true };
}

function mismatch(
  code: Exclude<SitePublicationMediaParityMismatchCode, "MATCH">,
  fieldPath: string
): SitePublicationMediaParityResult {
  return { code, fieldPath, matched: false };
}

function variantsEqual(
  expected: readonly PersistedSiteImageAssetVariant[],
  actual: readonly PersistedSiteImageAssetVariant[]
): boolean {
  if (expected.length !== actual.length) {
    return false;
  }

  return expected.every((expectedVariant, index) => {
    const actualVariant = actual[index];

    return (
      actualVariant !== undefined &&
      expectedVariant.contentType === actualVariant.contentType &&
      expectedVariant.format === actualVariant.format &&
      expectedVariant.height === actualVariant.height &&
      expectedVariant.path === actualVariant.path &&
      expectedVariant.width === actualVariant.width
    );
  });
}

function toPublicationMediaAsset(
  asset: {
    assetId: string;
    decodedFormat: string;
    height: number;
    siteId: string;
    slot: string;
    sourceMime: string;
    sourceSha256: string;
    storagePath: string;
    variants: unknown;
    width: number;
  },
  sortOrder: number | null
): SitePublicationMediaAsset {
  const variants = readPersistedVariants(asset.variants);
  const slot = readImageSlot(asset.slot);
  const mediaAsset = {
    assetId: asset.assetId,
    decodedFormat: asset.decodedFormat,
    height: asset.height,
    siteId: asset.siteId,
    slot,
    sortOrder,
    sourceMime: asset.sourceMime,
    sourceSha256: asset.sourceSha256,
    storagePath: asset.storagePath,
    variants,
    width: asset.width
  };

  assertPersistedAssetInput(mediaAsset);

  return mediaAsset;
}

function readPersistedVariants(value: unknown): PersistedSiteImageAssetVariant[] {
  if (!Array.isArray(value)) {
    throw mediaAssetInvalid();
  }

  return value.map((variant) => {
    if (typeof variant !== "object" || variant === null) {
      throw mediaAssetInvalid();
    }
    const record = variant as Record<string, unknown>;
    if (
      (record.contentType !== "image/avif" && record.contentType !== "image/webp") ||
      (record.format !== "avif" && record.format !== "webp") ||
      typeof record.height !== "number" ||
      typeof record.path !== "string" ||
      typeof record.width !== "number"
    ) {
      throw mediaAssetInvalid();
    }

    return {
      contentType: record.contentType,
      format: record.format,
      height: record.height,
      path: record.path,
      width: record.width
    };
  });
}

function assertPersistedAssetInput(input: PersistedSiteImageAssetInput): void {
  if (input.decodedFormat.trim() === "" || input.sourceMime.trim() === "") {
    throw mediaAssetInvalid();
  }
  if (!/^[a-f0-9]{64}$/.test(input.sourceSha256)) {
    throw mediaAssetInvalid();
  }
  if (input.width <= 0 || input.height <= 0) {
    throw mediaAssetInvalid();
  }
  if (input.storagePath !== `sites/${input.siteId}/${input.slot}/${input.assetId}`) {
    throw mediaAssetInvalid();
  }

  const variantKeys = new Set<string>();
  for (const variant of input.variants) {
    const variantKey = `${variant.width}:${variant.format}`;
    if (variant.width <= 0 || variant.height <= 0 || variantKeys.has(variantKey)) {
      throw mediaAssetInvalid();
    }
    variantKeys.add(variantKey);
    if (
      !variant.path.startsWith(`${input.storagePath}/`) ||
      variant.path.includes("..") ||
      variant.path.includes("?") ||
      variant.path.includes("#") ||
      variant.path.includes("://")
    ) {
      throw mediaAssetInvalid();
    }
  }
}

function persistedAssetMatchesInput(
  asset: Parameters<typeof toPublicationMediaAsset>[0],
  input: PersistedSiteImageAssetInput
): boolean {
  let persisted: SitePublicationMediaAsset;

  try {
    persisted = toPublicationMediaAsset(asset, null);
  } catch {
    return false;
  }

  return (
    persisted.assetId === input.assetId &&
    persisted.decodedFormat === input.decodedFormat &&
    persisted.height === input.height &&
    persisted.siteId === input.siteId &&
    persisted.slot === input.slot &&
    persisted.sourceMime === input.sourceMime &&
    persisted.sourceSha256 === input.sourceSha256 &&
    persisted.storagePath === input.storagePath &&
    persisted.width === input.width &&
    variantsEqual(persisted.variants, input.variants)
  );
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function uploadIdConflict(): AppError {
  return new AppError({
    code: "UPLOAD_ID_CONFLICT",
    message: "Upload id conflicts with another image.",
    statusCode: 409
  });
}

function mediaAssetInvalid(): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    message: "Media asset identity is invalid.",
    statusCode: 422
  });
}

function readImageSlot(value: string): ImageSlot {
  if (value === "gallery" || value === "preview") {
    return value;
  }

  throw mediaAssetInvalid();
}
