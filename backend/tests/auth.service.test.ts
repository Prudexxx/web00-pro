import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors.js";
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
      sessionId: "22222222-2222-4222-8222-222222222222",
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
  const repository: AuthRepository = {
    commitLoginSuccess: vi.fn().mockResolvedValue({
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      familyId: "44444444-4444-4444-8444-444444444444",
      id: "22222222-2222-4222-8222-222222222222",
      replacedBySessionId: null,
      revokedAt: null,
      tokenHash: "hashed-refresh-token",
      userId: user.id
    }),
    findActiveUserById: vi.fn().mockResolvedValue({
      email: user.email,
      id: user.id,
      role: user.role
    }),
    findSessionContext: vi.fn(),
    findRefreshSessionByTokenHash: vi.fn().mockResolvedValue(null),
    findUserByEmail: vi.fn(),
    revokeRefreshFamilyWithAudit: vi.fn().mockResolvedValue(undefined),
    rotateRefreshSession: vi.fn()
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
    randomUUID: vi
      .fn()
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")
      .mockReturnValueOnce("44444444-4444-4444-8444-444444444444")
      .mockReturnValueOnce("33333333-3333-4333-8333-333333333333"),
    refreshTokenTtlSeconds: 604800,
    refreshTokens,
    repository,
    serviceName: "web00-backend",
    ...overrides
  };
}

describe("AuthService", () => {
  it("uses CredentialVerifier and commits login only after access token signing succeeds", async () => {
    const dependencies = createDependencies();
    const service = createAuthService(dependencies);

    const result = await service.login({
      email: "admin@example.com",
      password: "password",
      requestId: "req_login"
    });

    expect(dependencies.credentials.verify).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "password"
    });
    expect(
      vi.mocked(dependencies.accessTokens.sign).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(dependencies.repository.commitLoginSuccess).mock.invocationCallOrder[0] ?? 0
    );
    expect(result).toMatchObject({
      accessToken: "access.jwt",
      refreshToken: "raw-refresh-token",
      user: {
        email: user.email,
        id: user.id,
        role: user.role
      }
    });
  });

  it("does not commit login rows when JWT signing fails", async () => {
    const dependencies = createDependencies({
      accessTokens: {
        sign: vi.fn().mockRejectedValue(new Error("jose failed")),
        verify: vi.fn()
      }
    });
    const service = createAuthService(dependencies);

    await expect(
      service.login({
        email: "admin@example.com",
        password: "password",
        requestId: "req_login"
      })
    ).rejects.toThrow("jose failed");
    expect(dependencies.repository.commitLoginSuccess).not.toHaveBeenCalled();
  });

  it("maps missing refresh tokens to REFRESH_REQUIRED", async () => {
    const service = createAuthService(createDependencies());

    await expect(
      service.refresh({ rawRefreshToken: null, requestId: "req_refresh" })
    ).rejects.toMatchObject({
      code: "REFRESH_REQUIRED",
      statusCode: 401
    });
  });

  it("returns USER_DISABLED when the current principal no longer has an active user", async () => {
    const dependencies = createDependencies({
      repository: {
        ...createDependencies().repository,
        findActiveUserById: vi.fn().mockResolvedValue(null)
      }
    });
    const service = createAuthService(dependencies);

    await expect(
      service.getMe({
        email: user.email,
        id: user.id,
        role: user.role,
        sessionId: "22222222-2222-4222-8222-222222222222",
        tokenId: "33333333-3333-4333-8333-333333333333"
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});
