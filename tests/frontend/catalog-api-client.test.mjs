import test from "node:test";
import assert from "node:assert/strict";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch, jsonResponse } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function loadCatalog({ fetch, config, data } = {}) {
  const browser = createFakeBrowser();
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = data || { SOLUTIONS: [] };
  browser.window.fetch = fetch;
  await loadClassicScript("assets/js/runtime-config.js", browser);
  if (config) browser.window.WEB00_CONFIG = Object.freeze(config);
  await loadClassicScript("assets/js/catalog-api.js", browser);
  return { catalog: browser.window.WEB00_CATALOG, tests: browser.window.WEB00_CATALOG_TESTS, fetch };
}

test("loadAllSites fetches paginated API pages with safe request options", async () => {
  const fetch = createFakeFetch((url) => {
    if (url.endsWith("page=1&limit=20&sort=sortOrder")) {
      return jsonResponse({
        data: [{ slug: "alpha-site", title: "Alpha", category: { slug: "goods", title: "Goods" } }],
        meta: { page: 1, limit: 20, total: 2, totalPages: 2 },
      });
    }
    return jsonResponse({
      data: [{ slug: "beta-site", title: "Beta", category: { slug: "services", title: "Services" } }],
      meta: { page: 2, limit: 20, total: 2, totalPages: 2 },
    });
  });
  const { catalog } = await loadCatalog({
    fetch,
    config: { apiBaseUrl: "https://api.example.test/", requestTimeoutMs: 8000, staticFallbackEnabled: true },
  });

  const result = await catalog.loadAllSites();

  assert.equal(result.source, "api");
  assert.equal(result.lifecycle, "ready");
  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["alpha-site", "beta-site"]);
  assert.deepEqual(fetch.calls.map((call) => call.url), [
    "https://api.example.test/api/sites?page=1&limit=20&sort=sortOrder",
    "https://api.example.test/api/sites?page=2&limit=20&sort=sortOrder",
  ]);
  assert.equal(fetch.calls[0].init.method, "GET");
  assert.equal(fetch.calls[0].init.credentials, "omit");
  assert.equal(fetch.calls[0].init.cache, "no-store");
  assert.equal(fetch.calls[0].init.redirect, "error");
  assert.equal(fetch.calls[0].init.body, undefined);
  assert.equal(fetch.calls[0].init.headers, undefined);
});

test("valid empty API result remains API empty and does not use static fallback", async () => {
  const fetch = createFakeFetch(() => jsonResponse({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }));
  const { catalog } = await loadCatalog({
    fetch,
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: true },
    data: { SOLUTIONS: [{ id: "static-site", title: "Static", active: true }] },
  });

  const result = await catalog.loadAllSites();

  assert.equal(result.source, "api");
  assert.equal(result.lifecycle, "empty");
  assert.equal(result.items.length, 0);
  assert.equal(fetch.calls.length, 1);
});

test("API client rejects unsafe envelopes and duplicate slugs", async () => {
  const wrongTypeFetch = createFakeFetch(() => jsonResponse({ data: [], meta: {} }, { contentType: "text/html" }));
  const wrongType = await loadCatalog({
    fetch: wrongTypeFetch,
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: true },
  });
  await assert.rejects(() => wrongType.catalog.loadAllSites(), /WEB00_API_CONTENT_TYPE/);

  const duplicateFetch = createFakeFetch(() => jsonResponse({
    data: [
      { slug: "same-site", title: "One", category: { slug: "goods", title: "Goods" } },
      { slug: "same-site", title: "Two", category: { slug: "goods", title: "Goods" } },
    ],
    meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
  }));
  const duplicate = await loadCatalog({
    fetch: duplicateFetch,
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: true },
  });
  await assert.rejects(() => duplicate.catalog.loadAllSites(), /WEB00_API_DUPLICATE_SLUG/);
});

test("empty config resolves static catalog without fetch or fallback warning", async () => {
  const fetch = createFakeFetch(() => {
    throw new Error("fetch should not be called in static mode");
  });
  const { catalog } = await loadCatalog({
    fetch,
    data: { SOLUTIONS: [{ id: "static-site", title: "Static", active: true }] },
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.source, "static");
  assert.equal(result.lifecycle, "ready");
  assert.equal(result.staticFallbackActive, false);
  assert.equal(result.apiAvailable, false);
  assert.equal(fetch.calls.length, 0);
});

test("invalid runtime config disables API and keeps static mode safe", async () => {
  const fetch = createFakeFetch(() => {
    throw new Error("invalid config should not fetch");
  });
  const { catalog, tests } = await loadCatalog({
    fetch,
    config: {
      apiBaseUrl: "javascript:alert(1)",
      requestTimeoutMs: 99999,
      staticFallbackEnabled: "no",
    },
    data: { SOLUTIONS: [{ id: "static-site", title: "Static", active: true }] },
  });

  assert.deepEqual(plain(tests.validateConfig({
    apiBaseUrl: "javascript:alert(1)",
    requestTimeoutMs: 99999,
    staticFallbackEnabled: "no",
  })), {
    apiBaseUrl: "",
    apiEnabled: false,
    requestTimeoutMs: 8000,
    staticFallbackEnabled: true,
    valid: false,
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.source, "static");
  assert.equal(result.lifecycle, "ready");
  assert.equal(result.staticFallbackActive, false);
  assert.equal(fetch.calls.length, 0);
});

test("configured API failure uses static fallback only when enabled", async () => {
  const failingFetch = createFakeFetch(() => jsonResponse({ error: "down" }, { status: 503 }));
  const enabled = await loadCatalog({
    fetch: failingFetch,
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: true },
    data: { SOLUTIONS: [{ id: "static-site", title: "Static", active: true }] },
  });

  const fallback = await enabled.catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(fallback.source, "static-fallback");
  assert.equal(fallback.lifecycle, "fallback");
  assert.equal(fallback.staticFallbackActive, true);
  assert.equal(fallback.items[0].slug, "static-site");

  const disabled = await loadCatalog({
    fetch: createFakeFetch(() => jsonResponse({ error: "down" }, { status: 503 })),
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: false },
    data: { SOLUTIONS: [{ id: "static-site", title: "Static", active: true }] },
  });

  const fatal = await disabled.catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(fatal.source, "api");
  assert.equal(fatal.lifecycle, "fatal");
  assert.equal(fatal.staticFallbackActive, false);
  assert.equal(fatal.items.length, 0);
});

test("configured API failure without valid static data resolves fatal state", async () => {
  const failingFetch = createFakeFetch(() => jsonResponse({ error: "down" }, { status: 503 }));
  const { catalog } = await loadCatalog({
    fetch: failingFetch,
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: true },
    data: { SOLUTIONS: [] },
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.source, "api");
  assert.equal(result.lifecycle, "fatal");
  assert.equal(result.staticFallbackActive, false);
  assert.equal(result.apiAvailable, false);
  assert.equal(result.items.length, 0);
});

test("API timeout uses static fallback and reports timeout code", async () => {
  const fetch = createFakeFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }));
  const { catalog } = await loadCatalog({
    fetch,
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 1000, staticFallbackEnabled: true },
    data: { SOLUTIONS: [{ id: "static-site", title: "Static", active: true }] },
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.source, "static-fallback");
  assert.equal(result.lifecycle, "fallback");
  assert.equal(result.errorCode, "WEB00_API_TIMEOUT");
  assert.equal(result.staticFallbackActive, true);
  assert.equal(fetch.calls.length, 1);
});

test("API client rejects malformed pagination and item cap overflows", async () => {
  const tooManyPages = await loadCatalog({
    fetch: createFakeFetch(() => jsonResponse({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 21 },
    })),
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: true },
  });
  await assert.rejects(() => tooManyPages.catalog.loadAllSites(), /WEB00_API_INVALID_META/);

  const wrongPage = await loadCatalog({
    fetch: createFakeFetch(() => jsonResponse({
      data: [],
      meta: { page: 2, limit: 20, total: 0, totalPages: 1 },
    })),
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: true },
  });
  await assert.rejects(() => wrongPage.catalog.loadAllSites(), /WEB00_API_INVALID_META/);

  const overflowItems = Array.from({ length: 1001 }, (_value, index) => ({
    slug: `site-${index}`,
    title: `Site ${index}`,
    category: { slug: "goods", title: "Goods" },
  }));
  const overflow = await loadCatalog({
    fetch: createFakeFetch(() => jsonResponse({
      data: overflowItems,
      meta: { page: 1, limit: 20, total: 1001, totalPages: 1 },
    })),
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: true },
  });
  await assert.rejects(() => overflow.catalog.loadAllSites(), /WEB00_API_ITEM_CAP/);
});

test("request channel aborts previous same-channel request and marks stale sequence", async () => {
  const { tests } = await loadCatalog();
  const channel = tests.createRequestChannel();

  const first = channel.start(8000);
  const second = channel.start(8000);

  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  assert.equal(channel.isStale(first.sequence), true);
  assert.equal(channel.isStale(second.sequence), false);
  channel.finish(second.sequence);
  assert.equal(channel.controller, null);
});

test("superseded catalog requests resolve to a non-applyable stale result", async () => {
  const pending = [createDeferred(), createDeferred()];
  const fetch = createFakeFetch((_url, _init, callNumber) => pending[callNumber - 1].promise);
  const { catalog } = await loadCatalog({
    fetch,
    config: { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: true },
  });

  const first = catalog.resolveCatalogForPage({ kind: "solutions" });
  const second = catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(fetch.calls.length, 2);
  assert.equal(fetch.calls[0].init.signal.aborted, true);
  assert.equal(fetch.calls[1].init.signal.aborted, false);

  pending[1].resolve(jsonResponse({
    data: [{ slug: "fresh-site", title: "Fresh", category: { slug: "goods", title: "Goods" } }],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  }));
  const fresh = await second;
  assert.equal(fresh.lifecycle, "ready");
  assert.equal(fresh.items[0].slug, "fresh-site");

  pending[0].resolve(jsonResponse({
    data: [{ slug: "stale-site", title: "Stale", category: { slug: "goods", title: "Goods" } }],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  }));
  const stale = await first;
  assert.equal(stale, null);
});
