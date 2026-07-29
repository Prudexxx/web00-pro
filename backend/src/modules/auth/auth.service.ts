import { AppError } from "../../lib/errors.js";
import type {
  AuthenticatedPrincipal,
  AuthService,
  AuthServiceDependencies,
  LoginInput,
  LoginResult,
  LogoutInput,
  MeResult,
  RefreshInput,
  RefreshResult,
  SafeAuthUser,
  SafeAuditInput
} from "./auth.types.js";

export function createAuthService(
  dependencies: AuthServiceDependencies
): AuthService {
  return {
    authenticateAccessToken: async (token) => {
      const verified = await dependencies.accessTokens.verify(token);
      const context = await dependencies.repository.findSessionContext({
        sessionId: verified.sessionId,
        userId: verified.subject
      });

      if (context === null) {
        throw unauthorized();
      }
      if (context.session.userId !== verified.subject) {
        throw unauthorized();
      }
      if (context.session.revokedAt !== null) {
        throw unauthorized();
      }
      if (context.session.expiresAt.getTime() <= dependencies.clock().getTime()) {
        throw unauthorized();
      }
      if (!context.user.active) {
        throw userDisabled();
      }
      if (context.user.role !== verified.role) {
        throw unauthorized();
      }

      return {
        email: context.user.email,
        id: context.user.id,
        role: context.user.role,
        sessionId: verified.sessionId,
        tokenId: verified.tokenId
      };
    },
    getMe: async (principal) => getMe(principal, dependencies),
    login: async (input) => login(input, dependencies),
    logout: async (input) => logout(input, dependencies),
    refresh: async (input) => refresh(input, dependencies)
  };
}

async function login(
  input: LoginInput,
  dependencies: AuthServiceDependencies
): Promise<LoginResult> {
  let user;

  try {
    user = await dependencies.credentials.verify({
      email: input.email,
      password: input.password
    });
  } catch (error) {
    dependencies.audit.logFailedLogin({
      email: input.email,
      environment: dependencies.environment,
      logger: dependencies.logger,
      requestId: input.requestId,
      service: dependencies.serviceName,
      time: dependencies.clock()
    });
    throw error;
  }

  const now = dependencies.clock();
  const sessionId = dependencies.randomUUID();
  const familyId = dependencies.randomUUID();
  const tokenId = dependencies.randomUUID();
  const refreshToken = dependencies.refreshTokens.generateRawToken();
  const tokenHash = dependencies.refreshTokens.hashRawToken(refreshToken);
  const refreshExpiresAt = addSeconds(now, dependencies.refreshTokenTtlSeconds);
  const accessToken = await dependencies.accessTokens.sign({
    role: user.role,
    sessionId,
    tokenId,
    userId: user.id
  });

  await dependencies.repository.commitLoginSuccess({
    audit: dependencies.audit.createSafeAuditInput(
      loginAudit({
        input,
        user: toSafeAuthUser(user)
      })
    ),
    lastLoginAt: now,
    session: {
      expiresAt: refreshExpiresAt,
      familyId,
      id: sessionId,
      ipHash: input.ipHash ?? null,
      tokenHash,
      userAgentHash: input.userAgentHash ?? null,
      userId: user.id
    }
  });

  return {
    accessToken,
    accessTokenTtlSeconds: dependencies.accessTokenTtlSeconds,
    refreshExpiresAt,
    refreshMaxAgeSeconds: dependencies.refreshTokenTtlSeconds,
    refreshToken,
    user: toSafeAuthUser(user)
  };
}

async function refresh(
  input: RefreshInput,
  dependencies: AuthServiceDependencies
): Promise<RefreshResult> {
  if (input.rawRefreshToken === null) {
    throw refreshRequired();
  }

  const tokenHash = dependencies.refreshTokens.hashRawToken(input.rawRefreshToken);
  const current = await dependencies.repository.findRefreshSessionByTokenHash(tokenHash);
  const now = dependencies.clock();

  if (current === null) {
    throw refreshInvalid();
  }

  if (current.revokedAt !== null || current.replacedBySessionId !== null) {
    await dependencies.repository.revokeRefreshFamilyWithAudit({
      audit: dependencies.audit.createSafeAuditInput({
          action: "auth.refresh.reuse_detected",
          actorUserId: current.userId,
          entityId: current.id,
          ipHash: input.ipHash ?? null,
          requestId: input.requestId,
          userAgentHash: input.userAgentHash ?? null
        }),
      familyId: current.familyId,
      now
    });
    throw refreshReused();
  }

  if (current.expiresAt.getTime() <= now.getTime()) {
    throw refreshExpired();
  }

  const user = await dependencies.repository.findActiveUserById(current.userId);

  if (user === null) {
    await dependencies.repository.revokeRefreshFamilyWithAudit({
      audit: dependencies.audit.createSafeAuditInput({
        action: "auth.user_disabled",
        actorUserId: current.userId,
        entityId: current.id,
        requestId: input.requestId
      }),
      familyId: current.familyId,
      now
    });
    throw userDisabled();
  }

  const successorId = dependencies.randomUUID();
  const tokenId = dependencies.randomUUID();
  const rawRefreshToken = dependencies.refreshTokens.generateRawToken();
  const successorHash = dependencies.refreshTokens.hashRawToken(rawRefreshToken);
  const accessToken = await dependencies.accessTokens.sign({
    role: user.role,
    sessionId: successorId,
    tokenId,
    userId: user.id
  });
  const rotated = await dependencies.repository.rotateRefreshSession({
    currentSession: current,
    now,
    successor: {
      id: successorId,
      ipHash: input.ipHash ?? null,
      tokenHash: successorHash,
      userAgentHash: input.userAgentHash ?? null
    }
  });

  if (rotated.kind === "reuse") {
    await dependencies.repository.revokeRefreshFamilyWithAudit({
      audit: dependencies.audit.createSafeAuditInput({
        action: "auth.refresh.reuse_detected",
        actorUserId: current.userId,
        entityId: current.id,
        requestId: input.requestId
      }),
      familyId: current.familyId,
      now
    });
    throw refreshReused();
  }

  return {
    accessToken,
    accessTokenTtlSeconds: dependencies.accessTokenTtlSeconds,
    refreshExpiresAt: current.expiresAt,
    refreshMaxAgeSeconds: secondsUntil(now, current.expiresAt),
    refreshToken: rawRefreshToken,
    user
  };
}

async function logout(
  input: LogoutInput,
  dependencies: AuthServiceDependencies
): Promise<void> {
  if (input.rawRefreshToken === null) {
    return;
  }

  const session = await dependencies.repository.findRefreshSessionByTokenHash(
    dependencies.refreshTokens.hashRawToken(input.rawRefreshToken)
  );

  if (session === null) {
    return;
  }

  await dependencies.repository.revokeRefreshFamilyWithAudit({
    audit: dependencies.audit.createSafeAuditInput({
      action: "auth.logout",
      actorUserId: session.userId,
      entityId: session.id,
      requestId: input.requestId
    }),
    familyId: session.familyId,
    now: dependencies.clock()
  });
}

async function getMe(
  principal: AuthenticatedPrincipal,
  dependencies: AuthServiceDependencies
): Promise<MeResult> {
  const user = await dependencies.repository.findActiveUserById(principal.id);

  if (user === null) {
    throw userDisabled();
  }

  return { user };
}

function loginAudit(input: { input: LoginInput; user: SafeAuthUser }): SafeAuditInput {
  return {
    action: "auth.login.success",
    actorUserId: input.user.id,
    entityId: input.user.id,
    ipHash: input.input.ipHash ?? null,
    requestId: input.input.requestId,
    userAgentHash: input.input.userAgentHash ?? null
  };
}

function toSafeAuthUser(input: {
  email: string;
  id: string;
  role: "admin" | "editor";
}): SafeAuthUser {
  return {
    email: input.email,
    id: input.id,
    role: input.role
  };
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function secondsUntil(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

function refreshRequired(): AppError {
  return new AppError({
    code: "REFRESH_REQUIRED",
    message: "Refresh token is required.",
    statusCode: 401
  });
}

function refreshInvalid(): AppError {
  return new AppError({
    code: "REFRESH_INVALID",
    message: "Refresh token is invalid.",
    statusCode: 401
  });
}

function refreshExpired(): AppError {
  return new AppError({
    code: "REFRESH_EXPIRED",
    message: "Refresh token is expired.",
    statusCode: 401
  });
}

function refreshReused(): AppError {
  return new AppError({
    code: "REFRESH_REUSED",
    message: "Refresh token was already used.",
    statusCode: 401
  });
}

function userDisabled(): AppError {
  return new AppError({
    code: "USER_DISABLED",
    message: "User is disabled.",
    statusCode: 403
  });
}

function unauthorized(): AppError {
  return new AppError({
    code: "UNAUTHORIZED",
    message: "Authentication required.",
    statusCode: 401
  });
}
