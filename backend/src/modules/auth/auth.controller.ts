import { ZodError } from "zod";
import { AppError } from "../../lib/errors.js";
import { parseBearerToken } from "./auth.middleware.js";
import { parseLoginBody } from "./auth.schemas.js";
import type {
  AuthCookieService,
  AuthRequest,
  AuthService
} from "./auth.types.js";

export interface AuthController {
  login: AuthRequestHandler;
  logout: AuthRequestHandler;
  me: AuthRequestHandler;
  refresh: AuthRequestHandler;
}

type AuthRequestHandler = (
  request: AuthRequest,
  response: import("express").Response,
  next: import("express").NextFunction
) => Promise<void>;

export function createAuthController(options: {
  cookies: AuthCookieService;
  service: AuthService;
}): AuthController {
  return {
    login: async (request, response, next) => {
      try {
        const body = parseLoginBody(request.body);
        const result = await options.service.login({
          ...body,
          requestId: getRequestId(response)
        });

        response.setHeader(
          "Set-Cookie",
          options.cookies.serializeRefreshCookie({
            expiresAt: result.refreshExpiresAt,
            maxAgeSeconds: result.refreshMaxAgeSeconds,
            rawToken: result.refreshToken
          })
        );
        response.json({
          data: {
            accessToken: result.accessToken,
            user: result.user
          }
        });
      } catch (error) {
        next(toControllerError(error));
      }
    },
    logout: async (request, response, next) => {
      try {
        await options.service.logout({
          rawRefreshToken: options.cookies.parseRefreshCookie(request.get("Cookie")),
          requestId: getRequestId(response)
        });
        response.setHeader("Set-Cookie", options.cookies.clearRefreshCookie());
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
    me: async (request, response, next) => {
      try {
        if (request.auth === undefined) {
          parseBearerToken(request.get("Authorization"));
          throw new AppError({
            code: "UNAUTHORIZED",
            message: "Authentication required.",
            statusCode: 401
          });
        }

        response.json({ data: await options.service.getMe(request.auth) });
      } catch (error) {
        next(error);
      }
    },
    refresh: async (request, response, next) => {
      try {
        const result = await options.service.refresh({
          rawRefreshToken: options.cookies.parseRefreshCookie(request.get("Cookie")),
          requestId: getRequestId(response)
        });

        response.setHeader(
          "Set-Cookie",
          options.cookies.serializeRefreshCookie({
            expiresAt: result.refreshExpiresAt,
            maxAgeSeconds: result.refreshMaxAgeSeconds,
            rawToken: result.refreshToken
          })
        );
        response.json({
          data: {
            accessToken: result.accessToken,
            user: result.user
          }
        });
      } catch (error) {
        next(error);
      }
    }
  };
}

function getRequestId(response: import("express").Response): string {
  const requestId = response.locals.requestId;

  return typeof requestId === "string" ? requestId : "unknown";
}

function toControllerError(error: unknown): unknown {
  if (error instanceof ZodError) {
    return new AppError({
      code: "VALIDATION_ERROR",
      message: "Invalid request.",
      statusCode: 400
    });
  }

  return error;
}
