import { describe, expect, it } from "vitest";

import {
  resolveCatalogAssetUrl as resolveBrowserCatalogAssetUrl
} from "../src/admin/assets/catalog-asset-url.js";
import {
  resolveCatalogAssetUrl as resolveBackendCatalogAssetUrl
} from "../src/lib/catalog-asset-url.js";

describe("catalog asset URL resolver browser parity", () => {
  it("matches backend policy for accepted and rejected catalog asset URLs", () => {
    const cases = [
      "assets/img/previews/mebel-home.png",
      "./assets/img/solution-gallery/massage-01.png",
      "/web00-pro/assets/img/solution-gallery/drova-02.png",
      "https://storage.example.test/storage/v1/object/public/web00-catalog-images/sites/site/preview/asset/1200.webp",
      "assets/%2e%2e/file.png",
      "assets/%252e%252e/file.png",
      "assets/a/%2e%2e/file.png",
      "assets/img/previews/mebel-home.png?cache=1",
      "assets/img/previews/mebel-home.png#hash",
      "//evil.example.test/assets/img/previews/mebel-home.png",
      "javascript:alert(1)"
    ];

    for (const value of cases) {
      expect(resolveBrowserCatalogAssetUrl(value), value).toEqual(
        resolveBackendCatalogAssetUrl(value)
      );
    }
  });
});
