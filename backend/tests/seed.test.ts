import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "../prisma/seed-web00-data.js";
import { seedWeb00Catalog } from "../prisma/seed-web00-data.js";
import { parseTestDatabaseEnv } from "../src/config/database-env.js";
import { createPrismaClient } from "../src/db/prisma.js";

const repositoryRoot = join(process.cwd(), "..");
const snapshot = JSON.parse(
  readFileSync(join(process.cwd(), "prisma", "seed-data", "web00-catalog.json"), "utf8")
) as CatalogSnapshot;
const databaseEnv = parseTestDatabaseEnv(process.env);
const prisma = createPrismaClient({
  databaseUrl: databaseEnv.TEST_DATABASE_URL,
  poolMax: 1
});
const unsafeDrovaDomains = [
  ["дрова", "сухие.рф"].join(""),
  ["www", ["дрова", "сухие.рф"].join("")].join("."),
  ["xn--80adfgo7anlsu", "xn--p1ai"].join("."),
  ["www", "xn--80adfgo7anlsu", "xn--p1ai"].join(".")
];
const trackedTextExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".txt",
  ".webmanifest",
  ".xml",
  ".yaml",
  ".yml"
]);

function trackedTextFiles(): string[] {
  return execFileSync("git", ["-C", repositoryRoot, "ls-files"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  })
    .split(/\r?\n/)
    .filter((file) => file !== "" && trackedTextExtensions.has(extname(file)));
}

async function cleanCatalogTables(): Promise<void> {
  await prisma.site.deleteMany();
  await prisma.category.deleteMany();
}

describe("WEB00 canonical catalog safety", () => {
  it("keeps canonical drova published and safe without obsolete external destinations", () => {
    const drovaSites = snapshot.sites.filter((site) => site.slug === "drova");

    expect(snapshot.sites).toHaveLength(15);
    expect(snapshot.sites.filter((site) => site.slug === "drova-test-copy-20260729")).toHaveLength(0);
    expect(drovaSites).toHaveLength(1);

    const drova = drovaSites[0];

    if (drova === undefined) {
      throw new Error("Expected canonical drova site in snapshot.");
    }

    expect(drova).toMatchObject({
      active: true,
      categorySlug: "delivery",
      deliveryLabel: "от 2 дней",
      demoLocalUrl: null,
      demoMode: "none",
      demoUrl: null,
      externalDemoUrl: null,
      originalDemoUrl: null,
      previewImageUrl: "assets/img/previews/drova-home.png",
      previewType: "delivery",
      priceLabel: "Стоимость после анкеты",
      shortDescription: "Сайт для локальной продажи и доставки дров с ассортиментом, условиями и быстрым заказом.",
      siteUrl: null,
      sortOrder: 150,
      status: "published",
      title: "Доставка и продажа дров",
      views: 0
    });
    expect(drova.features).toEqual(["Ассортимент", "Зоны доставки", "Прайс", "Быстрый заказ"]);
    expect(drova.galleryImages).toHaveLength(4);
    expect(drova.galleryImages.map((image) => image.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(drova.galleryImages.map((image) => image.url)).toEqual([
      "assets/img/solution-gallery/drova-01.png",
      "assets/img/solution-gallery/drova-02.png",
      "assets/img/solution-gallery/drova-03.png",
      "assets/img/solution-gallery/drova-04.png"
    ]);

    const drovaPayload = JSON.stringify(drova).toLowerCase();
    for (const unsafeDomain of unsafeDrovaDomains) {
      expect(drovaPayload).not.toContain(unsafeDomain.toLowerCase());
    }
  });

  it("does not keep obsolete drova domains in tracked text sources", () => {
    const matches: string[] = [];

    for (const file of trackedTextFiles()) {
      const source = readFileSync(join(repositoryRoot, file), "utf8").toLowerCase();

      for (const unsafeDomain of unsafeDrovaDomains) {
        if (source.includes(unsafeDomain.toLowerCase())) {
          matches.push(file);
          break;
        }
      }
    }

    expect(matches).toEqual([]);
  });
});

describe("WEB00 catalog seed", () => {
  beforeEach(async () => {
    await cleanCatalogTables();
  });

  afterAll(async () => {
    await cleanCatalogTables();
    await prisma.$disconnect();
  });

  it("creates 7 categories and 15 sites on an empty database", async () => {
    const result = await seedWeb00Catalog(prisma, snapshot);

    await expect(prisma.category.count()).resolves.toBe(7);
    await expect(prisma.site.count()).resolves.toBe(15);
    await expect(
      prisma.site.count({
        where: {
          active: true,
          deletedAt: null,
          publishedAt: { not: null },
          status: "published"
        }
      })
    ).resolves.toBe(15);
    expect(result.summary).toEqual({
      categories: { conflicts: 0, created: 7, unchanged: 0 },
      sites: { conflicts: 0, created: 15, unchanged: 0 }
    });
    expect(result.conflicts).toEqual([]);
  });

  it("reports unchanged records on repeated seed", async () => {
    await seedWeb00Catalog(prisma, snapshot);
    const result = await seedWeb00Catalog(prisma, snapshot);

    expect(result.summary).toEqual({
      categories: { conflicts: 0, created: 0, unchanged: 7 },
      sites: { conflicts: 0, created: 0, unchanged: 15 }
    });
    expect(result.conflicts).toEqual([]);
  });

  it("reports conflicts without overwriting owner edits", async () => {
    await seedWeb00Catalog(prisma, snapshot);
    await prisma.site.update({
      data: { title: "Owner edited title" },
      where: { slug: "mebel" }
    });

    const result = await seedWeb00Catalog(prisma, snapshot);
    const site = await prisma.site.findUniqueOrThrow({ where: { slug: "mebel" } });

    expect(result.conflicts).toEqual([
      {
        fields: ["title"],
        slug: "mebel",
        type: "site"
      }
    ]);
    expect(result.summary.sites.conflicts).toBe(1);
    expect(site.title).toBe("Owner edited title");
  });

  it("does not republish or reactivate a soft-deleted canonical site on repeated seed", async () => {
    await seedWeb00Catalog(prisma, snapshot);
    await prisma.site.update({
      data: {
        active: false,
        deletedAt: new Date("2026-07-29T00:00:00.000Z"),
        publishedAt: null,
        status: "draft"
      },
      where: { slug: "drova" }
    });

    const result = await seedWeb00Catalog(prisma, snapshot);
    const site = await prisma.site.findUniqueOrThrow({ where: { slug: "drova" } });

    expect(result.conflicts).toEqual([
      {
        fields: ["status", "active", "publishedAt"],
        slug: "drova",
        type: "site"
      }
    ]);
    expect(site.status).toBe("draft");
    expect(site.active).toBe(false);
    expect(site.deletedAt).not.toBeNull();
    expect(site.publishedAt).toBeNull();
  });

  it("never deletes extra category or site records", async () => {
    await seedWeb00Catalog(prisma, snapshot);
    const category = await prisma.category.create({
      data: {
        slug: "extra-category",
        title: "Extra",
        updatedAt: new Date()
      }
    });
    await prisma.site.create({
      data: {
        categoryId: category.id,
        shortDescription: "Extra site",
        slug: "extra-site",
        title: "Extra site",
        updatedAt: new Date()
      }
    });

    await seedWeb00Catalog(prisma, snapshot);

    await expect(prisma.category.findUnique({ where: { slug: "extra-category" } })).resolves.not.toBeNull();
    await expect(prisma.site.findUnique({ where: { slug: "extra-site" } })).resolves.not.toBeNull();
  });

  it("production seed reads only the backend snapshot file", () => {
    const seedSource = readFileSync(join(process.cwd(), "prisma", "seed.ts"), "utf8");

    expect(seedSource).toContain("seed-data/web00-catalog.json");
    expect(seedSource).not.toContain("assets/js/data.js");
    expect(seedSource).not.toContain("../assets");
    expect(seedSource).toContain("parseRuntimeDatabaseEnv");
    expect(seedSource).not.toContain("parseDatabaseEnv");
  });
});
