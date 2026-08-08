import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch, jsonResponse } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const LKG_KEY = "web00.catalog.api.lkg.v1";

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function classList() {
  return { add: () => undefined, remove: () => undefined, toggle: () => undefined };
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

function freshSmokeStaticData() {
  return {
    SOLUTIONS: [{
      id: "web00-smoke-create",
      slug: "web00-smoke-create",
      title: "WEB00 Smoke Updated",
      active: true,
      sortOrder: 0,
    }],
    SERVICES: [],
    PRICING: [],
  };
}

function staleBusiLkgSnapshot() {
  return {
    [LKG_KEY]: JSON.stringify({
      schemaVersion: 1,
      savedAt: "2026-08-03T00:00:00.000Z",
      items: [{
        slug: "dom-dlya-busi",
        title: "Дом для Буси",
        category: "Goods",
        categorySlug: "goods",
      }],
    }),
  };
}

async function loadCatalog({ fetch, storage = createStorage(), data = staticData(), config } = {}) {
  const browser = createFakeBrowser();
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = data;
  browser.window.TextDecoder = TextDecoder;
  browser.window.TextEncoder = TextEncoder;
  browser.window.crypto = webcrypto;
  browser.window.localStorage = storage;
  browser.window.fetch = fetch;
  await loadClassicScript("assets/js/runtime-config.js", browser);
  browser.window.WEB00_CONFIG = Object.freeze(config || {
    apiBaseUrl: "https://api.example.test",
    requestTimeoutMs: 1000,
    staticFallbackEnabled: true,
  });
  if (config?.catalogRuntimeMode === "cloud-primary") {
    await loadClassicScript("assets/js/catalog-runtime.js", browser);
  }
  await loadClassicScript("assets/js/catalog-api.js", browser);
  return { catalog: browser.window.WEB00_CATALOG, storage, tests: browser.window.WEB00_CATALOG_TESTS };
}

function createSolutionsPage(fetch, options = {}) {
  const browser = createFakeBrowser({ page: "solutions" });
  const history = [];
  const statusNodes = {
    "[data-catalog-loading]": { hidden: true },
    "[data-catalog-fallback]": { hidden: true },
    "[data-catalog-empty]": { hidden: true },
    "[data-catalog-fatal]": { hidden: true },
  };
  const leadForm = { addEventListener: () => undefined, elements: {} };
  const leadContent = {
    querySelector(selector) {
      return selector === "[data-lead-form]" ? leadForm : null;
    },
    set innerHTML(value) {
      this.html = String(value);
    },
    html: "",
  };
  const leadModal = { classList: classList(), setAttribute: () => undefined };
  let gridHtml = "";
  const grid = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    get innerHTML() {
      return gridHtml;
    },
    set innerHTML(value) {
      gridHtml = String(value);
      history.push(gridHtml);
    },
  };
  browser.window.fetch = fetch;
  browser.window.addEventListener = () => undefined;
  browser.window.navigator = {};
  browser.window.localStorage = options.storage || createStorage();
  browser.document.body.classList = classList();
  browser.document.documentElement = { classList: classList() };
  browser.document.querySelector = (selector) => {
    if (selector === "[data-solutions-grid]") return grid;
    if (selector === "[data-lead-modal-content]") return leadContent;
    if (selector === "[data-modal=\"lead\"]") return leadModal;
    return statusNodes[selector] || null;
  };
  browser.document.querySelectorAll = () => [];
  browser.window.WEB00_DATA = options.data || staticData();
  browser.window.WEB00_TEST_MODE = true;
  return { browser, grid, history, statusNodes };
}

async function bootSolutionsPage(fetch, options = {}) {
  const page = createSolutionsPage(fetch, options);
  const { browser } = page;
  await loadClassicScript("assets/js/runtime-config.js", browser);
  browser.window.WEB00_CONFIG = Object.freeze(options.config || {
    apiBaseUrl: "https://api.example.test",
    requestTimeoutMs: 1000,
    staticFallbackEnabled: true,
  });
  browser.window.TextDecoder = TextDecoder;
  browser.window.TextEncoder = TextEncoder;
  browser.window.crypto = webcrypto;
  if (options.config?.catalogRuntimeMode === "cloud-primary") {
    await loadClassicScript("assets/js/catalog-runtime.js", browser);
  }
  await loadClassicScript("assets/js/catalog-api.js", browser);
  await loadClassicScript("assets/js/main.js", browser);
  const [onReady] = browser.listeners.get("DOMContentLoaded");
  await onReady();
  return page;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cloudConfig(overrides = {}) {
  return {
    apiBaseUrl: "https://web00-backend-production.onrender.com",
    catalogManifestUrl: "https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json",
    catalogRuntimeMode: "cloud-primary",
    requestTimeoutMs: 1000,
    staticFallbackEnabled: true,
    ...overrides,
  };
}

function cloudSnapshot(items, revision = 6) {
  const body = JSON.stringify({
    generatedAt: "2026-08-07T12:00:00.000Z",
    items,
    itemsCount: items.length,
    revision,
    schemaVersion: 1,
    settings: { showDemoInModal: false },
  }) + "\n";
  const sha256 = sha256Hex(body);
  const snapshotPath = `runtime/production/catalog/v1/releases/revision-${revision}-${sha256}.json`;
  const snapshotUrl = `https://web00-public-runtime.s3-website.cloud.ru/${snapshotPath}`;
  return {
    body,
    manifest: {
      generatedAt: "2026-08-07T12:00:00.000Z",
      itemsCount: items.length,
      revision,
      schemaVersion: 1,
      sha256,
      snapshotPath,
      snapshotUrl,
    },
    snapshotUrl,
  };
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

test("fresh static catalog takes precedence over stale last-known-good while backend is unavailable", async () => {
  const storage = createStorage(staleBusiLkgSnapshot());
  const { catalog } = await loadCatalog({
    fetch: createFakeFetch(() => jsonResponse({ error: "asleep" }, { status: 503 })),
    storage,
    data: freshSmokeStaticData(),
  });

  const initial = catalog.getInitialCatalog();
  const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: initial });

  assert.equal(initial.source, "static");
  assert.deepEqual(plain(initial.items.map((item) => item.slug)), ["web00-smoke-create"]);
  assert.deepEqual(plain(initial.items.map((item) => item.title)), ["WEB00 Smoke Updated"]);
  assert.equal(initial.items.some((item) => item.title === "Дом для Буси"), false);
  assert.equal(result.source, "static");
  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["web00-smoke-create"]);
  assert.equal(result.items.some((item) => item.title === "Дом для Буси"), false);
  assert.equal(result.staticFallbackActive, true);
  assert.equal(result.lifecycle, "ready");
});

test("valid Cloud runtime manifest and snapshot replaces static without Render catalog GET", async () => {
  const runtime = cloudSnapshot([apiSite("web00-smoke-create", "WEB00 Smoke Updated")]);
  const fetchCalls = [];
  const fetch = createFakeFetch(async (url) => {
    fetchCalls.push(String(url));
    if (String(url).startsWith(cloudConfig().catalogManifestUrl)) {
      return jsonResponse(runtime.manifest);
    }
    if (String(url) === runtime.snapshotUrl) {
      return new Response(new TextEncoder().encode(runtime.body), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        status: 200,
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const { catalog, storage } = await loadCatalog({
    config: cloudConfig(),
    data: freshSmokeStaticData(),
    fetch,
  });
  const initial = catalog.getInitialCatalog();
  const resolved = await catalog.resolveCatalogForPage({ currentState: initial, kind: "solutions" });
  const saved = JSON.parse(storage.snapshot()[LKG_KEY]);

  assert.equal(initial.source, "static");
  assert.equal(resolved.source, "cloud");
  assert.deepEqual(plain(resolved.items.map((item) => item.slug)), ["web00-smoke-create"]);
  assert.equal(fetchCalls.some((url) => url.includes("web00-backend-production.onrender.com/api/sites")), false);
  assert.deepEqual(saved.items.map((item) => item.slug), ["web00-smoke-create"]);
});

test("invalid Cloud snapshot SHA keeps current static catalog", async () => {
  const runtime = cloudSnapshot([apiSite("web00-smoke-create", "WEB00 Smoke Updated")]);
  const fetch = createFakeFetch(async (url) => {
    if (String(url).startsWith(cloudConfig().catalogManifestUrl)) {
      return jsonResponse({ ...runtime.manifest, sha256: "b".repeat(64) });
    }
    if (String(url) === runtime.snapshotUrl) {
      return new Response(new TextEncoder().encode(runtime.body), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        status: 200,
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const { catalog } = await loadCatalog({
    config: cloudConfig(),
    data: freshSmokeStaticData(),
    fetch,
  });
  const initial = catalog.getInitialCatalog();
  const resolved = await catalog.resolveCatalogForPage({ currentState: initial, kind: "solutions" });

  assert.equal(resolved.source, "static");
  assert.deepEqual(plain(resolved.items.map((item) => item.slug)), ["web00-smoke-create"]);
  assert.equal(resolved.staticFallbackActive, true);
  assert.equal(resolved.lifecycle, "ready");
});

test("Cloud timeout keeps static catalog and resolves loading state", async () => {
  const fetch = createFakeFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }));
  const { catalog } = await loadCatalog({
    config: cloudConfig({ requestTimeoutMs: 1 }),
    data: freshSmokeStaticData(),
    fetch,
  });
  const initial = catalog.getInitialCatalog();
  const resolved = await catalog.resolveCatalogForPage({ currentState: initial, kind: "solutions" });

  assert.equal(resolved.lifecycle, "ready");
  assert.equal(resolved.staticFallbackActive, true);
  assert.deepEqual(plain(resolved.items.map((item) => item.slug)), ["web00-smoke-create"]);
});

test("solutions render never paints stale last-known-good when fresh static catalog exists", async () => {
  const storage = createStorage(staleBusiLkgSnapshot());
  const fetch = createFakeFetch(() => Promise.reject(new Error("backend asleep")));
  const { history, statusNodes } = await bootSolutionsPage(fetch, {
    storage,
    data: freshSmokeStaticData(),
  });

  await delay(70);

  assert.ok(history.length > 0);
  assert.match(history[0], /WEB00 Smoke Updated/);
  assert.doesNotMatch(history[0], /Дом для Буси/);
  for (const html of history) {
    assert.match(html, /WEB00 Smoke Updated/);
    assert.doesNotMatch(html, /Дом для Буси/);
  }
  assert.match(history.at(-1), /WEB00 Smoke Updated/);
  assert.notEqual(history.at(-1), "");
  assert.equal(statusNodes["[data-catalog-loading]"].hidden, true);
  assert.equal(statusNodes["[data-catalog-fallback]"].hidden, false);
});

test("an empty API catalog resolves as non-applyable while callers keep populated current cards", async () => {
  const { catalog } = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([])) });
  const initial = catalog.getInitialCatalog();

  const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: initial });

  assert.deepEqual(plain(initial.items.map((item) => item.slug)), ["static-site"]);
  assert.deepEqual(plain(result.items), []);
  assert.equal(result.source, "api");
  assert.equal(result.lifecycle, "empty");
  assert.equal(result.errorCode, "");
  assert.equal(result.apiAvailable, true);
  assert.equal(result.staticFallbackActive, false);
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
  assert.deepEqual(Object.keys(saved).sort(), ["items", "savedAt", "schemaVersion"]);
  assert.equal(saved.schemaVersion, 1);
  assert.deepEqual(saved.items.map((item) => item.slug), ["site-custom"]);
});

test("last-known-good renders synchronously when bundled static catalog is empty and survives a later API failure", async () => {
  const storage = createStorage();
  const first = await loadCatalog({ fetch: createFakeFetch(() => apiResponse([apiSite()])), storage });
  await first.catalog.resolveCatalogForPage({ kind: "solutions", currentState: first.catalog.getInitialCatalog() });

  const second = await loadCatalog({
    fetch: createFakeFetch(() => jsonResponse({ error: "asleep" }, { status: 503 })),
    storage,
    data: { SOLUTIONS: [] },
  });
  const initial = second.catalog.getInitialCatalog();
  const result = await second.catalog.resolveCatalogForPage({ kind: "solutions", currentState: initial });

  assert.equal(initial.source, "lkg");
  assert.deepEqual(plain(initial.items.map((item) => item.slug)), ["site-custom"]);
  assert.equal(result.source, "lkg");
  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["site-custom"]);
  assert.equal(result.errorCode, "WEB00_API_HTTP_503");
  assert.equal(result.staticFallbackActive, true);
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
  const { catalog } = await loadCatalog({
    fetch: createFakeFetch(() => apiResponse([])),
    storage,
    data: { SOLUTIONS: [] },
  });

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
  const cached = await loadCatalog({
    fetch: createFakeFetch(() => apiResponse([])),
    storage,
    data: { SOLUTIONS: [] },
  });
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
