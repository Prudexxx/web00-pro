import test from "node:test";
import assert from "node:assert/strict";

import { createFakeBrowser } from "./helpers/fake-browser.mjs";
import { createFakeFetch, jsonResponse } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function classList() {
  return { add: () => undefined, remove: () => undefined, toggle: () => undefined };
}

function createSolutionsPage(fetch, options = {}) {
  const browser = createFakeBrowser({ page: "solutions" });
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
  let gridHtml = "";
  const grid = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    get innerHTML() {
      return gridHtml;
    },
    set innerHTML(value) {
      gridHtml = String(value);
      history.push(gridHtml);
    },
  };
  browser.window.fetch = fetch;
  browser.window.addEventListener = () => undefined;
  browser.window.navigator = {};
  browser.window.localStorage = options.storage || { getItem: () => null, setItem: () => undefined };
  browser.document.body.classList = classList();
  browser.document.documentElement = { classList: classList() };
  browser.document.querySelector = (selector) => {
    if (selector === "[data-solutions-grid]") return grid;
    if (selector === "[data-lead-modal-content]") return leadContent;
    if (selector === "[data-modal=\"lead\"]") return leadModal;
    return statusNodes[selector] || null;
  };
  browser.document.querySelectorAll = () => [];
  browser.window.WEB00_DATA = options.data || {
    SOLUTIONS: [{ id: "static-site", title: "Static site", active: true }],
    SERVICES: [],
    PRICING: [],
  };
  browser.window.WEB00_TEST_MODE = true;
  return { browser, grid, history, leadContent, statusNodes };
}

async function bootSolutionsPage(fetch, options = {}) {
  const page = createSolutionsPage(fetch, options);
  const { browser } = page;
  await loadClassicScript("assets/js/runtime-config.js", browser);
  browser.window.WEB00_CONFIG = Object.freeze(options.config || {
    apiBaseUrl: "https://api.example.test",
    requestTimeoutMs: 1000,
    staticFallbackEnabled: true,
  });
  await loadClassicScript("assets/js/catalog-api.js", browser);
  await loadClassicScript("assets/js/main.js", browser);
  const [onReady] = browser.listeners.get("DOMContentLoaded");
  await onReady();
  return page;
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

test("static cards remain visible while the initial API request is loading", async () => {
  const pending = createDeferred();
  const { grid, history, statusNodes } = await bootSolutionsPage(createFakeFetch(() => pending.promise));

  assert.match(history.at(-1), /Static site/);
  assert.equal(statusNodes["[data-catalog-loading]"].hidden, false);
  assert.match(grid.innerHTML, /Static site/);

  pending.resolve(apiSuccess("site-custom"));
  await delay(20);
});

test("last-known-good cards paint before a sleeping API responds when static catalog is empty", async () => {
  const pending = createDeferred();
  const storage = {
    getItem() {
      return JSON.stringify({
        schemaVersion: 1,
        savedAt: "2026-08-03T00:00:00.000Z",
        items: [{ slug: "site-lkg", title: "LKG site", category: "Goods", categorySlug: "goods" }],
      });
    },
    setItem: () => undefined,
  };
  const { history, statusNodes } = await bootSolutionsPage(createFakeFetch(() => pending.promise), {
    storage,
    data: { SOLUTIONS: [], SERVICES: [], PRICING: [] },
  });

  assert.match(history.at(-1), /LKG site/);
  assert.equal(statusNodes["[data-catalog-loading]"].hidden, false);

  pending.resolve(apiSuccess("site-custom"));
  await delay(20);
});

test("catalog API title cannot escape the rendered lead-form textarea", async () => {
  const payload = "</textarea><img src=x onerror=alert(1)>";
  const { browser, leadContent } = await bootSolutionsPage(createFakeFetch(() => jsonResponse({
    data: [{ slug: "xss-site", title: payload, category: { slug: "goods", title: "Goods" } }],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  })));
  await delay(20);
  const clickHandler = browser.listeners.get("click")[0];

  clickHandler({
    preventDefault: () => undefined,
    target: {
      closest(selector) {
        return selector === "[data-open-lead]" ? { dataset: { solutionId: "xss-site" } } : null;
      },
    },
  });

  assert.doesNotMatch(leadContent.html, /<\/textarea><img src=x onerror=alert\(1\)>/);
  assert.match(leadContent.html, /&lt;\/textarea&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
});
