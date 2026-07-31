import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { AppEnv, NodeEnvironment } from "../src/config/env.js";
import {
  CATALOG_PUBLIC_ASSET_ORIGIN,
  resolveCatalogAssetUrl
} from "../src/lib/catalog-asset-url.js";
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
      "img-src 'self' data: blob: https://storage.example.test https://prudexxx.github.io",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ]);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp.match(/https:\/\/storage\.example\.test/g)).toHaveLength(1);
    expect(csp.match(/https:\/\/prudexxx\.github\.io/g)).toHaveLength(1);
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

  it("allows catalog GitHub Pages images in img-src only", async () => {
    const response = await request(createAdminUiTestApp("production"))
      .get("/admin")
      .expect(200);

    const directives = parseCspDirectives(response.headers["content-security-policy"]);

    expect(directives.get("img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://storage.example.test",
      "https://prudexxx.github.io"
    ]);
    expect(directives.get("script-src")).toEqual(["'self'"]);
    expect(directives.get("connect-src")).toEqual(["'self'"]);
    expect(directives.get("style-src")).toEqual(["'self'"]);
    expect(directives.get("frame-src")).toBeUndefined();
    expect(directives.get("form-action")).toEqual(["'self'"]);
  });

  it("keeps canonical catalog image URLs compatible with the admin CSP image origin", async () => {
    const response = await request(createAdminUiTestApp("production"))
      .get("/admin")
      .expect(200);
    const directives = parseCspDirectives(response.headers["content-security-policy"]);
    const imgSrc = directives.get("img-src") ?? [];
    const preview = resolveCatalogAssetUrl("assets/img/previews/mebel-home.png");
    const gallery = resolveCatalogAssetUrl("assets/img/solution-gallery/mebel-01.png");

    expect(CATALOG_PUBLIC_ASSET_ORIGIN).toBe("https://prudexxx.github.io");
    expect(new URL(preview?.url ?? "").origin).toBe(CATALOG_PUBLIC_ASSET_ORIGIN);
    expect(new URL(gallery?.url ?? "").origin).toBe(CATALOG_PUBLIC_ASSET_ORIGIN);
    expect(imgSrc).toContain(CATALOG_PUBLIC_ASSET_ORIGIN);
  });

  it("does not allow broad GitHub or HTTPS image sources", async () => {
    const response = await request(createAdminUiTestApp("production"))
      .get("/admin")
      .expect(200);

    const directives = parseCspDirectives(response.headers["content-security-policy"]);
    const imgSrc = directives.get("img-src") ?? [];

    expect(imgSrc).not.toContain("*.github.io");
    expect(imgSrc).not.toContain("https:");
    expect(imgSrc).toContain("https://prudexxx.github.io");
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

  it("deduplicates matching storage and catalog image origins", async () => {
    const response = await request(
      createAdminUiTestApp("production", "https://prudexxx.github.io/web00-pro/storage-path")
    )
      .get("/admin")
      .expect(200);

    const csp = requireHeader(response.headers["content-security-policy"]);

    expect(csp.match(/https:\/\/prudexxx\.github\.io/g)).toHaveLength(1);
  });

  it("rejects insecure production Storage origins safely", () => {
    expect(() =>
      createAdminUiRouter({
        catalogPublicOrigin: CATALOG_PUBLIC_ASSET_ORIGIN,
        nodeEnv: "production",
        storagePublicOrigin: "http://storage.example.test"
      })
    ).toThrow("Invalid Admin UI storage image origin.");
  });

  it.each([
    ["HTTP catalog origin in production", "http://prudexxx.github.io"],
    ["credentials catalog origin", "https://user:pass@prudexxx.github.io"],
    ["path catalog origin", "https://prudexxx.github.io/web00-pro"],
    ["query catalog origin", "https://prudexxx.github.io?x=1"],
    ["hash catalog origin", "https://prudexxx.github.io#assets"],
    ["overlong catalog origin", `https://prudexxx.github.io${"x".repeat(2048)}`]
  ])("rejects invalid catalog public origin: %s", (_label, catalogPublicOrigin) => {
    expect(() =>
      createAdminUiRouter({
        catalogPublicOrigin,
        nodeEnv: "production",
        storagePublicOrigin: "https://storage.example.test"
      })
    ).toThrow("Invalid Admin UI catalog image origin.");
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
  storagePublicOrigin = "https://storage.example.test/private/path",
  catalogPublicOrigin = CATALOG_PUBLIC_ASSET_ORIGIN
) {
  const env: AppEnv = {
    LOG_LEVEL: "silent",
    NODE_ENV: nodeEnv,
    PORT: 3000,
    SERVICE_NAME: "web00-test"
  };

  return createApp({
    adminUiRoutes: createAdminUiRouter({ catalogPublicOrigin, nodeEnv, storagePublicOrigin }),
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

function parseCspDirectives(value: string | undefined): Map<string, string[]> {
  const directives = new Map<string, string[]>();

  for (const part of splitHeader(value)) {
    const [name, ...sources] = part.split(/\s+/u);
    if (name !== undefined) {
      directives.set(name, sources);
    }
  }

  return directives;
}
