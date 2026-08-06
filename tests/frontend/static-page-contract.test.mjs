import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const ROOT_MAIN_PAGES = [
  "app.html",
  "brief.html",
  "cabinet.html",
  "cases.html",
  "consent-personal-data.html",
  "contacts.html",
  "faq.html",
  "how-it-works.html",
  "index.html",
  "install.html",
  "pricing.html",
  "privacy-policy.html",
  "services.html",
  "solutions.html",
  "status.html",
];

test("main.js consumes WEB00_CATALOG through narrow catalog seams", async () => {
  const source = await readFile("assets/js/main.js", "utf8");

  assert.match(source, /const CATALOG = window\.WEB00_CATALOG \|\| null;/);
  assert.match(source, /let catalogState = null;/);
  assert.match(source, /async function initCatalogState\(\)/);
  assert.match(source, /function catalogItems\(\)/);
  assert.match(source, /function catalogItemById\(/);
  assert.match(source, /const found = CATALOG\.findCatalogItem\(\[\.\.\.popularItems, \.\.\.catalogItems\(\)\], value\);/);
  assert.match(source, /if \(found\) return found;/);
  assert.match(source, /CATALOG\.resolveCatalogForPage\(\{ kind: "solutions" \}\)/);
});

test("solutions.html provides stable B8 catalog state nodes", async () => {
  const html = await readFile("solutions.html", "utf8");

  assert.match(html, /data-catalog-loading/);
  assert.match(html, /data-catalog-fallback/);
  assert.match(html, /Показаны сохранённые данные\. Обновление временно недоступно\./);
  assert.match(html, /data-catalog-retry/);
  assert.match(html, /Повторить загрузку/);
  assert.match(html, /data-catalog-empty/);
  assert.match(html, /data-catalog-fatal/);
  assert.match(html, /data-solutions-grid/);
  assert.match(html, /data-solution-modal-content/);
  assert.match(html, /data-demo-modal-content/);
});

test("main.js replaces homepage popular cards only from successful API popular state", async () => {
  const source = await readFile("assets/js/main.js", "utf8");

  assert.match(source, /async function initPopularCatalogState\(\)/);
  assert.match(source, /function renderPopularSolutions\(\)/);
  assert.match(source, /CATALOG\.resolveCatalogForPage\(\{ kind: "popular", limit: 3 \}\)/);
  assert.match(source, /popularCatalogState\.source === "api"/);
  assert.match(source, /popularCatalogState\.lifecycle === "ready"/);
});

test("index.html keeps hardcoded popular grid as initial fallback content", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(html, /id="popular-templates"/);
  assert.match(html, /class="mock-card-grid"/);
  assert.match(html, /data-open-demo-id="mebel"/);
});

test("brief and modal integration use normalized catalog lookup and gallery indexes", async () => {
  const source = await readFile("assets/js/main.js", "utf8");

  assert.match(source, /async function initBriefCatalogState\(\)/);
  assert.match(source, /await initBriefCatalogState\(\);/);
  assert.match(source, /solutionByIdStrict\(params\.get\("solution"\) \|\| draft\.solutionId\)/);
  assert.match(source, /renderGalleryMainImage\(activeImage, solution\.title\)/);
  assert.match(source, /data-gallery-index="\$\{index\}"/);
  assert.match(source, /function renderGalleryMainImage\(/);
  assert.match(source, /stage\.innerHTML = renderGalleryMainImage\(image, solution\.title\);/);
  assert.doesNotMatch(source, /data-gallery-image="\$\{attr\(image\)\}"/);
});

test("root pages use canonical B8 deferred script order", async () => {
  const expected = [
    "assets/js/data.js?v=b8-live-1",
    "assets/js/runtime-config.js?v=b8-live-1",
    "assets/js/catalog-api.js?v=b8-live-1",
    "assets/js/main.js?v=b8-live-1",
  ];

  for (const page of ROOT_MAIN_PAGES) {
    const html = await readFile(page, "utf8");
    const scripts = [...html.matchAll(/<script\s+defer\s+src="([^"]+)"><\/script>/g)].map((match) => match[1]);
    const b8Start = scripts.findIndex((src) => src.startsWith("assets/js/data.js"));
    assert.notEqual(b8Start, -1, `${page} should load data.js`);
    assert.deepEqual(scripts.slice(b8Start, b8Start + 4), expected, `${page} script order`);
    assert.equal(scripts.filter((src) => expected.includes(src)).length, 4, `${page} should not duplicate B8 scripts`);
    assert.doesNotMatch(html, /<script\s+async/i, `${page} should not async public scripts`);
    assert.doesNotMatch(html, /<base\s/i, `${page} should not use base href`);
  }
});

test("frontend B8 uses one canonical live API config and avoids production secrets", async () => {
  await assert.rejects(() => access("package.json"));
  await assert.rejects(() => access("package-lock.json"));

  const runtimeConfig = await readFile("assets/js/runtime-config.js", "utf8");
  const catalogApi = await readFile("assets/js/catalog-api.js", "utf8");
  const main = await readFile("assets/js/main.js", "utf8");
  const sw = await readFile("sw.js", "utf8");
  const combined = [runtimeConfig, catalogApi, main, sw].join("\n");

  assert.match(runtimeConfig, /apiBaseUrl: "https:\/\/web00-backend-production\.onrender\.com"/);
  assert.equal((combined.match(/https:\/\/web00-backend-production\.onrender\.com/g) || []).length, 1);
  assert.doesNotMatch(combined, /https:\/\/api\.|Authorization|credentials:\s*"include"|document\.cookie|\.env|TODO|TBD/i);
  assert.doesNotMatch(catalogApi, /localStorage|sessionStorage|document\.querySelector/);
  assert.doesNotMatch(main, /target="_blank" rel="noopener"(?! noreferrer)/);
});

test("public pages expose no forbidden bug-report controls, modal targets, or dead handlers", async () => {
  const main = await readFile("assets/js/main.js", "utf8");

  assert.doesNotMatch(main, /data-open-bug/);
  assert.doesNotMatch(main, /bugAttachment|openBugModal|renderBugForm|submitBugReport|bindBugErrorCleanup/);
  assert.doesNotMatch(main, /createBugReport|createErrorReport/);
  assert.doesNotMatch(main, /Сообщить об ошибке|Описать проблему|Попробовать ещё раз/);

  for (const page of ROOT_MAIN_PAGES) {
    const html = await readFile(page, "utf8");
    assert.doesNotMatch(html, /data-open-bug|data-modal="bug"|data-bug-modal-content/, `${page} should not expose bug-report UI`);
    assert.doesNotMatch(html, /Сообщить об ошибке|Описать проблему/, `${page} should not expose bug-report copy`);
  }
});

test("main.js ignores non-applyable stale catalog results", async () => {
  const source = await readFile("assets/js/main.js", "utf8");

  assert.match(source, /CATALOG\.resolveCatalogForPage\(\{ kind: "solutions" \}\)\.then\(\(nextCatalogState\) => \{/);
  assert.match(source, /applyCatalogState\(nextCatalogState\)/);
  assert.match(source, /CATALOG\.resolveCatalogForPage\(\{ kind: "popular", limit: 3 \}\)\.then\(\(nextPopularCatalogState\) => \{/);
  assert.match(source, /if \(nextPopularCatalogState\) popularCatalogState = nextPopularCatalogState;/);
});

test("main.js applies catalog API states through the catalog seam", async () => {
  const source = await readFile("assets/js/main.js", "utf8");

  assert.match(source, /function applyCatalogState\(nextCatalogState\)/);
  assert.match(source, /if \(!nextCatalogState\) return false;/);
  assert.match(source, /catalogState = nextCatalogState;/);
  assert.match(source, /renderSolutions\(\);/);
});

test("B8 CSS supports catalog status and homepage API empty state without new global cards", async () => {
  const catalogCss = await readFile("assets/css/catalog-premium.css", "utf8");
  const homeCss = await readFile("assets/css/home.css", "utf8");

  assert.match(catalogCss, /body\[data-page="solutions"\] \.catalog-state/);
  assert.match(catalogCss, /\.catalog-state\[hidden\]/);
  assert.match(homeCss, /\.mock-template-card--empty/);
});
