import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const MANIFEST_URL = "https://qcizrrqkvdgpcgvnnfpb.supabase.co/storage/v1/object/public/web00-catalog-images/public-catalog/v1/manifest.json";
const SNAPSHOT_BASE_URL = "https://qcizrrqkvdgpcgvnnfpb.supabase.co/storage/v1/object/public/web00-catalog-images/public-catalog/v1/";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeoutMs = 200) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await delay(5);
  }
  return predicate();
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function classList() {
  return { add: () => undefined, remove: () => undefined, toggle: () => undefined };
}

function textResponse(body, options = {}) {
  const status = options.status || 200;
  const contentType = options.contentType === undefined ? "application/json; charset=utf-8" : options.contentType;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? contentType : null;
      },
    },
    async text() {
      return body;
    },
  };
}

function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])])
  );
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await webcrypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function remotePair(snapshot) {
  const snapshotText = `${stableStringify(snapshot)}\n`;
  const checksum = await sha256Hex(snapshotText);
  const snapshotUrl = `${SNAPSHOT_BASE_URL}snapshots/revision-${snapshot.revision}.json`;
  return {
    manifestText: `${stableStringify({
      itemsCount: snapshot.itemsCount,
      revision: snapshot.revision,
      schemaVersion: 1,
      sha256: checksum,
      snapshotPath: `public-catalog/v1/snapshots/revision-${snapshot.revision}.json`,
      snapshotUrl,
    })}\n`,
    snapshotText,
    snapshotUrl,
  };
}

function createImageHarness() {
  const loads = [];
  class FakeImage {
    set src(value) {
      this._src = String(value);
      loads.push({ image: this, src: this._src });
    }
    get src() {
      return this._src;
    }
  }
  return {
    Image: FakeImage,
    loads,
    rejectAll() {
      loads.splice(0).forEach(({ image }) => {
        if (typeof image.onerror === "function") image.onerror(new Error("preload failed"));
      });
    },
    resolveAll() {
      loads.splice(0).forEach(({ image }) => {
        if (typeof image.onload === "function") image.onload();
      });
    },
  };
}

function createManualTimers() {
  let nextId = 1;
  const timers = new Map();
  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    pending() {
      return timers.size;
    },
    runAll() {
      const callbacks = [...timers.entries()];
      timers.clear();
      callbacks.forEach(([_id, callback]) => callback());
    },
    setTimeout(callback) {
      const id = nextId;
      nextId += 1;
      timers.set(id, callback);
      return id;
    },
  };
}

function createPage(fetch, options = {}) {
  const browser = createFakeBrowser({ page: options.page || "solutions" });
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
  let solutionsHtml = "";
  const solutionsGrid = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    get innerHTML() {
      return solutionsHtml;
    },
    set innerHTML(value) {
      solutionsHtml = String(value);
      history.push({ html: solutionsHtml, target: "solutions" });
    },
  };
  let popularHtml = "";
  const popularGrid = {
    get innerHTML() {
      return popularHtml;
    },
    set innerHTML(value) {
      popularHtml = String(value);
      history.push({ html: popularHtml, target: "popular" });
    },
  };
  const imageHarness = options.imageHarness || createImageHarness();

  browser.window.fetch = fetch;
  browser.window.addEventListener = () => undefined;
  browser.window.crypto = webcrypto;
  browser.window.TextEncoder = TextEncoder;
  browser.window.Image = imageHarness.Image;
  browser.window.navigator = {};
  if (options.timers) {
    browser.window.setTimeout = options.timers.setTimeout;
    browser.window.clearTimeout = options.timers.clearTimeout;
  }
  browser.window.localStorage = options.storage || { getItem: () => null, setItem: () => undefined };
  browser.document.body.classList = classList();
  browser.document.documentElement = { classList: classList(), lang: "ru" };
  browser.document.querySelector = (selector) => {
    if (selector === "[data-solutions-grid]") return solutionsGrid;
    if (selector === "#popular-templates .mock-card-grid") return popularGrid;
    if (selector === "[data-lead-modal-content]") return leadContent;
    if (selector === "[data-modal=\"lead\"]") return leadModal;
    return statusNodes[selector] || null;
  };
  browser.document.querySelectorAll = () => [];
  browser.window.WEB00_TEST_MODE = true;
  return { browser, history, imageHarness, popularGrid, solutionsGrid, statusNodes };
}

async function loadBaseScripts(browser, config = {}) {
  await loadClassicScript("assets/js/data.js", browser);
  await loadClassicScript("assets/js/runtime-config.js", browser);
  browser.window.WEB00_CONFIG = Object.freeze({
    apiBaseUrl: "https://web00-backend-production.onrender.com",
    publicCatalogManifestUrl: MANIFEST_URL,
    publicCatalogRequestTimeoutMs: 1000,
    requestTimeoutMs: 1000,
    staticFallbackEnabled: true,
    ...config,
  });
  await loadClassicScript("assets/js/public-catalog-bundled-snapshot.js", browser);
  await loadClassicScript("assets/js/public-catalog-snapshot.js", browser);
  await loadClassicScript("assets/js/catalog-api.js", browser);
}

async function bootPage(fetch, options = {}) {
  const page = createPage(fetch, options);
  await loadBaseScripts(page.browser, options.config);
  await loadClassicScript("assets/js/main.js", page.browser);
  const [onReady] = page.browser.listeners.get("DOMContentLoaded");
  await onReady();
  return page;
}

function withNewSite(snapshot, options = {}) {
  const nextItems = [
    ...plain(snapshot.items),
    {
      category: { slug: "services", title: "Services" },
      deliveryLabel: "1 day",
      demoMode: "",
      demoUrl: null,
      features: ["Fast"],
      galleryImages: [],
      previewImage: {
        alt: "New Site",
        url: options.imageUrl || "assets/img/previews/new-site.png",
        variants: [],
      },
      previewImageUrl: options.imageUrl || "assets/img/previews/new-site.png",
      priceLabel: "from 1",
      shortDescription: "New card",
      siteUrl: null,
      slug: "new-site",
      tags: [],
      title: "New Site",
    },
  ];
  return {
    generatedAt: "2026-08-03T00:00:00.000Z",
    items: nextItems,
    itemsCount: nextItems.length,
    revision: 2,
    schemaVersion: 1,
    settings: plain(snapshot.settings),
  };
}

test("clean solutions page paints bundled 16-card catalog on first meaningful frame", async () => {
  const fetch = createFakeFetch(() => textResponse(stableStringify({
    itemsCount: 16,
    revision: 1,
    schemaVersion: 1,
    sha256: "0".repeat(64),
    snapshotPath: "public-catalog/v1/snapshots/revision-1.json",
    snapshotUrl: `${SNAPSHOT_BASE_URL}snapshots/revision-1.json`,
  })));

  const { history, imageHarness } = await bootPage(fetch, { page: "solutions" });
  await delay(30);

  const solutionFrames = history.filter((entry) => entry.target === "solutions");
  assert.equal((solutionFrames[0].html.match(/data-solution-card/g) || []).length, 16);
  assert.match(solutionFrames[0].html, /Дом для Буси/);
  assert.equal(solutionFrames.length, 1);
  assert.equal(imageHarness.loads.length, 0);
});

test("home popular grid paints authoritative bundled popular trio immediately", async () => {
  const fetch = createFakeFetch(() => textResponse(stableStringify({
    itemsCount: 16,
    revision: 1,
    schemaVersion: 1,
    sha256: "0".repeat(64),
    snapshotPath: "public-catalog/v1/snapshots/revision-1.json",
    snapshotUrl: `${SNAPSHOT_BASE_URL}snapshots/revision-1.json`,
  })));

  const { history } = await bootPage(fetch, { page: "home" });
  await delay(30);

  const popularFrames = history.filter((entry) => entry.target === "popular");
  assert.equal(popularFrames.length, 1);
  assert.match(popularFrames[0].html, /Мебельный магазин/);
  assert.match(popularFrames[0].html, /Медицина услуги/);
  assert.match(popularFrames[0].html, /Дома, бани из сруба/);
});

test("newer snapshot preloads images before one atomic catalog swap", async () => {
  const probe = createFakeBrowser();
  await loadClassicScript("assets/js/public-catalog-bundled-snapshot.js", probe);
  const nextSnapshot = withNewSite(probe.window.WEB00_PUBLIC_CATALOG_BUNDLED_SNAPSHOT);
  const remote = await remotePair(nextSnapshot);
  const imageHarness = createImageHarness();
  const fetch = createFakeFetch((url) => {
    if (url === MANIFEST_URL) return textResponse(remote.manifestText);
    if (url === remote.snapshotUrl) return textResponse(remote.snapshotText);
    throw new Error(`unexpected URL ${url}`);
  });

  const { history } = await bootPage(fetch, { imageHarness, page: "solutions" });
  await waitFor(() => imageHarness.loads.length > 0);

  let solutionFrames = history.filter((entry) => entry.target === "solutions");
  assert.equal(solutionFrames.length, 1);
  assert.doesNotMatch(solutionFrames[0].html, /New Site/);
  assert.equal(imageHarness.loads.length > 0, true);

  imageHarness.resolveAll();
  await delay(20);

  solutionFrames = history.filter((entry) => entry.target === "solutions");
  assert.equal(solutionFrames.length, 2);
  assert.match(solutionFrames[1].html, /New Site/);
  assert.equal((solutionFrames[1].html.match(/data-solution-card/g) || []).length, 17);
});

test("newer snapshot preload failure keeps the already visible catalog", async () => {
  const probe = createFakeBrowser();
  await loadClassicScript("assets/js/public-catalog-bundled-snapshot.js", probe);
  const nextSnapshot = withNewSite(probe.window.WEB00_PUBLIC_CATALOG_BUNDLED_SNAPSHOT, {
    imageUrl: "assets/img/previews/fails.png",
  });
  const remote = await remotePair(nextSnapshot);
  const imageHarness = createImageHarness();
  const fetch = createFakeFetch((url) => {
    if (url === MANIFEST_URL) return textResponse(remote.manifestText);
    if (url === remote.snapshotUrl) return textResponse(remote.snapshotText);
    throw new Error(`unexpected URL ${url}`);
  });

  const { history } = await bootPage(fetch, { imageHarness, page: "solutions" });
  await waitFor(() => imageHarness.loads.length > 0);
  imageHarness.rejectAll();
  await delay(30);

  const solutionFrames = history.filter((entry) => entry.target === "solutions");
  assert.equal(solutionFrames.length, 1);
  assert.equal((solutionFrames[0].html.match(/data-solution-card/g) || []).length, 16);
  assert.doesNotMatch(solutionFrames[0].html, /New Site/);
});

test("hanging newer snapshot image preload times out and leaves retry path finite", async () => {
  const probe = createFakeBrowser();
  await loadClassicScript("assets/js/public-catalog-bundled-snapshot.js", probe);
  const nextSnapshot = withNewSite(probe.window.WEB00_PUBLIC_CATALOG_BUNDLED_SNAPSHOT, {
    imageUrl: "assets/img/previews/hangs.png",
  });
  const remote = await remotePair(nextSnapshot);
  const imageHarness = createImageHarness();
  const timers = createManualTimers();
  const fetch = createFakeFetch((url) => {
    if (url === MANIFEST_URL) return textResponse(remote.manifestText);
    if (url === remote.snapshotUrl) return textResponse(remote.snapshotText);
    throw new Error(`unexpected URL ${url}`);
  });

  const { history, statusNodes } = await bootPage(fetch, { imageHarness, page: "solutions", timers });
  await waitFor(() => imageHarness.loads.length > 0);

  const solutionFramesBeforeTimeout = history.filter((entry) => entry.target === "solutions");
  assert.equal(solutionFramesBeforeTimeout.length, 1);
  assert.equal(timers.pending() > 0, true);

  timers.runAll();
  await delay(0);

  const solutionFrames = history.filter((entry) => entry.target === "solutions");
  assert.equal(solutionFrames.length, 1);
  assert.equal((solutionFrames[0].html.match(/data-solution-card/g) || []).length, 16);
  assert.doesNotMatch(solutionFrames[0].html, /New Site/);
  assert.equal(statusNodes["[data-catalog-loading]"].hidden, true);
  assert.equal(timers.pending() > 0, true);
});
