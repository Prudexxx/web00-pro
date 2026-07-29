import { parseCookie, stringifySetCookie } from "cookie";
import type { NodeEnvironment } from "../../config/env.js";
import type {
  AuthCookieService,
  SerializeRefreshCookieInput
} from "./auth.types.js";

const REFRESH_COOKIE_PATH = "/api/auth";

export interface CreateAuthCookieServiceOptions {
  nodeEnv: NodeEnvironment;
}

export function getRefreshCookieName(nodeEnv: NodeEnvironment): string {
  return nodeEnv === "production" ? "__Secure-web00_refresh" : "web00_refresh";
}

export function createAuthCookieService(
  options: CreateAuthCookieServiceOptions
): AuthCookieService {
  const name = getRefreshCookieName(options.nodeEnv);
  const secure = options.nodeEnv === "production";

  return {
    clearRefreshCookie: () =>
      stringifySetCookie({
        expires: new Date(0),
        httpOnly: true,
        maxAge: 0,
        name,
        path: REFRESH_COOKIE_PATH,
        sameSite: "strict",
        secure,
        value: ""
      }),
    parseRefreshCookie: (header) => {
      if (header === undefined) {
        return null;
      }

      return parseCookie(header)[name] ?? null;
    },
    serializeRefreshCookie: (input: SerializeRefreshCookieInput) =>
      stringifySetCookie({
        expires: input.expiresAt,
        httpOnly: true,
        maxAge: input.maxAgeSeconds,
        name,
        path: REFRESH_COOKIE_PATH,
        sameSite: "strict",
        secure,
        value: input.rawToken
      })
  };
}
