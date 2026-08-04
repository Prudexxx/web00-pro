import { describe, expect, it } from "vitest";
import { createSyntheticTenThousandProjectionPages } from "./helpers/public-catalog-v2-synthetic-fixtures.js";

const builderModulePath = "../src/modules/public-catalog-v2/public-catalog-v2.builder.js";

async function importBuilderModule(): Promise<Record<string, unknown>> {
  try {
    return await import(builderModulePath);
  } catch (error) {
    throw new Error(
      "Expected Public Catalog V2 builder module to exist; OPV2-4 is RED until the bounded 10000-card builder is implemented.",
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

describe("Public Catalog V2 10000-card release budget", () => {
  it("builds 100 chunks for 10000 synthetic cards from keyset pages within memory and byte budgets", async () => {
    const module = await importBuilderModule();
    const buildPublicCatalogV2Release = readFunction(module, "buildPublicCatalogV2Release");
    const pages = createSyntheticTenThousandProjectionPages(100);

    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages: pages.pages,
      revision: 10,
      settings: { showDemoInModal: true }
    }) as {
      artifacts: Array<{ kind: string; parsed: { items?: Array<{ galleryImages?: unknown[] }> } }>;
      index: { items: Array<{ slug: string }>; itemsCount: number };
      manifest: { chunksCount: number; itemsCount: number };
      metrics: {
        activePointerBytes: number;
        heapDeltaBytes: number;
        indexBytes: number;
        initialCleanVisitorBytes: number;
        manifestBytes: number;
        maxLiveFullRecords: number;
        maxPendingArtifacts: number;
        maxRetainedChunkBytes: number;
        usedOffsetPagination: boolean;
      };
    };

    expect(release.manifest.itemsCount).toBe(10_000);
    expect(release.artifacts.find((artifact) => artifact.kind === "chunk")?.parsed.items?.[0]?.galleryImages).toHaveLength(4);
    expect(release.manifest.chunksCount).toBe(100);
    expect(release.index.itemsCount).toBe(10_000);
    expect(new Set(release.index.items.map((item) => item.slug)).size).toBe(10_000);
    expect(pages.maxLiveRecordCount()).toBeLessThanOrEqual(100);
    expect(release.metrics.maxRetainedChunkBytes).toBeLessThanOrEqual(512 * 1024);
    expect(release.metrics.maxLiveFullRecords).toBeLessThanOrEqual(125);
    expect(release.metrics.maxPendingArtifacts).toBeLessThanOrEqual(2);
    expect(release.metrics.heapDeltaBytes).toBeLessThanOrEqual(256 * 1024 * 1024);
    expect(release.metrics.manifestBytes).toBeLessThanOrEqual(96 * 1024);
    expect(release.metrics.indexBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(release.metrics.activePointerBytes).toBeLessThanOrEqual(2 * 1024);
    expect(release.metrics.initialCleanVisitorBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(release.metrics.usedOffsetPagination).toBe(false);
  }, 30_000);
});
