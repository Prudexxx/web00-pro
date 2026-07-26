import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "../prisma/seed-web00-data.js";
import { seedWeb00Catalog } from "../prisma/seed-web00-data.js";
import { parseTestDatabaseEnv } from "../src/config/database-env.js";
import { createPrismaClient } from "../src/db/prisma.js";

const snapshot = JSON.parse(
  readFileSync(join(process.cwd(), "prisma", "seed-data", "web00-catalog.json"), "utf8")
) as CatalogSnapshot;
const databaseEnv = parseTestDatabaseEnv(process.env);
const prisma = createPrismaClient({
  databaseUrl: databaseEnv.TEST_DATABASE_URL,
  poolMax: 1
});

async function cleanCatalogTables(): Promise<void> {
  await prisma.site.deleteMany();
  await prisma.category.deleteMany();
}

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
