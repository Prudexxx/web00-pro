export interface SyntheticV2ProjectionRecord {
  category?: { slug: string; title: string };
  createdAt?: string;
  featured?: boolean;
  galleryImages?: SyntheticV2MediaAsset[];
  id?: string;
  previewImage?: SyntheticV2MediaAsset | null;
  slug: string;
  sortOrder: number;
  title?: string;
  views?: number;
}

export interface SyntheticV2MediaAsset {
  assetId: string;
  height: number;
  sourceSha256: string;
  sortOrder?: number;
  storagePath: string;
  variants: Array<{ format: "avif" | "webp"; path: string; width: number }>;
  width: number;
}

export async function* syntheticProjectionPages(
  records: SyntheticV2ProjectionRecord[],
  pageSize = 100
): AsyncGenerator<{ records: SyntheticV2ProjectionRecord[] }> {
  for (let index = 0; index < records.length; index += pageSize) {
    yield {
      records: records.slice(index, index + pageSize).map((record, recordIndex) => ({
        category: { slug: "synthetic-category", title: "Synthetic category" },
        createdAt: "2026-08-03T00:00:00.000Z",
        featured: false,
        galleryImages: [],
        id: `synthetic-${index + recordIndex}`,
        previewImage: null,
        title: `Synthetic ${record.slug}`,
        views: 0,
        ...record
      }))
    };
  }
}

export function syntheticPreviewAsset(assetId = "preview-synthetic-a"): SyntheticV2MediaAsset {
  return {
    assetId,
    height: 900,
    sourceSha256: "a".repeat(64),
    storagePath: `sites/synthetic/preview/${assetId}/original.png`,
    variants: [
      { format: "webp", path: `sites/synthetic/preview/${assetId}/1600.webp`, width: 1600 },
      { format: "avif", path: `sites/synthetic/preview/${assetId}/1600.avif`, width: 1600 }
    ],
    width: 1600
  };
}

export function syntheticGalleryAssets(assetIds: string[]): SyntheticV2MediaAsset[] {
  return assetIds.map((assetId, index) => ({
    assetId,
    height: 900,
    sortOrder: index,
    sourceSha256: (index + 1).toString(16).repeat(64).slice(0, 64),
    storagePath: `sites/synthetic/gallery/${assetId}/original.png`,
    variants: [
      { format: "webp", path: `sites/synthetic/gallery/${assetId}/800.webp`, width: 800 },
      { format: "avif", path: `sites/synthetic/gallery/${assetId}/800.avif`, width: 800 }
    ],
    width: 1200
  }));
}

export function syntheticTenThousandRecords(): SyntheticV2ProjectionRecord[] {
  return Array.from({ length: 10_000 }, (_, index) => ({
    id: `synthetic-fixture-${String(index + 1).padStart(5, "0")}`,
    slug: `synthetic-fixture-${String(index + 1).padStart(5, "0")}`,
    sortOrder: index + 1
  }));
}

export function createSyntheticTenThousandProjectionPages(pageSize = 100): {
  maxLiveRecordCount: () => number;
  pages: AsyncGenerator<{
    cursor: { createdAt: string; id: string; sortOrder: number } | null;
    records: SyntheticV2ProjectionRecord[];
  }>;
  total: number;
} {
  let maxLiveRecordCount = 0;

  async function* pages(): AsyncGenerator<{
    cursor: { createdAt: string; id: string; sortOrder: number } | null;
    records: SyntheticV2ProjectionRecord[];
  }> {
    for (let offset = 0; offset < 10_000; offset += pageSize) {
      const records = Array.from({ length: Math.min(pageSize, 10_000 - offset) }, (_unused, index) => {
        const ordinal = offset + index + 1;
        return {
          id: `synthetic-fixture-${String(ordinal).padStart(5, "0")}`,
          slug: `synthetic-fixture-${String(ordinal).padStart(5, "0")}`,
          sortOrder: ordinal
        };
      });
      maxLiveRecordCount = Math.max(maxLiveRecordCount, records.length);
      yield {
        cursor: records.length === 0
          ? null
          : {
              createdAt: "2026-08-03T00:00:00.000Z",
              id: records[records.length - 1]!.id ?? "",
              sortOrder: records[records.length - 1]!.sortOrder
            },
        records
      };
    }
  }

  return {
    maxLiveRecordCount: () => maxLiveRecordCount,
    pages: pages(),
    total: 10_000
  };
}
