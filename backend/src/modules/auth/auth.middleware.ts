import type { RequestHandler } from "express";
import { AppError } from "../../lib/errors.js";
import type {
  AccessTokenService,
  AuthRepository,
  AuthRequest
} from "./auth.types.js";

export interface AuthMiddlewareOptions {
  accessTokens: AccessTokenService;
  clock?: () => Date;
  repository: Pick<AuthRepository, "findSessionContext">;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions): RequestHandler {
  return async (request, _response, next) => {
    try {
      const token = parseBearerToken(request.get("Authorization"));
      const verified = await options.accessTokens.verify(token);
      const context = await options.repository.findSessionContext({
        sessionId: verified.sessionId,
        userId: verified.subject
      });

      if (context === null) {
        throw unauthorized();
      }
      if (context.session.revokedAt !== null) {
        throw unauthorized();
      }
      if (context.session.expiresAt.getTime() <= (options.clock ?? (() => new Date()))().getTime()) {
        throw unauthorized();
      }
      if (!context.user.active) {
        throw new AppError({
          code: "USER_DISABLED",
          message: "User is disabled.",
          statusCode: 403
        });
      }
      if (context.user.role !== verified.role) {
        throw unauthorized();
      }

      (request as AuthRequest).auth = {
        email: context.user.email,
        id: context.user.id,
        role: context.user.role,
        sessionId: verified.sessionId,
        tokenId: verified.tokenId
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function parseBearerToken(value: string | undefined): string {
  if (value === undefined) {
    throw unauthorized();
  }

  const match = /^Bearer ([^\s]+)$/.exec(value);

  const token = match?.[1];

  if (token === undefined) {
    throw unauthorized();
  }

  return token;
}

function unauthorized(): AppError {
  return new AppError({
    code: "UNAUTHORIZED",
    message: "Authentication required.",
    statusCode: 401
  });
}
