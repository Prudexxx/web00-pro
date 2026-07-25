import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { parseAuthEnv } from "../../src/config/auth-env.js";
import type { AppEnv } from "../../src/config/env.js";
import { createPrismaClient } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createLogger } from "../../src/lib/logger.js";
import { createAccessTokenService } from "../../src/modules/auth/access-token.service.js";
import { createAuthAuditService } from "../../src/modules/auth/auth-audit.js";
import { createAuthCookieService } from "../../src/modules/auth/auth-cookie.js";
import { createCredentialVerifier } from "../../src/modules/auth/auth-credentials.service.js";
import { createAuthRepository } from "../../src/modules/auth/auth.repository.js";
import { createAuthRouter } from "../../src/modules/auth/auth.routes.js";
import { createAuthService } from "../../src/modules/auth/auth.service.js";
import { createRefreshTokenService } from "../../src/modules/auth/refresh-token.service.js";
import type { PasswordHasher } from "../../src/modules/auth/auth.types.js";
import { parseDatabaseEnv } from "../../src/config/database-env.js";
import { assertTestDatabaseUrl } from "../../src/config/database-env.js";

const testEnv: AppEnv = {
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  PORT: 3000,
  SERVICE_NAME: "web00-backend"
};
const fixturePrefix = "b4-auth-";
let prisma: PrismaClient;

const fastHasher: PasswordHasher = {
  hash: async (password) => `hash:${password}`,
  verify: async (hash, password) => hash === `hash:${password}`,
  verifyDummy: async () => undefined
};

function createAuthApp(env: AppEnv = testEnv) {
  const authEnv = parseAuthEnv(process.env);
  const repository = createAuthRepository({ prisma });
  const accessTokens = createAccessTokenService({
    audience: authEnv.JWT_AUDIENCE,
    issuer: authEnv.JWT_ISSUER,
    secret: authEnv.JWT_ACCESS_SECRET,
    ttlSeconds: authEnv.ACCESS_TOKEN_TTL_SECONDS
  });
  const refreshTokens = createRefreshTokenService();
  const cookies = createAuthCookieService({ nodeEnv: env.NODE_ENV });
  const service = createAuthService({
    accessTokenTtlSeconds: authEnv.ACCESS_TOKEN_TTL_SECONDS,
    accessTokens,
    audit: createAuthAuditService({
      fingerprintSecret: authEnv.AUTH_FINGERPRINT_SECRET
    }),
    clock: () => new Date("2026-07-25T00:00:00.000Z"),
    credentials: createCredentialVerifier({ hasher: fastHasher, repository }),
    environment: env.NODE_ENV,
    logger: createLogger({ env }),
    randomUUID,
    refreshTokenTtlSeconds: authEnv.REFRESH_TOKEN_TTL_SECONDS,
    refreshTokens,
    repository,
    serviceName: env.SERVICE_NAME
  });

  return createApp({
    authRoutes: createAuthRouter({
      authEnv,
      cookies,
      nodeEnv: env.NODE_ENV,
      service
    }),
    env
  });
}

async function cleanupFixtures() {
  const users = await prisma.user.findMany({
    select: { id: true },
    where: {
      email: {
        startsWith: fixturePrefix
      }
    }
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { requestId: { startsWith: "req_b4_auth_" } }
        ]
      }
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: userIds
        }
      }
    });
    return;
  }

  await prisma.auditLog.deleteMany({
    where: {
      requestId: { startsWith: "req_b4_auth_" }
    }
  });
}

async function createUser(email: string, password = "password", active = true) {
  return prisma.user.create({
    data: {
      active,
      email,
      passwordHash: await fastHasher.hash(password),
      role: "admin"
    }
  });
}

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

describe("auth API integration", () => {
  it("logs in with safe JSON access token and hashed refresh storage", async () => {
    const email = `${fixturePrefix}login@example.com`;
    const user = await createUser(email);
    const response = await request(createAuthApp())
      .post("/api/auth/login")
      .set("X-Request-Id", "req_b4_auth_login")
      .send({ email: ` ${email.toUpperCase()} `, password: "password" })
      .expect("Cache-Control", "no-store")
      .expect("Pragma", "no-cache")
      .expect(200);

    expect(response.body.data.user).toEqual({
      email,
      id: user.id,
      role: "admin"
    });
    expect(response.body.data.accessToken).toMatch(/^[A-Za-z0-9_-]+\./);
    expect(response.headers["set-cookie"]?.[0]).toContain("web00_refresh=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Strict");

    const session = await prisma.refreshSession.findFirstOrThrow({
      where: { userId: user.id }
    });

    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.tokenHash).not.toContain("web00_refresh");
    expect(await prisma.auditLog.count({ where: { action: "auth.login.success" } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt).not.toBeNull();
  });

  it("returns identical credential errors without session writes", async () => {
    const email = `${fixturePrefix}wrong@example.com`;
    await createUser(email);
    await createUser(`${fixturePrefix}inactive@example.com`, "password", false);
    const app = createAuthApp();
    const cases = [
      { email, password: "wrong" },
      { email: `${fixturePrefix}missing@example.com`, password: "password" },
      { email: `${fixturePrefix}inactive@example.com`, password: "password" }
    ];

    for (const body of cases) {
      const response = await request(app).post("/api/auth/login").send(body).expect(401);

      expect(response.body.error).toMatchObject({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password."
      });
    }

    expect(await prisma.refreshSession.count()).toBe(0);
  });

  it("refreshes once, preserves family expiry, and treats old token reuse as replay", async () => {
    const email = `${fixturePrefix}refresh@example.com`;
    const user = await createUser(email);
    const login = await request(createAuthApp())
      .post("/api/auth/login")
      .send({ email, password: "password" })
      .expect(200);
    const oldCookie = login.headers["set-cookie"]?.[0] ?? "";
    const original = await prisma.refreshSession.findFirstOrThrow({
      where: { userId: user.id }
    });

    const refresh = await request(createAuthApp())
      .post("/api/auth/refresh")
      .set("Cookie", oldCookie)
      .expect("Cache-Control", "no-store")
      .expect("Pragma", "no-cache")
      .expect(200);
    const rotated = await prisma.refreshSession.findUniqueOrThrow({
      where: { id: original.id }
    });
    const successor = await prisma.refreshSession.findFirstOrThrow({
      where: { id: rotated.replacedBySessionId ?? "" }
    });

    expect(refresh.body.data.accessToken).toBeDefined();
    expect(rotated.revokedAt).not.toBeNull();
    expect(successor.familyId).toBe(original.familyId);
    expect(successor.expiresAt.toISOString()).toBe(original.expiresAt.toISOString());

    const reuse = await request(createAuthApp())
      .post("/api/auth/refresh")
      .set("Cookie", oldCookie)
      .expect(401);

    expect(reuse.body.error.code).toBe("REFRESH_REUSED");
    expect(
      await prisma.refreshSession.count({
        where: { familyId: original.familyId, revokedAt: null }
      })
    ).toBe(0);
  });

  it("allows exactly one concurrent refresh success for the same token", async () => {
    const email = `${fixturePrefix}concurrent@example.com`;
    await createUser(email);
    const app = createAuthApp();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password" })
      .expect(200);
    const oldCookie = login.headers["set-cookie"]?.[0] ?? "";
    const responses = await Promise.all([
      request(app).post("/api/auth/refresh").set("Cookie", oldCookie),
      request(app).post("/api/auth/refresh").set("Cookie", oldCookie)
    ]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([200, 401]);
    expect(responses.some((response) => response.body.error?.code === "REFRESH_REUSED")).toBe(
      true
    );
  });

  it("logs out idempotently and keeps me protected by bearer auth", async () => {
    const email = `${fixturePrefix}me@example.com`;
    const user = await createUser(email);
    const login = await request(createAuthApp())
      .post("/api/auth/login")
      .send({ email, password: "password" })
      .expect(200);
    const cookie = login.headers["set-cookie"]?.[0] ?? "";
    const token = login.body.data.accessToken as string;

    await request(createAuthApp())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect("Cache-Control", "no-store")
      .expect(200);

    await prisma.user.update({ data: { active: false }, where: { id: user.id } });
    await request(createAuthApp())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    await request(createAuthApp()).post("/api/auth/logout").set("Cookie", cookie).expect(204);
    await request(createAuthApp()).post("/api/auth/logout").expect(204);
  });

  it("enforces login and refresh rate limits with safe error envelopes", async () => {
    const email = `${fixturePrefix}limit@example.com`;
    await createUser(email);
    const app = createAuthApp();

    for (let index = 0; index < 5; index += 1) {
      await request(app)
        .post("/api/auth/login")
        .send({ email, password: "wrong" })
        .expect(401);
    }

    const loginLimited = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "wrong" })
      .expect(429);

    expect(loginLimited.body.error.code).toBe("RATE_LIMITED");
    expect(loginLimited.body.error.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(JSON.stringify(loginLimited.body)).not.toContain(email);

    for (let index = 0; index < 30; index += 1) {
      await request(app).post("/api/auth/refresh").expect(401);
    }

    const refreshLimited = await request(app).post("/api/auth/refresh").expect(429);

    expect(refreshLimited.body.error.code).toBe("RATE_LIMITED");
    expect(refreshLimited.body.error.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
  });

  it("rejects wrong production Origin before credential verification", async () => {
    const productionEnv: AppEnv = {
      ...testEnv,
      NODE_ENV: "production"
    };
    const response = await request(createAuthApp(productionEnv))
      .post("/api/auth/login")
      .set("Origin", "https://wrong.example.com")
      .send({ email: `${fixturePrefix}origin@example.com`, password: "password" })
      .expect(403);

    expect(response.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });
});
