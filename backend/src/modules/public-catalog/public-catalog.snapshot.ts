import { createHash } from "node:crypto";
import type { PublicGalleryImage, PublicImageVariant, PublicSiteDetail } from "./public-catalog.types.js";

export const PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION = 1;
export const PUBLIC_CATALOG_MAX_ITEMS = 1_000;
export const PUBLIC_CATALOG_MAX_BYTES = 2 * 1024 * 1024;

export interface PublicCatalogSnapshotSettings {
  showDemoInModal: boolean;
}

export interface PublicCatalogSnapshot {
  generatedAt: string;
  items: PublicSiteDetail[];
  itemsCount: number;
  revision: number;
  schemaVersion: 1;
  settings: PublicCatalogSnapshotSettings;
}

export interface PublicCatalogManifest {
  generatedAt: string;
  itemsCount: number;
  revision: number;
  schemaVersion: 1;
  sha256: string;
  snapshotPath: string;
  snapshotUrl: string;
}

export interface BuildPublicCatalogSnapshotOptions {
  byteLimit?: number;
  generatedAt: Date;
  items: PublicSiteDetail[];
  revision: number;
  settings: PublicCatalogSnapshotSettings;
}

export interface BuiltPublicCatalogSnapshot {
  bytes: string;
  sha256: string;
  snapshot: PublicCatalogSnapshot;
}

export interface BuildPublicCatalogManifestOptions {
  generatedAt: Date;
  itemsCount: number;
  revision: number;
  sha256: string;
  snapshotPath: string;
  snapshotUrl: string;
}

export async function buildPublicCatalogSnapshot(
  options: BuildPublicCatalogSnapshotOptions
): Promise<BuiltPublicCatalogSnapshot> {
  const byteLimit = options.byteLimit ?? PUBLIC_CATALOG_MAX_BYTES;
  const items = [...options.items].sort((left, right) => left.slug.localeCompare(right.slug));
  const snapshot: PublicCatalogSnapshot = {
    generatedAt: options.generatedAt.toISOString(),
    items,
    itemsCount: items.length,
    revision: options.revision,
    schemaVersion: PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION,
    settings: {
      showDemoInModal: options.settings.showDemoInModal
    }
  };

  validatePublicCatalogSnapshot(snapshot);
  const bytes = `${stableStringify(snapshot)}\n`;

  if (Buffer.byteLength(bytes, "utf8") > byteLimit) {
    throw new Error("Public catalog snapshot bytes exceed limit.");
  }

  return {
    bytes,
    sha256: sha256Hex(bytes),
    snapshot
  };
}

export function buildPublicCatalogManifest(
  options: BuildPublicCatalogManifestOptions
): PublicCatalogManifest {
  const manifest: PublicCatalogManifest = {
    generatedAt: options.generatedAt.toISOString(),
    itemsCount: options.itemsCount,
    revision: options.revision,
    schemaVersion: PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION,
    sha256: options.sha256,
    snapshotPath: options.snapshotPath,
    snapshotUrl: options.snapshotUrl
  };

  return validatePublicCatalogManifest(manifest);
}

export function validatePublicCatalogSnapshot(value: unknown): PublicCatalogSnapshot {
  if (!isRecord(value)) {
    throw new Error("Public catalog snapshot must be an object.");
  }

  if (value.schemaVersion !== PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error("Invalid public catalog snapshot schema version.");
  }

  const revision = readSafeNonNegativeInteger(value.revision, "revision");
  const itemsCount = readSafeNonNegativeInteger(value.itemsCount, "itemsCount");
  const generatedAt = readIsoDateString(value.generatedAt, "generatedAt");

  if (!Array.isArray(value.items)) {
    throw new Error("Public catalog snapshot items must be an array.");
  }

  if (value.items.length > PUBLIC_CATALOG_MAX_ITEMS) {
    throw new Error("Public catalog snapshot items exceed limit.");
  }

  if (itemsCount !== value.items.length) {
    throw new Error("Public catalog snapshot itemsCount mismatch.");
  }

  const settings = validatePublicCatalogSnapshotSettings(value.settings);
  const seenSlugs = new Set<string>();
  const items = value.items.map((item) => validatePublicCatalogItem(item, seenSlugs));

  return {
    generatedAt,
    items,
    itemsCount,
    revision,
    schemaVersion: PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION,
    settings
  };
}

export function validatePublicCatalogManifest(value: unknown): PublicCatalogManifest {
  if (!isRecord(value)) {
    throw new Error("Public catalog manifest must be an object.");
  }

  if (value.schemaVersion !== PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error("Invalid public catalog manifest schema version.");
  }

  const revision = readSafeNonNegativeInteger(value.revision, "revision");
  const itemsCount = readSafeNonNegativeInteger(value.itemsCount, "itemsCount");
  const generatedAt = readIsoDateString(value.generatedAt, "generatedAt");
  const sha256 = readString(value.sha256, "sha256");
  const snapshotPath = readString(value.snapshotPath, "snapshotPath");
  const snapshotUrl = readString(value.snapshotUrl, "snapshotUrl");

  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Invalid public catalog manifest sha256.");
  }

  if (!/^public-catalog\/v1\/snapshots\/revision-[0-9]+\.json$/.test(snapshotPath)) {
    throw new Error("Invalid public catalog manifest snapshotPath.");
  }

  validatePublicUrl(snapshotUrl, "snapshotUrl", { allowQuery: false });

  const parsedSnapshotUrl = new URL(snapshotUrl);
  if (!parsedSnapshotUrl.pathname.endsWith(`/${snapshotPath}`)) {
    throw new Error("Invalid public catalog manifest snapshotUrl path.");
  }

  return {
    generatedAt,
    itemsCount,
    revision,
    schemaVersion: PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION,
    sha256,
    snapshotPath,
    snapshotUrl
  };
}

function validatePublicCatalogSnapshotSettings(value: unknown): PublicCatalogSnapshotSettings {
  if (!isRecord(value) || typeof value.showDemoInModal !== "boolean") {
    throw new Error("Invalid public catalog snapshot settings.");
  }

  return {
    showDemoInModal: value.showDemoInModal
  };
}

function validatePublicCatalogItem(value: unknown, seenSlugs: Set<string>): PublicSiteDetail {
  if (!isRecord(value)) {
    throw new Error("Public catalog item must be an object.");
  }

  const slug = readString(value.slug, "slug");
  if (slug.length === 0) {
    throw new Error("Public catalog item slug is required.");
  }

  if (seenSlugs.has(slug)) {
    throw new Error(`Duplicate public catalog slug: ${slug}`);
  }
  seenSlugs.add(slug);

  validateNullablePublicUrl(value.demoUrl, "demoUrl");
  validateNullablePublicUrl(value.siteUrl, "siteUrl");
  validateNullablePublicUrl(value.previewImageUrl, "previewImageUrl");
  validatePublicPreviewImage(value.previewImage);
  validatePublicGalleryImages(value.galleryImages);

  return value as unknown as PublicSiteDetail;
}

function validatePublicPreviewImage(value: unknown): void {
  if (value === null) {
    return;
  }

  if (!isRecord(value)) {
    throw new Error("Invalid public catalog previewImage.");
  }

  validatePublicUrl(readString(value.url, "previewImage.url"), "previewImage.url");
  validatePublicImageVariants(value.variants);
}

function validatePublicGalleryImages(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new Error("Invalid public catalog galleryImages.");
  }

  for (const image of value as PublicGalleryImage[]) {
    if (!isRecord(image)) {
      throw new Error("Invalid public catalog gallery image.");
    }
    validatePublicUrl(readString(image.url, "galleryImages.url"), "galleryImages.url");
    if ("variants" in image) {
      validatePublicImageVariants(image.variants);
    }
  }
}

function validatePublicImageVariants(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new Error("Invalid public catalog image variants.");
  }

  for (const variant of value as PublicImageVariant[]) {
    if (!isRecord(variant)) {
      throw new Error("Invalid public catalog image variant.");
    }
    validatePublicUrl(readString(variant.avifUrl, "variant.avifUrl"), "variant.avifUrl");
    validatePublicUrl(readString(variant.webpUrl, "variant.webpUrl"), "variant.webpUrl");
  }
}

function validateNullablePublicUrl(value: unknown, field: string): void {
  if (value === null) {
    return;
  }

  validatePublicUrl(readString(value, field), field);
}

function validatePublicUrl(
  value: string,
  field: string,
  options: { allowQuery?: boolean } = {}
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid public catalog ${field} URL.`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Invalid public catalog ${field} URL protocol.`);
  }

  if (parsed.username !== "" || parsed.password !== "" || parsed.hash !== "") {
    throw new Error(`Invalid public catalog ${field} URL credentials or fragment.`);
  }

  if (options.allowQuery !== true && parsed.search !== "") {
    throw new Error(`Invalid public catalog ${field} URL query.`);
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readSafeNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid public catalog ${field}.`);
  }

  return value;
}

function readIsoDateString(value: unknown, field: string): string {
  const parsed = readString(value, field);

  if (Number.isNaN(Date.parse(parsed))) {
    throw new Error(`Invalid public catalog ${field}.`);
  }

  return parsed;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid public catalog ${field}.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
