import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthEnv } from "../../src/config/auth-env.js";
import { assertTestDatabaseUrl } from "../../src/config/database-env.js";
import type { AppEnv } from "../../src/config/env.js";
import type { PublicCorsConfig } from "../../src/config/public-cors-env.js";
import type { StorageConfig } from "../../src/config/storage-env.js";
import { createAccessTokenService } from "../../src/modules/auth/access-token.service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/db/prisma.js";
import { createPublicCatalogV2Runtime, type PublicCatalogV2Runtime } from "../../src/modules/public-catalog-v2/public-catalog-v2.runtime.js";
import { buildPublicCatalogV2ActivePath } from "../../src/modules/public-catalog-v2/public-catalog-v2.paths.js";
import { createMemoryPublicCatalogV2Storage, type MemoryPublicCatalogV2Storage } from "../helpers/public-catalog-v2-memory-storage.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 0,
  SERVICE_NAME: "web00-backend"
};
const requestPrefix = `req_opv2_runtime_${Date.now()}_`;
const fixturePrefix = `opv2-runtime-${Date.now()}-`;
const baseDesiredRevision = 40_000 + Math.floor(Date.now() % 10_000);

let prisma: PrismaClient;
let databaseUrl: string;
let adminToken: string;
let adminUserId: string;

describe.sequential("public catalog v2 runtime application wiring", () => {
  beforeAll(async () => {
    const databaseEnv = {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL?.trim() ?? ""
    };

    assertTestDatabaseUrl(databaseEnv);
    assertLocalLoopbackTestDatabase(databaseEnv.TEST_DATABASE_URL);
    databaseUrl = databaseEnv.TEST_DATABASE_URL;
    prisma = createPrismaClient({ databaseUrl });
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await resetCatalogSettings();
    const admin = await prisma.user.create({
      data: {
        active: true,
        email: `${fixturePrefix}${randomUUID()}@example.test`,
        passwordHash: "hash:not-used",
        role: "admin"
      }
    });

    adminUserId = admin.id;
    adminToken = await signAccessToken(admin.id, "admin");
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  it("keeps the gated runtime dormant when V2 worker startup is disabled", async () => {
    const storage = createMemoryPublicCatalogV2Storage();
    const fakeRuntime = {
      reconcileOnce: vi.fn(),
      runOnce: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    } satisfies PublicCatalogV2Runtime;
    const started = await startRuntimeServer({
      publicCatalogV2Runtime: fakeRuntime,
      publicCatalogV2WorkerEnabled: false,
      storage
    });

    try {
      expect(started.publicCatalogV2Runtime).toBeUndefined();
      expect(fakeRuntime.start).not.toHaveBeenCalled();
      expect(await prisma.publicCatalogPublicationOperation.count({
        where: { requestId: { startsWith: requestPrefix } }
      })).toBe(0);
      const site = await createCanonicalSiteFixture();
      const disabledResponse = await postPublication(
        started.server,
        site.id,
        randomUUID(),
        "gate_off_disabled_post"
      ).expect(503);

      expect(disabledResponse.body.error).toMatchObject({
        code: "PUBLIC_CATALOG_V2_DISABLED"
      });
      expect(fakeRuntime.start).not.toHaveBeenCalled();
      expect(fakeRuntime.runOnce).not.toHaveBeenCalled();
      expect(fakeRuntime.reconcileOnce).not.toHaveBeenCalled();
      expect(await prisma.publicCatalogPublicationOperation.count({
        where: { requestId: { startsWith: requestPrefix } }
      })).toBe(0);
      expect(await prisma.auditLog.count({
        where: { requestId: `${requestPrefix}gate_off_disabled_post` }
      })).toBe(0);
      expect(storage.get(buildPublicCatalogV2ActivePath())).toBeNull();
    } finally {
      await stopRuntimeServer(started);
    }
  }, 15_000);

  it("constructs the gated runtime through server bootstrap without injecting a runtime instance", async () => {
    vi.resetModules();
    const storage = createMemoryPublicCatalogV2Storage();

    vi.doMock("../../src/modules/public-catalog-v2/public-catalog-v2.supabase-storage.js", () => ({
      createPublicCatalogV2SupabaseStorage: vi.fn(() => storage)
    }));

    const { startServer } = await import("../../src/server.js");
    const started = startServer({
      authEnv: testAuthEnv(),
      createPrisma: (() => prisma) as never,
      databaseEnv: { DATABASE_URL: databaseUrl },
      env: testEnv,
      logger: { log: vi.fn() },
      publicCorsConfig: testPublicCorsConfig(),
      publicCatalogV2WorkerEnabled: true,
      registerSignalHandlers: false,
      storageConfig: testStorageConfig()
    });
    const site = await createCanonicalSiteFixture();
    const idempotencyKey = randomUUID();

    try {
      if (!started.server.listening) {
        await once(started.server, "listening");
      }
      expect(started.publicCatalogV2Runtime).toBeDefined();

      const accepted = await postPublication(
        started.server,
        site.id,
        idempotencyKey,
        "server_constructed_runtime"
      ).expect(202);
      const operationId = accepted.body.data.operationId as string;

      await expect(expectRuntime(started).runOnce()).resolves.toMatchObject({
        claimed: true,
        operationId,
        status: "succeeded"
      });
      expect(storage.activePointerWrites).toBe(1);
    } finally {
      await stopRuntimeServer(started);
      vi.doUnmock("../../src/modules/public-catalog-v2/public-catalog-v2.supabase-storage.js");
      vi.resetModules();
    }
  }, 15_000);

  it("queues, runs, finalizes, reads status, and replays through real app bootstrap without duplicate activation", async () => {
    const storage = createMemoryPublicCatalogV2Storage();
    const started = await startRuntimeServer({ storage });
    const site = await createCanonicalSiteFixture();
    const idempotencyKey = randomUUID();

    try {
      const accepted = await request(started.server)
        .post(`/api/admin/sites/${site.id}/publication`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("Cookie", "web00-admin-session=synthetic")
        .set("X-CSRF-Token", "synthetic-csrf")
        .set("X-Request-Id", `${requestPrefix}publish`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ action: "publish" })
        .expect(202);

      expect(accepted.body.data).toMatchObject({
        buttonLabel: "Публикуется…",
        stableStatus: "Публикуется",
        status: "queued"
      });
      expect(JSON.stringify(accepted.body)).not.toMatch(/lease|lockedBy|lockedAt|requestFingerprint|csrf|manifest|bucket|sha256/i);
      const operationId = accepted.body.data.operationId as string;
      const queuedOperation = await prisma.publicCatalogPublicationOperation.findUniqueOrThrow({
        where: { id: operationId }
      });

      expect(queuedOperation).toMatchObject({
        leaseId: null,
        lockedAt: null,
        lockedBy: null,
        stage: "content_transaction",
        status: "queued"
      });
      expect(storage.get(buildPublicCatalogV2ActivePath())).toBeNull();

      await expect(started.publicCatalogV2Runtime?.runOnce()).resolves.toMatchObject({
        claimed: true,
        operationId,
        status: "succeeded"
      });

      const operation = await prisma.publicCatalogPublicationOperation.findUniqueOrThrow({
        where: { id: operationId }
      });
      const release = await prisma.publicCatalogRelease.findUniqueOrThrow({
        where: { revision: operation.targetRevision }
      });
      const activationEvents = await prisma.publicCatalogActivationEvent.findMany({
        where: { operationId },
        orderBy: { createdAt: "asc" }
      });
      const finalizedSite = await prisma.site.findUniqueOrThrow({
        include: {
          galleryImageAssets: { orderBy: { sortOrder: "asc" } },
          previewImage: true
        },
        where: { id: site.id }
      });
      const activePointer = storage.get(buildPublicCatalogV2ActivePath());
      const chunkPath = `public-catalog/v2/releases/revision-${operation.targetRevision}/chunks/chunk-000001.json`;
      const chunk = JSON.parse(storage.get(chunkPath)?.body ?? "{}") as {
        items: Array<{
          galleryImages: Array<{ assetId: string; sortOrder: number }>;
          previewImage: { assetId: string };
          slug: string;
        }>;
      };
      const publishedItem = chunk.items.find((item) => item.slug === site.slug);

      expect(operation).toMatchObject({
        completedAt: expect.any(Date),
        leaseId: null,
        lockedAt: null,
        lockedBy: null,
        stage: "db_finalize",
        status: "succeeded"
      });
      expect(release).toMatchObject({
        activePointerSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        activatedAt: expect.any(Date),
        status: "active"
      });
      expect(activationEvents).toHaveLength(1);
      expect(finalizedSite).toMatchObject({
        active: true,
        publishedAt: expect.any(Date),
        status: "published"
      });
      expect(storage.uploadOrder.at(-1)).toBe(buildPublicCatalogV2ActivePath());
      expect(activePointer).not.toBeNull();
      expect(publishedItem?.previewImage.assetId).toBe(site.previewAssetId);
      expect(publishedItem?.galleryImages.map((image) => image.assetId)).toEqual(site.galleryAssetIds);
      expect(finalizedSite.galleryImageAssets.map((image) => image.assetId)).toEqual(site.galleryAssetIds);

      const status = await request(started.server)
        .get(`/api/admin/public-catalog/operations/${operationId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(status.body.data).toMatchObject({
        buttonLabel: "Опубликовано",
        operationId,
        retryable: false,
        stableStatus: "Опубликовано",
        status: "succeeded"
      });
      expect(JSON.stringify(status.body)).not.toMatch(/lease|lockedBy|lockedAt|requestFingerprint|csrf|manifest|bucket|sha256/i);

      const replay = await request(started.server)
        .post(`/api/admin/sites/${site.id}/publication`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("Cookie", "web00-admin-session=synthetic")
        .set("X-CSRF-Token", "synthetic-csrf")
        .set("X-Request-Id", `${requestPrefix}publish_replay`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ action: "publish" })
        .expect(202);

      expect(replay.body.data).toMatchObject({
        buttonLabel: "Опубликовано",
        operationId,
        stableStatus: "Опубликовано",
        status: "succeeded"
      });
      await expect(prisma.publicCatalogRelease.count({
        where: { revision: operation.targetRevision }
      })).resolves.toBe(1);
      await expect(prisma.publicCatalogActivationEvent.count({
        where: { operationId }
      })).resolves.toBe(1);
      expect(storage.activePointerWrites).toBe(1);
    } finally {
      await stopRuntimeServer(started);
    }
  }, 15_000);

  it("retries a stale in-flight target and finalizes the newer desired revision once", async () => {
    const clock = createMutableClock("2026-08-04T12:00:00.000Z");
    let operationId = "";
    let staleTargetRevision = 0;
    let bumpedDesiredRevision = false;
    const storage = createMemoryPublicCatalogV2Storage({
      onBeforeImmutableUpload: async () => {
        if (bumpedDesiredRevision) {
          return;
        }
        bumpedDesiredRevision = true;
        const operation = await prisma.publicCatalogPublicationOperation.findUniqueOrThrow({
          where: { id: operationId }
        });
        staleTargetRevision = operation.targetRevision;
        await prisma.publicCatalogSetting.update({
          data: { desiredRevision: staleTargetRevision + 1 },
          where: { id: "public-catalog" }
        });
      }
    });
    const started = await startRuntimeServer({
      now: clock.now,
      storage
    });
    const site = await createCanonicalSiteFixture();

    try {
      const accepted = await postPublication(started.server, site.id, randomUUID(), "newer_desired_initial")
        .expect(202);
      operationId = accepted.body.data.operationId as string;

      await expect(started.publicCatalogV2Runtime?.runOnce()).resolves.toMatchObject({
        claimed: true,
        operationId,
        status: "retry_wait"
      });
      const staleAttempt = await prisma.publicCatalogPublicationOperation.findUniqueOrThrow({
        where: { id: operationId }
      });
      expect(staleAttempt).toMatchObject({
        status: "retry_wait",
        targetRevision: staleTargetRevision
      });
      expect(await prisma.publicCatalogRelease.count({
        where: {
          revision: staleTargetRevision,
          status: "active"
        }
      })).toBe(0);
      expect(await prisma.publicCatalogActivationEvent.count({ where: { operationId } })).toBe(0);
      expect(storage.activePointerWrites).toBe(0);

      clock.advance(30_000);
      await expect(started.publicCatalogV2Runtime?.runOnce()).resolves.toMatchObject({
        claimed: true,
        operationId,
        status: "succeeded"
      });
      const operation = await prisma.publicCatalogPublicationOperation.findUniqueOrThrow({
        where: { id: operationId }
      });
      const settings = await prisma.publicCatalogSetting.findUniqueOrThrow({
        where: { id: "public-catalog" }
      });

      expect(operation).toMatchObject({
        status: "succeeded",
        targetRevision: staleTargetRevision + 1
      });
      expect(settings.activeRevision).toBe(staleTargetRevision + 1);
      expect(settings.desiredRevision).toBe(staleTargetRevision + 1);
      expect(await prisma.publicCatalogRelease.count({
        where: { revision: staleTargetRevision + 1 }
      })).toBe(1);
      expect(await prisma.publicCatalogActivationEvent.count({ where: { operationId } })).toBe(1);
    } finally {
      await stopRuntimeServer(started);
    }
  }, 15_000);

  it("continues the same queued operation after application restart before any worker claim", async () => {
    const storage = createMemoryPublicCatalogV2Storage();
    let started = await startRuntimeServer({ storage });
    const site = await createCanonicalSiteFixture();
    const accepted = await postPublication(started.server, site.id, randomUUID(), "restart_before_claim")
      .expect(202);
    const operationId = accepted.body.data.operationId as string;

    await stopRuntimeServer(started);
    started = await startRuntimeServer({ storage });

    try {
      await expect(expectRuntime(started).runOnce()).resolves.toMatchObject({
        claimed: true,
        operationId,
        status: "succeeded"
      });
      await expect(prisma.publicCatalogActivationEvent.count({ where: { operationId } })).resolves.toBe(1);
      const operation = await prisma.publicCatalogPublicationOperation.findUniqueOrThrow({
        where: { id: operationId }
      });
      await expect(prisma.publicCatalogRelease.count({
        where: { revision: operation.targetRevision }
      })).resolves.toBe(1);
    } finally {
      await stopRuntimeServer(started);
    }
  }, 15_000);

  it("replays immutable artifacts after restart when active pointer upload failed", async () => {
    const clock = createMutableClock("2026-08-04T12:00:00.000Z");
    const storage = createMemoryPublicCatalogV2Storage({ failActiveUploads: 1 });
    let started = await startRuntimeServer({
      now: clock.now,
      storage
    });
    const site = await createCanonicalSiteFixture();
    const accepted = await postPublication(started.server, site.id, randomUUID(), "restart_before_active")
      .expect(202);
    const operationId = accepted.body.data.operationId as string;

    await expect(expectRuntime(started).runOnce()).resolves.toMatchObject({
      claimed: true,
      operationId,
      status: "retry_wait"
    });
    const retrying = await prisma.publicCatalogPublicationOperation.findUniqueOrThrow({
      where: { id: operationId }
    });
    expect(storage.activePointerWrites).toBe(0);
    await expect(prisma.publicCatalogRelease.findUniqueOrThrow({
      where: { revision: retrying.targetRevision }
    })).resolves.toMatchObject({ status: "verified" });

    await stopRuntimeServer(started);
    clock.advance(30_000);
    started = await startRuntimeServer({
      now: clock.now,
      storage
    });

    try {
      await expect(expectRuntime(started).runOnce()).resolves.toMatchObject({
        claimed: true,
        operationId,
        status: "succeeded"
      });
      expect(storage.activePointerWrites).toBe(1);
      await expect(prisma.publicCatalogRelease.count({
        where: { revision: retrying.targetRevision }
      })).resolves.toBe(1);
      await expect(prisma.publicCatalogActivationEvent.count({ where: { operationId } })).resolves.toBe(1);
    } finally {
      await stopRuntimeServer(started);
    }
  }, 15_000);

  it("reconciles a stale post-active operation after restart without a second active-pointer write", async () => {
    const clock = createMutableClock("2026-08-04T12:00:00.000Z");
    const storage = createMemoryPublicCatalogV2Storage({ failManifestFetchesAfterActive: 1 });
    let started = await startRuntimeServer({
      now: clock.now,
      storage
    });
    const site = await createCanonicalSiteFixture();
    const accepted = await postPublication(started.server, site.id, randomUUID(), "restart_after_active")
      .expect(202);
    const operationId = accepted.body.data.operationId as string;

    await expect(expectRuntime(started).runOnce()).resolves.toMatchObject({
      claimed: true,
      operationId,
      status: "retry_wait"
    });
    const retrying = await prisma.publicCatalogPublicationOperation.findUniqueOrThrow({
      where: { id: operationId }
    });
    expect(retrying.stage).toBe("db_finalize");
    expect(storage.activePointerWrites).toBe(1);
    await prisma.publicCatalogPublicationOperation.update({
      data: {
        leaseId: "synthetic-crashed-lease",
        lockedAt: new Date(clock.now().getTime() - 120_000),
        lockedBy: "synthetic-crashed-worker",
        nextRetryAt: null,
        status: "running"
      },
      where: { id: operationId }
    });

    await stopRuntimeServer(started);
    started = await startRuntimeServer({
      now: clock.now,
      storage
    });

    try {
      await expect(expectRuntime(started).reconcileOnce()).resolves.toEqual({
        failed: 0,
        reconciled: 1
      });
      expect(storage.activePointerWrites).toBe(1);
      await expect(prisma.publicCatalogRelease.findUniqueOrThrow({
        where: { revision: retrying.targetRevision }
      })).resolves.toMatchObject({ status: "active" });
      await expect(prisma.publicCatalogActivationEvent.count({ where: { operationId } })).resolves.toBe(1);
      await expect(prisma.publicCatalogPublicationOperation.findUniqueOrThrow({
        where: { id: operationId }
      })).resolves.toMatchObject({ status: "succeeded" });
    } finally {
      await stopRuntimeServer(started);
    }
  }, 15_000);

  it("replays a lost HTTP response with the same idempotency key before worker execution", async () => {
    const storage = createMemoryPublicCatalogV2Storage();
    const started = await startRuntimeServer({ storage });
    const site = await createCanonicalSiteFixture();
    const idempotencyKey = randomUUID();

    try {
      const first = await postPublication(started.server, site.id, idempotencyKey, "lost_response_first")
        .expect(202);
      const replay = await postPublication(started.server, site.id, idempotencyKey, "lost_response_replay")
        .expect(202);

      expect(replay.body.data).toMatchObject({
        operationId: first.body.data.operationId,
        status: "queued"
      });
      expect(await prisma.publicCatalogPublicationOperation.count({
        where: { idempotencyKey }
      })).toBe(1);
      expect(storage.activePointerWrites).toBe(0);
    } finally {
      await stopRuntimeServer(started);
    }
  }, 15_000);

  it("steals a stale lease and rejects the old worker checkpoint after restart", async () => {
    const clock = createMutableClock("2026-08-04T12:00:00.000Z");
    const storage = createMemoryPublicCatalogV2Storage();
    const started = await startRuntimeServer({
      now: clock.now,
      storage
    });
    const site = await createCanonicalSiteFixture();
    const accepted = await postPublication(started.server, site.id, randomUUID(), "stale_lease")
      .expect(202);
    const operationId = accepted.body.data.operationId as string;

    try {
      await prisma.publicCatalogPublicationOperation.update({
        data: {
          lastCheckpoint: { synthetic: "old-worker" },
          leaseId: "synthetic-old-worker-lease",
          lockedAt: new Date(clock.now().getTime() - 120_000),
          lockedBy: "synthetic-old-worker",
          nextRetryAt: null,
          stage: "projection_page",
          status: "running"
        },
        where: { id: operationId }
      });

      await expect(expectRuntime(started).runOnce()).resolves.toMatchObject({
        claimed: true,
        operationId,
        status: "succeeded"
      });
      const { createPublicCatalogV2Repository } = await import(
        "../../src/modules/public-catalog-v2/public-catalog-v2.repository.js"
      );
      const repository = createPublicCatalogV2Repository(prisma as never);

      await expect(repository.recordPublicationCheckpoint({
        lastCheckpoint: { synthetic: "old-worker-after-steal" },
        leaseId: "synthetic-old-worker-lease",
        operationId,
        stage: "db_finalize"
      })).rejects.toMatchObject({ code: "PUBLIC_CATALOG_V2_LEASE_NOT_HELD" });
      await expect(prisma.publicCatalogActivationEvent.count({ where: { operationId } })).resolves.toBe(1);
    } finally {
      await stopRuntimeServer(started);
    }
  }, 15_000);
});

async function startRuntimeServer(input: {
  now?: () => Date;
  publicCatalogV2Runtime?: PublicCatalogV2Runtime;
  publicCatalogV2WorkerEnabled?: boolean;
  storage: MemoryPublicCatalogV2Storage;
}) {
  const { startServer } = await import("../../src/server.js");
  const runtime = input.publicCatalogV2Runtime ?? createPublicCatalogV2Runtime({
    autoStartLoops: false,
    enabled: true,
    leaseId: () => `synthetic-lease-${randomUUID()}`,
    leaseTtlMs: 60_000,
    now: input.now ?? fixedNow,
    prisma,
    storage: input.storage,
    workerId: "web00-opv2-runtime-test-worker"
  });

  const started = startServer({
    authEnv: testAuthEnv(),
    createPrisma: (() => prisma) as never,
    databaseEnv: { DATABASE_URL: databaseUrl },
    env: testEnv,
    logger: { log: vi.fn() },
    publicCorsConfig: testPublicCorsConfig(),
    publicCatalogV2Runtime: runtime,
    publicCatalogV2WorkerEnabled: input.publicCatalogV2WorkerEnabled ?? true,
    registerSignalHandlers: false,
    storageConfig: testStorageConfig()
  });

  if (!started.server.listening) {
    await once(started.server, "listening");
  }

  return started;
}

function postPublication(server: Server, siteId: string, idempotencyKey: string, requestLabel: string) {
  return request(server)
    .post(`/api/admin/sites/${siteId}/publication`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("Cookie", "web00-admin-session=synthetic")
    .set("X-CSRF-Token", "synthetic-csrf")
    .set("X-Request-Id", `${requestPrefix}${requestLabel}`)
    .set("Idempotency-Key", idempotencyKey)
    .send({ action: "publish" });
}

function expectRuntime(started: { publicCatalogV2Runtime?: PublicCatalogV2Runtime }): PublicCatalogV2Runtime {
  expect(started.publicCatalogV2Runtime).toBeDefined();

  return started.publicCatalogV2Runtime!;
}

async function stopRuntimeServer(started: {
  publicCatalogV2Runtime?: PublicCatalogV2Runtime;
  server: Server;
}): Promise<void> {
  await started.publicCatalogV2Runtime?.stop();
  await new Promise<void>((resolve, reject) => {
    started.server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function createCanonicalSiteFixture(): Promise<{
  galleryAssetIds: string[];
  id: string;
  previewAssetId: string;
  slug: string;
}> {
  const category = await prisma.category.create({
    data: {
      active: true,
      description: "Runtime E2E synthetic category",
      slug: safeSlug("category"),
      sortOrder: 1,
      title: "Runtime E2E"
    }
  });
  const site = await prisma.site.create({
    data: {
      active: true,
      categoryId: category.id,
      deletedAt: null,
      featured: true,
      features: ["Runtime", "Synthetic"],
      fullDescription: "Synthetic OPV2 runtime publication fixture.",
      galleryImages: [],
      priceLabel: "Synthetic",
      publishedAt: null,
      shortDescription: "Synthetic runtime publication fixture.",
      siteUrl: "https://example.test/runtime-site",
      slug: safeSlug("site"),
      sortOrder: 10,
      status: "draft",
      tags: ["runtime"],
      title: "Runtime Publication"
    }
  });
  const previewAssetId = await createMediaAsset(site.id, "preview", "d", 0);
  const galleryAssetIds = [
    await createMediaAsset(site.id, "gallery", "a", 0),
    await createMediaAsset(site.id, "gallery", "b", 1),
    await createMediaAsset(site.id, "gallery", "c", 2)
  ];

  await prisma.sitePreviewImage.create({
    data: {
      assetId: previewAssetId,
      siteId: site.id,
      slot: "preview"
    }
  });
  await Promise.all(
    galleryAssetIds.map((assetId, sortOrder) =>
      prisma.siteGalleryImage.create({
        data: {
          alt: `Gallery ${sortOrder}`,
          assetId,
          siteId: site.id,
          slot: "gallery",
          sortOrder
        }
      })
    )
  );

  return {
    galleryAssetIds,
    id: site.id,
    previewAssetId,
    slug: site.slug
  };
}

async function createMediaAsset(
  siteId: string,
  slot: "gallery" | "preview",
  label: string,
  sortOrder: number
): Promise<string> {
  const assetId = randomUUID();
  const basePath = `sites/${siteId}/${slot}/${assetId}`;

  await prisma.siteImageAsset.create({
    data: {
      assetId,
      decodedFormat: "webp",
      height: 720 + sortOrder,
      siteId,
      slot,
      sourceMime: "image/png",
      sourceSha256: label.repeat(64),
      storagePath: `${basePath}/1200.webp`,
      variants: [
        {
          format: "webp",
          path: `${basePath}/1200.webp`,
          width: 1200
        },
        {
          format: "avif",
          path: `${basePath}/1200.avif`,
          width: 1200
        }
      ],
      width: 1200 + sortOrder
    }
  });

  return assetId;
}

async function cleanupFixtures(): Promise<void> {
  const operations = await prisma.publicCatalogPublicationOperation.findMany({
    select: { id: true, targetRevision: true },
    where: {
      OR: [
        { requestId: { startsWith: requestPrefix } },
        { operationScope: { contains: fixturePrefix } },
        { status: { in: ["queued", "running", "retry_wait"] } }
      ]
    }
  });
  const operationIds = operations.map((operation) => operation.id);
  const revisions = operations.map((operation) => operation.targetRevision);
  const syntheticRevisionWindow = Array.from(
    { length: 8 },
    (_unused, index) => baseDesiredRevision + index
  );
  const sites = await prisma.site.findMany({
    select: { id: true },
    where: { slug: { startsWith: fixturePrefix } }
  });
  const siteIds = sites.map((site) => site.id);
  const users = await prisma.user.findMany({
    select: { id: true },
    where: { email: { startsWith: fixturePrefix } }
  });
  const userIds = users.map((user) => user.id);

  await prisma.publicCatalogActivationEvent.deleteMany({
    where: {
      OR: [
        { operationId: { in: operationIds } },
        { requestId: { startsWith: requestPrefix } }
      ]
    }
  });
  await prisma.publicCatalogPublicationOperation.deleteMany({
    where: { id: { in: operationIds } }
  });
  await prisma.publicCatalogRelease.deleteMany({
    where: {
      revision: {
        in: [...new Set([...revisions, ...syntheticRevisionWindow])]
      }
    }
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: userIds } },
        { requestId: { startsWith: requestPrefix } }
      ]
    }
  });
  await prisma.siteGalleryImage.deleteMany({ where: { siteId: { in: siteIds } } });
  await prisma.sitePreviewImage.deleteMany({ where: { siteId: { in: siteIds } } });
  await prisma.siteImageAsset.deleteMany({ where: { siteId: { in: siteIds } } });
  await prisma.site.deleteMany({ where: { id: { in: siteIds } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: fixturePrefix } } });
  await prisma.refreshSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function resetCatalogSettings(): Promise<void> {
  await prisma.publicCatalogSetting.upsert({
    create: {
      activeRevision: 0,
      autoPublish: true,
      desiredRevision: baseDesiredRevision,
      id: "public-catalog",
      showDemoInModal: true
    },
    update: {
      activeRevision: 0,
      autoPublish: true,
      desiredRevision: baseDesiredRevision,
      showDemoInModal: true
    },
    where: { id: "public-catalog" }
  });
}

async function signAccessToken(userId: string, role: "admin" | "editor"): Promise<string> {
  const sessionId = randomUUID();
  const tokenId = randomUUID();

  await prisma.refreshSession.create({
    data: {
      expiresAt: new Date(Date.now() + 900_000),
      familyId: randomUUID(),
      id: sessionId,
      tokenHash: `synthetic-token-${tokenId}`,
      userId
    }
  });

  return createAccessTokenService({
    audience: "web00-admin",
    issuer: "web00-backend",
    secret: testAuthEnv().JWT_ACCESS_SECRET,
    ttlSeconds: 900
  }).sign({
    role,
    sessionId,
    tokenId,
    userId
  });
}

function testAuthEnv(): AuthEnv {
  const access = Buffer.alloc(32, 1);
  const fingerprint = Buffer.alloc(32, 2);

  return {
    ACCESS_TOKEN_TTL_SECONDS: 900,
    AUTH_FINGERPRINT_SECRET: fingerprint,
    AUTH_FINGERPRINT_SECRET_BASE64: fingerprint.toString("base64"),
    JWT_ACCESS_SECRET: access,
    JWT_ACCESS_SECRET_BASE64: access.toString("base64"),
    JWT_AUDIENCE: "web00-admin",
    JWT_ISSUER: "web00-backend",
    REFRESH_TOKEN_TTL_SECONDS: 604_800,
    TRUST_PROXY_HOPS: 0
  };
}

function testPublicCorsConfig(): PublicCorsConfig {
  return {
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    allowedOrigins: new Set(["https://prudexxx.github.io"]),
    maxOrigins: 10
  };
}

function testStorageConfig(): StorageConfig {
  return {
    bucket: "web00-catalog-images",
    credentials: {
      serviceRoleKey: "sb_secret_synthetic_not_used",
      supabaseUrl: "https://storage.web00.invalid"
    },
    publicBaseUrl: "https://storage.web00.invalid",
    workerEnabled: false,
    workerPollIntervalSeconds: 60
  };
}

function fixedNow(): Date {
  return new Date("2026-08-04T12:00:00.000Z");
}

function createMutableClock(initial: string): {
  advance(milliseconds: number): void;
  now(): Date;
} {
  let current = new Date(initial);

  return {
    advance(milliseconds) {
      current = new Date(current.getTime() + milliseconds);
    },
    now() {
      return new Date(current);
    }
  };
}

function safeSlug(label: string): string {
  return `${fixturePrefix}${label}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function assertLocalLoopbackTestDatabase(url: string): void {
  const parsed = new URL(url);

  expect(parsed.hostname).toBe("127.0.0.1");
  expect(parsed.port).toBe("5433");
  expect(parsed.pathname.slice(1)).toBe("web00_backend_test");
}
