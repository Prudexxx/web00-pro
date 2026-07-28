import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  IMAGE_UPLOAD_LIMITS,
  buildGalleryReorderPayload,
  buildImagePath,
  buildPreviewFormData,
  supportedImageTypes
} from "../src/admin/assets/screens/image-manager.js";

describe("admin image UI contract", () => {
  it("builds exact current image routes and rejects untrusted ids", () => {
    const siteId = "00000000-0000-4000-8000-000000000101";
    const assetId = "00000000-0000-4000-8000-000000000201";

    expect(buildImagePath(siteId, "preview")).toBe(
      "/api/admin/sites/00000000-0000-4000-8000-000000000101/images/preview"
    );
    expect(buildImagePath(siteId, "gallery")).toBe(
      "/api/admin/sites/00000000-0000-4000-8000-000000000101/images/gallery"
    );
    expect(buildImagePath(siteId, "gallery-batch")).toBe(
      "/api/admin/sites/00000000-0000-4000-8000-000000000101/images/gallery/batch"
    );
    expect(buildImagePath(siteId, "gallery-item", assetId)).toBe(
      "/api/admin/sites/00000000-0000-4000-8000-000000000101/images/gallery/00000000-0000-4000-8000-000000000201"
    );
    expect(() => buildImagePath("../bad", "preview")).toThrow("Invalid site id.");
    expect(() => buildImagePath(siteId, "gallery-item", "../bad")).toThrow("Invalid asset id.");
  });

  it("uses current multipart fields and client limits", () => {
    const file = new File([new Uint8Array(10)], "preview.png", { type: "image/png" });
    const body = buildPreviewFormData({
      alt: " Alt ",
      clientFileId: "00000000-0000-4000-8000-000000000301",
      file
    });

    expect(body.get("clientFileId")).toBe("00000000-0000-4000-8000-000000000301");
    expect(body.get("alt")).toBe("Alt");
    expect(body.get("image")).toBe(file);
    expect(supportedImageTypes).toEqual(["image/jpeg", "image/png", "image/webp", "image/avif"]);
    expect(IMAGE_UPLOAD_LIMITS).toEqual({
      batchBytes: 30 * 1024 * 1024,
      batchFiles: 10,
      fileBytes: 5 * 1024 * 1024,
      galleryImages: 20,
      imageAlt: 160
    });
  });

  it("builds gallery reorder payloads with schema fields only", () => {
    const payload = buildGalleryReorderPayload([
      {
        alt: " Updated ",
        assetId: "00000000-0000-4000-8000-000000000201",
        sortOrder: "4",
        storagePath: "should-not-send",
        url: "https://storage.example.test/gallery.webp",
        variants: []
      }
    ]);

    expect(payload).toEqual({
      items: [{ alt: "Updated", assetId: "00000000-0000-4000-8000-000000000201", sortOrder: 4 }]
    });
    expect(JSON.stringify(payload)).not.toMatch(/storagePath|url|variants/);
  });

  it("keeps production Admin UI assets inside the approved Wave 4 image contract", async () => {
    const source = await readAdminAssetText();

    expect(source).not.toMatch(/from\s+["'].*supabase|createClient\s*\(/i);
    expect(source).not.toContain("/api/admin/uploads/images");
    expect(source).not.toMatch(/Content-Type['"]?\s*:\s*['"]multipart\/form-data/i);
    expect(source).not.toMatch(/previewImageUrl\s*[:=].*requestJson|galleryImages\s*[:=].*requestJson/i);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open/);
    expect(source).not.toMatch(/javascript:\s*|data:/i);
  });
});

async function readAdminAssetText() {
  const files = [
    "assets/main.js",
    "assets/api-client.js",
    "assets/dom.js",
    "assets/forms.js",
    "assets/dialog.js",
    "assets/screens/sites-list.js",
    "assets/screens/site-editor.js",
    "assets/screens/image-manager.js"
  ];
  const root = path.join(process.cwd(), "src", "admin");
  const contents = await Promise.all(files.map((file) => readFile(path.join(root, file), "utf8")));

  return contents.join("\n");
}
