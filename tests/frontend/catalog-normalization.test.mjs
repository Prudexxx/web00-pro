import test from "node:test";
import assert from "node:assert/strict";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadCatalog(options = {}) {
  const browser = createFakeBrowser(options);
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = options.data || { SOLUTIONS: [] };
  await loadClassicScript("assets/js/runtime-config.js", browser);
  await loadClassicScript("assets/js/catalog-api.js", browser);
  return browser.window.WEB00_CATALOG;
}

test("normalizes API site and keeps dangerous text as plain data", async () => {
  const catalog = await loadCatalog();

  const item = catalog.normalizeApiSite({
    slug: "safe-site",
    title: "<img src=x onerror=alert(1)>",
    shortDescription: '" onmouseover="alert(1)',
    category: { slug: "goods", title: "Goods" },
    tags: ["SEO", "seo", " "],
    features: ["Fast", "Fast", "Stable"],
    priceAmountCents: 123456,
    priceLabel: null,
    developmentDays: 3,
    deliveryLabel: null,
    demoMode: "external-iframe",
    demoUrl: "javascript:alert(1)",
    siteUrl: "https://example.test/catalog",
    previewImageUrl: "assets/img/previews/safe.png",
    previewImage: null,
    galleryImages: [],
  });

  assert.equal(item.key, "safe-site");
  assert.equal(item.id, "safe-site");
  assert.equal(item.slug, "safe-site");
  assert.equal(item.title, "<img src=x onerror=alert(1)>");
  assert.equal(item.shortDescription, '" onmouseover="alert(1)');
  assert.equal(item.category, "Goods");
  assert.equal(item.categorySlug, "goods");
  assert.deepEqual(plain(item.tags), ["seo"]);
  assert.deepEqual(plain(item.features), ["Fast", "Stable"]);
  assert.equal(item.priceLabel, "от 1 235 ₽");
  assert.equal(item.deliveryLabel, "от 3 дней");
  assert.equal(item.demoUrl, "");
  assert.equal(item.siteUrl, "https://example.test/catalog");
  assert.equal(item.previewImageUrl, "assets/img/previews/safe.png");
  assert.equal(item.source, "api");
  assert.deepEqual(plain(item.aliases), ["safe-site"]);
  assert.equal(catalog.escapeHtml(item.title), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(catalog.escapeAttribute('`" onmouseover="alert(1)'), "&#096;&quot; onmouseover=&quot;alert(1)");
});

test("normalizes static catalog, excludes inactive records, and supports aliases", async () => {
  const catalog = await loadCatalog({
    data: {
      SOLUTIONS: [
        {
          id: "mebel",
          legacyTitle: "Old Furniture",
          title: "Furniture",
          category: "Goods",
          description: "Catalog site",
          priceFrom: "from 39000",
          deliveryTime: "from 2 days",
          filter: "goods",
          previewImage: "assets/img/previews/furniture.png",
          features: ["Catalog", "Catalog", "Leads"],
          galleryImages: ["assets/img/previews/furniture.png"],
          demoMode: "local",
          demoLocalUrl: "demo/furniture.html",
        },
        { id: "hidden", title: "Hidden", active: false },
      ],
    },
  });

  const result = catalog.getStaticCatalog();
  assert.equal(result.source, "static");
  assert.equal(result.lifecycle, "ready");
  assert.equal(result.items.length, 1);
  assert.deepEqual(plain(result.items[0].aliases), ["mebel", "Old Furniture"]);
  assert.deepEqual(plain(result.items[0].features), ["Catalog", "Leads"]);
  assert.equal(result.items[0].previewImage.url, "assets/img/previews/furniture.png");
  assert.equal(catalog.findCatalogItem(result.items, "mebel"), result.items[0]);
  assert.equal(catalog.findCatalogItem(result.items, "Old Furniture"), result.items[0]);
});

test("rejects unsafe public URLs", async () => {
  const catalog = await loadCatalog();
  const payloads = [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "blob:https://evil.example/id",
    "file:///C:/secret.txt",
    "//evil.example/catalog",
    "https://user:pass@example.test/catalog",
    "https://example.test/%0aevil",
    "../outside.png",
    "assets/%2e%2e/private.png",
    "assets/%2E%2E/private.png",
    "assets/..%2fprivate.png",
    "assets/%2e%2e%5cprivate.png",
    "assets/%252e%252e/private.png",
    "assets/%252e%252e%252fprivate.png",
    "assets/%2e%2e%252fprivate.png",
    "assets/%252e%252e%255cprivate.png",
    "/api",
    "\u0000https://example.test",
  ];

  for (const value of payloads) {
    assert.equal(catalog.sanitizePublicUrl(value, { purpose: "image", allowRelative: true }), "");
  }
});
