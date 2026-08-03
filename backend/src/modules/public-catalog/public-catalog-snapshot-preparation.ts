import { mapSiteToPublicCatalogItem, publicGalleryImagesSchema } from "./public-catalog.mapper.js";
import {
  PUBLIC_CATALOG_MAX_BYTES,
  PUBLIC_CATALOG_MAX_ITEMS,
  createPublicCatalogSnapshot,
  hashPublicCatalogSnapshotBytes,
  serializePublicCatalogSnapshot,
  validatePublicCatalogSnapshot,
  type BuiltPublicCatalogSnapshot,
  type PublicCatalogSnapshot,
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
import type {
  PublicGalleryImage,
  PublicImageVariant,
  PublicSiteDetail,
  PublicSiteRecord
} from "./public-catalog.types.js";

export interface PublicCatalogSnapshotPreparationInput {
  generatedAt: Date;
  records: PublicSiteRecord[];
  revision: number;
  settings: PublicCatalogSnapshotSettings;
}

interface ItemIdentity {
  itemIndex: number;
  siteId: string | null;
  slug: string | null;
}

export class PublicCatalogSnapshotPreparationSystemError extends Error {
  public readonly causeClass: string;
  public readonly stage: PublicCatalogDryRunStage;

  public constructor(input: { cause: unknown; stage: PublicCatalogDryRunStage }) {
    super("Public catalog snapshot preparation failed.", { cause: input.cause });
    this.name = "PublicCatalogSnapshotPreparationSystemError";
    this.causeClass = safeCauseClass(input.cause);
    this.stage = input.stage;
  }
}

export class PublicCatalogSnapshotDataError extends Error {
  public readonly blocker: PublicCatalogDryRunBlocker;
  public readonly fieldPath: string | null;
  public readonly reasonCode: PublicCatalogDryRunReasonCode;
  public readonly stage: PublicCatalogDryRunStage;

  public constructor(input: Omit<PublicCatalogDryRunBlocker, "errorCode">) {
    super("Public catalog snapshot data blocked publication.");
    this.name = "PublicCatalogSnapshotDataError";
    this.blocker = createBlocker(input);
    this.fieldPath = this.blocker.fieldPath;
    this.reasonCode = this.blocker.reasonCode;
    this.stage = this.blocker.stage;
  }
}

export async function runPreparationStage<T>(
  stage: PublicCatalogDryRunStage,
  operation: () => T | Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof PublicCatalogSnapshotDataError ||
      error instanceof PublicCatalogSnapshotPreparationSystemError
    ) {
      throw error;
    }

    throw new PublicCatalogSnapshotPreparationSystemError({ cause: error, stage });
  }
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

  for (const [itemIndex, record] of input.records.entries()) {
    const mapping = await runPreparationStage("item_map", () => {
      const identity = readIdentity(record, itemIndex);
      const mapperBlockers = validateMapperInput(record, identity);

      return {
        identity,
        item: mapperBlockers.length === 0 ? mapSiteToPublicCatalogItem(record) : null,
        mapperBlockers
      };
    });

    blockers.push(...mapping.mapperBlockers);
    if (mapping.mapperBlockers.length > 0 || mapping.item === null) {
      continue;
    }

    const { identity, item } = mapping;
    const itemBlockers = await runPreparationStage("item_validate", () =>
      validateMappedItem(item, identity)
    );
    const serializationBlocker = await runPreparationStage("serialize", () =>
      findUnsupportedSerializationValue(item, {
        ...identity,
        fieldPath: null
      })
    );

    blockers.push(...itemBlockers);
    if (serializationBlocker !== null) {
      blockers.push(serializationBlocker);
    }
    if (itemBlockers.length > 0 || serializationBlocker !== null) {
      continue;
    }

    items.push(item);
    const group = slugIdentities.get(item.slug) ?? [];
    group.push({ ...identity, slug: item.slug });
    slugIdentities.set(item.slug, group);
  }

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
    return toBlockedPreparationResult(blockers, input.records.length, input.revision);
  }

  try {
    const built = await buildPreparedSnapshot({
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
    if (error instanceof PublicCatalogSnapshotDataError) {
      return toBlockedPreparationResult([error.blocker], input.records.length, input.revision);
    }

    throw error;
  }
}

async function buildPreparedSnapshot(input: {
  generatedAt: Date;
  items: PublicSiteDetail[];
  revision: number;
  settings: PublicCatalogSnapshotSettings;
}): Promise<BuiltPublicCatalogSnapshot> {
  const snapshot = await runPreparationStage("catalog_validate", () =>
    validatePublicCatalogSnapshot(
      createPublicCatalogSnapshot({
        generatedAt: input.generatedAt,
        items: input.items,
        revision: input.revision,
        settings: input.settings
      })
    )
  );
  const bytes = await runPreparationStage("serialize", () =>
    serializePublicCatalogSnapshot(snapshot)
  );

  await runPreparationStage("size_validate", () => {
    if (Buffer.byteLength(bytes, "utf8") > PUBLIC_CATALOG_MAX_BYTES) {
      throw new PublicCatalogSnapshotDataError({
        fieldPath: "snapshot",
        itemIndex: null,
        reasonCode: "SNAPSHOT_TOO_LARGE",
        siteId: null,
        slug: null,
        stage: "size_validate"
      });
    }
  });

  const sha256 = await runPreparationStage("hash", () => {
    const value = hashPublicCatalogSnapshotBytes(bytes);
    if (!/^[a-f0-9]{64}$/.test(value)) {
      throw new Error("Public catalog snapshot checksum invalid.");
    }
    return value;
  });

  const parsedSnapshot = await verifyPublicCatalogSnapshotExactBytes({
    bytes,
    expectedItemsCount: input.items.length,
    expectedRevision: input.revision,
    expectedSettings: input.settings,
    sha256
  });

  return {
    bytes,
    sha256,
    snapshot: parsedSnapshot
  };
}

export async function verifyPublicCatalogSnapshotExactBytes(input: {
  bytes: string;
  expectedItemsCount: number;
  expectedRevision: number;
  expectedSettings: PublicCatalogSnapshotSettings;
  sha256: string;
}): Promise<PublicCatalogSnapshot> {
  return runPreparationStage("final_parse_validate", () => {
    const parsed = validatePublicCatalogSnapshot(JSON.parse(input.bytes)) as PublicCatalogSnapshot;

    if (
      parsed.revision !== input.expectedRevision ||
      parsed.itemsCount !== input.expectedItemsCount ||
      parsed.settings.showDemoInModal !== input.expectedSettings.showDemoInModal ||
      hashPublicCatalogSnapshotBytes(input.bytes) !== input.sha256
    ) {
      throw new Error("Public catalog snapshot final invariant mismatch.");
    }

    return parsed;
  });
}

function toBlockedPreparationResult(
  blockers: readonly PublicCatalogDryRunBlocker[],
  itemsCount: number,
  revision: number
): PublicCatalogSnapshotPreparationResult {
  const limited = sortAndLimitPublicCatalogDryRunBlockers(blockers);

  return {
    ...limited,
    byteLength: null,
    itemsCount,
    revision,
    sha256: null,
    status: "blocked"
  };
}

function validateMapperInput(
  record: PublicSiteRecord,
  identity: ItemIdentity
): PublicCatalogDryRunBlocker[] {
  const blockers: PublicCatalogDryRunBlocker[] = [];

  if (record.publishedAt !== null && !isValidDate(record.publishedAt)) {
    blockers.push(
      createBlocker({
        ...identity,
        fieldPath: "publishedAt",
        reasonCode: "UNKNOWN_MAPPING_FAILURE",
        stage: "item_map"
      })
    );
  }

  blockers.push(...validateGalleryImagesForMapper(record.galleryImages, identity));

  return blockers;
}

function validateGalleryImagesForMapper(
  value: unknown,
  identity: ItemIdentity
): PublicCatalogDryRunBlocker[] {
  const parsed = publicGalleryImagesSchema.safeParse(value);

  if (parsed.success) {
    return [];
  }

  if (!Array.isArray(value)) {
    return [
      createBlocker({
        ...identity,
        fieldPath: "galleryImages",
        reasonCode: "INVALID_GALLERY_SHAPE",
        stage: "item_map"
      })
    ];
  }

  return parsed.error.issues.map((issue) =>
    createBlocker({
      ...identity,
      fieldPath: toGalleryIssueFieldPath(issue.path),
      reasonCode: "INVALID_IMAGE_DESCRIPTOR",
      stage: "item_map"
    })
  );
}

function validateMappedItem(
  item: PublicSiteDetail,
  identity: ItemIdentity
): PublicCatalogDryRunBlocker[] {
  const blockers: PublicCatalogDryRunBlocker[] = [];

  if (typeof item.slug !== "string" || item.slug.length === 0) {
    blockers.push(
      createBlocker({
        ...identity,
        fieldPath: "slug",
        reasonCode: "INVALID_REQUIRED_STRING",
        stage: "item_validate"
      })
    );
  }

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
    blockers.push(
      ...validateImageVariants(item.previewImage.variants, "previewImage.variants", identity)
    );
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

  return value.flatMap((variant, index) => validateImageVariant(variant, fieldPath, index, identity));
}

function validateImageVariant(
  variant: unknown,
  fieldPath: string,
  index: number,
  identity: ItemIdentity
): PublicCatalogDryRunBlocker[] {
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

function toGalleryIssueFieldPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "galleryImages";
  }

  return path.reduce((fieldPath: string, segment) => {
    return typeof segment === "number"
      ? `${fieldPath}[${segment}]`
      : `${fieldPath}.${String(segment)}`;
  }, "galleryImages");
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeCauseClass(error: unknown): string {
  const value =
    error instanceof Error
      ? error.name || error.constructor.name
      : typeof error === "object" && error !== null
        ? "NonErrorObject"
        : "NonError";

  return /^[A-Za-z][A-Za-z0-9_.-]{0,80}$/.test(value) ? value : "Error";
}
