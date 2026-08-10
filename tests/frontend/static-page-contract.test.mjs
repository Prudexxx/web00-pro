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

const CLOUD_PRECONNECT_PAGES = ["index.html", "solutions.html", "brief.html"];

const CATALOG_V2_SCRIPTS = [
  "assets/js/runtime-config.js?v=zero-stale-catalog-v1",
  "assets/js/catalog-v2/catalog-runtime.js?v=zero-stale-catalog-v1",
  "assets/js/data.js?v=zero-stale-catalog-v1",
  "assets/js/catalog-v2/catalog-api.js?v=zero-stale-catalog-v1",
  "assets/js/catalog-v2/main.js?v=zero-stale-catalog-v1",
];

function deferredScriptSources(html) {
  return [...html.matchAll(/<script\s+defer\s+src="([^"]+)"><\/script>/g)].map((match) => match[1]);
}

function popularGridMarkup(html) {
  const start = html.indexOf('<div class="mock-card-grid">', html.indexOf('id="popular-templates"'));
  assert.notEqual(start, -1, "index.html should expose a popular grid");
  const end = html.indexOf("</div>\n      </section>", start);
  assert.notEqual(end, -1, "index.html should close the popular grid section");
  return html.slice(start, end);
}

test("main.js consumes WEB00_CATALOG through narrow catalog seams", async () => {
  const source = await readFile("assets/js/main.js", "utf8");

  assert.match(source, /const CATALOG = window\.WEB00_CATALOG \|\| null;/);
  assert.match(source, /let catalogState = null;/);
  assert.match(source, /async function initCatalogState\(\)/);
  assert.match(source, /function catalogItems\(\)/);
  assert.match(source, /function catalogItemById\(/);
  assert.match(source, /const found = CATALOG\.findCatalogItem\(\[\.\.\.popularItems, \.\.\.catalogItems\(\)\], value\);/);
  assert.match(source, /if \(found\) return found;/);
  assert.match(source, /CATALOG\.resolveCatalogForPage\(\{ kind: "solutions", currentState: catalogState \}\)/);
});

test("catalog-v2 main entrypoint exists for the solutions atomic cutover", async () => {
  await access("assets/js/catalog-v2/main.js");
});

test("catalog-v2 main uses explicit atomic catalog render identity without a production debug seam", async () => {
  const source = await readFile("assets/js/catalog-v2/main.js", "utf8");

  assert.match(source, /function isCloudPrimaryCatalog\(\)/);
  assert.match(source, /let lastRenderedCatalogKey = null;/);
  assert.match(source, /function canRenderCatalogState\(/);
  assert.match(source, /function catalogRenderKey\(/);
  assert.match(source, /function renderCatalogSkeleton\(/);
  assert.match(source, /function clearSolutionsGrid\(/);
  assert.match(source, /function shouldRetryCatalogState\(/);
  assert.match(source, /if \(nextKey && nextKey === lastRenderedCatalogKey\)/);
  assert.doesNotMatch(source, /WEB00_CATALOG_MAIN_TESTS|WEB00_CATALOG_V2_MAIN_TESTS|__WEB00/);
});

test("solutions.html provides stable B9 catalog state nodes", async () => {
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

test("catalog-v2 main renders homepage popular cards only from accepted catalog states", async () => {
  const source = await readFile("assets/js/catalog-v2/main.js", "utf8");
  const popularBlock = source.slice(source.indexOf("function renderPopularSolutions()"), source.indexOf("function renderServices()"));

  assert.match(source, /async function initPopularCatalogState\(\)/);
  assert.match(source, /function renderPopularSkeleton\(\)/);
  assert.match(source, /function renderPopularSolutions\(\)/);
  assert.match(source, /CATALOG\.getInitialCatalog\(\{ limit: 3 \}\)/);
  assert.match(source, /CATALOG\.resolveCatalogForPage\(\{ kind: "popular", limit: 3, currentState: popularCatalogState \}\)/);
  assert.match(source, /canRenderCatalogState\(nextPopularCatalogState\)/);
  assert.match(popularBlock, /canRenderCatalogState\(popularCatalogState\)/);
  assert.match(popularBlock, /popularCatalogState\.items\.slice\(0, 3\)/);
  assert.doesNotMatch(popularBlock, /DATA\.SOLUTIONS|solutions\(\)/);
});

test("index.html first paint contains three literal non-interactive popular skeleton cards", async () => {
  const html = await readFile("index.html", "utf8");
  const grid = popularGridMarkup(html);
  const skeletons = grid.match(/<article\b[^>]*data-popular-skeleton\b[\s\S]*?<\/article>/g) || [];

  assert.match(html, /id="popular-templates"/);
  assert.equal(skeletons.length, 3);
  skeletons.forEach((block) => {
    assert.match(block, /class="mock-template-card mock-template-card--skeleton"/);
    assert.match(block, /aria-hidden="true"/);
    assert.match(block, /class="mock-card-body"/);
    assert.match(block, /catalog-skeleton__line--title/);
    assert.match(block, /catalog-skeleton__line--text/);
    assert.doesNotMatch(block, /data-open-demo-id|<button\b|<a\b|tabindex=/i);
  });
  assert.doesNotMatch(grid, /data-open-demo-id="mebel"|Мебельный магазин/);
});

test("brief and modal integration use normalized catalog lookup and gallery indexes", async () => {
  const source = await readFile("assets/js/catalog-v2/main.js", "utf8");

  assert.match(source, /async function resolveBriefCatalogReady\(\)/);
  assert.match(source, /await resolveBriefCatalogReady\(\);/);
  assert.match(source, /solutionByIdStrict\(params\.get\("solution"\) \|\| draft\.solutionId\)/);
  assert.ok(
    source.indexOf("await resolveBriefCatalogReady();") < source.indexOf("initBriefPage();"),
    "brief catalog resolution must run before selected-solution rendering",
  );
  assert.match(source, /renderGalleryMainImage\(activeImage, solution\.title\)/);
  assert.match(source, /data-gallery-index="\$\{index\}"/);
  assert.match(source, /function renderGalleryMainImage\(/);
  assert.match(source, /stage\.innerHTML = renderGalleryMainImage\(image, solution\.title\);/);
  assert.doesNotMatch(source, /data-gallery-image="\$\{attr\(image\)\}"/);
});

test("all root pages use the catalog-v2 zero-stale deferred script order only", async () => {
  for (const page of ROOT_MAIN_PAGES) {
    const html = await readFile(page, "utf8");
    const scripts = deferredScriptSources(html);
    const start = scripts.indexOf(CATALOG_V2_SCRIPTS[0]);

    assert.notEqual(start, -1, `${page} should load runtime-config first for the v2 cutover`);
    assert.deepEqual(scripts.slice(start, start + CATALOG_V2_SCRIPTS.length), CATALOG_V2_SCRIPTS, `${page} script order`);
    assert.equal(scripts.filter((src) => CATALOG_V2_SCRIPTS.includes(src)).length, CATALOG_V2_SCRIPTS.length, `${page} should not duplicate v2 scripts`);
    assert.doesNotMatch(html, /assets\/js\/catalog-runtime\.js\?v=b9-catalog-lkg-1/, `${page} should not mix legacy runtime`);
    assert.doesNotMatch(html, /assets\/js\/catalog-api\.js\?v=b9-catalog-lkg-1/, `${page} should not mix legacy API`);
    assert.doesNotMatch(html, /assets\/js\/main\.js\?v=b9-catalog-lkg-1/, `${page} should not mix legacy main`);
    assert.doesNotMatch(html, /<script\s+async/i, `${page} should not async public scripts`);
    assert.doesNotMatch(html, /<base\s/i, `${page} should not use base href`);
  }
});

test("index, solutions, and brief preconnect to the Cloud runtime origin exactly once", async () => {
  for (const page of CLOUD_PRECONNECT_PAGES) {
    const html = await readFile(page, "utf8");
    const preconnects = html.match(/<link rel="preconnect" href="https:\/\/web00-public-runtime\.s3-website\.cloud\.ru" crossorigin>/g) || [];

    assert.equal(preconnects.length, 1, `${page} should have one Cloud runtime preconnect`);
    assert.doesNotMatch(html, /<script[^>]+web00-public-runtime\.s3-website\.cloud\.ru/i, `${page} should not inline Cloud runtime scripts`);
  }
});

test("solutions.html first paint contains six non-interactive catalog skeleton cards", async () => {
  const html = await readFile("solutions.html", "utf8");
  const skeletons = html.match(/<article\b[^>]*data-catalog-skeleton\b[\s\S]*?<\/article>/g) || [];

  assert.equal(skeletons.length, 6);
  skeletons.forEach((block, index) => {
    assert.match(block, /class="solution-card solution-card--skeleton catalog-skeleton"/);
    assert.match(block, /aria-hidden="true"/);
    assert.match(block, new RegExp(`data-skeleton-index="${index}"`));
    assert.match(block, /class="solution-preview solution-preview--skeleton"/);
    assert.match(block, /class="solution-card__body"/);
    assert.match(block, /catalog-skeleton__line--tags/);
    assert.match(block, /catalog-skeleton__line--title/);
    assert.match(block, /catalog-skeleton__line--text/);
    assert.match(block, /catalog-skeleton__line--meta/);
    assert.match(block, /catalog-skeleton__actions/);
    assert.doesNotMatch(block, /<button\b|<a\b|tabindex=|data-open-demo-id|data-card-action/i);
  });
});

test("frontend B9 uses one canonical live API config and avoids production secrets", async () => {
  await assert.rejects(() => access("package.json"));
  await assert.rejects(() => access("package-lock.json"));

  const runtimeConfig = await readFile("assets/js/runtime-config.js", "utf8");
  const catalogApi = await readFile("assets/js/catalog-api.js", "utf8");
  const main = await readFile("assets/js/main.js", "utf8");
  const sw = await readFile("sw.js", "utf8");
  const combined = [runtimeConfig, catalogApi, main, sw].join("\n");

  assert.match(runtimeConfig, /apiBaseUrl: "https:\/\/web00-backend-production\.onrender\.com"/);
  assert.match(runtimeConfig, /catalogRuntimeMode: "cloud-primary"/);
  assert.match(runtimeConfig, /catalogManifestUrl: "https:\/\/web00-public-runtime\.s3-website\.cloud\.ru\/runtime\/production\/catalog\/v1\/manifest\.json"/);
  assert.doesNotMatch(runtimeConfig, /canary\/shadow/);
  assert.equal((combined.match(/https:\/\/web00-backend-production\.onrender\.com/g) || []).length, 1);
  assert.doesNotMatch(combined, /https:\/\/api\.|Authorization|credentials:\s*"include"|document\.cookie|\.env|TODO|TBD/i);
  assert.match(catalogApi, /const LKG_KEY = "web00\.catalog\.api\.lkg\.v1";/);
  assert.match(catalogApi, /window\.localStorage && window\.localStorage\.getItem\(LKG_KEY\)/);
  assert.match(catalogApi, /window\.localStorage\.setItem\(LKG_KEY, serialized\)/);
  assert.doesNotMatch(catalogApi, /sessionStorage|document\.querySelector/);
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

  assert.match(source, /async function refreshCatalogInBackground\(\)/);
  assert.match(source, /const nextCatalogState = await CATALOG\.resolveCatalogForPage\(\{ kind: "solutions", currentState: catalogState \}\);/);
  assert.match(source, /const loaded = applyCatalogState\(nextCatalogState\);/);
  assert.match(source, /if \(!loaded\) scheduleCatalogRetry\(\);/);
  assert.match(source, /CATALOG\.resolveCatalogForPage\(\{ kind: "popular", limit: 3, currentState: popularCatalogState \}\)\.then\(\(nextPopularCatalogState\) => \{/);
  assert.match(source, /if \(nextPopularCatalogState && hasCatalogItems\(nextPopularCatalogState\)\) popularCatalogState = nextPopularCatalogState;/);
});

test("main.js applies catalog API states through the catalog seam", async () => {
  const source = await readFile("assets/js/main.js", "utf8");

  assert.match(source, /function applyCatalogState\(nextCatalogState\)/);
  assert.match(source, /if \(!nextCatalogState\) return false;/);
  assert.match(source, /catalogState = nextCatalogState;/);
  assert.match(source, /renderSolutions\(\);/);
});

test("B9 CSS supports catalog status and homepage API empty state without new global cards", async () => {
  const catalogCss = await readFile("assets/css/catalog-premium.css", "utf8");
  const homeCss = await readFile("assets/css/home.css", "utf8");

  assert.match(catalogCss, /body\[data-page="solutions"\] \.catalog-state/);
  assert.match(catalogCss, /\.catalog-state\[hidden\]/);
  assert.match(catalogCss, /body\[data-page="solutions"\] \.solution-card--skeleton/);
  assert.match(catalogCss, /pointer-events:\s*none/);
  assert.match(catalogCss, /prefers-reduced-motion:\s*no-preference/);
  assert.match(catalogCss, /catalog-skeleton-pulse/);
  assert.match(homeCss, /\.mock-template-card--empty/);
  assert.match(homeCss, /body\[data-page="home"\] \.mock-template-card--skeleton/);
  assert.match(homeCss, /pointer-events:\s*none/);
  assert.match(homeCss, /min-height:\s*326px/);
  assert.match(homeCss, /body\[data-page="home"\] \.mock-template-card--skeleton \.catalog-skeleton__line/);
  assert.match(homeCss, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*body\[data-page="home"\] \.mock-template-card--skeleton \.catalog-skeleton__line/);
  assert.doesNotMatch(await readFile("index.html", "utf8"), /assets\/css\/catalog-premium\.css/);
});
