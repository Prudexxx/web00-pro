import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const CURRENT_CACHE = "web00-shell-v7-zero-stale";
const LEGACY_V6_CACHE = "web00-shell-v6-catalog-network-first";
const RUNTIME_VERSION = "zero-stale-catalog-v1";
const DATA_URL = "https://web00.pro/assets/js/data.js?v=fresh";
const V2_RUNTIME_URLS = [
  `https://web00.pro/assets/js/catalog-v2/catalog-runtime.js?v=${RUNTIME_VERSION}`,
  `https://web00.pro/assets/js/catalog-v2/catalog-api.js?v=${RUNTIME_VERSION}`,
  `https://web00.pro/assets/js/catalog-v2/main.js?v=${RUNTIME_VERSION}`,
];

test("service worker fetches catalog data.js from network before generic shell cache and keeps the latest successful copy", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async () => jsResponse("window.WEB00_DATA = { marker: 'fresh' };"),
  });
  await worker.put(CURRENT_CACHE, "https://web00.pro/assets/js/data.js", "window.WEB00_DATA = { marker: 'stale' };");
  worker.clearOperations();

  const response = await worker.fetch(DATA_URL);

  assert.equal(await response.text(), "window.WEB00_DATA = { marker: 'fresh' };");
  assert.equal(worker.fetchCalls.length, 1);
  assert.equal(worker.fetchCalls[0].url, DATA_URL);
  assert.equal(worker.fetchCalls[0].cache, "no-store");
  assert.equal(worker.operations[0].type, "fetch");
  assert.equal(worker.operations.some((entry) => entry.type === "cache.match" && entry.beforeFirstFetch), false);

  const cached = await worker.match(CURRENT_CACHE, DATA_URL, { ignoreSearch: true });
  assert.equal(await cached.text(), "window.WEB00_DATA = { marker: 'fresh' };");
});

test("service worker falls back to the last cached data.js only after the network path fails", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async () => {
      throw new TypeError("network down");
    },
  });
  await worker.put(CURRENT_CACHE, "https://web00.pro/assets/js/data.js?v=previous", "window.WEB00_DATA = { marker: 'cached' };");
  worker.clearOperations();

  const response = await worker.fetch(DATA_URL);

  assert.equal(await response.text(), "window.WEB00_DATA = { marker: 'cached' };");
  assert.equal(worker.fetchCalls.length, 1);
  assert.equal(worker.fetchCalls[0].cache, "no-store");
  assert.equal(worker.operations[0].type, "fetch");
});

test("service worker keeps generic cache-first behavior for non-catalog shell assets", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async () => {
      throw new Error("CSS shell asset should be served from cache first.");
    },
  });
  await worker.put(CURRENT_CACHE, "https://web00.pro/assets/css/base.css", "body { color: #123456; }", {
    headers: { "Content-Type": "text/css" },
  });
  worker.clearOperations();

  const response = await worker.fetch("https://web00.pro/assets/css/base.css?v=stale");

  assert.equal(await response.text(), "body { color: #123456; }");
  assert.equal(worker.fetchCalls.length, 0);
  assert.equal(worker.operations[0].type, "cache.match");
});

test("legacy v6 service worker can satisfy query-string-only runtime migration with old cached bytes", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async () => jsResponse("window.__NEW_RUNTIME__ = true;"),
    sourcePath: "tests/frontend/fixtures/legacy-sw-v6.js",
  });
  await worker.put(
    LEGACY_V6_CACHE,
    "https://web00.pro/assets/js/main.js",
    "window.__OLD_RUNTIME__ = true;"
  );
  worker.clearOperations();

  const response = await worker.fetch("https://web00.pro/assets/js/main.js?v=zero-stale");

  assert.equal(await response.text(), "window.__OLD_RUNTIME__ = true;");
  assert.equal(worker.fetchCalls.length, 0);
  assert.equal(worker.operations[0].type, "cache.match");
});

test("service worker install rejects when the shell precache cannot complete", async () => {
  const worker = await loadServiceWorker({
    addAllThrows: new Error("precache failed"),
    fetchHandler: async () => jsResponse("ok"),
  });

  await assert.rejects(() => worker.install(), /precache failed/);
});

test("service worker install precaches exact catalog-v2 runtime entries", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async () => jsResponse("ok"),
  });

  await worker.install();

  for (const url of V2_RUNTIME_URLS) {
    const cached = await worker.match(CURRENT_CACHE, url);
    assert.ok(cached, `${url} should be precached with its exact version query`);
    assert.match(await cached.text(), /cached assets\/js\/catalog-v2\//);
  }
  assert.equal(await worker.match(CURRENT_CACHE, "https://web00.pro/assets/js/catalog-runtime.js?v=b9-catalog-lkg-1", { ignoreSearch: true }), undefined);
  assert.equal(await worker.match(CURRENT_CACHE, "https://web00.pro/assets/js/catalog-api.js?v=b9-catalog-lkg-1", { ignoreSearch: true }), undefined);
  assert.equal(await worker.match(CURRENT_CACHE, "https://web00.pro/assets/js/main.js?v=b9-catalog-lkg-1", { ignoreSearch: true }), undefined);
});

test("service worker activate retires old WEB00 shell caches and preserves unrelated caches", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async () => jsResponse("ok"),
  });
  await worker.put(LEGACY_V6_CACHE, "https://web00.pro/assets/js/data.js", "old v6");
  await worker.put("web00-shell-v5-old", "https://web00.pro/assets/js/data.js", "old v5");
  await worker.put("third-party-cache", "https://web00.pro/assets/js/data.js", "external");

  await worker.activate();

  const names = await worker.cacheNames();
  assert.equal(names.includes(LEGACY_V6_CACHE), false);
  assert.equal(names.includes("web00-shell-v5-old"), false);
  assert.equal(names.includes("third-party-cache"), true);
});

test("service worker fetches catalog-v2 runtime from the network first and caches the exact URL", async () => {
  const runtimeUrl = V2_RUNTIME_URLS[2];
  const worker = await loadServiceWorker({
    fetchHandler: async (request) => jsResponse(`network:${requestUrl(request)}`),
  });
  await worker.put(CURRENT_CACHE, "https://web00.pro/assets/js/catalog-v2/main.js?v=previous", "stale runtime");
  worker.clearOperations();

  const response = await worker.fetch(runtimeUrl);

  assert.equal(await response.text(), `network:${runtimeUrl}`);
  assert.equal(worker.fetchCalls.length, 1);
  assert.equal(worker.fetchCalls[0].url, runtimeUrl);
  assert.equal(worker.fetchCalls[0].cache, "no-store");
  assert.equal(worker.operations[0].type, "fetch");

  const cached = await worker.match(CURRENT_CACHE, runtimeUrl);
  assert.equal(await cached.text(), `network:${runtimeUrl}`);
});

test("service worker uses only exact catalog-v2 runtime query matches after network failure", async () => {
  const runtimeUrl = V2_RUNTIME_URLS[2];
  const previousUrl = "https://web00.pro/assets/js/catalog-v2/main.js?v=previous";
  const worker = await loadServiceWorker({
    fetchHandler: async () => {
      throw new TypeError("network down");
    },
  });
  await worker.put(CURRENT_CACHE, previousUrl, "stale runtime");
  worker.clearOperations();

  await assert.rejects(() => worker.fetch(runtimeUrl), /WEB00 runtime unavailable|network down/);
  assert.equal(worker.fetchCalls.length, 1);
  assert.equal(worker.operations.some((entry) => entry.type === "cache.match" && entry.ignoreSearch), false);
});

test("legacy v6 service worker cannot satisfy catalog-v2 physical runtime paths from old shell entries", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async (request) => jsResponse(`network:${new URL(requestUrl(request), "https://web00.pro/").pathname}`),
    sourcePath: "tests/frontend/fixtures/legacy-sw-v6.js",
  });
  await worker.put(LEGACY_V6_CACHE, "https://web00.pro/assets/js/main.js", "old main");
  await worker.put(LEGACY_V6_CACHE, "https://web00.pro/assets/js/catalog-api.js", "old api");
  await worker.put(LEGACY_V6_CACHE, "https://web00.pro/assets/js/catalog-runtime.js", "old runtime");
  worker.clearOperations();

  const main = await worker.fetch("https://web00.pro/assets/js/catalog-v2/main.js");
  const api = await worker.fetch("https://web00.pro/assets/js/catalog-v2/catalog-api.js");
  const runtime = await worker.fetch("https://web00.pro/assets/js/catalog-v2/catalog-runtime.js");

  assert.equal(await main.text(), "network:/assets/js/catalog-v2/main.js");
  assert.equal(await api.text(), "network:/assets/js/catalog-v2/catalog-api.js");
  assert.equal(await runtime.text(), "network:/assets/js/catalog-v2/catalog-runtime.js");
  assert.equal(worker.fetchCalls.length, 3);
});

test("service worker does not intercept cross-origin Cloud runtime manifest", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async () => new Response(JSON.stringify({ marker: "fresh-cloud-manifest" }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
      status: 200,
    }),
  });

  const manifestUrl = "https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json?v=fresh";
  const response = await worker.fetch(manifestUrl);
  const body = await response.json();

  assert.equal(body.marker, "fresh-cloud-manifest");
  assert.equal(worker.fetchCalls.length, 1);
  assert.equal(worker.operations.some((entry) => entry.type === "cache.match"), false);
});

test("catalog-v2 main.js registers service worker updates without HTTP cache and reloads once after controller migration", async () => {
  const registerCalls = [];
  const serviceWorkerListeners = [];
  const reloads = [];
  const storage = trackedSessionStorage();
  const browser = createFakeBrowser({
    href: "https://web00.pro/index.html",
    navigator: {
      serviceWorker: {
        addEventListener(type, handler) {
          serviceWorkerListeners.push({ handler, type });
        },
        controller: {},
        register(...args) {
          registerCalls.push(args);
          return Promise.resolve({});
        },
      },
    },
    page: "home",
    sessionStorage: storage,
  });
  browser.window.WEB00_DATA = {
    FAQ: [],
    PRICING: [],
    SERVICES: [],
    SOLUTIONS: [{
      active: true,
      galleryImages: [],
      id: "smoke",
      previewImage: "",
      slug: "smoke",
      title: "Smoke",
    }],
  };
  const emptyCatalogState = { items: [], lifecycle: "ready", source: "static" };
  browser.window.WEB00_CATALOG = {
    findCatalogItem: () => null,
    getInitialCatalog: () => emptyCatalogState,
    getStaticCatalog: () => ({ items: [] }),
    resolveCatalogForPage: async () => emptyCatalogState,
  };
  browser.window.addEventListener = () => undefined;
  browser.window.localStorage = { getItem: () => null, setItem: () => undefined };
  browser.window.location.reload = () => {
    reloads.push("reload");
  };

  await loadClassicScript("assets/js/catalog-v2/main.js", browser);
  for (const handler of browser.listeners.get("DOMContentLoaded") || []) {
    await handler();
  }

  assert.equal(registerCalls.length, 1);
  assert.equal(registerCalls[0][0], "sw.js");
  assert.equal(registerCalls[0][1]?.updateViaCache, "none");
  const controllerChange = serviceWorkerListeners.find((listener) => listener.type === "controllerchange");
  assert.ok(controllerChange, "controllerchange listener should be registered for old-service-worker migration");

  controllerChange.handler();
  controllerChange.handler();

  assert.equal(reloads.length, 1);
  assert.equal(storage.getCalls.length, 0);
  assert.equal(storage.setCalls.length, 0);
});

test("catalog-v2 main.js does not let an old unversioned reload marker block a future service worker update", async () => {
  const registerCalls = [];
  const serviceWorkerListeners = [];
  const reloads = [];
  const storage = trackedSessionStorage();
  storage.setItem("web00.serviceWorker.controllerchangeReloaded", "1");
  storage.getCalls.length = 0;
  storage.setCalls.length = 0;
  const browser = createFakeBrowser({
    href: "https://web00.pro/index.html",
    navigator: {
      serviceWorker: {
        addEventListener(type, handler) {
          serviceWorkerListeners.push({ handler, type });
        },
        controller: {},
        register(...args) {
          registerCalls.push(args);
          return Promise.resolve({});
        },
      },
    },
    page: "home",
    sessionStorage: storage,
  });
  browser.window.WEB00_DATA = {
    FAQ: [],
    PRICING: [],
    SERVICES: [],
    SOLUTIONS: [{
      active: true,
      galleryImages: [],
      id: "smoke",
      previewImage: "",
      slug: "smoke",
      title: "Smoke",
    }],
  };
  const emptyCatalogState = { items: [], lifecycle: "ready", source: "static" };
  browser.window.WEB00_CATALOG = {
    findCatalogItem: () => null,
    getInitialCatalog: () => emptyCatalogState,
    getStaticCatalog: () => ({ items: [] }),
    resolveCatalogForPage: async () => emptyCatalogState,
  };
  browser.window.addEventListener = () => undefined;
  browser.window.localStorage = { getItem: () => null, setItem: () => undefined };
  browser.window.location.reload = () => {
    reloads.push("reload");
  };

  await loadClassicScript("assets/js/catalog-v2/main.js", browser);
  for (const handler of browser.listeners.get("DOMContentLoaded") || []) {
    await handler();
  }

  assert.equal(registerCalls.length, 1);
  const controllerChange = serviceWorkerListeners.find((listener) => listener.type === "controllerchange");
  assert.ok(controllerChange, "controllerchange listener should be registered for old-service-worker migration");

  controllerChange.handler();
  controllerChange.handler();

  assert.equal(reloads.length, 1);
  assert.equal(storage.getCalls.length, 0);
  assert.equal(storage.setCalls.length, 0);
});

test("catalog-v2 main.js does not let a previous completed migration marker block a later genuine controller change", async () => {
  const registerCalls = [];
  const serviceWorkerListeners = [];
  const reloads = [];
  const storage = trackedSessionStorage();
  storage.setItem("web00.serviceWorker.controllerchangeReloaded", CURRENT_CACHE);
  storage.getCalls.length = 0;
  storage.setCalls.length = 0;
  const browser = createFakeBrowser({
    href: "https://web00.pro/index.html",
    navigator: {
      serviceWorker: {
        addEventListener(type, handler) {
          serviceWorkerListeners.push({ handler, type });
        },
        controller: {},
        register(...args) {
          registerCalls.push(args);
          return Promise.resolve({});
        },
      },
    },
    page: "home",
    sessionStorage: storage,
  });
  browser.window.WEB00_DATA = {
    FAQ: [],
    PRICING: [],
    SERVICES: [],
    SOLUTIONS: [{
      active: true,
      galleryImages: [],
      id: "smoke",
      previewImage: "",
      slug: "smoke",
      title: "Smoke",
    }],
  };
  const emptyCatalogState = { items: [], lifecycle: "ready", source: "static" };
  browser.window.WEB00_CATALOG = {
    findCatalogItem: () => null,
    getInitialCatalog: () => emptyCatalogState,
    getStaticCatalog: () => ({ items: [] }),
    resolveCatalogForPage: async () => emptyCatalogState,
  };
  browser.window.addEventListener = () => undefined;
  browser.window.localStorage = { getItem: () => null, setItem: () => undefined };
  browser.window.location.reload = () => {
    reloads.push("reload");
  };

  await loadClassicScript("assets/js/catalog-v2/main.js", browser);
  for (const handler of browser.listeners.get("DOMContentLoaded") || []) {
    await handler();
  }

  assert.equal(registerCalls.length, 1);
  const controllerChange = serviceWorkerListeners.find((listener) => listener.type === "controllerchange");
  assert.ok(controllerChange, "controllerchange listener should be registered for old-service-worker migration");

  controllerChange.handler();
  controllerChange.handler();

  assert.equal(reloads.length, 1);
  assert.equal(storage.getCalls.length, 0);
  assert.equal(storage.setCalls.length, 0);
});

test("catalog-v2 main.js does not reload on first service worker install without an existing controller", async () => {
  const registerCalls = [];
  const serviceWorkerListeners = [];
  const reloads = [];
  const storage = trackedSessionStorage();
  const browser = createFakeBrowser({
    href: "https://web00.pro/index.html",
    navigator: {
      serviceWorker: {
        addEventListener(type, handler) {
          serviceWorkerListeners.push({ handler, type });
        },
        controller: null,
        register(...args) {
          registerCalls.push(args);
          return Promise.resolve({});
        },
      },
    },
    page: "home",
    sessionStorage: storage,
  });
  browser.window.WEB00_DATA = {
    FAQ: [],
    PRICING: [],
    SERVICES: [],
    SOLUTIONS: [{
      active: true,
      galleryImages: [],
      id: "smoke",
      previewImage: "",
      slug: "smoke",
      title: "Smoke",
    }],
  };
  const emptyCatalogState = { items: [], lifecycle: "ready", source: "static" };
  browser.window.WEB00_CATALOG = {
    findCatalogItem: () => null,
    getInitialCatalog: () => emptyCatalogState,
    getStaticCatalog: () => ({ items: [] }),
    resolveCatalogForPage: async () => emptyCatalogState,
  };
  browser.window.addEventListener = () => undefined;
  browser.window.localStorage = { getItem: () => null, setItem: () => undefined };
  browser.window.location.reload = () => {
    reloads.push("reload");
  };

  await loadClassicScript("assets/js/catalog-v2/main.js", browser);
  for (const handler of browser.listeners.get("DOMContentLoaded") || []) {
    await handler();
  }

  assert.equal(registerCalls.length, 1);
  const controllerChange = serviceWorkerListeners.find((listener) => listener.type === "controllerchange");
  assert.ok(controllerChange, "controllerchange listener should be registered for old-service-worker migration");

  controllerChange.handler();
  controllerChange.handler();

  assert.equal(reloads.length, 0);
  assert.equal(storage.getCalls.length, 0);
  assert.equal(storage.setCalls.length, 0);
});

async function loadServiceWorker(options = {}) {
  const source = await readFile(options.sourcePath || "sw.js", "utf8");
  const listeners = new Map();
  const operations = [];
  const fetchCalls = [];
  let fetchHandler = options.fetchHandler || (async () => jsResponse("ok"));
  const caches = fakeCacheStorage(operations, {
    addAllThrows: options.addAllThrows,
  });
  const self = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    clients: { claim: () => Promise.resolve() },
    location: new URL("https://web00.pro/"),
    skipWaiting: () => undefined,
  };
  const context = vm.createContext({
    Request,
    Response,
    URL,
    caches,
    console,
    fetch: async (input, init = {}) => {
      const url = requestUrl(input);
      const cache = init.cache || input?.cache || null;
      const call = { cache, url };
      fetchCalls.push(call);
      operations.push({ ...call, type: "fetch" });
      return fetchHandler(input, init);
    },
    self,
  });
  vm.runInContext(source, context, { filename: options.sourcePath || "sw.js" });

  return {
    activate: async () => {
      const handler = listeners.get("activate");
      assert.ok(handler, "sw.js should register an activate handler");
      const waits = [];
      handler({
        waitUntil(promise) {
          waits.push(Promise.resolve(promise));
        },
      });
      await Promise.all(waits);
    },
    cacheNames: () => caches.keys(),
    fetch: async (url, init = {}) => {
      const handler = listeners.get("fetch");
      assert.ok(handler, "sw.js should register a fetch handler");
      let responsePromise = null;
      handler({
        request: new Request(url, init),
        respondWith(promise) {
          responsePromise = Promise.resolve(promise);
        },
      });
      return responsePromise || context.fetch(url, init);
    },
    fetchCalls,
    clearOperations: () => {
      operations.length = 0;
    },
    install: async () => {
      const handler = listeners.get("install");
      assert.ok(handler, "sw.js should register an install handler");
      const waits = [];
      handler({
        waitUntil(promise) {
          waits.push(Promise.resolve(promise));
        },
      });
      await Promise.all(waits);
    },
    match: (cacheName, url, options) => caches.matchIn(cacheName, url, options),
    operations,
    put: (cacheName, url, body, options) => caches.putIn(cacheName, url, body, options),
    setFetchHandler(nextFetchHandler) {
      fetchHandler = nextFetchHandler;
    },
  };
}

function fakeCacheStorage(operations, options = {}) {
  const cachesByName = new Map();

  function ensure(name) {
    if (!cachesByName.has(name)) {
      cachesByName.set(name, fakeCache(name, operations, options));
    }
    return cachesByName.get(name);
  }

  return {
    delete: async (name) => cachesByName.delete(name),
    keys: async () => [...cachesByName.keys()],
    match: async (request, options = {}) => {
      operations.push({
        beforeFirstFetch: !operations.some((entry) => entry.type === "fetch"),
        ignoreSearch: Boolean(options.ignoreSearch),
        type: "cache.match",
        url: requestUrl(request),
      });
      for (const cache of cachesByName.values()) {
        const response = await cache.match(request, options);
        if (response) return response;
      }
      return undefined;
    },
    matchIn: async (name, url, options = {}) => ensure(name).match(new Request(url), options),
    open: async (name) => {
      operations.push({ name, type: "caches.open" });
      return ensure(name);
    },
    putIn: async (name, url, body, options = {}) => ensure(name).put(new Request(url), jsResponse(body, options)),
  };
}

function fakeCache(name, operations, options = {}) {
  const entries = new Map();

  return {
    addAll: async (assets) => {
      operations.push({ assets: [...assets], name, type: "cache.addAll" });
      if (options.addAllThrows) {
        throw options.addAllThrows;
      }
      for (const asset of assets) {
        entries.set(normalizeUrl(asset), jsResponse(`/* cached ${asset} */`));
      }
    },
    match: async (request, options = {}) => {
      operations.push({
        beforeFirstFetch: !operations.some((entry) => entry.type === "fetch"),
        ignoreSearch: Boolean(options.ignoreSearch),
        name,
        type: "cache.match",
        url: requestUrl(request),
      });
      const key = normalizeUrl(requestUrl(request), options);
      if (options.ignoreSearch) {
        for (const [entryKey, response] of entries) {
          if (normalizeUrl(entryKey, options) === key) {
            return response.clone();
          }
        }
      }
      return entries.get(key)?.clone();
    },
    put: async (request, response) => {
      operations.push({ name, type: "cache.put", url: requestUrl(request) });
      entries.set(normalizeUrl(requestUrl(request)), response.clone());
    },
  };
}

function normalizeUrl(value, options = {}) {
  const url = new URL(value, "https://web00.pro/");
  if (options.ignoreSearch) {
    url.search = "";
  }
  return url.href;
}

function requestUrl(value) {
  return typeof value === "string" ? value : value.url;
}

function jsResponse(body, options = {}) {
  return new Response(body, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", ...options.headers },
    status: options.status || 200,
  });
}

function trackedSessionStorage() {
  const values = new Map();
  const getCalls = [];
  const setCalls = [];

  return {
    getCalls,
    getItem(key) {
      getCalls.push({ key: String(key) });
      return values.get(String(key)) || null;
    },
    removeItem(key) {
      values.delete(String(key));
    },
    setCalls,
    setItem(key, value) {
      const call = { key: String(key), value: String(value) };
      setCalls.push(call);
      values.set(call.key, call.value);
    },
  };
}
