import {
  PUBLIC_CATALOG_V2_ACTIVE_PATH,
  PUBLIC_CATALOG_V2_JSON_BUCKET,
  PUBLIC_CATALOG_V2_SCHEMA_VERSION,
  assertPublicCatalogV2StoragePath,
  buildPublicCatalogV2ChunkPath,
  buildPublicCatalogV2ReleasePath
} from "./public-catalog-v2.paths.js";

export type PublicCatalogV2ArtifactKind =
  | "active"
  | "categories"
  | "chunk"
  | "index"
  | "manifest"
  | "popular";

interface ManifestChildDescriptor {
  bytes?: number;
  count?: number;
  path: string;
  sha256: string;
}

interface ExpectedManifestArtifactDescriptor {
  bytes?: number;
  itemsCount?: number;
  kind: "categories" | "chunk" | "index" | "popular";
  path: string;
  sha256: string;
}

export function validatePublicCatalogV2ActivePointer(value: unknown): Record<string, unknown> {
  const record = readRecord(value, "active pointer");
  assertExactKeys(record, [
    "activatedAt",
    "activeRevision",
    "manifestPath",
    "manifestSha256",
    "manifestUrl",
    "previousRevision",
    "schemaVersion"
  ]);
  assertSchemaVersion(record.schemaVersion);
  readPositiveInteger(record.activeRevision, "activeRevision");
  readIsoDate(record.activatedAt, "activatedAt");
  const manifestPath = readString(record.manifestPath, "manifestPath");
  assertPublicCatalogV2StoragePath(manifestPath);
  if (manifestPath !== buildPublicCatalogV2ReleasePath(Number(record.activeRevision), "manifest")) {
    throw artifactInvalid();
  }
  readPublicUrl(record.manifestUrl, "manifestUrl", {
    expectedBucket: PUBLIC_CATALOG_V2_JSON_BUCKET,
    expectedPath: manifestPath
  });
  readSha256(record.manifestSha256, "manifestSha256");
  if (record.previousRevision !== null) {
    readNonNegativeInteger(record.previousRevision, "previousRevision");
  }
  return record;
}

export function validatePublicCatalogV2Manifest(value: unknown): Record<string, unknown> {
  const record = readRecord(value, "manifest");
  assertExactKeys(record, [
    "artifacts",
    "catalogOrder",
    "categories",
    "chunkSize",
    "chunks",
    "chunksCount",
    "generatedAt",
    "index",
    "itemsCount",
    "popular",
    "revision",
    "schemaVersion",
    "settings",
    "uniqueSlugCount"
  ]);
  assertSchemaVersion(record.schemaVersion);
  const revision = readPositiveInteger(record.revision, "revision");
  readIsoDate(record.generatedAt, "generatedAt");
  const itemsCount = readNonNegativeInteger(record.itemsCount, "itemsCount");
  const chunksCount = readNonNegativeInteger(record.chunksCount, "chunksCount");
  const chunkSize = readPositiveInteger(record.chunkSize, "chunkSize");
  if (record.catalogOrder !== "sortOrder-createdAtDesc-slug-id") {
    throw artifactInvalid();
  }
  if (readNonNegativeInteger(record.uniqueSlugCount, "uniqueSlugCount") !== itemsCount) {
    throw artifactInvalid();
  }
  validateSettings(record.settings);
  const indexDescriptor = validateManifestChildDescriptor(record.index, revision, "index");
  const popularDescriptor = validateManifestChildDescriptor(record.popular, revision, "popular");
  const categoriesDescriptor = validateManifestChildDescriptor(record.categories, revision, "categories");
  const chunks = readArray(record.chunks, "chunks");
  if (chunks.length !== chunksCount) {
    throw artifactInvalid();
  }
  let chunkItemsCount = 0;
  const expectedArtifacts: ExpectedManifestArtifactDescriptor[] = [];
  chunks.forEach((chunk, index) => {
    const descriptor = readRecord(chunk, "chunk descriptor");
    assertExactKeys(descriptor, ["bytes", "firstSlug", "index", "itemsCount", "lastSlug", "path", "sha256"]);
    const chunkIndex = readPositiveInteger(descriptor.index, "chunks.index");
    if (chunkIndex !== index + 1) {
      throw artifactInvalid();
    }
    if (readString(descriptor.path, "chunks.path") !== buildPublicCatalogV2ChunkPath(revision, chunkIndex)) {
      throw artifactInvalid();
    }
    const chunkSha256 = readSha256(descriptor.sha256, "chunks.sha256");
    const chunkBytes = readPositiveInteger(descriptor.bytes, "chunks.bytes");
    const chunkCount = readPositiveInteger(descriptor.itemsCount, "chunks.itemsCount");
    chunkItemsCount += chunkCount;
    readString(descriptor.firstSlug, "chunks.firstSlug");
    readString(descriptor.lastSlug, "chunks.lastSlug");
    expectedArtifacts.push({
      bytes: chunkBytes,
      itemsCount: chunkCount,
      kind: "chunk",
      path: String(descriptor.path),
      sha256: chunkSha256
    });
  });
  if (chunkItemsCount !== itemsCount || chunksCount !== Math.ceil(itemsCount / chunkSize)) {
    throw artifactInvalid();
  }
  const artifacts = readArray(record.artifacts, "artifacts");
  validateManifestArtifactDescriptors(artifacts, [
    ...expectedArtifacts,
    {
      bytes: readDescriptorBytes(indexDescriptor.bytes),
      itemsCount,
      kind: "index",
      path: indexDescriptor.path,
      sha256: indexDescriptor.sha256
    },
    {
      kind: "popular",
      path: popularDescriptor.path,
      sha256: popularDescriptor.sha256
    },
    {
      kind: "categories",
      path: categoriesDescriptor.path,
      sha256: categoriesDescriptor.sha256
    }
  ]);
  return record;
}

export function validatePublicCatalogV2Index(value: unknown): Record<string, unknown> {
  const record = readRecord(value, "index");
  assertExactKeys(record, ["chunks", "items", "itemsCount", "revision", "schemaVersion"]);
  assertSchemaVersion(record.schemaVersion);
  readPositiveInteger(record.revision, "revision");
  const items = readArray(record.items, "items");
  if (readNonNegativeInteger(record.itemsCount, "itemsCount") !== items.length) {
    throw artifactInvalid();
  }
  const slugs = new Set<string>();
  items.forEach((item, index) => {
    const entry = readRecord(item, "index item");
    assertRequiredKeys(entry, [
      "categorySlug",
      "chunk",
      "order",
      "popularOrder",
      "preview",
      "slug",
      "title"
    ]);
    assertAllowedKeys(entry, [
      "categorySlug",
      "categoryTitle",
      "chunk",
      "deliveryLabel",
      "features",
      "order",
      "popularOrder",
      "preview",
      "priceLabel",
      "shortDescription",
      "slug",
      "tags",
      "title"
    ]);
    const slug = readSlug(entry.slug, "slug");
    if (slugs.has(slug)) {
      throw artifactInvalid();
    }
    slugs.add(slug);
    if (readPositiveInteger(entry.order, "order") !== index + 1) {
      throw artifactInvalid();
    }
    readPositiveInteger(entry.chunk, "chunk");
    if (entry.popularOrder !== null) {
      readPositiveInteger(entry.popularOrder, "popularOrder");
    }
    validateCompactPreview(entry.preview);
    readString(entry.title, "title");
    readString(entry.categorySlug, "categorySlug");
    if (entry.categoryTitle !== undefined) {
      readString(entry.categoryTitle, "categoryTitle");
    }
    if (entry.deliveryLabel !== undefined) {
      readString(entry.deliveryLabel, "deliveryLabel");
    }
    if (entry.features !== undefined) {
      readStringArray(entry.features, "features");
    }
    if (entry.priceLabel !== undefined) {
      readString(entry.priceLabel, "priceLabel");
    }
    if (entry.shortDescription !== undefined) {
      readString(entry.shortDescription, "shortDescription");
    }
    if (entry.tags !== undefined) {
      readStringArray(entry.tags, "tags");
    }
  });

  readArray(record.chunks, "chunks").forEach((chunk) => {
    const descriptor = readRecord(chunk, "index chunk");
    assertExactKeys(descriptor, ["firstSlug", "lastSlug", "path"]);
    readString(descriptor.firstSlug, "firstSlug");
    readString(descriptor.lastSlug, "lastSlug");
    assertPublicCatalogV2StoragePath(readString(descriptor.path, "path"));
  });
  return record;
}

export function validatePublicCatalogV2Popular(value: unknown): Record<string, unknown> {
  const record = readRecord(value, "popular");
  assertExactKeys(record, ["items", "popularOrder", "revision", "schemaVersion"]);
  assertSchemaVersion(record.schemaVersion);
  readPositiveInteger(record.revision, "revision");
  const items = readArray(record.items, "items");
  const slugs = new Set<string>();
  items.forEach((item, index) => {
    const entry = readRecord(item, "popular item");
    assertExactKeys(entry, ["chunk", "popularOrder", "slug"]);
    const slug = readSlug(entry.slug, "slug");
    if (slugs.has(slug) || readPositiveInteger(entry.popularOrder, "popularOrder") !== index + 1) {
      throw artifactInvalid();
    }
    slugs.add(slug);
    readPositiveInteger(entry.chunk, "chunk");
  });
  const popularOrder = readStringArray(record.popularOrder, "popularOrder");
  if (popularOrder.length !== items.length || popularOrder.some((slug, index) => slug !== readString(readRecord(items[index], "popular item").slug, "slug"))) {
    throw artifactInvalid();
  }
  return record;
}

export function validatePublicCatalogV2Categories(value: unknown): Record<string, unknown> {
  const record = readRecord(value, "categories");
  assertExactKeys(record, ["categories", "revision", "schemaVersion"]);
  assertSchemaVersion(record.schemaVersion);
  readPositiveInteger(record.revision, "revision");
  const slugs = new Set<string>();
  readArray(record.categories, "categories").forEach((category) => {
    const entry = readRecord(category, "category");
    assertExactKeys(entry, ["description", "itemsCount", "slug", "sortOrder", "title"]);
    const slug = readSlug(entry.slug, "slug");
    if (slugs.has(slug)) {
      throw artifactInvalid();
    }
    slugs.add(slug);
    readString(entry.title, "title");
    readString(entry.description, "description");
    readNonNegativeInteger(entry.itemsCount, "itemsCount");
    readNonNegativeInteger(entry.sortOrder, "sortOrder");
  });
  return record;
}

export function validatePublicCatalogV2Chunk(value: unknown): Record<string, unknown> {
  const record = readRecord(value, "chunk");
  assertExactKeys(record, ["chunkIndex", "items", "itemsCount", "revision", "schemaVersion"]);
  assertSchemaVersion(record.schemaVersion);
  readPositiveInteger(record.revision, "revision");
  readPositiveInteger(record.chunkIndex, "chunkIndex");
  const items = readArray(record.items, "items");
  if (readNonNegativeInteger(record.itemsCount, "itemsCount") !== items.length) {
    throw artifactInvalid();
  }
  const slugs = new Set<string>();
  items.forEach((item) => {
    const entry = readRecord(item, "chunk item");
    assertExactKeys(entry, [
      "category",
      "deliveryLabel",
      "demoMode",
      "demoUrl",
      "features",
      "fullDescription",
      "galleryImages",
      "previewImage",
      "priceLabel",
      "publishedAt",
      "shortDescription",
      "siteUrl",
      "slug",
      "tags",
      "title"
    ]);
    const slug = readSlug(entry.slug, "slug");
    if (slugs.has(slug)) {
      throw artifactInvalid();
    }
    slugs.add(slug);
    readString(entry.title, "title");
    readString(entry.shortDescription, "shortDescription");
    readString(entry.fullDescription, "fullDescription");
    validateCategoryReference(entry.category);
    readStringArray(entry.tags, "tags");
    readStringArray(entry.features, "features");
    readString(entry.priceLabel, "priceLabel");
    readString(entry.deliveryLabel, "deliveryLabel");
    readString(entry.demoMode, "demoMode");
    readNullablePublicUrl(entry.demoUrl, "demoUrl");
    readNullablePublicUrl(entry.siteUrl, "siteUrl");
    readIsoDate(entry.publishedAt, "publishedAt");
    validateFullMediaAsset(entry.previewImage, "previewImage");
    validateGallery(readArray(entry.galleryImages, "galleryImages"));
  });
  return record;
}

export function validatePublicCatalogV2Artifact(kind: PublicCatalogV2ArtifactKind, value: unknown): Record<string, unknown> {
  switch (kind) {
    case "active":
      return validatePublicCatalogV2ActivePointer(value);
    case "categories":
      return validatePublicCatalogV2Categories(value);
    case "chunk":
      return validatePublicCatalogV2Chunk(value);
    case "index":
      return validatePublicCatalogV2Index(value);
    case "manifest":
      return validatePublicCatalogV2Manifest(value);
    case "popular":
      return validatePublicCatalogV2Popular(value);
  }
}

function validateManifestChildDescriptor(value: unknown, revision: number, kind: "categories" | "index" | "popular"): ManifestChildDescriptor {
  const descriptor = readRecord(value, kind);
  assertExactKeys(descriptor, kind === "index" ? ["bytes", "path", "sha256"] : ["count", "path", "sha256"]);
  const path = readString(descriptor.path, `${kind}.path`);
  if (path !== buildPublicCatalogV2ReleasePath(revision, kind)) {
    throw artifactInvalid();
  }
  const sha256 = readSha256(descriptor.sha256, `${kind}.sha256`);
  if (kind === "index") {
    return {
      bytes: readPositiveInteger(descriptor.bytes, `${kind}.bytes`),
      path,
      sha256
    };
  }
  return {
    count: readNonNegativeInteger(descriptor.count, `${kind}.count`),
    path,
    sha256
  };
}

function readDescriptorBytes(value: number | undefined): number {
  if (value === undefined) {
    throw artifactInvalid();
  }
  return value;
}

function validateManifestArtifactDescriptors(
  artifacts: unknown[],
  expectedArtifacts: ExpectedManifestArtifactDescriptor[]
): void {
  if (artifacts.length !== expectedArtifacts.length) {
    throw artifactInvalid();
  }

  const expectedByPath = new Map(expectedArtifacts.map((artifact) => [artifact.path, artifact]));
  const seenPaths = new Set<string>();
  for (const artifact of artifacts) {
    const descriptor = readRecord(artifact, "manifest artifact");
    const kind = readString(descriptor.kind, "artifacts.kind") as ExpectedManifestArtifactDescriptor["kind"];
    if (!["categories", "chunk", "index", "popular"].includes(kind)) {
      throw artifactInvalid();
    }
    const expectedKeys = kind === "chunk" || kind === "index"
      ? ["byteLength", "bytes", "itemsCount", "kind", "path", "sha256"]
      : ["byteLength", "bytes", "kind", "path", "sha256"];
    assertExactKeys(descriptor, expectedKeys);
    const path = readString(descriptor.path, "artifacts.path");
    assertPublicCatalogV2StoragePath(path);
    if (seenPaths.has(path)) {
      throw artifactInvalid();
    }
    seenPaths.add(path);
    const expected = expectedByPath.get(path);
    if (expected === undefined || expected.kind !== kind) {
      throw artifactInvalid();
    }
    const sha256 = readSha256(descriptor.sha256, "artifacts.sha256");
    const bytes = readPositiveInteger(descriptor.bytes, "artifacts.bytes");
    const byteLength = readPositiveInteger(descriptor.byteLength, "artifacts.byteLength");
    if (
      sha256 !== expected.sha256 ||
      bytes !== byteLength ||
      (expected.bytes !== undefined && bytes !== expected.bytes)
    ) {
      throw artifactInvalid();
    }
    if (expected.itemsCount !== undefined && readNonNegativeInteger(descriptor.itemsCount, "artifacts.itemsCount") !== expected.itemsCount) {
      throw artifactInvalid();
    }
  }
}

function validateSettings(value: unknown): void {
  const settings = readRecord(value, "settings");
  assertExactKeys(settings, ["showDemoInModal"]);
  if (typeof settings.showDemoInModal !== "boolean") {
    throw artifactInvalid();
  }
}

function validateCompactPreview(value: unknown): void {
  if (value === null) {
    return;
  }
  const preview = readRecord(value, "preview");
  assertExactKeys(preview, ["assetId", "height", "lqip", "width"]);
  readString(preview.assetId, "preview.assetId");
  readDataImage(preview.lqip, "preview.lqip");
  readPositiveInteger(preview.width, "preview.width");
  readPositiveInteger(preview.height, "preview.height");
}

function validateCategoryReference(value: unknown): void {
  const category = readRecord(value, "category");
  assertExactKeys(category, ["slug", "title"]);
  readSlug(category.slug, "category.slug");
  readString(category.title, "category.title");
}

function validateGallery(images: unknown[]): void {
  let expectedSortOrder = 0;
  const assetIds = new Set<string>();
  for (const image of images) {
    const asset = validateFullMediaAsset(image, "galleryImages");
    const sortOrder = readNonNegativeInteger(asset.sortOrder, "galleryImages.sortOrder");
    if (sortOrder !== expectedSortOrder || assetIds.has(readString(asset.assetId, "galleryImages.assetId"))) {
      throw artifactInvalid();
    }
    assetIds.add(String(asset.assetId));
    expectedSortOrder += 1;
  }
}

function validateFullMediaAsset(value: unknown, field: string): Record<string, unknown> {
  if (value === null && field === "previewImage") {
    return { assetId: null, sortOrder: null };
  }
  const media = readRecord(value, field);
  const keys = field === "previewImage"
    ? ["assetId", "height", "lqip", "sourceSha256", "url", "variants", "width"]
    : ["alt", "assetId", "height", "lqip", "sortOrder", "sourceSha256", "url", "variants", "width"];
  assertExactKeys(media, keys);
  readString(media.assetId, `${field}.assetId`);
  readSha256(media.sourceSha256, `${field}.sourceSha256`);
  readPositiveInteger(media.width, `${field}.width`);
  readPositiveInteger(media.height, `${field}.height`);
  readPublicUrl(media.url, `${field}.url`);
  readDataImage(media.lqip, `${field}.lqip`);
  const widths = new Set<number>();
  readArray(media.variants, `${field}.variants`).forEach((variant) => {
    const entry = readRecord(variant, `${field}.variant`);
    assertExactKeys(entry, ["avifUrl", "webpUrl", "width"]);
    const width = readPositiveInteger(entry.width, `${field}.variant.width`);
    if (widths.has(width)) {
      throw artifactInvalid();
    }
    widths.add(width);
    readPublicUrl(entry.avifUrl, `${field}.variant.avifUrl`);
    readPublicUrl(entry.webpUrl, `${field}.variant.webpUrl`);
  });
  if (field !== "previewImage") {
    readString(media.alt, `${field}.alt`);
    readNonNegativeInteger(media.sortOrder, `${field}.sortOrder`);
  }
  return media;
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid Public Catalog V2 ${field}.`);
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Public Catalog V2 ${field}.`);
  }
  return value;
}

function readStringArray(value: unknown, field: string): string[] {
  return readArray(value, field).map((item) => readString(item, field));
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid Public Catalog V2 ${field}.`);
  }
  return value;
}

function readSlug(value: unknown, field: string): string {
  const slug = readString(value, field);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw artifactInvalid();
  }
  return slug;
}

function readPositiveInteger(value: unknown, field: string): number {
  const number = readNonNegativeInteger(value, field);
  if (number < 1) {
    throw artifactInvalid();
  }
  return number;
}

function readNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid Public Catalog V2 ${field}.`);
  }
  return value;
}

function readSha256(value: unknown, field: string): string {
  const sha256 = readString(value, field);
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw artifactInvalid();
  }
  return sha256;
}

function readIsoDate(value: unknown, field: string): string {
  const date = readString(value, field);
  if (Number.isNaN(Date.parse(date)) || new Date(date).toISOString() !== date) {
    throw new Error(`Invalid Public Catalog V2 ${field}.`);
  }
  return date;
}

function readNullablePublicUrl(value: unknown, field: string): void {
  if (value === null) {
    return;
  }
  readPublicUrl(value, field);
}

function readPublicUrl(value: unknown, field: string, options: { expectedBucket?: string; expectedPath?: string } = {}): string {
  const url = readString(value, field);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw artifactInvalid();
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw artifactInvalid();
  }
  if (options.expectedPath !== undefined && !parsed.pathname.endsWith(`/${options.expectedPath}`)) {
    throw artifactInvalid();
  }
  if (
    options.expectedBucket !== undefined &&
    !parsed.pathname.includes(`/storage/v1/object/public/${options.expectedBucket}/`)
  ) {
    throw artifactInvalid();
  }
  return url;
}

function readDataImage(value: unknown, field: string): void {
  if (value === null) {
    return;
  }
  const image = readString(value, field);
  if (!/^data:image\/(?:avif|png|webp|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(image)) {
    throw artifactInvalid();
  }
}

function assertSchemaVersion(value: unknown): void {
  if (value !== PUBLIC_CATALOG_V2_SCHEMA_VERSION) {
    throw artifactInvalid();
  }
}

function assertExactKeys(record: Record<string, unknown>, keys: string[]): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw artifactInvalid();
  }
}

function assertRequiredKeys(record: Record<string, unknown>, keys: string[]): void {
  if (keys.some((key) => !(key in record))) {
    throw artifactInvalid();
  }
}

function assertAllowedKeys(record: Record<string, unknown>, keys: string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw artifactInvalid();
  }
}

function artifactInvalid(): Error {
  return new Error("PUBLIC_CATALOG_V2_ARTIFACT_VERIFY_FAILED");
}
