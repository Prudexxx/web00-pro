import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuthCookieService } from "../src/modules/auth/auth-cookie.js";

describe("auth cookie service", () => {
  it("serializes development refresh cookies with strict safe attributes", () => {
    const cookies = createAuthCookieService({ nodeEnv: "development" });
    const expiresAt = new Date("2026-08-01T00:00:00.000Z");
    const header = cookies.serializeRefreshCookie({
      expiresAt,
      maxAgeSeconds: 604800,
      rawToken: "opaque"
    });

    expect(header).toContain("web00_refresh=opaque");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/api/auth");
    expect(header).toContain("Max-Age=604800");
    expect(header).toContain("Expires=Sat, 01 Aug 2026 00:00:00 GMT");
    expect(header).not.toContain("Domain=");
    expect(header).not.toContain("Secure");
  });

  it("uses __Secure cookie name and Secure in production", () => {
    const cookies = createAuthCookieService({ nodeEnv: "production" });
    const header = cookies.serializeRefreshCookie({
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      maxAgeSeconds: 604800,
      rawToken: "opaque"
    });

    expect(header).toContain("__Secure-web00_refresh=opaque");
    expect(header).toContain("Secure");
  });

  it("parses refresh cookies via the cookie package and clears with mirrored attributes", () => {
    const cookies = createAuthCookieService({ nodeEnv: "test" });

    expect(cookies.parseRefreshCookie("web00_refresh=opaque; other=value")).toBe("opaque");
    expect(cookies.parseRefreshCookie(undefined)).toBeNull();
    expect(cookies.clearRefreshCookie()).toContain("web00_refresh=");

    const source = readFileSync(
      join(process.cwd(), "src", "modules", "auth", "auth-cookie.ts"),
      "utf8"
    );

    expect(source).toContain('from "cookie"');
    expect(source).not.toContain(".split(\";\")");
    expect(source).not.toContain(".split(';')");
  });
});
