import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const CARD_ROOT = "catalog/cards";

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
  return JSON.parse(JSON.stringify(browser.window.WEB00_CATALOG.getStaticCatalog().items));
}

test("catalog PR validation accepts current mutable card JSON and generated data.js without frozen count or pre-phase hash", async () => {
  const { buildPagesCatalog } = await loadGenerator();
  const cardFiles = (await readdir(CARD_ROOT)).filter((name) => name.endsWith(".json")).sort();
  const expectedIds = [];

  for (const file of cardFiles) {
    const card = JSON.parse(await readFile(join(CARD_ROOT, file), "utf8"));
    expectedIds.push(card.id);
  }

  const first = await buildPagesCatalog();
  const second = await buildPagesCatalog();
  const normalized = await normalizeStaticData(evaluateDataJs(first.dataJs));
  const generatedIds = first.cards.map((card) => card.id);
  const normalizedIds = normalized.map((card) => card.id);

  assert.equal(first.dataJs, second.dataJs);
  assert.deepEqual([...generatedIds].sort(), expectedIds);
  assert.deepEqual([...normalizedIds].sort(), expectedIds);
  assert.deepEqual(normalizedIds, generatedIds);
  assert.equal(new Set(generatedIds).size, generatedIds.length);
});
