import type { RequestHandler } from "express";
import { AppError } from "../../lib/errors.js";
import type {
  AccessTokenService,
  AuthRepository,
  AuthRequest
} from "./auth.types.js";

export interface AuthMiddlewareOptions {
  accessTokens: AccessTokenService;
  repository: Pick<AuthRepository, "findActiveUserById">;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions): RequestHandler {
  return async (request, _response, next) => {
    try {
      const token = parseBearerToken(request.get("Authorization"));
      const verified = await options.accessTokens.verify(token);
      const user = await options.repository.findActiveUserById(verified.subject);

      if (user === null) {
        throw new AppError({
          code: "USER_DISABLED",
          message: "User is disabled.",
          statusCode: 403
        });
      }

      (request as AuthRequest).auth = {
        ...user,
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
