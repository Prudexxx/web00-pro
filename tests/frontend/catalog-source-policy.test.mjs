import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

function loadClassicScript(path, browser) {
  const source = readFileSync(path, "utf8");
  vm.runInContext(source, browser.context, { filename: path });
}

function createBrowser({ config, data, fetch }) {
  const window = {
    AbortController,
    Date,
    URL,
    WEB00_CONFIG: Object.freeze(config),
    WEB00_DATA: data || { SOLUTIONS: [] },
    WEB00_TEST_MODE: true,
    clearTimeout,
    console,
    fetch,
    sessionStorage: createStorage(),
    setTimeout
  };
  window.window = window;

  const context = vm.createContext({
    AbortController,
    Date,
    Object,
    Response,
    URL,
    clearTimeout,
    console,
    setTimeout,
    window
  });

  return { context, window };
}

function jsonResponse(body, options = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": options.contentType || "application/json" },
    status: options.status || 200
  });
}

async function loadCatalog(options = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return options.fetch(url, init, calls.length);
  };
  const browser = createBrowser({
    config: options.config,
    data: options.data,
    fetch
  });

  loadClassicScript("assets/js/catalog-api.js", browser);

  return { calls, catalog: browser.window.WEB00_CATALOG };
}

test("configured API empty result remains empty when fallback is disabled and no state exists", async () => {
  const { catalog } = await loadCatalog({
    config: {
      apiBaseUrl: "https://api.example.test",
      requestTimeoutMs: 8000,
      staticFallbackEnabled: false
    },
    data: { SOLUTIONS: [{ id: "static-site", title: "Static", active: true }] },
    fetch: () => jsonResponse({
      data: [],
      meta: { limit: 20, page: 1, total: 0, totalPages: 0 }
    })
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.source, "api");
  assert.equal(result.lifecycle, "empty");
  assert.equal(result.staticFallbackActive, false);
  assert.deepEqual(plain(result.items), []);
});

test("configured API error remains fatal when fallback is disabled and no state exists", async () => {
  const { catalog } = await loadCatalog({
    config: {
      apiBaseUrl: "https://api.example.test",
      requestTimeoutMs: 8000,
      staticFallbackEnabled: false
    },
    data: { SOLUTIONS: [{ id: "deleted-static-card", title: "Deleted", active: true }] },
    fetch: () => jsonResponse({ error: "down" }, { status: 503 })
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.source, "api");
  assert.equal(result.lifecycle, "fatal");
  assert.equal(result.staticFallbackActive, false);
  assert.deepEqual(plain(result.items), []);
});

test("empty API config keeps local static preview mode", async () => {
  const { catalog } = await loadCatalog({
    config: {
      apiBaseUrl: "",
      requestTimeoutMs: 8000,
      staticFallbackEnabled: false
    },
    data: { SOLUTIONS: [{ id: "static-site", title: "Static", active: true }] },
    fetch: () => {
      throw new Error("static mode must not fetch");
    }
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.source, "static");
  assert.equal(result.lifecycle, "ready");
  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["static-site"]);
});

test("configured API performs a fresh fetch on repeated catalog resolution", async () => {
  const { calls, catalog } = await loadCatalog({
    config: {
      apiBaseUrl: "https://api.example.test",
      requestTimeoutMs: 8000,
      staticFallbackEnabled: false
    },
    fetch: (_url, _init, callNumber) => jsonResponse({
      data: [
        {
          category: { slug: "goods", title: "Goods" },
          slug: callNumber === 1 ? "fresh-one" : "fresh-two",
          title: callNumber === 1 ? "Fresh One" : "Fresh Two"
        }
      ],
      meta: { limit: 20, page: 1, total: 1, totalPages: 1 }
    })
  });

  const first = await catalog.resolveCatalogForPage({ kind: "solutions" });
  const second = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.deepEqual(plain(first.items.map((item) => item.slug)), ["fresh-one"]);
  assert.deepEqual(plain(second.items.map((item) => item.slug)), ["fresh-two"]);
  assert.equal(calls.length, 2);
});

test("popular catalog returns fatal when fallback is disabled and no state exists", async () => {
  const { catalog } = await loadCatalog({
    config: {
      apiBaseUrl: "https://api.example.test",
      requestTimeoutMs: 8000,
      staticFallbackEnabled: false
    },
    data: { SOLUTIONS: [{ id: "static-popular", title: "Static Popular", active: true }] },
    fetch: () => jsonResponse({ error: "down" }, { status: 503 })
  });

  const result = await catalog.resolveCatalogForPage({ kind: "popular", limit: 3 });

  assert.equal(result.source, "api");
  assert.equal(result.lifecycle, "fatal");
  assert.equal(result.staticFallbackActive, false);
  assert.equal(result.items.length, 0);
});
