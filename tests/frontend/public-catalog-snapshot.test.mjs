import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto, createHash } from "node:crypto";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const manifestUrl = "https://qcizrrqkvdgpcgvnnfpb.supabase.co/storage/v1/object/public/web00-catalog-images/public-catalog/v1/manifest.json";
const snapshotUrl = "https://qcizrrqkvdgpcgvnnfpb.supabase.co/storage/v1/object/public/web00-catalog-images/public-catalog/v1/snapshots/revision-2.json";

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshot(overrides = {}) {
  return {
    generatedAt: "2026-08-01T16:00:00.000Z",
    items: [
      {
        category: { slug: "goods", title: "Товары" },
        galleryImages: [],
        previewImageUrl: "assets/img/previews/mebel-home.png",
        slug: "mebel",
        title: "Мебельный магазин",
      },
      {
        category: { slug: "services", title: "Услуги" },
        galleryImages: [],
        previewImageUrl: "assets/img/previews/dom-arenda-home.png",
        slug: "rental-house",
        title: "Дом для Буси",
      },
    ],
    itemsCount: 2,
    revision: 2,
    schemaVersion: 1,
    settings: { showDemoInModal: true },
    ...overrides,
  };
}

function manifestFor(bytes, overrides = {}) {
  return {
    generatedAt: "2026-08-01T16:00:00.000Z",
    itemsCount: 2,
    revision: 2,
    schemaVersion: 1,
    sha256: createHash("sha256").update(bytes, "utf8").digest("hex"),
    snapshotPath: "public-catalog/v1/snapshots/revision-2.json",
    snapshotUrl,
    ...overrides,
  };
}

function textResponse(body, options = {}) {
  const status = options.status || 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const lower = String(name).toLowerCase();
        if (lower === "content-type") return options.contentType || "application/json; charset=utf-8";
        if (lower === "content-length") return String(Buffer.byteLength(body, "utf8"));
        return null;
      },
    },
    async text() {
      return body;
    },
  };
}

function createCacheStorage(initialSnapshot = null) {
  const values = new Map();
  if (initialSnapshot) {
    values.set(
      "https://web00.local/cache/public-catalog-lkg-v1.json",
      JSON.stringify(initialSnapshot)
    );
  }
  return {
    values,
    async open() {
      return {
        async delete(key) {
          return values.delete(String(key));
        },
        async match(key) {
          const value = values.get(String(key));
          return value === undefined ? undefined : textResponse(value);
        },
        async put(key, response) {
          values.set(String(key), await response.text());
        },
      };
    },
  };
}

async function loadSnapshotClient(options = {}) {
  const calls = [];
  const browser = createFakeBrowser({ page: "solutions" });
  browser.window.Response = Response;
  browser.window.TextEncoder = TextEncoder;
  browser.window.crypto = webcrypto;
  browser.window.caches = options.caches || createCacheStorage();
  browser.window.WEB00_DATA = options.data || {
    SOLUTIONS: [
      { id: "static-one", title: "Static One", active: true },
    ],
  };
  browser.window.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return options.fetch(String(url), init, calls.length);
  };
  await loadClassicScript("assets/js/runtime-config.js", browser);
  if (options.config) browser.window.WEB00_CONFIG = Object.freeze(options.config);
  await loadClassicScript("assets/js/catalog-api.js", browser);
  await loadClassicScript("assets/js/public-catalog-snapshot.js", browser);
  return {
    calls,
    catalog: browser.window.WEB00_CATALOG,
    snapshotClient: browser.window.WEB00_PUBLIC_CATALOG_SNAPSHOT,
  };
}

test("loads manifest and verified snapshot with safe fetch options", async () => {
  const body = `${JSON.stringify(snapshot())}\n`;
  const manifest = JSON.stringify(manifestFor(body));
  const { calls, catalog } = await loadSnapshotClient({
    fetch(url) {
      if (url === manifestUrl) return textResponse(manifest);
      if (url === snapshotUrl) return textResponse(body);
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.source, "snapshot");
  assert.equal(result.sourceState, "CURRENT_READY");
  assert.equal(result.revision, 2);
  assert.equal(result.settings.showDemoInModal, true);
  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["mebel", "rental-house"]);
  assert.deepEqual(calls.map((call) => call.url), [manifestUrl, snapshotUrl]);
  for (const call of calls) {
    assert.equal(call.init.method, "GET");
    assert.equal(call.init.credentials, "omit");
    assert.equal(call.init.redirect, "error");
    assert.equal(call.init.cache, "no-store");
  }
});

test("checksum mismatch degrades to static data without calling Render", async () => {
  const body = `${JSON.stringify(snapshot())}\n`;
  const badManifest = JSON.stringify(manifestFor(body, { sha256: "0".repeat(64) }));
  const { calls, catalog } = await loadSnapshotClient({
    fetch(url) {
      if (url === manifestUrl) return textResponse(badManifest);
      if (url === snapshotUrl) return textResponse(body);
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.lifecycle, "degraded");
  assert.equal(result.sourceState, "DEGRADED_WITH_DATA");
  assert.equal(result.source, "static");
  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["static-one"]);
  assert.equal(calls.some((call) => call.url.includes("onrender.com")), false);
});

test("valid LKG is shown when Supabase snapshot is unavailable", async () => {
  const lkg = snapshot({ revision: 4 });
  const { catalog } = await loadSnapshotClient({
    caches: createCacheStorage(lkg),
    fetch() {
      return textResponse("{}", { status: 503 });
    },
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.lifecycle, "degraded");
  assert.equal(result.source, "lkg");
  assert.equal(result.revision, 4);
  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["mebel", "rental-house"]);
});

test("older LKG cannot replace newer current snapshot", async () => {
  const oldLkg = snapshot({ revision: 1 });
  const current = snapshot({ revision: 2 });
  const body = `${JSON.stringify(current)}\n`;
  const manifest = JSON.stringify(manifestFor(body));
  const { catalog } = await loadSnapshotClient({
    caches: createCacheStorage(oldLkg),
    fetch(url) {
      if (url === manifestUrl) return textResponse(manifest);
      if (url === snapshotUrl) return textResponse(body);
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.source, "snapshot");
  assert.equal(result.revision, 2);
});

test("malformed manifest URLs and wildcard origins are rejected", async () => {
  const { snapshotClient } = await loadSnapshotClient({
    fetch() {
      throw new Error("fetch not expected");
    },
  });

  assert.equal(snapshotClient.sanitizeManifestUrl(manifestUrl), manifestUrl);
  assert.equal(snapshotClient.sanitizeManifestUrl("https://evil.supabase.co/storage/v1/object/public/web00-catalog-images/public-catalog/v1/manifest.json"), "");
  assert.equal(snapshotClient.sanitizeManifestUrl("https://qcizrrqkvdgpcgvnnfpb.supabase.co/storage/v1/object/public/web00-catalog-images/public-catalog/v1/manifest.json?x=1"), "");
  assert.equal(snapshotClient.sanitizeSnapshotUrl(snapshotUrl), snapshotUrl);
  assert.equal(snapshotClient.sanitizeSnapshotUrl("https://*.supabase.co/storage/v1/object/public/web00-catalog-images/public-catalog/v1/snapshots/revision-2.json"), "");
});
