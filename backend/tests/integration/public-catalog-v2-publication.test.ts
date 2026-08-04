import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CreatePublicationOperationInput,
  PublicationOperationRecord
} from "../../src/modules/public-catalog-v2/public-catalog-v2.types.js";

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
    expect(sql).toContain(
      'CONSTRAINT "public_catalog_publication_operations_state_chk" CHECK ('
    );
    expect(sql).toContain(
      `"status" = 'running' AND "lease_id" IS NOT NULL AND "locked_at" IS NOT NULL AND "locked_by" IS NOT NULL AND "next_retry_at" IS NULL AND "completed_at" IS NULL`
    );
    expect(sql).toContain(
      `"status" = 'retry_wait' AND "lease_id" IS NULL AND "locked_at" IS NULL AND "locked_by" IS NULL AND "next_retry_at" IS NOT NULL AND "completed_at" IS NULL`
    );
    expect(sql).toContain(
      `"status" IN ('succeeded', 'failed', 'cancelled') AND "lease_id" IS NULL AND "locked_at" IS NULL AND "locked_by" IS NULL AND "next_retry_at" IS NULL AND "completed_at" IS NOT NULL`
    );
    for (const status of operationStatuses) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "public_catalog_publication_operations_active_group_key"\s+ON "public_catalog_publication_operations" \("operation_group_key"\)\s+(?:--[^\n]*\n\s+)?WHERE "status" IN \('queued', 'running', 'retry_wait'\);/m
    );
  });

  it("defines bounded recovery scanner fields and indexes for long-lived operation history", () => {
    const sql = readRequiredFile(migrationPath);

    expect(sql).toMatch(/"next_retry_at"\s+TIMESTAMPTZ\(6\)/i);
    expect(sql).toMatch(
      /CREATE INDEX "public_catalog_publication_operations_queued_claim_idx"\s+ON "public_catalog_publication_operations" \("created_at", "id"\)\s+WHERE "status" = 'queued';/m
    );
    expect(sql).toMatch(
      /CREATE INDEX "public_catalog_publication_operations_retry_due_idx"\s+ON "public_catalog_publication_operations" \("next_retry_at", "created_at", "id"\)\s+WHERE "status" = 'retry_wait';/m
    );
    expect(sql).toMatch(
      /CREATE INDEX "public_catalog_publication_operations_stale_lease_idx"\s+ON "public_catalog_publication_operations" \("locked_at", "created_at", "id"\)\s+WHERE "status" = 'running';/m
    );
    expect(sql).toMatch(
      /CREATE INDEX "public_catalog_publication_operations_target_revision_idx"\s+ON "public_catalog_publication_operations" \("target_revision", "created_at"\);/m
    );
    expect(sql).toMatch(
      /CREATE INDEX "public_catalog_activation_events_revision_type_idx"\s+ON "public_catalog_activation_events" \("revision", "event_type", "created_at"\);/m
    );
    expect(sql).toMatch(
      /CREATE INDEX "public_catalog_releases_status_revision_idx"\s+ON "public_catalog_releases" \("status", "revision"\);/m
    );
    expect(sql).toMatch(
      /CREATE INDEX "sites_public_catalog_v2_projection_idx"\s+ON "sites" \("sort_order" ASC, "created_at" DESC, "slug" ASC, "id" ASC\)\s+WHERE "status" = 'published' AND "active" = true AND "deleted_at" IS NULL;/m
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
    expect(modelBlock(schema, "PublicCatalogPublicationOperation")).toMatch(/nextRetryAt\s+DateTime\?/);
    expect(modelBlock(schema, "PublicCatalogPublicationOperation")).toContain(
      '@@index([targetRevision, createdAt], map: "public_catalog_publication_operations_target_revision_idx")'
    );
    expect(modelBlock(schema, "PublicCatalogRelease")).toContain(
      '@@index([status, revision], map: "public_catalog_releases_status_revision_idx")'
    );
    expect(modelBlock(schema, "PublicCatalogActivationEvent")).toContain(
      '@@index([revision, eventType, createdAt], map: "public_catalog_activation_events_revision_type_idx")'
    );
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

  it("applies one-click publish and unpublish intent before building the public projection", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const prismaFake = createProjectionIntentPrismaFake();
    const repository = repositoryModule.createPublicCatalogV2Repository(prismaFake) as {
      iteratePublicCatalogV2ProjectionPages(input: Record<string, unknown>): AsyncIterable<{ items: Array<{ slug: string }> }>;
    };

    await expect(
      readProjectionSlugs(repository.iteratePublicCatalogV2ProjectionPages({
        afterCursor: null,
        operation: {
          action: "publish",
          siteId: "00000000-0000-4000-8000-0000000000d1"
        },
        take: 100
      }))
    ).resolves.toEqual([
      "already-public",
      "published-target",
      "draft-target"
    ]);
    await expect(
      readProjectionSlugs(repository.iteratePublicCatalogV2ProjectionPages({
        afterCursor: null,
        operation: {
          action: "unpublish",
          siteId: "00000000-0000-4000-8000-0000000000p1"
        },
        take: 100
      }))
    ).resolves.toEqual(["already-public"]);
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
          status: "queued"
        })
      })
    ]);
  });

  it("claims due retry operations by retry schedule and leaves future retries parked", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const now = new Date("2026-08-03T17:05:00.000Z");
    const prismaFake = createRetryClaimPrismaFake(now);
    const repository = repositoryModule.createPublicCatalogV2Repository(prismaFake);

    const result = await repository.claimNextPublicationOperation({
      leaseId: "synthetic-retry-lease",
      lockedBy: "synthetic-worker",
      now,
      staleLockedBefore: new Date("2026-08-03T17:04:00.000Z")
    });

    expect(result?.id).toBe("00000000-0000-4000-8000-0000000000d1");
    expect(result?.nextRetryAt).toBeNull();
    expect(prismaFake.publicCatalogPublicationOperation.findFirstCalls).toEqual([
      expect.objectContaining({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        where: { status: "queued" }
      }),
      expect.objectContaining({
        orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        where: {
          nextRetryAt: { lte: now },
          status: "retry_wait"
        }
      })
    ]);
    expect(prismaFake.publicCatalogPublicationOperation.updateManyCalls).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          nextRetryAt: null,
          status: "running"
        }),
        where: {
          id: "00000000-0000-4000-8000-0000000000d1",
          nextRetryAt: { lte: now },
          status: "retry_wait"
        }
      })
    ]);
  });

  it("lease-gates checkpoint writes and atomically parks retry_wait operations", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const nextRetryAt = new Date("2026-08-03T17:10:00.000Z");
    const prismaFake = createRetrySchedulePrismaFake();
    const repository = repositoryModule.createPublicCatalogV2Repository(prismaFake);

    await expect(
      repository.recordPublicationCheckpoint({
        lastCheckpoint: { stage: "manifest_upload" },
        lastErrorCode: "SYNTHETIC_RETRYABLE_STORAGE_ERROR",
        leaseId: "current-lease",
        nextRetryAt,
        operationId: "00000000-0000-4000-8000-000000000001",
        retryCount: 2,
        stage: "manifest_upload",
        status: "retry_wait"
      })
    ).resolves.toMatchObject({
      leaseId: null,
      lockedAt: null,
      lockedBy: null,
      nextRetryAt,
      retryCount: 2,
      status: "retry_wait"
    });
    expect(prismaFake.publicCatalogPublicationOperation.updateManyCalls).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          leaseId: null,
          lockedAt: null,
          lockedBy: null,
          nextRetryAt,
          status: "retry_wait"
        }),
        where: {
          id: "00000000-0000-4000-8000-000000000001",
          leaseId: "current-lease",
          status: "running"
        }
      })
    ]);
  });

  it("renews the running lease timestamp on every successful checkpoint", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const renewedAt = new Date("2026-08-03T17:07:30.000Z");
    const prismaFake = createRetrySchedulePrismaFake();
    const repository = repositoryModule.createPublicCatalogV2Repository(prismaFake);

    await expect(
      repository.recordPublicationCheckpoint({
        lastCheckpoint: { chunk: 3 },
        leaseId: "current-lease",
        now: renewedAt,
        operationId: "00000000-0000-4000-8000-000000000001",
        stage: "chunk_upload"
      })
    ).resolves.toMatchObject({
      lockedAt: renewedAt,
      status: "running"
    });
    expect(prismaFake.publicCatalogPublicationOperation.updateManyCalls).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          lockedAt: renewedAt,
          nextRetryAt: null,
          stage: "chunk_upload",
          status: "running"
        }),
        where: {
          id: "00000000-0000-4000-8000-000000000001",
          leaseId: "current-lease",
          status: "running"
        }
      })
    ]);
  });

  it("rejects checkpoint writes from an old lease owner", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const prismaFake = createCheckpointLeasePrismaFake();
    const repository = repositoryModule.createPublicCatalogV2Repository(prismaFake);

    await expect(
      repository.recordPublicationCheckpoint({
        lastCheckpoint: { stage: "chunk_upload" },
        lastErrorCode: "STALE_WORKER_ATTEMPT",
        leaseId: "stale-lease",
        operationId: "00000000-0000-4000-8000-000000000001",
        retryCount: 1,
        stage: "chunk_upload"
      })
    ).rejects.toMatchObject({ code: "PUBLIC_CATALOG_V2_LEASE_NOT_HELD" });
    expect(prismaFake.publicCatalogPublicationOperation.updateManyCalls).toEqual([
      expect.objectContaining({
        where: {
          id: "00000000-0000-4000-8000-000000000001",
          leaseId: "stale-lease",
          status: "running"
        }
      })
    ]);
  });

  it("requires the current lease id before terminal finalization", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const prismaFake = createFinalizeLeasePrismaFake();
    const repository = repositoryModule.createPublicCatalogV2Repository(prismaFake);

    await expect(
      repository.finalizePublicationOperation({
        completedAt: new Date("2026-08-03T17:06:00.000Z"),
        leaseId: "stale-lease",
        operationId: "00000000-0000-4000-8000-000000000001",
        status: "succeeded",
        stage: "db_finalize"
      } as Parameters<typeof repository.finalizePublicationOperation>[0] & { leaseId: string })
    ).rejects.toMatchObject({ code: "PUBLIC_CATALOG_V2_LEASE_NOT_HELD" });

    expect(prismaFake.publicCatalogPublicationOperation.updateManyCalls).toEqual([
      expect.objectContaining({
        where: {
          id: "00000000-0000-4000-8000-000000000001",
          leaseId: "stale-lease",
          status: "running"
        }
      })
    ]);
    expect(prismaFake.publicCatalogPublicationOperation.updateCalls).toEqual([]);
  });

  it("returns an existing terminal DB finalization without writing it twice", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const prismaFake = createTerminalFinalizePrismaFake();
    const repository = repositoryModule.createPublicCatalogV2Repository(prismaFake);

    await expect(
      repository.finalizePublicationOperation({
        completedAt: new Date("2026-08-03T17:06:00.000Z"),
        leaseId: "already-released-lease",
        operationId: "00000000-0000-4000-8000-000000000001",
        status: "succeeded",
        stage: "db_finalize"
      })
    ).resolves.toMatchObject({
      completedAt: new Date("2026-08-03T17:05:59.000Z"),
      leaseId: null,
      status: "succeeded"
    });
    expect(prismaFake.publicCatalogPublicationOperation.updateManyCalls).toEqual([
      expect.objectContaining({
        where: {
          id: "00000000-0000-4000-8000-000000000001",
          leaseId: "already-released-lease",
          status: "running"
        }
      })
    ]);
    expect(prismaFake.publicCatalogPublicationOperation.updateCalls).toEqual([]);
  });

  it("claims stale leases at the exact cutoff without stealing fresh running leases", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const cutoff = new Date("2026-08-03T17:05:00.000Z");
    const prismaFake = createStaleLeaseClaimPrismaFake(cutoff);
    const repository = repositoryModule.createPublicCatalogV2Repository(prismaFake);

    const result = await repository.claimNextPublicationOperation({
      leaseId: "replacement-lease",
      lockedBy: "replacement-worker",
      now: new Date("2026-08-03T17:06:00.000Z"),
      staleLockedBefore: cutoff
    });

    expect(result?.id).toBe("00000000-0000-4000-8000-0000000000e1");
    expect(prismaFake.publicCatalogPublicationOperation.findFirstCalls).toEqual([
      expect.objectContaining({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        where: { status: "queued" }
      }),
      expect.objectContaining({
        orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        where: {
          nextRetryAt: { lte: new Date("2026-08-03T17:06:00.000Z") },
          status: "retry_wait"
        }
      }),
      expect.objectContaining({
        orderBy: [{ lockedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        where: {
          lockedAt: { lte: cutoff },
          status: "running"
        }
      })
    ]);
    expect(prismaFake.publicCatalogPublicationOperation.updateManyCalls).toEqual([
      expect.objectContaining({
        where: {
          id: "00000000-0000-4000-8000-0000000000e1",
          lockedAt: { lte: cutoff },
          status: "running"
        }
      })
    ]);
  });

  it("replays exact idempotency-key requests and rejects changed fingerprints under the approved global key scope", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const prismaFake = createIdempotencyReplayPrismaFake();
    const repository = repositoryModule.createPublicCatalogV2Repository(prismaFake);

    await expect(repository.createOrCoalescePublicationOperation(syntheticCreateInput())).resolves.toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "synthetic-key"
    });
    await expect(
      repository.createOrCoalescePublicationOperation(
        syntheticCreateInput({
          action: "unpublish",
          requestFingerprint: "b".repeat(64),
          siteId: "00000000-0000-4000-8000-000000000202"
        })
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    expect(prismaFake.publicCatalogPublicationOperation.createCalls).toEqual([]);
  });

  it("coalesces one active catalog operation while terminal rows do not block a new operation", async () => {
    const repositoryModule = await import("../../src/modules/public-catalog-v2/public-catalog-v2.repository.js");
    const activeFake = createActiveGroupPrismaFake();
    const terminalFake = createTerminalGroupPrismaFake();

    await expect(
      repositoryModule.createPublicCatalogV2Repository(activeFake).createOrCoalescePublicationOperation(
        syntheticCreateInput({ idempotencyKey: "active-group-key" })
      )
    ).resolves.toMatchObject({
      id: "00000000-0000-4000-8000-0000000000a1",
      status: "running"
    });
    expect(activeFake.publicCatalogPublicationOperation.createCalls).toEqual([]);

    await expect(
      repositoryModule.createPublicCatalogV2Repository(terminalFake).createOrCoalescePublicationOperation(
        syntheticCreateInput({ idempotencyKey: "terminal-does-not-block" })
      )
    ).resolves.toMatchObject({
      id: "00000000-0000-4000-8000-0000000000c1",
      status: "queued"
    });
    expect(terminalFake.publicCatalogPublicationOperation.findFirstCalls).toEqual([
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
        where: {
          operationGroupKey: "public-catalog",
          status: { in: ["queued", "running", "retry_wait"] }
        }
      })
    ]);
    expect(terminalFake.publicCatalogPublicationOperation.createCalls).toHaveLength(1);
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

function createProjectionIntentPrismaFake() {
  const rows = [
    syntheticProjectionSite({
      id: "00000000-0000-4000-8000-0000000000p2",
      slug: "already-public",
      status: "published"
    }),
    syntheticProjectionSite({
      id: "00000000-0000-4000-8000-0000000000p1",
      slug: "published-target",
      status: "published"
    }),
    syntheticProjectionSite({
      id: "00000000-0000-4000-8000-0000000000d1",
      slug: "draft-target",
      status: "draft"
    })
  ];

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
      findMany: async (args: { take?: number; where?: Record<string, unknown> }) =>
        rows.filter((row) => projectionRowMatchesWhere(row, args.where ?? {})).slice(0, args.take ?? rows.length)
    }
  };
}

async function readProjectionSlugs(pages: AsyncIterable<{ items: Array<{ slug: string }> }>): Promise<string[]> {
  const slugs: string[] = [];

  for await (const page of pages) {
    slugs.push(...page.items.map((item) => item.slug));
  }

  return slugs;
}

function projectionRowMatchesWhere(row: ReturnType<typeof syntheticProjectionSite>, where: Record<string, unknown>): boolean {
  if (where.active !== undefined && row.active !== where.active) {
    return false;
  }
  if (where.deletedAt === null && row.deletedAt !== null) {
    return false;
  }
  if (typeof where.status === "string" && row.status !== where.status) {
    return false;
  }
  if (typeof where.id === "string" && row.id !== where.id) {
    return false;
  }
  if (isRecord(where.id) && typeof where.id.not === "string" && row.id === where.id.not) {
    return false;
  }
  if (Array.isArray(where.OR) && !where.OR.some((branch) => isRecord(branch) && projectionRowMatchesWhere(row, branch))) {
    return false;
  }
  if (Array.isArray(where.AND) && !where.AND.every((branch) => isRecord(branch) && projectionRowMatchesWhere(row, branch))) {
    return false;
  }

  return true;
}

function syntheticProjectionSite(overrides: { id: string; slug: string; status: string }) {
  return {
    active: true,
    category: {
      description: "Synthetic category",
      slug: "synthetic-category",
      sortOrder: 1,
      title: "Synthetic category"
    },
    categoryId: "00000000-0000-4000-8000-00000000ca00",
    createdAt: overrides.slug === "already-public"
      ? new Date("2026-08-03T17:00:02.000Z")
      : new Date("2026-08-03T17:00:01.000Z"),
    deletedAt: null,
    deliveryLabel: "Ready",
    demoMode: "modal",
    demoUrl: "https://example.test/demo",
    featured: false,
    features: ["Synthetic"],
    fullDescription: "Synthetic projection fixture",
    galleryImageAssets: [],
    id: overrides.id,
    previewImage: null,
    priceLabel: "Synthetic price",
    publishedAt: overrides.status === "published" ? new Date("2026-08-03T17:00:00.000Z") : null,
    shortDescription: "Synthetic short description",
    siteUrl: "https://example.test/site",
    slug: overrides.slug,
    sortOrder: overrides.slug === "already-public" ? 1 : 2,
    status: overrides.status,
    tags: ["synthetic"],
    title: overrides.slug,
    updatedAt: new Date("2026-08-03T17:00:00.000Z"),
    views: 0
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
        where: {
          id?: string;
          lockedAt?: { lte: Date };
          nextRetryAt?: { lte: Date };
          status?: string;
        };
      }) => {
        updateManyCalls.push(args);
        if (args.where.id === stored.id && args.where.status === stored.status) {
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

function createRetryClaimPrismaFake(now: Date) {
  const dueRetry = {
    ...syntheticOperationRecord(),
    createdAt: new Date("2026-08-03T17:00:00.000Z"),
    id: "00000000-0000-4000-8000-0000000000d1",
    nextRetryAt: now,
    status: "retry_wait"
  } as PublicationOperationRecord & { nextRetryAt: Date };
  const futureRetry = {
    ...syntheticOperationRecord(),
    createdAt: new Date("2026-08-03T16:59:00.000Z"),
    id: "00000000-0000-4000-8000-0000000000f1",
    nextRetryAt: new Date("2026-08-03T17:10:00.000Z"),
    status: "retry_wait"
  } as PublicationOperationRecord & { nextRetryAt: Date };
  let selected: (PublicationOperationRecord & { nextRetryAt: Date }) | null = null;
  const findFirstCalls: unknown[] = [];
  const updateManyCalls: unknown[] = [];

  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async () => syntheticOperationRecord(),
      findFirst: async (args: {
        where?: {
          OR?: unknown[];
          nextRetryAt?: { lte: Date };
          status?: string;
        };
      }) => {
        findFirstCalls.push(args);

        if (args.where?.status === "queued") {
          return null;
        }

        if (
          args.where?.status === "retry_wait" &&
          args.where.nextRetryAt?.lte.getTime() === now.getTime()
        ) {
          selected = dueRetry;

          return { ...dueRetry };
        }

        if (args.where?.OR !== undefined) {
          selected = futureRetry;

          return { ...futureRetry };
        }

        return null;
      },
      findUnique: async () => (selected === null ? null : { ...selected }),
      update: async () => syntheticOperationRecord(),
      updateMany: async (args: {
        data: Partial<PublicationOperationRecord>;
        where: { id?: string; nextRetryAt?: { lte: Date }; status?: string };
      }) => {
        updateManyCalls.push(args);
        if (
          selected !== null &&
          args.where.id === selected.id &&
          args.where.status === selected.status &&
          (args.where.nextRetryAt === undefined ||
            selected.nextRetryAt.getTime() <= args.where.nextRetryAt.lte.getTime())
        ) {
          Object.assign(selected, args.data);

          return { count: 1 };
        }

        return { count: 0 };
      },
      findFirstCalls,
      updateManyCalls
    },
    site: {
      findMany: async () => []
    }
  };
}

function createFinalizeLeasePrismaFake() {
  const stored = {
    ...syntheticOperationRecord(),
    leaseId: "current-lease",
    lockedAt: new Date("2026-08-03T17:05:00.000Z"),
    lockedBy: "current-worker",
    status: "running"
  };
  const updateCalls: unknown[] = [];
  const updateManyCalls: unknown[] = [];

  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async () => syntheticOperationRecord(),
      findFirst: async () => null,
      findUnique: async () => ({ ...stored }),
      update: async (args: { data: Partial<PublicationOperationRecord> }) => {
        updateCalls.push(args);
        Object.assign(stored, args.data);

        return { ...stored };
      },
      updateMany: async (args: {
        data: Partial<PublicationOperationRecord>;
        where: { id?: string; leaseId?: string; status?: string };
      }) => {
        updateManyCalls.push(args);
        if (args.where.id === stored.id && args.where.leaseId === stored.leaseId && args.where.status === "running") {
          Object.assign(stored, args.data);

          return { count: 1 };
        }

        return { count: 0 };
      },
      updateCalls,
      updateManyCalls
    },
    site: {
      findMany: async () => []
    }
  };
}

function createRetrySchedulePrismaFake() {
  const stored = {
    ...syntheticOperationRecord(),
    leaseId: "current-lease",
    lockedAt: new Date("2026-08-03T17:05:00.000Z"),
    lockedBy: "current-worker",
    status: "running"
  };
  const updateManyCalls: unknown[] = [];

  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async () => syntheticOperationRecord(),
      findFirst: async () => null,
      findUnique: async () => ({ ...stored }),
      update: async () => syntheticOperationRecord(),
      updateMany: async (args: {
        data: Partial<PublicationOperationRecord>;
        where: { id?: string; leaseId?: string; status?: string };
      }) => {
        updateManyCalls.push(args);
        if (args.where.id === stored.id && args.where.leaseId === stored.leaseId && args.where.status === "running") {
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

function createCheckpointLeasePrismaFake() {
  const stored = {
    ...syntheticOperationRecord(),
    leaseId: "current-lease",
    lockedAt: new Date("2026-08-03T17:05:00.000Z"),
    lockedBy: "current-worker",
    status: "running"
  };
  const updateManyCalls: unknown[] = [];

  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async () => syntheticOperationRecord(),
      findFirst: async () => null,
      findUnique: async () => ({ ...stored }),
      update: async () => syntheticOperationRecord(),
      updateMany: async (args: {
        data: Partial<PublicationOperationRecord>;
        where: { id?: string; leaseId?: string; status?: string };
      }) => {
        updateManyCalls.push(args);
        if (args.where.id === stored.id && args.where.leaseId === stored.leaseId && args.where.status === "running") {
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

function createTerminalFinalizePrismaFake() {
  const stored = {
    ...syntheticOperationRecord(),
    completedAt: new Date("2026-08-03T17:05:59.000Z"),
    leaseId: null,
    lockedAt: null,
    lockedBy: null,
    stage: "db_finalize",
    status: "succeeded"
  };
  const updateCalls: unknown[] = [];
  const updateManyCalls: unknown[] = [];

  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async () => syntheticOperationRecord(),
      findFirst: async () => null,
      findUnique: async () => ({ ...stored }),
      update: async (args: { data: Partial<PublicationOperationRecord> }) => {
        updateCalls.push(args);
        Object.assign(stored, args.data);

        return { ...stored };
      },
      updateMany: async (args: unknown) => {
        updateManyCalls.push(args);

        return { count: 0 };
      },
      updateCalls,
      updateManyCalls
    },
    site: {
      findMany: async () => []
    }
  };
}

function createStaleLeaseClaimPrismaFake(cutoff: Date) {
  const staleRunning = {
    ...syntheticOperationRecord(),
    id: "00000000-0000-4000-8000-0000000000e1",
    leaseId: "stale-lease",
    lockedAt: cutoff,
    lockedBy: "stale-worker",
    status: "running"
  };
  const freshRunning = {
    ...syntheticOperationRecord(),
    id: "00000000-0000-4000-8000-0000000000f2",
    leaseId: "fresh-lease",
    lockedAt: new Date("2026-08-03T17:05:01.000Z"),
    lockedBy: "fresh-worker",
    status: "running"
  };
  const findFirstCalls: unknown[] = [];
  const updateManyCalls: unknown[] = [];
  let selected: typeof staleRunning | null = null;

  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async () => syntheticOperationRecord(),
      findFirst: async (args: {
        where?: {
          lockedAt?: { lte: Date };
          nextRetryAt?: { lte: Date };
          status?: string;
        };
      }) => {
        findFirstCalls.push(args);

        if (
          args.where?.status === "running" &&
          args.where.lockedAt?.lte.getTime() === cutoff.getTime() &&
          freshRunning.lockedAt.getTime() > cutoff.getTime()
        ) {
          selected = staleRunning;

          return { ...staleRunning };
        }

        return null;
      },
      findUnique: async () => (selected === null ? null : { ...selected }),
      update: async () => syntheticOperationRecord(),
      updateMany: async (args: {
        data: Partial<PublicationOperationRecord>;
        where: { id?: string; lockedAt?: { lte: Date }; status?: string };
      }) => {
        updateManyCalls.push(args);

        if (
          selected !== null &&
          args.where.id === selected.id &&
          args.where.status === "running" &&
          args.where.lockedAt?.lte.getTime() === cutoff.getTime()
        ) {
          Object.assign(selected, args.data);

          return { count: 1 };
        }

        return { count: 0 };
      },
      findFirstCalls,
      updateManyCalls
    },
    site: {
      findMany: async () => []
    }
  };
}

function createIdempotencyReplayPrismaFake() {
  const existing = syntheticOperationRecord();
  const createCalls: unknown[] = [];

  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async (args: unknown) => {
        createCalls.push(args);

        return syntheticOperationRecord();
      },
      findFirst: async () => null,
      findUnique: async (args: { where?: { idempotencyKey?: string } }) =>
        args.where?.idempotencyKey === existing.idempotencyKey ? { ...existing } : null,
      update: async () => syntheticOperationRecord(),
      updateMany: async () => ({ count: 0 }),
      createCalls
    },
    site: {
      findMany: async () => []
    }
  };
}

function createActiveGroupPrismaFake() {
  const active = {
    ...syntheticOperationRecord(),
    id: "00000000-0000-4000-8000-0000000000a1",
    status: "running"
  };
  const createCalls: unknown[] = [];

  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async (args: unknown) => {
        createCalls.push(args);

        return syntheticOperationRecord();
      },
      findFirst: async () => ({ ...active }),
      findUnique: async () => null,
      update: async () => syntheticOperationRecord(),
      updateMany: async () => ({ count: 0 }),
      createCalls
    },
    site: {
      findMany: async () => []
    }
  };
}

function createTerminalGroupPrismaFake() {
  const createCalls: unknown[] = [];
  const findFirstCalls: unknown[] = [];

  return {
    publicCatalogActivationEvent: {
      create: async () => ({})
    },
    publicCatalogPublicationOperation: {
      create: async (args: unknown) => {
        createCalls.push(args);

        return {
          ...syntheticOperationRecord(),
          id: "00000000-0000-4000-8000-0000000000c1"
        };
      },
      findFirst: async (args: unknown) => {
        findFirstCalls.push(args);

        return null;
      },
      findUnique: async () => null,
      update: async () => syntheticOperationRecord(),
      updateMany: async () => ({ count: 0 }),
      createCalls,
      findFirstCalls
    },
    site: {
      findMany: async () => []
    }
  };
}

function syntheticCreateInput(overrides: Partial<CreatePublicationOperationInput> = {}): CreatePublicationOperationInput {
  return {
    action: "publish",
    actorUserId: null,
    idempotencyKey: "synthetic-key",
    operationGroupKey: "public-catalog",
    operationScope: "site:00000000-0000-4000-8000-000000000101",
    projectionHash: null,
    requestFingerprint: "a".repeat(64),
    requestId: "synthetic-request",
    siteId: "00000000-0000-4000-8000-000000000101",
    targetRevision: 1,
    trigger: "site_publish",
    ...overrides
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
    nextRetryAt: null,
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
