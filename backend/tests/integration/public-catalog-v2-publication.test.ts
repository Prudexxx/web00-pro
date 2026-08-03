import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PublicationOperationRecord } from "../../src/modules/public-catalog-v2/public-catalog-v2.types.js";

const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260803170000_public_catalog_v2_publication",
  "migration.sql"
);
const schemaPath = join(process.cwd(), "prisma", "schema.prisma");

const operationStatuses = ["queued", "running", "retry_wait", "succeeded", "failed", "cancelled"];
const operationStages = [
  "content_transaction",
  "media_preflight",
  "projection_page",
  "index_build",
  "chunk_build",
  "chunk_upload",
  "chunk_verify",
  "popular_build",
  "popular_upload",
  "popular_verify",
  "categories_build",
  "categories_upload",
  "categories_verify",
  "manifest_build",
  "manifest_upload",
  "manifest_verify",
  "active_build",
  "active_upload",
  "active_verify",
  "db_finalize",
  "reconcile"
];

describe("Public Catalog V2 publication schema", () => {
  it("defines the approved additive migration tables and never mutates existing catalog data", () => {
    const sql = readRequiredFile(migrationPath);

    expect(sql).toContain('CREATE TABLE "public_catalog_settings"');
    expect(sql).toContain('CREATE TABLE "site_image_assets"');
    expect(sql).toMatch(/ALTER TABLE "sites"\s+ADD COLUMN "preview_asset_id" UUID;/i);
    expect(sql).toContain('CREATE TABLE "site_preview_images"');
    expect(sql).toContain('CREATE TABLE "site_gallery_images"');
    expect(sql).toContain('CREATE TABLE "public_catalog_publication_operations"');
    expect(sql).toContain('CREATE TABLE "public_catalog_releases"');
    expect(sql).toContain('CREATE TABLE "public_catalog_activation_events"');
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+(sites|categories|public_catalog_control)\b/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\s+(sites|public_catalog_control)\b/i);
    expect(sql).not.toContain("web00-catalog-images");
  });

  it("enforces durable operation identity, idempotency, checkpoint, retry, lease and catalog-group coalescing", () => {
    const sql = readRequiredFile(migrationPath);

    expect(sql).toContain('CONSTRAINT "public_catalog_publication_operations_pkey" PRIMARY KEY ("id")');
    expect(sql).toContain(
      'CONSTRAINT "public_catalog_publication_operations_idempotency_key_key" UNIQUE ("idempotency_key")'
    );
    expect(sql).toMatch(/"request_fingerprint"\s+CHAR\(64\)\s+NOT NULL/i);
    expect(sql).toMatch(/"projection_hash"\s+CHAR\(64\)/i);
    expect(sql).toMatch(/"operation_scope"\s+TEXT\s+NOT NULL/i);
    expect(sql).toMatch(/"operation_group_key"\s+TEXT\s+NOT NULL/i);
    expect(sql).toMatch(/"target_revision"\s+INTEGER\s+NOT NULL/i);
    expect(sql).toMatch(/"status"\s+TEXT\s+NOT NULL/i);
    expect(sql).toMatch(/"stage"\s+TEXT\s+NOT NULL/i);
    expect(sql).toMatch(/"retry_count"\s+INTEGER\s+NOT NULL DEFAULT 0/i);
    expect(sql).toMatch(/"lease_id"\s+TEXT/i);
    expect(sql).toMatch(/"locked_at"\s+TIMESTAMPTZ\(6\)/i);
    expect(sql).toMatch(/"locked_by"\s+TEXT/i);
    expect(sql).toMatch(/"last_checkpoint"\s+JSONB\s+NOT NULL DEFAULT '\{\}'/i);
    expect(sql).toMatch(/"last_error_code"\s+TEXT/i);
    expect(sql).toMatch(/"completed_at"\s+TIMESTAMPTZ\(6\)/i);
    expect(sql).toContain(
      'CONSTRAINT "public_catalog_publication_operations_target_revision_chk" CHECK ("target_revision" >= 1)'
    );
    expect(sql).toContain(
      'CONSTRAINT "public_catalog_publication_operations_retry_count_chk" CHECK ("retry_count" >= 0)'
    );
    expect(sql).toContain(
      'CONSTRAINT "public_catalog_publication_operations_fingerprint_chk" CHECK ("request_fingerprint" ~ \'^[a-f0-9]{64}$\' AND ("projection_hash" IS NULL OR "projection_hash" ~ \'^[a-f0-9]{64}$\'))'
    );
    for (const status of operationStatuses) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "public_catalog_publication_operations_active_group_key"\s+ON "public_catalog_publication_operations" \("operation_group_key"\)\s+(?:--[^\n]*\n\s+)?WHERE "status" IN \('queued', 'running', 'retry_wait'\);/m
    );
  });

  it("enforces media slot/site identity and activation-event uniqueness through PostgreSQL constraints", () => {
    const sql = readRequiredFile(migrationPath);

    expect(sql).toContain(
      'CONSTRAINT "site_image_assets_site_asset_slot_key" UNIQUE ("site_id", "asset_id", "slot")'
    );
    expect(sql).toContain('CONSTRAINT "site_image_assets_slot_chk" CHECK ("slot" IN (\'preview\', \'gallery\'))');
    expect(sql).toContain(
      'CONSTRAINT "site_image_assets_source_sha256_chk" CHECK ("source_sha256" ~ \'^[a-f0-9]{64}$\')'
    );
    expect(sql).toContain('CONSTRAINT "site_image_assets_dimensions_chk" CHECK ("width" > 0 AND "height" > 0)');
    expect(sql).toContain(
      'CONSTRAINT "site_preview_images_asset_slot_fkey" FOREIGN KEY ("site_id", "asset_id", "slot") REFERENCES "site_image_assets"("site_id", "asset_id", "slot") ON DELETE RESTRICT ON UPDATE CASCADE'
    );
    expect(sql).toContain(
      'CONSTRAINT "site_gallery_images_asset_slot_fkey" FOREIGN KEY ("site_id", "asset_id", "slot") REFERENCES "site_image_assets"("site_id", "asset_id", "slot") ON DELETE CASCADE ON UPDATE CASCADE'
    );
    expect(sql).toContain('CONSTRAINT "site_gallery_images_site_sort_order_key" UNIQUE ("site_id", "sort_order")');
    expect(sql).toContain(
      'CONSTRAINT "public_catalog_activation_events_operation_id_key" UNIQUE ("operation_id")'
    );
    expect(sql).toContain(
      'CONSTRAINT "public_catalog_activation_events_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "public_catalog_publication_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE'
    );
    expect(sql).toContain(
      'CONSTRAINT "public_catalog_activation_events_revision_fkey" FOREIGN KEY ("revision") REFERENCES "public_catalog_releases"("revision") ON DELETE RESTRICT ON UPDATE CASCADE'
    );
    expect(sql).toContain(
      'CONSTRAINT "public_catalog_activation_events_previous_revision_fkey" FOREIGN KEY ("previous_revision") REFERENCES "public_catalog_releases"("revision") ON DELETE RESTRICT ON UPDATE CASCADE'
    );
    expect(sql).toContain(
      'CONSTRAINT "public_catalog_activation_events_type_chk" CHECK ("event_type" IN (\'activate\', \'rollback\', \'reconcile\'))'
    );
  });

  it("maps the approved Prisma models, field names and relations while retaining V1 PublicCatalogControl", () => {
    const schema = readRequiredFile(schemaPath);

    expect(modelBlock(schema, "PublicCatalogControl")).toContain('@@map("public_catalog_control")');
    expect(modelBlock(schema, "PublicCatalogSetting")).toContain('@@map("public_catalog_settings")');
    expect(modelBlock(schema, "SiteImageAsset")).toContain('@@map("site_image_assets")');
    expect(modelBlock(schema, "SitePreviewImage")).toContain('@@map("site_preview_images")');
    expect(modelBlock(schema, "SiteGalleryImage")).toContain('@@map("site_gallery_images")');
    expect(modelBlock(schema, "PublicCatalogPublicationOperation")).toContain(
      '@@map("public_catalog_publication_operations")'
    );
    expect(modelBlock(schema, "PublicCatalogRelease")).toContain('@@map("public_catalog_releases")');
    expect(modelBlock(schema, "PublicCatalogActivationEvent")).toContain(
      '@@map("public_catalog_activation_events")'
    );
    expect(modelBlock(schema, "Site")).toMatch(/previewAssetId\s+String\?/);
    expect(modelBlock(schema, "SitePreviewImage")).toContain(
      '@relation("SitePreviewImageAsset", fields: [siteId, assetId, slot], references: [siteId, assetId, slot], onDelete: Restrict'
    );
    expect(modelBlock(schema, "SiteGalleryImage")).toContain(
      '@relation("SiteGalleryImageAsset", fields: [siteId, assetId, slot], references: [siteId, assetId, slot], onDelete: Cascade'
    );
  });

  it("exports the approved V2 repository surface and bounded operation stage/status types", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const typesModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.types.js");

    expect(typeof repositoryModule.createPublicCatalogV2Repository).toBe("function");
    const repository = repositoryModule.createPublicCatalogV2Repository(createRepositoryPrismaFake()) as unknown as Record<
      string,
      unknown
    >;

    for (const functionName of [
      "createOrCoalescePublicationOperation",
      "claimNextPublicationOperation",
      "recordPublicationCheckpoint",
      "finalizePublicationOperation",
      "recordActivationEvent",
      "iteratePublicCatalogV2ProjectionPages"
    ]) {
      expect(typeof repository[functionName]).toBe("function");
    }
    expect(typesModule.PUBLIC_CATALOG_V2_OPERATION_STATUSES).toEqual(operationStatuses);
    expect(typesModule.PUBLIC_CATALOG_V2_OPERATION_STAGES).toEqual(operationStages);
  });

  it("does not claim a publication operation that is no longer claimable after selection", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const prismaFake = createConcurrentClaimPrismaFake();
    const repository = repositoryModule.createPublicCatalogV2Repository(prismaFake);

    await expect(
      repository.claimNextPublicationOperation({
        leaseId: "synthetic-lease",
        lockedBy: "synthetic-worker",
        now: new Date("2026-08-03T17:01:00.000Z")
      })
    ).resolves.toBeNull();
    expect(prismaFake.publicCatalogPublicationOperation.updateManyCalls).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          leaseId: "synthetic-lease",
          lockedBy: "synthetic-worker",
          status: "running"
        }),
        where: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000001",
          OR: [{ status: "queued" }, { status: "retry_wait" }]
        })
      })
    ]);
  });
});

function readRequiredFile(path: string): string {
  expect(existsSync(path), `Expected OPV2-2 file to exist: ${path}`).toBe(true);

  return readFileSync(path, "utf8");
}

function modelBlock(schema: string, modelName: string): string {
  const match = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`).exec(schema);

  if (match === null) {
    throw new Error(`Expected Prisma model ${modelName} to exist.`);
  }

  return match[0]!;
}

function createRepositoryPrismaFake() {
  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async () => syntheticOperationRecord(),
      findFirst: async () => null,
      findUnique: async () => null,
      updateMany: async () => ({ count: 0 }),
      update: async () => syntheticOperationRecord()
    },
    site: {
      findMany: async () => []
    }
  };
}

function createConcurrentClaimPrismaFake() {
  const stored = syntheticOperationRecord();
  const updateManyCalls: unknown[] = [];

  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async () => syntheticOperationRecord(),
      findFirst: async () => {
        const selected = { ...stored };
        stored.status = "succeeded";
        stored.completedAt = new Date("2026-08-03T17:00:30.000Z");

        return selected;
      },
      findUnique: async () => ({ ...stored }),
      update: async (args: { data: Partial<ReturnType<typeof syntheticOperationRecord>> }) => {
        Object.assign(stored, args.data);

        return { ...stored };
      },
      updateMany: async (args: {
        data: Partial<ReturnType<typeof syntheticOperationRecord>>;
        where: { OR?: Array<{ status: string }>; id?: string };
      }) => {
        updateManyCalls.push(args);
        if (
          args.where.id === stored.id &&
          args.where.OR?.some((branch) => branch.status === stored.status)
        ) {
          Object.assign(stored, args.data);

          return { count: 1 };
        }

        return { count: 0 };
      },
      updateManyCalls
    },
    site: {
      findMany: async () => []
    }
  };
}

function syntheticOperationRecord(): PublicationOperationRecord {
  const now = new Date("2026-08-03T17:00:00.000Z");

  return {
    action: "publish",
    actorUserId: null,
    completedAt: null,
    createdAt: now,
    id: "00000000-0000-4000-8000-000000000001",
    idempotencyKey: "synthetic-key",
    lastCheckpoint: {},
    lastErrorCode: null,
    leaseId: null,
    lockedAt: null,
    lockedBy: null,
    operationGroupKey: "public-catalog",
    operationScope: "site:00000000-0000-4000-8000-000000000101",
    projectionHash: null,
    requestFingerprint: "a".repeat(64),
    requestId: "synthetic-request",
    retryCount: 0,
    siteId: null,
    stage: "content_transaction",
    status: "queued",
    targetRevision: 1,
    trigger: "site_publish",
    updatedAt: now
  };
}
