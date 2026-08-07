import { createHash } from "node:crypto";
import { AppError } from "../../lib/errors.js";
import type {
  PublicGalleryImage,
  PublicImageVariant,
  PublicPreviewImage,
  PublicSiteDetail
} from "./public-catalog.types.js";

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
  bytes: Buffer;
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
  const snapshot: PublicCatalogSnapshot = {
    generatedAt: options.generatedAt.toISOString(),
    items: options.items.map((item) => ({ ...item })),
    itemsCount: options.items.length,
    revision: readPositiveInteger(options.revision, "revision"),
    schemaVersion: PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION,
    settings: {
      showDemoInModal: options.settings.showDemoInModal === true
    }
  };

  validatePublicCatalogSnapshot(snapshot);
  const bytes = Buffer.from(`${stableStringify(snapshot)}\n`, "utf8");
  if (bytes.byteLength > (options.byteLimit ?? PUBLIC_CATALOG_MAX_BYTES)) {
    throw snapshotInvalid("Public catalog snapshot exceeds 2MiB byte limit.");
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
    itemsCount: readNonNegativeInteger(options.itemsCount, "itemsCount"),
    revision: readPositiveInteger(options.revision, "revision"),
    schemaVersion: PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION,
    sha256: readSha256(options.sha256),
    snapshotPath: readString(options.snapshotPath, "snapshotPath"),
    snapshotUrl: readString(options.snapshotUrl, "snapshotUrl")
  };

  return validatePublicCatalogManifest(manifest);
}

export function serializePublicCatalogManifest(manifest: PublicCatalogManifest): Buffer {
  return Buffer.from(`${stableStringify(validatePublicCatalogManifest(manifest))}\n`, "utf8");
}

export function validatePublicCatalogSnapshot(value: unknown): PublicCatalogSnapshot {
  if (!isRecord(value)) {
    throw snapshotInvalid("Public catalog snapshot must be an object.");
  }
  if (value.schemaVersion !== PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION) {
    throw snapshotInvalid("Invalid public catalog snapshot schema version.");
  }

  const revision = readPositiveInteger(value.revision, "revision");
  const generatedAt = readIsoDate(value.generatedAt, "generatedAt");
  const itemsCount = readNonNegativeInteger(value.itemsCount, "itemsCount");
  if (!Array.isArray(value.items)) {
    throw snapshotInvalid("Public catalog snapshot items must be an array.");
  }
  if (value.items.length > PUBLIC_CATALOG_MAX_ITEMS) {
    throw snapshotInvalid("Public catalog snapshot items exceed limit.");
  }
  if (itemsCount !== value.items.length) {
    throw snapshotInvalid("Public catalog snapshot itemsCount mismatch.");
  }

  const settings = validateSettings(value.settings);
  const seenSlugs = new Set<string>();
  const items = value.items.map((item) => validateItem(item, seenSlugs));

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
    throw snapshotInvalid("Public catalog manifest must be an object.");
  }
  if (value.schemaVersion !== PUBLIC_CATALOG_SNAPSHOT_SCHEMA_VERSION) {
    throw snapshotInvalid("Invalid public catalog manifest schema version.");
  }

  const revision = readPositiveInteger(value.revision, "revision");
  const generatedAt = readIsoDate(value.generatedAt, "generatedAt");
  const itemsCount = readNonNegativeInteger(value.itemsCount, "itemsCount");
  const sha256 = readSha256(value.sha256);
  const snapshotPath = readString(value.snapshotPath, "snapshotPath");
  const snapshotUrl = readString(value.snapshotUrl, "snapshotUrl");

  const expectedSuffix = `/revision-${revision}-${sha256}.json`;
  if (
    !/^(.+\/)?catalog\/v1\/releases\/revision-[1-9][0-9]*-[a-f0-9]{64}\.json$/.test(snapshotPath) ||
    !snapshotPath.endsWith(expectedSuffix)
  ) {
    throw snapshotInvalid("Invalid public catalog manifest snapshotPath.");
  }

  validateSnapshotUrl(snapshotUrl, snapshotPath);

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

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateSettings(value: unknown): PublicCatalogSnapshotSettings {
  if (!isRecord(value) || typeof value.showDemoInModal !== "boolean") {
    throw snapshotInvalid("Invalid public catalog snapshot settings.");
  }
  return {
    showDemoInModal: value.showDemoInModal
  };
}

function validateItem(value: unknown, seenSlugs: Set<string>): PublicSiteDetail {
  if (!isRecord(value)) {
    throw snapshotInvalid("Public catalog item must be an object.");
  }
  const slug = readString(value.slug, "slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw snapshotInvalid("Invalid public catalog item slug.");
  }
  if (seenSlugs.has(slug)) {
    throw snapshotInvalid("Duplicate public catalog slug.");
  }
  seenSlugs.add(slug);

  readString(value.title, "title");
  readString(value.shortDescription, "shortDescription");
  validateNullableUrl(value.demoUrl, "demoUrl");
  validateNullableUrl(value.siteUrl, "siteUrl");
  validateNullableUrl(value.previewImageUrl, "previewImageUrl");
  validatePreview(value.previewImage);
  validateGallery(value.galleryImages);

  return value as unknown as PublicSiteDetail;
}

function validatePreview(value: unknown): void {
  if (value === null) return;
  if (!isRecord(value)) {
    throw snapshotInvalid("Invalid public catalog previewImage.");
  }
  validatePublicReference(readString(value.url, "previewImage.url"), "previewImage.url");
  validateVariants(value.variants);
}

function validateGallery(value: unknown): void {
  if (!Array.isArray(value)) {
    throw snapshotInvalid("Invalid public catalog galleryImages.");
  }
  for (const image of value as PublicGalleryImage[]) {
    if (!isRecord(image)) {
      throw snapshotInvalid("Invalid public catalog gallery image.");
    }
    validatePublicReference(readString(image.url, "galleryImages.url"), "galleryImages.url");
    if ("variants" in image) {
      validateVariants(image.variants);
    }
  }
}

function validateVariants(value: unknown): void {
  if (!Array.isArray(value)) {
    throw snapshotInvalid("Invalid public catalog image variants.");
  }
  for (const variant of value as PublicImageVariant[]) {
    if (!isRecord(variant)) {
      throw snapshotInvalid("Invalid public catalog image variant.");
    }
    validatePublicReference(readString(variant.avifUrl, "variant.avifUrl"), "variant.avifUrl");
    validatePublicReference(readString(variant.webpUrl, "variant.webpUrl"), "variant.webpUrl");
  }
}

function validateNullableUrl(value: unknown, field: string): void {
  if (value === null) return;
  validatePublicReference(readString(value, field), field);
}

function validatePublicReference(value: string, field: string): void {
  if (value.startsWith("/") || value.startsWith("../") || value.includes("\\") || value.includes("#")) {
    throw snapshotInvalid(`Invalid public catalog ${field}.`);
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    if (value.includes("..") || value.includes("?")) {
      throw snapshotInvalid(`Invalid public catalog ${field}.`);
    }
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw snapshotInvalid(`Invalid public catalog ${field}.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw snapshotInvalid(`Invalid public catalog ${field}.`);
  }
}

function validateSnapshotUrl(value: string, snapshotPath: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw snapshotInvalid("Invalid public catalog manifest snapshotUrl.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    !decodeURIComponent(parsed.pathname).endsWith(`/${snapshotPath}`)
  ) {
    throw snapshotInvalid("Invalid public catalog manifest snapshotUrl.");
  }
}

function readPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw snapshotInvalid(`Invalid public catalog ${field}.`);
  }
  return value;
}

function readNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw snapshotInvalid(`Invalid public catalog ${field}.`);
  }
  return value;
}

function readIsoDate(value: unknown, field: string): string {
  const text = readString(value, field);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== text) {
    throw snapshotInvalid(`Invalid public catalog ${field}.`);
  }
  return text;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw snapshotInvalid(`Invalid public catalog ${field}.`);
  }
  return value;
}

function readSha256(value: unknown): string {
  const text = readString(value, "sha256");
  if (!/^[a-f0-9]{64}$/.test(text)) {
    throw snapshotInvalid("Invalid public catalog sha256.");
  }
  return text;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotInvalid(message: string): AppError {
  return new AppError({
    code: "PUBLIC_CATALOG_SNAPSHOT_INVALID",
    message,
    statusCode: 503
  });
}
