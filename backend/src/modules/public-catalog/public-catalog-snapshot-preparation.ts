import type { ManagedImageUrlPolicy } from "../images/image.types.js";
import { resolveCatalogAssetUrl } from "../../lib/catalog-asset-url.js";
import { mapSiteToPublicCatalogItem } from "./public-catalog.mapper.js";
import {
  buildPublicCatalogSnapshot,
  PUBLIC_CATALOG_MAX_ITEMS,
  type PublicCatalogSnapshotSettings
} from "./public-catalog.snapshot.js";
import {
  createPublicCatalogDryRunBlocker,
  sortAndLimitPublicCatalogDryRunBlockers
} from "./public-catalog-dry-run.diagnostics.js";
import type {
  PublicCatalogDryRunBlocker,
  PublicCatalogDryRunReasonCode,
  PublicCatalogDryRunStage,
  PublicCatalogSnapshotPreparationResult
} from "./public-catalog-dry-run.types.js";
import type { PublicSiteRecord } from "./public-catalog.types.js";
import type { PublicSiteDetail } from "./public-catalog.types.js";

export interface PublicCatalogSnapshotPreparationInput {
  generatedAt: Date;
  imageUrlPolicy?: ManagedImageUrlPolicy;
  records: PublicSiteRecord[];
  revision: number;
  settings: PublicCatalogSnapshotSettings;
}

interface ItemIdentity {
  itemIndex: number;
  siteId: string | null;
  slug: string | null;
}

export async function preparePublicCatalogSnapshotCandidate(
  input: PublicCatalogSnapshotPreparationInput
): Promise<PublicCatalogSnapshotPreparationResult> {
  const blockers: PublicCatalogDryRunBlocker[] = [];
  const items: PublicSiteDetail[] = [];
  const slugIdentities = new Map<string, ItemIdentity[]>();

  if (input.records.length > PUBLIC_CATALOG_MAX_ITEMS) {
    blockers.push(
      createBlocker({
        fieldPath: "items",
        itemIndex: null,
        reasonCode: "INVALID_ITEMS_COUNT",
        siteId: null,
        slug: null,
        stage: "catalog_validate"
      })
    );
  }

  input.records.forEach((record, itemIndex) => {
    const identity = readIdentity(record, itemIndex);
    const beforeMapBlockers = validateRecordBeforeMapping(record, identity);

    blockers.push(...beforeMapBlockers);
    if (beforeMapBlockers.length > 0) {
      return;
    }

    const item = mapSiteToPublicCatalogItem(record, input.imageUrlPolicy);
    const itemBlockers = validateMappedItem(item, identity);
    const serializationBlocker = findUnsupportedSerializationValue(item, {
      ...identity,
      fieldPath: null
    });

    blockers.push(...itemBlockers);
    if (serializationBlocker !== null) {
      blockers.push(serializationBlocker);
    }
    if (itemBlockers.length > 0 || serializationBlocker !== null) {
      return;
    }

    items.push(item);
    const group = slugIdentities.get(item.slug) ?? [];
    group.push({ ...identity, slug: item.slug });
    slugIdentities.set(item.slug, group);
  });

  for (const group of slugIdentities.values()) {
    if (group.length < 2) {
      continue;
    }

    blockers.push(
      ...group.map((identity) =>
        createBlocker({
          ...identity,
          fieldPath: "slug",
          reasonCode: "DUPLICATE_SLUG",
          stage: "catalog_validate"
        })
      )
    );
  }

  if (blockers.length > 0) {
    const limited = sortAndLimitPublicCatalogDryRunBlockers(blockers);

    return {
      ...limited,
      byteLength: null,
      itemsCount: input.records.length,
      revision: input.revision,
      sha256: null,
      status: "blocked"
    };
  }

  try {
    const built = await buildPublicCatalogSnapshot({
      generatedAt: input.generatedAt,
      items,
      revision: input.revision,
      settings: input.settings
    });

    return {
      built,
      byteLength: Buffer.byteLength(built.bytes, "utf8"),
      itemsCount: built.snapshot.itemsCount,
      revision: input.revision,
      status: "ready"
    };
  } catch (error) {
    const blocker = mapSnapshotBuildErrorToBlocker(error);
    if (blocker === null) {
      throw error;
    }

    return {
      blockers: [blocker],
      blockersTruncated: false,
      byteLength: null,
      itemsCount: input.records.length,
      revision: input.revision,
      sha256: null,
      status: "blocked"
    };
  }
}

function validateRecordBeforeMapping(
  record: PublicSiteRecord,
  identity: ItemIdentity
): PublicCatalogDryRunBlocker[] {
  const blockers: PublicCatalogDryRunBlocker[] = [];

  for (const fieldPath of ["slug", "shortDescription", "title"] as const) {
    if (!isRequiredString(record[fieldPath])) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath,
          reasonCode: "INVALID_REQUIRED_STRING",
          stage: "item_validate"
        })
      );
    }
  }

  for (const [fieldPath, value] of [
    ["category.slug", record.category?.slug],
    ["category.title", record.category?.title]
  ] as const) {
    if (!isRequiredString(value)) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath,
          reasonCode: "INVALID_REQUIRED_STRING",
          stage: "item_validate"
        })
      );
    }
  }

  for (const [fieldPath, value] of [
    ["deliveryLabel", record.deliveryLabel],
    ["demoMode", record.demoMode],
    ["fullDescription", record.fullDescription],
    ["previewType", record.previewType],
    ["priceLabel", record.priceLabel]
  ] as const) {
    if (value !== null && typeof value !== "string") {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath,
          reasonCode: "INVALID_OPTIONAL_FIELD",
          stage: "item_validate"
        })
      );
    }
  }

  for (const [fieldPath, value] of [
    ["demoUrl", record.demoUrl],
    ["siteUrl", record.siteUrl],
    ["previewImageUrl", record.previewImageUrl]
  ] as const) {
    const reasonCode = validateOptionalUrl(value, fieldPath);
    if (reasonCode !== null) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath,
          reasonCode,
          stage: "item_validate"
        })
      );
    }
  }

  blockers.push(...validateGalleryImages(record.galleryImages, identity));

  return blockers;
}

function validateGalleryImages(
  value: unknown,
  identity: ItemIdentity
): PublicCatalogDryRunBlocker[] {
  if (!Array.isArray(value)) {
    return [
      createBlocker({
        ...identity,
        fieldPath: "galleryImages",
        reasonCode: "INVALID_GALLERY_SHAPE",
        stage: "item_validate"
      })
    ];
  }

  return value.flatMap((image, index) => {
    const fieldPrefix = `galleryImages[${index}]`;
    const blockers: PublicCatalogDryRunBlocker[] = [];
    if (!isRecord(image)) {
      return [
        createBlocker({
          ...identity,
          fieldPath: fieldPrefix,
          reasonCode: "INVALID_IMAGE_DESCRIPTOR",
          stage: "item_validate"
        })
      ];
    }

    if (typeof image.alt !== "string") {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath: `${fieldPrefix}.alt`,
          reasonCode: "INVALID_IMAGE_DESCRIPTOR",
          stage: "item_validate"
        })
      );
    }

    if (
      typeof image.sortOrder !== "number" ||
      !Number.isSafeInteger(image.sortOrder) ||
      image.sortOrder < 0
    ) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath: `${fieldPrefix}.sortOrder`,
          reasonCode: "INVALID_IMAGE_DESCRIPTOR",
          stage: "item_validate"
        })
      );
    }

    if (typeof image.storagePath !== "string" || image.storagePath.length === 0) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath: `${fieldPrefix}.storagePath`,
          reasonCode: "INVALID_IMAGE_DESCRIPTOR",
          stage: "item_validate"
        })
      );
    }

    if (
      "assetId" in image &&
      image.assetId !== undefined &&
      (typeof image.assetId !== "string" || !isUuid(image.assetId))
    ) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath: `${fieldPrefix}.assetId`,
          reasonCode: "INVALID_IMAGE_DESCRIPTOR",
          stage: "item_validate"
        })
      );
    }

    if (typeof image.url !== "string" || image.url.length === 0) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath: `${fieldPrefix}.url`,
          reasonCode: "INVALID_IMAGE_DESCRIPTOR",
          stage: "item_validate"
        })
      );
    } else {
      const reasonCode = validateOptionalUrl(image.url, `${fieldPrefix}.url`);
      if (reasonCode !== null) {
        blockers.push(
          createBlocker({
            ...identity,
            fieldPath: `${fieldPrefix}.url`,
            reasonCode,
            stage: "item_validate"
          })
        );
      }
    }

    if ("variants" in image && image.variants !== undefined) {
      blockers.push(
        ...validateImageVariants(image.variants, `${fieldPrefix}.variants`, identity)
      );
    }

    return blockers;
  });
}

function validateMappedItem(
  item: PublicSiteDetail,
  identity: ItemIdentity
): PublicCatalogDryRunBlocker[] {
  const blockers: PublicCatalogDryRunBlocker[] = [];

  for (const [fieldPath, value] of [
    ["demoUrl", item.demoUrl],
    ["siteUrl", item.siteUrl],
    ["previewImageUrl", item.previewImageUrl]
  ] as const) {
    const reasonCode = validateOptionalPublicUrl(value);
    if (reasonCode !== null) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath,
          reasonCode,
          stage: "item_validate"
        })
      );
    }
  }

  if (item.previewImage !== null) {
    blockers.push(
      ...validateImageVariants(item.previewImage.variants, "previewImage.variants", identity)
    );
    const reasonCode = validateOptionalPublicUrl(item.previewImage.url);
    if (reasonCode !== null) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath: "previewImage.url",
          reasonCode,
          stage: "item_validate"
        })
      );
    }
  }

  item.galleryImages.forEach((image, index) => {
    const reasonCode = validateOptionalPublicUrl(image.url);
    if (reasonCode !== null) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath: `galleryImages[${index}].url`,
          reasonCode,
          stage: "item_validate"
        })
      );
    }
    if (image.variants !== undefined) {
      blockers.push(
        ...validateImageVariants(
          image.variants,
          `galleryImages[${index}].variants`,
          identity
        )
      );
    }
  });

  return blockers;
}

function validateImageVariants(
  value: unknown,
  fieldPath: string,
  identity: ItemIdentity
): PublicCatalogDryRunBlocker[] {
  if (!Array.isArray(value)) {
    return [
      createBlocker({
        ...identity,
        fieldPath,
        reasonCode: "INVALID_IMAGE_VARIANTS",
        stage: "item_validate"
      })
    ];
  }

  return value.flatMap((variant, index) => {
    if (!isRecord(variant)) {
      return [
        createBlocker({
          ...identity,
          fieldPath: `${fieldPath}[${index}]`,
          reasonCode: "INVALID_IMAGE_VARIANTS",
          stage: "item_validate"
        })
      ];
    }

    const blockers: PublicCatalogDryRunBlocker[] = [];
    for (const urlField of ["avifUrl", "webpUrl"] as const) {
      const reasonCode = validateOptionalPublicUrl(variant[urlField]);
      if (reasonCode !== null) {
        blockers.push(
          createBlocker({
            ...identity,
            fieldPath: `${fieldPath}[${index}].${urlField}`,
            reasonCode,
            stage: "item_validate"
          })
        );
      }
    }
    const width = variant.width;
    if (typeof width !== "number" || !Number.isSafeInteger(width) || width <= 0) {
      blockers.push(
        createBlocker({
          ...identity,
          fieldPath: `${fieldPath}[${index}].width`,
          reasonCode: "INVALID_IMAGE_VARIANTS",
          stage: "item_validate"
        })
      );
    }

    return blockers;
  });
}

function validateOptionalUrl(
  value: unknown,
  fieldPath: string
): PublicCatalogDryRunReasonCode | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0) {
    return "INVALID_OPTIONAL_FIELD";
  }
  if (fieldPath === "previewImageUrl" || fieldPath.includes("galleryImages")) {
    return validateCatalogAssetUrl(value);
  }

  return validateOptionalPublicUrl(value);
}

function validateCatalogAssetUrl(value: string): PublicCatalogDryRunReasonCode | null {
  if (isSchemeLikeUrl(value)) {
    const reasonCode = classifyUrl(value);
    if (reasonCode !== null) {
      return reasonCode;
    }
  }

  const legacyReasonCode = classifyLegacyAssetUrl(value);
  if (legacyReasonCode !== null) {
    return legacyReasonCode;
  }

  if (resolveCatalogAssetUrl(value) !== null) {
    return null;
  }

  return classifyUrl(value);
}

function isSchemeLikeUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function classifyLegacyAssetUrl(value: string): PublicCatalogDryRunReasonCode | null {
  const trimmed = value.trim();
  const legacyPrefixes = ["assets/", "./assets/", "/web00-pro/assets/"];
  if (!legacyPrefixes.some((prefix) => trimmed.startsWith(prefix))) {
    return null;
  }
  if (trimmed.includes("?")) {
    return "INVALID_URL_QUERY";
  }
  if (trimmed.includes("#")) {
    return "INVALID_URL_FRAGMENT";
  }

  return null;
}

function validateOptionalPublicUrl(value: unknown): PublicCatalogDryRunReasonCode | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0) {
    return "INVALID_OPTIONAL_FIELD";
  }

  return classifyUrl(value);
}

function classifyUrl(value: string): PublicCatalogDryRunReasonCode | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "INVALID_URL";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "INVALID_URL_PROTOCOL";
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return "INVALID_URL_CREDENTIALS";
  }
  if (parsed.hash !== "") {
    return "INVALID_URL_FRAGMENT";
  }
  if (parsed.search !== "") {
    return "INVALID_URL_QUERY";
  }

  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function findUnsupportedSerializationValue(
  value: unknown,
  input: ItemIdentity & { fieldPath: string | null }
): PublicCatalogDryRunBlocker | null {
  if (value === undefined) {
    return serializationBlocker(input);
  }
  if (typeof value === "bigint") {
    return serializationBlocker(input);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return serializationBlocker(input);
  }
  if (typeof value === "string" && /[\uD800-\uDFFF]/u.test(value)) {
    return serializationBlocker(input);
  }
  if (value === null || typeof value !== "object") {
    return null;
  }
  if (!Array.isArray(value) && !isRecord(value)) {
    return serializationBlocker(input);
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
  for (const [key, child] of entries) {
    const fieldPath = input.fieldPath === null ? key : `${input.fieldPath}.${key}`;
    const blocker = findUnsupportedSerializationValue(child, {
      ...input,
      fieldPath
    });
    if (blocker !== null) {
      return blocker;
    }
  }

  return null;
}

function serializationBlocker(
  input: ItemIdentity & { fieldPath: string | null }
): PublicCatalogDryRunBlocker {
  return createBlocker({
    ...input,
    reasonCode: "SERIALIZATION_UNSUPPORTED_VALUE",
    stage: "serialize"
  });
}

function mapSnapshotBuildErrorToBlocker(error: unknown): PublicCatalogDryRunBlocker | null {
  if (!(error instanceof Error)) {
    return null;
  }
  if (error.message.includes("items exceed")) {
    return createBlocker({
      fieldPath: "items",
      itemIndex: null,
      reasonCode: "INVALID_ITEMS_COUNT",
      siteId: null,
      slug: null,
      stage: "catalog_validate"
    });
  }
  if (error.message.includes("bytes exceed")) {
    return createBlocker({
      fieldPath: "snapshot",
      itemIndex: null,
      reasonCode: "SNAPSHOT_TOO_LARGE",
      siteId: null,
      slug: null,
      stage: "size_validate"
    });
  }

  return null;
}

function createBlocker(
  input: Omit<PublicCatalogDryRunBlocker, "errorCode">
): PublicCatalogDryRunBlocker {
  return createPublicCatalogDryRunBlocker({
    ...input,
    errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED"
  });
}

function readIdentity(record: PublicSiteRecord, itemIndex: number): ItemIdentity {
  return {
    itemIndex,
    siteId: typeof record.id === "string" && record.id.length > 0 ? record.id : null,
    slug: typeof record.slug === "string" && record.slug.length > 0 ? record.slug : null
  };
}

function isRequiredString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
