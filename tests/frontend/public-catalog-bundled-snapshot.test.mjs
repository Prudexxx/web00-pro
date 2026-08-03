import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

const execFileAsync = promisify(execFile);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadBundledSnapshot() {
  const browser = createFakeBrowser({ page: "solutions" });

  await loadClassicScript("assets/js/public-catalog-bundled-snapshot.js", browser);

  return browser.window.WEB00_PUBLIC_CATALOG_BUNDLED_SNAPSHOT;
}

test("bundled published snapshot contains revision 1 with 16 public cards", async () => {
  const snapshot = await loadBundledSnapshot();

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.revision, 1);
  assert.equal(snapshot.itemsCount, 16);
  assert.equal(snapshot.items.length, 16);
  assert.equal(snapshot.settings.showDemoInModal, false);
  assert.equal(snapshot.items.some((item) => item.slug === "site-custom"), true);
  assert.equal(
    snapshot.items.some((item) => item.slug === "dom-dlya-busi" && item.title === "Дом для Буси"),
    true
  );
});

test("bundled published snapshot carries a separate authoritative popular trio", async () => {
  const snapshot = await loadBundledSnapshot();

  assert.deepEqual(plain(snapshot.popular.map((item) => item.slug)), [
    "mebel",
    "medicina",
    "doma-bani",
  ]);
  assert.equal(snapshot.popular.length, 3);
  assert.equal(snapshot.popular.every((item) => snapshot.items.some((catalogItem) => catalogItem.slug === item.slug)), true);
});

test("bundled published snapshot omits private legacy/provider fields", async () => {
  const snapshot = await loadBundledSnapshot();
  const serialized = JSON.stringify(snapshot);

  for (const forbidden of [
    "active",
    "editableTitle",
    "demoLocalUrl",
    "externalDemoUrl",
    "fullDescription",
    "legacyTitle",
    "originalDemoUrl",
    "sourceCommit",
    "sourceRepository",
    "sourceSha256",
    "storagePath",
    "views",
  ]) {
    assert.equal(serialized.includes(`"${forbidden}"`), false, forbidden);
  }
});

test("bundled snapshot generator check is deterministic", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    "scripts/build-public-catalog-bundled-snapshot.mjs",
    "--check",
  ]);

  assert.equal(stderr, "");
  assert.match(stdout, /bundled public catalog snapshot: PASS revision=1 items=16 popular=3/);
});
