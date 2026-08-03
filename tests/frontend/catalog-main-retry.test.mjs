import test from "node:test";
import assert from "node:assert/strict";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch, jsonResponse } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createSolutionsPage(fetch) {
  const browser = createFakeBrowser({ page: "solutions" });
  const history = [];
  const grid = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    set innerHTML(value) {
      history.push(String(value));
    },
  };
  browser.window.fetch = fetch;
  browser.window.addEventListener = () => undefined;
  browser.window.navigator = {};
  browser.window.localStorage = { getItem: () => null, setItem: () => undefined };
  browser.document.body.classList = { toggle: () => undefined };
  browser.document.documentElement = { classList: { toggle: () => undefined } };
  browser.document.querySelector = (selector) => selector === "[data-solutions-grid]" ? grid : null;
  browser.document.querySelectorAll = () => [];
  browser.window.WEB00_DATA = {
    SOLUTIONS: [{ id: "static-site", title: "Static site", active: true }],
    SERVICES: [],
    PRICING: [],
  };
  browser.window.WEB00_TEST_MODE = true;
  return { browser, history };
}

async function bootSolutionsPage(fetch) {
  const { browser, history } = createSolutionsPage(fetch);
  await loadClassicScript("assets/js/runtime-config.js", browser);
  browser.window.WEB00_CONFIG = Object.freeze({
    apiBaseUrl: "https://api.example.test",
    requestTimeoutMs: 1000,
    staticFallbackEnabled: true,
  });
  await loadClassicScript("assets/js/catalog-api.js", browser);
  await loadClassicScript("assets/js/main.js", browser);
  const [onReady] = browser.listeners.get("DOMContentLoaded");
  await onReady();
  return { browser, history };
}

function apiSuccess(slug) {
  return jsonResponse({
    data: [{ slug, title: "Site Custom", category: { slug: "goods", title: "Goods" } }],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  });
}

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
