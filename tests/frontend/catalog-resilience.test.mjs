import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { existsSync } from "node:fs";
import { TextDecoder, TextEncoder } from "node:util";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch, jsonResponse } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const LKG_KEY = "web00.catalog.api.lkg.v1";
const V2_API_PATH = "assets/js/catalog-v2/catalog-api.js";
const V2_RUNTIME_PATH = "assets/js/catalog-v2/catalog-runtime.js";
const VERIFIED_CACHE_NAME = "web00-catalog-verified-v1";
const VERIFIED_METADATA_KEY = "web00.catalog.verified.v1";

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function classList() {
  return { add: () => undefined, remove: () => undefined, toggle: () => undefined };
}

class TestElement {
  constructor(options = {}) {
    this.classList = classList();
    this.dataset = options.dataset || {};
    this.hidden = false;
    this.listeners = new Map();
    this.style = { setProperty: () => undefined };
    this.value = "";
    this.html = "";
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    for (const listener of this.listeners.get(event.type) || []) {
      listener.call(this, event);
    }
  }

  getAttribute() {
    return null;
  }

  setAttribute() {}

  closest() {
    return null;
  }

  focus() {}

  getBoundingClientRect() {
    return { height: 520, width: 1180 };
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  get innerHTML() {
    return this.html;
  }

  set innerHTML(value) {
    this.html = String(value);
  }
}

class TestSolutionCard extends TestElement {
  constructor(solution) {
    super({ dataset: { solutionId: solution.id || solution.slug } });
    this.action = new TestElement();
    this.action.closest = (selector) => selector === ".solution-card__actions" ? this.action : null;
  }

  querySelector(selector) {
    return selector === "[data-card-action]" ? this.action : null;
  }
}

class TestSolutionsGrid extends TestElement {
  constructor(solution) {
    super();
    this.card = new TestSolutionCard(solution);
  }

  querySelectorAll(selector) {
    return selector === ".solution-card" ? [this.card] : [];
  }
}

function fakeDomEvent(type) {
  return {
    preventDefault() {},
    stopPropagation() {},
    target: null,
    type,
  };
}

function createStorage(initial = {}, options = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      if (options.getThrows) throw new Error("localStorage get failed");
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (options.setThrows) throw new Error("localStorage set failed");
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

async function loadCatalog(options = {}) {
  const {
    apiPath = "assets/js/catalog-api.js",
    cacheStorage,
    config,
    data = staticData(),
    fetch = createFakeFetch((url) => {
      throw new Error(`unexpected fetch ${url}`);
    }),
    runtime,
    runtimePath,
    storage = createStorage(),
  } = options;
  const browser = createFakeBrowser();
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = data;
  browser.window.TextDecoder = TextDecoder;
  browser.window.TextEncoder = TextEncoder;
  browser.window.crypto = webcrypto;
  browser.window.localStorage = storage;
  browser.window.fetch = fetch;
  browser.window.caches = Object.hasOwn(options, "cacheStorage") ? cacheStorage : createFakeCacheStorage();
  browser.window.Response = Response;
  await loadClassicScript("assets/js/runtime-config.js", browser);
  browser.window.WEB00_CONFIG = Object.freeze(config || {
    apiBaseUrl: "https://api.example.test",
    requestTimeoutMs: 1000,
    staticFallbackEnabled: true,
  });
  if (runtime) {
    browser.window.WEB00_CATALOG_RUNTIME = runtime;
  } else if (runtimePath || config?.catalogRuntimeMode === "cloud-primary") {
    await loadClassicScript(runtimePath || "assets/js/catalog-runtime.js", browser);
  }
  await loadClassicScript(apiPath, browser);
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

async function renderDemoModalForCatalogState(catalogState) {
  const [solution] = catalogState.items;
  const browser = createFakeBrowser({
    href: "https://prudexxx.github.io/web00-pro/solutions.html",
    page: "solutions",
  });
  const grid = new TestSolutionsGrid(solution);
  const demoContent = new TestElement();
  const demoModal = new TestElement();
  const demoDialog = new TestElement();
  const statusNodes = {
    "[data-catalog-loading]": new TestElement(),
    "[data-catalog-fallback]": new TestElement(),
    "[data-catalog-empty]": new TestElement(),
    "[data-catalog-fatal]": new TestElement(),
  };

  browser.window.addEventListener = () => undefined;
  browser.window.localStorage = createStorage();
  browser.window.navigator = {};
  browser.window.requestAnimationFrame = (callback) => callback();
  browser.document.body.classList = classList();
  browser.document.documentElement = { classList: classList() };
  browser.document.querySelector = (selector) => {
    if (selector === "[data-solutions-grid]") return grid;
    if (selector === "[data-demo-modal-content]") return demoContent;
    if (selector === "[data-modal=\"demo\"]") return demoModal;
    if (selector === "[data-modal=\"demo\"] .modal__dialog") return demoDialog;
    if (selector === ".modal.is-open") return null;
    return statusNodes[selector] || null;
  };
  browser.document.querySelectorAll = () => [];
  browser.window.WEB00_DATA = { SOLUTIONS: [], SERVICES: [], PRICING: [] };
  browser.window.WEB00_CATALOG = {
    findCatalogItem(items, value) {
      return items.find((item) => item.id === value || item.slug === value || item.key === value) || null;
    },
    getInitialCatalog() {
      return catalogState;
    },
    resolveCatalogForPage() {
      return Promise.resolve(catalogState);
    },
  };

  await loadClassicScript("assets/js/main.js", browser);
  const [onReady] = browser.listeners.get("DOMContentLoaded");
  await onReady();
  grid.card.action.dispatchEvent(fakeDomEvent("click"));

  return demoContent.innerHTML;
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

function cloudSnapshot(items, revision = 6, options = {}) {
  const body = JSON.stringify({
    generatedAt: "2026-08-07T12:00:00.000Z",
    items,
    itemsCount: items.length,
    revision,
    schemaVersion: 1,
    settings: options.settings ?? { showDemoInModal: false },
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

function cloneArrayBuffer(buffer) {
  return buffer.slice(0);
}

function bytesFromBody(body) {
  const bytes = new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function snapshotBytes(runtime) {
  return bytesFromBody(runtime.body);
}

function snapshotObject(runtime) {
  return JSON.parse(runtime.body);
}

function runtimeResult(runtime, overrides = {}) {
  return {
    cacheStatus: overrides.cacheStatus || "miss",
    freshness: overrides.freshness || "ready-current",
    manifest: runtime.manifest,
    snapshot: snapshotObject(runtime),
    transport: overrides.transport || "network",
  };
}

function createRuntimeStub(overrides = {}) {
  return {
    async loadCatalogFromRuntime() {
      throw Object.assign(new Error("runtime current not configured"), { code: "WEB00_CLOUD_RUNTIME_UNAVAILABLE" });
    },
    async loadVerifiedFallback() {
      return null;
    },
    ...overrides,
  };
}

function errorWithCode(code) {
  return Object.assign(new Error(code), { code });
}

function fetchForCloudRuntime(runtime, options = {}) {
  const config = options.config || cloudConfig();
  return createFakeFetch(async (url) => {
    if (String(url).startsWith(config.catalogManifestUrl)) return jsonResponse(runtime.manifest);
    if (String(url) === runtime.snapshotUrl) return jsonBytesResponse(runtime.body);
    throw new Error(`unexpected fetch ${url}`);
  });
}

function jsonBytesResponse(body) {
  return new Response(bytesFromBody(body), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    status: 200,
  });
}

function responseFromArrayBuffer(buffer) {
  return new Response(cloneArrayBuffer(buffer), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    status: 200,
  });
}

function requestUrl(request) {
  return typeof request === "string" ? request : request.url;
}

function createFakeCacheStorage(options = {}) {
  const namespaces = new Map();
  const operations = [];

  function namespace(name) {
    const key = String(name);
    if (!namespaces.has(key)) namespaces.set(key, new Map());
    return namespaces.get(key);
  }

  function cache(name) {
    return {
      async match(request) {
        const url = requestUrl(request);
        operations.push({ name, type: "match", url });
        const stored = namespace(name).get(url);
        return stored ? responseFromArrayBuffer(stored) : undefined;
      },
      async put(request, response) {
        const url = requestUrl(request);
        operations.push({ name, type: "put", url });
        if (options.putThrows) throw new Error("cache put failed");
        namespace(name).set(url, cloneArrayBuffer(await response.arrayBuffer()));
      },
      async delete(request) {
        const url = requestUrl(request);
        operations.push({ name, type: "delete", url });
        return namespace(name).delete(url);
      },
    };
  }

  return {
    operations,
    async open(name) {
      operations.push({ name, type: "open" });
      if (options.openThrows) throw new Error("cache open failed");
      return cache(String(name));
    },
    seed(name, url, body) {
      const buffer = body instanceof ArrayBuffer ? body : bytesFromBody(body);
      namespace(name).set(String(url), cloneArrayBuffer(buffer));
    },
  };
}

function verifiedIdentity(runtime, overrides = {}) {
  return {
    generatedAt: runtime.manifest.generatedAt,
    itemsCount: runtime.manifest.itemsCount,
    revision: runtime.manifest.revision,
    savedAt: "2026-08-07T12:30:00.000Z",
    schemaVersion: 1,
    sha256: runtime.manifest.sha256,
    snapshotPath: runtime.manifest.snapshotPath,
    snapshotUrl: runtime.manifest.snapshotUrl,
    ...overrides,
  };
}

function verifiedMetadata(current, previous = null) {
  return JSON.stringify({
    current,
    previous,
    schemaVersion: 1,
  });
}

async function loadV2Runtime(options = {}) {
  const browser = createFakeBrowser();
  const storage = options.storage === undefined ? createStorage() : options.storage;
  const cacheStorage = Object.hasOwn(options, "cacheStorage") ? options.cacheStorage : createFakeCacheStorage();
  const fetch = options.fetch || createFakeFetch(() => {
    throw new Error("unexpected fetch");
  });
  browser.window.TextDecoder = TextDecoder;
  browser.window.TextEncoder = TextEncoder;
  browser.window.crypto = webcrypto;
  browser.window.localStorage = storage;
  browser.window.fetch = fetch;
  browser.window.caches = cacheStorage;
  browser.window.Response = Response;
  await loadClassicScript(V2_RUNTIME_PATH, browser);
  return {
    browser,
    cacheStorage,
    fetch,
    runtime: browser.window.WEB00_CATALOG_RUNTIME,
    storage,
  };
}

function manifestFetchCount(fetch, config = cloudConfig()) {
  return fetch.calls.filter((call) => call.url.startsWith(config.catalogManifestUrl)).length;
}

function snapshotFetchCount(fetch, snapshotUrl) {
  return fetch.calls.filter((call) => call.url === snapshotUrl).length;
}

function allSnapshotFetchCount(fetch) {
  return fetch.calls.filter((call) => call.url.includes("/runtime/production/catalog/v1/releases/")).length;
}

function cacheOperationCount(cacheStorage, type, url) {
  if (!cacheStorage) return 0;
  return cacheStorage.operations.filter((operation) => (
    operation.type === type &&
    (url === undefined || operation.url === url)
  )).length;
}

function abortingHang(init) {
  return new Promise((_resolve, reject) => {
    if (init.signal?.aborted) {
      reject(init.signal.reason);
      return;
    }
    init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });
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

test("v2 catalog runtime physical entrypoint exists before it can become the cutover target", () => {
  assert.equal(existsSync(V2_RUNTIME_PATH), true);
});

test("v2 catalog API physical entrypoint exists before it can become the cutover target", () => {
  assert.equal(existsSync(V2_API_PATH), true);
});

test("v2 runtime consumes one successful startup prime once and does not retain it as a permanent manifest cache", async () => {
  const config = cloudConfig();
  const firstRuntime = cloudSnapshot([apiSite("first-current", "First Current")], 1);
  const secondRuntime = cloudSnapshot([apiSite("second-current", "Second Current")], 2);
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) {
      return jsonResponse(manifestFetchCount(fetch, config) === 1 ? firstRuntime.manifest : secondRuntime.manifest);
    }
    if (url === firstRuntime.snapshotUrl) return jsonBytesResponse(firstRuntime.body);
    if (url === secondRuntime.snapshotUrl) return jsonBytesResponse(secondRuntime.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ fetch });

  const first = runtime.primeManifest(config);
  const concurrent = runtime.primeManifest(config);

  assert.equal(first, concurrent);
  await first;

  const firstLoad = await runtime.loadCatalogFromRuntime(config);
  assert.equal(firstLoad.manifest.revision, firstRuntime.manifest.revision);
  assert.equal(manifestFetchCount(fetch, config), 1);
  assert.equal(snapshotFetchCount(fetch, firstRuntime.snapshotUrl), 1);

  const secondLoad = await runtime.loadCatalogFromRuntime(config);
  assert.equal(secondLoad.manifest.revision, secondRuntime.manifest.revision);
  assert.equal(manifestFetchCount(fetch, config), 2);
  assert.equal(snapshotFetchCount(fetch, secondRuntime.snapshotUrl), 1);
});

test("v2 catalog load joins in-flight prime and consumes it before a later freshness load", async () => {
  const config = cloudConfig();
  const firstRuntime = cloudSnapshot([apiSite("joined-current", "Joined Current")], 1);
  const secondRuntime = cloudSnapshot([apiSite("later-current", "Later Current")], 2);
  const manifestGate = deferred();
  const fetch = createFakeFetch(async (url) => {
    const count = manifestFetchCount(fetch, config);
    if (url.startsWith(config.catalogManifestUrl) && count === 1) {
      await manifestGate.promise;
      return jsonResponse(firstRuntime.manifest);
    }
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(secondRuntime.manifest);
    if (url === firstRuntime.snapshotUrl) return jsonBytesResponse(firstRuntime.body);
    if (url === secondRuntime.snapshotUrl) return jsonBytesResponse(secondRuntime.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ fetch });

  const prime = runtime.primeManifest(config);
  const joinedLoad = runtime.loadCatalogFromRuntime(config);

  manifestGate.resolve();
  await prime;

  const firstLoad = await joinedLoad;
  assert.equal(firstLoad.manifest.revision, firstRuntime.manifest.revision);
  assert.equal(manifestFetchCount(fetch, config), 1);

  const secondLoad = await runtime.loadCatalogFromRuntime(config);
  assert.equal(secondLoad.manifest.revision, secondRuntime.manifest.revision);
  assert.equal(manifestFetchCount(fetch, config), 2);
});

test("v2 aborted catalog caller joining in-flight prime leaves primed manifest consumable", async () => {
  const config = cloudConfig();
  const currentRuntime = cloudSnapshot([apiSite("prime-survives-caller-abort", "Prime Survives Caller Abort")], 17);
  const manifestGate = deferred();
  const cacheStorage = createFakeCacheStorage();
  cacheStorage.seed(VERIFIED_CACHE_NAME, currentRuntime.snapshotUrl, snapshotBytes(currentRuntime));
  const storage = createStorage({
    [VERIFIED_METADATA_KEY]: verifiedMetadata(verifiedIdentity(currentRuntime)),
  });
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) {
      await manifestGate.promise;
      return jsonResponse(currentRuntime.manifest);
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, fetch, storage });
  const caller = new AbortController();

  const prime = runtime.primeManifest(config);
  const joinedLoad = runtime.loadCatalogFromRuntime(config, { signal: caller.signal });

  assert.equal(manifestFetchCount(fetch, config), 1);
  caller.abort(Object.assign(new Error("superseded"), { code: "WEB00_API_SUPERSEDED" }));
  const joinedResult = await Promise.race([
    joinedLoad.then(
      () => ({ type: "resolved" }),
      (error) => ({ error, type: "rejected" }),
    ),
    delay(30).then(() => ({ type: "hung" })),
  ]);

  assert.equal(joinedResult.type, "rejected");
  assert.equal(joinedResult.error?.code, "WEB00_API_SUPERSEDED");

  manifestGate.resolve();
  const primedManifest = await prime;
  const finalLoad = await runtime.loadCatalogFromRuntime(config);

  assert.equal(primedManifest.revision, currentRuntime.manifest.revision);
  assert.equal(finalLoad.freshness, "ready-current");
  assert.equal(finalLoad.transport, "verified-cache");
  assert.equal(finalLoad.manifest.revision, currentRuntime.manifest.revision);
  assert.equal(manifestFetchCount(fetch, config), 1);
  assert.equal(allSnapshotFetchCount(fetch), 0);
});

test("v2 concurrent fresh catalog loads share one in-flight manifest request", async () => {
  const config = cloudConfig();
  const currentRuntime = cloudSnapshot([apiSite("direct-single-flight", "Direct Single Flight")], 13);
  const manifestGate = deferred();
  const cacheStorage = createFakeCacheStorage();
  cacheStorage.seed(VERIFIED_CACHE_NAME, currentRuntime.snapshotUrl, snapshotBytes(currentRuntime));
  const storage = createStorage({
    [VERIFIED_METADATA_KEY]: verifiedMetadata(verifiedIdentity(currentRuntime)),
  });
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) {
      await manifestGate.promise;
      return jsonResponse(currentRuntime.manifest);
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, fetch, storage });

  const firstLoad = runtime.loadCatalogFromRuntime(config);
  const secondLoad = runtime.loadCatalogFromRuntime(config);

  assert.equal(manifestFetchCount(fetch, config), 1);
  manifestGate.resolve();
  const [firstResult, secondResult] = await Promise.all([firstLoad, secondLoad]);

  assert.equal(manifestFetchCount(fetch, config), 1);
  assert.equal(firstResult.freshness, "ready-current");
  assert.equal(secondResult.freshness, "ready-current");
  assert.equal(firstResult.transport, "verified-cache");
  assert.equal(secondResult.transport, "verified-cache");
  assert.equal(firstResult.manifest.revision, currentRuntime.manifest.revision);
  assert.equal(secondResult.manifest.revision, currentRuntime.manifest.revision);
  assert.equal(allSnapshotFetchCount(fetch), 0);
});

test("v2 primeManifest reuses a direct fresh manifest request already in flight", async () => {
  const config = cloudConfig();
  const currentRuntime = cloudSnapshot([apiSite("prime-joins-direct", "Prime Joins Direct")], 14);
  const manifestGate = deferred();
  const cacheStorage = createFakeCacheStorage();
  cacheStorage.seed(VERIFIED_CACHE_NAME, currentRuntime.snapshotUrl, snapshotBytes(currentRuntime));
  const storage = createStorage({
    [VERIFIED_METADATA_KEY]: verifiedMetadata(verifiedIdentity(currentRuntime)),
  });
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) {
      await manifestGate.promise;
      return jsonResponse(currentRuntime.manifest);
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, fetch, storage });

  const catalogLoad = runtime.loadCatalogFromRuntime(config);
  const prime = runtime.primeManifest(config);

  assert.equal(manifestFetchCount(fetch, config), 1);
  manifestGate.resolve();
  const [catalogResult, primeManifestResult] = await Promise.all([catalogLoad, prime]);

  assert.equal(manifestFetchCount(fetch, config), 1);
  assert.equal(catalogResult.manifest.revision, currentRuntime.manifest.revision);
  assert.equal(primeManifestResult.revision, currentRuntime.manifest.revision);
  assert.equal(catalogResult.transport, "verified-cache");
  assert.equal(allSnapshotFetchCount(fetch), 0);
});

test("v2 real runtime superseded manifest request leaves newest API resolution ready-current", async () => {
  const config = cloudConfig();
  const currentRuntime = cloudSnapshot([apiSite("current-after-supersede", "Current After Supersede")], 15);
  const manifestGate = deferred();
  let manifestCalls = 0;
  const fetch = createFakeFetch(async (url, init) => {
    if (String(url).startsWith(config.catalogManifestUrl)) {
      manifestCalls += 1;
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        manifestGate.promise.then(() => resolve(jsonResponse(currentRuntime.manifest)), reject);
      });
    }
    if (url === currentRuntime.snapshotUrl) return jsonBytesResponse(currentRuntime.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { catalog } = await loadCatalog({
    apiPath: V2_API_PATH,
    config,
    data: freshSmokeStaticData(),
    fetch,
    runtimePath: V2_RUNTIME_PATH,
  });

  const first = catalog.resolveCatalogForPage({
    currentState: catalog.getInitialCatalog(),
    kind: "solutions",
  });
  while (manifestCalls === 0) await delay(0);
  const second = catalog.resolveCatalogForPage({
    currentState: catalog.getInitialCatalog(),
    kind: "solutions",
  });

  await delay(0);
  manifestGate.resolve();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  const evidence = JSON.stringify({
    firstResult,
    secondResult,
    fetchCalls: fetch.calls.map((call) => call.url),
  });
  assert.equal(firstResult, null, evidence);
  assert.equal(secondResult?.source, "cloud", evidence);
  assert.equal(secondResult?.freshness, "ready-current", evidence);
  assert.equal(secondResult?.lifecycle, "ready", evidence);
  assert.equal(secondResult?.staticFallbackActive, false, evidence);
  assert.equal(secondResult?.degraded, false, evidence);
  assert.deepEqual(plain(secondResult.items.map((item) => item.slug)), ["current-after-supersede"], evidence);
  assert.equal(manifestFetchCount(fetch, config), 1, evidence);
  assert.equal(snapshotFetchCount(fetch, currentRuntime.snapshotUrl), 1, evidence);
  assert.equal(fetch.calls.some((call) => call.url.includes("onrender.com") || call.url.includes("/api/sites")), false, evidence);
});

test("v2 cloud-primary catalog API exposes zero-stale state transitions", async (t) => {
  await t.test("bootstrap excludes bundled static catalog and stale LKG", async () => {
    const storage = createStorage(staleBusiLkgSnapshot());
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      config: cloudConfig(),
      data: freshSmokeStaticData(),
      runtime: createRuntimeStub(),
      storage,
    });
    const initial = catalog.getInitialCatalog();

    assert.equal(catalog.getConfig().catalogRuntimeMode, "cloud-primary");
    assert.equal(initial.items.length, 0);
    assert.deepEqual(plain(initial), {
      apiAvailable: false,
      degraded: false,
      errorCode: "",
      freshness: "bootstrap",
      items: [],
      lifecycle: "loading",
      revision: null,
      settings: { showDemoInModal: false },
      sha256: "",
      source: "bootstrap",
      staticFallbackActive: false,
      transport: "none",
    });
  });

  await t.test("current network result preserves runtime identity without LKG persistence", async () => {
    const runtimeData = cloudSnapshot(
      [apiSite("cloud-current-network", "Cloud Current Network")],
      21,
      { settings: { showDemoInModal: true } },
    );
    const storage = createStorage();
    const runtime = createRuntimeStub({
      async loadCatalogFromRuntime(config, request) {
        assert.equal(config.catalogRuntimeMode, "cloud-primary");
        assert.equal(typeof request.signal.aborted, "boolean");
        return runtimeResult(runtimeData, { transport: "network" });
      },
    });
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      config: cloudConfig(),
      data: freshSmokeStaticData(),
      fetch: createFakeFetch((url) => {
        throw new Error(`unexpected Render/API fetch ${url}`);
      }),
      runtime,
      storage,
    });

    const result = await catalog.resolveCatalogForPage({
      currentState: catalog.getInitialCatalog(),
      kind: "solutions",
    });

    assert.equal(result.source, "cloud");
    assert.equal(result.freshness, "ready-current");
    assert.equal(result.transport, "network");
    assert.equal(result.revision, 21);
    assert.equal(result.sha256, runtimeData.manifest.sha256);
    assert.deepEqual(plain(result.items.map((item) => item.slug)), ["cloud-current-network"]);
    assert.equal(result.settings.showDemoInModal, true);
    assert.equal(result.lifecycle, "ready");
    assert.equal(result.staticFallbackActive, false);
    assert.equal(result.degraded, false);
    assert.equal(storage.snapshot()[LKG_KEY], undefined);
  });

  await t.test("current verified cache result remains authoritative current", async () => {
    const runtimeData = cloudSnapshot([apiSite("cloud-current-cache", "Cloud Current Cache")], 22);
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      config: cloudConfig(),
      runtime: createRuntimeStub({
        async loadCatalogFromRuntime() {
          return runtimeResult(runtimeData, { transport: "verified-cache" });
        },
      }),
    });

    const result = await catalog.resolveCatalogForPage({
      currentState: catalog.getInitialCatalog(),
      kind: "solutions",
    });

    assert.equal(result.source, "cloud");
    assert.equal(result.freshness, "ready-current");
    assert.equal(result.transport, "verified-cache");
    assert.equal(result.revision, 22);
    assert.equal(result.staticFallbackActive, false);
    assert.equal(result.degraded, false);
  });

  await t.test("valid current empty catalog is not treated as fallback failure", async () => {
    const runtimeData = cloudSnapshot([], 23);
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      config: cloudConfig(),
      data: freshSmokeStaticData(),
      runtime: createRuntimeStub({
        async loadCatalogFromRuntime() {
          return runtimeResult(runtimeData);
        },
      }),
    });

    const result = await catalog.resolveCatalogForPage({
      currentState: catalog.getInitialCatalog(),
      kind: "solutions",
    });

    assert.equal(result.source, "cloud");
    assert.equal(result.freshness, "ready-current");
    assert.equal(result.lifecycle, "empty");
    assert.deepEqual(plain(result.items), []);
    assert.equal(result.staticFallbackActive, false);
    assert.equal(result.degraded, false);
  });

  await t.test("current failure uses verified fallback before static data", async () => {
    const verifiedRuntime = cloudSnapshot(
      [apiSite("verified-before-static", "Verified Before Static")],
      24,
      { settings: { showDemoInModal: true } },
    );
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      config: cloudConfig(),
      data: freshSmokeStaticData(),
      runtime: createRuntimeStub({
        async loadCatalogFromRuntime() {
          throw errorWithCode("WEB00_CLOUD_HTTP_503");
        },
        async loadVerifiedFallback() {
          return runtimeResult(verifiedRuntime, {
            freshness: "degraded-verified",
            transport: "verified-cache",
          });
        },
      }),
    });

    const result = await catalog.resolveCatalogForPage({
      currentState: catalog.getInitialCatalog(),
      kind: "solutions",
    });

    assert.equal(result.source, "cloud");
    assert.equal(result.freshness, "degraded-verified");
    assert.equal(result.transport, "verified-cache");
    assert.equal(result.revision, 24);
    assert.deepEqual(plain(result.items.map((item) => item.slug)), ["verified-before-static"]);
    assert.equal(result.settings.showDemoInModal, true);
    assert.equal(result.errorCode, "WEB00_CLOUD_HTTP_503");
    assert.equal(result.staticFallbackActive, true);
    assert.equal(result.degraded, true);
  });

  await t.test("current and verified failure degrade only to static data when enabled", async () => {
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      config: cloudConfig(),
      data: freshSmokeStaticData(),
      runtime: createRuntimeStub({
        async loadCatalogFromRuntime() {
          throw errorWithCode("WEB00_CLOUD_TIMEOUT");
        },
        async loadVerifiedFallback() {
          return null;
        },
      }),
    });

    const result = await catalog.resolveCatalogForPage({
      currentState: catalog.getInitialCatalog(),
      kind: "solutions",
    });

    assert.equal(result.source, "static");
    assert.equal(result.freshness, "degraded-static");
    assert.equal(result.transport, "static");
    assert.equal(result.revision, null);
    assert.equal(result.sha256, "");
    assert.deepEqual(plain(result.items.map((item) => item.slug)), ["web00-smoke-create"]);
    assert.equal(result.settings.showDemoInModal, false);
    assert.equal(result.errorCode, "WEB00_CLOUD_TIMEOUT");
    assert.equal(result.staticFallbackActive, true);
    assert.equal(result.degraded, true);
  });

  await t.test("cloud-primary never uses stale LKG when current, verified, and static are unavailable", async () => {
    const storage = createStorage(staleBusiLkgSnapshot());
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      config: cloudConfig(),
      data: { SOLUTIONS: [] },
      runtime: createRuntimeStub({
        async loadCatalogFromRuntime() {
          throw errorWithCode("WEB00_CLOUD_ERROR");
        },
        async loadVerifiedFallback() {
          return null;
        },
      }),
      storage,
    });

    const result = await catalog.resolveCatalogForPage({
      currentState: catalog.getInitialCatalog(),
      kind: "solutions",
    });

    assert.equal(result.source, "cloud");
    assert.equal(result.lifecycle, "fatal");
    assert.equal(result.items.some((item) => item.title === "Дом для Буси"), false);
    assert.notEqual(result.source, "lkg");
  });

  await t.test("cloud-primary static fallback disabled returns fatal instead of static", async () => {
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      config: cloudConfig({ staticFallbackEnabled: false }),
      data: freshSmokeStaticData(),
      runtime: createRuntimeStub({
        async loadCatalogFromRuntime() {
          throw errorWithCode("WEB00_CLOUD_ERROR");
        },
        async loadVerifiedFallback() {
          return null;
        },
      }),
    });

    const result = await catalog.resolveCatalogForPage({
      currentState: catalog.getInitialCatalog(),
      kind: "solutions",
    });

    assert.equal(result.source, "cloud");
    assert.equal(result.lifecycle, "fatal");
    assert.deepEqual(plain(result.items), []);
    assert.equal(result.staticFallbackActive, false);
    assert.equal(result.degraded, true);
  });

  await t.test("invalid current Cloud items never become ready-current", async () => {
    const invalidRuntime = cloudSnapshot([{ slug: "bad slug", title: "Bad Cloud" }], 25);
    const verifiedRuntime = cloudSnapshot([apiSite("verified-after-invalid", "Verified After Invalid")], 26);
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      config: cloudConfig(),
      runtime: createRuntimeStub({
        async loadCatalogFromRuntime() {
          return runtimeResult(invalidRuntime);
        },
        async loadVerifiedFallback() {
          return runtimeResult(verifiedRuntime, {
            freshness: "degraded-verified",
            transport: "verified-cache",
          });
        },
      }),
    });

    const result = await catalog.resolveCatalogForPage({
      currentState: catalog.getInitialCatalog(),
      kind: "solutions",
    });

    assert.equal(result.source, "cloud");
    assert.equal(result.freshness, "degraded-verified");
    assert.equal(result.errorCode, "WEB00_CLOUD_NO_VALID_ITEMS");
    assert.deepEqual(plain(result.items.map((item) => item.slug)), ["verified-after-invalid"]);
  });

  await t.test("demo settings come only from current or verified Cloud snapshots", async () => {
    async function resolveWithRuntime(runtime) {
      const loaded = await loadCatalog({
        apiPath: V2_API_PATH,
        config: cloudConfig(),
        data: freshSmokeStaticData(),
        runtime,
      });
      return loaded.catalog.resolveCatalogForPage({
        currentState: loaded.catalog.getInitialCatalog(),
        kind: "solutions",
      });
    }

    const currentTrue = await resolveWithRuntime(createRuntimeStub({
      async loadCatalogFromRuntime() {
        return runtimeResult(cloudSnapshot(
          [apiSite("current-demo-true", "Current Demo True")],
          27,
          { settings: { showDemoInModal: true } },
        ));
      },
    }));
    const currentFalse = await resolveWithRuntime(createRuntimeStub({
      async loadCatalogFromRuntime() {
        return runtimeResult(cloudSnapshot(
          [apiSite("current-demo-false", "Current Demo False")],
          28,
          { settings: { showDemoInModal: false } },
        ));
      },
    }));
    const currentMissing = await resolveWithRuntime(createRuntimeStub({
      async loadCatalogFromRuntime() {
        const runtimeData = cloudSnapshot([apiSite("current-demo-missing", "Current Demo Missing")], 29);
        const snapshot = snapshotObject(runtimeData);
        delete snapshot.settings;
        return { ...runtimeResult(runtimeData), snapshot };
      },
    }));
    const verifiedTrue = await resolveWithRuntime(createRuntimeStub({
      async loadCatalogFromRuntime() {
        throw errorWithCode("WEB00_CLOUD_ERROR");
      },
      async loadVerifiedFallback() {
        return runtimeResult(cloudSnapshot(
          [apiSite("verified-demo-true", "Verified Demo True")],
          30,
          { settings: { showDemoInModal: true } },
        ), {
          freshness: "degraded-verified",
          transport: "verified-cache",
        });
      },
    }));
    const staticFallback = await resolveWithRuntime(createRuntimeStub({
      async loadCatalogFromRuntime() {
        throw errorWithCode("WEB00_CLOUD_ERROR");
      },
      async loadVerifiedFallback() {
        return null;
      },
    }));

    assert.equal(currentTrue.settings.showDemoInModal, true);
    assert.equal(currentFalse.settings.showDemoInModal, false);
    assert.equal(currentMissing.settings.showDemoInModal, false);
    assert.equal(verifiedTrue.settings.showDemoInModal, true);
    assert.equal(staticFallback.settings.showDemoInModal, false);
  });

  await t.test("cloud-primary popular route uses runtime only and defaults to three items", async () => {
    const fetch = createFakeFetch((url) => {
      throw new Error(`unexpected Render/API fetch ${url}`);
    });
    const runtimeData = cloudSnapshot([
      apiSite("popular-one", "Popular One"),
      apiSite("popular-two", "Popular Two"),
      apiSite("popular-three", "Popular Three"),
      apiSite("popular-four", "Popular Four"),
    ], 31);
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      config: cloudConfig(),
      fetch,
      runtime: createRuntimeStub({
        async loadCatalogFromRuntime() {
          return runtimeResult(runtimeData);
        },
      }),
    });

    const result = await catalog.resolveCatalogForPage({
      currentState: catalog.getInitialCatalog(),
      kind: "popular",
    });

    assert.deepEqual(plain(result.items.map((item) => item.slug)), ["popular-one", "popular-two", "popular-three"]);
    assert.equal(result.source, "cloud");
    assert.equal(fetch.calls.length, 0);
  });

  await t.test("non-cloud v2 behavior still supports the legacy API flow", async () => {
    const storage = createStorage();
    const fetch = createFakeFetch((url) => {
      if (url.startsWith("https://api.example.test/api/sites?")) {
        return apiResponse([apiSite("api-compatible", "API Compatible")]);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const { catalog } = await loadCatalog({
      apiPath: V2_API_PATH,
      fetch,
      storage,
    });

    const initial = catalog.getInitialCatalog();
    const result = await catalog.resolveCatalogForPage({
      currentState: initial,
      kind: "solutions",
    });

    assert.equal(initial.source, "static");
    assert.equal(result.source, "api");
    assert.deepEqual(plain(result.items.map((item) => item.slug)), ["api-compatible"]);
    assert.equal(Boolean(storage.snapshot()[LKG_KEY]), true);
  });
});

test("v2 explicit newer prime supersedes an older unconsumed successful prime result", async () => {
  const config = cloudConfig();
  const oldRuntime = cloudSnapshot([apiSite("old-primed", "Old Primed")], 1);
  const newRuntime = cloudSnapshot([apiSite("new-primed", "New Primed")], 2);
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) {
      return jsonResponse(manifestFetchCount(fetch, config) === 1 ? oldRuntime.manifest : newRuntime.manifest);
    }
    if (url === oldRuntime.snapshotUrl) return jsonBytesResponse(oldRuntime.body);
    if (url === newRuntime.snapshotUrl) return jsonBytesResponse(newRuntime.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ fetch });

  await runtime.primeManifest(config);
  await runtime.primeManifest(config);

  const result = await runtime.loadCatalogFromRuntime(config);

  assert.equal(manifestFetchCount(fetch, config), 2);
  assert.equal(result.manifest.revision, newRuntime.manifest.revision);
  assert.equal(snapshotFetchCount(fetch, newRuntime.snapshotUrl), 1);
});

test("v2 runtime failed manifest prime does not poison retry", async () => {
  const config = cloudConfig();
  const recoveredRuntime = cloudSnapshot([apiSite("recovered-current", "Recovered Current")], 2);
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl) && manifestFetchCount(fetch, config) === 1) {
      throw new Error("offline");
    }
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(recoveredRuntime.manifest);
    if (url === recoveredRuntime.snapshotUrl) return jsonBytesResponse(recoveredRuntime.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ fetch });

  await assert.rejects(() => runtime.primeManifest(config), /offline/);
  const result = await runtime.loadCatalogFromRuntime(config);

  assert.equal(result.freshness, "ready-current");
  assert.equal(manifestFetchCount(fetch, config), 2);
  assert.equal(allSnapshotFetchCount(fetch), 1);
});

test("v2 hanging prime times out, clears request, and later recovers with fresh manifest", async () => {
  const recoveredRuntime = cloudSnapshot([apiSite("timeout-recovered", "Timeout Recovered")], 3);
  const config = cloudConfig({ requestTimeoutMs: 5 });
  const fetch = createFakeFetch(async (url, init) => {
    if (url.startsWith(config.catalogManifestUrl) && manifestFetchCount(fetch, config) === 1) {
      return abortingHang(init);
    }
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(recoveredRuntime.manifest);
    if (url === recoveredRuntime.snapshotUrl) return jsonBytesResponse(recoveredRuntime.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ fetch });

  await assert.rejects(
    () => runtime.primeManifest(config),
    (error) => error?.code === "WEB00_CLOUD_MANIFEST_TIMEOUT",
  );
  const recovered = await runtime.loadCatalogFromRuntime(config);

  assert.equal(recovered.freshness, "ready-current");
  assert.equal(recovered.manifest.revision, recoveredRuntime.manifest.revision);
  assert.equal(manifestFetchCount(fetch, config), 2);
});

test("v2 fresh manifest load is bounded by requestTimeoutMs", async () => {
  const recoveredRuntime = cloudSnapshot([apiSite("fresh-timeout-recovered", "Fresh Timeout Recovered")], 4);
  const config = cloudConfig({ requestTimeoutMs: 5 });
  const fetch = createFakeFetch(async (url, init) => {
    if (url.startsWith(config.catalogManifestUrl) && manifestFetchCount(fetch, config) === 1) {
      return abortingHang(init);
    }
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(recoveredRuntime.manifest);
    if (url === recoveredRuntime.snapshotUrl) return jsonBytesResponse(recoveredRuntime.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ fetch });

  const firstAttempt = await Promise.race([
    runtime.loadCatalogFromRuntime(config).then(
      () => ({ type: "resolved" }),
      (error) => ({ error, type: "rejected" }),
    ),
    delay(30).then(() => ({ type: "hung" })),
  ]);
  assert.notEqual(firstAttempt.type, "hung");
  assert.equal(firstAttempt.error?.code, "WEB00_CLOUD_MANIFEST_TIMEOUT");
  const recovered = await runtime.loadCatalogFromRuntime(config);

  assert.equal(recovered.freshness, "ready-current");
  assert.equal(recovered.manifest.revision, recoveredRuntime.manifest.revision);
  assert.equal(manifestFetchCount(fetch, config), 2);
});

test("externally aborted v2 manifest prime clears shared request and permits fresh retry", async () => {
  const recoveredRuntime = cloudSnapshot([apiSite("abort-recovered", "Abort Recovered")], 5);
  const config = cloudConfig();
  const caller = new AbortController();
  const fetch = createFakeFetch(async (url, init) => {
    if (url.startsWith(config.catalogManifestUrl) && manifestFetchCount(fetch, config) === 1) {
      return abortingHang(init);
    }
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(recoveredRuntime.manifest);
    if (url === recoveredRuntime.snapshotUrl) return jsonBytesResponse(recoveredRuntime.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ fetch });

  const prime = runtime.primeManifest(config, { signal: caller.signal });
  caller.abort(new Error("caller aborted"));

  await assert.rejects(() => prime, /caller aborted/);
  const recovered = await runtime.loadCatalogFromRuntime(config);

  assert.equal(recovered.freshness, "ready-current");
  assert.equal(recovered.manifest.revision, recoveredRuntime.manifest.revision);
  assert.equal(manifestFetchCount(fetch, config), 2);
});

test("v2 shared fresh manifest transport survives superseded first catalog caller abort", async () => {
  const config = cloudConfig();
  const currentRuntime = cloudSnapshot([apiSite("abort-owner-current", "Abort Owner Current")], 15);
  const manifestGate = deferred();
  const cacheStorage = createFakeCacheStorage();
  cacheStorage.seed(VERIFIED_CACHE_NAME, currentRuntime.snapshotUrl, snapshotBytes(currentRuntime));
  const storage = createStorage({
    [VERIFIED_METADATA_KEY]: verifiedMetadata(verifiedIdentity(currentRuntime)),
  });
  const fetch = createFakeFetch(async (url, init) => {
    if (url.startsWith(config.catalogManifestUrl)) {
      return new Promise((resolve, reject) => {
        if (init.signal?.aborted) {
          reject(init.signal.reason);
          return;
        }
        init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        manifestGate.promise.then(() => resolve(jsonResponse(currentRuntime.manifest)), reject);
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, fetch, storage });
  const firstCaller = new AbortController();
  const secondCaller = new AbortController();

  const firstLoad = runtime.loadCatalogFromRuntime(config, { signal: firstCaller.signal });

  assert.equal(manifestFetchCount(fetch, config), 1);
  firstCaller.abort(Object.assign(new Error("superseded"), { code: "WEB00_API_SUPERSEDED" }));
  const firstResult = await Promise.race([
    firstLoad.then(
      () => ({ type: "resolved" }),
      (error) => ({ error, type: "rejected" }),
    ),
    delay(30).then(() => ({ type: "hung" })),
  ]);

  assert.equal(firstResult.type, "rejected");
  assert.equal(firstResult.error?.code, "WEB00_API_SUPERSEDED");

  const secondLoad = runtime.loadCatalogFromRuntime(config, { signal: secondCaller.signal });
  const joinedManifestFetchCount = manifestFetchCount(fetch, config);
  manifestGate.resolve();
  const secondResult = await secondLoad;

  assert.equal(joinedManifestFetchCount, 1);
  assert.equal(secondResult.freshness, "ready-current");
  assert.equal(secondResult.transport, "verified-cache");
  assert.equal(secondResult.manifest.revision, currentRuntime.manifest.revision);
  assert.equal(manifestFetchCount(fetch, config), 1);
  assert.equal(allSnapshotFetchCount(fetch), 0);
});

test("v2 superseded catalog caller stops waiting without cancelling shared manifest transport", async () => {
  const config = cloudConfig();
  const currentRuntime = cloudSnapshot([apiSite("caller-local-current", "Caller Local Current")], 16);
  const manifestGate = deferred();
  const cacheStorage = createFakeCacheStorage();
  cacheStorage.seed(VERIFIED_CACHE_NAME, currentRuntime.snapshotUrl, snapshotBytes(currentRuntime));
  const storage = createStorage({
    [VERIFIED_METADATA_KEY]: verifiedMetadata(verifiedIdentity(currentRuntime)),
  });
  let manifestSettled = false;
  const fetch = createFakeFetch(async (url, init) => {
    if (url.startsWith(config.catalogManifestUrl)) {
      return new Promise((resolve, reject) => {
        if (init.signal?.aborted) {
          reject(init.signal.reason);
          return;
        }
        init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        manifestGate.promise.then(() => {
          manifestSettled = true;
          resolve(jsonResponse(currentRuntime.manifest));
        }, reject);
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, fetch, storage });
  const firstCaller = new AbortController();
  const secondCaller = new AbortController();

  const firstLoad = runtime.loadCatalogFromRuntime(config, { signal: firstCaller.signal });

  assert.equal(manifestFetchCount(fetch, config), 1);
  firstCaller.abort(Object.assign(new Error("superseded"), { code: "WEB00_API_SUPERSEDED" }));
  const firstResult = await Promise.race([
    firstLoad.then(
      () => ({ type: "resolved" }),
      (error) => ({ error, type: "rejected" }),
    ),
    delay(30).then(() => ({ type: "hung" })),
  ]);

  assert.equal(firstResult.type, "rejected");
  assert.equal(firstResult.error?.code, "WEB00_API_SUPERSEDED");
  assert.equal(manifestSettled, false);
  assert.equal(manifestFetchCount(fetch, config), 1);

  const secondLoad = runtime.loadCatalogFromRuntime(config, { signal: secondCaller.signal });
  const joinedManifestFetchCount = manifestFetchCount(fetch, config);
  manifestGate.resolve();
  const secondResult = await secondLoad;

  assert.equal(joinedManifestFetchCount, 1);
  assert.equal(manifestSettled, true);
  assert.equal(secondResult.freshness, "ready-current");
  assert.equal(secondResult.transport, "verified-cache");
  assert.equal(secondResult.manifest.revision, currentRuntime.manifest.revision);
  assert.equal(allSnapshotFetchCount(fetch), 0);
});

test("v2 warm same revision uses verified cache only after current manifest validates", async () => {
  const config = cloudConfig();
  const runtimeData = cloudSnapshot(
    [apiSite("warm-cache-current", "Warm Cache Current")],
    7,
    { settings: { showDemoInModal: true } },
  );
  const cacheStorage = createFakeCacheStorage();
  cacheStorage.seed(VERIFIED_CACHE_NAME, runtimeData.snapshotUrl, snapshotBytes(runtimeData));
  const storage = createStorage({
    [VERIFIED_METADATA_KEY]: verifiedMetadata(verifiedIdentity(runtimeData)),
  });
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(runtimeData.manifest);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, fetch, storage });

  const result = await runtime.loadCatalogFromRuntime(config);

  assert.equal(manifestFetchCount(fetch, config), 1);
  assert.equal(allSnapshotFetchCount(fetch), 0);
  assert.equal(result.freshness, "ready-current");
  assert.equal(result.transport, "verified-cache");
  assert.equal(result.cacheStatus, "hit");
  assert.equal(result.snapshot.settings.showDemoInModal, true);
});

test("v2 rejects corrupt current verified cache and fetches network snapshot", async () => {
  const config = cloudConfig();
  const runtimeData = cloudSnapshot([apiSite("corrupt-cache-current", "Corrupt Cache Current")], 8);
  const cacheStorage = createFakeCacheStorage();
  cacheStorage.seed(VERIFIED_CACHE_NAME, runtimeData.snapshotUrl, bytesFromBody({ bad: true }));
  const storage = createStorage({
    [VERIFIED_METADATA_KEY]: verifiedMetadata(verifiedIdentity(runtimeData)),
  });
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(runtimeData.manifest);
    if (url === runtimeData.snapshotUrl) return jsonBytesResponse(runtimeData.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, fetch, storage });

  const result = await runtime.loadCatalogFromRuntime(config);

  assert.equal(result.freshness, "ready-current");
  assert.equal(result.transport, "network");
  assert.equal(result.cacheStatus, "miss");
  assert.equal(snapshotFetchCount(fetch, runtimeData.snapshotUrl), 1);
  assert.equal(cacheOperationCount(cacheStorage, "delete", runtimeData.snapshotUrl), 1);
});

test("v2 missing current cache bytes are never trusted from metadata alone", async () => {
  const config = cloudConfig();
  const runtimeData = cloudSnapshot([apiSite("missing-cache-current", "Missing Cache Current")], 9);
  const cacheStorage = createFakeCacheStorage();
  const storage = createStorage({
    [VERIFIED_METADATA_KEY]: verifiedMetadata(verifiedIdentity(runtimeData)),
  });
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(runtimeData.manifest);
    if (url === runtimeData.snapshotUrl) return jsonBytesResponse(runtimeData.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, fetch, storage });

  const result = await runtime.loadCatalogFromRuntime(config);

  assert.equal(result.freshness, "ready-current");
  assert.equal(result.transport, "network");
  assert.equal(result.cacheStatus, "miss");
  assert.equal(snapshotFetchCount(fetch, runtimeData.snapshotUrl), 1);
});

test("v2 cache storage unavailable does not block valid current Cloud render", async () => {
  const config = cloudConfig();
  const runtimeData = cloudSnapshot([apiSite("cache-unavailable-current", "Cache Unavailable Current")], 10);
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(runtimeData.manifest);
    if (url === runtimeData.snapshotUrl) return jsonBytesResponse(runtimeData.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage: undefined, fetch });

  const result = await runtime.loadCatalogFromRuntime(config);
  const fallback = await runtime.loadVerifiedFallback();

  assert.equal(result.freshness, "ready-current");
  assert.equal(result.transport, "network");
  assert.equal(result.cacheStatus, "write-failed");
  assert.equal(fallback, null);
});

test("v2 cache put failure does not block valid current Cloud render or advance metadata", async () => {
  const config = cloudConfig();
  const runtimeData = cloudSnapshot([apiSite("quota-current", "Quota Current")], 11);
  const cacheStorage = createFakeCacheStorage({ putThrows: true });
  const storage = createStorage();
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(runtimeData.manifest);
    if (url === runtimeData.snapshotUrl) return jsonBytesResponse(runtimeData.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, fetch, storage });

  const result = await runtime.loadCatalogFromRuntime(config);

  assert.equal(result.freshness, "ready-current");
  assert.equal(result.transport, "network");
  assert.equal(result.cacheStatus, "write-failed");
  assert.equal(storage.snapshot()[VERIFIED_METADATA_KEY], undefined);
});

test("v2 metadata torn write keeps the old verified pointer authoritative", async () => {
  const config = cloudConfig();
  const oldRuntime = cloudSnapshot([apiSite("old-verified", "Old Verified")], 1);
  const currentRuntime = cloudSnapshot([apiSite("current-network", "Current Network")], 12);
  const cacheStorage = createFakeCacheStorage();
  cacheStorage.seed(VERIFIED_CACHE_NAME, oldRuntime.snapshotUrl, snapshotBytes(oldRuntime));
  const storage = createStorage({
    [VERIFIED_METADATA_KEY]: verifiedMetadata(verifiedIdentity(oldRuntime)),
  }, { setThrows: true });
  const fetch = createFakeFetch(async (url) => {
    if (url.startsWith(config.catalogManifestUrl)) return jsonResponse(currentRuntime.manifest);
    if (url === currentRuntime.snapshotUrl) return jsonBytesResponse(currentRuntime.body);
    throw new Error(`unexpected fetch ${url}`);
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, fetch, storage });

  const result = await runtime.loadCatalogFromRuntime(config);
  const fallback = await runtime.loadVerifiedFallback();

  assert.equal(result.freshness, "ready-current");
  assert.equal(result.transport, "network");
  assert.equal(result.cacheStatus, "write-failed");
  assert.equal(fallback.freshness, "degraded-verified");
  assert.equal(fallback.manifest.revision, oldRuntime.manifest.revision);
});

test("v2 verified fallback tries current then previous with full validation", async () => {
  const currentRuntime = cloudSnapshot([apiSite("bad-current", "Bad Current")], 2);
  const previousRuntime = cloudSnapshot([apiSite("good-previous", "Good Previous")], 1);
  const cacheStorage = createFakeCacheStorage();
  cacheStorage.seed(VERIFIED_CACHE_NAME, currentRuntime.snapshotUrl, bytesFromBody({ bad: true }));
  cacheStorage.seed(VERIFIED_CACHE_NAME, previousRuntime.snapshotUrl, snapshotBytes(previousRuntime));
  const storage = createStorage({
    [VERIFIED_METADATA_KEY]: verifiedMetadata(verifiedIdentity(currentRuntime), verifiedIdentity(previousRuntime)),
  });
  const { runtime } = await loadV2Runtime({ cacheStorage, storage });

  const fallback = await runtime.loadVerifiedFallback();

  assert.equal(fallback.freshness, "degraded-verified");
  assert.equal(fallback.transport, "verified-cache");
  assert.equal(fallback.cacheStatus, "fallback");
  assert.equal(fallback.manifest.revision, previousRuntime.manifest.revision);
  assert.equal(cacheOperationCount(cacheStorage, "delete", currentRuntime.snapshotUrl), 1);
});

test("v2 malformed verified metadata is ignored or skips only invalid identities", async (t) => {
  await t.test("missing metadata returns null", async () => {
    const { runtime } = await loadV2Runtime();
    assert.equal(await runtime.loadVerifiedFallback(), null);
  });

  await t.test("invalid JSON returns null", async () => {
    const storage = createStorage({ [VERIFIED_METADATA_KEY]: "{bad json" });
    const { runtime } = await loadV2Runtime({ storage });
    assert.equal(await runtime.loadVerifiedFallback(), null);
  });

  await t.test("wrong envelope schema returns null", async () => {
    const storage = createStorage({ [VERIFIED_METADATA_KEY]: JSON.stringify({ schemaVersion: 2 }) });
    const { runtime } = await loadV2Runtime({ storage });
    assert.equal(await runtime.loadVerifiedFallback(), null);
  });

  await t.test("invalid current identity still permits valid previous", async () => {
    const previousRuntime = cloudSnapshot([apiSite("metadata-previous", "Metadata Previous")], 1);
    const cacheStorage = createFakeCacheStorage();
    cacheStorage.seed(VERIFIED_CACHE_NAME, previousRuntime.snapshotUrl, snapshotBytes(previousRuntime));
    const storage = createStorage({
      [VERIFIED_METADATA_KEY]: verifiedMetadata({ schemaVersion: 1 }, verifiedIdentity(previousRuntime)),
    });
    const { runtime } = await loadV2Runtime({ cacheStorage, storage });
    const fallback = await runtime.loadVerifiedFallback();

    assert.equal(fallback.freshness, "degraded-verified");
    assert.equal(fallback.manifest.revision, previousRuntime.manifest.revision);
  });
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

test("Cloud runtime settings propagate to resolved catalog while non-Cloud sources default demo modal off", async () => {
  const enabledRuntime = cloudSnapshot(
    [apiSite("cloud-demo-enabled", "Cloud Demo Enabled")],
    7,
    { settings: { showDemoInModal: true } },
  );
  const disabledRuntime = cloudSnapshot(
    [apiSite("cloud-demo-disabled", "Cloud Demo Disabled")],
    8,
    { settings: { showDemoInModal: false } },
  );
  const enabledFetch = createFakeFetch(async (url) => {
    if (String(url).startsWith(cloudConfig().catalogManifestUrl)) return jsonResponse(enabledRuntime.manifest);
    if (String(url) === enabledRuntime.snapshotUrl) {
      return new Response(new TextEncoder().encode(enabledRuntime.body), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        status: 200,
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const disabledFetch = createFakeFetch(async (url) => {
    if (String(url).startsWith(cloudConfig().catalogManifestUrl)) return jsonResponse(disabledRuntime.manifest);
    if (String(url) === disabledRuntime.snapshotUrl) {
      return new Response(new TextEncoder().encode(disabledRuntime.body), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        status: 200,
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const apiFetch = createFakeFetch((url) => {
    if (String(url).endsWith("/api/sites?sort=sortOrder&page=1&limit=20")) {
      return apiResponse([apiSite("api-demo-default", "API Demo Default")]);
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const lkgStorage = createStorage({
    [LKG_KEY]: JSON.stringify({
      schemaVersion: 1,
      savedAt: "2026-08-03T00:00:00.000Z",
      items: [{ slug: "lkg-demo-default", title: "LKG Demo Default", category: "Goods", categorySlug: "goods" }],
    }),
  });

  const enabled = await loadCatalog({ config: cloudConfig(), data: freshSmokeStaticData(), fetch: enabledFetch });
  const enabledResult = await enabled.catalog.resolveCatalogForPage({
    currentState: enabled.catalog.getInitialCatalog(),
    kind: "solutions",
  });
  const disabled = await loadCatalog({ config: cloudConfig(), data: freshSmokeStaticData(), fetch: disabledFetch });
  const disabledResult = await disabled.catalog.resolveCatalogForPage({
    currentState: disabled.catalog.getInitialCatalog(),
    kind: "solutions",
  });
  const api = await loadCatalog({ fetch: apiFetch });
  const apiResult = await api.catalog.resolveCatalogForPage({
    currentState: api.catalog.getInitialCatalog(),
    kind: "solutions",
  });
  const lkg = await loadCatalog({ data: { SOLUTIONS: [] }, fetch: createFakeFetch(() => Promise.reject(new Error("offline"))), storage: lkgStorage });
  const degraded = await loadCatalog({
    config: cloudConfig({ requestTimeoutMs: 1 }),
    data: freshSmokeStaticData(),
    fetch: createFakeFetch((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    })),
  });
  const degradedResult = await degraded.catalog.resolveCatalogForPage({
    currentState: degraded.catalog.getInitialCatalog(),
    kind: "solutions",
  });

  assert.equal(enabledResult.settings.showDemoInModal, true);
  assert.equal(disabledResult.settings.showDemoInModal, false);
  assert.equal(apiResult.settings.showDemoInModal, false);
  assert.equal(lkg.catalog.getInitialCatalog().settings.showDemoInModal, false);
  assert.equal(degradedResult.settings.showDemoInModal, false);
});

test("external demos render inside the WEB00 modal only when Cloud settings explicitly allow it", async () => {
  const card = {
    active: true,
    category: "Goods",
    categorySlug: "goods",
    demoMode: "external-iframe",
    demoUrl: "https://prudexxx.github.io/NarkoKlinika/",
    externalDemoUrl: "https://prudexxx.github.io/NarkoKlinika/",
    features: ["Fast"],
    id: "web00-atomic-create-pass",
    key: "web00-atomic-create-pass",
    priceLabel: "",
    shortDescription: "Atomic demo",
    slug: "web00-atomic-create-pass",
    title: "WEB00 Atomic Create Pass",
  };
  const allowedHtml = await renderDemoModalForCatalogState({
    items: [card],
    lifecycle: "ready",
    settings: { showDemoInModal: true },
    source: "cloud",
  });
  const disabledHtml = await renderDemoModalForCatalogState({
    items: [card],
    lifecycle: "ready",
    settings: { showDemoInModal: false },
    source: "cloud",
  });
  const unavailableHtml = await renderDemoModalForCatalogState({
    items: [card],
    lifecycle: "ready",
    source: "cloud",
  });
  const untrustedHtml = await renderDemoModalForCatalogState({
    items: [{
      ...card,
      demoUrl: "https://evil.example/NarkoKlinika/",
      externalDemoUrl: "https://evil.example/NarkoKlinika/",
    }],
    lifecycle: "ready",
    settings: { showDemoInModal: true },
    source: "cloud",
  });

  assert.match(allowedHtml, /data-demo-iframe/);
  assert.match(allowedHtml, /src="https:\/\/prudexxx\.github\.io\/NarkoKlinika\/"/);
  assert.doesNotMatch(allowedHtml, /data-demo-external-fallback/);
  assert.match(allowedHtml, /Открыть отдельно/);
  assert.doesNotMatch(disabledHtml, /data-demo-iframe/);
  assert.match(disabledHtml, /data-demo-external-fallback/);
  assert.match(disabledHtml, /Полный просмотр открывается отдельно/);
  assert.doesNotMatch(unavailableHtml, /data-demo-iframe/);
  assert.match(unavailableHtml, /data-demo-external-fallback/);
  assert.doesNotMatch(untrustedHtml, /data-demo-iframe/);
  assert.match(untrustedHtml, /data-demo-external-fallback/);
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
