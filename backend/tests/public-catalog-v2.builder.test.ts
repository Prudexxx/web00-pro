import { describe, expect, it } from "vitest";
import {
  createPublicCatalogSnapshot
} from "../src/modules/public-catalog/public-catalog.snapshot.js";
import { mapSiteToPublicCatalogItem } from "../src/modules/public-catalog/public-catalog.mapper.js";
import type { PublicSiteRecord } from "../src/modules/public-catalog/public-catalog.types.js";
import {
  createSyntheticTenThousandProjectionPages,
  syntheticProjectionPages
} from "./helpers/public-catalog-v2-synthetic-fixtures.js";

const builderModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.builder.js";

async function importBuilderModule(): Promise<Record<string, unknown>> {
  try {
    return await import(builderModulePath);
  } catch (error) {
    throw new Error(
      "Expected Public Catalog V2 builder module to exist; OPV2-1 is RED until sharded release building is implemented.",
      { cause: error }
    );
  }
}

function readFunction(module: Record<string, unknown>, name: string): (...args: unknown[]) => unknown {
  const value = module[name];
  if (typeof value !== "function") {
    throw new Error(`Expected Public Catalog V2 builder export ${name} to be a function.`);
  }
  return value as (...args: unknown[]) => unknown;
}

const baseRecord = {
  category: { slug: "synthetic-category", title: "Synthetic category" },
  deliveryLabel: "7 days",
  demoMode: "external",
  demoUrl: "https://demo.example.test/synthetic",
  developmentDays: 7,
  featured: false,
  features: ["Synthetic"],
  fullDescription: "Synthetic long description",
  galleryImages: [],
  id: "00000000-0000-4000-8000-000000000001",
  previewImageUrl: "assets/img/previews/synthetic.png",
  previewType: "image",
  priceAmountCents: 100000,
  priceLabel: "from 1000",
  publishedAt: new Date("2026-08-03T00:00:00.000Z"),
  shortDescription: "Synthetic short description",
  siteUrl: "https://example.test/synthetic",
  slug: "synthetic",
  tags: ["synthetic"],
  title: "Synthetic"
} satisfies PublicSiteRecord;

describe("Public Catalog V2 builder", () => {
  it("requires DB catalog order and fails on the current V1 slug-sort behavior", () => {
    const snapshot = createPublicCatalogSnapshot({
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      items: [
        mapSiteToPublicCatalogItem({ ...baseRecord, id: "00000000-0000-4000-8000-0000000000aa", slug: "z-site" }),
        mapSiteToPublicCatalogItem({ ...baseRecord, id: "00000000-0000-4000-8000-0000000000bb", slug: "a-site" })
      ],
      revision: 1,
      settings: { showDemoInModal: true }
    });

    expect(snapshot.items.map((item) => item.slug)).toEqual(["z-site", "a-site"]);
  });

  it("preserves DB catalog order across nonalphabetical slugs in the V2 release index", async () => {
    const module = await importBuilderModule();
    const buildPublicCatalogV2Release = readFunction(module, "buildPublicCatalogV2Release");

    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: syntheticProjectionPages([
        { slug: "z-site", sortOrder: 1 },
        { slug: "a-site", sortOrder: 2 }
      ]),
      revision: 1,
      settings: { showDemoInModal: true }
    }) as { index: { items: Array<{ slug: string }> } };

    expect(release.index.items.map((item) => item.slug)).toEqual(["z-site", "a-site"]);
  });

  it("emits authoritative popular order separately from catalog order", async () => {
    const module = await importBuilderModule();
    const buildPublicCatalogV2Release = readFunction(module, "buildPublicCatalogV2Release");

    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: syntheticProjectionPages([
        { createdAt: "2026-08-03T10:00:00.000Z", featured: false, id: "2", slug: "catalog-first", sortOrder: 1, views: 1 },
        { createdAt: "2026-08-03T09:00:00.000Z", featured: true, id: "1", slug: "popular-first", sortOrder: 2, views: 100 }
      ]),
      revision: 1,
      settings: { showDemoInModal: true }
    }) as { index: { items: Array<{ slug: string }> }; popular: { items: Array<{ slug: string }>; popularOrder: string[] } };

    expect(release.index.items.map((item) => item.slug)).toEqual(["catalog-first", "popular-first"]);
    expect(release.popular.items.map((item) => item.slug)).toEqual(["popular-first", "catalog-first"]);
    expect(release.popular.popularOrder).toEqual(["popular-first", "catalog-first"]);
  });

  it("shards 10000 synthetic cards from keyset pages with bounded buffering and pointer activation last", async () => {
    const module = await importBuilderModule();
    const buildPublicCatalogV2Release = readFunction(module, "buildPublicCatalogV2Release");
    const pagedProjection = createSyntheticTenThousandProjectionPages(100);

    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: pagedProjection.pages,
      revision: 42,
      settings: { showDemoInModal: true }
    }) as {
      active: { revision: number };
      activationOrder: string[];
      chunks: Array<{ items: Array<{ slug: string }>; path: string; sha256: string }>;
      generation: { inputMode: "keyset-pages"; maxBufferedRecords: number };
      index: { chunks: Array<{ firstSlug: string; lastSlug: string; path: string }>; itemsCount: number; sha256: string };
      manifest: {
        artifacts: Array<{ kind: string; path: string; sha256: string }>;
        chunks: Array<{ path: string; sha256: string }>;
        itemsCount: number;
        revision: number;
      };
      popular: { items: Array<{ slug: string }>; sha256: string };
      categories: { sha256: string };
    };

    const slugs = release.chunks.flatMap((chunk) => chunk.items.map((item) => item.slug));
    expect(release.manifest.revision).toBe(42);
    expect(release.active.revision).toBe(42);
    expect(release.index.itemsCount).toBe(10_000);
    expect(release.manifest.itemsCount).toBe(10_000);
    expect(release.chunks).toHaveLength(100);
    expect(new Set(slugs).size).toBe(10_000);
    expect(slugs).toHaveLength(10_000);
    expect(pagedProjection.maxLiveRecordCount()).toBeLessThanOrEqual(100);
    expect(release.generation).toMatchObject({
      inputMode: "keyset-pages",
      maxBufferedRecords: expect.any(Number)
    });
    expect(release.generation.maxBufferedRecords).toBeLessThanOrEqual(200);
    expect(release.manifest.artifacts.map((artifact) => artifact.kind)).toEqual(expect.arrayContaining([
      "index",
      "popular",
      "categories",
      "chunk"
    ]));
    expect(release.manifest.artifacts.filter((artifact) => artifact.kind === "chunk")).toHaveLength(100);
    expect(release.index.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(release.popular.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(release.categories.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(release.manifest.chunks.every((chunk) => /^[a-f0-9]{64}$/.test(chunk.sha256))).toBe(true);
    expect(release.popular.items.map((item) => item.slug)).not.toEqual(slugs.slice(0, 3));
    expect(release.chunks[0]?.path).toBe("public-catalog/v2/releases/revision-42/chunks/chunk-000001.json");
    expect(release.index.chunks[0]).toEqual({
      firstSlug: "synthetic-fixture-00001",
      lastSlug: "synthetic-fixture-00100",
      path: "public-catalog/v2/releases/revision-42/chunks/chunk-000001.json"
    });
    expect(release.activationOrder.at(-1)).toBe("public-catalog/v2/active.json");
  });
});
