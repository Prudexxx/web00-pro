import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch, jsonResponse } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const CARD_ROOT = "catalog/cards";
const PRE_PHASE_NORMALIZED_DTO_SHA256 = "566422e96156ddcd526ad95ff08921f864ba26792fbe147ea90c1bf3d7663b07";

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

async function writeCard(cardsDir, card) {
  await writeFile(join(cardsDir, `${card.id}.json`), `${JSON.stringify(card, null, 2)}\n`, "utf8");
}

test("FIFTEEN-CARD PARITY: canonical JSON generates the same normalized public DTO as data.js", async () => {
  const committedData = evaluateDataJs(await readFile("assets/js/data.js", "utf8"));
  const committed = await normalizeStaticData(committedData);
  const { generated, normalized } = await buildGeneratedStaticCatalog();

  assert.equal(generated.cards.length, 15);
  assert.equal(normalized.length, 15);
  assert.deepEqual(normalized, committed);
  assert.deepEqual(normalized.map((item) => item.previewImage?.url || item.previewImageUrl), committed.map((item) => item.previewImage?.url || item.previewImageUrl));
  assert.deepEqual(
    normalized.map((item) => item.galleryImages.map((image) => image.url)),
    committed.map((item) => item.galleryImages.map((image) => image.url))
  );
  assert.equal(normalized.some((item) => item.demoUrl !== committed.find((expected) => expected.slug === item.slug)?.demoUrl), false);
  assert.deepEqual(normalized.map((item) => item.aliases), normalized.map((item) => [item.slug]));
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex"), PRE_PHASE_NORMALIZED_DTO_SHA256);
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
    const ids = cards.map((card) => card.id);

    assert.equal(cards.length, 15);
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
