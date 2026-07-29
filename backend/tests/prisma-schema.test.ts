import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();

describe("Prisma schema contract", () => {
  it("configures Prisma CLI paths, seed, and optional shadow database URL", () => {
    const config = readFileSync(join(backendRoot, "prisma.config.ts"), "utf8");

    expect(config).toContain('import "dotenv/config";');
    expect(config).toContain('import { defineConfig, env } from "prisma/config";');
    expect(config).toContain('schema: "prisma/schema.prisma"');
    expect(config).toContain('path: "prisma/migrations"');
    expect(config).toContain('seed: "tsx prisma/seed.ts"');
    expect(config).toContain('url: env("DATABASE_URL")');
    expect(config).toContain(
      "const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL?.trim();"
    );
    expect(config).toContain("...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {})");
    expect(config).not.toContain('shadowDatabaseUrl: env("SHADOW_DATABASE_URL")');
  });

  it("declares the approved Prisma 7 generator and datasource", () => {
    const schema = readFileSync(join(backendRoot, "prisma", "schema.prisma"), "utf8");

    expect(schema).toContain('provider = "prisma-client"');
    expect(schema).toContain('output   = "../src/generated/prisma"');
    expect(schema).toContain('provider = "postgresql"');
  });

  it("contains the six approved mapped B2 models and key relations", () => {
    const schema = readFileSync(join(backendRoot, "prisma", "schema.prisma"), "utf8");

    for (const modelName of ["User", "RefreshSession", "Category", "Site", "AuditLog", "StorageCleanupJob"]) {
      expect(schema).toContain(`model ${modelName} `);
    }

    for (const tableName of [
      "users",
      "refresh_sessions",
      "categories",
      "sites",
      "audit_logs",
      "storage_cleanup_jobs"
    ]) {
      expect(schema).toContain(`@@map("${tableName}")`);
    }

    expect(schema).toContain("onDelete: Cascade");
    expect(schema).toContain("onDelete: Restrict");
    expect(schema).toContain("onDelete: SetNull");
    expect(schema).toContain('dbgenerated("gen_random_uuid()")');
    expect(schema).toContain("@db.Timestamptz(6)");
  });

  it("models Site GIN indexes in Prisma instead of manual SQL duplicates", () => {
    const schema = readFileSync(join(backendRoot, "prisma", "schema.prisma"), "utf8");

    expect(schema).toContain('@@index([tags], type: Gin, map: "idx_sites_tags_gin")');
    expect(schema).toContain('@@index([features], type: Gin, map: "idx_sites_features_gin")');
  });
});
