import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const CURRENT_CACHE = "web00-shell-v6-catalog-network-first";
const DATA_URL = "https://web00.pro/assets/js/data.js?v=fresh";

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

test("main.js registers service worker updates without HTTP cache and reloads once after controller migration", async () => {
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

  await loadClassicScript("assets/js/main.js", browser);
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

test("main.js does not let an old unversioned reload marker block a future service worker update", async () => {
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

  await loadClassicScript("assets/js/main.js", browser);
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

test("an existing marker from the previous completed migration does not block a later genuine controller change", async () => {
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

  await loadClassicScript("assets/js/main.js", browser);
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

test("main.js does not reload on first service worker install without an existing controller", async () => {
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

  await loadClassicScript("assets/js/main.js", browser);
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

async function loadServiceWorker({ fetchHandler }) {
  const source = await readFile("sw.js", "utf8");
  const listeners = new Map();
  const operations = [];
  const fetchCalls = [];
  const caches = fakeCacheStorage(operations);
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
  vm.runInContext(source, context, { filename: "sw.js" });

  return {
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
      assert.ok(responsePromise, `fetch handler should respond to ${url}`);
      return responsePromise;
    },
    fetchCalls,
    clearOperations: () => {
      operations.length = 0;
    },
    match: (cacheName, url, options) => caches.matchIn(cacheName, url, options),
    operations,
    put: (cacheName, url, body, options) => caches.putIn(cacheName, url, body, options),
  };
}

function fakeCacheStorage(operations) {
  const cachesByName = new Map();

  function ensure(name) {
    if (!cachesByName.has(name)) {
      cachesByName.set(name, fakeCache(name, operations));
    }
    return cachesByName.get(name);
  }

  return {
    delete: async (name) => cachesByName.delete(name),
    keys: async () => [...cachesByName.keys()],
    match: async (request, options = {}) => {
      operations.push({
        beforeFirstFetch: !operations.some((entry) => entry.type === "fetch"),
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

function fakeCache(name, operations) {
  const entries = new Map();

  return {
    addAll: async (assets) => {
      for (const asset of assets) {
        entries.set(normalizeUrl(asset), jsResponse(`/* cached ${asset} */`));
      }
    },
    match: async (request, options = {}) => {
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
