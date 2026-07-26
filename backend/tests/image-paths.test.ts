import { describe, expect, it } from "vitest";
import {
  buildImageBasePath,
  buildVariantPath,
  createManagedImageUrlPolicy,
  parseManagedGalleryUrl,
  parseManagedPreviewUrl
} from "../src/modules/images/image-paths.js";

const siteId = "11111111-1111-4111-8111-111111111111";
const otherSiteId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const publicBaseUrl = "https://storage.example.test";
const bucket = "web00-catalog-images";

describe("image paths", () => {
  it("builds immutable canonical object paths without filenames", () => {
    const basePath = buildImageBasePath(siteId, "preview", assetId);

    expect(basePath).toBe(
      "sites/11111111-1111-4111-8111-111111111111/preview/33333333-3333-4333-8333-333333333333"
    );
    expect(buildVariantPath(basePath, 1600, "webp")).toBe(
      "sites/11111111-1111-4111-8111-111111111111/preview/33333333-3333-4333-8333-333333333333/1600.webp"
    );
    expect(buildVariantPath(basePath, 960, "avif")).toBe(
      "sites/11111111-1111-4111-8111-111111111111/preview/33333333-3333-4333-8333-333333333333/960.avif"
    );
  });

  it("rejects invalid UUIDs, slots, widths, formats, and traversal", () => {
    expect(() => buildImageBasePath("not-a-uuid", "preview", assetId)).toThrow(
      "siteId"
    );
    expect(() => buildImageBasePath(siteId, "avatar" as never, assetId)).toThrow(
      "slot"
    );
    expect(() => buildImageBasePath(siteId, "preview", "../asset" as never)).toThrow(
      "assetId"
    );

    const basePath = buildImageBasePath(siteId, "gallery", assetId);

    expect(() => buildVariantPath(basePath, 0, "webp")).toThrow("width");
    expect(() => buildVariantPath(`${basePath}/../other`, 480, "webp")).toThrow(
      "basePath"
    );
    expect(() => buildVariantPath(basePath, 480, "jpg" as never)).toThrow(
      "format"
    );
  });

  it("strictly classifies managed preview URLs and leaves legacy URLs unmanaged", () => {
    const url =
      "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/preview/33333333-3333-4333-8333-333333333333/1600.webp";

    expect(
      parseManagedPreviewUrl({
        bucket,
        publicBaseUrl,
        siteId,
        url
      })
    ).toEqual({
      assetId,
      siteId,
      slot: "preview",
      storagePath:
        "sites/11111111-1111-4111-8111-111111111111/preview/33333333-3333-4333-8333-333333333333",
      url,
      widths: [480, 960, 1600]
    });
    expect(
      parseManagedPreviewUrl({
        bucket,
        publicBaseUrl,
        siteId,
        url: url.replace(siteId, otherSiteId)
      })
    ).toBeNull();
    expect(
      parseManagedPreviewUrl({
        bucket,
        publicBaseUrl,
        siteId,
        url: `${url}?token=secret`
      })
    ).toBeNull();
    expect(
      parseManagedPreviewUrl({
        bucket,
        publicBaseUrl,
        siteId,
        url: "https://legacy.example.test/card.jpg"
      })
    ).toBeNull();
  });

  it("strictly classifies managed gallery URLs and rejects managed lookalikes", () => {
    const url =
      "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/gallery/33333333-3333-4333-8333-333333333333/1600.webp";

    expect(
      parseManagedGalleryUrl({
        bucket,
        publicBaseUrl,
        siteId,
        url
      })
    ).toEqual({
      assetId,
      siteId,
      slot: "gallery",
      storagePath:
        "sites/11111111-1111-4111-8111-111111111111/gallery/33333333-3333-4333-8333-333333333333",
      url,
      widths: [480, 960, 1600]
    });
    expect(
      parseManagedGalleryUrl({
        bucket,
        publicBaseUrl,
        siteId,
        url: url.replace("storage.example.test", "legacy.example.test")
      })
    ).toBeNull();
    expect(
      parseManagedGalleryUrl({
        bucket,
        publicBaseUrl,
        siteId,
        url: url.replace("web00-catalog-images", "other-bucket")
      })
    ).toBeNull();
    expect(
      parseManagedGalleryUrl({
        bucket,
        publicBaseUrl,
        siteId,
        url: url.replace(siteId, otherSiteId)
      })
    ).toBeNull();
    expect(
      parseManagedGalleryUrl({
        bucket,
        publicBaseUrl,
        siteId,
        url: `${url}#fragment`
      })
    ).toBeNull();
  });

  it("builds public variants from managed descriptors through an injected policy", () => {
    const policy = createManagedImageUrlPolicy({ bucket, publicBaseUrl });

    expect(
      policy.buildVariants({
        assetId,
        siteId,
        slot: "gallery",
        storagePath:
          "sites/11111111-1111-4111-8111-111111111111/gallery/33333333-3333-4333-8333-333333333333",
        url: "unused",
        widths: [480, 960]
      })
    ).toEqual([
      {
        avifUrl:
          "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/gallery/33333333-3333-4333-8333-333333333333/480.avif",
        webpUrl:
          "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/gallery/33333333-3333-4333-8333-333333333333/480.webp",
        width: 480
      },
      {
        avifUrl:
          "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/gallery/33333333-3333-4333-8333-333333333333/960.avif",
        webpUrl:
          "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/gallery/33333333-3333-4333-8333-333333333333/960.webp",
        width: 960
      }
    ]);
  });
});
