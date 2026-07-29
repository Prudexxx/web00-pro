# WEB00 Frontend B8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the static WEB00 public frontend to the B7 public catalog API
while preserving a fully functional static fallback and existing public UI.

**Architecture:** Use a small classic-script runtime config and catalog client
that normalize API and static data into one model. Keep `main.js` responsible
for DOM behavior, render managed AVIF/WebP variants through existing wrappers,
and keep runtime config/API traffic out of Service Worker caches.

**Tech Stack:** Static HTML/CSS, classic browser JavaScript, Fetch API,
AbortController, Service Worker, Node.js 22 built-in test runner and
`node:assert/strict`; no frontend dependencies.

## Global Constraints

- Work from `D:\WEB00_BACKEND` on branch `feat/web00-backend-b8`.
- Start from commit `13cc86b240f0f845550cbef8b77a68a6b07308d6`.
- Follow authoritative design `docs/WEB00_FRONTEND_B8_TECHNICAL_DESIGN.md`.
- Fixed product model is F2, C2, D2 and S2.
- F2 means API-first with static fallback.
- C2 means `assets/js/runtime-config.js`.
- D2 means `window.WEB00_CONFIG.apiBaseUrl` starts as `""`.
- S2 means the fallback notice is shown only when an API is configured and a
  request fails.
- Empty config performs no fetch, uses normal static source, and shows no
  warning.
- Frontend remains static, GitHub Pages-compatible, classic deferred scripts,
  without bundler, framework, root `package.json` or dependency install.
- Canonical public script order is `data.js`, `runtime-config.js`,
  `catalog-api.js`, `main.js`, all with `?v=b8-1`.
- Do not change `backend/**`, `backend/package.json`,
  `backend/package-lock.json`, `backend/prisma/**`, `.github/**` or
  `assets/img/**`.
- Do not create a production API URL, CORS implementation, backend deploy,
  push, pull request or merge.
- Do not read or print `.env`, `.env.*`, secrets, credentials, tokens, private
  keys, database URLs, Storage keys or cookies.
- Implementation tasks do not include intermediate commits. One final
  implementation commit happens only after owner acceptance.

---

## 1. Goal

B8 adds a public catalog adapter to the accepted static WEB00 frontend. The
adapter lets public pages load B7 catalog data when a public API origin is
configured, while keeping the current static `window.WEB00_DATA` catalog as the
normal source when the config is empty and as the fallback source when a
configured API fails.

Primary page outcomes:

- `solutions.html` renders API or static catalog cards through existing card,
  filter, modal and gallery surfaces.
- `index.html` replaces hardcoded popular cards only after a successful API
  popular response.
- `brief.html` resolves both API slugs and legacy static ids.
- managed B7 image variants render as AVIF/WebP `<picture>` markup inside
  existing wrappers.
- Service Worker caches static shell assets but never caches runtime config or
  API responses.

## 2. Preconditions

Run before implementation:

```powershell
Set-Location D:\WEB00_BACKEND
git branch --show-current
git rev-parse HEAD
git status --short
git diff --cached --name-only
git diff --check
git log -1 --format="%H %s"
git ls-remote --heads origin feat/web00-backend-b7
git ls-remote --heads origin feat/web00-backend-b8
```

Expected:

- branch is `feat/web00-backend-b8`;
- HEAD is `13cc86b240f0f845550cbef8b77a68a6b07308d6`;
- latest commit subject is `docs: add WEB00 frontend B8 technical design`;
- working tree is clean;
- staged area is empty;
- remote B7 points to `f283ff7e20aed97604d702a3b959fe1185794d6b`;
- remote B8 is absent.

Stop without changes if any value differs.

## 3. Fixed decisions

F2:

- configured API success uses `source="api"`;
- empty config uses `source="static"`;
- configured API failure with valid static data uses `source="static-fallback"`;
- configured API failure without valid static data uses fatal state.

C2:

- `assets/js/runtime-config.js` is the only public runtime config file;
- `assets/js/catalog-api.js` reads and validates it;
- `main.js` does not hardcode any production API origin.

D2:

- initial `apiBaseUrl` is an empty string;
- B8 ships with no production API URL;
- invalid config is treated as safe static behavior.

S2:

- fallback notice appears only on the solutions page;
- fallback notice appears only for `source="static-fallback"`;
- fallback notice text is exactly:

```text
Показаны сохранённые данные. Обновление временно недоступно.
```

## 4. Global constraints

Implementation remains one frontend-sized phase. It may create and modify only
files listed in section 9. It keeps existing public UI behavior for services,
pricing, FAQ, contacts, lead form, support form, status page, cabinet shell,
PWA install shell and service-worker registration.

Hard constraints:

- no backend code edits;
- no package file edits;
- no dependency install;
- no asset image edits;
- no schema, migration or seed edits;
- no `.github` edits;
- no root package files;
- no production API URL;
- no CORS backend work;
- no deployment;
- no intermediate implementation commits inside tasks.

## 5. Scope

In scope:

- public runtime config;
- catalog API client;
- API and static normalization;
- URL and text safety helpers;
- responsive image helper;
- request timeout, cancellation and stale-result protection;
- static fallback state machine;
- solutions, popular, brief, modal and gallery integration;
- canonical B8 script order on relevant root pages;
- Service Worker config/API network-only policy;
- dependency-free frontend tests;
- manual smoke evidence checklist.

## 6. Explicit out-of-scope

Out of scope:

- admin UI;
- auth frontend;
- image upload frontend;
- lead/status/support API work;
- payment work;
- analytics work;
- backend CORS implementation;
- backend deploy;
- production API URL selection;
- Supabase setup;
- server-side rendering;
- SEO prerendering;
- redesign;
- broad CSS refactor;
- package manager work;
- push, PR, merge, tag, release or deploy.

## 7. Existing frontend contracts

Relevant root pages currently loading `assets/js/data.js` and
`assets/js/main.js`:

- `app.html`;
- `brief.html`;
- `cabinet.html`;
- `cases.html`;
- `consent-personal-data.html`;
- `contacts.html`;
- `faq.html`;
- `how-it-works.html`;
- `index.html`;
- `install.html`;
- `pricing.html`;
- `privacy-policy.html`;
- `services.html`;
- `solutions.html`;
- `status.html`.

Current script pattern:

```html
<script defer src="assets/js/data.js?v=multi-page-1"></script>
<script defer src="assets/js/main.js?v=multi-page-1"></script>
```

`pricing.html` currently uses:

```html
<script defer src="assets/js/main.js?v=pricing-tariff-actions-1"></script>
```

B8 replaces every relevant root page with:

```html
<script defer src="assets/js/data.js?v=b8-1"></script>
<script defer src="assets/js/runtime-config.js?v=b8-1"></script>
<script defer src="assets/js/catalog-api.js?v=b8-1"></script>
<script defer src="assets/js/main.js?v=b8-1"></script>
```

Current `assets/js/data.js` contracts:

- IIFE assigns `window.WEB00_DATA`;
- `SOLUTIONS` starts at line 44;
- each solution has stable `id`, title fields, category fields, pricing labels,
  preview image fields, demo fields and `active`;
- `SOLUTION_GALLERIES` starts at line 347;
- line 366 assigns `solution.galleryImages`;
- localStorage helpers remain for lead/status/support/bug demo flows.

Current `assets/js/main.js` seams:

- line 2 reads `window.WEB00_DATA`;
- `esc(value)` at line 727;
- `attr(value)` at line 736;
- `solutions()` at line 740;
- `solutionFilter()` at line 749;
- `solutionPreviewType()` at line 753;
- `solutionFeatures()` at line 757;
- `solutionPrice()` at line 761;
- `solutionTime()` at line 765;
- `solutionDemoUrl()` at line 773;
- `solutionGallery()` at line 783;
- `solutionById()` at line 806;
- `solutionByIdStrict()` at line 810;
- `briefUrl()` at line 822;
- `renderSolutions()` at line 969;
- `solutionPreview()` at line 1129;
- `openSolutionModal()` at line 1162;
- `openDemoModal()` at line 1262;
- `initBriefPage()` at line 1961;
- `initHome()` at line 2467;
- `registerServiceWorker()` at line 2478.

Stable DOM selectors:

- `solutions.html`: `[data-solutions-grid]`, `[data-filter]`,
  `[data-solution-modal-content]`, `[data-demo-modal-content]`;
- `index.html`: `#popular-templates`, `.mock-card-grid`,
  `[data-open-demo-id]`, `[data-demo-modal-content]`;
- `brief.html`: `[data-brief-page-content]`, `[data-brief-back]`;
- card DOM: `.solution-card`, `data-solution-card`, `data-category`,
  `data-solution-id`, `[data-card-action]`, `.solution-card__actions`;
- gallery DOM: `[data-solution-gallery-main]`, `[data-gallery-thumb]`.

CSS ownership:

- `assets/css/catalog-premium.css` owns `body[data-page="solutions"]`
  catalog cards, previews, gallery and existing success/fallback state styling;
- `assets/css/home.css` owns `.mock-card-grid` and `.mock-template-card`;
- `assets/css/brief-premium.css` owns brief summary previews and brief states;
- `assets/css/styles.css` owns shared `.solution-card`, `.solution-preview`,
  modal and gallery baseline styles.

Current Service Worker:

- cache name is `web00-shell-v2`;
- `SHELL_ASSETS` contains HTML shell files, CSS shell files and icons;
- install precaches `SHELL_ASSETS`;
- activate deletes every cache whose key differs from `WEB00_CACHE`;
- fetch skips non-GET;
- fetch skips cross-origin;
- navigation and HTML are network-first with offline fallback to `index.html`;
- CSS and shell assets are cache-first;
- no B8 config/API exclusion exists.

Root package facts:

- root `package.json` is absent;
- only backend package files exist under `backend/`;
- frontend test plan uses Node 22 built-in test runner, not backend Vitest.

## 8. Existing B7 API contract

`backend/src/app.ts` mounts the public catalog router under `/api` when
`publicCatalogService` is injected.

Routes in `backend/src/modules/public-catalog/public-catalog.routes.ts`:

- `GET /api/sites`;
- `GET /api/sites/popular`;
- `GET /api/sites/:slug`;
- `GET /api/categories`;
- `GET /api/categories/:slug`.

Route order places `/sites/popular` before `/sites/:slug`.

Query validation:

- `/api/sites`: `page`, `limit`, `search`, `category`, `tags`, `sort`;
- `/api/sites/popular`: `limit`, `category`;
- `/api/categories`: `includeCounts`;
- `/api/categories/:slug`: `includeSites`, `page`, `limit`, `sort`;
- unknown query fields return `VALIDATION_ERROR`;
- site sort is `sortOrder`, `newest`, `popular` or `title`;
- slug regex is `^[a-z0-9]+(?:-[a-z0-9]+)*$`;
- slug max length is `120`;
- site/category page `limit` max is `20`.

Response envelopes:

```ts
interface SiteListResponse {
  data: PublicSiteSummary[];
  meta: PaginationMeta;
}

interface PopularSitesResponse {
  data: PublicSiteSummary[];
}

interface SiteDetailResponse {
  data: PublicSiteDetail;
}

interface CategoryListResponse {
  data: PublicCategorySummary[];
}

interface CategoryDetailResponse {
  data: PublicCategoryDetail;
  meta?: PaginationMeta;
}
```

Public site fields:

```ts
interface PublicSiteSummary {
  category: { slug: string; title: string };
  deliveryLabel: string | null;
  demoMode: string | null;
  demoUrl: string | null;
  developmentDays: number | null;
  featured: boolean;
  features: string[];
  galleryImages: PublicGalleryImage[];
  previewImage: PublicPreviewImage | null;
  previewImageUrl: string | null;
  previewType: string | null;
  priceAmountCents: number | null;
  priceLabel: string | null;
  shortDescription: string;
  siteUrl: string | null;
  slug: string;
  tags: string[];
  title: string;
}
```

Managed image fields:

```ts
interface PublicImageVariant {
  avifUrl: string;
  webpUrl: string;
  width: number;
}

interface PublicPreviewImage {
  assetId: string;
  url: string;
  variants: PublicImageVariant[];
}

interface PublicGalleryImage {
  alt: string;
  assetId?: string;
  sortOrder: number;
  storagePath: string;
  url: string;
  variants?: PublicImageVariant[];
}
```

B7 compatibility:

- `previewImageUrl` remains in every public site response;
- `previewImage` is `null` for legacy previews and populated for managed
  previews;
- legacy `galleryImages[].url` remains readable;
- managed `galleryImages[].variants` appears only after strict backend policy
  classification;
- `PublicGalleryImage.alt` falls back to title when managed gallery alt is
  blank;
- malformed gallery JSON returns a safe internal error;
- public responses exclude internal UUID fields from JSON payloads.

## 9. Target file map

Create:

- `assets/js/runtime-config.js`: public default config only.
- `assets/js/catalog-api.js`: config validation, URL/text safety, DTO
  normalization, API client, fallback state, responsive image helper and frozen
  public namespace.
- `tests/frontend/runtime-config.test.mjs`: config loading and validation.
- `tests/frontend/catalog-normalization.test.mjs`: API/static mapper, aliases,
  XSS text escaping and URL sanitizer contracts.
- `tests/frontend/catalog-api-client.test.mjs`: fetch, envelope, pagination,
  timeout, abort, stale response and fallback state tests.
- `tests/frontend/responsive-images.test.mjs`: image model and markup tests.
- `tests/frontend/static-page-contract.test.mjs`: HTML script order, DOM
  selectors, no production URL and `main.js` syntax contract checks.
- `tests/frontend/service-worker-contract.test.mjs`: Service Worker cache and
  network-only policy tests.
- `tests/frontend/helpers/load-classic-script.mjs`: evaluates a classic script
  in a controlled `vm` context.
- `tests/frontend/helpers/fake-browser.mjs`: creates minimal `window`,
  `document`, `URL`, `console`, timers and cache doubles for contract tests.
- `tests/frontend/helpers/fake-fetch.mjs`: creates deterministic `fetch`
  responses and abortable pending responses.

Modify:

- `assets/js/main.js`: narrow seams around `DATA`, `solutions()`,
  `solutionByIdStrict()`, `renderSolutions()`, `solutionPreview()`,
  `openSolutionModal()`, `openDemoModal()`, `initBriefPage()` and homepage
  popular behavior.
- `index.html`: canonical B8 script order.
- `solutions.html`: canonical B8 script order and stable status nodes near
  `[data-solutions-grid]`.
- `brief.html`: canonical B8 script order.
- `app.html`, `cabinet.html`, `cases.html`, `consent-personal-data.html`,
  `contacts.html`, `faq.html`, `how-it-works.html`, `install.html`,
  `pricing.html`, `privacy-policy.html`, `services.html`, `status.html`:
  canonical B8 script order.
- `assets/css/catalog-premium.css`: narrow solutions loading, fallback notice,
  empty and fatal state selectors.
- `assets/css/home.css`: narrow homepage popular empty state selector.
- `sw.js`: cache version, B8 shell JS, runtime config exclusion and API
  network-only policy.

Expected unchanged:

- `backend/**`;
- `backend/package.json`;
- `backend/package-lock.json`;
- `backend/prisma/**`;
- `assets/js/data.js`;
- `assets/img/**`;
- `.github/**`;
- `manifest.webmanifest`;
- root package files.

## 10. Public interfaces and global namespace

Future `assets/js/runtime-config.js`:

```js
(function () {
  "use strict";

  window.WEB00_CONFIG = Object.freeze({
    apiBaseUrl: "",
    requestTimeoutMs: 8000,
    staticFallbackEnabled: true
  });
})();
```

Future `assets/js/catalog-api.js` exposes:

```js
window.WEB00_CATALOG = Object.freeze({
  getConfig,
  getStaticCatalog,
  loadAllSites,
  loadPopularSites,
  loadSiteDetail,
  loadCategoryDetail,
  resolveCatalogForPage,
  normalizeApiSite,
  normalizeStaticSite,
  findCatalogItem,
  buildResponsiveImageModel,
  renderResponsiveImageHtml,
  sanitizePublicUrl,
  escapeHtml,
  escapeAttribute
});
```

Exact signatures:

```js
function getConfig()
function getStaticCatalog(options = {})
function loadAllSites(options = {})
function loadPopularSites(options = { limit: 3 })
function loadSiteDetail(slug)
function loadCategoryDetail(slug, options = {})
function resolveCatalogForPage(options = {})
function normalizeApiSite(input, options = {})
function normalizeStaticSite(input, options = {})
function findCatalogItem(items, identifier)
function buildResponsiveImageModel(image, fallback = {})
function renderResponsiveImageHtml(model, options = {})
function sanitizePublicUrl(value, options = {})
function escapeHtml(value)
function escapeAttribute(value)
```

Test-only namespace:

```js
if (window.WEB00_TEST_MODE === true) {
  window.WEB00_CATALOG_TESTS = Object.freeze({
    validateConfig,
    buildApiUrl,
    fetchJson,
    loadPaginatedSites,
    createRequestChannel,
    resolveCatalogState,
    normalizeImageVariants,
    buildSrcset
  });
}
```

`main.js` integration rule:

```js
const CATALOG = window.WEB00_CATALOG || null;
```

When `CATALOG` is absent, `main.js` uses the existing static `DATA.SOLUTIONS`
path and must not blank any public page.

## 11. Runtime config contract

Canonical runtime config:

```js
window.WEB00_CONFIG = Object.freeze({
  apiBaseUrl: "",
  requestTimeoutMs: 8000,
  staticFallbackEnabled: true
});
```

Validation output:

```js
{
  apiBaseUrl: "",
  apiEnabled: false,
  requestTimeoutMs: 8000,
  staticFallbackEnabled: true,
  valid: true
}
```

Validation rules:

- empty `apiBaseUrl` is valid and disables API fetches;
- absolute HTTPS URLs are valid;
- HTTP is valid only for `localhost`, `127.0.0.1` and `[::1]`;
- username or password makes config invalid;
- query string makes config invalid;
- fragment makes config invalid;
- relative `/api` makes config invalid;
- non-HTTP(S) schemes make config invalid;
- trailing slash is removed from pathname;
- invalid config returns `apiEnabled:false`, `valid:false` and static defaults;
- invalid config may log one developer console warning;
- invalid or empty config never triggers public fallback warning;
- invalid or empty config never calls fetch;
- `requestTimeoutMs` valid range is `1000..30000`;
- invalid timeout becomes `8000`;
- invalid fallback flag becomes `true`.

## 12. Catalog normalization contract

JSDoc contracts in `assets/js/catalog-api.js`:

```js
/**
 * @typedef {"api"|"static"|"static-fallback"} CatalogSource
 * @typedef {"loading"|"ready"|"empty"|"fallback"|"fatal"} CatalogLifecycle
 * @typedef {{ avifUrl:string, webpUrl:string, width:number }} NormalizedImageVariant
 * @typedef {{ url:string, alt:string, variants:NormalizedImageVariant[] }} NormalizedImage
 * @typedef {{
 *   key:string,
 *   id:string,
 *   slug:string,
 *   title:string,
 *   shortDescription:string,
 *   category:string,
 *   categorySlug:string,
 *   tags:string[],
 *   features:string[],
 *   priceLabel:string,
 *   deliveryLabel:string,
 *   demoMode:string,
 *   demoUrl:string,
 *   siteUrl:string,
 *   previewImageUrl:string,
 *   previewImage:NormalizedImage|null,
 *   galleryImages:NormalizedImage[],
 *   source:CatalogSource,
 *   aliases:string[]
 * }} NormalizedCatalogItem
 * @typedef {{ source:CatalogSource, lifecycle:CatalogLifecycle, items:NormalizedCatalogItem[], errorCode:string }} CatalogResult
 */
```

API mapping:

- `slug` -> `key`, `id`, `slug`;
- `title` -> `title`;
- `shortDescription` -> `shortDescription`;
- `category.title` -> `category`;
- `category.slug` -> `categorySlug`;
- `tags` -> normalized unique `tags`;
- `features` -> normalized unique `features`;
- `priceLabel` -> `priceLabel`;
- `priceAmountCents` fallback -> ruble display string;
- `deliveryLabel` -> `deliveryLabel`;
- `developmentDays` fallback -> `от N дней`;
- `demoMode` -> `demoMode`;
- `demoUrl` -> sanitized `demoUrl`;
- `siteUrl` -> sanitized `siteUrl`;
- `previewImageUrl` -> sanitized fallback image URL;
- `previewImage` -> `NormalizedImage`;
- `galleryImages` -> sorted `NormalizedImage[]`.

Static mapping:

- `id` -> `key`, `id`, `slug`;
- `legacyTitle` -> alias only;
- `title` -> `title`;
- `category` -> `category`;
- `description` -> `shortDescription`;
- `priceFrom` -> `priceLabel`;
- `deliveryTime` -> `deliveryLabel`;
- `features` -> normalized `features`;
- `previewImage` -> legacy `NormalizedImage`;
- `previewType` -> `categorySlug` fallback;
- `filter` -> `categorySlug`;
- `demoMode`, `demoLocalUrl`, `externalDemoUrl`, `originalDemoUrl`, `demoUrl`
  -> normalized demo fields through current behavior;
- `galleryImages` -> legacy gallery images;
- inactive static records are excluded.

Failure policy:

- malformed API item is rejected individually;
- all API items invalid means API failure;
- duplicate API slug means global API failure;
- valid empty API list remains empty;
- no raw DTO is attached to DOM.

## 13. URL and text safety

Sanitizer signature:

```js
function sanitizePublicUrl(value, options = {
  purpose: "destination",
  allowRelative: false,
  baseUrl: window.location.href
})
```

Purposes:

- `apiBase`: absolute API base only;
- `image`: managed HTTPS or safe site-relative image;
- `destination`: HTTPS or local HTTP destination;
- `internal`: same-site relative page or demo URL.

Rejected inputs:

```js
[
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "blob:https://evil.example/id",
  "file:///C:/secret.txt",
  "//evil.example/catalog",
  "https://user:pass@example.test/catalog",
  "https://example.test/%0aevil",
  "../outside.png",
  "/api"
]
```

Text helpers:

```js
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
```

Rendering rules:

- API strings are escaped before HTML templates;
- new status nodes use `textContent`;
- API descriptions are plain text only;
- API cannot set event-handler attributes;
- API cannot set style attributes;
- dataset slug/id/category values use validated strings.

## 14. Responsive image rendering

Helper contracts:

```js
function normalizeImageVariants(variants, options = {})
function buildSrcset(variants, field)
function buildResponsiveImageModel(image, fallback = {})
function renderResponsiveImageHtml(model, options = {})
```

Model output:

```js
{
  url: "https://storage.example.test/preview/1200.webp",
  alt: "Example Site",
  avifSrcset: "https://storage.example.test/preview/480.avif 480w",
  webpSrcset: "https://storage.example.test/preview/480.webp 480w",
  loading: "lazy",
  hasPicture: true
}
```

Rules:

- variants sort ascending by width;
- duplicate widths are removed;
- invalid widths are removed;
- invalid AVIF/WebP URLs are removed;
- AVIF source renders first;
- WebP source renders second;
- `img` fallback uses largest valid WebP, then `image.url`, then fallback URL;
- legacy image without variants renders `<img>` only;
- every generated image has `decoding="async"`;
- first homepage popular image may use `loading="eager"`;
- all other catalog/gallery images use `loading="lazy"`;
- no `fetchpriority` attribute;
- wrapper classes stay in `main.js`.

## 15. API client and pagination

API URL helper:

```js
function buildApiUrl(base, path, query = {}) {
  const url = new URL(`${base}${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}
```

Fetch helper contract:

```js
async function fetchJson(url, options) {
  const response = await options.fetchImpl(url, {
    method: "GET",
    credentials: "omit",
    mode: options.sameOriginApi ? "same-origin" : "cors",
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: options.signal
  });
  return parseJsonResponse(response);
}
```

Endpoint helpers:

- `loadAllSites()` fetches `/api/sites` with `limit=20`,
  `sort=sortOrder` and sequential pages;
- `loadPopularSites({ limit: 3 })` fetches `/api/sites/popular?limit=3`;
- `loadSiteDetail(slug)` fetches `/api/sites/:slug`;
- `loadCategoryDetail(slug, options)` fetches `/api/categories/:slug`.

Pagination:

- maximum page count is `20`;
- maximum item count is `1000`;
- requested page must equal `meta.page`;
- `meta.limit` must be `1..20`;
- `meta.totalPages` must match `meta.total`;
- duplicate slug is global failure;
- valid page 1 with empty `data` and `total=0` is successful empty result;
- an unexpected empty later page stops only when metadata is already complete;
- inconsistent metadata is API failure.

## 16. Cancellation and stale-response protection

Request channel contract:

```js
function createRequestChannel(name) {
  return {
    name,
    sequence: 0,
    controller: null,
    start(timeoutMs) {},
    isCurrent(sequence) {},
    finish(sequence) {}
  };
}
```

Per-channel flow:

1. abort existing controller in that channel;
2. increment sequence;
3. create new controller;
4. create timeout;
5. fetch;
6. validate;
7. map;
8. apply only if sequence remains current;
9. clear timeout in `finally`;
10. release controller in `finally`.

Rules:

- superseded `AbortError` is silent;
- timeout maps to controlled API failure;
- timeout can activate static fallback when fallback is enabled;
- stale success cannot mutate page state;
- catalog, popular and categories use separate channels.

## 17. Static fallback state machine

State resolver:

```js
function resolveCatalogState({ config, apiResult, staticResult, failure }) {
  if (!config.apiEnabled) return staticResult;
  if (apiResult) return apiResult;
  if (config.staticFallbackEnabled && staticResult.lifecycle !== "fatal") {
    return { ...staticResult, source: "static-fallback", lifecycle: "fallback" };
  }
  return { source: "static", lifecycle: "fatal", items: [], errorCode: "catalog-unavailable" };
}
```

Exact behavior:

- empty config: no fetch, `source="static"`;
- empty config valid static list: `lifecycle="ready"`;
- empty config empty static list: `lifecycle="empty"`;
- empty config invalid static data: `lifecycle="fatal"`;
- configured API pending: `lifecycle="loading"`;
- configured API success non-empty: `source="api"`, `lifecycle="ready"`;
- configured API success empty: `source="api"`, `lifecycle="empty"`;
- configured API failure plus valid static: `source="static-fallback"`,
  `lifecycle="fallback"`;
- configured API failure plus fallback disabled: fatal;
- superseded abort: no state change.

## 18. Solutions integration

`main.js` changes:

- add `let catalogState = null;`;
- add `function staticSolutions()` as the old `solutions()` body;
- make `solutions()` return normalized catalog items when available, otherwise
  static solutions;
- add `async function initCatalogPage()` for `[data-solutions-grid]`;
- keep `renderSolutions()` focused on DOM output;
- keep filter listeners local and client-side;
- add `renderCatalogStatus(state)` using `textContent`;
- preserve click and keyboard card behavior.

Status DOM planned in `solutions.html`:

```html
<div class="catalog-status" data-catalog-status hidden></div>
```

Renderer uses:

- `data-catalog-status` for loading/fallback/empty/fatal text;
- existing `[data-solutions-grid]` for cards;
- existing `.solution-card.is-hidden` for filters.

## 19. Homepage popular integration

`index.html` keeps hardcoded `.mock-card-grid` as initial and fallback content.

`main.js` adds:

```js
async function initPopularCatalog() {}
function renderPopularCards(items) {}
```

Rules:

- empty config leaves existing cards untouched;
- configured API pending leaves existing cards visible;
- API success replaces `.mock-card-grid` content;
- API failure leaves existing cards visible;
- API empty renders compact text inside `.mock-card-grid`;
- homepage never shows S2 fallback notice;
- `[data-open-demo-id]` accepts API slug and legacy id through
  `findCatalogItem()`.

## 20. Brief/modal/gallery integration

Brief:

- `initBriefPage()` becomes asynchronous;
- it resolves catalog before reading `solution` param into a final item;
- lookup order is normalized slug, normalized legacy id, static aliases, then
  current not-found/default behavior;
- no separate detail fetch is used for initial B8.

Modal/gallery:

- `solutionPreview()` accepts static or normalized item;
- `openSolutionModal()` uses normalized gallery array;
- thumbnail buttons store image index, not raw API URL;
- thumbnail click reads image from normalized array;
- main gallery image is rendered through responsive helper;
- `openDemoModal()` uses sanitized `demoUrl`;
- legacy gallery images still work.

## 21. Loading/empty/fallback/fatal UX

Messages:

```js
const CATALOG_MESSAGES = Object.freeze({
  loading: "Обновляем каталог...",
  fallback: "Показаны сохранённые данные. Обновление временно недоступно.",
  empty: "Подходящих решений пока нет.",
  fatal: "Каталог временно недоступен."
});
```

Rules:

- loading shown only for configured API request on solutions page;
- fallback shown only for `source="static-fallback"` on solutions page;
- empty shown for valid empty API result;
- fatal shown when API and static fallback are unavailable;
- all messages use `textContent`;
- status node has `role="status"` and `aria-live="polite"`;
- no technical detail is shown.

## 22. Service worker policy

Target cache:

```js
const WEB00_CACHE = "web00-shell-v3-b8";
```

Fetch order:

```js
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isRuntimeConfigRequest(url)) return respondNetworkOnly(event);
  if (isSameOriginApiRequest(url)) return respondNetworkOnly(event);
  if (url.origin !== self.location.origin) return;
  if (isNavigationRequest(request)) return respondNavigation(event);
  if (isShellAssetRequest(url)) return respondShellAsset(event);
});
```

Install precache:

- keep current HTML/CSS/icons;
- add `assets/js/data.js`;
- add `assets/js/catalog-api.js`;
- add `assets/js/main.js`;
- exclude `assets/js/runtime-config.js`.

Activate:

- delete caches whose key starts with `web00-shell-` and differs from
  `web00-shell-v3-b8`;
- retain unrelated caches.

## 23. Dependency-free testing architecture

Runner:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
& $PortableNode --test tests/frontend/*.test.mjs
```

Syntax gate:

```powershell
& $PortableNode --check assets/js/runtime-config.js
& $PortableNode --check assets/js/catalog-api.js
& $PortableNode --check assets/js/main.js
& $PortableNode --check sw.js
```

Test helpers:

- `load-classic-script.mjs` evaluates classic browser scripts in `node:vm`;
- `fake-browser.mjs` provides minimum `window`, `document`, timers, console,
  Cache Storage doubles and URL APIs;
- `fake-fetch.mjs` provides deterministic JSON, text, hanging and abortable
  responses.

No `jsdom`, no Playwright dependency, no root package file.

## 24. Ordered implementation tasks

### Task 1: Runtime Config And Test Harness

**Files:**

- Create: `assets/js/runtime-config.js`
- Create: `tests/frontend/helpers/load-classic-script.mjs`
- Create: `tests/frontend/helpers/fake-browser.mjs`
- Create: `tests/frontend/runtime-config.test.mjs`

**Interfaces:**

- Consumes: browser global `window`
- Produces: `window.WEB00_CONFIG`, `loadClassicScript(path, globals)`,
  `createFakeBrowser(options)`

**Behavioral contract:**

- runtime config file defines frozen default config;
- helper loads classic scripts without dependencies;
- config object contains no API URL and no secrets.

**TDD steps:**

- [ ] **Step 1: Write the failing runtime config test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";
import { createFakeBrowser } from "./helpers/fake-browser.mjs";

test("runtime config starts empty and frozen", async () => {
  const browser = createFakeBrowser();
  await loadClassicScript("assets/js/runtime-config.js", browser);
  assert.deepEqual(browser.window.WEB00_CONFIG, {
    apiBaseUrl: "",
    requestTimeoutMs: 8000,
    staticFallbackEnabled: true
  });
  assert.equal(Object.isFrozen(browser.window.WEB00_CONFIG), true);
});
```

- [ ] **Step 2: Run the focused test**

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
& $PortableNode --test tests/frontend/runtime-config.test.mjs
```

Expected RED: `assets/js/runtime-config.js` or helper modules do not exist.

- [ ] **Step 3: Create the helper skeletons**

```js
// tests/frontend/helpers/load-classic-script.mjs
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export async function loadClassicScript(path, globals) {
  const source = await readFile(path, "utf8");
  const context = vm.createContext(globals);
  vm.runInContext(source, context, { filename: path });
  return globals;
}
```

```js
// tests/frontend/helpers/fake-browser.mjs
export function createFakeBrowser(options = {}) {
  const warnings = [];
  const window = {
    location: new URL(options.href || "https://web00.pro/solutions.html"),
    console: { warn: (...args) => warnings.push(args) }
  };
  return { window, console: window.console, warnings };
}
```

- [ ] **Step 4: Create `assets/js/runtime-config.js`**

```js
(function () {
  "use strict";

  window.WEB00_CONFIG = Object.freeze({
    apiBaseUrl: "",
    requestTimeoutMs: 8000,
    staticFallbackEnabled: true
  });
})();
```

- [ ] **Step 5: Run focused test and syntax gate**

```powershell
& $PortableNode --test tests/frontend/runtime-config.test.mjs
& $PortableNode --check assets/js/runtime-config.js
```

Expected GREEN: config test passes and syntax check exits `0`.

**PASS criteria:**

- `window.WEB00_CONFIG` is frozen;
- `apiBaseUrl` is `""`;
- helper tests run through Node 22 with no packages;
- no root package file appears.

**Rollback boundary:**

- remove `assets/js/runtime-config.js`;
- remove `tests/frontend/helpers/load-classic-script.mjs`;
- remove `tests/frontend/helpers/fake-browser.mjs`;
- remove `tests/frontend/runtime-config.test.mjs`.

**Out-of-scope:**

- no API client;
- no HTML script edits.

### Task 2: Normalization, Lookup, URL Safety And Text Safety

**Files:**

- Create: `assets/js/catalog-api.js`
- Create: `tests/frontend/catalog-normalization.test.mjs`
- Modify: `tests/frontend/helpers/fake-browser.mjs`

**Interfaces:**

- Consumes: `window.WEB00_CONFIG`, `window.WEB00_DATA`
- Produces: `window.WEB00_CATALOG.normalizeApiSite`,
  `normalizeStaticSite`, `findCatalogItem`, `sanitizePublicUrl`,
  `escapeHtml`, `escapeAttribute`, `getStaticCatalog`

**Behavioral contract:**

- API and static DTOs map to `NormalizedCatalogItem`;
- invalid API item returns `null`;
- inactive static item returns `null`;
- duplicate tags/features are removed;
- dangerous text and URLs are made safe before rendering;
- lookup supports API slug and legacy static identifiers.

**TDD steps:**

- [ ] **Step 1: Write failing normalization and safety tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";
import { createFakeBrowser } from "./helpers/fake-browser.mjs";

async function loadCatalog() {
  const browser = createFakeBrowser();
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = { SOLUTIONS: [] };
  await loadClassicScript("assets/js/runtime-config.js", browser);
  await loadClassicScript("assets/js/catalog-api.js", browser);
  return browser.window.WEB00_CATALOG;
}

test("normalizes API site and escapes dangerous text", async () => {
  const catalog = await loadCatalog();
  const item = catalog.normalizeApiSite({
    slug: "safe-site",
    title: "<img src=x onerror=alert(1)>",
    shortDescription: "\" onmouseover=\"alert(1)",
    category: { slug: "goods", title: "Товары" },
    tags: ["SEO", "seo", " "],
    features: ["Fast", "Fast"],
    priceAmountCents: 123456,
    priceLabel: null,
    developmentDays: 3,
    deliveryLabel: null,
    demoMode: "external-iframe",
    demoUrl: "javascript:alert(1)",
    siteUrl: "https://example.test",
    previewImageUrl: "assets/img/previews/safe.png",
    previewImage: null,
    galleryImages: []
  });
  assert.equal(item.slug, "safe-site");
  assert.equal(item.demoUrl, "");
  assert.deepEqual(item.tags, ["seo"]);
  assert.deepEqual(item.features, ["Fast"]);
  assert.equal(catalog.escapeHtml(item.title), "&lt;img src=x onerror=alert(1)&gt;");
});

test("rejects unsafe URLs", async () => {
  const catalog = await loadCatalog();
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//evil.example",
    "https://user:pass@example.test",
    "../outside.png",
    "/api"
  ]) {
    assert.equal(catalog.sanitizePublicUrl(value, { purpose: "image", allowRelative: true }), "");
  }
});
```

- [ ] **Step 2: Run the focused test**

```powershell
& $PortableNode --test tests/frontend/catalog-normalization.test.mjs
```

Expected RED: `assets/js/catalog-api.js` does not exist.

- [ ] **Step 3: Create `catalog-api.js` namespace and pure helpers**

```js
(function () {
  "use strict";

  const CONFIG_DEFAULTS = Object.freeze({
    apiBaseUrl: "",
    requestTimeoutMs: 8000,
    staticFallbackEnabled: true
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function sanitizePublicUrl(value, options = {}) {
    return "";
  }

  function normalizeApiSite(input, options = {}) {
    return null;
  }

  function normalizeStaticSite(input, options = {}) {
    return null;
  }

  function findCatalogItem(items, identifier) {
    const value = String(identifier || "").trim();
    if (!value) return null;
    return (items || []).find((item) => item.aliases.includes(value)) || null;
  }

  function getStaticCatalog(options = {}) {
    return { source: "static", lifecycle: "ready", items: [], errorCode: "" };
  }

  window.WEB00_CATALOG = Object.freeze({
    getConfig,
    getStaticCatalog,
    loadAllSites,
    loadPopularSites,
    loadSiteDetail,
    loadCategoryDetail,
    resolveCatalogForPage,
    normalizeApiSite,
    normalizeStaticSite,
    findCatalogItem,
    buildResponsiveImageModel,
    renderResponsiveImageHtml,
    sanitizePublicUrl,
    escapeHtml,
    escapeAttribute
  });
})();
```

- [ ] **Step 4: Fill normalization and sanitizer behavior**

Implement only the pure mapping and sanitizer rules from sections 12 and 13 of
this plan.

- [ ] **Step 5: Run focused test and syntax gate**

```powershell
& $PortableNode --test tests/frontend/catalog-normalization.test.mjs
& $PortableNode --check assets/js/catalog-api.js
```

Expected GREEN.

**PASS criteria:**

- API DTO maps to normalized item;
- static DTO maps to normalized item;
- unsafe URL payloads return empty string;
- text helpers match existing `main.js` escaping semantics;
- no fetch code exists yet.

**Rollback boundary:**

- remove `assets/js/catalog-api.js`;
- remove `tests/frontend/catalog-normalization.test.mjs`;
- restore helper edit.

**Out-of-scope:**

- no page DOM edits;
- no Service Worker edits.

### Task 3: Responsive Image Model And Markup

**Files:**

- Modify: `assets/js/catalog-api.js`
- Create: `tests/frontend/responsive-images.test.mjs`

**Interfaces:**

- Consumes: `sanitizePublicUrl`, `escapeAttribute`
- Produces: `buildResponsiveImageModel(image, fallback)`,
  `renderResponsiveImageHtml(model, options)`, test-only
  `normalizeImageVariants`, `buildSrcset`

**Behavioral contract:**

- managed images render `<picture>`;
- legacy images render `<img>`;
- invalid variants are dropped;
- generated attributes are escaped.

**TDD steps:**

- [ ] **Step 1: Write failing image tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";
import { createFakeBrowser } from "./helpers/fake-browser.mjs";

test("renders AVIF then WebP picture with escaped alt", async () => {
  const browser = createFakeBrowser();
  browser.window.WEB00_TEST_MODE = true;
  browser.window.WEB00_DATA = { SOLUTIONS: [] };
  await loadClassicScript("assets/js/runtime-config.js", browser);
  await loadClassicScript("assets/js/catalog-api.js", browser);
  const html = browser.window.WEB00_CATALOG.renderResponsiveImageHtml({
    url: "https://storage.example.test/1200.webp",
    alt: "\" onmouseover=\"alert(1)",
    variants: [
      { width: 960, avifUrl: "https://storage.example.test/960.avif", webpUrl: "https://storage.example.test/960.webp" },
      { width: 480, avifUrl: "https://storage.example.test/480.avif", webpUrl: "https://storage.example.test/480.webp" }
    ]
  }, { loading: "lazy" });
  assert.match(html, /^<picture>/);
  assert.match(html, /type="image\/avif"/);
  assert.match(html, /type="image\/webp"/);
  assert.match(html, /decoding="async"/);
  assert.match(html, /loading="lazy"/);
  assert.doesNotMatch(html, /onmouseover/);
});
```

- [ ] **Step 2: Run focused image test**

```powershell
& $PortableNode --test tests/frontend/responsive-images.test.mjs
```

Expected RED: image helper returns empty legacy markup or is missing.

- [ ] **Step 3: Implement image helper skeleton**

```js
function normalizeImageVariants(variants, options = {}) {
  const seen = new Set();
  return (Array.isArray(variants) ? variants : [])
    .filter((variant) => Number.isInteger(variant.width) && variant.width > 0)
    .sort((left, right) => left.width - right.width)
    .filter((variant) => {
      if (seen.has(variant.width)) return false;
      seen.add(variant.width);
      return true;
    });
}

function buildSrcset(variants, field) {
  return variants
    .map((variant) => `${escapeAttribute(variant[field])} ${variant.width}w`)
    .join(", ");
}
```

- [ ] **Step 4: Implement `<picture>` and legacy `<img>` output**

Use AVIF first, WebP second, `decoding="async"`, escaped `alt`, and no
`fetchpriority`.

- [ ] **Step 5: Run image and normalization tests**

```powershell
& $PortableNode --test tests/frontend/responsive-images.test.mjs tests/frontend/catalog-normalization.test.mjs
```

Expected GREEN.

**PASS criteria:**

- managed variants create `<picture>`;
- legacy image creates `<img>`;
- invalid variant URL is removed;
- duplicate widths are removed;
- first popular can pass `loading:"eager"`;
- no unescaped attribute injection exists.

**Rollback boundary:**

- revert `assets/js/catalog-api.js` image helper edits;
- remove `tests/frontend/responsive-images.test.mjs`.

**Out-of-scope:**

- no page DOM rendering changes.

### Task 4: API Client, Envelope Validation And Pagination

**Files:**

- Modify: `assets/js/catalog-api.js`
- Create: `tests/frontend/helpers/fake-fetch.mjs`
- Create: `tests/frontend/catalog-api-client.test.mjs`

**Interfaces:**

- Consumes: `validateConfig`, `normalizeApiSite`, `sanitizePublicUrl`
- Produces: `buildApiUrl`, `fetchJson`, `loadAllSites`,
  `loadPopularSites`, `loadSiteDetail`, `loadCategoryDetail`

**Behavioral contract:**

- client uses GET-only Fetch options;
- validates content type, JSON, envelope and pagination;
- loads `/api/sites` sequential pages;
- duplicate slug is API failure;
- valid empty API response remains empty.

**TDD steps:**

- [ ] **Step 1: Write fake fetch helper**

```js
export function createJsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json" : null },
    json: async () => body
  };
}

export function createFetchQueue(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetchImpl };
}
```

- [ ] **Step 2: Write failing API client tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createFetchQueue, createJsonResponse } from "./helpers/fake-fetch.mjs";
import { loadClassicScript } from "./helpers/load-classic-script.mjs";
import { createFakeBrowser } from "./helpers/fake-browser.mjs";

test("loadAllSites fetches sequential pages and preserves order", async () => {
  const browser = createFakeBrowser();
  browser.window.WEB00_CONFIG = { apiBaseUrl: "https://api.example.test", requestTimeoutMs: 8000, staticFallbackEnabled: true };
  browser.window.WEB00_DATA = { SOLUTIONS: [] };
  const queue = createFetchQueue([
    createJsonResponse({ data: [{ slug: "a", title: "A", shortDescription: "A", category: { slug: "goods", title: "Goods" }, tags: [], features: [], priceLabel: null, priceAmountCents: null, deliveryLabel: null, developmentDays: null, demoMode: null, demoUrl: null, siteUrl: null, previewImageUrl: null, previewImage: null, galleryImages: [] }], meta: { page: 1, limit: 20, total: 2, totalPages: 2 } }),
    createJsonResponse({ data: [{ slug: "b", title: "B", shortDescription: "B", category: { slug: "goods", title: "Goods" }, tags: [], features: [], priceLabel: null, priceAmountCents: null, deliveryLabel: null, developmentDays: null, demoMode: null, demoUrl: null, siteUrl: null, previewImageUrl: null, previewImage: null, galleryImages: [] }], meta: { page: 2, limit: 20, total: 2, totalPages: 2 } })
  ]);
  browser.window.fetch = queue.fetchImpl;
  await loadClassicScript("assets/js/catalog-api.js", browser);
  const result = await browser.window.WEB00_CATALOG.loadAllSites();
  assert.equal(result.source, "api");
  assert.deepEqual(result.items.map((item) => item.slug), ["a", "b"]);
  assert.equal(queue.calls[0].options.credentials, "omit");
  assert.equal(queue.calls[0].options.cache, "no-store");
});
```

- [ ] **Step 3: Run focused API client test**

```powershell
& $PortableNode --test tests/frontend/catalog-api-client.test.mjs
```

Expected RED: API loading helpers return static result.

- [ ] **Step 4: Implement fetch and pagination helpers**

Implement `buildApiUrl`, `fetchJson`, envelope validators,
`loadPaginatedSites`, `loadAllSites`, `loadPopularSites`, `loadSiteDetail` and
`loadCategoryDetail`.

- [ ] **Step 5: Add failure tests in the same file**

Cases: non-2xx, wrong content type, invalid JSON, invalid envelope,
inconsistent meta, duplicate slug, page cap, item cap and valid empty.

- [ ] **Step 6: Run focused and previous pure tests**

```powershell
& $PortableNode --test tests/frontend/catalog-api-client.test.mjs tests/frontend/catalog-normalization.test.mjs tests/frontend/responsive-images.test.mjs
```

Expected GREEN.

**PASS criteria:**

- GET-only options match section 15;
- no Authorization or cookies;
- pagination caps are enforced;
- empty API list is successful empty;
- duplicate slug fails API result.

**Rollback boundary:**

- revert API client edits in `assets/js/catalog-api.js`;
- remove `tests/frontend/helpers/fake-fetch.mjs`;
- remove `tests/frontend/catalog-api-client.test.mjs`.

**Out-of-scope:**

- no `main.js` integration.

### Task 5: Request Channels And Fallback State Machine

**Files:**

- Modify: `assets/js/catalog-api.js`
- Modify: `tests/frontend/catalog-api-client.test.mjs`

**Interfaces:**

- Consumes: API helpers from Task 4
- Produces: `createRequestChannel`, `resolveCatalogForPage`,
  `resolveCatalogState`

**Behavioral contract:**

- empty config performs no fetch;
- configured failure uses static fallback;
- fallback disabled returns fatal;
- timeout is controlled failure;
- superseded abort is silent;
- stale success cannot override latest sequence.

**TDD steps:**

- [ ] **Step 1: Write failing state tests**

```js
test("empty config uses static source without fetch", async () => {
  const browser = createFakeBrowser();
  browser.window.WEB00_CONFIG = { apiBaseUrl: "", requestTimeoutMs: 8000, staticFallbackEnabled: true };
  browser.window.WEB00_DATA = { SOLUTIONS: [{ id: "mebel", title: "Mebel", category: "Товары", description: "Desc", filter: "goods", features: [], previewImage: "assets/img/previews/mebel-home.png", demoMode: "none", active: true }] };
  let calls = 0;
  browser.window.fetch = async () => { calls += 1; throw new Error("network"); };
  await loadClassicScript("assets/js/catalog-api.js", browser);
  const result = await browser.window.WEB00_CATALOG.resolveCatalogForPage({ kind: "solutions" });
  assert.equal(result.source, "static");
  assert.equal(result.lifecycle, "ready");
  assert.equal(calls, 0);
});
```

- [ ] **Step 2: Run focused test**

```powershell
& $PortableNode --test tests/frontend/catalog-api-client.test.mjs
```

Expected RED: `resolveCatalogForPage` lacks fallback state behavior.

- [ ] **Step 3: Implement channel and state resolver**

Use one channel per data stream: `catalog`, `popular`, `categories`.

- [ ] **Step 4: Cover timeout and stale response**

Write a Node test case where an older pending response resolves after a newer
response and assert the older result is ignored.

- [ ] **Step 5: Run API client tests**

```powershell
& $PortableNode --test tests/frontend/catalog-api-client.test.mjs
```

Expected GREEN.

**PASS criteria:**

- no fetch in empty config;
- static fallback only after configured failure;
- fallback disabled returns fatal;
- stale response cannot win;
- no unhandled rejection from superseded abort.

**Rollback boundary:**

- revert state-machine edits in `assets/js/catalog-api.js`;
- revert added state tests.

**Out-of-scope:**

- no page DOM rendering.

### Task 6: Solutions Page Integration And Status UX

**Files:**

- Modify: `assets/js/main.js` around lines 2, 740-822, 969-1024, 1129-1260,
  2467-2498
- Modify: `solutions.html`
- Modify: `assets/css/catalog-premium.css`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**

- Consumes: `window.WEB00_CATALOG.resolveCatalogForPage`,
  `renderResponsiveImageHtml`, `findCatalogItem`
- Produces: `initCatalogPage`, `renderCatalogStatus`, normalized-aware
  `solutions()`, `solutionPreview()`, `openSolutionModal()`

**Behavioral contract:**

- solutions grid renders static in empty config;
- configured API success renders API cards;
- configured API failure renders static cards and S2 notice;
- API empty renders empty state;
- filters remain client-side.

**TDD steps:**

- [ ] **Step 1: Write static page contract test for status node**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("solutions page has catalog status node and grid", async () => {
  const html = await readFile("solutions.html", "utf8");
  assert.match(html, /data-catalog-status/);
  assert.match(html, /data-solutions-grid/);
});
```

- [ ] **Step 2: Run focused static page test**

```powershell
& $PortableNode --test tests/frontend/static-page-contract.test.mjs
```

Expected RED: `data-catalog-status` is absent.

- [ ] **Step 3: Add status node to `solutions.html`**

```html
<div class="catalog-status" data-catalog-status role="status" aria-live="polite" hidden></div>
```

Place it immediately before `<div class="solutions-grid" data-solutions-grid></div>`.

- [ ] **Step 4: Add narrow CSS**

```css
body[data-page="solutions"] .catalog-status {
  margin: 0 0 18px;
  color: var(--text-muted);
}

body[data-page="solutions"] .catalog-status[hidden] {
  display: none;
}

body[data-page="solutions"] .catalog-status.is-warning {
  color: var(--accent);
}
```

- [ ] **Step 5: Modify `main.js` seams**

Create a fallback-safe catalog reference:

```js
const CATALOG = window.WEB00_CATALOG || null;
let catalogState = null;
```

Add:

```js
async function initCatalogPage() {
  if (!CATALOG || !$("[data-solutions-grid]")) {
    renderSolutions();
    return;
  }
  renderCatalogStatus({ lifecycle: "loading", source: "api" });
  const result = await CATALOG.resolveCatalogForPage({ kind: "solutions" });
  catalogState = result;
  renderSolutions();
  renderCatalogStatus(result);
}
```

- [ ] **Step 6: Preserve static fallback in `initHome()`**

Call `initCatalogPage()` from `initHome()` and ensure missing
`WEB00_CATALOG` still calls current `renderSolutions()`.

- [ ] **Step 7: Run syntax and static contract tests**

```powershell
& $PortableNode --check assets/js/main.js
& $PortableNode --test tests/frontend/static-page-contract.test.mjs
```

Expected GREEN.

**PASS criteria:**

- static mode works without `WEB00_CATALOG`;
- `data-catalog-status` exists and is accessible;
- card selectors remain unchanged;
- filters still use `[data-filter]`;
- no unrelated services/pricing/status code is moved.

**Rollback boundary:**

- revert `assets/js/main.js`;
- revert `solutions.html`;
- revert `assets/css/catalog-premium.css`;
- revert `tests/frontend/static-page-contract.test.mjs`.

**Out-of-scope:**

- no homepage popular changes.

### Task 7: Homepage Popular Integration

**Files:**

- Modify: `assets/js/main.js`
- Modify: `assets/css/home.css`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**

- Consumes: `loadPopularSites({ limit: 3 })`, `renderResponsiveImageHtml`,
  `findCatalogItem`
- Produces: `initPopularCatalog`, `renderPopularCards`

**Behavioral contract:**

- hardcoded popular cards stay visible until API success;
- configured API failure leaves hardcoded cards;
- homepage shows no fallback notice;
- API empty renders compact popular empty state.

**TDD steps:**

- [ ] **Step 1: Write static contract for homepage popular grid**

```js
test("homepage keeps popular grid and demo ids", async () => {
  const html = await readFile("index.html", "utf8");
  assert.match(html, /id="popular-templates"/);
  assert.match(html, /class="mock-card-grid"/);
  assert.match(html, /data-open-demo-id="mebel"/);
});
```

- [ ] **Step 2: Run focused static page test**

```powershell
& $PortableNode --test tests/frontend/static-page-contract.test.mjs
```

Expected GREEN before implementation and after implementation.

- [ ] **Step 3: Add `initPopularCatalog()` in `main.js`**

```js
async function initPopularCatalog() {
  const grid = $(".mock-card-grid");
  if (!grid || !CATALOG || !CATALOG.getConfig().apiEnabled) return;
  const result = await CATALOG.loadPopularSites({ limit: 3 });
  if (result.source === "api" && result.lifecycle === "ready") {
    renderPopularCards(result.items.slice(0, 3));
  } else if (result.source === "api" && result.lifecycle === "empty") {
    renderPopularEmpty(grid);
  }
}
```

- [ ] **Step 4: Add compact empty state CSS**

```css
body[data-page="home"] .mock-card-grid .popular-empty-state {
  min-height: 120px;
  display: grid;
  place-items: center;
  color: var(--text-muted);
}
```

- [ ] **Step 5: Call `initPopularCatalog()` from `initHome()`**

Keep the existing hardcoded grid until API success.

- [ ] **Step 6: Run syntax and static page tests**

```powershell
& $PortableNode --check assets/js/main.js
& $PortableNode --test tests/frontend/static-page-contract.test.mjs
```

Expected GREEN.

**PASS criteria:**

- homepage has no fallback notice;
- API failure does not clear hardcoded cards;
- API success can render normalized cards;
- `[data-open-demo-id]` works for slug and legacy id.

**Rollback boundary:**

- revert homepage edits in `assets/js/main.js`;
- revert `assets/css/home.css`;
- revert static contract edits.

**Out-of-scope:**

- no changes to hero or marketing layout.

### Task 8: Brief, Modal And Gallery Normalized Integration

**Files:**

- Modify: `assets/js/main.js`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**

- Consumes: `findCatalogItem`, normalized item shape,
  `renderResponsiveImageHtml`
- Produces: async `initBriefPage`, safe gallery image index switching,
  normalized-aware `solutionByIdStrict`

**Behavioral contract:**

- `brief.html?solution=<api-slug>` resolves API items;
- `brief.html?solution=<legacy-id>` resolves static items;
- modal and gallery render normalized images safely;
- thumbnail datasets do not contain raw API URLs.

**TDD steps:**

- [ ] **Step 1: Extend static page test for brief selectors**

```js
test("brief page keeps required selectors", async () => {
  const html = await readFile("brief.html", "utf8");
  assert.match(html, /data-brief-page-content/);
  assert.match(html, /data-brief-back/);
});
```

- [ ] **Step 2: Run focused static test**

```powershell
& $PortableNode --test tests/frontend/static-page-contract.test.mjs
```

Expected GREEN.

- [ ] **Step 3: Refactor lookup seam**

```js
function catalogItems() {
  return catalogState?.items?.length ? catalogState.items : staticSolutions();
}

function solutionByIdStrict(id) {
  const value = String(id || "").trim();
  if (!value) return null;
  if (CATALOG && catalogState?.items) {
    return CATALOG.findCatalogItem(catalogState.items, value);
  }
  return staticSolutions().find((item) => item.id === value || item.title === value || item.legacyTitle === value) || null;
}
```

- [ ] **Step 4: Make `initBriefPage()` async**

Resolve catalog state before calling `solutionByIdStrict()` when `CATALOG`
exists.

- [ ] **Step 5: Change gallery thumbnails to image indexes**

```html
<button type="button" data-gallery-thumb data-gallery-index="${index}">
```

Thumbnail click reads `gallery[Number(button.dataset.galleryIndex)]`.

- [ ] **Step 6: Run syntax and static tests**

```powershell
& $PortableNode --check assets/js/main.js
& $PortableNode --test tests/frontend/static-page-contract.test.mjs
```

Expected GREEN.

**PASS criteria:**

- API slug and legacy id lookup use one path;
- modal receives normalized item;
- gallery does not trust a raw API URL from dataset;
- static lead/status behavior remains untouched.

**Rollback boundary:**

- revert brief/modal/gallery edits in `assets/js/main.js`;
- revert static contract edits.

**Out-of-scope:**

- no new detail page architecture;
- no separate detail fetch for initial B8.

### Task 9: Canonical Script Order Across Root Pages

**Files:**

- Modify: `app.html`
- Modify: `brief.html`
- Modify: `cabinet.html`
- Modify: `cases.html`
- Modify: `consent-personal-data.html`
- Modify: `contacts.html`
- Modify: `faq.html`
- Modify: `how-it-works.html`
- Modify: `index.html`
- Modify: `install.html`
- Modify: `pricing.html`
- Modify: `privacy-policy.html`
- Modify: `services.html`
- Modify: `solutions.html`
- Modify: `status.html`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**

- Consumes: existing page script tags
- Produces: canonical B8 script order on each relevant page

**Behavioral contract:**

- every relevant root page loads `data.js`, `runtime-config.js`,
  `catalog-api.js`, `main.js` in that order;
- every tag uses `defer`;
- every tag uses `?v=b8-1`;
- no inline API URL appears;
- no duplicate script appears.

**TDD steps:**

- [ ] **Step 1: Write static script order test**

```js
const SCRIPT_PAGES = [
  "app.html", "brief.html", "cabinet.html", "cases.html",
  "consent-personal-data.html", "contacts.html", "faq.html",
  "how-it-works.html", "index.html", "install.html", "pricing.html",
  "privacy-policy.html", "services.html", "solutions.html", "status.html"
];

test("root pages use canonical B8 script order", async () => {
  for (const page of SCRIPT_PAGES) {
    const html = await readFile(page, "utf8");
    const scripts = [...html.matchAll(/<script\s+defer\s+src="([^"]+)"><\/script>/g)].map((match) => match[1]);
    assert.deepEqual(scripts.slice(-4), [
      "assets/js/data.js?v=b8-1",
      "assets/js/runtime-config.js?v=b8-1",
      "assets/js/catalog-api.js?v=b8-1",
      "assets/js/main.js?v=b8-1"
    ], page);
  }
});
```

- [ ] **Step 2: Run static script test**

```powershell
& $PortableNode --test tests/frontend/static-page-contract.test.mjs
```

Expected RED: pages still use `?v=multi-page-1` or pricing-specific main query.

- [ ] **Step 3: Edit each listed HTML page**

Replace the old two script tags with the canonical four script tags.

- [ ] **Step 4: Run static script test**

```powershell
& $PortableNode --test tests/frontend/static-page-contract.test.mjs
```

Expected GREEN.

**PASS criteria:**

- all 15 relevant root pages have canonical order;
- no `<base href>` is introduced;
- no inline API URL exists;
- pricing page keeps behavior through unchanged `main.js`, not query string.

**Rollback boundary:**

- restore the script tags in the 15 listed HTML files;
- revert the script order test.

**Out-of-scope:**

- no content, layout or asset changes.

### Task 10: Service Worker Config And API Network-Only Policy

**Files:**

- Modify: `sw.js`
- Create: `tests/frontend/service-worker-contract.test.mjs`

**Interfaces:**

- Consumes: existing `WEB00_CACHE`, `SHELL_ASSETS`, fetch handlers
- Produces: `web00-shell-v3-b8`, runtime-config network-only, API
  network-only, B8 static JS shell policy

**Behavioral contract:**

- `runtime-config.js` is not precached and not runtime-cached;
- same-origin `/api/` requests are network-only;
- query string cannot bypass config/API path checks;
- cross-origin requests are not cached by WEB00 shell;
- old WEB00 shell caches are deleted;
- unrelated caches are retained.

**TDD steps:**

- [ ] **Step 1: Write Service Worker contract tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("service worker excludes runtime config and api paths", async () => {
  const source = await readFile("sw.js", "utf8");
  assert.match(source, /web00-shell-v3-b8/);
  assert.match(source, /runtime-config\.js/);
  assert.match(source, /\/api\//);
  assert.doesNotMatch(source, /"assets\/js\/runtime-config\.js"/);
});
```

- [ ] **Step 2: Run Service Worker test**

```powershell
& $PortableNode --test tests/frontend/service-worker-contract.test.mjs
```

Expected RED: current SW uses `web00-shell-v2` and has no exclusions.

- [ ] **Step 3: Update cache name and shell assets**

Set `WEB00_CACHE` to `web00-shell-v3-b8`. Add `assets/js/data.js`,
`assets/js/catalog-api.js` and `assets/js/main.js` to `SHELL_ASSETS`. Do not add
`assets/js/runtime-config.js`.

- [ ] **Step 4: Add path predicates**

```js
function isRuntimeConfigRequest(url) {
  return url.origin === self.location.origin && url.pathname.endsWith("/assets/js/runtime-config.js");
}

function isSameOriginApiRequest(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/api/");
}
```

- [ ] **Step 5: Reorder fetch handler**

Apply the fetch order from section 22 before existing navigation and shell
branches.

- [ ] **Step 6: Run SW syntax and contract tests**

```powershell
& $PortableNode --check sw.js
& $PortableNode --test tests/frontend/service-worker-contract.test.mjs
```

Expected GREEN.

**PASS criteria:**

- config and API are network-only;
- B8 shell JS is available under shell policy;
- unrelated caches are retained;
- navigation fallback remains.

**Rollback boundary:**

- revert `sw.js`;
- remove `tests/frontend/service-worker-contract.test.mjs`.

**Out-of-scope:**

- no deployment or registration change.

### Task 11: Full Frontend Regression And Static Contract Suite

**Files:**

- Modify: all `tests/frontend/*.test.mjs`
- Modify: `tests/frontend/helpers/*.mjs`

**Interfaces:**

- Consumes: every B8 public helper and page contract
- Produces: complete dependency-free frontend regression suite

**Behavioral contract:**

- tests cover every acceptance rule that can run without a production API;
- tests do not require network;
- tests do not require packages;
- tests do not read secret files.

**TDD steps:**

- [ ] **Step 1: Run all frontend tests**

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
& $PortableNode --test tests/frontend/*.test.mjs
```

Expected GREEN after Tasks 1-10.

- [ ] **Step 2: Run syntax checks**

```powershell
& $PortableNode --check assets/js/runtime-config.js
& $PortableNode --check assets/js/catalog-api.js
& $PortableNode --check assets/js/main.js
& $PortableNode --check sw.js
```

Expected GREEN.

- [ ] **Step 3: Run static scope searches**

```powershell
rg -n "https://api\\.|apiBaseUrl:\\s*['\\\"]https?://" assets js *.html sw.js
rg -n "Authorization|credentials:\\s*['\\\"]include|document\\.cookie" assets/js *.html
rg -n "\\.env|VITE_|REACT_APP_|NEXT_PUBLIC_" assets *.html
```

Expected: no hardcoded production API URL, no frontend auth/cookie client logic,
no frontend env model.

**PASS criteria:**

- frontend tests pass;
- syntax checks pass;
- static searches show no forbidden frontend API/auth/env pattern;
- no backend/package files changed.

**Rollback boundary:**

- revert the frontend test file that introduced the failing contract.

**Out-of-scope:**

- no backend test edits.

### Task 12: Final B8 Checkpoint And Manual Smoke Evidence Preparation

**Files:**

- No production file changes in this task.
- Evidence file may be created only if a future owner request asks for a
  separate smoke report.

**Interfaces:**

- Consumes: completed B8 implementation
- Produces: verification evidence for owner acceptance

**Behavioral contract:**

- final checkpoint proves frontend syntax, frontend tests, backend regression,
  git scope and manual smoke matrix status.

**TDD steps:**

- [ ] **Step 1: Run repository gate**

```powershell
Set-Location D:\WEB00_BACKEND
git branch --show-current
git rev-parse HEAD
git status --short
git diff --cached --name-only
git diff --check
```

Expected: branch is `feat/web00-backend-b8`, staged area empty before final
owner acceptance, working tree contains only approved B8 files.

- [ ] **Step 2: Run frontend syntax and tests**

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
& $PortableNode --check assets/js/runtime-config.js
& $PortableNode --check assets/js/catalog-api.js
& $PortableNode --check assets/js/main.js
& $PortableNode --check sw.js
& $PortableNode --test tests/frontend/*.test.mjs
```

Expected: all commands exit `0`.

- [ ] **Step 3: Run backend regression**

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "$PortableRoot\npm.cmd" run check
```

Expected: backend check exits `0`.

- [ ] **Step 4: Return to root and verify scope**

```powershell
Set-Location D:\WEB00_BACKEND
git diff --name-only -- backend
git diff --name-only -- backend\package.json backend\package-lock.json
git diff --name-only -- backend\prisma
git diff --name-only -- .github
git diff --name-only -- assets\img
```

Expected: all outputs empty.

- [ ] **Step 5: Execute manual smoke matrix**

Use section 25 as the manual checklist. Record PASS/FAIL notes in the final
owner-facing response.

**PASS criteria:**

- all automated checks pass;
- manual smoke has explicit evidence or clearly named gaps;
- backend/package/schema/migration/seed remain unchanged;
- no push/PR/merge/deploy occurs.

**Rollback boundary:**

- no file rollback in this verification task; rollback belongs to the task that
  introduced the failing behavior.

**Out-of-scope:**

- no deployment;
- no final commit without owner acceptance.

## 25. Manual smoke matrix

Static mode:

- set `apiBaseUrl` to `""`;
- load `index.html`;
- verify no catalog fetch in DevTools Network;
- verify no fallback warning;
- verify hardcoded popular cards remain;
- load `solutions.html`;
- verify cards render;
- verify every filter button works;
- open a solution modal;
- switch gallery thumbnails;
- open demo where available;
- load `brief.html?solution=mebel`;
- verify selected solution summary renders.

Configured API success with local controlled fake endpoint:

- configure localhost HTTP API base only for local smoke;
- serve fake `/api/sites` and `/api/sites/popular` JSON;
- verify solutions API cards render;
- verify homepage popular cards update after API success;
- verify `brief.html?solution=<api-slug>` resolves;
- verify managed image `<picture>` includes AVIF and WebP sources;
- verify console has no unhandled promise rejection.

Configured API timeout/failure:

- point config to a nonresponding local endpoint;
- verify solutions renders static cards;
- verify S2 notice appears on solutions;
- verify homepage leaves hardcoded cards;
- verify technical error text is not shown.

Valid API empty:

- return `{ "data": [], "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }`
  for `/api/sites`;
- verify solutions empty message;
- return `{ "data": [] }` for popular;
- verify compact homepage empty state;
- verify no static fallback notice.

Desktop/mobile:

- desktop width `1440`;
- tablet width `768`;
- mobile width `390`;
- verify no card overflow;
- verify modal/gallery usable;
- verify menu and contact actions unaffected.

Service Worker:

- unregister old local service worker before first B8 smoke run;
- reload under HTTPS or localhost;
- verify cache `web00-shell-v3-b8`;
- verify `runtime-config.js` absent from Cache Storage;
- verify `/api/sites` absent from Cache Storage;
- verify shell fallback works offline for static pages.

## 26. Final verification checkpoint

Future implementation verification commands:

```powershell
Set-Location D:\WEB00_BACKEND
git branch --show-current
git rev-parse HEAD
git status --short
git diff --cached --name-only
git diff --check

$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"

& $PortableNode --check assets/js/runtime-config.js
& $PortableNode --check assets/js/catalog-api.js
& $PortableNode --check assets/js/main.js
& $PortableNode --check sw.js
& $PortableNode --test tests/frontend/*.test.mjs

Set-Location D:\WEB00_BACKEND\backend
& "$PortableRoot\npm.cmd" run check

Set-Location D:\WEB00_BACKEND
rg -n "apiBaseUrl:\\s*['\\\"]https?://" assets *.html sw.js
rg -n "Authorization|credentials:\\s*['\\\"]include|document\\.cookie" assets/js *.html
rg -n "\\.env|VITE_|REACT_APP_|NEXT_PUBLIC_" assets *.html
git diff --name-only -- backend
git diff --name-only -- backend\package.json backend\package-lock.json
git diff --name-only -- backend\prisma
git diff --name-only -- .github
git diff --name-only -- assets\img
```

Future implementation report template:

```text
B8 IMPLEMENTATION RESULT:
- result:
- branch:
- base commit:
- design followed:
- files created:
- files modified:
- backend changed:
- package files changed:
- dependencies added:
- runtime config:
- initial API URL:
- empty-config network requests:
- static source:
- configured API success:
- configured API failure:
- fallback notice:
- valid API empty:
- API client:
- normalized mapper:
- URL sanitizer:
- text/XSS safety:
- responsive images:
- legacy image fallback:
- timeout:
- cancellation:
- stale response:
- pagination:
- page/item safety cap:
- duplicate slug:
- solutions integration:
- popular integration:
- brief slug:
- brief legacy id:
- modal/gallery:
- service worker cache:
- runtime config cached:
- API cached:
- frontend test files:
- frontend tests:
- syntax checks:
- backend regression:
- desktop smoke:
- mobile smoke:
- schema changed:
- migration changed:
- seed changed:
- staged:
- commit:
- push:
- deploy:
- working tree:
- risks remaining:
- recommended next step:
```

## 27. Acceptance criteria

- F2, C2, D2 and S2 are implemented exactly.
- Empty config performs no network request.
- Empty config shows no warning.
- Invalid config uses safe static behavior.
- Configured API failure produces S2 notice on solutions page.
- API empty result remains empty.
- Fallback disabled failure is fatal.
- Static fallback is preserved.
- There is one API client.
- There is one normalized mapper.
- No hardcoded production API URL exists.
- No frontend secrets or frontend env model exists.
- URL sanitizer rejects unsafe schemes, credentials, traversal and control
  characters.
- Text helpers protect against HTML and attribute injection.
- Managed images render AVIF/WebP picture.
- Legacy images render safely.
- Request timeout is `8000` by default.
- Cancellation uses per-channel `AbortController`.
- Stale response cannot overwrite latest state.
- Pagination uses page cap `20` and item cap `1000`.
- Duplicate API slug fails API response.
- Solutions integration preserves filters, card selectors, modal and gallery.
- Homepage popular integration preserves hardcoded fallback.
- Brief supports API slug and legacy id.
- Modal/gallery do not trust raw API URL datasets.
- Service Worker keeps config and API network-only.
- Frontend tests use Node 22 built-in runner.
- Backend regression remains planned and required.
- Backend, package, schema, migration, seed, `.github` and images remain
  unchanged.
- No deployment is performed.

## 28. Rollback boundary

Rollback may remove or revert only:

- `assets/js/runtime-config.js`;
- `assets/js/catalog-api.js`;
- `tests/frontend/**`;
- B8 edits in `assets/js/main.js`;
- B8 script order edits in the 15 listed root HTML pages;
- B8 status state edits in `assets/css/catalog-premium.css`;
- B8 popular empty state edits in `assets/css/home.css`;
- B8 edits in `sw.js`.

Rollback must not:

- change backend code;
- change package files;
- change schema, migrations or seed;
- delete image assets;
- change `.github`;
- create or remove production configuration;
- deploy;
- force reset or rebase.

Functional rollback target is the previous static frontend behavior using
`assets/js/data.js` and `assets/js/main.js`.

## 29. Risks, mitigations and blockers

| Risk | Mitigation |
| --- | --- |
| API outage blanks catalog | Empty config remains static and configured failure uses static fallback |
| Empty API result falls back incorrectly | State machine treats API empty as `api/empty` |
| Same-origin `/api` assumption breaks GitHub Pages | Absolute `apiBaseUrl` validation rejects root-relative `/api` |
| Missing CORS blocks API smoke | Static mode works before CORS and local fake endpoint covers browser fetch |
| `main.js` broad rewrite breaks unrelated flows | Tasks target named seams only and syntax/static contracts cover unrelated pages |
| Unsafe API text reaches HTML | All API text uses `escapeHtml` or `textContent` |
| Unsafe URL reaches `src` or `href` | One sanitizer covers image, destination, internal and API base purposes |
| Stale request overwrites newer data | Per-channel sequence check blocks stale application |
| Pagination loops | Page cap `20`, item cap `1000`, metadata validation |
| Service Worker caches config/API | Path predicates run before shell/cache branches |
| Frontend test scope creates package drift | Node built-in runner and helper modules require no package file |
| Backend regression is skipped | Final checkpoint includes `backend` `npm run check` |

Blockers:

- branch, HEAD or working tree gate mismatch;
- implementation requires a root package file;
- implementation requires a dependency install;
- implementation requires backend or CORS changes;
- static fallback cannot remain functional;
- missing `runtime-config.js` or `catalog-api.js` blanks the site;
- Service Worker cannot exclude config/API requests;
- tests require a real production API;
- sanitizer permits an unsafe URL or text path;
- valid API empty state triggers fallback;
- stale response can overwrite latest state;
- backend/package/schema/migration/seed changes become necessary;
- verification requires push, PR, merge or deploy.
