import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { stringifySafeJson } from "../src/admin/assets/dom.js";
import {
  buildCategoriesListPath,
  buildCategoryCreatePayload
} from "../src/admin/assets/screens/categories.js";
import { visibleNavigation } from "../src/admin/assets/screens/shell.js";
import { buildAuditListPath } from "../src/admin/assets/screens/audit.js";
import { buildUsersListPath } from "../src/admin/assets/screens/users.js";

const ASSET_FILES = [
  "src/admin/assets/dom.js",
  "src/admin/assets/main.js",
  "src/admin/assets/screens/shell.js",
  "src/admin/assets/screens/categories.js",
  "src/admin/assets/screens/users.js",
  "src/admin/assets/screens/audit.js"
];

describe("admin ui wave 5 contract", () => {
  it("keeps navigation role contracts and wires Wave 5 screens into main", () => {
    const mainSource = readAsset("src/admin/assets/main.js");

    expect(visibleNavigation("editor").map((item) => item.id)).toEqual(["sites", "categories"]);
    expect(visibleNavigation("admin").map((item) => item.id)).toEqual(["sites", "categories", "users", "audit"]);
    expect(mainSource).toContain("createCategoriesScreen");
    expect(mainSource).toContain("createUsersScreen");
    expect(mainSource).toContain("createAuditScreen");
    expect(mainSource).toContain('case "categories"');
    expect(mainSource).toContain('case "users"');
    expect(mainSource).toContain('case "audit"');
  });

  it("uses only current Wave 5 route contracts", () => {
    expect(buildCategoriesListPath({
      active: true,
      includeCounts: false,
      limit: 25,
      page: 2,
      search: "crm"
    })).toBe("/api/admin/categories?search=crm&active=true&includeCounts=false&page=2&limit=25");
    expect(buildCategoryCreatePayload({
      active: false,
      description: "Ops",
      slug: "ops",
      sortOrder: "0",
      title: "Operations"
    })).toEqual({
      active: false,
      description: "Ops",
      slug: "ops",
      sortOrder: 0,
      title: "Operations"
    });
    expect(buildUsersListPath({
      active: true,
      direction: "desc",
      limit: 10,
      page: 2,
      role: "admin",
      search: "owner",
      sort: "lastLoginAt"
    })).toBe("/api/admin/users?search=owner&role=admin&active=true&sort=lastLoginAt&direction=desc&page=2&limit=10");
    expect(buildAuditListPath({
      action: "login",
      entityType: "auth",
      limit: 10,
      page: 2,
      sort: "oldest"
    })).toBe("/api/admin/audit-logs?action=login&entityType=auth&sort=oldest&page=2&limit=10");
  });

  it("renders JSON through bounded text serialization only", () => {
    const circular = { id: "root" };
    circular.self = circular;

    expect(stringifySafeJson({ html: "<script>x</script>" })).toContain("<script>x</script>");
    expect(stringifySafeJson(circular)).toContain("[Circular]");
    expect(stringifySafeJson({ huge: "x".repeat(200) }, { maxLength: 80 })).toContain("truncated");
    expect(stringifySafeJson(undefined)).toBe("null");
  });

  it("keeps production admin assets free of unsafe DOM APIs and superseded Wave 5 routes", () => {
    const combined = ASSET_FILES.map(readAsset).join("\n");
    const wave5Combined = [
      "backend/src/admin/assets/screens/categories.js",
      "backend/src/admin/assets/screens/users.js",
      "backend/src/admin/assets/screens/audit.js"
    ].map((filePath) => readAsset(filePath.replace(/^backend\//, ""))).join("\n");

    expect(combined).not.toMatch(/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|eval\s*\(|new Function|document\.write/);
    expect(combined).not.toMatch(/setAttribute\(["'`]on[a-z]+|["'`]\s*on[a-z]+\s*=/i);
    expect(combined).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open|document\.cookie/);
    expect(combined).not.toMatch(/https?:\/\/[^"')\s]+\/api\//);
    expect(combined).not.toMatch(/@supabase\/supabase-js|createClient\s*\(/);
    expect(combined).not.toMatch(/token.*console|password.*console/i);
    expect(wave5Combined).not.toMatch(/reset-password|password|registration|invite|sessions?\/revoke/i);
    expect(wave5Combined).not.toMatch(/delete-user|create-user/i);
    expect(combined).not.toMatch(/\/api\/admin\/users["'`][\s\S]{0,120}method:\s*["'`]POST/i);
    expect(readAsset("src/admin/assets/screens/audit.js")).not.toMatch(/method:\s*["'`](POST|PATCH|DELETE)["'`]/);
  });

  it("keeps Wave 5 static scans scoped to admin UI assets", () => {
    expect(ASSET_FILES.every((name) => name.startsWith("src/admin/assets/"))).toBe(true);
    expect(ASSET_FILES.some((name) => name.startsWith("src/modules/"))).toBe(false);
    expect(ASSET_FILES.some((name) => name.startsWith("prisma/"))).toBe(false);
    expect(ASSET_FILES.some((name) => name === "package.json" || name === "package-lock.json")).toBe(false);
    expect(ASSET_FILES.some((name) => /^[^/]+\.html$/.test(name))).toBe(false);
    expect(ASSET_FILES).not.toContain("sw.js");
    expect(ASSET_FILES).not.toContain("manifest.webmanifest");
  });
});

function readAsset(filePath) {
  return readFileSync(filePath, "utf8");
}
