import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { parseAuthEnv } from "../../src/config/auth-env.js";
import { assertTestDatabaseUrl, parseDatabaseEnv } from "../../src/config/database-env.js";
import type { AppEnv } from "../../src/config/env.js";
import { createPrismaClient } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { AppError } from "../../src/lib/errors.js";
import { createAccessTokenService } from "../../src/modules/auth/access-token.service.js";
import type { AuthService } from "../../src/modules/auth/auth.types.js";
import { createAuthRepository } from "../../src/modules/auth/auth.repository.js";
import { createAdminRouter } from "../../src/modules/admin/admin.routes.js";
import { createAdminAuditLogService } from "../../src/modules/admin/audit/audit-log.service.js";
import { createPrismaAdminAuditLogRepository } from "../../src/modules/admin/audit/audit-log.repository.js";
import { createAdminCategoryService } from "../../src/modules/admin/categories/category.service.js";
import { createPrismaAdminCategoryRepository } from "../../src/modules/admin/categories/category.repository.js";
import { createAdminSiteService } from "../../src/modules/admin/sites/site.service.js";
import { createPrismaAdminSiteRepository } from "../../src/modules/admin/sites/site.repository.js";
import { createPrismaPublicCatalogRepository } from "../../src/modules/public-catalog/public-catalog.repository.js";
import { createPublicCatalogService } from "../../src/modules/public-catalog/public-catalog.service.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};
const fixturePrefix = `b5-${Date.now()}-`;
const requestPrefix = "req_b5_admin_";
let prisma: PrismaClient;
let adminToken: string;
let editorToken: string;
let adminUserId: string;
let editorUserId: string;

beforeAll(async () => {
  const databaseEnv = parseDatabaseEnv(process.env);

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
  editorUserId = editor.id;
  adminToken = await signAccessToken(admin.id, "admin");
  editorToken = await signAccessToken(editor.id, "editor");
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe("admin API authorization and cache policy", () => {
  it("requires Bearer auth and applies admin cache headers before auth", async () => {
    const response = await request(createAdminApp())
      .get("/api/admin/sites")
      .expect("Cache-Control", "no-store")
      .expect(401);

    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("denies editor admin-only endpoints before query validation or lookup", async () => {
    const response = await request(createAdminApp())
      .get("/api/admin/audit-logs?limit=not-a-number")
      .set("Authorization", `Bearer ${editorToken}`)
      .expect("Cache-Control", "no-store")
      .expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});

describe("admin categories API", () => {
  it("returns editor category identifiers and blocks category delete when any site is linked", async () => {
    const category = await createCategory("category-read");
    await createSite({ categoryId: category.id, slug: "linked-draft" });
    await createSite({ categoryId: category.id, slug: "linked-soft", deleted: true });

    const list = await request(createAdminApp())
      .get("/api/admin/categories?includeCounts=true")
      .set("Authorization", `Bearer ${editorToken}`)
      .expect(200);

    expect(list.body.data[0]).toMatchObject({
      id: category.id,
      slug: category.slug,
      siteCount: 1
    });
    expect(list.body.data[0]).not.toHaveProperty("active");

    const response = await request(createAdminApp())
      .delete(`/api/admin/categories/${category.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect("Pragma", "no-cache")
      .expect(409);

    expect(response.body.error.code).toBe("CATEGORY_IN_USE");
  });

  it("creates, updates, deletes, and audits categories atomically", async () => {
    const create = await request(createAdminApp())
      .post("/api/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}category_create`)
      .send({ slug: `${fixturePrefix}created-category`, title: "Created" })
      .expect(201);

    expect(create.body.data).toMatchObject({
      active: true,
      slug: `${fixturePrefix}created-category`
    });

    await request(createAdminApp())
      .patch(`/api/admin/categories/${create.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}category_update`)
      .send({ title: "Updated" })
      .expect(200);

    await request(createAdminApp())
      .delete(`/api/admin/categories/${create.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}category_delete`)
      .expect(204);

    await expect(
      prisma.category.findUnique({ where: { id: create.body.data.id } })
    ).resolves.toBeNull();
    await expect(
      prisma.auditLog.count({
        where: {
          action: { in: ["category.create", "category.update", "category.delete"] },
          requestId: { startsWith: requestPrefix }
        }
      })
    ).resolves.toBe(3);
  });
});

describe("admin sites API", () => {
  it("creates private draft sites with identifiers, featured=false, and site.create_draft audit", async () => {
    const category = await createCategory("site-create-category");
    const create = await request(createAdminApp())
      .post("/api/admin/sites")
      .set("Authorization", `Bearer ${editorToken}`)
      .set("X-Request-Id", `${requestPrefix}site_create`)
      .send({
        categoryId: category.id,
        shortDescription: "Short",
        slug: `${fixturePrefix}site-create`,
        title: "Site Create"
      })
      .expect(201);

    expect(create.body.data).toMatchObject({
      categoryId: category.id,
      featured: false,
      status: "draft"
    });
    expect(create.body.data.category.id).toBe(category.id);
    expect(create.body.data).not.toHaveProperty("active");
    await expect(
      prisma.auditLog.count({
        where: { action: "site.create_draft", requestId: `${requestPrefix}site_create` }
      })
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { action: "site.create", requestId: `${requestPrefix}site_create` }
      })
    ).resolves.toBe(0);

    const rejected = await request(createAdminApp())
      .post("/api/admin/sites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        categoryId: category.id,
        featured: true,
        shortDescription: "Short",
        slug: `${fixturePrefix}site-create-featured`,
        title: "Bad"
      })
      .expect(400);

    expect(rejected.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("enforces PATCH permission semantics and explicit field mapping", async () => {
    const category = await createCategory("site-patch-category");
    const draft = await createSite({ categoryId: category.id, slug: "draft-patch" });
    const published = await createSite({
      categoryId: category.id,
      published: true,
      slug: "published-patch"
    });

    await request(createAdminApp())
      .patch(`/api/admin/sites/${draft.id}`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ title: "Editor Draft" })
      .expect(200);

    const editorDenied = await request(createAdminApp())
      .patch(`/api/admin/sites/${published.id}`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ title: "Editor Published" })
      .expect(403);

    expect(editorDenied.body.error.code).toBe("FORBIDDEN");

    await request(createAdminApp())
      .patch(`/api/admin/sites/${published.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ featured: true })
      .expect(200);

    const lifecycleRejected = await request(createAdminApp())
      .patch(`/api/admin/sites/${draft.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "published" })
      .expect(400);

    expect(lifecycleRejected.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("publishes, unpublishes, soft-deletes, restores, permanently deletes, and audits lifecycle safely", async () => {
    const category = await createCategory("site-lifecycle-category");
    const site = await createSite({ categoryId: category.id, slug: "lifecycle" });
    const app = createAdminApp();

    await request(app)
      .post(`/api/admin/sites/${site.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}site_publish`)
      .expect(200);
    await request(app).get(`/api/sites/${site.slug}`).expect(200);

    await request(app)
      .post(`/api/admin/sites/${site.id}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}site_unpublish`)
      .expect(200);
    await request(app).get(`/api/sites/${site.slug}`).expect(404);

    await request(app)
      .post(`/api/admin/sites/${site.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .delete(`/api/admin/sites/${site.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}site_soft_delete`)
      .expect(200);

    const deleted = await prisma.site.findUniqueOrThrow({ where: { id: site.id } });

    expect(deleted.status).toBe("draft");
    expect(deleted.active).toBe(false);
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.publishedAt).toBeNull();
    await request(app).get(`/api/sites/${site.slug}`).expect(404);

    await request(app)
      .post(`/api/admin/sites/${site.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}site_restore`)
      .expect(200);

    const restored = await prisma.site.findUniqueOrThrow({ where: { id: site.id } });

    expect(restored.status).toBe("draft");
    expect(restored.publishedAt).toBeNull();

    await request(app)
      .delete(`/api/admin/sites/${site.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .delete(`/api/admin/sites/${site.id}/permanent`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}site_permanent_delete`)
      .expect(204);

    await expect(prisma.site.findUnique({ where: { id: site.id } })).resolves.toBeNull();
    await expect(
      prisma.auditLog.count({
        where: {
          action: {
            in: [
              "site.publish",
              "site.unpublish",
              "site.soft_delete",
              "site.restore",
              "site.permanent_delete"
            ]
          },
          requestId: { startsWith: requestPrefix }
        }
      })
    ).resolves.toBe(5);
  });

  it("allows only one concurrent soft-delete success audit", async () => {
    const category = await createCategory("site-concurrency-category");
    const site = await createSite({ categoryId: category.id, published: true, slug: "race" });
    const app = createAdminApp();
    const responses = await Promise.all([
      request(app)
        .delete(`/api/admin/sites/${site.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Request-Id", `${requestPrefix}race_one`),
      request(app)
        .delete(`/api/admin/sites/${site.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Request-Id", `${requestPrefix}race_two`)
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 410]);
    await expect(
      prisma.auditLog.count({
        where: {
          action: "site.soft_delete",
          requestId: { in: [`${requestPrefix}race_one`, `${requestPrefix}race_two`] }
        }
      })
    ).resolves.toBe(1);
  });
});

describe("admin audit log API", () => {
  it("is admin-only and returns a safe audit projection", async () => {
    const category = await createCategory("audit-category");
    await request(createAdminApp())
      .post("/api/admin/sites")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}audit_site_create`)
      .send({
        categoryId: category.id,
        shortDescription: "Short",
        slug: `${fixturePrefix}audit-site`,
        title: "Audit Site"
      })
      .expect(201);

    await request(createAdminApp())
      .get("/api/admin/audit-logs")
      .set("Authorization", `Bearer ${editorToken}`)
      .expect(403);

    const response = await request(createAdminApp())
      .get("/api/admin/audit-logs?action=site.create_draft")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data[0]).toMatchObject({
      action: "site.create_draft",
      actor: {
        id: adminUserId,
        role: "admin"
      },
      requestId: `${requestPrefix}audit_site_create`
    });
    expect(JSON.stringify(response.body)).not.toContain("ipHash");
    expect(JSON.stringify(response.body)).not.toContain("userAgentHash");
  });
});

function createAdminApp() {
  const authEnv = parseAuthEnv(process.env);
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
  const publicCatalogService = createPublicCatalogService({
    repository: createPrismaPublicCatalogRepository({ prisma })
  });
  const adminRoutes = createAdminRouter({
    auditLogService: createAdminAuditLogService({
      repository: createPrismaAdminAuditLogRepository({ prisma })
    }),
    authService,
    categoryService: createAdminCategoryService({
      repository: createPrismaAdminCategoryRepository({ prisma })
    }),
    siteService: createAdminSiteService({
      repository: createPrismaAdminSiteRepository({ prisma }),
      now: () => new Date("2026-07-25T12:00:00.000Z")
    })
  });

  return createApp({
    adminRoutes,
    env: testEnv,
    publicCatalogService
  });
}

async function signAccessToken(userId: string, role: "admin" | "editor"): Promise<string> {
  const authEnv = parseAuthEnv(process.env);
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
      email: `${fixturePrefix}${role}@example.com`,
      passwordHash: "hash:not-used",
      role
    }
  });
}

async function createCategory(slug: string, active = true) {
  return prisma.category.create({
    data: {
      active,
      description: null,
      slug: `${fixturePrefix}${slug}`,
      title: slug,
      sortOrder: 1
    }
  });
}

async function createSite(input: {
  categoryId: string;
  deleted?: boolean;
  published?: boolean;
  slug: string;
}) {
  return prisma.site.create({
    data: {
      active: input.deleted ? false : true,
      categoryId: input.categoryId,
      deletedAt: input.deleted ? new Date("2026-07-25T00:00:00.000Z") : null,
      featured: false,
      features: [],
      galleryImages: [],
      publishedAt: input.published ? new Date("2026-07-24T00:00:00.000Z") : null,
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

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: userIds } },
        { requestId: { startsWith: requestPrefix } }
      ]
    }
  });
  await prisma.refreshSession.deleteMany({
    where: { userId: { in: userIds } }
  });
  await prisma.site.deleteMany({
    where: { slug: { startsWith: fixturePrefix } }
  });
  await prisma.category.deleteMany({
    where: { slug: { startsWith: fixturePrefix } }
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });
}
