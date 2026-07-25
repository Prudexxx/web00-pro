import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCatalogSnapshot,
  parseLegacyCatalogSource
} from "../scripts/build-catalog-snapshot.js";

const fixtureSource = `
  const SOLUTIONS = [
    {
      id: "mebel",
      legacyTitle: "Мебельный магазин",
      title: "Мебельный магазин",
      category: "Товары",
      description: "Описание",
      priceFrom: "Стоимость после анкеты",
      deliveryTime: "от 3 дней",
      features: ["Каталог"],
      previewImage: "assets/img/previews/mebel-home.png",
      previewType: "goods",
      filter: "goods",
      demoMode: "external-iframe",
      demoLocalUrl: null,
      externalDemoUrl: "https://example.test",
      originalDemoUrl: "https://example.test",
      demoUrl: "https://example.test",
      active: true,
    }
  ];
  const SOLUTION_GALLERIES = { mebel: ["mebel-01"] };
`;

describe("catalog snapshot builder", () => {
  it("parses literal legacy SOLUTIONS and galleries without executing JavaScript", () => {
    const legacy = parseLegacyCatalogSource(fixtureSource);

    expect(legacy.solutions).toHaveLength(1);
    expect(legacy.galleries).toEqual({ mebel: ["mebel-01"] });
  });

  it("builds normalized categories and sites from legacy literals", () => {
    const snapshot = buildCatalogSnapshot({
      sourceCommit: "commit",
      sourceSha256: "hash",
      sourceText: fixtureSource
    });

    expect(snapshot.categories).toEqual([
      {
        active: true,
        description: null,
        slug: "goods",
        sortOrder: 20,
        title: "Товары"
      }
    ]);
    expect(snapshot.sites[0]).toMatchObject({
      categorySlug: "goods",
      galleryImages: [
        {
          alt: "Мебельный магазин",
          sortOrder: 0,
          storagePath: "catalog/sites/mebel/gallery/mebel-01.png",
          url: "assets/img/solution-gallery/mebel-01.png"
        }
      ],
      slug: "mebel",
      status: "draft"
    });
  });

  it("rejects non-literal legacy values", () => {
    expect(() =>
      parseLegacyCatalogSource(`
        const SOLUTIONS = [{ id: makeSlug(), filter: "goods" }];
        const SOLUTION_GALLERIES = {};
      `)
    ).toThrow(/literal/);
  });

  it("does not contain forbidden JavaScript execution mechanisms", () => {
    const source = readFileSync(join(process.cwd(), "scripts", "build-catalog-snapshot.ts"), "utf8");

    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/\bFunction\s*\(/);
    expect(source).not.toContain("node:vm");
    expect(source).not.toMatch(/import\s*\(/);
  });
});
