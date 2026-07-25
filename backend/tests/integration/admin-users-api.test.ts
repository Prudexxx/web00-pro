import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { parseAuthEnv } from "../../src/config/auth-env.js";
import { assertTestDatabaseUrl, parseDatabaseEnv } from "../../src/config/database-env.js";
import type { AppEnv } from "../../src/config/env.js";
import { createPrismaClient } from "../../src/db/prisma.js";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.js";
import { AppError } from "../../src/lib/errors.js";
import { createAdminRouter } from "../../src/modules/admin/admin.routes.js";
import { createPrismaAdminAuditLogRepository } from "../../src/modules/admin/audit/audit-log.repository.js";
import { createAdminAuditLogService } from "../../src/modules/admin/audit/audit-log.service.js";
import { createPrismaAdminCategoryRepository } from "../../src/modules/admin/categories/category.repository.js";
import { createAdminCategoryService } from "../../src/modules/admin/categories/category.service.js";
import { createPrismaAdminSiteRepository } from "../../src/modules/admin/sites/site.repository.js";
import { createAdminSiteService } from "../../src/modules/admin/sites/site.service.js";
import { createPrismaAdminUserRepository } from "../../src/modules/admin/users/user.repository.js";
import { createAdminUserService } from "../../src/modules/admin/users/user.service.js";
import { createAccessTokenService } from "../../src/modules/auth/access-token.service.js";
import type { AuthService } from "../../src/modules/auth/auth.types.js";
import { createAuthRepository } from "../../src/modules/auth/auth.repository.js";
import {
  createConcurrencyBarrier,
  createUserCountGuardedPrismaClient,
  type SerializableAttemptEvent,
  type UserCountGuardEvent
} from "../helpers/concurrency-barrier.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};
const fixturePrefix = `b6-admin-${Date.now()}-`;
const requestPrefix = "req_b6_admin_users_";
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
  const admin = await createUser("admin", "admin");
  const editor = await createUser("editor", "editor");

  adminUserId = admin.id;
  editorUserId = editor.id;
  adminToken = await signAccessToken(admin.id, "admin");
  editorToken = await signAccessToken(editor.id, "editor");
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe("admin users API", () => {
  it("denies editors before validation or target lookup", async () => {
    const response = await request(createAdminUsersApp())
      .get("/api/admin/users/not-a-uuid")
      .set("Authorization", `Bearer ${editorToken}`)
      .expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("lists and reads users with safe fields only", async () => {
    const response = await request(createAdminUsersApp())
      .get("/api/admin/users?role=editor&active=true")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data).toEqual([
      expect.objectContaining({
        active: true,
        email: `${fixturePrefix}editor@example.com`,
        id: editorUserId,
        role: "editor"
      })
    ]);
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("tokenHash");

    await request(createAdminUsersApp())
      .get(`/api/admin/users/${editorUserId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
  });

  it("changes roles, revokes sessions, and writes safe audit", async () => {
    await createRefreshSession(editorUserId);

    const response = await request(createAdminUsersApp())
      .patch(`/api/admin/users/${editorUserId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}role`)
      .send({ role: "admin" })
      .expect(200);

    expect(response.body.data.role).toBe("admin");
    await expect(
      prisma.refreshSession.count({ where: { userId: editorUserId, revokedAt: null } })
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { action: "user.role_change", requestId: `${requestPrefix}role` }
      })
    ).resolves.toBe(1);
  });

  it("protects the last active admin and enables without creating sessions", async () => {
    const lastAdmin = await request(createAdminUsersApp())
      .post(`/api/admin/users/${adminUserId}/disable`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(403);

    expect(lastAdmin.body.error.code).toBe("SELF_DISABLE_FORBIDDEN");

    await prisma.user.update({
      data: { active: false },
      where: { id: editorUserId }
    });

    const enabled = await request(createAdminUsersApp())
      .post(`/api/admin/users/${editorUserId}/enable`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Request-Id", `${requestPrefix}enable`)
      .expect(200);

    expect(enabled.body.data.active).toBe(true);
    await expect(prisma.refreshSession.count({ where: { userId: editorUserId } })).resolves.toBe(
      0
    );
  });

  it("concurrent disable and demotion cannot remove both final active admins", async () => {
    const adminB = await createUser("race-admin-b", "admin");
    await createRefreshSession(adminUserId);
    await createRefreshSession(adminB.id);
    await expect(
      prisma.user.count({
        where: {
          active: true,
          email: { startsWith: fixturePrefix },
          role: "admin"
        }
      })
    ).resolves.toBe(2);
    await expect(
      prisma.user.count({
        where: {
          active: true,
          role: "admin"
        }
      })
    ).resolves.toBe(2);

    const databaseEnv = parseDatabaseEnv(process.env);
    const clientA = createPrismaClient({
      databaseUrl: databaseEnv.TEST_DATABASE_URL
    });
    const clientB = createPrismaClient({
      databaseUrl: databaseEnv.TEST_DATABASE_URL
    });
    const barrier = createConcurrencyBarrier(2, {
      label: "last-active-admin"
    });
    const attempts: SerializableAttemptEvent[] = [];
    const guardReads: UserCountGuardEvent[] = [];
    const disableRequestId = `${requestPrefix}race_disable`;
    const demoteRequestId = `${requestPrefix}race_demote`;

    try {
      const disableService = createAdminUserService({
        repository: createPrismaAdminUserRepository({
          prisma: createUserCountGuardedPrismaClient({
            barrier,
            onAttempt: (event) => attempts.push(event),
            onGuardRead: (event) => guardReads.push(event),
            participant: "disable-admin-a",
            prisma: clientA,
            shouldPauseAfterUserCount: ({ count, where }) =>
              count === 2 && isActiveAdminGuard(where)
          })
        })
      });
      const demoteService = createAdminUserService({
        repository: createPrismaAdminUserRepository({
          prisma: createUserCountGuardedPrismaClient({
            barrier,
            onAttempt: (event) => attempts.push(event),
            onGuardRead: (event) => guardReads.push(event),
            participant: "demote-admin-b",
            prisma: clientB,
            shouldPauseAfterUserCount: ({ count, where }) =>
              count === 2 && isActiveAdminGuard(where)
          })
        })
      });

      const results = await Promise.allSettled([
        disableService.disable(adminUserId, {
          actorUserId: adminB.id,
          now: new Date("2026-07-25T00:00:00.000Z"),
          requestId: disableRequestId,
          source: "api"
        }),
        demoteService.changeRole(adminB.id, "editor", {
          actorUserId: adminUserId,
          now: new Date("2026-07-25T00:00:00.000Z"),
          requestId: demoteRequestId,
          source: "api"
        })
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );

      expect(barrier.released).toBe(true);
      expect(new Set(barrier.arrivedParticipants)).toEqual(
        new Set(["disable-admin-a", "demote-admin-b"])
      );
      expect(guardReads).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ count: 2, participant: "disable-admin-a" }),
          expect.objectContaining({ count: 2, participant: "demote-admin-b" })
        ])
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toBeDefined();
      expect(rejected!.reason).toMatchObject({
        code: "LAST_ACTIVE_ADMIN"
      });
      expect(
        attempts.every(
          (event) => event.isolationLevel === Prisma.TransactionIsolationLevel.Serializable
        )
      ).toBe(true);
      expect(attempts.length).toBeGreaterThan(2);
      expect(countAttempts(attempts, "disable-admin-a")).toBeLessThanOrEqual(5);
      expect(countAttempts(attempts, "demote-admin-b")).toBeLessThanOrEqual(5);

      const disableSucceeded = results[0].status === "fulfilled";
      const successfulTargetId = disableSucceeded ? adminUserId : adminB.id;
      const failedTargetId = disableSucceeded ? adminB.id : adminUserId;
      const successfulRequestId = disableSucceeded ? disableRequestId : demoteRequestId;
      const failedRequestId = disableSucceeded ? demoteRequestId : disableRequestId;

      await expect(
        prisma.user.count({
          where: {
            active: true,
            email: { startsWith: fixturePrefix },
            role: "admin"
          }
        })
      ).resolves.toBe(1);
      await expect(
        prisma.auditLog.count({
          where: {
            action: { in: ["user.disable", "user.role_change"] },
            requestId: { in: [disableRequestId, demoteRequestId] }
          }
        })
      ).resolves.toBe(1);
      await expect(
        prisma.auditLog.count({
          where: { requestId: failedRequestId }
        })
      ).resolves.toBe(0);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { requestId: successfulRequestId }
      });
      expect(audit.entityId).toBe(successfulTargetId);
      await expect(
        prisma.refreshSession.count({
          where: { revokedAt: null, userId: successfulTargetId }
        })
      ).resolves.toBe(0);
      await expect(
        prisma.refreshSession.count({
          where: { revokedAt: null, userId: failedTargetId }
        })
      ).resolves.toBe(1);
    } finally {
      await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    }
  });
});

function createAdminUsersApp() {
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
  const adminRoutes = createAdminRouter({
    auditLogService: createAdminAuditLogService({
      repository: createPrismaAdminAuditLogRepository({ prisma })
    }),
    authService,
    categoryService: createAdminCategoryService({
      repository: createPrismaAdminCategoryRepository({ prisma })
    }),
    siteService: createAdminSiteService({
      repository: createPrismaAdminSiteRepository({ prisma })
    }),
    userService: createAdminUserService({
      repository: createPrismaAdminUserRepository({ prisma })
    })
  });

  return createApp({
    adminRoutes,
    env: testEnv
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

async function createUser(label: string, role: "admin" | "editor") {
  return prisma.user.create({
    data: {
      active: true,
      email: `${fixturePrefix}${label}@example.com`,
      passwordHash: "hash:not-used",
      role
    }
  });
}

async function createRefreshSession(userId: string) {
  return prisma.refreshSession.create({
    data: {
      expiresAt: new Date("2026-08-25T00:00:00.000Z"),
      familyId: randomUUID(),
      id: randomUUID(),
      tokenHash: randomUUID().replaceAll("-", ""),
      userId
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
  await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });
}

function isActiveAdminGuard(where: unknown): boolean {
  return (
    typeof where === "object" &&
    where !== null &&
    "active" in where &&
    "role" in where &&
    (where as { active?: unknown; role?: unknown }).active === true &&
    (where as { active?: unknown; role?: unknown }).role === "admin"
  );
}

function countAttempts(events: SerializableAttemptEvent[], participant: string): number {
  return events.filter((event) => event.participant === participant).length;
}
