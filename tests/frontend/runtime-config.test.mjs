import test from "node:test";
import assert from "node:assert/strict";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

test("runtime config exposes frozen live public API defaults", async () => {
  const browser = createFakeBrowser();

  await loadClassicScript("assets/js/runtime-config.js", browser);

  assert.deepEqual(JSON.parse(JSON.stringify(browser.window.WEB00_CONFIG)), {
    apiBaseUrl: "https://web00-backend-production.onrender.com",
    catalogManifestUrl: "https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json",
    catalogRuntimeMode: "cloud-primary",
    requestTimeoutMs: 8000,
    staticFallbackEnabled: true,
  });
  assert.equal(Object.isFrozen(browser.window.WEB00_CONFIG), true);
});

test("runtime config does not expose secret-like keys", async () => {
  const browser = createFakeBrowser();

  await loadClassicScript("assets/js/runtime-config.js", browser);

  const configKeys = Object.keys(browser.window.WEB00_CONFIG);
  assert.deepEqual(configKeys, [
    "apiBaseUrl",
    "catalogManifestUrl",
    "catalogRuntimeMode",
    "requestTimeoutMs",
    "staticFallbackEnabled",
  ]);
  assert.equal(configKeys.some((key) => /token|secret|key|password|cookie/i.test(key)), false);
});
