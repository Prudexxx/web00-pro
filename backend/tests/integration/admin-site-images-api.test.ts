import { randomUUID } from "node:crypto";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { parseAuthEnv } from "../../src/config/auth-env.js";
import { assertTestDatabaseUrl, parseTestDatabaseEnv } from "../../src/config/database-env.js";
import type { AppEnv } from "../../src/config/env.js";
import { createPrismaClient } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { AppError } from "../../src/lib/errors.js";
import { createAdminRouter } from "../../src/modules/admin/admin.routes.js";
import { createAdminAuditLogService } from "../../src/modules/admin/audit/audit-log.service.js";
import { createPrismaAdminAuditLogRepository } from "../../src/modules/admin/audit/audit-log.repository.js";
import { createPrismaAdminCategoryRepository } from "../../src/modules/admin/categories/category.repository.js";
import { createAdminCategoryService } from "../../src/modules/admin/categories/category.service.js";
import { createSiteImageService } from "../../src/modules/admin/images/site-image.service.js";
import { createPrismaSiteImageRepository } from "../../src/modules/admin/images/site-image.repository.js";
import { createAdminSiteService } from "../../src/modules/admin/sites/site.service.js";
import { createPrismaAdminSiteRepository } from "../../src/modules/admin/sites/site.repository.js";
import { createAccessTokenService } from "../../src/modules/auth/access-token.service.js";
import type { AuthService } from "../../src/modules/auth/auth.types.js";
import { createAuthRepository } from "../../src/modules/auth/auth.repository.js";
import { createAssetUploadCoordinator } from "../../src/modules/images/asset-upload-coordinator.js";
import { createManagedImageUrlPolicy } from "../../src/modules/images/image-paths.js";
import { createSharpImageProcessor } from "../../src/modules/images/image-processor.js";
import type { ImageStorage } from "../../src/modules/images/image-storage.js";
import { createBusboyMultipartImageParser } from "../../src/modules/images/multipart-image-parser.js";
import { createPrismaStorageCleanupRepository } from "../../src/modules/storage-cleanup/storage-cleanup.repository.js";
import { createPrismaPublicCatalogRepository } from "../../src/modules/public-catalog/public-catalog.repository.js";
import { createPublicCatalogService } from "../../src/modules/public-catalog/public-catalog.service.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};
const fixturePrefix = `b7-${Date.now()}-`;
const requestPrefix = "req_b7_images_";
const publicBaseUrl = "https://storage.example.test";
let prisma: PrismaClient;
let adminToken: string;
let editorToken: string;
let adminUserId: string;

beforeAll(async () => {
  const databaseEnv = parseTestDatabaseEnv(process.env);

  assertTestDatabaseUrl(databaseEnv);
  prisma = createPrismaClient({
    databaseUrl: databaseEnv.TEST_DATABASE_URL
  });
  await cleanupFixtures();
});

beforeEach(async () => {
  await cleanupFixtures();
  const admin = await createUser("admin");
  const editor = await createUser("editor");

  adminUserId = admin.id;
  adminToken = await signAccessToken(admin.id, "admin");
  editorToken = await signAccessToken(editor.id, "editor");
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe("admin site image API", () => {
  it("requires auth before site lookup on image routes", async () => {
    const app = createImageApp(createFakeStorage());

    const response = await request(app)
      .put(`/api/admin/sites/${randomUUID()}/images/preview`)
      .expect("Cache-Control", "no-store")
      .expect(401);

    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("uploads, replays, reorders, and deletes preview/gallery images through fake Storage", async () => {
    const storage = createFakeStorage();
    const app = createImageApp(storage);
    const category = await createCategory("image-category");
    const site = await createSite({ categoryId: category.id, slug: "image-site" });
    const previewAssetId = randomUUID();
    const galleryAssetId = randomUUID();
    const image = await pngFixture();

    const preview = await request(app)
      .put(`/api/admin/sites/${site.id}/images/preview`)
      .set("Authorization", `Bearer ${editorToken}`)
      .set("X-Request-Id", `${requestPrefix}preview`)
      .field("clientFileId", previewAssetId)
      .attach("image", image, {
        contentType: "image/png",
        filename: "ignored.png"
      })
      .expect(200);

    expect(preview.body.data).toMatchObject({
      replaced: false,
      replayed: false,
      previewImage: {
        assetId: previewAssetId
      }
    });
    expect(JSON.stringify(preview.body)).not.toContain("ignored.png");
    expect(storage.uploadObject).toHaveBeenCalledTimes(6);
    await expect(
      prisma.site.findUniqueOrThrow({ where: { id: site.id } })
    ).resolves.toMatchObject({
      previewImageUrl: expect.stringContaining(`/preview/${previewAssetId}/1200.webp`)
    });

    await request(app)
      .put(`/api/admin/sites/${site.id}/images/preview`)
      .set("Authorization", `Bearer ${editorToken}`)
      .field("clientFileId", previewAssetId)
      .attach("image", image, {
        contentType: "image/png",
        filename: "ignored-again.png"
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.replayed).toBe(true);
      });

    const gallery = await request(app)
      .post(`/api/admin/sites/${site.id}/images/gallery`)
      .set("Authorization", `Bearer ${editorToken}`)
      .set("X-Request-Id", `${requestPrefix}gallery`)
      .field("clientFileId", galleryAssetId)
      .field("alt", " Gallery alt ")
      .attach("image", image, {
        contentType: "image/png",
        filename: "gallery.png"
      })
      .expect(201);

    expect(gallery.body.data.image).toMatchObject({
      alt: "Gallery alt",
      assetId: galleryAssetId,
      sortOrder: 0
    });

    const reordered = await request(app)
      .patch(`/api/admin/sites/${site.id}/images/gallery`)
      .set("Authorization", `Bearer ${editorToken}`)
      .set("X-Request-Id", `${requestPrefix}gallery_reorder`)
      .send({
        items: [{ alt: "", assetId: galleryAssetId, sortOrder: 10 }]
      })
      .expect(200);

    expect(reordered.body.data.images[0]).toMatchObject({
      alt: "image-site",
      assetId: galleryAssetId,
      sortOrder: 0
    });

    await request(app)
      .delete(`/api/admin/sites/${site.id}/images/gallery/${galleryAssetId}`)
      .set("Authorization", `Bearer ${editorToken}`)
      .set("X-Request-Id", `${requestPrefix}gallery_delete`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.images).toEqual([]);
      });
    await expect(
      prisma.auditLog.count({
        where: {
          action: {
            in: [
              "site.image.preview_replace",
              "site.image.gallery_add",
              "site.image.gallery_update",
              "site.image.gallery_delete"
            ]
          },
          requestId: { startsWith: requestPrefix }
        }
      })
    ).resolves.toBe(4);
  });

  it("blocks published preview deletion and editor published replacement", async () => {
    const app = createImageApp(createFakeStorage());
    const category = await createCategory("published-category");
    const site = await createSite({
      categoryId: category.id,
      previewImageUrl:
        `${publicBaseUrl}/storage/v1/object/public/web00-catalog-images/sites/${randomUUID()}/preview/${randomUUID()}/1200.webp`,
      published: true,
      slug: "published-image-site"
    });

    await request(app)
      .delete(`/api/admin/sites/${site.id}/images/preview`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(409)
      .expect((response) => {
        expect(response.body.error.code).toBe("SITE_PREVIEW_REQUIRED");
      });

    await request(app)
      .put(`/api/admin/sites/${site.id}/images/preview`)
      .set("Authorization", `Bearer ${editorToken}`)
      .field("clientFileId", randomUUID())
      .attach("image", await pngFixture(), {
        contentType: "image/png",
        filename: "published.png"
      })
      .expect(403);
  });
});

function createImageApp(storage: ImageStorage) {
  const authEnv = parseAuthEnv(process.env, { nodeEnv: testEnv.NODE_ENV });
  const authRepository = createAuthRepository({ prisma });
  const accessTokens = createAccessTokenService({
    audience: authEnv.JWT_AUDIENCE,
    issuer: authEnv.JWT_ISSUER,
    secret: authEnv.JWT_ACCESS_SECRET,
    ttlSeconds: authEnv.ACCESS_TOKEN_TTL_SECONDS
  });
  const authService: Pick<AuthService, "authenticateAccessToken"> = {
    authenticateAccessToken: async (token) => {
      const verified = await accessTokens.verify(token);
      const user = await authRepository.findActiveUserById(verified.subject);

      if (user === null) {
        throw new AppError({
          code: "USER_DISABLED",
          message: "User is disabled.",
          statusCode: 403
        });
      }

      return {
        ...user,
        sessionId: verified.sessionId,
        tokenId: verified.tokenId
      };
    }
  };
  const imageService = createSiteImageService({
    cleanup: createPrismaStorageCleanupRepository({ prisma }),
    coordinator: createAssetUploadCoordinator(),
    imageUrlPolicy: createManagedImageUrlPolicy({
      bucket: "web00-catalog-images",
      publicBaseUrl
    }),
    processor: createSharpImageProcessor(),
    repository: createPrismaSiteImageRepository({ prisma }),
    storage
  });
  const adminRoutes = createAdminRouter({
    auditLogService: createAdminAuditLogService({
      repository: createPrismaAdminAuditLogRepository({ prisma })
    }),
    authService,
    categoryService: createAdminCategoryService({
      repository: createPrismaAdminCategoryRepository({ prisma })
    }),
    imageParser: createBusboyMultipartImageParser(),
    imageService,
    siteService: createAdminSiteService({
      now: () => new Date("2026-07-26T00:00:00.000Z"),
      repository: createPrismaAdminSiteRepository({ prisma })
    })
  });

  return createApp({
    adminRoutes,
    env: testEnv,
    publicCatalogService: createPublicCatalogService({
      repository: createPrismaPublicCatalogRepository({ prisma })
    })
  });
}

function createFakeStorage(): ImageStorage {
  return {
    createBucket: vi.fn(),
    getPublicUrl: vi.fn(
      (path) =>
        `${publicBaseUrl}/storage/v1/object/public/web00-catalog-images/${path}`
    ),
    inspectBucket: vi.fn(),
    inspectObjects: vi.fn(async (paths) => ({
      existingPaths: [],
      missingPaths: [...paths]
    })),
    removeObjects: vi.fn(),
    uploadObject: vi.fn(async (input) => ({
      path: input.path,
      publicUrl: `${publicBaseUrl}/storage/v1/object/public/web00-catalog-images/${input.path}`
    }))
  };
}

async function pngFixture(): Promise<Buffer> {
  return sharp({
    create: {
      background: { alpha: 1, b: 64, g: 128, r: 192 },
      channels: 3,
      height: 600,
      width: 1200
    }
  })
    .png()
    .toBuffer();
}

async function signAccessToken(userId: string, role: "admin" | "editor"): Promise<string> {
  const authEnv = parseAuthEnv(process.env, { nodeEnv: testEnv.NODE_ENV });
  const accessTokens = createAccessTokenService({
    audience: authEnv.JWT_AUDIENCE,
    issuer: authEnv.JWT_ISSUER,
    secret: authEnv.JWT_ACCESS_SECRET,
    ttlSeconds: authEnv.ACCESS_TOKEN_TTL_SECONDS
  });

  return accessTokens.sign({
    role,
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    userId
  });
}

async function createUser(role: "admin" | "editor") {
  return prisma.user.create({
    data: {
      active: true,
      email: `${fixturePrefix}${role}-${randomUUID()}@example.com`,
      passwordHash: "hash:not-used",
      role
    }
  });
}

async function createCategory(slug: string) {
  return prisma.category.create({
    data: {
      active: true,
      description: null,
      slug: `${fixturePrefix}${slug}`,
      sortOrder: 1,
      title: slug
    }
  });
}

async function createSite(input: {
  categoryId: string;
  previewImageUrl?: string | null;
  published?: boolean;
  slug: string;
}) {
  return prisma.site.create({
    data: {
      active: true,
      categoryId: input.categoryId,
      featured: false,
      features: [],
      galleryImages: [],
      previewImageUrl: input.previewImageUrl ?? null,
      publishedAt: input.published ? new Date("2026-07-25T00:00:00.000Z") : null,
      shortDescription: "Short",
      slug: `${fixturePrefix}${input.slug}`,
      status: input.published ? "published" : "draft",
      tags: [],
      title: input.slug
    }
  });
}

async function cleanupFixtures(): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true },
    where: { email: { startsWith: fixturePrefix } }
  });
  const userIds = users.map((user) => user.id);
  const sites = await prisma.site.findMany({
    select: { id: true },
    where: { slug: { startsWith: fixturePrefix } }
  });
  const siteIds = sites.map((site) => site.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: userIds } },
        { entityId: { in: siteIds } },
        { requestId: { startsWith: requestPrefix } }
      ]
    }
  });
  await prisma.storageCleanupJob.deleteMany({
    where: { entityId: { in: siteIds } }
  });
  await prisma.refreshSession.deleteMany({
    where: { userId: { in: userIds } }
  });
  await prisma.site.deleteMany({
    where: { id: { in: siteIds } }
  });
  await prisma.category.deleteMany({
    where: { slug: { startsWith: fixturePrefix } }
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });
}
