import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCreateSitePayload,
  buildUpdateSitePayload
} from "../src/admin/assets/forms.js";
import { buildSitesListPath } from "../src/admin/assets/screens/sites-list.js";

describe("admin site UI contract guard", () => {
  it("uses the current approved list and category routes", () => {
    expect(buildSitesListPath({
      category: "00000000-0000-4000-8000-000000000001",
      limit: 20,
      page: 1
    })).toBe(
      "/api/admin/sites?category=00000000-0000-4000-8000-000000000001&page=1&limit=20"
    );
  });

  it("never submits protected or Wave 4 site fields", () => {
    const createPayload = buildCreateSitePayload({
      active: true,
      categoryId: "00000000-0000-4000-8000-000000000001",
      deletedAt: "2026-07-28T00:00:00.000Z",
      galleryImages: ["no"],
      previewImageUrl: "no",
      publishedAt: "2026-07-28T00:00:00.000Z",
      shortDescription: "Short",
      slug: "site-contract",
      status: "published",
      title: "Site contract",
      views: 99
    });
    const updatePayload = buildUpdateSitePayload({
      active: false,
      galleryImages: ["no"],
      previewImageUrl: "no",
      publishedAt: "2026-07-28T00:00:00.000Z",
      shortDescription: "Short update",
      status: "archived",
      views: 42
    }, "admin");

    for (const payload of [createPayload, updatePayload]) {
      expect(payload).not.toHaveProperty("active");
      expect(payload).not.toHaveProperty("deletedAt");
      expect(payload).not.toHaveProperty("galleryImages");
      expect(payload).not.toHaveProperty("previewImageUrl");
      expect(payload).not.toHaveProperty("publishedAt");
      expect(payload).not.toHaveProperty("status");
      expect(payload).not.toHaveProperty("views");
    }
  });

  it("keeps production browser assets free of superseded routes and early Wave 4 actions", async () => {
    const assetText = await readAdminAssetText();

    expect(assetText).not.toMatch(/\/api\/admin\/uploads\/images/);
    expect(assetText).not.toMatch(/\/api\/admin\/users/);
    expect(assetText).not.toMatch(/set-password|password-reset|change-password/i);
    expect(assetText).not.toMatch(/\/publish|\/unpublish|\/restore|\/permanent/);
    expect(assetText).not.toMatch(/\bDELETE\b/);
    expect(assetText).not.toMatch(/category.*POST|category.*PATCH|category.*DELETE/i);
  });
});

async function readAdminAssetText() {
  const assetRoot = path.join(process.cwd(), "src", "admin", "assets");
  const files = [
    "api-client.js",
    "auth-store.js",
    "dom.js",
    "forms.js",
    "main.js",
    "screens/login.js",
    "screens/shell.js",
    "screens/sites-list.js",
    "screens/site-editor.js"
  ];
  const chunks = await Promise.all(
    files.map((file) => readFile(path.join(assetRoot, file), "utf8"))
  );

  return chunks.join("\n");
}
