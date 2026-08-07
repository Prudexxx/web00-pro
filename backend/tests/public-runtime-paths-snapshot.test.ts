import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_RUNTIME_MANIFEST_PATH,
  createPublicRuntimePathBuilder
} from "../src/modules/public-catalog/public-runtime-storage.js";
import {
  buildPublicCatalogManifest,
  buildPublicCatalogSnapshot,
  validatePublicCatalogManifest,
  validatePublicCatalogSnapshot
} from "../src/modules/public-catalog/public-catalog.snapshot.js";
import type { PublicSiteDetail } from "../src/modules/public-catalog/public-catalog.types.js";

const generatedAt = new Date("2026-08-07T12:00:00.000Z");

function item(overrides: Partial<PublicSiteDetail> = {}): PublicSiteDetail {
  return {
    category: { slug: "goods", title: "Goods" },
    deliveryLabel: null,
    demoMode: null,
    demoUrl: "https://example.test/demo",
    developmentDays: null,
    featured: false,
    features: ["Fast"],
    fullDescription: "Full",
    galleryImages: [],
    previewImage: null,
    previewImageUrl: "https://example.test/preview.webp",
    previewType: "image",
    priceAmountCents: null,
    priceLabel: null,
    publishedAt: "2026-08-07T11:00:00.000Z",
    shortDescription: "Short",
    siteUrl: "https://example.test/site",
    slug: "site-one",
    tags: ["tag"],
    title: "Site One",
    ...overrides
  };
}

describe("public runtime paths and catalog snapshot", () => {
  it("builds prefixed canonical manifest and immutable snapshot paths", async () => {
    const builder = createPublicRuntimePathBuilder({
      prefix: "canary/shadow",
      publicBaseUrl: "https://web00-public-runtime.s3-website.cloud.ru"
    });
    const snapshot = await buildPublicCatalogSnapshot({
      generatedAt,
      items: [item()],
      revision: 12,
      settings: { showDemoInModal: false }
    });

    expect(builder.manifestPath()).toBe("canary/shadow/catalog/v1/manifest.json");
    expect(builder.snapshotPath(snapshot.snapshot.revision, snapshot.sha256)).toBe(
      `canary/shadow/catalog/v1/releases/revision-12-${snapshot.sha256}.json`
    );
    expect(builder.publicUrl(builder.manifestPath())).toBe(
      "https://web00-public-runtime.s3-website.cloud.ru/canary/shadow/catalog/v1/manifest.json"
    );
  });

  it("rejects traversal, encoded traversal, absolute URLs, query, fragment, and backslash escapes", () => {
    for (const prefix of [
      "../shadow",
      "shadow/%2e%2e/prod",
      "https://evil.test/catalog",
      "shadow?x=1",
      "shadow#x",
      "shadow\\escape",
      "//shadow"
    ]) {
      expect(() =>
        createPublicRuntimePathBuilder({
          prefix,
          publicBaseUrl: "https://web00-public-runtime.s3-website.cloud.ru"
        })
      ).toThrow(/path|prefix|runtime/i);
    }
  });

  it("uses the unprefixed canonical manifest path by default", () => {
    const builder = createPublicRuntimePathBuilder({
      publicBaseUrl: "https://web00-public-runtime.s3-website.cloud.ru"
    });

    expect(PUBLIC_RUNTIME_MANIFEST_PATH).toBe("catalog/v1/manifest.json");
    expect(builder.manifestPath()).toBe("catalog/v1/manifest.json");
  });

  it("includes both revision and SHA-256 in immutable snapshot paths", async () => {
    const builder = createPublicRuntimePathBuilder({
      publicBaseUrl: "https://web00-public-runtime.s3-website.cloud.ru"
    });
    const snapshot = await buildPublicCatalogSnapshot({
      generatedAt,
      items: [item()],
      revision: 3,
      settings: { showDemoInModal: false }
    });

    expect(builder.snapshotPath(3, snapshot.sha256)).toBe(
      `catalog/v1/releases/revision-3-${snapshot.sha256}.json`
    );
  });

  it("builds deterministic newline-terminated bytes and exact SHA-256", async () => {
    const input = {
      generatedAt,
      items: [item({ slug: "stable-site" })],
      revision: 4,
      settings: { showDemoInModal: true }
    };

    const first = await buildPublicCatalogSnapshot(input);
    const second = await buildPublicCatalogSnapshot({
      ...input,
      items: [{ ...input.items[0]! }]
    });
    const exactSha = createHash("sha256").update(first.bytes).digest("hex");

    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.bytes.toString("utf8").endsWith("\n")).toBe(true);
    expect(first.sha256).toBe(exactSha);
    expect(first.snapshot).toMatchObject({
      itemsCount: 1,
      revision: 4,
      schemaVersion: 1,
      settings: { showDemoInModal: true }
    });
  });

  it("rejects item count mismatches, duplicate slugs, malformed schema, >1000 items, and >2MiB bytes", async () => {
    const valid = await buildPublicCatalogSnapshot({
      generatedAt,
      items: [item()],
      revision: 1,
      settings: { showDemoInModal: false }
    });

    expect(() =>
      validatePublicCatalogSnapshot({
        ...valid.snapshot,
        itemsCount: 2
      })
    ).toThrow(/itemsCount/i);
    await expect(
      buildPublicCatalogSnapshot({
        generatedAt,
        items: [item({ slug: "duplicate" }), item({ slug: "duplicate" })],
        revision: 1,
        settings: { showDemoInModal: false }
      })
    ).rejects.toThrow(/duplicate/i);
    expect(() =>
      validatePublicCatalogSnapshot({
        ...valid.snapshot,
        schemaVersion: 2
      })
    ).toThrow(/schema/i);
    await expect(
      buildPublicCatalogSnapshot({
        generatedAt,
        items: Array.from({ length: 1001 }, (_, index) => item({ slug: `site-${index}` })),
        revision: 1,
        settings: { showDemoInModal: false }
      })
    ).rejects.toThrow(/items/i);
    await expect(
      buildPublicCatalogSnapshot({
        byteLimit: 128,
        generatedAt,
        items: [item()],
        revision: 1,
        settings: { showDemoInModal: false }
      })
    ).rejects.toThrow(/2MiB|bytes|limit/i);
  });

  it("validates manifests against revision, checksum, path, HTTPS URL, and count invariants", async () => {
    const builder = createPublicRuntimePathBuilder({
      publicBaseUrl: "https://web00-public-runtime.s3-website.cloud.ru"
    });
    const snapshot = await buildPublicCatalogSnapshot({
      generatedAt,
      items: [item()],
      revision: 9,
      settings: { showDemoInModal: false }
    });
    const snapshotPath = builder.snapshotPath(snapshot.snapshot.revision, snapshot.sha256);
    const manifest = buildPublicCatalogManifest({
      generatedAt,
      itemsCount: snapshot.snapshot.itemsCount,
      revision: snapshot.snapshot.revision,
      sha256: snapshot.sha256,
      snapshotPath,
      snapshotUrl: builder.publicUrl(snapshotPath)
    });

    expect(validatePublicCatalogManifest(manifest)).toEqual(manifest);
    expect(() =>
      validatePublicCatalogManifest({
        ...manifest,
        snapshotPath: "catalog/v1/releases/revision-9-deadbeef.json"
      })
    ).toThrow(/snapshotPath/i);
    expect(() =>
      validatePublicCatalogManifest({
        ...manifest,
        snapshotUrl: `${manifest.snapshotUrl}?token=not-allowed`
      })
    ).toThrow(/snapshotUrl/i);
    expect(() =>
      validatePublicCatalogManifest({
        ...manifest,
        sha256: "ABC"
      })
    ).toThrow(/sha256/i);
  });
});
