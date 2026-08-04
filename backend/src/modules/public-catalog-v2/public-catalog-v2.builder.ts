import type {
  PublicCatalogV2MediaAsset,
  PublicCatalogV2ProjectionPage,
  PublicCatalogV2Settings
} from "./public-catalog-v2.types.js";
import {
  PUBLIC_CATALOG_V2_IMAGE_BUCKET,
  PUBLIC_CATALOG_V2_JSON_BUCKET,
  PUBLIC_CATALOG_V2_SCHEMA_VERSION,
  buildPublicCatalogV2ActivePath,
  buildPublicCatalogV2ChunkPath,
  buildPublicCatalogV2ReleasePath
} from "./public-catalog-v2.paths.js";
import {
  buildVerifiedJsonArtifact,
  stableSerializeJson,
  type VerifiedJsonArtifact
} from "./public-catalog-v2.serializer.js";
import {
  validatePublicCatalogV2Categories,
  validatePublicCatalogV2Chunk,
  validatePublicCatalogV2Index,
  validatePublicCatalogV2Manifest,
  validatePublicCatalogV2Popular
} from "./public-catalog-v2.schemas.js";

const DEFAULT_CHUNK_SIZE = 100;
const MAX_POPULAR_ITEMS = 20;
const PUBLIC_BASE_URL = "https://storage.web00.invalid/storage/v1/object/public";
const CATALOG_ORDER = "sortOrder-createdAtDesc-slug-id";
const EMPTY_LQIP = "data:image/webp;base64,AA==";
const MAX_ACTIVE_POINTER_BYTES = 2 * 1024;
const MAX_CATEGORIES_BYTES = 64 * 1024;
const MAX_CHUNK_BYTES = 512 * 1024;
const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_INITIAL_CLEAN_VISITOR_BYTES = 2 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 96 * 1024;
const MAX_POPULAR_BYTES = 16 * 1024;

export interface BuildPublicCatalogV2ReleaseInput {
  chunkSize?: number;
  generatedAt: Date;
  pages: AsyncIterable<LooseProjectionPage>;
  revision: number;
  settings: PublicCatalogV2Settings;
}

export interface BuiltPublicCatalogV2Release {
  active: {
    path: string;
    revision: number;
  };
  activationInput: {
    manifestPath: string;
    manifestSha256: string;
    revision: number;
  };
  activationOrder: string[];
  artifacts: PublicCatalogV2BuiltArtifact[];
  categories: Record<string, unknown> & { sha256: string };
  chunks: PublicCatalogV2BuiltChunk[];
  generation: {
    inputMode: "keyset-pages";
    maxBufferedRecords: number;
  };
  index: Record<string, unknown> & {
    chunks: Array<{ firstSlug: string; lastSlug: string; path: string }>;
    items: Array<{ slug: string }>;
    itemsCount: number;
    sha256: string;
  };
  manifest: Record<string, unknown> & {
    artifacts: Array<{ kind: string; path: string; sha256: string }>;
    chunks: Array<{ path: string; sha256: string }>;
    chunksCount: number;
    itemsCount: number;
    revision: number;
  };
  metrics: {
    activePointerBytes: number;
    heapDeltaBytes: number;
    indexBytes: number;
    initialCleanVisitorBytes: number;
    manifestBytes: number;
    maxLiveFullRecords: number;
    maxPendingArtifacts: number;
    maxRetainedChunkBytes: number;
    usedOffsetPagination: false;
  };
  popular: Record<string, unknown> & {
    items: Array<{ slug: string }>;
    popularOrder: string[];
    sha256: string;
  };
}

export interface PublicCatalogV2BuiltArtifact {
  byteLength: number;
  bytes: string;
  kind: "categories" | "chunk" | "index" | "manifest" | "popular";
  parsed: Record<string, unknown>;
  path: string;
  sha256: string;
}

export interface PublicCatalogV2BuiltChunk extends PublicCatalogV2BuiltArtifact {
  chunkIndex: number;
  items: Array<{ slug: string }>;
}

type LooseProjectionPage = PublicCatalogV2ProjectionPage | {
  cursor?: unknown;
  items?: unknown[];
  records?: unknown[];
};

interface NormalizedProjectionRecord {
  category: {
    description: string;
    slug: string;
    sortOrder: number;
    title: string;
  };
  createdAt: string;
  deliveryLabel: string;
  demoMode: string;
  demoUrl: string | null;
  featured: boolean;
  features: string[];
  fullDescription: string;
  galleryImages: NormalizedMediaAsset[];
  id: string;
  previewImage: NormalizedMediaAsset | null;
  priceLabel: string;
  publishedAt: string;
  shortDescription: string;
  siteUrl: string | null;
  slug: string;
  sortOrder: number;
  tags: string[];
  title: string;
  views: number;
}

interface NormalizedMediaAsset {
  alt: string;
  assetId: string;
  height: number;
  lqip: string | null;
  sortOrder: number | null;
  sourceSha256: string;
  storagePath: string;
  url: string;
  variants: Array<{ avifUrl: string; webpUrl: string; width: number }>;
  width: number;
}

interface IndexEntry {
  categorySlug: string;
  categoryTitle?: string;
  chunk: number;
  deliveryLabel?: string;
  features?: string[];
  order: number;
  popularOrder: number | null;
  preview: {
    assetId: string;
    height: number;
    lqip: string | null;
    width: number;
  } | null;
  priceLabel?: string;
  shortDescription?: string;
  slug: string;
  tags?: string[];
  title: string;
}

interface PopularCandidate {
  chunk: number;
  createdAt: string;
  featured: boolean;
  id: string;
  slug: string;
  sortOrder: number;
  views: number;
}

interface CategoryAccumulator {
  description: string;
  itemsCount: number;
  slug: string;
  sortOrder: number;
  title: string;
}

export async function buildPublicCatalogV2Release(
  input: BuildPublicCatalogV2ReleaseInput
): Promise<BuiltPublicCatalogV2Release> {
  const revision = readRevision(input.revision);
  const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize !== DEFAULT_CHUNK_SIZE) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_CHUNK_SIZE");
  }
  const generatedAt = input.generatedAt.toISOString();
  const heapBefore = process.memoryUsage().heapUsed;
  const chunks: PublicCatalogV2BuiltChunk[] = [];
  const chunkDescriptors: Array<{
    bytes: number;
    firstSlug: string;
    index: number;
    itemsCount: number;
    lastSlug: string;
    path: string;
    sha256: string;
  }> = [];
  const indexChunkDescriptors: Array<{ firstSlug: string; lastSlug: string; path: string }> = [];
  const indexEntries: IndexEntry[] = [];
  const popularCandidates: PopularCandidate[] = [];
  const categories = new Map<string, CategoryAccumulator>();
  const seenSlugs = new Set<string>();
  const seenIds = new Set<string>();
  let currentChunkItems: Record<string, unknown>[] = [];
  let currentChunkIndexEntries: Array<{ slug: string }> = [];
  let globalIndex = 0;
  let maxBufferedRecords = 0;
  let maxLiveFullRecords = 0;
  let maxRetainedChunkBytes = 0;

  for await (const page of input.pages) {
    const pageRecords = readPageRecords(page);
    maxLiveFullRecords = Math.max(maxLiveFullRecords, pageRecords.length);
    maxBufferedRecords = Math.max(maxBufferedRecords, pageRecords.length + currentChunkItems.length);

    for (const rawRecord of pageRecords) {
      const record = normalizeProjectionRecord(rawRecord);
      if (seenSlugs.has(record.slug) || seenIds.has(record.id)) {
        throw new Error("PUBLIC_CATALOG_V2_DUPLICATE_ITEM");
      }
      seenSlugs.add(record.slug);
      seenIds.add(record.id);

      const order = globalIndex + 1;
      const chunkIndex = Math.floor(globalIndex / chunkSize) + 1;
      const chunkOffset = globalIndex % chunkSize;
      const chunkItem = buildChunkItem(record);

      currentChunkItems.push(chunkItem);
      currentChunkIndexEntries.push({ slug: record.slug });
      indexEntries.push(buildIndexEntry(record, order, chunkIndex));
      popularCandidates.push({
        chunk: chunkIndex,
        createdAt: record.createdAt,
        featured: record.featured,
        id: record.id,
        slug: record.slug,
        sortOrder: record.sortOrder,
        views: record.views
      });
      incrementCategory(categories, record.category);
      globalIndex += 1;

      if (chunkOffset === chunkSize - 1) {
        const chunk = buildChunkArtifact({
          chunkIndex,
          items: currentChunkItems,
          revision
        });
        maxRetainedChunkBytes = Math.max(maxRetainedChunkBytes, chunk.byteLength);
        chunks.push(chunk);
        chunkDescriptors.push(toManifestChunkDescriptor(chunk));
        indexChunkDescriptors.push({
          firstSlug: chunk.items[0]?.slug ?? "",
          lastSlug: chunk.items.at(-1)?.slug ?? "",
          path: chunk.path
        });
        currentChunkItems = [];
        currentChunkIndexEntries = [];
      }
    }
  }

  if (currentChunkItems.length > 0) {
    const chunkIndex = chunks.length + 1;
    const chunk = buildChunkArtifact({
      chunkIndex,
      items: currentChunkItems,
      revision
    });
    maxRetainedChunkBytes = Math.max(maxRetainedChunkBytes, chunk.byteLength);
    chunks.push(chunk);
    chunkDescriptors.push(toManifestChunkDescriptor(chunk));
    indexChunkDescriptors.push({
      firstSlug: chunk.items[0]?.slug ?? "",
      lastSlug: chunk.items.at(-1)?.slug ?? "",
      path: chunk.path
    });
  }

  const popularOrder = buildPopularOrder(popularCandidates);
  const popularOrderBySlug = new Map(popularOrder.map((item, index) => [item.slug, index + 1]));
  const indexPayload = {
    chunks: indexChunkDescriptors,
    items: indexEntries.map((entry) => ({
      ...entry,
      popularOrder: popularOrderBySlug.get(entry.slug) ?? null
    })),
    itemsCount: indexEntries.length,
    revision,
    schemaVersion: PUBLIC_CATALOG_V2_SCHEMA_VERSION
  };
  const indexArtifact = buildArtifact("index", buildPublicCatalogV2ReleasePath(revision, "index"), indexPayload, validatePublicCatalogV2Index);
  const popularPayload = {
    items: popularOrder.map((item, index) => ({
      chunk: item.chunk,
      popularOrder: index + 1,
      slug: item.slug
    })),
    popularOrder: popularOrder.map((item) => item.slug),
    revision,
    schemaVersion: PUBLIC_CATALOG_V2_SCHEMA_VERSION
  };
  const popularArtifact = buildArtifact(
    "popular",
    buildPublicCatalogV2ReleasePath(revision, "popular"),
    popularPayload,
    validatePublicCatalogV2Popular
  );
  const categoriesPayload = {
    categories: [...categories.values()]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.slug.localeCompare(right.slug))
      .map((category) => ({
        description: category.description,
        itemsCount: category.itemsCount,
        slug: category.slug,
        sortOrder: category.sortOrder,
        title: category.title
      })),
    revision,
    schemaVersion: PUBLIC_CATALOG_V2_SCHEMA_VERSION
  };
  const categoriesArtifact = buildArtifact(
    "categories",
    buildPublicCatalogV2ReleasePath(revision, "categories"),
    categoriesPayload,
    validatePublicCatalogV2Categories
  );
  const childArtifacts = [
    ...chunks.map(toManifestArtifactDescriptor),
    toManifestArtifactDescriptor(indexArtifact),
    toManifestArtifactDescriptor(popularArtifact),
    toManifestArtifactDescriptor(categoriesArtifact)
  ];
  const manifestPayload = {
    artifacts: childArtifacts,
    catalogOrder: CATALOG_ORDER,
    categories: {
      count: categoriesPayload.categories.length,
      path: categoriesArtifact.path,
      sha256: categoriesArtifact.sha256
    },
    chunkSize,
    chunks: chunkDescriptors,
    chunksCount: chunks.length,
    generatedAt,
    index: {
      bytes: indexArtifact.byteLength,
      path: indexArtifact.path,
      sha256: indexArtifact.sha256
    },
    itemsCount: indexEntries.length,
    popular: {
      count: popularPayload.items.length,
      path: popularArtifact.path,
      sha256: popularArtifact.sha256
    },
    revision,
    schemaVersion: PUBLIC_CATALOG_V2_SCHEMA_VERSION,
    settings: {
      showDemoInModal: input.settings.showDemoInModal
    },
    uniqueSlugCount: seenSlugs.size
  };
  const manifestArtifact = buildArtifact(
    "manifest",
    buildPublicCatalogV2ReleasePath(revision, "manifest"),
    manifestPayload,
    validatePublicCatalogV2Manifest
  );
  const activePointerBytes = Buffer.byteLength(
    stableSerializeJson({
      activatedAt: generatedAt,
      activeRevision: revision,
      manifestPath: manifestArtifact.path,
      manifestSha256: manifestArtifact.sha256,
      manifestUrl: `${PUBLIC_BASE_URL}/${PUBLIC_CATALOG_V2_JSON_BUCKET}/${manifestArtifact.path}`,
      previousRevision: null,
      schemaVersion: PUBLIC_CATALOG_V2_SCHEMA_VERSION
    }),
    "utf8"
  );
  const firstChunkBytes = chunks[0]?.byteLength ?? 0;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  const artifacts = [
    ...chunks,
    indexArtifact,
    popularArtifact,
    categoriesArtifact,
    manifestArtifact
  ];
  const initialCleanVisitorBytes =
    activePointerBytes +
    manifestArtifact.byteLength +
    indexArtifact.byteLength +
    popularArtifact.byteLength +
    firstChunkBytes;
  assertReleaseByteBudgets({
    activePointerBytes,
    categoriesBytes: categoriesArtifact.byteLength,
    indexBytes: indexArtifact.byteLength,
    initialCleanVisitorBytes,
    manifestBytes: manifestArtifact.byteLength,
    maxChunkBytes: maxRetainedChunkBytes,
    popularBytes: popularArtifact.byteLength
  });

  return {
    active: {
      path: buildPublicCatalogV2ActivePath(),
      revision
    },
    activationInput: {
      manifestPath: manifestArtifact.path,
      manifestSha256: manifestArtifact.sha256,
      revision
    },
    activationOrder: [...artifacts.map((artifact) => artifact.path), buildPublicCatalogV2ActivePath()],
    artifacts,
    categories: {
      ...categoriesArtifact.parsed,
      sha256: categoriesArtifact.sha256
    },
    chunks,
    generation: {
      inputMode: "keyset-pages",
      maxBufferedRecords
    },
    index: {
      ...indexArtifact.parsed,
      sha256: indexArtifact.sha256
    } as BuiltPublicCatalogV2Release["index"],
    manifest: {
      ...manifestArtifact.parsed,
      sha256: manifestArtifact.sha256
    } as unknown as BuiltPublicCatalogV2Release["manifest"],
    metrics: {
      activePointerBytes,
      heapDeltaBytes,
      indexBytes: indexArtifact.byteLength,
      initialCleanVisitorBytes,
      manifestBytes: manifestArtifact.byteLength,
      maxLiveFullRecords,
      maxPendingArtifacts: 2,
      maxRetainedChunkBytes,
      usedOffsetPagination: false
    },
    popular: {
      ...popularArtifact.parsed,
      sha256: popularArtifact.sha256
    } as BuiltPublicCatalogV2Release["popular"]
  };
}

export function assertPublicCatalogV2ReadBackParity(expected: unknown, actual: unknown): void {
  if (stableSerializeJson(expected) !== stableSerializeJson(actual)) {
    throw new Error("Public Catalog V2 read-back parity mismatch.");
  }
}

function readPageRecords(page: LooseProjectionPage): unknown[] {
  const record = page as { items?: unknown; records?: unknown };
  if (Array.isArray(record.records)) {
    return record.records;
  }
  if (Array.isArray(record.items)) {
    return record.items;
  }
  throw new Error("PUBLIC_CATALOG_V2_INVALID_PROJECTION_PAGE");
}

function normalizeProjectionRecord(value: unknown): NormalizedProjectionRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_PROJECTION_RECORD");
  }
  const record = value as Record<string, unknown>;
  const category = readCategory(record.category);
  const slug = readSlug(record.slug);
  const createdAt = readDateString(record.createdAt ?? "2026-08-03T00:00:00.000Z");

  return {
    category,
    createdAt,
    deliveryLabel: readStringWithDefault(record.deliveryLabel, ""),
    demoMode: readStringWithDefault(record.demoMode, "external"),
    demoUrl: readNullableUrl(record.demoUrl),
    featured: record.featured === true,
    features: readStringArrayWithDefault(record.features),
    fullDescription: readStringWithDefault(record.fullDescription, ""),
    galleryImages: normalizeGallery(record.galleryImages),
    id: readStringWithDefault(record.id, slug),
    previewImage: normalizeOptionalMediaAsset(record.previewImage, "preview", null),
    priceLabel: readStringWithDefault(record.priceLabel, ""),
    publishedAt: readDateString(record.publishedAt ?? createdAt),
    shortDescription: readStringWithDefault(record.shortDescription, ""),
    siteUrl: readNullableUrl(record.siteUrl),
    slug,
    sortOrder: readInteger(record.sortOrder),
    tags: readStringArrayWithDefault(record.tags),
    title: readStringWithDefault(record.title, slug),
    views: typeof record.views === "number" && Number.isFinite(record.views) ? record.views : 0
  };
}

function buildChunkItem(record: NormalizedProjectionRecord): Record<string, unknown> {
  return {
    category: {
      slug: record.category.slug,
      title: record.category.title
    },
    deliveryLabel: record.deliveryLabel,
    demoMode: record.demoMode,
    demoUrl: record.demoUrl,
    features: record.features,
    fullDescription: record.fullDescription,
    galleryImages: record.galleryImages.map((image) => ({
      alt: image.alt,
      assetId: image.assetId,
      height: image.height,
      lqip: image.lqip,
      sortOrder: image.sortOrder,
      sourceSha256: image.sourceSha256,
      url: image.url,
      variants: image.variants,
      width: image.width
    })),
    previewImage:
      record.previewImage === null
        ? null
        : {
            assetId: record.previewImage.assetId,
            height: record.previewImage.height,
            lqip: record.previewImage.lqip,
            sourceSha256: record.previewImage.sourceSha256,
            url: record.previewImage.url,
            variants: record.previewImage.variants,
            width: record.previewImage.width
          },
    priceLabel: record.priceLabel,
    publishedAt: record.publishedAt,
    shortDescription: record.shortDescription,
    siteUrl: record.siteUrl,
    slug: record.slug,
    tags: record.tags,
    title: record.title
  };
}

function buildIndexEntry(record: NormalizedProjectionRecord, order: number, chunk: number): IndexEntry {
  const entry: IndexEntry = {
    categorySlug: record.category.slug,
    chunk,
    order,
    popularOrder: null,
    preview:
      record.previewImage === null
        ? null
        : {
            assetId: record.previewImage.assetId,
            height: record.previewImage.height,
            lqip: record.previewImage.lqip,
            width: record.previewImage.width
          },
    slug: record.slug,
    title: record.title
  };
  if (record.category.title !== "") {
    entry.categoryTitle = record.category.title;
  }
  if (record.deliveryLabel !== "") {
    entry.deliveryLabel = record.deliveryLabel;
  }
  if (record.features.length > 0) {
    entry.features = record.features;
  }
  if (record.priceLabel !== "") {
    entry.priceLabel = record.priceLabel;
  }
  if (record.shortDescription !== "") {
    entry.shortDescription = record.shortDescription;
  }
  if (record.tags.length > 0) {
    entry.tags = record.tags;
  }
  return entry;
}

function buildChunkArtifact(input: {
  chunkIndex: number;
  items: Record<string, unknown>[];
  revision: number;
}): PublicCatalogV2BuiltChunk {
  const path = buildPublicCatalogV2ChunkPath(input.revision, input.chunkIndex);
  const artifact = buildArtifact(
    "chunk",
    path,
    {
      chunkIndex: input.chunkIndex,
      items: input.items,
      itemsCount: input.items.length,
      revision: input.revision,
      schemaVersion: PUBLIC_CATALOG_V2_SCHEMA_VERSION
    },
    validatePublicCatalogV2Chunk
  );
  return {
    ...artifact,
    chunkIndex: input.chunkIndex,
    items: input.items.map((item) => ({ slug: String(item.slug) }))
  };
}

function buildArtifact(
  kind: PublicCatalogV2BuiltArtifact["kind"],
  path: string,
  payload: Record<string, unknown>,
  validate: (parsed: unknown) => Record<string, unknown>
): PublicCatalogV2BuiltArtifact {
  const artifact = buildVerifiedJsonArtifact({
    expectedRevision: kind === "manifest" ? Number(payload.revision) : Number(payload.revision),
    kind,
    payload,
    validate
  }) as VerifiedJsonArtifact<Record<string, unknown>>;
  return {
    byteLength: artifact.byteLength,
    bytes: artifact.bytes,
    kind,
    parsed: artifact.parsed,
    path,
    sha256: artifact.sha256
  };
}

function toManifestChunkDescriptor(chunk: PublicCatalogV2BuiltChunk): {
  bytes: number;
  firstSlug: string;
  index: number;
  itemsCount: number;
  lastSlug: string;
  path: string;
  sha256: string;
} {
  return {
    bytes: chunk.byteLength,
    firstSlug: chunk.items[0]?.slug ?? "",
    index: chunk.chunkIndex,
    itemsCount: chunk.items.length,
    lastSlug: chunk.items.at(-1)?.slug ?? "",
    path: chunk.path,
    sha256: chunk.sha256
  };
}

function toManifestArtifactDescriptor(artifact: PublicCatalogV2BuiltArtifact): {
  byteLength: number;
  bytes: number;
  itemsCount?: number;
  kind: string;
  path: string;
  sha256: string;
} {
  const parsed = artifact.parsed as { itemsCount?: unknown };
  const descriptor: {
    byteLength: number;
    bytes: number;
    itemsCount?: number;
    kind: string;
    path: string;
    sha256: string;
  } = {
    byteLength: artifact.byteLength,
    bytes: artifact.byteLength,
    kind: artifact.kind,
    path: artifact.path,
    sha256: artifact.sha256
  };
  if (typeof parsed.itemsCount === "number") {
    descriptor.itemsCount = parsed.itemsCount;
  }
  return descriptor;
}

function assertReleaseByteBudgets(input: {
  activePointerBytes: number;
  categoriesBytes: number;
  indexBytes: number;
  initialCleanVisitorBytes: number;
  manifestBytes: number;
  maxChunkBytes: number;
  popularBytes: number;
}): void {
  if (
    input.activePointerBytes > MAX_ACTIVE_POINTER_BYTES ||
    input.categoriesBytes > MAX_CATEGORIES_BYTES ||
    input.indexBytes > MAX_INDEX_BYTES ||
    input.initialCleanVisitorBytes > MAX_INITIAL_CLEAN_VISITOR_BYTES ||
    input.manifestBytes > MAX_MANIFEST_BYTES ||
    input.maxChunkBytes > MAX_CHUNK_BYTES ||
    input.popularBytes > MAX_POPULAR_BYTES
  ) {
    throw new Error("PUBLIC_CATALOG_V2_ARTIFACT_BYTES_EXCEEDED");
  }
}

function buildPopularOrder(candidates: PopularCandidate[]): PopularCandidate[] {
  return [...candidates]
    .sort((left, right) => {
      if (left.featured !== right.featured) {
        return left.featured ? -1 : 1;
      }
      if (left.views !== right.views) {
        return right.views - left.views;
      }
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      if (left.createdAt !== right.createdAt) {
        return right.createdAt.localeCompare(left.createdAt);
      }
      const slugCompare = left.slug.localeCompare(right.slug);
      return slugCompare === 0 ? left.id.localeCompare(right.id) : slugCompare;
    })
    .slice(0, MAX_POPULAR_ITEMS);
}

function incrementCategory(categories: Map<string, CategoryAccumulator>, category: NormalizedProjectionRecord["category"]): void {
  const existing = categories.get(category.slug);
  if (existing === undefined) {
    categories.set(category.slug, {
      description: category.description,
      itemsCount: 1,
      slug: category.slug,
      sortOrder: category.sortOrder,
      title: category.title
    });
    return;
  }
  existing.itemsCount += 1;
}

function readCategory(value: unknown): NormalizedProjectionRecord["category"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_CATEGORY");
  }
  const category = value as Record<string, unknown>;
  return {
    description: readStringWithDefault(category.description, ""),
    slug: readSlug(category.slug),
    sortOrder: typeof category.sortOrder === "number" && Number.isSafeInteger(category.sortOrder) ? category.sortOrder : 0,
    title: readStringWithDefault(category.title, readSlug(category.slug))
  };
}

function normalizeGallery(value: unknown): NormalizedMediaAsset[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_MEDIA");
  }
  const gallery = value.map((item) => normalizeRequiredMediaAsset(item, "gallery", null));
  gallery.sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.assetId.localeCompare(right.assetId));
  gallery.forEach((item, index) => {
    if (item.sortOrder !== index) {
      throw new Error("PUBLIC_CATALOG_V2_INVALID_MEDIA");
    }
  });
  return gallery;
}

function normalizeOptionalMediaAsset(
  value: unknown,
  slot: "gallery" | "preview",
  sortOrder: number | null
): NormalizedMediaAsset | null {
  if (value === null || value === undefined) {
    return null;
  }
  return normalizeRequiredMediaAsset(value, slot, sortOrder);
}

function normalizeRequiredMediaAsset(
  value: unknown,
  slot: "gallery" | "preview",
  sortOrder: number | null
): NormalizedMediaAsset {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_MEDIA");
  }
  const media = value as Partial<PublicCatalogV2MediaAsset> & Record<string, unknown>;
  const assetId = readStringWithDefault(media.assetId, "");
  const storagePath = readStoragePath(media.storagePath);
  const sourceSha256 = readSha256(media.sourceSha256);
  const width = readPositiveInteger(media.width);
  const height = readPositiveInteger(media.height);
  const mediaSortOrder = sortOrder ?? (typeof media.sortOrder === "number" ? media.sortOrder : null);

  return {
    alt: readStringWithDefault(media.alt, ""),
    assetId,
    height,
    lqip: readLqip(media.lqip),
    sortOrder: slot === "gallery" ? mediaSortOrder : null,
    sourceSha256,
    storagePath,
    url: readStringWithDefault(media.url, buildPublicImageUrl(storagePath)),
    variants: normalizeVariants(media.variants),
    width
  };
}

function normalizeVariants(value: unknown): Array<{ avifUrl: string; webpUrl: string; width: number }> {
  if (!Array.isArray(value)) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_MEDIA");
  }
  const byWidth = new Map<number, { avifUrl?: string; webpUrl?: string; width: number }>();
  for (const variant of value) {
    if (typeof variant !== "object" || variant === null || Array.isArray(variant)) {
      throw new Error("PUBLIC_CATALOG_V2_INVALID_MEDIA");
    }
    const record = variant as Record<string, unknown>;
    const width = readPositiveInteger(record.width);
    const entry = byWidth.get(width) ?? { width };
    if (typeof record.webpUrl === "string") {
      entry.webpUrl = record.webpUrl;
    }
    if (typeof record.avifUrl === "string") {
      entry.avifUrl = record.avifUrl;
    }
    if (record.format === "webp" && typeof record.path === "string") {
      entry.webpUrl = buildPublicImageUrl(readStoragePath(record.path));
    }
    if (record.format === "avif" && typeof record.path === "string") {
      entry.avifUrl = buildPublicImageUrl(readStoragePath(record.path));
    }
    byWidth.set(width, entry);
  }
  return [...byWidth.values()]
    .sort((left, right) => left.width - right.width)
    .map((entry) => {
      if (entry.avifUrl === undefined || entry.webpUrl === undefined) {
        throw new Error("PUBLIC_CATALOG_V2_INVALID_MEDIA");
      }
      return {
        avifUrl: entry.avifUrl,
        webpUrl: entry.webpUrl,
        width: entry.width
      };
    });
}

function readStoragePath(value: unknown): string {
  const path = readStringWithDefault(value, "");
  if (
    path.length === 0 ||
    path.includes("..") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("://") ||
    path.startsWith("/")
  ) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_MEDIA");
  }
  return path;
}

function buildPublicImageUrl(path: string): string {
  return `${PUBLIC_BASE_URL}/${PUBLIC_CATALOG_V2_IMAGE_BUCKET}/${path}`;
}

function readRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_REVISION");
  }
  return value;
}

function readInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_INTEGER");
  }
  return value;
}

function readPositiveInteger(value: unknown): number {
  const integer = readInteger(value);
  if (integer < 1) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_INTEGER");
  }
  return integer;
}

function readSlug(value: unknown): string {
  const slug = readStringWithDefault(value, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_SLUG");
  }
  return slug;
}

function readStringWithDefault(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readStringArrayWithDefault(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_STRING_ARRAY");
  }
  return value;
}

function readDateString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  throw new Error("PUBLIC_CATALOG_V2_INVALID_DATE");
}

function readNullableUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const url = readStringWithDefault(value, "");
  const parsed = new URL(url);
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_URL");
  }
  return url;
}

function readSha256(value: unknown): string {
  const sha256 = readStringWithDefault(value, "");
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_SHA256");
  }
  return sha256;
}

function readLqip(value: unknown): string | null {
  if (value === undefined || value === null) {
    return EMPTY_LQIP;
  }
  const lqip = readStringWithDefault(value, "");
  if (!/^data:image\/(?:avif|jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(lqip)) {
    throw new Error("PUBLIC_CATALOG_V2_INVALID_LQIP");
  }
  return lqip;
}
