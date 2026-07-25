import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { parseAuthEnv } from "../../src/config/auth-env.js";
import { assertTestDatabaseUrl, parseDatabaseEnv } from "../../src/config/database-env.js";
import type { AppEnv } from "../../src/config/env.js";
import { createPrismaClient } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createAccessTokenService } from "../../src/modules/auth/access-token.service.js";
import { createAuthAuditService } from "../../src/modules/auth/auth-audit.js";
import { createAuthCookieService } from "../../src/modules/auth/auth-cookie.js";
import { createCredentialVerifier } from "../../src/modules/auth/auth-credentials.service.js";
import { createAuthRepository } from "../../src/modules/auth/auth.repository.js";
import { createAuthRouter } from "../../src/modules/auth/auth.routes.js";
import { createAuthService } from "../../src/modules/auth/auth.service.js";
import type { PasswordHasher } from "../../src/modules/auth/auth.types.js";
import { createRefreshTokenService } from "../../src/modules/auth/refresh-token.service.js";
import { createLogger } from "../../src/lib/logger.js";
import { createPrismaAdminUserRepository } from "../../src/modules/admin/users/user.repository.js";
import { createPrismaCliUserRepository } from "../../src/cli/cli-user.repository.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};
const fixturePrefix = `b6-auth-${Date.now()}-`;
let prisma: PrismaClient;

const fastHasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
  verifyDummy: async () => undefined
};

beforeAll(() => {
  const databaseEnv = parseDatabaseEnv(process.env);

  assertTestDatabaseUrl(databaseEnv);
  prisma = createPrismaClient({
    databaseUrl: databaseEnv.TEST_DATABASE_URL
  });
});

beforeEach(async () => {
  await cleanupFixtures();
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe("auth session invalidation integration", () => {
  it("rejects the old access token immediately after logout", async () => {
    await createUser(`${fixturePrefix}logout@example.com`);
    const app = createAuthApp();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: `${fixturePrefix}logout@example.com`, password: "password" })
      .expect(200);
    const accessToken = login.body.data.accessToken as string;
    const cookie = login.headers["set-cookie"]?.[0] ?? "";

    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(204);

    const rejected = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);

    expect(rejected.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects the predecessor access token immediately after refresh rotation", async () => {
    await createUser(`${fixturePrefix}refresh@example.com`);
    const app = createAuthApp();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: `${fixturePrefix}refresh@example.com`, password: "password" })
      .expect(200);
    const predecessorAccessToken = login.body.data.accessToken as string;
    const cookie = login.headers["set-cookie"]?.[0] ?? "";
    const refresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .expect(200);

    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refresh.body.data.accessToken}`)
      .expect(200);

    const rejected = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${predecessorAccessToken}`)
      .expect(401);

    expect(rejected.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an access token immediately after admin role change revokes sessions", async () => {
    const actor = await createUser(`${fixturePrefix}role-actor@example.com`, "admin");
    const target = await createUser(`${fixturePrefix}role-target@example.com`, "editor");
    const app = createAuthApp();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: target.email, password: "password" })
      .expect(200);
    const accessToken = login.body.data.accessToken as string;

    await createPrismaAdminUserRepository({ prisma }).changeRole({
      context: {
        actorUserId: actor.id,
        now: new Date("2026-07-25T00:00:00.000Z"),
        requestId: "req_b6_auth_role_change",
        source: "api"
      },
      id: target.id,
      role: "admin"
    });

    const rejected = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);

    expect(rejected.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an access token immediately after CLI password reset revokes sessions", async () => {
    const target = await createUser(`${fixturePrefix}password-target@example.com`, "admin");
    const app = createAuthApp();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: target.email, password: "password" })
      .expect(200);
    const accessToken = login.body.data.accessToken as string;

    await createPrismaCliUserRepository({ prisma }).setPassword({
      email: target.email,
      now: new Date("2026-07-25T00:00:00.000Z"),
      passwordHash: "hash:new-password",
      requestId: "cli:b6-auth-password-set"
    });

    const rejected = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);

    expect(rejected.body.error.code).toBe("UNAUTHORIZED");
  });
});

function createAuthApp() {
  const authEnv = parseAuthEnv(process.env);
  const repository = createAuthRepository({ prisma });
  const accessTokens = createAccessTokenService({
    audience: authEnv.JWT_AUDIENCE,
    issuer: authEnv.JWT_ISSUER,
    secret: authEnv.JWT_ACCESS_SECRET,
    ttlSeconds: authEnv.ACCESS_TOKEN_TTL_SECONDS
  });
  const service = createAuthService({
    accessTokenTtlSeconds: authEnv.ACCESS_TOKEN_TTL_SECONDS,
    accessTokens,
    audit: createAuthAuditService({
      fingerprintSecret: authEnv.AUTH_FINGERPRINT_SECRET
    }),
    clock: () => new Date("2026-07-25T00:00:00.000Z"),
    credentials: createCredentialVerifier({ hasher: fastHasher, repository }),
    environment: testEnv.NODE_ENV,
    logger: createLogger({ env: testEnv }),
    randomUUID,
    refreshTokenTtlSeconds: authEnv.REFRESH_TOKEN_TTL_SECONDS,
    refreshTokens: createRefreshTokenService(),
    repository,
    serviceName: testEnv.SERVICE_NAME
  });

  return createApp({
    authRoutes: createAuthRouter({
      authEnv,
      cookies: createAuthCookieService({ nodeEnv: testEnv.NODE_ENV }),
      nodeEnv: testEnv.NODE_ENV,
      service
    }),
    env: testEnv
  });
}

async function createUser(email: string, role: "admin" | "editor" = "admin") {
  return prisma.user.create({
    data: {
      active: true,
      email,
      passwordHash: await fastHasher.hash("password"),
      role
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
        { requestId: { startsWith: "req_b6_auth_" } }
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
