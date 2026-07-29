import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "../scripts/verify-catalog-snapshot.js";
import { validateCatalogSnapshot } from "../scripts/verify-catalog-snapshot.js";

function createSnapshot(): CatalogSnapshot {
  return {
    categories: [
      {
        active: true,
        description: null,
        slug: "goods",
        sortOrder: 20,
        title: "Товары"
      }
    ],
    generatedAt: "2026-07-24T00:00:00.000Z",
    sites: [
      {
        active: true,
        categorySlug: "goods",
        deliveryLabel: "от 3 дней",
        demoLocalUrl: null,
        demoMode: "external-iframe",
        demoUrl: "https://example.test",
        developmentDays: null,
        externalDemoUrl: "https://example.test",
        featured: false,
        features: ["Каталог"],
        fullDescription: null,
        galleryImages: [
          {
            alt: "Мебельный магазин",
            sortOrder: 0,
            storagePath: "catalog/sites/mebel/gallery/mebel-01.png",
            url: "assets/img/solution-gallery/mebel-01.png"
          }
        ],
        legacyTitle: "Мебельный магазин",
        originalDemoUrl: "https://example.test",
        previewImageUrl: "assets/img/previews/mebel-home.png",
        previewType: "goods",
        priceAmountCents: null,
        priceLabel: "Стоимость после анкеты",
        publishedAt: "2026-07-24T00:00:00.000Z",
        shortDescription: "Описание",
        siteUrl: null,
        slug: "mebel",
        sortOrder: 20,
        status: "published",
        tags: [],
        title: "Мебельный магазин",
        views: 0
      }
    ],
    sourceCommit: "commit",
    sourceFile: "assets/js/data.js",
    sourceRepository: "https://github.com/Prudexxx/web00-pro.git",
    sourceSha256: "hash"
  };
}

function createImageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "web00-snapshot-"));

  mkdirSync(join(root, "assets", "img", "previews"), { recursive: true });
  mkdirSync(join(root, "assets", "img", "solution-gallery"), { recursive: true });
  writeFileSync(join(root, "assets", "img", "previews", "mebel-home.png"), "");
  writeFileSync(join(root, "assets", "img", "solution-gallery", "mebel-01.png"), "");

  return root;
}

describe("catalog snapshot verifier", () => {
  it("accepts a valid snapshot", () => {
    expect(validateCatalogSnapshot(createSnapshot(), { repositoryRoot: createImageRoot(), sourceSha256: "hash" })).toEqual([]);
  });

  it("reports SHA mismatch, duplicate slugs, missing required fields, and missing images", () => {
    const snapshot = createSnapshot();
    const category = snapshot.categories[0];
    const site = snapshot.sites[0];

    if (category === undefined || site === undefined) {
      throw new Error("Expected snapshot fixtures.");
    }

    snapshot.categories.push({ ...category });
    snapshot.sites.push({ ...site, title: "" });

    const issues = validateCatalogSnapshot(snapshot, {
      repositoryRoot: createImageRoot(),
      sourceSha256: "different"
    });

    expect(issues).toContain("sourceSha256 does not match legacy source.");
    expect(issues).toContain("Duplicate category slug: goods.");
    expect(issues).toContain("Duplicate site slug: mebel.");
    expect(issues).toContain("Site mebel is missing title.");
  });

  it("reports missing local image paths", () => {
    const snapshot = createSnapshot();

    expect(validateCatalogSnapshot(snapshot, { repositoryRoot: mkdtempSync(join(tmpdir(), "web00-empty-")), sourceSha256: "hash" })).toContain(
      "Missing image path: assets/img/previews/mebel-home.png."
    );
  });

  it("rejects published snapshot sites without a deterministic publishedAt value", () => {
    const snapshot = createSnapshot();
    const site = snapshot.sites[0];

    if (site === undefined) {
      throw new Error("Expected snapshot fixture.");
    }

    site.publishedAt = null;

    expect(validateCatalogSnapshot(snapshot, { repositoryRoot: createImageRoot(), sourceSha256: "hash" })).toContain(
      "Published site mebel is missing publishedAt."
    );
  });
});
