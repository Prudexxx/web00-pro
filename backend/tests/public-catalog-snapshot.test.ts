import { describe, expect, it } from "vitest";
import {
  buildPublicCatalogManifest,
  buildPublicCatalogSnapshot,
  validatePublicCatalogManifest,
  validatePublicCatalogSnapshot
} from "../src/modules/public-catalog/public-catalog.snapshot.js";
import { mapSiteToPublicCatalogItem } from "../src/modules/public-catalog/public-catalog.mapper.js";
import {
  preparePublicCatalogSnapshotCandidate
} from "../src/modules/public-catalog/public-catalog-snapshot-preparation.js";
import type { PublicSiteRecord } from "../src/modules/public-catalog/public-catalog.types.js";

const siteRecord = {
  category: { slug: "goods", title: "Товары" },
  deliveryLabel: "7 дней",
  demoMode: "external",
  demoUrl: "https://prudexxx.github.io/web00-pro/demo.html",
  developmentDays: 7,
  featured: true,
  features: ["Fast"],
  fullDescription: "Full",
  galleryImages: [],
  id: "3c205371-b407-4d27-8e5c-0dd2a3be8092",
  previewImageUrl: "assets/img/previews/example.png",
  previewType: "image",
  priceAmountCents: 100000,
  priceLabel: "от 10 000 ₽",
  publishedAt: new Date("2026-07-24T00:00:00.000Z"),
  shortDescription: "Short",
  siteUrl: "https://example.com",
  slug: "example",
  tags: ["tag"],
  title: "Example"
} satisfies PublicSiteRecord;

describe("public catalog snapshot", () => {
  it("uses the canonical public mapper for snapshot items", () => {
    expect(mapSiteToPublicCatalogItem(siteRecord)).toEqual({
      category: { slug: "goods", title: "Товары" },
      deliveryLabel: "7 дней",
      demoMode: "external",
      demoUrl: "https://prudexxx.github.io/web00-pro/demo.html",
      developmentDays: 7,
      featured: true,
      features: ["Fast"],
      fullDescription: "Full",
      galleryImages: [],
      previewImage: null,
      previewImageUrl: "https://prudexxx.github.io/web00-pro/assets/img/previews/example.png",
      previewType: "image",
      priceAmountCents: 100000,
      priceLabel: "от 10 000 ₽",
      publishedAt: "2026-07-24T00:00:00.000Z",
      shortDescription: "Short",
      siteUrl: "https://example.com",
      slug: "example",
      tags: ["tag"],
      title: "Example"
    });
  });

  it("builds byte-identical JSON for the same public projection", async () => {
    const item = mapSiteToPublicCatalogItem(siteRecord);
    const first = await buildPublicCatalogSnapshot({
      generatedAt: new Date("2026-08-01T00:00:00.000Z"),
      items: [item],
      revision: 4,
      settings: { showDemoInModal: false }
    });
    const second = await buildPublicCatalogSnapshot({
      generatedAt: new Date("2026-08-01T00:00:00.000Z"),
      items: [{ ...item }],
      revision: 4,
      settings: { showDemoInModal: false }
    });

    expect(first.bytes).toEqual(second.bytes);
    expect(first.sha256).toBe(second.sha256);
    expect(validatePublicCatalogSnapshot(JSON.parse(first.bytes))).toMatchObject({
      itemsCount: 1,
      revision: 4,
      settings: { showDemoInModal: false }
    });
  });

  it("keeps pure preparation byte-equivalent with the canonical snapshot builder", async () => {
    const generatedAt = new Date("2026-08-01T00:00:00.000Z");
    const settings = { showDemoInModal: false };
    const items = [mapSiteToPublicCatalogItem(siteRecord)];
    const built = await buildPublicCatalogSnapshot({
      generatedAt,
      items,
      revision: 4,
      settings
    });
    const prepared = await preparePublicCatalogSnapshotCandidate({
      generatedAt,
      records: [siteRecord],
      revision: 4,
      settings
    });

    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") {
      throw new Error("Expected prepared snapshot to be ready.");
    }
    expect(prepared.built.bytes).toBe(built.bytes);
    expect(prepared.built.sha256).toBe(built.sha256);
  });

  it("changes checksum for public changes and keeps it stable for non-public row order", async () => {
    const first = await buildPublicCatalogSnapshot({
      generatedAt: new Date("2026-08-01T00:00:00.000Z"),
      items: [
        mapSiteToPublicCatalogItem({ ...siteRecord, slug: "z-site", title: "Z" }),
        mapSiteToPublicCatalogItem({ ...siteRecord, slug: "a-site", title: "A" })
      ],
      revision: 8,
      settings: { showDemoInModal: false }
    });
    const reordered = await buildPublicCatalogSnapshot({
      generatedAt: new Date("2026-08-01T00:00:00.000Z"),
      items: [
        mapSiteToPublicCatalogItem({ ...siteRecord, slug: "a-site", title: "A" }),
        mapSiteToPublicCatalogItem({ ...siteRecord, slug: "z-site", title: "Z" })
      ],
      revision: 8,
      settings: { showDemoInModal: false }
    });
    const changed = await buildPublicCatalogSnapshot({
      generatedAt: new Date("2026-08-01T00:00:00.000Z"),
      items: [
        mapSiteToPublicCatalogItem({ ...siteRecord, slug: "a-site", title: "Changed" }),
        mapSiteToPublicCatalogItem({ ...siteRecord, slug: "z-site", title: "Z" })
      ],
      revision: 8,
      settings: { showDemoInModal: false }
    });

    expect(first.bytes).toEqual(reordered.bytes);
    expect(first.sha256).toBe(reordered.sha256);
    expect(changed.sha256).not.toBe(first.sha256);
  });

  it("rejects duplicate slugs, unsafe item counts, unsafe URLs, and oversized bytes", async () => {
    const item = mapSiteToPublicCatalogItem(siteRecord);

    await expect(
      buildPublicCatalogSnapshot({
        generatedAt: new Date("2026-08-01T00:00:00.000Z"),
        items: [item, item],
        revision: 1,
        settings: { showDemoInModal: false }
      })
    ).rejects.toThrow(/duplicate/i);

    await expect(
      buildPublicCatalogSnapshot({
        generatedAt: new Date("2026-08-01T00:00:00.000Z"),
        items: Array.from({ length: 1001 }, (_, index) => ({
          ...item,
          slug: `site-${index}`
        })),
        revision: 1,
        settings: { showDemoInModal: false }
      })
    ).rejects.toThrow(/items/i);

    await expect(
      buildPublicCatalogSnapshot({
        generatedAt: new Date("2026-08-01T00:00:00.000Z"),
        items: [
          {
            ...item,
            demoUrl: "https://user:pass@example.com/#secret"
          }
        ],
        revision: 1,
        settings: { showDemoInModal: false }
      })
    ).rejects.toThrow(/url/i);

    await expect(
      buildPublicCatalogSnapshot({
        byteLimit: 128,
        generatedAt: new Date("2026-08-01T00:00:00.000Z"),
        items: [item],
        revision: 1,
        settings: { showDemoInModal: false }
      })
    ).rejects.toThrow(/bytes/i);
  });

  it("accepts explicit item count boundaries through 1000 public catalog items", async () => {
    const item = mapSiteToPublicCatalogItem(siteRecord);

    for (const count of [0, 1, 15, 16, 1000]) {
      const snapshot = await buildPublicCatalogSnapshot({
        generatedAt: new Date("2026-08-01T00:00:00.000Z"),
        items: Array.from({ length: count }, (_, index) => ({
          ...item,
          slug: `site-${index}`
        })),
        revision: 1,
        settings: { showDemoInModal: false }
      });

      expect(snapshot.snapshot.itemsCount).toBe(count);
      expect(validatePublicCatalogSnapshot(JSON.parse(snapshot.bytes)).itemsCount).toBe(count);
    }
  });

  it("builds and validates a manifest bound to exact snapshot checksum/count", async () => {
    const snapshot = await buildPublicCatalogSnapshot({
      generatedAt: new Date("2026-08-01T00:00:00.000Z"),
      items: [mapSiteToPublicCatalogItem(siteRecord)],
      revision: 9,
      settings: { showDemoInModal: true }
    });
    const manifest = buildPublicCatalogManifest({
      generatedAt: new Date("2026-08-01T00:00:00.000Z"),
      itemsCount: snapshot.snapshot.itemsCount,
      revision: snapshot.snapshot.revision,
      sha256: snapshot.sha256,
      snapshotPath: "public-catalog/v1/snapshots/revision-9.json",
      snapshotUrl:
        "https://storage.example.test/storage/v1/object/public/web00-catalog-images/public-catalog/v1/snapshots/revision-9.json"
    });

    expect(validatePublicCatalogManifest(manifest)).toEqual(manifest);
    expect(() =>
      validatePublicCatalogManifest({
        ...manifest,
        snapshotUrl:
          "https://storage.example.test/storage/v1/object/public/web00-catalog-images/public-catalog/v1/snapshots/revision-9.json?token=leak"
      })
    ).toThrow(/snapshotUrl/i);
  });
});
