import { describe, expect, it } from "vitest";

import {
  IMAGE_UPLOAD_LIMITS,
  buildGalleryBatchFormData,
  buildPreviewFormData,
  normalizeGalleryBatchResult,
  selectFailedGalleryFiles,
  supportedImageTypes,
  validateBatch,
  validateImageFile
} from "../src/admin/assets/site-image-upload.js";
import {
  buildCreateSitePayload
} from "../src/admin/assets/forms.js";

describe("admin shared site image upload helpers", () => {
  it("validates supported image MIME types, file bytes, and batch limits", () => {
    expect(supportedImageTypes).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif"
    ]);

    expect(() => validateImageFile(imageFile("preview.webp", "image/webp", IMAGE_UPLOAD_LIMITS.fileBytes))).not.toThrow();
    expect(() => validateImageFile(imageFile("bad.gif", "image/gif", 12))).toThrow(
      "Поддерживаются только JPEG, PNG, WEBP или AVIF."
    );
    expect(() => validateImageFile(imageFile("large.png", "image/png", IMAGE_UPLOAD_LIMITS.fileBytes + 1))).toThrow(
      "Файл должен быть не больше 5 MB."
    );
    expect(() => validateBatch(Array.from({ length: 11 }, (_, index) => imageFile(`${index}.png`, "image/png", 12)))).toThrow(
      "Gallery batch должен содержать не больше 10 файлов."
    );
    expect(() => validateBatch(Array.from({ length: 7 }, (_, index) => imageFile(`large-${index}.png`, "image/png", IMAGE_UPLOAD_LIMITS.fileBytes)))).toThrow(
      "Gallery batch должен быть не больше 30 MB."
    );
  });

  it("builds preview and gallery multipart bodies without leaking image fields into JSON create payloads", () => {
    const preview = imageFile("preview.jpg", "image/jpeg", 123);
    const gallery = [
      imageFile("gallery-1.webp", "image/webp", 12),
      imageFile("gallery-2.avif", "image/avif", 12)
    ];
    const previewForm = buildPreviewFormData({
      alt: " Preview alt ",
      clientFileId: "00000000-0000-4000-8000-000000000301",
      file: preview
    });
    const galleryForm = buildGalleryBatchFormData({
      alt: " Gallery alt ",
      clientFileIds: [
        "00000000-0000-4000-8000-000000000401",
        "00000000-0000-4000-8000-000000000402"
      ],
      files: gallery
    });

    expect(previewForm.get("image")).toBe(preview);
    expect(previewForm.get("clientFileId")).toBe("00000000-0000-4000-8000-000000000301");
    expect(previewForm.get("alt")).toBe("Preview alt");
    expect(JSON.parse(galleryForm.get("metadata"))).toEqual([
      { alt: "Gallery alt", clientFileId: "00000000-0000-4000-8000-000000000401" },
      { alt: "Gallery alt", clientFileId: "00000000-0000-4000-8000-000000000402" }
    ]);
    expect(galleryForm.getAll("images")).toEqual(gallery);

    const payload = buildCreateSitePayload({
      categoryId: "00000000-0000-4000-8000-000000000001",
      galleryBatchAlt: "must not serialize",
      galleryBatchImages: "C:\\secret\\gallery.png",
      previewAlt: "must not serialize",
      previewImage: "C:\\secret\\preview.png",
      shortDescription: "Short",
      slug: "admin-site",
      title: "Admin Site"
    });

    expect(payload).not.toHaveProperty("previewImage");
    expect(payload).not.toHaveProperty("previewAlt");
    expect(payload).not.toHaveProperty("galleryBatchImages");
    expect(payload).not.toHaveProperty("galleryBatchAlt");
    expect(JSON.stringify(payload)).not.toContain("C:\\secret");
  });

  it("normalizes gallery partial results and selects only failed files for retry", () => {
    const files = [
      imageFile("ok.webp", "image/webp", 12),
      imageFile("retry.png", "image/png", 12)
    ];
    const clientFileIds = [
      "00000000-0000-4000-8000-000000000401",
      "00000000-0000-4000-8000-000000000402"
    ];
    const result = normalizeGalleryBatchResult({
      failed: [{
        clientFileId: clientFileIds[1],
        code: "IMAGE_TOO_LARGE",
        index: 1,
        message: "Too large."
      }],
      succeeded: [{
        clientFileId: clientFileIds[0],
        image: { assetId: "asset-ok" },
        index: 0,
        replayed: false
      }]
    }, {
      clientFileIds,
      files
    });

    expect(result.counts).toEqual({
      failed: 1,
      succeeded: 1,
      total: 2
    });
    expect(selectFailedGalleryFiles(result)).toEqual([
      {
        clientFileId: clientFileIds[1],
        file: files[1],
        index: 1
      }
    ]);
  });

  it("rejects malformed gallery batch envelopes instead of treating them as zero successes", () => {
    const context = {
      clientFileIds: [
        "00000000-0000-4000-8000-000000000401",
        "00000000-0000-4000-8000-000000000402"
      ],
      files: [
        imageFile("first.png", "image/png", 12),
        imageFile("second.png", "image/png", 12)
      ]
    };

    for (const result of [
      undefined,
      {},
      { succeeded: [] },
      { failed: [] },
      { failed: {}, succeeded: [] },
      { failed: [], succeeded: {} }
    ]) {
      expect(() => normalizeGalleryBatchResult(result, context)).toThrow(
        "Сервер вернул некорректный ответ."
      );
    }
  });

  it("rejects javascript and data URLs before submit payloads leave the browser", () => {
    for (const url of ["javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4="]) {
      expect(() => buildCreateSitePayload({
        categoryId: "00000000-0000-4000-8000-000000000001",
        demoMode: "external-iframe",
        demoUrlSimple: url,
        shortDescription: "Short",
        slug: "bad-url",
        title: "Bad URL"
      })).toThrow("Invalid form input.");
    }
  });
});

function imageFile(name, type, size) {
  return new File([new Uint8Array(size)], name, { type });
}
