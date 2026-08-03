import test from "node:test";
import assert from "node:assert/strict";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch, jsonResponse } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const LKG_KEY = "web00.catalog.api.lkg.v1";

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

function staticData() {
  return { SOLUTIONS: [{ id: "static-site", title: "Static", active: true }] };
}

function apiSite(slug = "site-custom", title = "Site Custom") {
  return { slug, title, category: { slug: "goods", title: "Goods" } };
}

function apiResponse(items) {
  return jsonResponse({
    data: items,
    meta: { page: 1, limit: 20, total: items.length, totalPages: items.length ? 1 : 0 },
  });
}

async function loadCatalog({ fetch, storage = createStorage(), data = staticData(), config } = {}) {
  const browser = createFakeBrowser();
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = data;
  browser.window.localStorage = storage;
  browser.window.fetch = fetch;
  await loadClassicScript("assets/js/runtime-config.js", browser);
  browser.window.WEB00_CONFIG = Object.freeze(config || {
    apiBaseUrl: "https://api.example.test",
    requestTimeoutMs: 1000,
    staticFallbackEnabled: true,
  });
  await loadClassicScript("assets/js/catalog-api.js", browser);
  return { catalog: browser.window.WEB00_CATALOG, storage, tests: browser.window.WEB00_CATALOG_TESTS };
}

test("API timeout keeps the populated static catalog available", async () => {
  const fetch = createFakeFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }));
  const { catalog } = await loadCatalog({ fetch });
  const initial = catalog.getInitialCatalog();

  const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: initial });

  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["static-site"]);
  assert.equal(result.lifecycle, "ready");
  assert.equal(result.errorCode, "WEB00_API_TIMEOUT");
  assert.equal(result.staticFallbackActive, true);
});

test("API transport and validation failures keep the populated current catalog", async (t) => {
  const cases = [
    ["HTTP 500", () => jsonResponse({ error: "down" }, { status: 500 }), "WEB00_API_HTTP_500"],
    ["invalid JSON", () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => { throw new Error("bad json"); } }), "WEB00_API_INVALID_JSON"],
    ["invalid envelope", () => jsonResponse({ sites: [] }), "WEB00_API_INVALID_ENVELOPE"],
  ];

  for (const [name, response, errorCode] of cases) {
    await t.test(name, async () => {
      const { catalog } = await loadCatalog({ fetch: createFakeFetch(response) });
      const initial = catalog.getInitialCatalog();
      const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: initial });

      assert.deepEqual(plain(result.items.map((item) => item.slug)), ["static-site"]);
      assert.equal(result.lifecycle, "ready");
      assert.equal(result.errorCode, errorCode);
      assert.equal(result.staticFallbackActive, true);
    });
  }
});

test("an empty API catalog cannot replace populated static cards", async () => {
  const { catalog } = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([])) });
  const initial = catalog.getInitialCatalog();

  const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: initial });

  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["static-site"]);
  assert.equal(result.lifecycle, "ready");
  assert.equal(result.errorCode, "WEB00_API_EMPTY");
});

test("a complete non-empty API catalog replaces the current catalog and becomes last-known-good", async () => {
  const storage = createStorage();
  const { catalog } = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([apiSite()])), storage });
  const initial = catalog.getInitialCatalog();

  const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: initial });
  const saved = JSON.parse(storage.snapshot()[LKG_KEY]);

  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["site-custom"]);
  assert.equal(result.source, "api");
  assert.equal(result.lifecycle, "ready");
  assert.deepEqual(Object.keys(saved).sort(), ["items", "popular", "revision", "savedAt", "schemaVersion", "settings"]);
  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.revision, 0);
  assert.deepEqual(saved.settings, { showDemoInModal: false });
  assert.deepEqual(saved.items.map((item) => item.slug), ["site-custom"]);
});

test("last-known-good renders synchronously on a new page load and survives a later failure", async () => {
  const storage = createStorage();
  const first = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([apiSite()])), storage });
  await first.catalog.resolveCatalogForPage({ kind: "solutions", currentState: first.catalog.getInitialCatalog() });

  const second = await loadCatalog({ fetch: createFakeFetch(() => jsonResponse({ error: "asleep" }, { status: 503 })), storage });
  const initial = second.catalog.getInitialCatalog();
  const result = await second.catalog.resolveCatalogForPage({ kind: "solutions", currentState: initial });

  assert.equal(initial.source, "lkg");
  assert.deepEqual(plain(initial.items.map((item) => item.slug)), ["site-custom"]);
  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["site-custom"]);
  assert.equal(result.errorCode, "WEB00_API_HTTP_503");
});

test("corrupted and unsafe last-known-good data falls back to bundled static items", async () => {
  const storage = createStorage({
    [LKG_KEY]: JSON.stringify({
      schemaVersion: 1,
      savedAt: "2026-08-03T00:00:00.000Z",
      items: [{ slug: "<bad>", title: "<img src=x onerror=alert(1)>", demoUrl: "javascript:alert(1)" }],
    }),
  });
  const { catalog } = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([])), storage });

  const initial = catalog.getInitialCatalog();

  assert.equal(initial.source, "static");
  assert.deepEqual(plain(initial.items.map((item) => item.slug)), ["static-site"]);
});

test("cached catalog item text and URLs are normalized before rendering helpers escape them", async () => {
  const storage = createStorage({
    [LKG_KEY]: JSON.stringify({
      schemaVersion: 1,
      savedAt: "2026-08-03T00:00:00.000Z",
      items: [{
        slug: "safe-site",
        title: "<img src=x onerror=alert(1)>",
        category: "Goods",
        categorySlug: "goods",
        demoUrl: "javascript:alert(1)",
        siteUrl: "https://example.test/catalog",
      }],
    }),
  });
  const { catalog } = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([])), storage });

  const [item] = catalog.getInitialCatalog().items;

  assert.equal(item.slug, "safe-site");
  assert.equal(item.demoUrl, "");
  assert.equal(item.siteUrl, "https://example.test/catalog");
  assert.equal(catalog.escapeHtml(item.title), "&lt;img src=x onerror=alert(1)&gt;");
});

test("last-known-good persistence rejects a serialized catalog over two MiB in bytes", async () => {
  const storage = createStorage();
  const { catalog, tests } = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([apiSite()])), storage });
  const title = "Ж".repeat(1050);
  const items = Array.from({ length: 1000 }, (_value, index) => ({
    slug: `site-${index}`,
    title,
    category: { slug: "goods", title: "Goods" },
  }));

  const saved = tests.saveLastKnownGoodCatalog(items);

  assert.equal(saved, false);
  assert.equal(storage.snapshot()[LKG_KEY], undefined);
});

test("API and last-known-good catalog URLs reject backslash authority forms", async () => {
  const unsafeUrl = "/\\evil.example/demo";
  const { catalog } = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([])) });
  const apiItem = catalog.normalizeApiSite({
    ...apiSite("api-safe"),
    demoUrl: unsafeUrl,
    previewImageUrl: unsafeUrl,
    previewImage: { url: "assets/img/previews/safe.png", variants: [{ avifUrl: unsafeUrl, webpUrl: unsafeUrl, width: 640 }] },
    galleryImages: [unsafeUrl],
  });

  assert.equal(apiItem.demoUrl, "");
  assert.equal(apiItem.previewImageUrl, "");
  assert.deepEqual(plain(apiItem.previewImage.variants), []);
  assert.deepEqual(plain(apiItem.galleryImages), []);

  const storage = createStorage({
    [LKG_KEY]: JSON.stringify({
      schemaVersion: 1,
      savedAt: "2026-08-03T00:00:00.000Z",
      items: [{
        slug: "lkg-safe",
        title: "Cached safe title",
        category: "Goods",
        categorySlug: "goods",
        demoUrl: unsafeUrl,
        previewImage: { url: "assets/img/previews/safe.png", variants: [{ avifUrl: unsafeUrl, webpUrl: unsafeUrl, width: 640 }] },
        galleryImages: [unsafeUrl],
      }],
    }),
  });
  const cached = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([])), storage });
  const [lkgItem] = cached.catalog.getInitialCatalog().items;

  assert.equal(lkgItem.demoUrl, "");
  assert.deepEqual(plain(lkgItem.previewImage.variants), []);
  assert.deepEqual(plain(lkgItem.galleryImages), []);
});

test("fallback flag controls empty initial failure states without clearing populated state", async () => {
  const disabledConfig = {
    apiBaseUrl: "https://api.example.test",
    requestTimeoutMs: 1000,
    staticFallbackEnabled: false,
  };
  const emptyFailure = await loadCatalog({
    fetch: createFakeFetch(() => jsonResponse({ error: "down" }, { status: 503 })),
    config: disabledConfig,
    data: { SOLUTIONS: [] },
  });
  const fatal = await emptyFailure.catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(fatal.lifecycle, "fatal");
  assert.equal(fatal.items.length, 0);
  assert.equal(fatal.staticFallbackActive, false);

  const noCurrent = await loadCatalog({
    fetch: createFakeFetch(() => jsonResponse({ error: "down" }, { status: 503 })),
    config: disabledConfig,
  });
  const noCurrentResult = await noCurrent.catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(noCurrentResult.lifecycle, "fatal");
  assert.equal(noCurrentResult.items.length, 0);
  assert.equal(noCurrentResult.staticFallbackActive, false);

  const populatedFailure = await loadCatalog({
    fetch: createFakeFetch(() => jsonResponse({ error: "down" }, { status: 503 })),
    config: disabledConfig,
  });
  const current = populatedFailure.catalog.getInitialCatalog();
  const preserved = await populatedFailure.catalog.resolveCatalogForPage({ kind: "solutions", currentState: current });

  assert.equal(preserved.lifecycle, "ready");
  assert.deepEqual(plain(preserved.items.map((item) => item.slug)), ["static-site"]);
  assert.equal(preserved.staticFallbackActive, true);
});

test("non-canonical last-known-good timestamp falls back to bundled static data", async () => {
  const storage = createStorage({
    [LKG_KEY]: JSON.stringify({
      schemaVersion: 1,
      savedAt: "2026-02-30T00:00:00.000Z",
      items: [{ slug: "lkg-site", title: "Cached title", category: "Goods", categorySlug: "goods" }],
    }),
  });
  const { catalog } = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([])), storage });

  assert.equal(catalog.getInitialCatalog().source, "static");
});
