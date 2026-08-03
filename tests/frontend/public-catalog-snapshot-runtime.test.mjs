import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const MANIFEST_URL = "https://qcizrrqkvdgpcgvnnfpb.supabase.co/storage/v1/object/public/web00-catalog-images/public-catalog/v1/manifest.json";
const SNAPSHOT_BASE_URL = "https://qcizrrqkvdgpcgvnnfpb.supabase.co/storage/v1/object/public/web00-catalog-images/public-catalog/v1/";
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
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
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

function snapshotFromBundled(bundled, overrides = {}) {
  const items = plain(overrides.items || bundled.items);
  const snapshot = {
    generatedAt: overrides.generatedAt || "2026-08-03T00:00:00.000Z",
    items,
    itemsCount: overrides.itemsCount ?? items.length,
    revision: overrides.revision ?? bundled.revision,
    schemaVersion: 1,
    settings: plain(overrides.settings || bundled.settings),
  };
  if (overrides.popular) snapshot.popular = plain(overrides.popular);
  return snapshot;
}

async function remotePair(snapshot, options = {}) {
  const snapshotText = options.snapshotText || `${stableStringify(snapshot)}\n`;
  const sha256 = options.sha256 || await sha256Hex(snapshotText);
  const snapshotPath = `public-catalog/v1/snapshots/revision-${snapshot.revision}.json`;
  const snapshotUrl = options.snapshotUrl || `${SNAPSHOT_BASE_URL}snapshots/revision-${snapshot.revision}.json`;
  const manifest = {
    itemsCount: snapshot.itemsCount,
    revision: snapshot.revision,
    schemaVersion: 1,
    sha256,
    snapshotPath,
    snapshotUrl,
  };
  return {
    manifestText: `${stableStringify(manifest)}\n`,
    snapshotText,
    snapshotUrl,
  };
}

async function loadCatalog(options = {}) {
  const browser = createFakeBrowser();
  const storage = options.storage || createStorage();
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = options.data || { SOLUTIONS: [] };
  browser.window.localStorage = storage;
  browser.window.fetch = options.fetch || createFakeFetch(() => {
    throw new Error("unexpected fetch");
  });
  browser.window.crypto = webcrypto;
  browser.window.TextEncoder = TextEncoder;
  await loadClassicScript("assets/js/data.js", browser);
  await loadClassicScript("assets/js/runtime-config.js", browser);
  browser.window.WEB00_CONFIG = Object.freeze(options.config || {
    apiBaseUrl: "https://web00-backend-production.onrender.com",
    publicCatalogManifestUrl: MANIFEST_URL,
    publicCatalogRequestTimeoutMs: 1000,
    requestTimeoutMs: 1000,
    staticFallbackEnabled: true,
  });
  await loadClassicScript("assets/js/public-catalog-bundled-snapshot.js", browser);
  await loadClassicScript("assets/js/public-catalog-snapshot.js", browser);
  await loadClassicScript("assets/js/catalog-api.js", browser);
  return {
    browser,
    catalog: browser.window.WEB00_CATALOG,
    storage,
    tests: browser.window.WEB00_CATALOG_TESTS,
  };
}

test("initial catalog uses bundled revision 1 before legacy static data", async () => {
  const { catalog } = await loadCatalog();

  const initial = catalog.getInitialCatalog();
  const popular = catalog.getInitialCatalog({ kind: "popular", limit: 3 });

  assert.equal(initial.source, "bundled");
  assert.equal(initial.revision, 1);
  assert.equal(initial.items.length, 16);
  assert.equal(initial.items.some((item) => item.slug === "dom-dlya-busi" && item.title === "Дом для Буси"), true);
  assert.deepEqual(plain(popular.items.map((item) => item.slug)), ["mebel", "medicina", "doma-bani"]);
});

test("same remote revision is observational and does not fetch snapshot bytes", async () => {
  const storage = createStorage();
  const fetch = createFakeFetch((url) => {
    assert.equal(url, MANIFEST_URL);
    return textResponse(stableStringify({
      itemsCount: 16,
      revision: 1,
      schemaVersion: 1,
      sha256: "0".repeat(64),
      snapshotPath: "public-catalog/v1/snapshots/revision-1.json",
      snapshotUrl: `${SNAPSHOT_BASE_URL}snapshots/revision-1.json`,
    }));
  });
  const { catalog } = await loadCatalog({ fetch, storage });
  const currentState = catalog.getInitialCatalog();

  const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState });
  const saved = JSON.parse(storage.snapshot()[LKG_KEY]);

  assert.equal(result.unchanged, true);
  assert.equal(result.source, "bundled");
  assert.equal(result.revision, 1);
  assert.equal(fetch.calls.length, 1);
  assert.equal(saved.revision, 1);
  assert.equal(saved.items.length, 16);
});

test("newer remote snapshot loads through manifest, not Render API, and becomes LKG", async () => {
  const probe = await loadCatalog();
  const bundled = probe.browser.window.WEB00_PUBLIC_CATALOG_BUNDLED_SNAPSHOT;
  const nextItems = [
    ...plain(bundled.items),
    {
      category: { slug: "services", title: "Services" },
      deliveryLabel: "1 day",
      demoMode: "",
      demoUrl: null,
      features: ["Fast"],
      galleryImages: [],
      previewImage: { alt: "New Site", url: "assets/img/previews/new-site.png", variants: [] },
      previewImageUrl: "assets/img/previews/new-site.png",
      priceLabel: "from 1",
      shortDescription: "New card",
      siteUrl: null,
      slug: "new-site",
      tags: [],
      title: "New Site",
    },
  ];
  const nextSnapshot = snapshotFromBundled(bundled, { revision: 2, items: nextItems });
  const remote = await remotePair(nextSnapshot);
  const storage = createStorage();
  const fetch = createFakeFetch((url) => {
    if (url === MANIFEST_URL) return textResponse(remote.manifestText);
    if (url === remote.snapshotUrl) return textResponse(remote.snapshotText);
    throw new Error(`unexpected URL ${url}`);
  });
  const { catalog } = await loadCatalog({ fetch, storage });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: catalog.getInitialCatalog() });
  const saved = JSON.parse(storage.snapshot()[LKG_KEY]);

  assert.equal(result.source, "snapshot");
  assert.equal(result.revision, 2);
  assert.equal(result.items.length, 17);
  assert.equal(result.items.at(-1).slug, "new-site");
  assert.equal(fetch.calls.some((call) => call.url.includes("/api/sites")), false);
  assert.equal(saved.revision, 2);
  assert.equal(saved.items.length, 17);
});

test("newer remote snapshot preserves authoritative popular trio", async () => {
  const probe = await loadCatalog();
  const bundled = probe.browser.window.WEB00_PUBLIC_CATALOG_BUNDLED_SNAPSHOT;
  const nextItems = [
    ...plain(bundled.items),
    {
      category: { slug: "services", title: "Services" },
      deliveryLabel: "1 day",
      demoMode: "",
      demoUrl: null,
      features: ["Fast"],
      galleryImages: [],
      previewImage: { alt: "New Site", url: "assets/img/previews/new-site.png", variants: [] },
      previewImageUrl: "assets/img/previews/new-site.png",
      priceLabel: "from 1",
      shortDescription: "New card",
      siteUrl: null,
      slug: "new-site",
      tags: [],
      title: "New Site",
    },
  ];
  const popular = [
    nextItems.find((item) => item.slug === "new-site"),
    nextItems.find((item) => item.slug === "medicina"),
    nextItems.find((item) => item.slug === "mebel"),
  ];
  const nextSnapshot = snapshotFromBundled(bundled, { revision: 2, items: nextItems, popular });
  const remote = await remotePair(nextSnapshot);
  const storage = createStorage();
  const fetch = createFakeFetch((url) => {
    if (url === MANIFEST_URL) return textResponse(remote.manifestText);
    if (url === remote.snapshotUrl) return textResponse(remote.snapshotText);
    throw new Error(`unexpected URL ${url}`);
  });
  const { catalog } = await loadCatalog({ fetch, storage });

  const popularResult = await catalog.resolveCatalogForPage({
    kind: "popular",
    limit: 3,
    currentState: catalog.getInitialCatalog({ limit: 3 }),
  });
  const solutionResult = await catalog.resolveCatalogForPage({
    kind: "solutions",
    currentState: catalog.getInitialCatalog(),
  });
  const saved = JSON.parse(storage.snapshot()[LKG_KEY]);

  assert.deepEqual(plain(popularResult.items.map((item) => item.slug)), ["new-site", "medicina", "mebel"]);
  assert.equal(solutionResult.items.length, 17);
  assert.deepEqual(saved.popular.map((item) => item.slug), ["new-site", "medicina", "mebel"]);
});

test("malformed remote manifest or snapshot preserves bundled catalog", async (t) => {
  const cases = [
    ["bad manifest JSON", () => textResponse("{")],
    ["bad snapshot count", async (bundled) => {
      const badSnapshot = snapshotFromBundled(bundled, { revision: 2, itemsCount: 999 });
      const remote = await remotePair(badSnapshot);
      return { remote, manifest: () => textResponse(remote.manifestText), snapshot: () => textResponse(remote.snapshotText) };
    }],
    ["checksum mismatch", async (bundled) => {
      const badSnapshot = snapshotFromBundled(bundled, { revision: 2 });
      const remote = await remotePair(badSnapshot, { sha256: "0".repeat(64) });
      return { remote, manifest: () => textResponse(remote.manifestText), snapshot: () => textResponse(remote.snapshotText) };
    }],
  ];

  for (const [name, setup] of cases) {
    await t.test(name, async () => {
      const probe = await loadCatalog();
      const bundled = probe.browser.window.WEB00_PUBLIC_CATALOG_BUNDLED_SNAPSHOT;
      const configured = typeof setup === "function" ? await setup(bundled) : setup;
      const fetch = createFakeFetch((url) => {
        if (url === MANIFEST_URL) return configured.manifest ? configured.manifest() : configured();
        if (configured.snapshot && url === configured.remote.snapshotUrl) return configured.snapshot();
        throw new Error(`unexpected URL ${url}`);
      });
      const { catalog } = await loadCatalog({ fetch });

      const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: catalog.getInitialCatalog() });

      assert.equal(result.source, "bundled");
      assert.equal(result.items.length, 16);
      assert.equal(result.degraded, true);
      assert.notEqual(result.errorCode, "");
    });
  }
});

test("public snapshot URLs are bounded to the approved storage path", async () => {
  const fetch = createFakeFetch(() => textResponse(stableStringify({
    itemsCount: 16,
    revision: 2,
    schemaVersion: 1,
    sha256: "0".repeat(64),
    snapshotPath: "public-catalog/v1/snapshots/revision-2.json",
    snapshotUrl: "https://example.test/public-catalog/v1/revision-2.json?token=secret",
  })));
  const { catalog } = await loadCatalog({ fetch });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: catalog.getInitialCatalog() });

  assert.equal(result.source, "bundled");
  assert.equal(result.items.length, 16);
  assert.equal(result.degraded, true);
  assert.equal(result.errorCode, "WEB00_PUBLIC_CATALOG_INVALID_MANIFEST");
});
