import test from "node:test";
import assert from "node:assert/strict";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

async function loadCatalog() {
  const browser = createFakeBrowser();
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = { SOLUTIONS: [] };
  await loadClassicScript("assets/js/runtime-config.js", browser);
  await loadClassicScript("assets/js/catalog-api.js", browser);
  return browser.window.WEB00_CATALOG;
}

test("builds AVIF/WebP picture model with sorted unique variants", async () => {
  const catalog = await loadCatalog();

  const model = catalog.buildResponsiveImageModel({
    url: "https://cdn.example.test/preview-1200.webp",
    alt: '" onmouseover="alert(1)',
    variants: [
      { width: 960, avifUrl: "https://cdn.example.test/preview-960.avif", webpUrl: "https://cdn.example.test/preview-960.webp" },
      { width: 480, avifUrl: "https://cdn.example.test/preview-480.avif", webpUrl: "https://cdn.example.test/preview-480.webp" },
      { width: 480, avifUrl: "https://cdn.example.test/duplicate.avif", webpUrl: "https://cdn.example.test/duplicate.webp" },
      { width: 0, avifUrl: "https://cdn.example.test/bad.avif", webpUrl: "https://cdn.example.test/bad.webp" },
      { width: 1440, avifUrl: "javascript:alert(1)", webpUrl: "https://cdn.example.test/preview-1440.webp" },
    ],
  }, { loading: "eager" });

  assert.equal(model.hasPicture, true);
  assert.equal(model.loading, "eager");
  assert.equal(model.url, "https://cdn.example.test/preview-960.webp");
  assert.equal(model.avifSrcset, "https://cdn.example.test/preview-480.avif 480w, https://cdn.example.test/preview-960.avif 960w");
  assert.equal(model.webpSrcset, "https://cdn.example.test/preview-480.webp 480w, https://cdn.example.test/preview-960.webp 960w");
});

test("renders picture sources before escaped fallback image", async () => {
  const catalog = await loadCatalog();
  const model = catalog.buildResponsiveImageModel({
    url: "https://cdn.example.test/preview-1200.webp",
    alt: '" onmouseover="alert(1)',
    variants: [
      { width: 480, avifUrl: "https://cdn.example.test/preview-480.avif", webpUrl: "https://cdn.example.test/preview-480.webp" },
    ],
  });

  const html = catalog.renderResponsiveImageHtml(model, { className: "solution-preview__image" });

  assert.match(html, /^<picture>/);
  assert.match(html, /<source type="image\/avif" srcset="https:\/\/cdn\.example\.test\/preview-480\.avif 480w">/);
  assert.match(html, /<source type="image\/webp" srcset="https:\/\/cdn\.example\.test\/preview-480\.webp 480w">/);
  assert.match(html, /<img class="solution-preview__image" src="https:\/\/cdn\.example\.test\/preview-480\.webp"/);
  assert.match(html, /alt="&quot; onmouseover=&quot;alert\(1\)"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
  assert.doesNotMatch(html, /fetchpriority|\sonmouseover=["']|\sstyle=/);
});

test("legacy image without variants renders plain img only", async () => {
  const catalog = await loadCatalog();
  const model = catalog.buildResponsiveImageModel({
    url: "assets/img/previews/legacy.png",
    alt: "Legacy",
    variants: [],
  });

  const html = catalog.renderResponsiveImageHtml(model);

  assert.equal(model.hasPicture, false);
  assert.match(html, /^<img /);
  assert.doesNotMatch(html, /<picture>|<source/);
});

test("responsive image renderer allows safe caller-owned img attributes", async () => {
  const catalog = await loadCatalog();
  const model = catalog.buildResponsiveImageModel({
    url: "https://cdn.example.test/preview.webp",
    alt: "Gallery",
    variants: [],
  });

  const html = catalog.renderResponsiveImageHtml(model, { attributes: "data-solution-gallery-main" });

  assert.match(html, /^<img data-solution-gallery-main /);
  assert.doesNotMatch(html, /onerror|style=/);
});
