import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch, jsonResponse } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const CLOUD_MANIFEST_URL = "https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function classList() {
  return { add: () => undefined, remove: () => undefined, toggle: () => undefined };
}

function skeletonHtml(count = 6) {
  return Array.from({ length: count }, (_value, index) => `
    <article
      class="solution-card solution-card--skeleton catalog-skeleton"
      aria-hidden="true"
      data-catalog-skeleton
      data-skeleton-index="${index}"
    >
      <div class="solution-preview solution-preview--skeleton"></div>
      <div class="solution-card__body">
        <div class="catalog-skeleton__line catalog-skeleton__line--tags"></div>
        <div class="catalog-skeleton__line catalog-skeleton__line--title"></div>
        <div class="catalog-skeleton__line catalog-skeleton__line--text"></div>
        <div class="catalog-skeleton__line catalog-skeleton__line--meta"></div>
        <div class="catalog-skeleton__actions"></div>
      </div>
    </article>
  `).join("");
}

function countMatches(value, pattern) {
  return (String(value || "").match(pattern) || []).length;
}

function cloudConfig() {
  return {
    apiBaseUrl: "https://web00-backend-production.onrender.com",
    catalogManifestUrl: CLOUD_MANIFEST_URL,
    catalogRuntimeMode: "cloud-primary",
    requestTimeoutMs: 1000,
    staticFallbackEnabled: true,
  };
}

function catalogItem(slug, title = slug) {
  return {
    id: slug,
    key: slug,
    slug,
    title,
    active: true,
    category: "Goods",
    categorySlug: "goods",
    features: ["catalog"],
    shortDescription: `${title} description`,
    priceLabel: "Готовое решение",
    deliveryLabel: "от 2 дней",
  };
}

function catalogState(overrides = {}) {
  const items = Array.isArray(overrides.items) ? overrides.items : [];
  const freshness = overrides.freshness || "ready-current";
  const source = overrides.source || (freshness === "degraded-static" ? "static" : "cloud");
  const lifecycle = overrides.lifecycle || (items.length ? "ready" : "empty");
  return {
    apiAvailable: freshness === "ready-current",
    degraded: freshness.startsWith("degraded-"),
    errorCode: "",
    freshness,
    items,
    lifecycle,
    revision: source === "cloud" ? (overrides.revision ?? 1) : null,
    settings: { showDemoInModal: false },
    sha256: source === "cloud" ? (overrides.sha256 || "a".repeat(64)) : "",
    source,
    staticFallbackActive: freshness.startsWith("degraded-"),
    transport: source === "cloud" ? "network" : "static",
    ...overrides,
  };
}

function bootstrapState() {
  return catalogState({
    apiAvailable: false,
    degraded: false,
    freshness: "bootstrap",
    items: [],
    lifecycle: "loading",
    revision: null,
    sha256: "",
    source: "bootstrap",
    staticFallbackActive: false,
    transport: "none",
  });
}

function runtimeJsonResponse(body) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null;
      },
    },
    async json() {
      return JSON.parse(new TextDecoder().decode(bytes));
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function runtimeFixture(overrides = {}) {
  const revision = overrides.revision || 42;
  const generatedAt = overrides.generatedAt || "2026-08-08T00:00:00.000Z";
  const items = Array.isArray(overrides.items) ? overrides.items : [catalogItem("cloud-runtime", "Cloud Runtime")];
  const snapshot = {
    generatedAt,
    items,
    itemsCount: items.length,
    schemaVersion: 1,
    revision,
    settings: { showDemoInModal: false },
  };
  const snapshotText = JSON.stringify(snapshot);
  const sha256 = createHash("sha256").update(snapshotText).digest("hex");
  const snapshotPath = `runtime/production/catalog/v1/releases/revision-${revision}-${sha256}.json`;
  const manifest = {
    generatedAt,
    itemsCount: items.length,
    revision,
    schemaVersion: 1,
    sha256,
    snapshotPath,
    snapshotUrl: `https://web00-public-runtime.s3-website.cloud.ru/${snapshotPath}`,
  };
  return { manifest, snapshot };
}

async function loadV2Runtime(fetch, config = cloudConfig()) {
  const browser = createFakeBrowser({ page: "solutions" });
  browser.window.fetch = fetch;
  browser.window.crypto = webcrypto;
  browser.window.Response = Response;
  browser.window.TextDecoder = TextDecoder;
  browser.window.TextEncoder = TextEncoder;
  await loadClassicScript("assets/js/runtime-config.js", browser);
  browser.window.WEB00_CONFIG = Object.freeze(config);
  await loadClassicScript("assets/js/catalog-v2/catalog-runtime.js", browser);
  return browser;
}

function countFetches(fetch, matcher) {
  return fetch.calls.filter((call) => matcher.test(call.url)).length;
}

function homeSkeletonHtml() {
  return Array.from({ length: 3 }, () => `
    <article class="mock-template-card mock-template-card--skeleton" aria-hidden="true" data-popular-skeleton>
      <div class="mock-card-body">
        <span class="catalog-skeleton__line catalog-skeleton__line--title"></span>
        <span class="catalog-skeleton__line catalog-skeleton__line--text"></span>
      </div>
    </article>
  `).join("");
}

function createCatalogStub(states, options = {}) {
  const queue = Array.from(states);
  const calls = [];
  return {
    calls,
    getConfig: () => cloudConfig(),
    getInitialCatalog: () => options.initial || bootstrapState(),
    resolveCatalogForPage(request) {
      calls.push(request);
      const next = queue.length ? queue.shift() : queue.at(-1);
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next);
    },
    findCatalogItem(items, value) {
      const key = String(value || "").trim();
      return (Array.isArray(items) ? items : []).find((item) => (
        item.id === key ||
        item.slug === key ||
        item.key === key ||
        item.title === key ||
        item.legacyTitle === key
      )) || null;
    },
    buildResponsiveImageModel(image, imageOptions = {}) {
      return { image, alt: imageOptions.alt || "", loading: imageOptions.loading || "lazy" };
    },
    renderResponsiveImageHtml(model, renderOptions = {}) {
      const url = typeof model.image === "string" ? model.image : model.image?.url || "";
      const className = renderOptions.className ? ` class="${renderOptions.className}"` : "";
      return `<img${className} src="${url}" alt="${model.alt}" loading="${model.loading}" decoding="async">`;
    },
  };
}

function createGrid(initialGridHtml = "", skeletonSelector = "[data-catalog-skeleton]") {
  let gridHtml = String(initialGridHtml || "");
  const history = gridHtml ? [gridHtml] : [];
  const grid = {
    querySelector(selector) {
      if (selector === skeletonSelector && gridHtml.includes(skeletonSelector.slice(1, -1))) return {};
      return null;
    },
    querySelectorAll(selector) {
      if (selector === skeletonSelector) {
        return Array.from({ length: countMatches(gridHtml, new RegExp(skeletonSelector.slice(1, -1), "g")) }, () => ({}));
      }
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
  return { grid, history };
}

function createBriefTarget() {
  const field = {
    addEventListener: () => undefined,
    classList: classList(),
    closest: () => null,
    tagName: "INPUT",
    type: "text",
    value: "",
  };
  const form = {
    addEventListener: () => undefined,
    closest: () => null,
    elements: {
      budget: field,
      consent: { ...field, checked: false, type: "checkbox" },
      contact: field,
      industry: field,
      name: field,
      taskType: { ...field, tagName: "SELECT" },
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return {
    html: "",
    querySelector: (selector) => (selector === "[data-lead-form]" ? form : null),
    querySelectorAll: () => [],
    set innerHTML(value) {
      this.html = String(value);
    },
    get innerHTML() {
      return this.html;
    },
  };
}

async function loadV2MainPage(page) {
  const { browser } = page;
  await loadClassicScript("assets/js/data.js", browser);
  browser.window.WEB00_DATA = page.data;
  browser.window.WEB00_CATALOG = page.catalog;
  await loadClassicScript("assets/js/catalog-v2/main.js", browser);
  const [onReady] = browser.listeners.get("DOMContentLoaded");
  return onReady();
}

function createHomePage(options = {}) {
  const browser = createFakeBrowser({ page: "home", href: "https://web00.pro/index.html" });
  const { grid, history } = createGrid(options.initialGridHtml || homeSkeletonHtml(), "[data-popular-skeleton]");
  browser.window.addEventListener = () => undefined;
  browser.window.navigator = {};
  browser.window.localStorage = options.storage || { getItem: () => null, setItem: () => undefined };
  browser.document.body.classList = classList();
  browser.document.documentElement = { classList: classList() };
  browser.document.querySelector = (selector) => {
    if (selector === "#popular-templates .mock-card-grid") return grid;
    return null;
  };
  browser.document.querySelectorAll = () => [];
  return {
    browser,
    catalog: options.catalog,
    data: options.data || { SOLUTIONS: [catalogItem("old-home-static", "Old Home Static")], SERVICES: [], PRICING: [] },
    grid,
    history,
  };
}

async function bootHomePage(options = {}) {
  const page = createHomePage(options);
  await loadV2MainPage(page);
  return page;
}

async function startBriefPage(options = {}) {
  const browser = createFakeBrowser({
    page: "brief",
    href: options.href || "https://web00.pro/brief.html?solution=cloud-brief",
  });
  const briefTarget = createBriefTarget();
  const backLink = { href: "", textContent: "" };
  browser.window.addEventListener = () => undefined;
  browser.window.navigator = {};
  browser.window.localStorage = { getItem: () => null, setItem: () => undefined };
  browser.document.body.classList = classList();
  browser.document.documentElement = { classList: classList() };
  browser.document.querySelector = (selector) => {
    if (selector === "[data-brief-page-content]") return briefTarget;
    if (selector === "[data-brief-back]") return backLink;
    return null;
  };
  browser.document.querySelectorAll = () => [];
  const page = {
    backLink,
    briefTarget,
    browser,
    catalog: options.catalog,
    data: options.data || { SOLUTIONS: [catalogItem("cloud-brief", "Old Static Brief Card")], SERVICES: [], PRICING: [] },
  };
  await loadClassicScript("assets/js/data.js", browser);
  browser.window.WEB00_DATA = page.data;
  browser.window.WEB00_CATALOG = page.catalog;
  await loadClassicScript("assets/js/catalog-v2/main.js", browser);
  const [onReady] = browser.listeners.get("DOMContentLoaded");
  return { page, bootPromise: onReady().then(() => page) };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await delay(0);
}

function createSolutionsPage(fetch, options = {}) {
  const browser = createFakeBrowser({ page: "solutions" });
  const timers = [];
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
  let gridHtml = String(options.initialGridHtml || "");
  const history = gridHtml ? [gridHtml] : [];
  const grid = {
    querySelector(selector) {
      if (selector === "[data-catalog-skeleton]" && gridHtml.includes("data-catalog-skeleton")) {
        return {};
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-catalog-skeleton]") {
        return Array.from({ length: countMatches(gridHtml, /data-catalog-skeleton/g) }, () => ({}));
      }
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
  browser.window.localStorage = options.storage || { getItem: () => null, setItem: () => undefined };
  if (options.captureTimers) {
    browser.window.setTimeout = (callback, delayMs) => {
      const id = timers.length + 1;
      timers.push({ callback, delayMs, id });
      return id;
    };
    browser.window.clearTimeout = (id) => {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    };
  }
  browser.document.body.classList = classList();
  browser.document.documentElement = { classList: classList() };
  browser.document.querySelector = (selector) => {
    if (selector === "[data-solutions-grid]") return grid;
    if (selector === "[data-lead-modal-content]") return leadContent;
    if (selector === "[data-modal=\"lead\"]") return leadModal;
    return statusNodes[selector] || null;
  };
  browser.document.querySelectorAll = () => [];
  browser.window.WEB00_DATA = options.data || {
    SOLUTIONS: [{ id: "static-site", title: "Static site", active: true }],
    SERVICES: [],
    PRICING: [],
  };
  browser.window.WEB00_TEST_MODE = true;
  return {
    browser,
    grid,
    history,
    leadContent,
    statusNodes,
    timers,
    async runNextTimer() {
      const timer = timers.shift();
      assert.ok(timer, "expected a scheduled catalog retry timer");
      timer.callback();
      await flush();
    },
  };
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
  if (options.scriptSet === "catalog-v2") {
    await loadClassicScript("assets/js/catalog-v2/catalog-runtime.js", browser);
    await loadClassicScript("assets/js/data.js", browser);
    browser.window.WEB00_DATA = options.data || {
      SOLUTIONS: [{ id: "static-site", title: "Static site", active: true }],
      SERVICES: [],
      PRICING: [],
    };
    await loadClassicScript("assets/js/catalog-v2/catalog-api.js", browser);
    if (options.catalog) browser.window.WEB00_CATALOG = options.catalog;
    await loadClassicScript("assets/js/catalog-v2/main.js", browser);
  } else {
    await loadClassicScript("assets/js/catalog-api.js", browser);
    await loadClassicScript("assets/js/main.js", browser);
  }
  const [onReady] = browser.listeners.get("DOMContentLoaded");
  await onReady();
  return page;
}

function apiSuccess(slug) {
  return jsonResponse({
    data: [{ slug, title: "Site Custom", category: { slug: "goods", title: "Goods" } }],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  });
}

test("v2 runtime primes manifest before DOMContentLoaded catalog initialization", async () => {
  const fixture = runtimeFixture();
  const fetch = createFakeFetch((url) => {
    if (url.startsWith(CLOUD_MANIFEST_URL)) return runtimeJsonResponse(fixture.manifest);
    throw new Error(`unexpected request ${url}`);
  });

  await loadV2Runtime(fetch, cloudConfig());

  assert.equal(countFetches(fetch, /manifest\.json/), 1);
  assert.match(fetch.calls[0].url, new RegExp(`^${CLOUD_MANIFEST_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?_=`));
  assert.equal(countFetches(fetch, /releases\/revision-/), 0);
});

test("v2 runtime does not auto-prime outside exact cloud-primary manifest config", async () => {
  for (const config of [
    { ...cloudConfig(), catalogRuntimeMode: "static" },
    { ...cloudConfig(), catalogManifestUrl: "https://example.test/runtime/production/catalog/v1/manifest.json" },
    { ...cloudConfig(), catalogManifestUrl: "" },
  ]) {
    const fetch = createFakeFetch(() => {
      throw new Error("unexpected runtime request");
    });
    await loadV2Runtime(fetch, config);
    assert.equal(fetch.calls.length, 0);
  }
});

test("v2 startup manifest prime is consumed once by first catalog load", async () => {
  const fixture = runtimeFixture({ items: [catalogItem("primed-current", "Primed Current")] });
  const fetch = createFakeFetch((url) => {
    if (url.startsWith(CLOUD_MANIFEST_URL)) return runtimeJsonResponse(fixture.manifest);
    if (url === fixture.manifest.snapshotUrl) return runtimeJsonResponse(fixture.snapshot);
    throw new Error(`unexpected request ${url}`);
  });
  const config = cloudConfig();
  const browser = await loadV2Runtime(fetch, config);
  await flush();

  const result = await browser.window.WEB00_CATALOG_RUNTIME.loadCatalogFromRuntime(config);

  assert.equal(countFetches(fetch, /manifest\.json/), 1);
  assert.equal(countFetches(fetch, /releases\/revision-/), 1);
  assert.equal(result.freshness, "ready-current");
  assert.equal(result.snapshot.items[0].title, "Primed Current");
});

test("v2 catalog load joins in-flight early runtime manifest prime", async () => {
  const fixture = runtimeFixture({ items: [catalogItem("joined-current", "Joined Current")] });
  const manifestGate = createDeferred();
  const fetch = createFakeFetch((url) => {
    if (url.startsWith(CLOUD_MANIFEST_URL)) return manifestGate.promise;
    if (url === fixture.manifest.snapshotUrl) return runtimeJsonResponse(fixture.snapshot);
    throw new Error(`unexpected request ${url}`);
  });
  const config = cloudConfig();
  const browser = await loadV2Runtime(fetch, config);

  const loadPromise = browser.window.WEB00_CATALOG_RUNTIME.loadCatalogFromRuntime(config);

  assert.equal(countFetches(fetch, /manifest\.json/), 1);
  manifestGate.resolve(runtimeJsonResponse(fixture.manifest));
  const result = await loadPromise;

  assert.equal(countFetches(fetch, /manifest\.json/), 1);
  assert.equal(result.snapshot.items[0].title, "Joined Current");
});

test("v2 failed early runtime manifest prime permits a fresh catalog retry", async () => {
  const fixture = runtimeFixture({ items: [catalogItem("retry-current", "Retry Current")] });
  const fetch = createFakeFetch((url, _init, callNumber) => {
    if (url.startsWith(CLOUD_MANIFEST_URL) && callNumber === 1) {
      return Promise.reject(new Error("offline during startup"));
    }
    if (url.startsWith(CLOUD_MANIFEST_URL)) return runtimeJsonResponse(fixture.manifest);
    if (url === fixture.manifest.snapshotUrl) return runtimeJsonResponse(fixture.snapshot);
    throw new Error(`unexpected request ${url}`);
  });
  const config = cloudConfig();
  const browser = await loadV2Runtime(fetch, config);
  await flush();

  const result = await browser.window.WEB00_CATALOG_RUNTIME.loadCatalogFromRuntime(config);

  assert.equal(countFetches(fetch, /manifest\.json/), 2);
  assert.equal(result.freshness, "ready-current");
  assert.equal(result.snapshot.items[0].title, "Retry Current");
});

test("v2 hanging early runtime manifest prime times out and later recovers", async () => {
  const fixture = runtimeFixture({ items: [catalogItem("timeout-current", "Timeout Current")] });
  const fetch = createFakeFetch((url, init, callNumber) => {
    if (url.startsWith(CLOUD_MANIFEST_URL) && callNumber === 1) {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    }
    if (url.startsWith(CLOUD_MANIFEST_URL)) return runtimeJsonResponse(fixture.manifest);
    if (url === fixture.manifest.snapshotUrl) return runtimeJsonResponse(fixture.snapshot);
    throw new Error(`unexpected request ${url}`);
  });
  const config = { ...cloudConfig(), requestTimeoutMs: 5 };
  const browser = await loadV2Runtime(fetch, config);

  await delay(25);
  const result = await browser.window.WEB00_CATALOG_RUNTIME.loadCatalogFromRuntime(config);

  assert.equal(countFetches(fetch, /manifest\.json/), 2);
  assert.equal(result.freshness, "ready-current");
  assert.equal(result.snapshot.items[0].title, "Timeout Current");
});

test("background retry replaces static cards only after a later non-empty API success", async () => {
  const fetch = createFakeFetch((_url, _init, callNumber) => {
    if (callNumber === 1) return Promise.reject(new Error("cold start"));
    return apiSuccess("site-custom");
  });

  const { history } = await bootSolutionsPage(fetch);
  await delay(40);

  assert.equal(fetch.calls.length, 2);
  assert.match(history[0], /Static site/);
  assert.ok(history.every((html) => html !== ""));
  assert.match(history.at(-1), /Site Custom/);
});

test("background catalog retries stop after three total attempts", async () => {
  const fetch = createFakeFetch(() => Promise.reject(new Error("still asleep")));

  const { history } = await bootSolutionsPage(fetch);
  await delay(70);

  assert.equal(fetch.calls.length, 3);
  assert.match(history.at(-1), /Static site/);
});

test("static cards remain visible while the initial API request is loading", async () => {
  const pending = createDeferred();
  const { grid, history, statusNodes } = await bootSolutionsPage(createFakeFetch(() => pending.promise));

  assert.match(history.at(-1), /Static site/);
  assert.equal(statusNodes["[data-catalog-loading]"].hidden, false);
  assert.match(grid.innerHTML, /Static site/);

  pending.resolve(apiSuccess("site-custom"));
  await delay(20);
});

test("last-known-good cards paint before a sleeping API responds when static catalog is empty", async () => {
  const pending = createDeferred();
  const storage = {
    getItem() {
      return JSON.stringify({
        schemaVersion: 1,
        savedAt: "2026-08-03T00:00:00.000Z",
        items: [{ slug: "site-lkg", title: "LKG site", category: "Goods", categorySlug: "goods" }],
      });
    },
    setItem: () => undefined,
  };
  const { history, statusNodes } = await bootSolutionsPage(createFakeFetch(() => pending.promise), {
    storage,
    data: { SOLUTIONS: [], SERVICES: [], PRICING: [] },
  });

  assert.match(history.at(-1), /LKG site/);
  assert.equal(statusNodes["[data-catalog-loading]"].hidden, false);

  pending.resolve(apiSuccess("site-custom"));
  await delay(20);
});

test("catalog API title cannot escape the rendered lead-form textarea", async () => {
  const payload = "</textarea><img src=x onerror=alert(1)>";
  const { browser, leadContent } = await bootSolutionsPage(createFakeFetch(() => jsonResponse({
    data: [{ slug: "xss-site", title: payload, category: { slug: "goods", title: "Goods" } }],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  })));
  await delay(20);
  const clickHandler = browser.listeners.get("click")[0];

  clickHandler({
    preventDefault: () => undefined,
    target: {
      closest(selector) {
        return selector === "[data-open-lead]" ? { dataset: { solutionId: "xss-site" } } : null;
      },
    },
  });

  assert.doesNotMatch(leadContent.html, /<\/textarea><img src=x onerror=alert\(1\)>/);
  assert.match(leadContent.html, /&lt;\/textarea&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("catalog-v2 solutions keeps literal skeleton and never paints static data while current Cloud is loading", async () => {
  const pending = createDeferred();
  const current = catalogState({
    items: [catalogItem("cloud-current", "Cloud Current")],
    revision: 31,
    sha256: "b".repeat(64),
  });
  const catalog = createCatalogStub([pending.promise]);
  const page = await bootSolutionsPage(createFakeFetch(() => Promise.reject(new Error("no Render"))), {
    catalog,
    captureTimers: true,
    config: cloudConfig(),
    data: { SOLUTIONS: [catalogItem("old-static", "Old Static Card")], SERVICES: [], PRICING: [] },
    initialGridHtml: skeletonHtml(),
    scriptSet: "catalog-v2",
  });

  assert.match(page.history[0], /data-catalog-skeleton/);
  assert.equal(page.statusNodes["[data-catalog-loading]"].hidden, false);
  assert.doesNotMatch(page.history.join("\n"), /Old Static Card/);

  pending.resolve(current);
  await flush();

  assert.match(page.grid.innerHTML, /Cloud Current/);
  assert.doesNotMatch(page.history.join("\n"), /Old Static Card/);
});

test("catalog-v2 current Cloud delete removes stale static ghost without rendering it first", async () => {
  const catalog = createCatalogStub([
    catalogState({
      items: [catalogItem("new-card", "New Card")],
      revision: 32,
      sha256: "c".repeat(64),
    }),
  ]);
  const page = await bootSolutionsPage(createFakeFetch(() => Promise.reject(new Error("no Render"))), {
    catalog,
    captureTimers: true,
    config: cloudConfig(),
    data: { SOLUTIONS: [catalogItem("deleted-card", "Deleted Card")], SERVICES: [], PRICING: [] },
    initialGridHtml: skeletonHtml(),
    scriptSet: "catalog-v2",
  });

  await flush();

  assert.match(page.grid.innerHTML, /New Card/);
  assert.doesNotMatch(page.history.join("\n"), /Deleted Card/);
});

test("catalog-v2 current Cloud edit replaces stale static title without an old-title flash", async () => {
  const catalog = createCatalogStub([
    catalogState({
      items: [catalogItem("edited-card", "Edited Current Title")],
      revision: 33,
      sha256: "d".repeat(64),
    }),
  ]);
  const page = await bootSolutionsPage(createFakeFetch(() => Promise.reject(new Error("no Render"))), {
    catalog,
    captureTimers: true,
    config: cloudConfig(),
    data: { SOLUTIONS: [catalogItem("edited-card", "Old Title")], SERVICES: [], PRICING: [] },
    initialGridHtml: skeletonHtml(),
    scriptSet: "catalog-v2",
  });

  await flush();

  assert.match(page.grid.innerHTML, /Edited Current Title/);
  assert.doesNotMatch(page.history.join("\n"), /Old Title/);
});

test("catalog-v2 accepts authoritative current empty without static fallback or retry", async () => {
  const catalog = createCatalogStub([
    catalogState({
      items: [],
      lifecycle: "empty",
      revision: 30,
      sha256: "e".repeat(64),
    }),
  ]);
  const page = await bootSolutionsPage(createFakeFetch(() => Promise.reject(new Error("no Render"))), {
    catalog,
    captureTimers: true,
    config: cloudConfig(),
    data: { SOLUTIONS: [catalogItem("static-card", "Static Card")], SERVICES: [], PRICING: [] },
    initialGridHtml: skeletonHtml(),
    scriptSet: "catalog-v2",
  });

  await flush();

  assert.equal(page.grid.innerHTML, "");
  assert.equal(page.statusNodes["[data-catalog-empty]"].hidden, false);
  assert.equal(page.statusNodes["[data-catalog-loading]"].hidden, true);
  assert.equal(page.statusNodes["[data-catalog-fallback]"].hidden, true);
  assert.equal(page.timers.length, 0);
  assert.doesNotMatch(page.history.join("\n"), /Static Card/);
  assert.equal(page.history.filter((html) => html === "").length, 1);
});

test("catalog-v2 renders degraded verified fallback and schedules a bounded retry", async () => {
  const catalog = createCatalogStub([
    catalogState({
      degraded: true,
      freshness: "degraded-verified",
      items: [catalogItem("verified-fallback", "Verified Fallback")],
      revision: 28,
      sha256: "f".repeat(64),
      staticFallbackActive: true,
      transport: "verified-cache",
    }),
  ]);
  const page = await bootSolutionsPage(createFakeFetch(() => Promise.reject(new Error("no Render"))), {
    catalog,
    captureTimers: true,
    config: cloudConfig(),
    data: { SOLUTIONS: [catalogItem("old-static", "Old Static Card")], SERVICES: [], PRICING: [] },
    initialGridHtml: skeletonHtml(),
    scriptSet: "catalog-v2",
  });

  await flush();

  assert.match(page.grid.innerHTML, /Verified Fallback/);
  assert.equal(page.statusNodes["[data-catalog-fallback]"].hidden, false);
  assert.equal(page.statusNodes["[data-catalog-loading]"].hidden, true);
  assert.equal(page.timers.length, 1);
});

test("catalog-v2 renders degraded static fallback and still schedules retry", async () => {
  const catalog = createCatalogStub([
    catalogState({
      degraded: true,
      freshness: "degraded-static",
      items: [catalogItem("static-disaster", "Static Disaster")],
      revision: null,
      sha256: "",
      source: "static",
      staticFallbackActive: true,
      transport: "static",
    }),
  ]);
  const page = await bootSolutionsPage(createFakeFetch(() => Promise.reject(new Error("no Render"))), {
    catalog,
    captureTimers: true,
    config: cloudConfig(),
    data: { SOLUTIONS: [catalogItem("static-disaster", "Static Disaster")], SERVICES: [], PRICING: [] },
    initialGridHtml: skeletonHtml(),
    scriptSet: "catalog-v2",
  });

  await flush();

  assert.match(page.history[0], /data-catalog-skeleton/);
  assert.match(page.grid.innerHTML, /Static Disaster/);
  assert.equal(page.statusNodes["[data-catalog-fallback]"].hidden, false);
  assert.equal(page.statusNodes["[data-catalog-loading]"].hidden, true);
  assert.equal(page.timers.length, 1);
});

test("catalog-v2 promotes degraded fallback to current revision with one complete replacement", async () => {
  const catalog = createCatalogStub([
    catalogState({
      degraded: true,
      freshness: "degraded-verified",
      items: [catalogItem("old-verified", "Old Verified")],
      revision: 28,
      sha256: "1".repeat(64),
      staticFallbackActive: true,
      transport: "verified-cache",
    }),
    catalogState({
      items: [catalogItem("current-card", "Current Card")],
      revision: 31,
      sha256: "2".repeat(64),
    }),
  ]);
  const page = await bootSolutionsPage(createFakeFetch(() => Promise.reject(new Error("no Render"))), {
    catalog,
    captureTimers: true,
    config: cloudConfig(),
    initialGridHtml: skeletonHtml(),
    scriptSet: "catalog-v2",
  });

  await flush();
  assert.match(page.grid.innerHTML, /Old Verified/);
  assert.equal(page.timers.length, 1);

  await page.runNextTimer();

  assert.deepEqual(page.history.map((html) => ({
    current: html.includes("Current Card"),
    fallback: html.includes("Old Verified"),
    skeleton: html.includes("data-catalog-skeleton"),
  })), [
    { current: false, fallback: false, skeleton: true },
    { current: false, fallback: true, skeleton: false },
    { current: true, fallback: false, skeleton: false },
  ]);
  assert.equal(page.timers.length, 0);
});

test("catalog-v2 same degraded revision and SHA updates status without a second grid write", async () => {
  const same = catalogState({
    degraded: true,
    freshness: "degraded-verified",
    items: [catalogItem("same-verified", "Same Verified")],
    revision: 28,
    sha256: "3".repeat(64),
    staticFallbackActive: true,
    transport: "verified-cache",
  });
  const catalog = createCatalogStub([same, same]);
  const page = await bootSolutionsPage(createFakeFetch(() => Promise.reject(new Error("no Render"))), {
    catalog,
    captureTimers: true,
    config: cloudConfig(),
    initialGridHtml: skeletonHtml(),
    scriptSet: "catalog-v2",
  });

  await flush();
  assert.equal(page.timers.length, 1);
  await page.runNextTimer();

  assert.equal(page.history.filter((html) => html.includes("Same Verified")).length, 1);
  assert.equal(page.statusNodes["[data-catalog-fallback]"].hidden, false);
  assert.equal(page.timers.length, 1);
});

test("catalog-v2 same ready-current revision and SHA does not rewrite grid on manual retry", async () => {
  const same = catalogState({
    items: [catalogItem("same-current", "Same Current")],
    revision: 31,
    sha256: "4".repeat(64),
  });
  const catalog = createCatalogStub([same, same]);
  const page = await bootSolutionsPage(createFakeFetch(() => Promise.reject(new Error("no Render"))), {
    catalog,
    captureTimers: true,
    config: cloudConfig(),
    initialGridHtml: skeletonHtml(),
    scriptSet: "catalog-v2",
  });

  await flush();
  const clickHandler = page.browser.listeners.get("click")[0];
  clickHandler({
    preventDefault: () => undefined,
    target: {
      closest(selector) {
        return selector === "[data-catalog-retry]" ? { disabled: false } : null;
      },
    },
  });
  await flush();

  assert.equal(page.history.filter((html) => html.includes("Same Current")).length, 1);
  assert.equal(page.timers.length, 0);
});

test("catalog-v2 bootstrap lookup and active solution do not resolve stale DATA.SOLUTIONS", async () => {
  const catalog = createCatalogStub([
    new Promise(() => undefined),
  ]);
  const page = await bootSolutionsPage(createFakeFetch(() => Promise.reject(new Error("no Render"))), {
    catalog,
    captureTimers: true,
    config: cloudConfig(),
    data: { SOLUTIONS: [catalogItem("old-lookup", "Old Lookup Card")], SERVICES: [], PRICING: [] },
    initialGridHtml: skeletonHtml(),
    scriptSet: "catalog-v2",
  });
  const clickHandler = page.browser.listeners.get("click")[0];

  clickHandler({
    preventDefault: () => undefined,
    target: {
      closest(selector) {
        return selector === "[data-open-lead]" ? { dataset: { solutionId: "old-lookup" } } : null;
      },
    },
  });

  assert.match(page.grid.innerHTML, /data-catalog-skeleton/);
  assert.doesNotMatch(page.history.join("\n"), /Old Lookup Card/);
  assert.doesNotMatch(page.leadContent.html, /Old Lookup Card/);
});

test("catalog-v2 home keeps literal skeleton during delayed Cloud and renders current popular cards atomically", async () => {
  const pending = createDeferred();
  const current = catalogState({
    items: [
      catalogItem("home-one", "Home One"),
      catalogItem("home-two", "Home Two"),
      catalogItem("home-three", "Home Three"),
    ],
    revision: 51,
    sha256: "5".repeat(64),
  });
  const catalog = createCatalogStub([pending.promise]);
  const page = await bootHomePage({
    catalog,
    data: { SOLUTIONS: [catalogItem("old-home-static", "Old Home Static")], SERVICES: [], PRICING: [] },
  });

  assert.equal(countMatches(page.grid.innerHTML, /data-popular-skeleton/g), 3);
  assert.doesNotMatch(page.history.join("\n"), /Old Home Static|data-open-demo-id/);

  pending.resolve(current);
  await flush();

  assert.equal(countMatches(page.grid.innerHTML, /mock-template-card/g), 3);
  assert.match(page.grid.innerHTML, /Home One/);
  assert.match(page.grid.innerHTML, /Home Two/);
  assert.match(page.grid.innerHTML, /Home Three/);
  assert.equal(page.history.length, 2);
  assert.doesNotMatch(page.history.join("\n"), /Old Home Static/);
});

test("catalog-v2 home accepts current empty and removes the popular skeleton without static fallback", async () => {
  const catalog = createCatalogStub([
    catalogState({
      items: [],
      lifecycle: "empty",
      revision: 52,
      sha256: "6".repeat(64),
    }),
  ]);
  const page = await bootHomePage({
    catalog,
    data: { SOLUTIONS: [catalogItem("old-home-static", "Old Home Static")], SERVICES: [], PRICING: [] },
  });
  await flush();

  assert.doesNotMatch(page.grid.innerHTML, /data-popular-skeleton/);
  assert.match(page.grid.innerHTML, /Популярные сайты скоро появятся/);
  assert.doesNotMatch(page.history.join("\n"), /Old Home Static/);
});

test("catalog-v2 home renders degraded verified and degraded static popular states from state items only", async () => {
  for (const [freshness, item] of [
    ["degraded-verified", catalogItem("verified-popular", "Verified Popular")],
    ["degraded-static", catalogItem("static-popular", "Static Popular")],
  ]) {
    const catalog = createCatalogStub([
      catalogState({
        degraded: true,
        freshness,
        items: [item],
        revision: freshness === "degraded-static" ? null : 53,
        sha256: freshness === "degraded-static" ? "" : "7".repeat(64),
        source: freshness === "degraded-static" ? "static" : "cloud",
        staticFallbackActive: true,
        transport: freshness === "degraded-static" ? "static" : "verified-cache",
      }),
    ]);
    const page = await bootHomePage({
      catalog,
      data: { SOLUTIONS: [catalogItem("old-home-static", "Old Home Static")], SERVICES: [], PRICING: [] },
    });
    await flush();

    assert.match(page.grid.innerHTML, new RegExp(item.title));
    assert.doesNotMatch(page.grid.innerHTML, /Old Home Static/);
    assert.doesNotMatch(page.grid.innerHTML, /data-popular-skeleton/);
  }
});

test("catalog-v2 brief waits for current-or-degraded catalog before selected solution lookup", async () => {
  const pending = createDeferred();
  const current = catalogState({
    items: [catalogItem("cloud-brief", "Cloud Brief")],
    revision: 54,
    sha256: "8".repeat(64),
  });
  const catalog = createCatalogStub([pending.promise]);
  const { page, bootPromise } = await startBriefPage({
    catalog,
    data: { SOLUTIONS: [catalogItem("cloud-brief", "Old Static Brief Card")], SERVICES: [], PRICING: [] },
  });

  await flush();
  assert.equal(page.briefTarget.innerHTML, "");

  pending.resolve(current);
  await bootPromise;

  assert.match(page.briefTarget.innerHTML, /Cloud Brief/);
  assert.doesNotMatch(page.briefTarget.innerHTML, /Old Static Brief Card/);
});
