import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

async function importProductionModule(relativePath, description) {
  try {
    return await import(new URL(`../../${relativePath}`, import.meta.url).href);
  } catch (error) {
    throw new Error(`Expected ${description} to exist; OPV2-1 is RED until Public Catalog V2 frontend is implemented.`, {
      cause: error
    });
  }
}

test("clean visitor renders V2 first page and authoritative popular without Render API", async () => {
  const module = await importProductionModule("assets/js/public-catalog-v2-client.js", "Public Catalog V2 client");
  const release = createSyntheticV2ReleaseFixture({ itemCount: 100, revision: 7 });
  const catalog = await module.loadPublicCatalogV2({
    cacheStorage: createCacheStorage(),
    fetchImpl: release.fetch,
    indexedDb: createIndexedDb(),
    legacyData: { SOLUTIONS: [{ slug: "legacy-static-card" }] },
    localStorage: createLocalStorageProbe(),
    storageBaseUrl: release.storageBaseUrl,
    timeoutMs: 8000
  });

  assert.equal(release.urls.some((url) => new URL(url).hostname.endsWith("onrender.com")), false);
  assert.equal(release.urls.some((url) => new URL(url).pathname.startsWith("/api/")), false);
  assert.equal(release.readRuntimeApiBase, false);
  assert.equal(catalog.items.length, 100);
  assert.equal(catalog.popular.items.length, 3);
  assert.deepEqual(catalog.popular.items.map((item) => item.slug), release.authoritativePopularSlugs);
});

test("repeat visitor unchanged revision causes zero DOM replacement and zero image reloads", async () => {
  const module = await importProductionModule("assets/js/public-catalog-v2-client.js", "Public Catalog V2 client");
  const release = createSyntheticV2ReleaseFixture({ itemCount: 100, revision: 7 });
  const renderCalls = [];
  const imageLoads = [];

  await module.refreshPublicCatalogV2({
    cacheStorage: createCacheStorage(),
    currentRelease: { manifestSha256: release.manifestSha256, revision: 7 },
    fetchImpl: release.fetch,
    indexedDb: createIndexedDb(),
    localStorage: createLocalStorageProbe(),
    preloadImage: (image) => imageLoads.push(image),
    renderSolutions: (items) => renderCalls.push(items),
    storageBaseUrl: release.storageBaseUrl
  });

  assert.equal(renderCalls.length, 0);
  assert.equal(imageLoads.length, 0);
});

test("newer revision preloads first visible images before one atomic catalog swap", async () => {
  const module = await importProductionModule("assets/js/public-catalog-v2-client.js", "Public Catalog V2 client");
  const release = createSyntheticV2ReleaseFixture({ itemCount: 100, revision: 8 });
  const events = [];

  await module.refreshPublicCatalogV2({
    cacheStorage: createCacheStorage(),
    currentRelease: { manifestSha256: "a".repeat(64), revision: 7 },
    fetchImpl: release.fetch,
    indexedDb: createIndexedDb(),
    localStorage: createLocalStorageProbe(),
    preloadImage: async (image) => {
      events.push(["preload", image.assetId]);
    },
    renderSolutions: (items) => {
      events.push(["swap", items.length]);
    },
    storageBaseUrl: release.storageBaseUrl,
    visibleImageLimit: 6
  });

  assert.deepEqual(events.at(-1), ["swap", 100]);
  assert.equal(events.filter(([kind]) => kind === "swap").length, 1);
  assert.equal(events.filter(([kind]) => kind === "preload").length > 0, true);
});

test("frontend capacity uses chunk DOM rendering, bounded storage, finite concurrency and stale response rejection", async () => {
  const module = await importProductionModule("assets/js/public-catalog-v2-renderer.js", "Public Catalog V2 renderer");
  const release = createSyntheticV2ReleaseFixture({ itemCount: 10_000, revision: 4 });
  const dom = createDomHarness();
  const localStorage = createLocalStorageProbe();
  const renderer = module.createPublicCatalogV2Renderer({
    cacheStorage: createCacheStorage(),
    container: dom.container,
    documentRef: dom.documentRef,
    fetchChunk: release.fetch,
    indexedDb: createIndexedDb(),
    localStorage,
    maxArtifactFetchConcurrency: 4,
    maxLiveCardNodes: 120,
    prefetchNextChunk: true
  });

  const staleResult = await renderer.applyRelease({
    activeRevision: 3,
    index: release.index,
    manifest: release.manifest,
    revision: 4
  });
  await renderer.applyRelease({
    activeRevision: 4,
    index: release.index,
    manifest: release.manifest,
    revision: 4
  });

  assert.equal(staleResult.applied, false);
  assert.equal(dom.container.querySelectorAll("[data-catalog-card]").length <= 120, true);
  assert.equal(localStorage.containsFullCatalogPayload(), false);
  assert.equal(release.maxConcurrentFetches <= 4, true);
  assert.equal(release.prefetchedChunkPaths.includes("public-catalog/v2/releases/revision-4/chunks/chunk-000002.json"), true);
});

test("demo switch and modal use managed origins, serialized autosave, safe sandbox and outside fallback", async () => {
  const module = await importProductionModule("assets/js/public-catalog-v2-demo.js", "Public Catalog V2 demo module");
  const dom = createDomHarness();
  const requests = [];
  const demo = module.createPublicCatalogV2DemoController({
    allowedOrigins: ["https://demo.web00.test"],
    documentRef: dom.documentRef,
    request: async (payload) => {
      requests.push(payload);
      return { state: "Сохранено" };
    },
    siteId: "00000000-0000-4000-8000-000000000101"
  });

  const switchControl = demo.renderPremiumDemoSwitch({
    defaultChecked: true,
    label: "Открывать демо внутри WEB00"
  });
  switchControl.checked = false;
  switchControl.dispatchEvent({ type: "change" });
  switchControl.checked = true;
  switchControl.dispatchEvent({ type: "change" });
  await demo.waitForAutosaveIdle();

  const managed = demo.openDemoModal({
    demoPolicy: "managed",
    demoUrl: "https://demo.web00.test/site",
    siteUrl: "https://external.example.test/site",
    slug: "synthetic-fixture"
  });
  const external = demo.openDemoModal({
    demoPolicy: "external",
    demoUrl: "https://not-managed.example.test/site",
    siteUrl: "https://not-managed.example.test/site",
    slug: "synthetic-external-fixture"
  });

  assert.equal(switchControl.getAttribute("role"), "switch");
  assert.equal(switchControl.getAttribute("aria-checked"), "true");
  assert.deepEqual(demo.stateLabels, ["Сохранено", "Публикуется", "Ошибка"]);
  assert.equal(demo.hasSeparateSaveButton(), false);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    enabled: true,
    siteId: "00000000-0000-4000-8000-000000000101"
  });
  assert.equal(managed.querySelectorAll("iframe").length, 1);
  const sandboxTokens = new Set(managed.querySelector("iframe").getAttribute("sandbox").split(/\s+/).filter(Boolean));
  assert.equal(sandboxTokens.has("allow-scripts"), true);
  assert.equal(sandboxTokens.has("allow-same-origin"), false);
  assert.equal(sandboxTokens.has("allow-top-navigation"), false);
  assert.equal(sandboxTokens.has("allow-popups"), false);
  assert.equal(external.querySelectorAll("iframe").length, 0);
  assert.match(external.textContent, /Открыть отдельно/);
  demo.close();
  assert.equal(managed.querySelector("iframe").getAttribute("src"), "");
});

function createSyntheticV2ReleaseFixture({ itemCount, revision }) {
  const storageBaseUrl = "https://storage.example.test/storage/v1/object/public/web00-public-catalog";
  const chunks = [];
  const chunkDescriptors = [];
  const authoritativePopularSlugs = ["synthetic-popular-003", "synthetic-popular-002", "synthetic-popular-001"];
  for (let offset = 0; offset < itemCount; offset += 100) {
    const chunkNumber = Math.floor(offset / 100) + 1;
    const items = Array.from({ length: Math.min(100, itemCount - offset) }, (_unused, index) =>
      syntheticItem(offset + index + 1, revision)
    );
    const path = `public-catalog/v2/releases/revision-${revision}/chunks/chunk-${String(chunkNumber).padStart(6, "0")}.json`;
    const bytes = stableSerializeJson({
      items,
      itemsCount: items.length,
      revision,
      schemaVersion: 2
    });
    chunks.push({ bytes, items, path, sha256: sha256Hex(bytes) });
    chunkDescriptors.push({
      firstSlug: items[0].slug,
      itemsCount: items.length,
      lastSlug: items.at(-1).slug,
      path,
      sha256: sha256Hex(bytes)
    });
  }

  const index = {
    chunks: chunkDescriptors.map(({ firstSlug, itemsCount, lastSlug, path }) => ({ firstSlug, itemsCount, lastSlug, path })),
    itemsCount: itemCount,
    revision,
    schemaVersion: 2
  };
  const popular = {
    items: authoritativePopularSlugs.map((slug, index) => syntheticItem(index + 1, revision, slug)),
    popularOrder: authoritativePopularSlugs,
    revision,
    schemaVersion: 2
  };
  const categories = {
    categories: [{ slug: "synthetic-category", title: "Synthetic category" }],
    revision,
    schemaVersion: 2
  };
  const indexBytes = stableSerializeJson(index);
  const popularBytes = stableSerializeJson(popular);
  const categoriesBytes = stableSerializeJson(categories);
  const manifest = {
    artifacts: [
      { kind: "index", path: `public-catalog/v2/releases/revision-${revision}/index.json`, sha256: sha256Hex(indexBytes) },
      { kind: "popular", path: `public-catalog/v2/releases/revision-${revision}/popular.json`, sha256: sha256Hex(popularBytes) },
      { kind: "categories", path: `public-catalog/v2/releases/revision-${revision}/categories.json`, sha256: sha256Hex(categoriesBytes) },
      ...chunkDescriptors.map((chunk) => ({ kind: "chunk", path: chunk.path, sha256: chunk.sha256 }))
    ],
    chunks: chunkDescriptors,
    itemsCount: itemCount,
    revision,
    schemaVersion: 2
  };
  const manifestBytes = stableSerializeJson(manifest);
  const active = {
    manifestPath: `public-catalog/v2/releases/revision-${revision}/manifest.json`,
    manifestSha256: sha256Hex(manifestBytes),
    revision,
    schemaVersion: 2
  };
  const activeBytes = stableSerializeJson(active);
  const bodies = new Map([
    ["public-catalog/v2/active.json", activeBytes],
    [active.manifestPath, manifestBytes],
    [`public-catalog/v2/releases/revision-${revision}/index.json`, indexBytes],
    [`public-catalog/v2/releases/revision-${revision}/popular.json`, popularBytes],
    [`public-catalog/v2/releases/revision-${revision}/categories.json`, categoriesBytes],
    ...chunks.map((chunk) => [chunk.path, chunk.bytes])
  ]);
  const urls = [];
  let activeFetches = 0;
  let maxConcurrentFetches = 0;
  const prefetchedChunkPaths = [];

  return {
    active,
    authoritativePopularSlugs,
    chunks,
    fetch: async (url) => {
      urls.push(String(url));
      activeFetches += 1;
      maxConcurrentFetches = Math.max(maxConcurrentFetches, activeFetches);
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const path = storagePathFromUrl(url, storageBaseUrl);
        if (path.includes("chunk-000002")) {
          prefetchedChunkPaths.push(path);
        }
        const body = bodies.get(path);
        if (body === undefined) {
          return new Response("not found", { status: 404 });
        }
        return new Response(body, {
          headers: { "Content-Type": "application/json" },
          status: 200
        });
      } finally {
        activeFetches -= 1;
      }
    },
    get maxConcurrentFetches() {
      return maxConcurrentFetches;
    },
    get readRuntimeApiBase() {
      return urls.some((url) => String(url).includes("onrender.com") || String(url).includes("/api/"));
    },
    index,
    manifest,
    manifestSha256: active.manifestSha256,
    prefetchedChunkPaths,
    storageBaseUrl,
    urls
  };
}

function syntheticItem(ordinal, revision, slug = `synthetic-fixture-${String(ordinal).padStart(5, "0")}`) {
  return {
    category: { slug: "synthetic-category", title: "Synthetic category" },
    galleryImages: [],
    previewImage: {
      assetId: `preview-${slug}`,
      height: 900,
      sourceSha256: String(ordinal).padStart(64, "a").slice(0, 64),
      url: `https://cdn.example.test/revision-${revision}/${slug}.webp`,
      variants: [{ format: "webp", url: `https://cdn.example.test/revision-${revision}/${slug}.webp`, width: 1200 }],
      width: 1600
    },
    slug,
    title: `Synthetic fixture ${ordinal}`
  };
}

function stableSerializeJson(value) {
  return `${JSON.stringify(sortJson(value))}\n`;
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])])
    );
  }
  return value;
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

function storagePathFromUrl(url, storageBaseUrl) {
  const value = String(url);
  if (value.startsWith(storageBaseUrl)) {
    return value.slice(storageBaseUrl.length + 1);
  }
  return value.replace(/^\/+/, "");
}

function createCacheStorage() {
  const values = new Map();
  return {
    async match(key) {
      return values.get(key) ?? null;
    },
    async put(key, value) {
      values.set(String(key), value);
    }
  };
}

function createIndexedDb() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value) {
      values.set(key, value);
    }
  };
}

function createLocalStorageProbe() {
  const writes = [];
  return {
    containsFullCatalogPayload() {
      return writes.some(([_key, value]) => /"items"\s*:\s*\[[\s\S]{10000,}/.test(value));
    },
    getItem() {
      return null;
    },
    removeItem() {},
    setItem(key, value) {
      writes.push([String(key), String(value)]);
    }
  };
}

function createDomHarness() {
  const documentRef = {
    createElement(tagName) {
      return createElement(tagName);
    },
    createTextNode(text) {
      return { children: [], textContent: String(text) };
    }
  };
  return {
    container: createElement("div"),
    documentRef
  };
}

function createElement(tagName) {
  return {
    attributes: new Map(),
    checked: false,
    children: [],
    listeners: new Map(),
    tagName,
    append(...nodes) {
      this.children.push(...nodes.filter(Boolean));
    },
    addEventListener(type, listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    },
    dispatchEvent(event) {
      for (const listener of this.listeners.get(event.type) ?? []) {
        listener.call(this, event);
      }
    },
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      const matches = [];
      walk(this, (node) => {
        if (selector === "iframe" && node.tagName === "iframe") {
          matches.push(node);
        } else if (selector === "[data-catalog-card]" && node.attributes?.has("data-catalog-card")) {
          matches.push(node);
        }
      });
      return matches;
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    replaceChildren(...nodes) {
      this.children = nodes.filter(Boolean);
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    get textContent() {
      return this.children.map((child) => child.textContent ?? "").join("");
    },
    set textContent(value) {
      this.children = [{ children: [], textContent: String(value) }];
    }
  };
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}
