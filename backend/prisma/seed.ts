import "dotenv/config";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CatalogSnapshot } from "./seed-web00-data.js";
import { seedWeb00Catalog } from "./seed-web00-data.js";
import { assertMigrationDatabaseUrl, parseDatabaseEnv } from "../src/config/database-env.js";
import { createPrismaClient } from "../src/db/prisma.js";

const snapshotPath = fileURLToPath(new URL("./seed-data/web00-catalog.json", import.meta.url));
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as CatalogSnapshot;
const databaseEnv = parseDatabaseEnv(process.env);

assertMigrationDatabaseUrl(databaseEnv, process.env.NODE_ENV);

const prisma = createPrismaClient({
  databaseUrl: databaseEnv.DATABASE_URL
});

try {
  const result = await seedWeb00Catalog(prisma, snapshot);

  console.log(
    [
      "seed result:",
      `categories created=${result.summary.categories.created}`,
      `categories unchanged=${result.summary.categories.unchanged}`,
      `categories conflicts=${result.summary.categories.conflicts}`,
      `sites created=${result.summary.sites.created}`,
      `sites unchanged=${result.summary.sites.unchanged}`,
      `sites conflicts=${result.summary.sites.conflicts}`
    ].join(" ")
  );

  if (result.conflicts.length > 0) {
    console.error("seed conflicts detected; no owner-owned rows were overwritten");
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
