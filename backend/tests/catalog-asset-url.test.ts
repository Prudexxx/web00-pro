import { describe, expect, it } from "vitest";
import {
  CATALOG_PUBLIC_ASSET_BASE,
  resolveCatalogAssetUrl
} from "../src/lib/catalog-asset-url.js";

describe("catalog asset URL resolver", () => {
  it("keeps safe absolute GitHub Pages URLs unchanged", () => {
    const url = `${CATALOG_PUBLIC_ASSET_BASE}assets/img/previews/mebel-home.png`;

    expect(resolveCatalogAssetUrl(url)).toEqual({
      source: "absolute",
      url
    });
  });

  it("keeps safe absolute managed storage URLs unchanged", () => {
    const url =
      "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/00000000-0000-4000-8000-000000000101/preview/00000000-0000-4000-8000-000000000201/1200.webp";

    expect(resolveCatalogAssetUrl(url)).toEqual({
      source: "absolute",
      url
    });
  });

  it("resolves approved legacy asset path forms against the canonical public frontend base", () => {
    expect(resolveCatalogAssetUrl("assets/img/solution-gallery/mebel-01.png")).toEqual({
      source: "legacy",
      url: `${CATALOG_PUBLIC_ASSET_BASE}assets/img/solution-gallery/mebel-01.png`
    });
    expect(resolveCatalogAssetUrl("./assets/img/solution-gallery/massage-02.png")).toEqual({
      source: "legacy",
      url: `${CATALOG_PUBLIC_ASSET_BASE}assets/img/solution-gallery/massage-02.png`
    });
    expect(resolveCatalogAssetUrl("/web00-pro/assets/img/solution-gallery/drova-03.png")).toEqual({
      source: "legacy",
      url: `${CATALOG_PUBLIC_ASSET_BASE}assets/img/solution-gallery/drova-03.png`
    });
  });

  it("rejects unsafe schemes, protocol-relative URLs, and URLs with credentials", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg></svg>",
      "file:///etc/passwd",
      "blob:https://example.test/id",
      "//evil.example.test/assets/img/previews/mebel-home.png",
      "https://user:password@example.test/image.png"
    ]) {
      expect(resolveCatalogAssetUrl(value), value).toBeNull();
    }
  });

  it("rejects traversal, backslash tricks, encoded scheme tricks, malformed URLs, and unexpected relative prefixes", () => {
    for (const value of [
      "assets/../private.png",
      "assets\\img\\previews\\mebel-home.png",
      "javascript%3Aalert(1)",
      "https://[::1",
      "img/previews/mebel-home.png",
      "/assets/img/previews/mebel-home.png",
      " ".repeat(2050)
    ]) {
      expect(resolveCatalogAssetUrl(value), value).toBeNull();
    }
  });

  it("rejects encoded traversal, encoded separators, and legacy query/hash suffixes after final URL normalization", () => {
    for (const value of [
      "assets/%2e%2e/file.png",
      "assets/%252e%252e/file.png",
      "assets/a/%2e%2e/file.png",
      "assets/%2fweb00-pro/assets/file.png",
      "assets/%255cprivate.png",
      "assets/img/previews/mebel-home.png?cache=1",
      "assets/img/previews/mebel-home.png#preview"
    ]) {
      expect(resolveCatalogAssetUrl(value), value).toBeNull();
    }
  });
});
