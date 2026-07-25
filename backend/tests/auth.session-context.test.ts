import { describe, expect, it, vi } from "vitest";
import { createAuthService } from "../src/modules/auth/auth.service.js";
import type {
  AccessTokenService,
  AuthRepository,
  AuthServiceDependencies,
  CredentialVerifier,
  RefreshTokenService
} from "../src/modules/auth/auth.types.js";

const user = {
  active: true,
  email: "admin@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  passwordHash: "hash",
  role: "admin" as const
};
const sessionId = "22222222-2222-4222-8222-222222222222";

describe("AuthService session-context access-token authentication", () => {
  it("rejects access tokens for revoked refresh sessions", async () => {
    const dependencies = createDependencies({
      repository: {
        ...baseRepository(),
        findSessionContext: vi.fn().mockResolvedValue({
          session: {
            expiresAt: new Date("2026-08-01T00:00:00.000Z"),
            id: sessionId,
            revokedAt: new Date("2026-07-25T00:00:00.000Z"),
            userId: user.id
          },
          user
        })
      } as AuthRepository
    });

    await expect(
      createAuthService(dependencies).authenticateAccessToken("access.jwt")
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401
    });
  });

  it("rejects stale JWT role claims against the database role", async () => {
    const dependencies = createDependencies({
      repository: {
        ...baseRepository(),
        findSessionContext: vi.fn().mockResolvedValue({
          session: {
            expiresAt: new Date("2026-08-01T00:00:00.000Z"),
            id: sessionId,
            revokedAt: null,
            userId: user.id
          },
          user: {
            ...user,
            role: "editor"
          }
        })
      } as AuthRepository
    });

    await expect(
      createAuthService(dependencies).authenticateAccessToken("access.jwt")
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401
    });
  });
});

function createDependencies(
  overrides: Partial<AuthServiceDependencies> = {}
): AuthServiceDependencies {
  const accessTokens: AccessTokenService = {
    sign: vi.fn().mockResolvedValue("access.jwt"),
    verify: vi.fn().mockResolvedValue({
      audience: "web00-admin",
      expiresAtEpochSeconds: 1,
      issuedAtEpochSeconds: 0,
      issuer: "web00-backend",
      role: "admin",
      sessionId,
      subject: user.id,
      tokenId: "33333333-3333-4333-8333-333333333333"
    })
  };
  const credentials: CredentialVerifier = {
    verify: vi.fn().mockResolvedValue(user)
  };
  const refreshTokens: RefreshTokenService = {
    generateRawToken: vi.fn().mockReturnValue("raw-refresh-token"),
    hashRawToken: vi.fn().mockReturnValue("hashed-refresh-token")
  };

  return {
    accessTokenTtlSeconds: 900,
    accessTokens,
    audit: {
      createSafeAuditInput: vi.fn((input) => input),
      logFailedLogin: vi.fn()
    },
    clock: () => new Date("2026-07-25T00:00:00.000Z"),
    credentials,
    environment: "test",
    logger: { log: vi.fn() },
    randomUUID: vi.fn(),
    refreshTokenTtlSeconds: 604800,
    refreshTokens,
    repository: baseRepository(),
    serviceName: "web00-backend",
    ...overrides
  };
}

function baseRepository(): AuthRepository {
  return {
    commitLoginSuccess: vi.fn(),
    findActiveUserById: vi.fn().mockResolvedValue({
      email: user.email,
      id: user.id,
      role: user.role
    }),
    findSessionContext: vi.fn(),
    findRefreshSessionByTokenHash: vi.fn(),
    findUserByEmail: vi.fn(),
    revokeRefreshFamilyWithAudit: vi.fn(),
    rotateRefreshSession: vi.fn()
  } as AuthRepository;
}
