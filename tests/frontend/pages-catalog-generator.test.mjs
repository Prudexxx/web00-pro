import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch, jsonResponse } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const CARD_ROOT = "catalog/cards";

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadGenerator() {
  try {
    return await import(`../../scripts/build-pages-catalog.mjs?test=${Date.now()}-${Math.random()}`);
  } catch (error) {
    assert.fail(`scripts/build-pages-catalog.mjs should export the Pages catalog generator: ${error.message}`);
  }
}

function evaluateDataJs(source) {
  const window = {};
  const context = vm.createContext({ window });
  window.window = window;
  window.self = window;
  window.globalThis = window;
  vm.runInContext(source, context, { filename: "assets/js/data.js" });
  return window.WEB00_DATA;
}

async function normalizeStaticData(data) {
  const browser = createFakeBrowser({ page: "solutions" });
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = data;
  await loadClassicScript("assets/js/catalog-api.js", browser);
  return plain(browser.window.WEB00_CATALOG.getStaticCatalog().items);
}

async function buildGeneratedStaticCatalog(cardsDir = CARD_ROOT) {
  const { buildPagesCatalog } = await loadGenerator();
  const first = await buildPagesCatalog({ cardsDir });
  const second = await buildPagesCatalog({ cardsDir });
  assert.equal(first.dataJs, second.dataJs, "same card inputs must generate identical bytes");
  return {
    generated: first,
    normalized: await normalizeStaticData(evaluateDataJs(first.dataJs)),
  };
}

async function createTempCardsDir() {
  const dir = await mkdtemp(join(tmpdir(), "web00-pages-catalog-"));
  const cardsDir = join(dir, "cards");
  try {
    await readdir(CARD_ROOT);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    assert.fail(`catalog/cards should contain canonical card JSON before file-contract tests run: ${error.message}`);
  }
  await cp(CARD_ROOT, cardsDir, { recursive: true });
  return { dir, cardsDir };
}

async function readCard(cardsDir, id) {
  return JSON.parse(await readFile(join(cardsDir, `${id}.json`), "utf8"));
}

async function readCanonicalCards(cardsDir = CARD_ROOT) {
  const files = (await readdir(cardsDir)).filter((file) => file.endsWith(".json")).sort();
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(join(cardsDir, file), "utf8"))));
}

function sortedIds(cards) {
  return cards.map((card) => card.id).sort();
}

function assertContainsEachCanonicalCardOnce(actualCards, canonicalCards, label) {
  const actualIds = sortedIds(actualCards);
  const expectedIds = sortedIds(canonicalCards);

  assert.deepEqual(actualIds, expectedIds, `${label} should include every canonical card exactly once`);
  assert.equal(new Set(actualIds).size, actualIds.length, `${label} should not duplicate card ids`);
}

async function writeCard(cardsDir, card) {
  await writeFile(join(cardsDir, `${card.id}.json`), `${JSON.stringify(card, null, 2)}\n`, "utf8");
}

test("LEGACY GENERATOR SELF-CONSISTENCY: canonical JSON deterministically normalizes each legacy card once", async () => {
  const canonicalCards = await readCanonicalCards();
  const { generated, normalized } = await buildGeneratedStaticCatalog();

  assert.equal(generated.cards.length, canonicalCards.length);
  assert.equal(normalized.length, canonicalCards.length);
  assertContainsEachCanonicalCardOnce(generated.cards, canonicalCards, "generated catalog");
  assertContainsEachCanonicalCardOnce(normalized, canonicalCards, "normalized catalog");
  assert.equal(new Set(generated.cards.map((item) => item.id)).size, canonicalCards.length);
  assert.equal(new Set(normalized.map((item) => item.id)).size, canonicalCards.length);
  assert.deepEqual(normalized.map((item) => item.aliases), normalized.map((item) => [item.slug]));
  for (const item of normalized) {
    assert.equal(typeof item.previewImage?.url, "string", `${item.id} should expose a normalized preview image URL`);
    assert.equal(item.previewImage.url, item.previewImageUrl, `${item.id} preview URL aliases should agree`);
    assert.ok(Array.isArray(item.previewImage.variants), `${item.id} preview variants should be normalized`);
    assert.ok(Array.isArray(item.galleryImages), `${item.id} gallery should be normalized`);
    for (const image of item.galleryImages) {
      assert.equal(typeof image.url, "string", `${item.id} gallery image should expose a normalized URL`);
      assert.ok(Array.isArray(image.variants), `${item.id} gallery variants should be normalized`);
    }
  }
  assert.deepEqual(
    generated.cards.filter((item) => item.id === "web00-smoke-create").map((item) => ({
      active: item.active,
      title: item.title,
    })),
    [{ active: true, title: "WEB00 Smoke Updated" }]
  );
  assert.deepEqual(
    normalized.filter((item) => item.id === "web00-smoke-create").map((item) => item.title),
    ["WEB00 Smoke Updated"]
  );
});

test("DISASTER FALLBACK SAFETY: committed data.js remains parseable static fallback without retired atomic canary", async () => {
  const committedData = evaluateDataJs(await readFile("assets/js/data.js", "utf8"));
  assert.ok(Array.isArray(committedData.SOLUTIONS), "committed WEB00_DATA.SOLUTIONS should remain an array");

  const committed = await normalizeStaticData(committedData);
  const slugs = committed.map((item) => item.slug);

  assert.equal(new Set(slugs).size, slugs.length, "committed static fallback should not contain duplicate slugs");
  assert.equal(committed.some((item) => item.id === "web00-atomic-create-pass" || item.slug === "web00-atomic-create-pass"), false);
});

test("API FAILURE FAIL-SAFE: Render API failure keeps the static catalog visible", async () => {
  const browser = createFakeBrowser({ page: "solutions" });
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = {
    SOLUTIONS: [{
      id: "static-site",
      title: "Static Site",
      active: true,
      previewImage: "assets/img/previews/static-site.png",
    }],
  };
  browser.window.WEB00_CONFIG = Object.freeze({
    apiBaseUrl: "https://web00-backend-production.onrender.com",
    requestTimeoutMs: 8000,
    staticFallbackEnabled: true,
  });
  browser.window.fetch = createFakeFetch(() => jsonResponse({ error: "down" }, { status: 503 }));
  await loadClassicScript("assets/js/catalog-api.js", browser);

  const result = await browser.window.WEB00_CATALOG.resolveCatalogForPage({ kind: "solutions" });

  assert.equal(result.source, "static");
  assert.equal(result.lifecycle, "ready");
  assert.equal(result.staticFallbackActive, true);
  assert.equal(result.apiAvailable, false);
  assert.deepEqual(plain(result.items.map((item) => item.slug)), ["static-site"]);
});

test("CREATE / UPDATE / DELETE: card JSON changes rebuild the full catalog without duplicates", async () => {
  const { dir, cardsDir } = await createTempCardsDir();
  try {
    const { buildPagesCatalog } = await loadGenerator();
    const created = {
      ...(await readCard(cardsDir, "site-custom")),
      id: "z-phase-one-created",
      slug: "z-phase-one-public",
      title: "Synthetic Phase One Created",
      legacyTitle: "Synthetic Phase One Created",
      previewImage: "https://storage.example.com/object/public/web00-public-catalog/created-preview.png",
      galleryImages: [
        "https://storage.example.com/object/public/web00-public-catalog/created-gallery-a.png",
        "https://storage.example.com/object/public/web00-public-catalog/created-gallery-b.png",
      ],
    };
    await writeCard(cardsDir, created);

    const updated = {
      ...(await readCard(cardsDir, "mebel")),
      title: "Updated Furniture Catalog",
      description: "Updated file contract description.",
    };
    await writeCard(cardsDir, updated);

    await rm(join(cardsDir, "drova.json"));

    const { cards, dataJs } = await buildPagesCatalog({ cardsDir });
    const normalized = await normalizeStaticData(evaluateDataJs(dataJs));
    const canonicalCards = await readCanonicalCards(cardsDir);
    const ids = cards.map((card) => card.id);

    assert.equal(cards.length, canonicalCards.length);
    assertContainsEachCanonicalCardOnce(cards, canonicalCards, "mutated generated catalog");
    assertContainsEachCanonicalCardOnce(normalized, canonicalCards, "mutated normalized catalog");
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.includes("z-phase-one-created"), true);
    assert.equal(ids.includes("drova"), false);
    assert.equal(normalized.find((item) => item.slug === "mebel")?.title, "Updated Furniture Catalog");
    assert.equal(normalized.find((item) => item.id === "z-phase-one-created")?.slug, "z-phase-one-public");
    assert.equal(normalized.find((item) => item.slug === "z-phase-one-public")?.galleryImages.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MEDIA ORDER AND SAFETY: preview/gallery order is preserved and unsafe URLs are rejected", async () => {
  const { dir, cardsDir } = await createTempCardsDir();
  try {
    const { buildPagesCatalog } = await loadGenerator();
    const card = {
      ...(await readCard(cardsDir, "site-custom")),
      id: "media-order",
      slug: "media-order",
      title: "Media Order",
      previewImage: "https://storage.example.com/object/public/web00-public-catalog/preview.png",
      galleryImages: [
        "https://storage.example.com/object/public/web00-public-catalog/gallery-a.png",
        "https://storage.example.com/object/public/web00-public-catalog/gallery-b.png",
        "https://storage.example.com/object/public/web00-public-catalog/gallery-c.png",
      ],
    };
    await rm(cardsDir, { recursive: true, force: true });
    await mkdir(cardsDir, { recursive: true });
    await writeCard(cardsDir, card);

    const { dataJs } = await buildPagesCatalog({ cardsDir });
    const [item] = await normalizeStaticData(evaluateDataJs(dataJs));

    assert.equal(item.previewImage.url, "https://storage.example.com/object/public/web00-public-catalog/preview.png");
    assert.deepEqual(plain(item.galleryImages.map((image) => image.url)), [
      "https://storage.example.com/object/public/web00-public-catalog/gallery-a.png",
      "https://storage.example.com/object/public/web00-public-catalog/gallery-b.png",
      "https://storage.example.com/object/public/web00-public-catalog/gallery-c.png",
    ]);

    for (const unsafeUrl of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "https://user:pass@storage.example.com/object/public/web00-public-catalog/secret.png",
      "https://storage.web00.invalid/object/public/web00-public-catalog/fake.png",
      "https://storage.web00.invalid./object/public/web00-public-catalog/fake.png",
      "https://storage.example.com/object/public/web00-public-catalog/%2e%2e/private.png",
      "../private.png",
      "assets/img/../private.png",
    ]) {
      await writeCard(cardsDir, { ...card, previewImage: unsafeUrl });
      await assert.rejects(() => buildPagesCatalog({ cardsDir }), /Invalid catalog card URL/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
