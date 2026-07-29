import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { AppEnv, NodeEnvironment } from "../src/config/env.js";
import { createAdminUiRouter } from "../src/modules/admin-ui/admin-ui.routes.js";

describe("admin UI security headers", () => {
  it("sets exact production CSP directives and security headers", async () => {
    const response = await request(createAdminUiTestApp("production"))
      .get("/admin")
      .expect(200);

    const csp = requireHeader(response.headers["content-security-policy"]);

    expect(splitHeader(csp)).toEqual([
      "default-src 'none'",
      "script-src 'self'",
      "script-src-attr 'none'",
      "style-src 'self'",
      "connect-src 'self'",
      "img-src 'self' data: blob: https://storage.example.test",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ]);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp.match(/https:\/\/storage\.example\.test/g)).toHaveLength(1);
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["permissions-policy"]).toContain("camera=()");
    expect(response.headers["permissions-policy"]).toContain("microphone=()");
    expect(response.headers["permissions-policy"]).toContain("geolocation=()");
    expect(response.headers["strict-transport-security"]).toMatch(/max-age=/);
  });

  it("omits HSTS and upgrade-insecure-requests outside production", async () => {
    const response = await request(createAdminUiTestApp("development"))
      .get("/admin")
      .expect(200);

    expect(response.headers["strict-transport-security"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).not.toContain(
      "upgrade-insecure-requests"
    );
  });

  it("normalizes Storage origin into img-src only", async () => {
    const response = await request(
      createAdminUiTestApp("test", "http://storage.example.test/assets/path")
    )
      .get("/admin")
      .expect(200);

    const csp = requireHeader(response.headers["content-security-policy"]);

    expect(csp).toContain("img-src 'self' data: blob: http://storage.example.test");
    expect(csp).not.toContain("connect-src 'self' http://storage.example.test");
    expect(csp).not.toContain("/assets/path");
  });

  it("rejects insecure production Storage origins safely", () => {
    expect(() =>
      createAdminUiRouter({
        nodeEnv: "production",
        storagePublicOrigin: "http://storage.example.test"
      })
    ).toThrow("Invalid Admin UI storage image origin.");
  });

  it("does not expose key, database URL, token, or service-role values in headers", async () => {
    const response = await request(createAdminUiTestApp("production"))
      .get("/admin")
      .expect(200);

    expect(JSON.stringify(response.headers)).not.toMatch(
      /key|DATABASE_URL|database url|token|service-role|sb_secret_/i
    );
  });
});

function createAdminUiTestApp(
  nodeEnv: NodeEnvironment,
  storagePublicOrigin = "https://storage.example.test/private/path"
) {
  const env: AppEnv = {
    LOG_LEVEL: "silent",
    NODE_ENV: nodeEnv,
    PORT: 3000,
    SERVICE_NAME: "web00-test"
  };

  return createApp({
    adminUiRoutes: createAdminUiRouter({ nodeEnv, storagePublicOrigin }),
    env
  });
}

function splitHeader(value: string | undefined): string[] {
  return requireHeader(value).split(";").map((part) => part.trim()).filter(Boolean);
}

function requireHeader(value: string | undefined): string {
  expect(value).toBeTypeOf("string");

  if (typeof value !== "string") {
    throw new Error("Expected header to be present.");
  }

  return value;
}
