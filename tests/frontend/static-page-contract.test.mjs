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
  assert.match(source, /CATALOG\.resolveCatalogForPage\(\{\s*kind: "solutions",\s*onUpgrade:/s);
});

test("solutions.html provides stable B8 catalog state nodes", async () => {
  const html = await readFile("solutions.html", "utf8");

  assert.match(html, /data-catalog-loading/);
  assert.match(html, /data-catalog-fallback/);
  assert.match(html, /Показана сохранённая версия каталога\./);
  assert.match(html, /data-catalog-retry/);
  assert.match(html, /Повторить загрузку/);
  assert.match(html, /data-catalog-empty/);
  assert.match(html, /Подходящих решений пока нет\./);
  assert.match(html, /data-catalog-fatal/);
  assert.match(html, /data-solutions-grid/);
  assert.match(html, /data-solution-modal-content/);
  assert.match(html, /data-demo-modal-content/);
});

test("main.js replaces homepage popular cards from successful snapshot/LKG state", async () => {
  const source = await readFile("assets/js/main.js", "utf8");

  assert.match(source, /async function initPopularCatalogState\(\)/);
  assert.match(source, /function renderPopularSolutions\(\)/);
  assert.match(source, /CATALOG\.resolveCatalogForPage\(\{\s*kind: "popular",\s*limit: 3,\s*onUpgrade: applyPopularCatalogState\s*\}\)/s);
  assert.match(source, /popularCatalogState\.lifecycle !== "ready" && popularCatalogState\.lifecycle !== "degraded"/);
  assert.doesNotMatch(source, /popularCatalogState\.source === "api"/);
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

test("global demo toggle embeds only trusted GitHub Pages demos", async () => {
  const source = await readFile("assets/js/main.js", "utf8");

  assert.match(source, /const TRUSTED_DEMO_ORIGINS = new Set\(\["https:\/\/prudexxx\.github\.io"\]\);/);
  assert.match(source, /function shouldEmbedExternalDemo\(solution, demoUrl\)/);
  assert.match(source, /catalogSettings\(\)\.showDemoInModal === true/);
  assert.match(source, /isTrustedDemoUrl\(demoUrl\)/);
  assert.match(source, /if \(isExternalDemo && !embedExternalDemo\) \{\s*openExternalDemo\(demoUrl\);\s*return;\s*\}/s);
  assert.match(source, /window\.open\(url, "_blank", "noopener,noreferrer"\);/);
  assert.match(source, /<iframe data-demo-iframe src="\$\{attr\(demoUrl\)\}"/);
  assert.doesNotMatch(source, /\*\.github\.io|new Set\(\["https:"\]\)/);
});

test("root pages use canonical B8 deferred script order", async () => {
  const expected = [
    "assets/js/data.js?v=b8-live-1",
    "assets/js/runtime-config.js?v=b8-live-1",
    "assets/js/catalog-api.js?v=b8-live-1",
    "assets/js/public-catalog-snapshot.js?v=b8-live-1",
    "assets/js/main.js?v=b8-live-1",
  ];

  for (const page of ROOT_MAIN_PAGES) {
    const html = await readFile(page, "utf8");
    const scripts = [...html.matchAll(/<script\s+defer\s+src="([^"]+)"><\/script>/g)].map((match) => match[1]);
    const b8Start = scripts.findIndex((src) => src.startsWith("assets/js/data.js"));
    assert.notEqual(b8Start, -1, `${page} should load data.js`);
    assert.deepEqual(scripts.slice(b8Start, b8Start + 5), expected, `${page} script order`);
    assert.equal(scripts.filter((src) => expected.includes(src)).length, 5, `${page} should not duplicate B8 scripts`);
    assert.doesNotMatch(html, /<script\s+async/i, `${page} should not async public scripts`);
    assert.doesNotMatch(html, /<base\s/i, `${page} should not use base href`);
  }
});

test("frontend B8 uses one canonical live API config and avoids production secrets", async () => {
  await assert.rejects(() => access("package.json"));
  await assert.rejects(() => access("package-lock.json"));

  const runtimeConfig = await readFile("assets/js/runtime-config.js", "utf8");
  const catalogApi = await readFile("assets/js/catalog-api.js", "utf8");
  const snapshot = await readFile("assets/js/public-catalog-snapshot.js", "utf8");
  const main = await readFile("assets/js/main.js", "utf8");
  const sw = await readFile("sw.js", "utf8");
  const combined = [runtimeConfig, catalogApi, snapshot, main, sw].join("\n");

  assert.match(runtimeConfig, /apiBaseUrl: "https:\/\/web00-backend-production\.onrender\.com"/);
  assert.match(runtimeConfig, /publicCatalogManifestUrl: "https:\/\/qcizrrqkvdgpcgvnnfpb\.supabase\.co\/storage\/v1\/object\/public\/web00-catalog-images\/public-catalog\/v1\/manifest\.json"/);
  assert.equal((combined.match(/https:\/\/web00-backend-production\.onrender\.com/g) || []).length, 1);
  assert.equal((combined.match(/https:\/\/qcizrrqkvdgpcgvnnfpb\.supabase\.co/g) || []).length, 2);
  assert.doesNotMatch(combined, /https:\/\/api\.|Authorization|credentials:\s*"include"|document\.cookie|\.env|TODO|TBD/i);
  assert.doesNotMatch(catalogApi, /localStorage|sessionStorage|document\.querySelector/);
  assert.doesNotMatch(snapshot, /\*\.supabase\.co|https:;/);
  assert.doesNotMatch(main, /target="_blank" rel="noopener"(?! noreferrer)/);
});

test("B8 preserves pre-existing support and bug-report controls", async () => {
  const main = await readFile("assets/js/main.js", "utf8");

  assert.match(main, /let bugAttachment = null;/);
  assert.match(main, /event\.target\.closest\("\[data-open-bug\]"\)/);
  assert.match(main, /function openBugModal\(\)/);
  assert.match(main, /function renderBugForm\([^)]*\)/);
  assert.match(main, /function submitBugReport\(event\)/);
  assert.match(main, /DATA\.createErrorReport \|\| DATA\.createBugReport/);
  assert.match(main, /data-open-bug>Описать проблему<\/button>/);

  const bugControlPages = [
    ["app.html", /<button class="app-support-link" type="button" data-open-bug>Описать проблему<\/button>/],
    ["cabinet.html", /<button class="btn btn--secondary cabinet-support-link" type="button" data-open-bug>Описать проблему<\/button>/],
    ["contacts.html", /<button class="btn btn--secondary btn--full contact-error-card__action" type="button" data-open-bug>Описать проблему<\/button>/],
  ];

  for (const [page, pattern] of bugControlPages) {
    const html = await readFile(page, "utf8");
    assert.match(html, pattern, `${page} should keep its pre-B8 support bug control`);
  }

  const bugModalPages = [
    "app.html",
    "cabinet.html",
    "contacts.html",
    "faq.html",
    "how-it-works.html",
    "index.html",
    "pricing.html",
    "services.html",
    "solutions.html",
    "status.html",
  ];

  for (const page of bugModalPages) {
    const html = await readFile(page, "utf8");
    assert.match(html, /data-modal="bug"/, `${page} should keep its pre-B8 bug modal`);
    assert.match(html, /data-bug-modal-content/, `${page} should keep its pre-B8 bug modal target`);
  }
});

test("main.js ignores non-applyable stale or empty catalog results", async () => {
  const source = await readFile("assets/js/main.js", "utf8");

  assert.match(source, /function shouldApplyCatalogState\(current, next\)/);
  assert.match(source, /catalogRevision\(next\) < catalogRevision\(current\)/);
  assert.match(source, /catalogHasData\(current\) && !catalogHasData\(next\)/);
  assert.match(source, /function applyPopularCatalogState\(next\)/);
});

test("B8 CSS supports catalog status and homepage API empty state without new global cards", async () => {
  const catalogCss = await readFile("assets/css/catalog-premium.css", "utf8");
  const homeCss = await readFile("assets/css/home.css", "utf8");

  assert.match(catalogCss, /body\[data-page="solutions"\] \.catalog-state/);
  assert.match(catalogCss, /\.catalog-state\[hidden\]/);
  assert.match(homeCss, /\.mock-template-card--empty/);
});

test("brief mobile summary preview is constrained by its parent card", async () => {
  const css = await readFile("assets/css/brief-premium.css", "utf8");

  assert.match(
    css,
    /body\[data-page="brief"\] \.brief-summary \.solution-preview\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*min-height:\s*0;/s,
  );
});
