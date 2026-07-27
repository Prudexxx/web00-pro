# WEB00 Frontend B8 Technical Design

> **For agentic workers:** This is a design specification, not an implementation
> task. Create a separate B8 implementation plan before changing frontend code.

## 1. Goal

B8 connects the static WEB00 public frontend to the completed B7 public catalog
API while preserving the current GitHub Pages-compatible static site.

The goal is a controlled public catalog adapter for:

- `solutions.html` catalog cards, filters, details and gallery;
- `index.html` popular cards;
- `brief.html` solution lookup for both new API slugs and legacy static ids;
- managed B7 responsive image variants;
- safe API-first loading with the existing static catalog as fallback.

B8 must not introduce backend changes, frontend framework runtime, bundling,
frontend secrets, root package files, admin/auth integration, deploy work, PR
work, or public API URL assumptions.

## 2. Preconditions

B8 implementation starts only when these repository checks pass:

```powershell
Set-Location D:\WEB00_BACKEND
git branch --show-current
git rev-parse HEAD
git status --short
git diff --cached --name-only
git diff --check
git ls-remote --heads origin feat/web00-backend-b7
git ls-remote --heads origin feat/web00-backend-b8
```

Expected state:

- branch is `feat/web00-backend-b8`;
- base commit is `f283ff7e20aed97604d702a3b959fe1185794d6b`;
- working tree is clean before B8 implementation;
- staged area is empty before B8 implementation;
- remote B7 exists at `f283ff7e20aed97604d702a3b959fe1185794d6b`;
- remote B8 does not exist;
- B8 remains local-only until the owner explicitly approves push/PR work.

Safe context that B8 may read:

- root HTML pages;
- `assets/js/data.js`;
- `assets/js/main.js`;
- future B8 frontend JS files;
- `assets/css/**`;
- `sw.js`;
- `manifest.webmanifest`;
- B0-B7 docs;
- backend public catalog routes, schemas, types, mappers and tests;
- backend image URL policy and public managed image DTO types.

B8 implementation must not read or print `.env`, `.env.*`, secrets, credentials,
tokens, private keys, database URLs, Storage keys, cookies, or local browser
profiles.

## 3. Fixed decisions

The product decisions are fixed and must not be reopened during B8:

- F2: API-first + static fallback.
- C2: create a separate `assets/js/runtime-config.js`.
- D2: `apiBaseUrl` stays empty until backend deployment.
- S2: show a non-blocking fallback notice only when an API is configured and the
  request fails because of timeout, network, CORS, protocol, HTTP, envelope or
  validation failure.

When `apiBaseUrl` is empty:

- the frontend runs in normal static mode;
- no network catalog request is executed;
- no fallback warning is shown;
- existing static `window.WEB00_DATA` behavior remains the source of truth.

The frontend remains:

- static;
- GitHub Pages-compatible;
- without a bundler;
- without npm runtime dependencies;
- without a frontend framework;
- classic deferred scripts only.

## 4. Scope

B8 implementation scope is limited to:

- public runtime configuration;
- public catalog API client;
- DTO validation and normalization;
- static fallback;
- catalog, popular, brief, modal and gallery integration;
- managed responsive image rendering;
- loading, empty, fallback and fatal UX states;
- timeout, request cancellation and stale-result protection;
- URL and text safety;
- service worker cache policy updates;
- dependency-free frontend tests and manual smoke definition.

## 5. Explicit out-of-scope

B8 does not include:

- backend code changes;
- backend schema, migration, seed or package changes;
- admin UI integration;
- auth frontend integration;
- image upload frontend;
- CORS backend implementation;
- backend deployment;
- production API URL selection;
- Supabase setup;
- payment, leads, support or bug-report API integration;
- client cabinet API integration;
- design redesign;
- broad CSS refactor;
- asset replacement;
- server-side rendering;
- SEO prerender pipeline;
- analytics;
- dependency installation;
- root `package.json`;
- push, PR, merge, tag, release or deploy.

## 6. Existing frontend architecture

The current public frontend is a static multipage site in the repository root.
The root `package.json` is absent. Backend tooling lives in `backend/package.json`
and must not be reused for root frontend dependency management.

Current root pages include `index.html`, `solutions.html`, `services.html`,
`pricing.html`, `brief.html`, `status.html`, `contacts.html`, `app.html`,
`install.html`, `cases.html`, `faq.html`, `how-it-works.html`, legal pages,
and static `landings/**` / `demos/**` pages.

Current public script order on the root pages is two classic deferred scripts:

```html
<script defer src="assets/js/data.js?v=multi-page-1"></script>
<script defer src="assets/js/main.js?v=multi-page-1"></script>
```

`pricing.html` currently loads `assets/js/main.js?v=pricing-tariff-actions-1`.
B8 replaces page script versions with the canonical B8 order defined in this
document.

`assets/js/data.js` defines `window.WEB00_DATA`. It is a static fallback snapshot
and includes:

- `SOLUTIONS`;
- `SOLUTION_GALLERIES`;
- `SERVICES`;
- `PRICING`;
- FAQ and contact data;
- frontend-only/localStorage lead, status, support and bug-report helpers.

Current `SOLUTIONS` records use stable ids such as `mebel`, `medicina`,
`doma-bani`, `site-custom`, and the other current catalog ids. Static fields
include `id`, `legacyTitle`, `title`, `category`, `description`, `priceFrom`,
`deliveryTime`, `features`, `previewImage`, `previewType`, `filter`,
`demoMode`, `demoLocalUrl`, `externalDemoUrl`, `originalDemoUrl`, `demoUrl`
and `active`.

`assets/js/data.js` derives `solution.galleryImages` from
`SOLUTION_GALLERIES[solution.id]`, falling back to `solution.previewImage`.

`assets/js/main.js` is a classic IIFE that reads `window.WEB00_DATA` at script
evaluation time. It currently contains no catalog `fetch`, no `XMLHttpRequest`,
no `axios`, no `AbortController`, and no `window.WEB00_CONFIG` usage.

Important current renderer contracts:

- `esc(value)` escapes text for HTML templates.
- `attr(value)` escapes attribute text and backticks.
- `solutions()` filters active static solutions and de-duplicates by `id`.
- `solutionByIdStrict()` accepts static id, title or legacy title.
- `renderSolutions()` writes `[data-solutions-grid]` with `.solution-card`
  articles.
- card DOM uses `data-solution-card`, `data-category`, `data-solution-id`,
  `[data-card-action]`, `.solution-card__actions` and `.solution-card__action`.
- filters use `[data-filter]` and hide cards through `.is-hidden`.
- `solutionPreview()` renders plain `<img loading="lazy">` when a static preview
  image exists.
- `openSolutionModal()` renders `[data-solution-modal-content]`, gallery stage
  `[data-solution-gallery-main]`, thumbnails `[data-gallery-thumb]` and
  `data-gallery-image`.
- `openDemoModal()` renders `[data-demo-modal-content]`.
- `initBriefPage()` reads `brief.html?solution=...` and calls
  `solutionByIdStrict()`.
- `registerServiceWorker()` registers `sw.js` on HTTPS, `localhost` and
  `127.0.0.1`.

Relevant root DOM surfaces:

- `solutions.html`: `[data-solutions-grid]`, `[data-filter]`,
  `[data-solution-modal-content]`, `[data-demo-modal-content]`.
- `index.html`: `#popular-templates`, `.mock-card-grid`,
  `[data-open-demo-id]`, `[data-demo-modal-content]`.
- `brief.html`: `[data-brief-page-content]`, `[data-brief-back]`.

Current CSS already owns layout for `.solution-card`, `.solution-preview`,
`.solution-preview--image`, `.solution-gallery__stage`,
`.solution-gallery__thumbs`, `.mock-card-grid` and `.mock-template-card`.
B8 must preserve existing wrappers/classes and use the existing aspect-ratio and
object-fit behavior.

GitHub Pages assumptions:

- page links and asset paths are relative;
- no `<base href>` is present;
- `manifest.webmanifest` uses relative `start_url`, `scope`, icons and
  shortcuts;
- canonical URLs point to `https://web00.pro/...`;
- B8 must not assume that `/api` is same-origin or that the production backend
  URL already exists.

## 7. Existing B7 API contract

The public catalog router is mounted under `/api` when a public catalog service
is injected into `createApp`.

Endpoints:

- `GET /api/sites`;
- `GET /api/sites/popular`;
- `GET /api/sites/:slug`;
- `GET /api/categories`;
- `GET /api/categories/:slug`.

Route order registers `/sites/popular` before `/sites/:slug`.

`GET /api/sites` query parameters:

- `page`: integer, default `1`, minimum `1`;
- `limit`: integer, default `12`, minimum `1`, maximum `20`;
- `search`: trimmed string, maximum `100`, empty string omitted;
- `category`: slug;
- `tags`: comma-separated string, normalized to unique lowercase `ru-RU` tags,
  maximum `10`;
- `sort`: `sortOrder`, `newest`, `popular` or `title`, default `sortOrder`.

`GET /api/sites/popular` query parameters:

- `limit`: integer, default `6`, minimum `1`, maximum `20`;
- `category`: slug.

`GET /api/categories` query parameters:

- `includeCounts`: boolean string `true` or `false`, default `false`.

`GET /api/categories/:slug` query parameters:

- `includeSites`: boolean string `true` or `false`, default `false`;
- `page`: integer, default `1`, minimum `1`;
- `limit`: integer, default `12`, minimum `1`, maximum `20`;
- `sort`: same site sort enum, default `sortOrder`.

Unknown query fields are rejected with `400 VALIDATION_ERROR`.

Slug validation is:

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

with maximum length `120`.

Public response envelopes:

- list sites: `{ "data": PublicSiteSummary[], "meta": PaginationMeta }`;
- popular sites: `{ "data": PublicSiteSummary[] }`;
- site detail: `{ "data": PublicSiteDetail }`;
- category list: `{ "data": PublicCategorySummary[] }`;
- category detail without sites: `{ "data": PublicCategoryDetail }`;
- category detail with sites: `{ "data": PublicCategoryDetail, "meta": PaginationMeta }`.

Pagination meta:

```ts
interface PaginationMeta {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}
```

Public site summary:

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

Public site detail adds:

```ts
interface PublicSiteDetail extends PublicSiteSummary {
  fullDescription: string | null;
  publishedAt: string | null;
}
```

Managed image DTO:

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

Compatibility confirmed by B7 code and tests:

- `previewImageUrl` remains in public responses as the legacy-compatible image
  URL field.
- `previewImage` is `null` unless the backend can classify the preview URL as a
  managed B7 preview through `ManagedImageUrlPolicy`.
- legacy gallery records remain readable as `galleryImages[].url` without
  `variants`.
- managed gallery records add `assetId` and `variants` only when `assetId`,
  `storagePath` and strict managed URL parsing all match.
- malformed `galleryImages` JSON maps to safe `500 INTERNAL_ERROR`.
- public API excludes internal UUIDs and internal fields from serialized
  responses.
- draft, archived, inactive, soft-deleted sites and sites in inactive categories
  are not returned.
- category counts include only public-visible sites.
- popular reads do not mutate `views`.

The backend currently has no general public CORS middleware and no public
catalog `Cache-Control` middleware in `createApp`; admin/auth no-store behavior
is separate from public catalog behavior.

## 8. Target script architecture

B8 public pages that use the main public shell must load scripts in this order:

```html
<script defer src="assets/js/data.js?v=b8-1"></script>
<script defer src="assets/js/runtime-config.js?v=b8-1"></script>
<script defer src="assets/js/catalog-api.js?v=b8-1"></script>
<script defer src="assets/js/main.js?v=b8-1"></script>
```

Responsibilities:

`assets/js/data.js`

- remains the existing static fallback snapshot;
- remains the seed-compatible legacy frontend data source;
- contains no API client logic;
- is not mass-rewritten unless a future B8 implementation plan proves a narrow
  compatibility edit is required.

`assets/js/runtime-config.js`

- defines the only public runtime configuration object;
- contains no secrets;
- is the only place where a public API base URL is configured;
- defaults to empty `apiBaseUrl`;
- must be small and reviewable.

`assets/js/catalog-api.js`

- validates runtime config;
- owns the public catalog API client;
- owns timeout and request cancellation;
- owns pagination loading;
- validates response envelopes;
- validates DTO shape;
- normalizes API and static data to one frontend model;
- applies fallback policy;
- sanitizes URLs;
- creates responsive image HTML helpers or image descriptor helpers;
- protects against stale responses;
- performs no direct page DOM rendering.

`assets/js/main.js`

- remains the DOM integration layer;
- preserves existing filters, modals, gallery, brief and demo behavior;
- consumes a unified normalized catalog;
- renders loading, empty, fallback and fatal states;
- does not contain a hardcoded production API origin;
- does not become the API client.

Global namespace contract:

- `window.WEB00_CONFIG`: runtime config.
- `window.WEB00_CATALOG`: frozen public API exposed by `catalog-api.js`.
- `window.WEB00_DATA`: static fallback snapshot.

`main.js` must tolerate missing `window.WEB00_CATALOG` by using static mode so a
single failed script cannot blank the public site.

## 9. Runtime configuration

Canonical config:

```js
window.WEB00_CONFIG = Object.freeze({
  apiBaseUrl: "",
  requestTimeoutMs: 8000,
  staticFallbackEnabled: true
});
```

`apiBaseUrl` validation:

- empty string is valid;
- empty string means normal static-only mode;
- empty string executes no network request;
- non-empty value must be an absolute URL;
- production protocol must be `https:`;
- `http:` is valid only for `localhost`, `127.0.0.1` and `[::1]`;
- username and password are forbidden;
- query string is forbidden;
- fragment is forbidden;
- trailing slash is removed from pathname;
- root-relative `/api` is invalid;
- `javascript:`, `data:`, `file:`, `blob:` and every non-HTTP(S) scheme are
  invalid;
- invalid config executes no fetch;
- invalid config puts the frontend into safe static mode;
- invalid config is developer-observable through console warning only, not a
  public UI warning.

Canonical `apiBaseUrl` remains `""` until backend deployment. No production API
URL is hardcoded in B8.

`requestTimeoutMs` validation:

- must be an integer;
- canonical value is `8000`;
- valid range is `1000..30000`;
- invalid value becomes `8000`.

`staticFallbackEnabled` validation:

- must be boolean;
- canonical value is `true`;
- invalid value becomes `true`.

Config is public website configuration, not a secret. B8 must not introduce a
frontend `.env` model.

## 10. Catalog source state model

Exact source values:

```ts
type CatalogSource = "api" | "static" | "static-fallback";
```

`api`:

- `apiBaseUrl` is non-empty and valid;
- API request succeeds;
- response envelope passes validation;
- DTOs pass validation and normalization;
- data comes from B7 public API.

`static`:

- `apiBaseUrl` is empty or invalid;
- frontend runs the normal static website mode;
- no catalog request is executed;
- no fallback warning is shown.

`static-fallback`:

- `apiBaseUrl` is non-empty and valid;
- an API request was attempted;
- timeout, network, CORS, protocol, HTTP, content-type, JSON, envelope,
  pagination or validation failure occurred;
- static fallback data is available and valid;
- the S2 fallback notice is shown on the solutions page only.

Additional lifecycle state:

```ts
type CatalogLifecycle = "loading" | "ready" | "empty" | "fallback" | "fatal";
```

Rules:

- configured API pending request is `loading`;
- successful API response with at least one valid item is `ready`;
- successful API response with a valid empty list is `empty`;
- empty API list never triggers static fallback;
- fallback occurs only after configured API failure;
- missing or invalid static fallback plus configured API failure is `fatal`;
- no automatic retry exists in B8;
- page refresh is the next request attempt;
- static mode with valid static data is `ready`;
- static mode with empty valid static data is `empty`;
- static mode with invalid static data is `fatal`.

## 11. API client and request lifecycle

Fetch options:

```js
{
  method: "GET",
  credentials: "omit",
  mode: sameOriginApi ? "same-origin" : "cors",
  cache: "no-store",
  redirect: "error",
  headers: { Accept: "application/json" },
  signal
}
```

Rules:

- only GET is used;
- no Authorization header is sent;
- no cookies are sent;
- no custom headers beyond safelisted `Accept`;
- no body is sent;
- simple CORS GET is preserved;
- `response.ok` is required;
- `Content-Type` must include `application/json`;
- JSON parsing is wrapped and failure is controlled;
- response envelope is validated before mapping;
- HTTP errors use static fallback when fallback is enabled;
- technical error details are not rendered publicly.

Endpoint helpers in `catalog-api.js`:

- `loadAllSites()`: uses `GET /api/sites`;
- `loadPopularSites()`: uses `GET /api/sites/popular`;
- `loadCategories()`: uses `GET /api/categories`;
- `loadCategoryDetail(slug)`: uses `GET /api/categories/:slug`;
- `loadSiteDetail(slug)`: uses `GET /api/sites/:slug`.

B8 initial DOM integrations:

- `solutions.html` calls `loadAllSites()` when API is configured.
- `solutions.html` does not call `/api/categories` in the initial B8 UI because
  current filter buttons are a fixed public taxonomy and must remain stable.
- `index.html` calls `loadPopularSites({ limit: 3 })` when API is configured.
- `brief.html` uses the same unified catalog lookup as `solutions.html`; it does
  not perform a separate detail request in initial B8.
- `/api/sites/:slug` helper may exist for future detail use but is not required
  for initial B8 DOM integration.

Each logical request channel owns its own controller and sequence:

- catalog channel;
- popular channel;
- categories channel.

A load cycle:

1. abort the previous controller in the same channel;
2. increment the request sequence;
3. create a new `AbortController`;
4. create a timeout using the validated `requestTimeoutMs`;
5. fetch, validate and map;
6. apply the result only if the sequence matches the latest channel sequence;
7. clear the timeout in `finally`;
8. release controller references in `finally`;
9. convert superseded `AbortError` to silent cancellation;
10. convert timeout/network/CORS/protocol failures to fallback where allowed.

Stale success cannot overwrite newer state. No unhandled promise rejection is
allowed. Page unload requires no persistent state.

## 12. Pagination and response validation

Solutions catalog loading uses this exact behavior:

- request page `1` with `limit=20` and `sort=sortOrder`;
- read the returned `meta`;
- load additional pages sequentially;
- preserve backend order exactly;
- maximum pages requested: `20`;
- maximum accumulated item count: `1000`;
- stop when `page >= meta.totalPages`;
- stop when the next page returns an empty `data` array;
- stop when the safety item cap is reached and treat cap reach as controlled API
  validation failure;
- inconsistent pagination metadata is controlled API validation failure;
- duplicate API slug invalidates the whole API response;
- API validation failure activates static fallback when enabled.

Pagination validation:

- `data` must be an array;
- `meta.page`, `meta.limit`, `meta.total` and `meta.totalPages` must be
  non-negative safe integers where applicable;
- requested page response must match the page number requested;
- `meta.limit` must be within `1..20`;
- `meta.totalPages` must equal `0` when `total` is `0`;
- when `total > 0`, `meta.totalPages` must equal `Math.ceil(total / limit)`;
- a non-empty page number greater than `totalPages` is invalid;
- a later page may be empty only as a stop condition after at least one valid
  page; if metadata claims more pages, that is invalid.

Malformed single API items are rejected from the list. If every API item is
invalid, the API response fails and static fallback activates. Duplicate slug is
global response failure, not single-item rejection.

Popular loading:

- request `/api/sites/popular?limit=3`;
- validate `{ data: [] }`;
- keep API empty result as empty popular content for that API run;
- do not fall back on a valid empty list.

## 13. Normalized frontend model

`catalog-api.js` exposes one normalized model to `main.js`:

```ts
interface NormalizedCatalogItem {
  key: string;
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  category: string;
  categorySlug: string;
  tags: string[];
  features: string[];
  priceLabel: string;
  deliveryLabel: string;
  demoMode: string;
  demoUrl: string;
  siteUrl: string;
  previewImageUrl: string;
  previewImage: NormalizedImage | null;
  galleryImages: NormalizedImage[];
  source: CatalogSource;
  aliases: string[];
}

interface NormalizedImage {
  url: string;
  alt: string;
  variants: NormalizedImageVariant[];
}

interface NormalizedImageVariant {
  avifUrl: string;
  webpUrl: string;
  width: number;
}
```

Canonical keys:

- API item `key` is `slug`;
- API item `id` is also `slug` for current DOM and `brief.html?solution=...`
  compatibility;
- static item `key` and `id` are the existing stable static `id`;
- API lookup aliases include slug and any matched legacy static id;
- static lookup aliases include id, slug-like id, title and legacy title.

Mapping from B7 DTO to normalized item:

- `slug` -> `key`, `id`, `slug`;
- `title` -> `title`;
- `shortDescription` -> `shortDescription`;
- `category.title` -> `category`;
- `category.slug` -> `categorySlug`;
- `category.slug` -> current card `data-category`;
- `tags` -> normalized unique `tags`;
- `features` -> normalized unique `features`;
- `priceLabel` -> `priceLabel`;
- when `priceLabel` is empty and `priceAmountCents` exists, display label is
  generated as a safe ruble amount;
- `deliveryLabel` -> `deliveryLabel`;
- when `deliveryLabel` is empty and `developmentDays` exists, display label is
  generated as `от N дней`;
- `demoMode` -> `demoMode`;
- `demoUrl` -> sanitized `demoUrl`;
- `siteUrl` -> sanitized `siteUrl`;
- `previewImageUrl` -> sanitized fallback URL;
- `previewImage` with variants -> `NormalizedImage`;
- `galleryImages` -> sorted sanitized `NormalizedImage[]`.

Mapping from static `WEB00_DATA.SOLUTIONS`:

- `id` -> `key`, `id`, `slug`;
- `title` -> `title`;
- `description` -> `shortDescription`;
- `category` -> `category`;
- `filter` or `previewType` -> `categorySlug`;
- `features` -> `features`;
- `priceFrom` -> `priceLabel`;
- `deliveryTime` -> `deliveryLabel`;
- `demoMode`, `demoLocalUrl`, `externalDemoUrl`, `originalDemoUrl` -> `demoMode`
  and `demoUrl` through the existing behavior;
- `previewImage` -> legacy `NormalizedImage`;
- `galleryImages` -> legacy `NormalizedImage[]`.

Normalization rules:

- all strings are trimmed;
- arrays are copied and never reused by reference;
- duplicate tags/features are removed after trimming;
- unknown DTO properties are ignored;
- required card fields are `slug`, `title`, `shortDescription` and public
  category slug/title for API items;
- a malformed API item is rejected from the list;
- all invalid item URLs are dropped field-by-field unless the URL is required
  for the only image in that item;
- no raw DTO object is stored on DOM elements;
- DOM identifiers use only validated slug/id strings.

## 14. URL and text safety

B8 adds pure URL sanitizers in `catalog-api.js`.

Allowed destination URLs:

- `https:` absolute URLs;
- `http:` absolute URLs only for `localhost`, `127.0.0.1` and `[::1]`;
- same-origin relative page URLs only for existing frontend page flows such as
  `brief.html`, `solutions.html`, `pricing.html` and local demo paths.

Rejected URLs:

- `javascript:`;
- `data:`;
- `file:`;
- `blob:`;
- credentials in URL;
- query/fragment where a contract forbids them;
- control characters;
- malformed percent encoding;
- protocol-relative URLs;
- root-relative API URLs such as `/api`;
- invalid relative paths that escape the current site base path.

Images:

- managed B7 image URLs must be HTTPS outside local development;
- legacy relative image paths are allowed only when they resolve inside the
  current website origin/base path;
- invalid image URLs are skipped;
- original filenames are never displayed or used.

`demoUrl` and `siteUrl`:

- allow HTTPS and localhost HTTP only;
- external links render with `target="_blank"` and `rel="noopener noreferrer"`;
- existing internal demo behavior is preserved for same-site relative demos;
- invalid demo URL means the card opens details or lead flow exactly as a no-demo
  static card does.

Text safety:

- existing `esc()` and `attr()` helpers remain valid for existing template
  architecture;
- every API string inserted into an HTML template is escaped;
- new loading, notice, empty and fatal nodes use `textContent`;
- arrays render item by item;
- no API string is inserted as raw HTML;
- HTML descriptions are not supported;
- event-handler attributes from data are forbidden;
- style attributes from API are forbidden;
- dataset values use validated slug/id/category values;
- no full DOM rewrite is required solely to remove existing `innerHTML`, but any
  new API text path must use escaping or `textContent`.

## 15. Responsive image rendering

Managed B7 images render as:

```html
<picture>
  <source type="image/avif" srcset="...">
  <source type="image/webp" srcset="...">
  <img src="..." alt="..." loading="lazy" decoding="async">
</picture>
```

Rules:

- AVIF source is first;
- WebP source is second;
- variants are sorted ascending by `width`;
- duplicate widths are removed;
- invalid width values are removed;
- invalid variant URLs are removed;
- `srcset` syntax is exactly `<url> <width>w`;
- empty sources are omitted;
- `<picture>` is omitted for a legacy image without valid variants;
- `img src` fallback order is largest valid WebP, `previewImageUrl`, gallery
  item `url`, static legacy URL;
- non-hero catalog and gallery images use `loading="lazy"`;
- every image uses `decoding="async"`;
- explicit `width` and `height` are added only if reliable dimensions exist;
- current wrapper classes are preserved;
- current aspect-ratio and object-fit CSS are preserved;
- alt text is gallery `alt`, otherwise site title;
- no layout redesign is introduced.

Homepage popular images:

- first visible popular image may use `loading="eager"`;
- remaining popular images use `loading="lazy"`;
- `fetchpriority` is not used in B8 because no measured need exists.

B7 backend variant width policy is derived from `selectVariantWidths()`:

- possible generated widths are `480`, `960`, `1600`, plus original width when
  the original width is below `1600`;
- no variant is larger than the original;
- B8 trusts B7 DTO widths only after frontend validation.

## 16. Solutions page integration

`solutions.html` preserves the current catalog grid, filter buttons, modals and
gallery layout.

B8 may add stable status nodes near `[data-solutions-grid]` for:

- loading;
- fallback notice;
- empty;
- fatal.

The renderer consumes `NormalizedCatalogItem[]` only.

Rules:

- API configured: show loading state while the API request is pending;
- API success: render normalized API cards;
- API success with empty list: render empty state, not static fallback;
- API failure with static fallback: render static fallback cards and S2 notice;
- API failure without static fallback: render fatal state;
- empty config: render static cards and no notice;
- filters remain client-side and operate on normalized `categorySlug`;
- no API request is made on each filter click;
- no API request is made on each search keystroke;
- B8 does not expand URL query params unless existing behavior already supports
  them;
- static fallback remains complete.

Existing classes and data attributes remain:

- `.solution-card`;
- `.solution-preview`;
- `.solution-preview--image`;
- `.solution-card__body`;
- `.solution-card__actions`;
- `.solution-card__action`;
- `data-solution-card`;
- `data-category`;
- `data-solution-id`;
- `data-card-action`.

## 17. Homepage popular integration

`index.html` currently contains hardcoded popular cards in `.mock-card-grid`.
Those cards remain initial and fallback content.

B8 behavior:

- empty config: keep hardcoded popular cards;
- configured API loading: keep hardcoded cards visible until API success;
- API success: replace the popular grid with normalized API cards;
- valid empty API popular result: render a compact empty popular state without
  showing static fallback as live API data;
- configured API failure: leave hardcoded static popular cards in place;
- no fallback warning is shown on the homepage;
- no content flash to empty is allowed;
- `[data-open-demo-id]` behavior must continue for both legacy ids and API slugs.

The popular renderer reuses the same normalization and image helper as the
solutions card renderer where practical. It must not introduce a second raw B7
DTO mapper.

## 18. Brief and modal/gallery integration

`brief.html` lookup supports both API slugs and legacy static ids.

Exact lookup order:

1. normalized slug;
2. normalized legacy id;
3. static aliases from `WEB00_DATA`;
4. existing not-found/default UX.

B8 uses the unified loaded catalog. It does not require a separate detail fetch
for initial `brief.html` integration.

Modal and gallery rules:

- cards, details, demo and brief flows receive normalized items only;
- managed preview/gallery variants are supported through image helpers;
- legacy preview/gallery URLs remain supported;
- invalid images are skipped safely;
- gallery order follows normalized `sortOrder` when provided;
- duplicate gallery URLs are removed after sanitization;
- thumbnail click updates the main image or picture through a helper, not by
  directly trusting `data-gallery-image` from an API DTO;
- there is one normalized DTO mapper for cards, modals, galleries and brief.

`/api/sites/:slug` helper exists for future detail flows but does not become the
default B8 detail-page architecture.

## 19. Loading, empty, fallback and fatal UX

Fallback notice canonical text:

```text
Показаны сохранённые данные. Обновление временно недоступно.
```

Fallback notice rules:

- shown only on the solutions/catalog page;
- shown only for `source="static-fallback"`;
- not shown for `source="static"`;
- not shown on homepage;
- non-blocking;
- `role="status"`;
- `aria-live="polite"`;
- created with `textContent`;
- no technical error details;
- hidden after successful API result;
- no retry button in B8.

Loading:

- shown only while a configured API request is pending;
- does not destructively blank existing static homepage popular content;
- solutions grid may show a lightweight status;
- no full-page spinner dependency is introduced.

Empty:

- valid API result with zero items;
- message is:

```text
Подходящих решений пока нет.
```

Fatal:

- used only when configured API fails and static fallback is unavailable or
  invalid;
- safe message is:

```text
Каталог временно недоступен.
```

All status elements:

- are accessible;
- do not trap focus;
- do not shift layout excessively;
- do not include stack traces, request IDs, provider names or raw URLs.

## 20. Service worker policy

Current `sw.js` uses `WEB00_CACHE = "web00-shell-v2"`, precaches a small shell
asset list, network-first caches navigation/HTML, and cache-first handles CSS and
shell assets on the same origin.

B8 service worker policy:

- bump cache name to `web00-shell-v3-b8`;
- preserve navigation fallback behavior;
- preserve offline availability of static shell assets;
- include B8 static JS shell assets consistently with the existing strategy:
  `assets/js/data.js`, `assets/js/catalog-api.js` and `assets/js/main.js`;
- keep `assets/js/runtime-config.js` network-only;
- never store `runtime-config.js` in Cache Storage;
- never cache API origins or API paths;
- if API is same-origin in a future deployment, same-origin `/api/` requests are
  network-only and excluded before any shell/CSS cache branch;
- if API is cross-origin, the service worker does not intercept it;
- service worker does not implement API fallback logic;
- activation deletes obsolete `web00-shell-*` caches only;
- no cross-origin API response caching;
- no service worker update loop.

Version-query interaction:

- browser and Cache Storage treat query strings as part of the request URL;
- `?v=b8-1` produces a distinct cached request from `?v=multi-page-1`;
- service worker URL matching for cache policy must use `url.pathname` when
  deciding whether a request is config/API/shell, so query versions do not make
  config or API accidentally cacheable.

## 21. Future CORS/deployment contract

CORS implementation is outside B8 frontend code scope. B8 must work in static
mode before CORS deployment.

Future backend deployment requirements:

- allowed origins are exact deployed frontend origins only;
- production custom domain origin is added only when confirmed;
- GitHub Pages origin is added only when confirmed;
- local development origins are added only when explicitly configured;
- wildcard origin is not recommended;
- credentials are false for public catalog frontend reads;
- public methods are `GET`, `HEAD` and `OPTIONS` as required;
- no auth cookies are used;
- no Authorization header is needed;
- `Vary: Origin` is returned when origin-based CORS is used;
- preflight is minimized through simple GET requests;
- production API URL remains a deployment-time value written into
  `runtime-config.js` only after the backend origin is approved.

B8 must not assume same-origin `/api`.

## 22. Testing strategy

B8 adds no runtime dependencies and no root package manager files.

Current inspection:

- root `package.json` is absent;
- backend has `backend/package.json` with Vitest for backend tests;
- backend package files are outside B8 frontend design scope.

Frontend automated tests use standalone Node 22 scripts:

- location: `tests/frontend/*.test.mjs` or `scripts/frontend-*.mjs`;
- runner: Node built-in `node --test`;
- assertions: `node:assert/strict`;
- script evaluation: Node `vm` or another dependency-free native mechanism;
- fake `window`, `document`, `fetch`, `AbortController` and timers are local to
  tests;
- no `jsdom` dependency;
- no frontend framework;
- no package changes.

Test command shape:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
& $PortableNode --test tests/frontend/*.test.mjs
```

`catalog-api.js` may expose pure helpers for tests through
`window.WEB00_CATALOG_TESTS` only when `window.WEB00_TEST_MODE === true` before
script evaluation. Production runtime must not depend on the test namespace.

Required automated coverage:

- runtime config: empty URL static mode, valid HTTPS, localhost HTTP, reject
  relative `/api`, reject credentials/query/fragment, timeout default and range;
- API client: success, non-2xx, wrong content type, invalid JSON, invalid
  envelope, timeout, abort, stale result, pagination, page safety cap, duplicate
  slug, valid empty result, configured failure to static fallback, empty config
  static without warning;
- mapper: API DTO, static DTO, legacy id aliases, missing optional fields,
  malformed item policy, URL sanitization, XSS strings escaped, arrays copied and
  normalized;
- images: AVIF/WebP srcset, width sorting, duplicate widths removed, invalid
  variant URL removed, legacy image fallback, alt fallback;
- page/static checks: script order, stable DOM nodes, no hardcoded production API
  URL, service worker excludes config/API, no secrets/env, popular fallback
  remains, brief lookup supports slug and id.

Manual smoke matrix:

- desktop index popular, static mode;
- mobile index popular, static mode;
- desktop solutions initial load, static mode;
- mobile solutions initial load, static mode;
- API success using local fake/mock endpoint;
- API timeout fallback;
- API network/CORS failure fallback;
- filters;
- modal;
- gallery;
- brief with API slug;
- brief with legacy static id;
- fallback notice;
- responsive managed image fallback;
- service worker update after `web00-shell-v3-b8`.

No real production API is required for default automated tests.

## 23. File map

Likely create in a future B8 implementation:

- `assets/js/runtime-config.js`;
- `assets/js/catalog-api.js`;
- `tests/frontend/catalog-api.test.mjs`;
- `tests/frontend/static-page-contract.test.mjs`;
- optional small dependency-free frontend smoke script under `scripts/`.

Likely modify in a future B8 implementation:

- `assets/js/main.js`;
- `index.html`;
- `solutions.html`;
- `brief.html`;
- other root HTML pages only where script order requires it;
- `sw.js`;
- narrow CSS additions for loading, notice, empty and fatal states if existing
  classes are insufficient.

Expected not to modify:

- `backend/**`;
- `backend/package.json`;
- `backend/package-lock.json`;
- `backend/prisma/**`;
- `.github/**`;
- assets/images;
- `assets/js/data.js` except for a narrow compatibility edit proven necessary by
  the future implementation plan.

Package strategy:

- no root package file;
- no dependency installation;
- no backend package change for frontend tests.

## 24. Acceptance criteria

B8 implementation is acceptable only when:

- F2, C2, D2 and S2 are implemented exactly;
- `apiBaseUrl` is empty initially;
- empty-config mode performs no network request;
- normal static mode shows no fallback warning;
- configured API failure produces static fallback notice on solutions page;
- API empty result remains empty and does not activate fallback;
- static fallback is preserved;
- no production API URL is hardcoded;
- no frontend secret or `.env` model is introduced;
- there is one API client;
- there is one normalized mapper;
- existing UI architecture is preserved;
- existing DOM classes and wrappers are preserved;
- AVIF/WebP `<picture>` support exists for managed images;
- legacy images remain supported;
- URL and text safety rules are implemented;
- timeout, cancellation and stale-response protection are implemented;
- service worker does not cache runtime config or API responses;
- backend/CORS/deploy implementation is absent;
- tests require no production network;
- no product questions remain open;
- no placeholder markers remain in source or docs created by B8.

## 25. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| API outage blanks the public catalog | API-first with static fallback; empty config remains normal static mode; fatal only when both API and static fallback are unavailable |
| Empty valid API result is mistaken for failure | Source state rules separate `empty` from `static-fallback`; valid empty list never falls back |
| Same-origin `/api` assumption breaks GitHub Pages | `apiBaseUrl` must be absolute; root-relative `/api` is invalid; default config is empty |
| CORS is missing during frontend work | B8 works in static mode without CORS; CORS remains future deployment contract |
| `main.js` becomes hard to maintain | `catalog-api.js` owns API, mapping and safety; `main.js` owns DOM integration |
| Raw API text reaches `innerHTML` | escape all API text, use `textContent` for new status nodes, forbid raw HTML descriptions |
| Unsafe URLs are interpolated into HTML | pure sanitizer validates images, demo URLs, site URLs and relative page paths before rendering |
| Stale response overwrites newer data | per-channel request sequence and AbortController lifecycle |
| Pagination loops indefinitely | max 20 pages, max 1000 items, metadata validation and stop conditions |
| Duplicate API slugs break lookup | duplicate slug invalidates the API response and activates static fallback |
| Managed image variants regress layout | preserve existing wrappers/classes/aspect-ratio/object-fit; add `<picture>` inside existing image surfaces |
| Service worker serves stale config | runtime-config.js is network-only and never stored in Cache Storage |
| Homepage flashes empty content | keep hardcoded popular cards until API success; no prominent homepage warning |
| Frontend tests create dependency creep | use Node built-in test runner and fake browser primitives; no root package files |

## 26. Rollback boundary

B8 rollback after implementation is limited to:

- `assets/js/runtime-config.js`;
- `assets/js/catalog-api.js`;
- narrow B8 edits in `assets/js/main.js`;
- B8 script-order edits in root HTML pages;
- B8 status CSS additions;
- B8 service worker edits;
- B8 frontend test scripts.

Rollback must not:

- modify backend code;
- modify backend schema, migrations or seed data;
- modify package files;
- delete static catalog data;
- delete assets/images;
- change `.github`;
- run reset/rebase/force operations;
- deploy or change production settings.

Static fallback means the functional rollback target is the pre-B8 static
frontend behavior using `assets/js/data.js` and `assets/js/main.js`.

## 27. Implementation-plan handoff

The next step after this design is a separate B8 implementation plan. That plan
must be file-scoped, test-scoped and verification-scoped, and must preserve every
fixed decision in this design.

The implementation plan must sequence work as one B8-sized frontend phase:

- runtime config contract;
- catalog API client and tests;
- normalization and safety helpers;
- solutions integration;
- homepage popular integration;
- brief/modal/gallery integration;
- responsive images;
- service worker policy;
- final static/frontend verification.

The implementation plan must keep backend, CORS deployment, production API URL,
admin/auth/upload, package installs, push, PR, merge and deploy outside B8 code
implementation.
