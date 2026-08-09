# WEB00 Zero-Stale Catalog Runtime P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current static-first catalog boot with a Cloud-manifest-authoritative, verified-cache runtime that renders one complete catalog revision atomically, survives Cloud/VPN failure safely, and escapes the legacy Service Worker without stale runtime code.

**Architecture:** First Zero-Stale deployment uses NEW PHYSICAL runtime paths, while legacy runtime files remain temporarily in repo. v2 catalog-runtime owns manifest lifecycle, early prime, SHA validation, verified Cache Storage, and degraded verified fallback; v2 catalog-api owns page catalog state, freshness semantics, and static disaster fallback; v2 main owns skeleton, atomic render, retry promotion, and solutions/home/brief integration. Backend Atomic protocol remains unchanged.

**Tech Stack:** Browser JS, Cache Storage API, Web Crypto SHA-256, Fetch/AbortController, Service Worker Cache API, Node.js 22 built-in tests, existing fake-browser/vm harnesses.

## Global Constraints

- Manifest revision + SHA256 = freshness authority.
- Local cache alone NEVER establishes current state.
- Every cached snapshot read recomputes SHA256.
- Validate schema/revision/itemsCount before render.
- One revision = one atomic grid render.
- No static -> Cloud flash.
- No card-by-card promotion.
- No deleted-card ghost.
- No old-title -> new-title flash.
- data.js = disaster fallback only.
- degraded verified fallback only after definitive Cloud failure/timeout.
- Render outside visitor catalog path.
- GitHub outside catalog runtime/CRUD.
- No backend CRUD changes.
- No Supabase schema changes.
- No Cloud snapshot schema changes.
- No Atomic reconciler protocol changes.
- No weakening demo URL / image URL security.
- First SW migration MUST NOT rely on query strings.
- New SW MUST NOT use ignoreSearch for new runtime code.
- No production actions during implementation.
- Do not mix image upload limit work into this branch.

---

## File Structure

### New Physical Runtime Files

- Create: `assets/js/catalog-v2/catalog-runtime.js`
  - Responsibility: Cloud manifest lifecycle, early manifest priming, exact manifest/snapshot validation, SHA-256 verification, verified Cache Storage, verified metadata commit protocol, degraded verified fallback.
- Create: `assets/js/catalog-v2/catalog-api.js`
  - Responsibility: public catalog state model, source/freshness/lifecycle semantics, normalized item API, Cloud-primary bootstrap state, static disaster fallback, existing URL/image/demo safety preservation.
- Create: `assets/js/catalog-v2/main.js`
  - Responsibility: solutions/home/brief integration, skeleton-first boot, whole-grid atomic render, retries, status nodes, and no static current render while Cloud authority is unresolved.
- Create: `tests/frontend/fixtures/legacy-sw-v6.js`
  - Responsibility: frozen copy of the current `sw.js` before v7 changes, used to prove legacy `ignoreSearch` behavior and physical-path escape.

### Existing Files Expected To Change

- Modify: `sw.js`
  - Upgrade shell cache namespace to `web00-shell-v7-zero-stale`, retire old `web00-shell-*`, make catalog-v2 runtime requests network-first with exact URL identity, keep runtime-config network-only, keep Cloud manifest outside shell cache.
- Modify: `solutions.html`
  - Add Cloud preconnect, switch all catalog runtime scripts to v2 together, preserve catalog state nodes, keep shell immediate.
- Modify: `index.html`
  - Add Cloud preconnect, switch all catalog runtime scripts to v2 together, use stable popular-card skeleton instead of static current cards during Cloud-primary bootstrap.
- Modify: `brief.html`
  - Add Cloud preconnect, switch all catalog runtime scripts to v2 together, wait for current-or-degraded catalog state before selected-solution lookup.
- Modify: all root pages currently loading the old runtime script set:
  - `app.html`
  - `brief.html`
  - `cabinet.html`
  - `cases.html`
  - `consent-personal-data.html`
  - `contacts.html`
  - `faq.html`
  - `how-it-works.html`
  - `index.html`
  - `install.html`
  - `pricing.html`
  - `privacy-policy.html`
  - `services.html`
  - `solutions.html`
  - `status.html`
- Modify: `assets/css/catalog-premium.css`
  - Add stable skeleton grid/card styles for solutions and status states without changing unrelated catalog visuals.

### Legacy Files To Keep Temporarily Unchanged

- Keep present: `assets/js/catalog-runtime.js`
- Keep present: `assets/js/catalog-api.js`
- Keep present: `assets/js/main.js`

These legacy files remain available for rollback and for the v6 migration fixture. They are not the script targets for the first Zero-Stale deployment.

### Tests Expected To Change

- Modify: `tests/frontend/service-worker-catalog-cache.test.mjs`
- Modify: `tests/frontend/service-worker-contract.test.mjs`
- Modify: `tests/frontend/static-page-contract.test.mjs`
- Modify: `tests/frontend/catalog-resilience.test.mjs`
- Modify: `tests/frontend/catalog-main-retry.test.mjs`
- Modify: `tests/frontend/catalog-normalization.test.mjs`

---

## Shared Interfaces

### `window.WEB00_CATALOG_RUNTIME`

```js
{
  primeManifest(config, options = {}),
  loadCatalogFromRuntime(config, options = {}),
  loadVerifiedFallback(options = {}),
  sha256HexFromArrayBuffer(buffer),
  validateRuntimeManifest(input),
  validateRuntimeSnapshot(input, manifest)
}
```

`primeManifest(config, options = {})` returns a Promise resolving to:

```js
{
  manifest,
  source: "network",
  transport: "manifest-prime"
}
```

`loadCatalogFromRuntime(config, options = {})` returns a Promise resolving to:

```js
{
  manifest,
  snapshot,
  freshness: "ready-current",
  transport: "network" | "verified-cache",
  cacheStatus: "hit" | "miss" | "write-failed"
}
```

`loadVerifiedFallback(options = {})` returns a Promise resolving to either `null` or:

```js
{
  manifest: {
    schemaVersion,
    revision,
    sha256,
    snapshotPath,
    snapshotUrl,
    itemsCount,
    generatedAt
  },
  snapshot,
  freshness: "degraded-verified",
  transport: "verified-cache",
  cacheStatus: "fallback"
}
```

### `window.WEB00_CATALOG`

```js
{
  getInitialCatalog(options = {}),
  resolveCatalogForPage(options = {}),
  getStaticCatalog(options = {}),
  findCatalogItem(items, identifier),
  sanitizePublicUrl(value, options = {}),
  buildResponsiveImageModel(image, fallback = {}),
  renderResponsiveImageHtml(model, options = {})
}
```

`getInitialCatalog()` for `catalogRuntimeMode === "cloud-primary"` returns bootstrap state, never static or LKG current content:

```js
{
  source: "bootstrap",
  lifecycle: "loading",
  freshness: "bootstrap",
  transport: "none",
  revision: null,
  sha256: "",
  items: [],
  settings: { showDemoInModal: false },
  errorCode: "",
  staticFallbackActive: false,
  degraded: false
}
```

`resolveCatalogForPage({ kind, limit, currentState })` returns one of:

```js
{
  source: "cloud",
  lifecycle: "ready",
  freshness: "ready-current",
  transport: "network" | "verified-cache",
  revision,
  sha256,
  items,
  settings,
  errorCode: "",
  staticFallbackActive: false,
  degraded: false
}
```

```js
{
  source: "cloud",
  lifecycle: "ready",
  freshness: "degraded-verified",
  transport: "verified-cache",
  revision,
  sha256,
  items,
  settings,
  errorCode,
  staticFallbackActive: true,
  degraded: true
}
```

```js
{
  source: "static",
  lifecycle: "ready" | "empty",
  freshness: "degraded-static",
  transport: "static",
  revision: null,
  sha256: "",
  items,
  settings: { showDemoInModal: false },
  errorCode,
  staticFallbackActive: true,
  degraded: true
}
```

Allowed freshness values:

```js
["bootstrap", "loading-current", "ready-current", "degraded-verified", "degraded-static", "fatal"]
```

---

### Task 1: Legacy SW Red Proof

**Files:**
- Create: `tests/frontend/fixtures/legacy-sw-v6.js`
- Modify: `tests/frontend/service-worker-catalog-cache.test.mjs`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**
- Consumes: current `sw.js` v6 behavior with `WEB00_CACHE = "web00-shell-v6-catalog-network-first"` and `caches.match(request, { ignoreSearch: true })`.
- Produces: failing tests that prove query-string-only runtime migration is unsafe and new physical `assets/js/catalog-v2/*` paths are required.

- [ ] **Step 1: Create the frozen v6 SW fixture**

Copy the exact current `sw.js` contents into `tests/frontend/fixtures/legacy-sw-v6.js`.

The fixture file must begin:

```js
const WEB00_CACHE = "web00-shell-v6-catalog-network-first";
```

The fixture file must still include:

```js
caches.match(request, { ignoreSearch: true })
```

- [ ] **Step 2: Write the failing legacy query-string test**

In `tests/frontend/service-worker-catalog-cache.test.mjs`, add a test that loads the fixture instead of current `sw.js`:

```js
test("legacy v6 service worker can satisfy query-string-only runtime migration with old cached bytes", async () => {
  const worker = await loadServiceWorker({
    sourcePath: "tests/frontend/fixtures/legacy-sw-v6.js",
    fetchHandler: async () => jsResponse("window.__NEW_RUNTIME__ = true;"),
  });
  await worker.put(
    "web00-shell-v6-catalog-network-first",
    "https://web00.pro/assets/js/main.js",
    "window.__OLD_RUNTIME__ = true;",
  );
  worker.clearOperations();

  const response = await worker.fetch("https://web00.pro/assets/js/main.js?v=zero-stale");

  assert.equal(await response.text(), "window.__OLD_RUNTIME__ = true;");
  assert.equal(worker.fetchCalls.length, 0);
  assert.equal(worker.operations[0].type, "cache.match");
});
```

If the helper cannot yet load a fixture path, add this exact helper signature in the same test file:

```js
async function loadServiceWorker(options = {}) {
  const source = await readFile(options.sourcePath || "sw.js", "utf8");
  return createWorkerHarness(source, options);
}
```

- [ ] **Step 3: Write the physical path escape test**

Add:

```js
test("legacy v6 service worker cannot satisfy catalog-v2 physical runtime paths from old shell entries", async () => {
  const worker = await loadServiceWorker({
    sourcePath: "tests/frontend/fixtures/legacy-sw-v6.js",
    fetchHandler: async (request) => jsResponse(`network:${new URL(request.url).pathname}`),
  });
  await worker.put("web00-shell-v6-catalog-network-first", "https://web00.pro/assets/js/main.js", "old main");
  await worker.put("web00-shell-v6-catalog-network-first", "https://web00.pro/assets/js/catalog-api.js", "old api");
  await worker.put("web00-shell-v6-catalog-network-first", "https://web00.pro/assets/js/catalog-runtime.js", "old runtime");
  worker.clearOperations();

  const main = await worker.fetch("https://web00.pro/assets/js/catalog-v2/main.js");
  const api = await worker.fetch("https://web00.pro/assets/js/catalog-v2/catalog-api.js");
  const runtime = await worker.fetch("https://web00.pro/assets/js/catalog-v2/catalog-runtime.js");

  assert.equal(await main.text(), "network:/assets/js/catalog-v2/main.js");
  assert.equal(await api.text(), "network:/assets/js/catalog-v2/catalog-api.js");
  assert.equal(await runtime.text(), "network:/assets/js/catalog-v2/catalog-runtime.js");
  assert.equal(worker.fetchCalls.length, 3);
});
```

- [ ] **Step 4: Write the static page contract RED for one runtime generation**

In `tests/frontend/static-page-contract.test.mjs`, replace the B9 script order expectation with a v2 order expectation:

```js
const expected = [
  "assets/js/data.js?v=zero-stale-catalog-v1",
  "assets/js/runtime-config.js?v=zero-stale-catalog-v1",
  "assets/js/catalog-v2/catalog-runtime.js?v=zero-stale-catalog-v1",
  "assets/js/catalog-v2/catalog-api.js?v=zero-stale-catalog-v1",
  "assets/js/catalog-v2/main.js?v=zero-stale-catalog-v1",
];
```

Add assertions inside the same loop:

```js
assert.doesNotMatch(html, /assets\/js\/catalog-runtime\.js\?/, `${page} must not load legacy catalog-runtime`);
assert.doesNotMatch(html, /assets\/js\/catalog-api\.js\?/, `${page} must not load legacy catalog-api`);
assert.doesNotMatch(html, /assets\/js\/main\.js\?b9-catalog-lkg-1/, `${page} must not load legacy main`);
assert.equal(scripts.filter((src) => src.includes("assets/js/catalog-v2/")).length, 3, `${page} should load all v2 runtime scripts`);
```

- [ ] **Step 5: Run RED command**

Run:

```bash
node --test ^
  tests/frontend/service-worker-catalog-cache.test.mjs ^
  tests/frontend/static-page-contract.test.mjs
```

Expected before implementation:

```text
FAIL
static-page-contract: pages still load assets/js/catalog-runtime.js, assets/js/catalog-api.js, assets/js/main.js
```

The legacy query-string test should PASS because it proves the old hazard. The physical path escape test should PASS against the frozen v6 fixture.

- [ ] **Step 6: Commit test-only RED evidence**

```bash
git add tests/frontend/fixtures/legacy-sw-v6.js tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/static-page-contract.test.mjs
git commit -m "test: prove legacy service worker runtime cache risk"
```

---

### Task 2: V2 Manifest And Verified Cache

**Files:**
- Create: `assets/js/catalog-v2/catalog-runtime.js`
- Modify: `tests/frontend/catalog-resilience.test.mjs`

**Interfaces:**
- Consumes: current runtime validation names from `assets/js/catalog-runtime.js`.
- Produces: `window.WEB00_CATALOG_RUNTIME.primeManifest`, `loadCatalogFromRuntime`, `loadVerifiedFallback`, and exact verified cache semantics used by Task 3.

- [ ] **Step 1: Start v2 runtime as a copy**

Create `assets/js/catalog-v2/catalog-runtime.js` by copying the current `assets/js/catalog-runtime.js`.

Keep these functions with the same semantics:

```js
validateRuntimeManifest(input)
validateRuntimeSnapshot(input, manifest)
sha256HexFromArrayBuffer(buffer)
```

- [ ] **Step 2: Write RED tests for manifest lifecycle**

In `tests/frontend/catalog-resilience.test.mjs`, add tests that load `assets/js/catalog-v2/catalog-runtime.js`:

```js
test("v2 runtime reuses only the in-flight primed manifest and clears it after settle", async () => {
  const runtime = await loadV2RuntimeWithFetch(async () => jsonResponse(validManifest()));
  const first = runtime.primeManifest(cloudConfig());
  const second = runtime.primeManifest(cloudConfig());

  assert.equal(first, second);
  await first;
  await runtime.loadCatalogFromRuntime(cloudConfig(), { skipSnapshotForTest: true });

  assert.equal(runtime.testState().manifestFetchCount, 2);
});
```

Add a failed-prime recovery test:

```js
test("v2 runtime failed manifest prime does not poison retry", async () => {
  const runtime = await loadV2RuntimeWithFetch((_url, _init, callNumber) => {
    if (callNumber === 1) return Promise.reject(new Error("offline"));
    return jsonResponse(validManifest());
  });

  await assert.rejects(() => runtime.primeManifest(cloudConfig()));
  await runtime.loadCatalogFromRuntime(cloudConfig(), { skipSnapshotForTest: true });

  assert.equal(runtime.testState().manifestFetchCount, 2);
});
```

- [ ] **Step 3: Write RED tests for verified cache**

Add tests that exercise Cache Storage and metadata:

```js
test("v2 runtime warm same revision uses verified cache after manifest validation", async () => {
  const bytes = snapshotBytes(validSnapshot());
  const runtime = await loadV2RuntimeWithCache({ manifest: validManifest(), cachedBytes: bytes });

  const result = await runtime.loadCatalogFromRuntime(cloudConfig());

  assert.equal(result.freshness, "ready-current");
  assert.equal(result.transport, "verified-cache");
  assert.equal(runtime.testState().snapshotNetworkFetchCount, 0);
  assert.equal(result.snapshot.items.length, result.manifest.itemsCount);
});
```

Add exact negative cases:

```js
test("v2 runtime rejects corrupt verified cache and fetches network snapshot", async () => {
  const runtime = await loadV2RuntimeWithCache({
    manifest: validManifest(),
    cachedBytes: new TextEncoder().encode("{\"bad\":true}").buffer,
    networkBytes: snapshotBytes(validSnapshot()),
  });

  const result = await runtime.loadCatalogFromRuntime(cloudConfig());

  assert.equal(result.transport, "network");
  assert.equal(runtime.testState().cacheDeleteCount, 1);
});
```

```js
test("v2 runtime metadata write failure leaves old verified pointer authoritative", async () => {
  const runtime = await loadV2RuntimeWithCache({
    manifest: validManifest({ revision: 2 }),
    networkBytes: snapshotBytes(validSnapshot({ revision: 2 })),
    metadataSetThrows: true,
    oldMetadata: verifiedIdentity({ revision: 1 }),
  });

  const result = await runtime.loadCatalogFromRuntime(cloudConfig());
  const fallback = await runtime.loadVerifiedFallback();

  assert.equal(result.freshness, "ready-current");
  assert.equal(result.cacheStatus, "write-failed");
  assert.equal(fallback.manifest.revision, 1);
});
```

```js
test("v2 runtime cache quota failure does not block valid current Cloud render", async () => {
  const runtime = await loadV2RuntimeWithCache({
    manifest: validManifest(),
    networkBytes: snapshotBytes(validSnapshot()),
    cachePutThrows: true,
  });

  const result = await runtime.loadCatalogFromRuntime(cloudConfig());

  assert.equal(result.freshness, "ready-current");
  assert.equal(result.transport, "network");
  assert.equal(result.cacheStatus, "write-failed");
});
```

- [ ] **Step 4: Run RED command**

Run:

```bash
node --test tests/frontend/catalog-resilience.test.mjs
```

Expected before implementation:

```text
FAIL
primeManifest is not a function
```

or:

```text
FAIL
expected verified-cache, actual network
```

- [ ] **Step 5: Implement manifest in-flight and one-shot startup result**

In `assets/js/catalog-v2/catalog-runtime.js`, add module state:

```js
let activeManifestRequest = null;
let primedManifestResult = null;
```

Implement:

```js
function clearActiveManifestRequest(request) {
  if (activeManifestRequest === request) activeManifestRequest = null;
}

function primeManifest(config, options = {}) {
  if (activeManifestRequest) return activeManifestRequest.promise;
  const request = {};
  request.promise = fetchManifest(config.catalogManifestUrl, options.signal)
    .then((manifest) => {
      primedManifestResult = { manifest, source: "network", transport: "manifest-prime" };
      return primedManifestResult;
    })
    .finally(() => clearActiveManifestRequest(request));
  activeManifestRequest = request;
  return request.promise;
}

async function readManifestForLoad(config, options = {}) {
  if (activeManifestRequest) return (await activeManifestRequest.promise).manifest;
  if (primedManifestResult) {
    const manifest = primedManifestResult.manifest;
    primedManifestResult = null;
    return manifest;
  }
  return fetchManifest(config.catalogManifestUrl, options.signal);
}
```

One-shot rule:

```js
primedManifestResult = null;
```

must happen only when the first catalog resolution consumes the successful prime. A later retry must call `fetchManifest` again.

- [ ] **Step 6: Implement verified metadata format**

Use:

```js
const VERIFIED_CACHE_NAME = "web00-catalog-verified-v1";
const VERIFIED_METADATA_KEY = "web00.catalog.verified.v1";
```

Store:

```js
{
  schemaVersion: 1,
  current: {
    schemaVersion: 1,
    revision,
    sha256,
    snapshotPath,
    snapshotUrl,
    itemsCount,
    generatedAt,
    savedAt
  },
  previous: null | {
    schemaVersion: 1,
    revision,
    sha256,
    snapshotPath,
    snapshotUrl,
    itemsCount,
    generatedAt,
    savedAt
  }
}
```

Keep at most `current` and `previous`.

- [ ] **Step 7: Implement verified cache read**

Implement:

```js
async function readVerifiedSnapshot(identity) {
  const cache = await window.caches.open(VERIFIED_CACHE_NAME);
  const response = await cache.match(identity.snapshotUrl);
  if (!response || typeof response.arrayBuffer !== "function") {
    throw runtimeError("WEB00_VERIFIED_CACHE_MISSING");
  }
  const bytes = await response.arrayBuffer();
  const actualSha = await sha256HexFromArrayBuffer(bytes);
  if (actualSha !== identity.sha256) {
    await cache.delete(identity.snapshotUrl).catch(() => false);
    throw runtimeError("WEB00_VERIFIED_CACHE_SHA_MISMATCH");
  }
  const manifest = validateRuntimeManifest(identity);
  const snapshot = parseSnapshot(bytes, manifest);
  return { manifest, snapshot };
}
```

`identity` must pass the same manifest validation as network manifest.

- [ ] **Step 8: Implement commit protocol**

When network snapshot bytes validate:

```js
async function commitVerifiedSnapshot(manifest, snapshotBytes) {
  const identity = identityFromManifest(manifest);
  const cache = await window.caches.open(VERIFIED_CACHE_NAME);
  await cache.put(manifest.snapshotUrl, new Response(snapshotBytes, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  }));
  writeVerifiedMetadata(identity);
}
```

If `cache.put` fails, return current network result with `cacheStatus: "write-failed"` and do not write metadata.

If metadata write fails after `cache.put`, keep old metadata and return current network result with `cacheStatus: "write-failed"`.

- [ ] **Step 9: Implement load order**

`loadCatalogFromRuntime(config, options = {})` must:

```js
const manifest = await readManifestForLoad(config, options);
const cached = await tryReadCurrentVerifiedMatch(manifest);
if (cached) return { ...cached, freshness: "ready-current", transport: "verified-cache", cacheStatus: "hit" };
const snapshotBytes = await fetchSnapshotBytes(manifest.snapshotUrl, options.signal);
const actualSha = await sha256HexFromArrayBuffer(snapshotBytes);
if (actualSha !== manifest.sha256) throw runtimeError("WEB00_CLOUD_SHA_MISMATCH");
const snapshot = parseSnapshot(snapshotBytes, manifest);
const cacheStatus = await tryCommitVerifiedSnapshot(manifest, snapshotBytes);
return { manifest, snapshot, freshness: "ready-current", transport: "network", cacheStatus };
```

`tryReadCurrentVerifiedMatch` may only use metadata where revision, sha256, snapshotUrl, snapshotPath, and itemsCount match the current manifest.

- [ ] **Step 10: Implement degraded fallback**

`loadVerifiedFallback()` must try `metadata.current`, then `metadata.previous`, with full rehash and validation:

```js
async function loadVerifiedFallback() {
  const metadata = readVerifiedMetadata();
  for (const identity of [metadata?.current, metadata?.previous]) {
    if (!identity) continue;
    try {
      const result = await readVerifiedSnapshot(identity);
      return { ...result, freshness: "degraded-verified", transport: "verified-cache", cacheStatus: "fallback" };
    } catch (_) {
      continue;
    }
  }
  return null;
}
```

- [ ] **Step 11: Run GREEN command**

Run:

```bash
node --test tests/frontend/catalog-resilience.test.mjs
```

Expected:

```text
PASS
```

- [ ] **Step 12: Commit**

```bash
git add assets/js/catalog-v2/catalog-runtime.js tests/frontend/catalog-resilience.test.mjs
git commit -m "feat: add verified Cloud catalog runtime"
```

---

### Task 3: Zero-Stale Catalog API State

**Files:**
- Create: `assets/js/catalog-v2/catalog-api.js`
- Modify: `tests/frontend/catalog-resilience.test.mjs`
- Modify: `tests/frontend/catalog-normalization.test.mjs`

**Interfaces:**
- Consumes: Task 2 `WEB00_CATALOG_RUNTIME.loadCatalogFromRuntime` and `loadVerifiedFallback`.
- Produces: bootstrap/no-static-first catalog state consumed by Task 4 v2 main.

- [ ] **Step 1: Start v2 API as a copy**

Create `assets/js/catalog-v2/catalog-api.js` by copying `assets/js/catalog-api.js`.

Keep these existing safety functions with equivalent behavior:

```js
sanitizePublicUrl(value, options = {})
normalizeApiSite(input, options = {})
normalizeStaticSite(input, options = {})
normalizeCatalogSettings(settings)
buildResponsiveImageModel(image, fallback = {})
renderResponsiveImageHtml(model, options = {})
findCatalogItem(items, identifier)
```

- [ ] **Step 2: Write RED for Cloud-primary bootstrap**

In `tests/frontend/catalog-resilience.test.mjs`, add:

```js
test("v2 cloud-primary initial catalog is bootstrap and never paints static or LKG as current", async () => {
  const storage = createStorage();
  storage.setItem("web00.catalog.api.lkg.v1", JSON.stringify({
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    items: [{ slug: "dom-dlya-busi", title: "Дом для Буси" }],
  }));

  const { catalog } = await loadCatalog({
    apiPath: "assets/js/catalog-v2/catalog-api.js",
    runtimePath: "assets/js/catalog-v2/catalog-runtime.js",
    config: cloudConfig(),
    data: freshSmokeStaticData(),
    storage,
    fetch: createFakeFetch(() => new Promise(() => undefined)),
  });

  const initial = catalog.getInitialCatalog();

  assert.equal(initial.source, "bootstrap");
  assert.equal(initial.freshness, "bootstrap");
  assert.deepEqual(initial.items, []);
  assert.equal(initial.staticFallbackActive, false);
});
```

- [ ] **Step 3: Write RED for definitive Cloud failure fallback order**

Add:

```js
test("v2 cloud-primary failure uses verified fallback before static disaster fallback", async () => {
  const runtime = createRuntimeStub({
    loadCatalogFromRuntime: async () => { throw Object.assign(new Error("timeout"), { code: "WEB00_CLOUD_TIMEOUT" }); },
    loadVerifiedFallback: async () => ({
      manifest: verifiedIdentity({ revision: 7 }),
      snapshot: validSnapshot({ revision: 7, items: [apiSite("verified-site", "Verified Site")] }),
      freshness: "degraded-verified",
      transport: "verified-cache",
      cacheStatus: "fallback",
    }),
  });

  const { catalog } = await loadCatalog({
    apiPath: "assets/js/catalog-v2/catalog-api.js",
    runtime,
    config: cloudConfig(),
    data: freshSmokeStaticData(),
    fetch: createFakeFetch(() => Promise.reject(new Error("network"))),
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: catalog.getInitialCatalog() });

  assert.equal(result.source, "cloud");
  assert.equal(result.freshness, "degraded-verified");
  assert.equal(result.revision, 7);
  assert.deepEqual(result.items.map((item) => item.slug), ["verified-site"]);
});
```

Add static disaster fallback test:

```js
test("v2 cloud-primary uses data.js only as degraded static disaster fallback", async () => {
  const { catalog } = await loadCatalog({
    apiPath: "assets/js/catalog-v2/catalog-api.js",
    runtime: createRuntimeStub({
      loadCatalogFromRuntime: async () => { throw Object.assign(new Error("offline"), { code: "WEB00_CLOUD_OFFLINE" }); },
      loadVerifiedFallback: async () => null,
    }),
    config: cloudConfig(),
    data: freshSmokeStaticData(),
    fetch: createFakeFetch(() => Promise.reject(new Error("offline"))),
  });

  const result = await catalog.resolveCatalogForPage({ kind: "solutions", currentState: catalog.getInitialCatalog() });

  assert.equal(result.source, "static");
  assert.equal(result.freshness, "degraded-static");
  assert.equal(result.staticFallbackActive, true);
  assert.deepEqual(result.items.map((item) => item.slug), ["web00-smoke-create"]);
});
```

- [ ] **Step 4: Run RED command**

Run:

```bash
node --test tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-normalization.test.mjs
```

Expected before implementation:

```text
FAIL
expected source bootstrap, actual static
```

- [ ] **Step 5: Implement explicit state builders**

In `assets/js/catalog-v2/catalog-api.js`, add:

```js
function bootstrapCatalogState() {
  return {
    source: "bootstrap",
    lifecycle: "loading",
    freshness: "bootstrap",
    transport: "none",
    revision: null,
    sha256: "",
    items: [],
    settings: normalizeCatalogSettings(),
    errorCode: "",
    apiAvailable: false,
    staticFallbackActive: false,
    degraded: false,
  };
}

function stateFromRuntimeResult(result, items) {
  return {
    source: "cloud",
    lifecycle: items.length ? "ready" : "empty",
    freshness: result.freshness,
    transport: result.transport,
    revision: result.manifest.revision,
    sha256: result.manifest.sha256,
    items,
    settings: normalizeCatalogSettings(result.snapshot.settings),
    errorCode: "",
    apiAvailable: false,
    staticFallbackActive: result.freshness !== "ready-current",
    degraded: result.freshness !== "ready-current",
  };
}
```

- [ ] **Step 6: Change `getInitialCatalog()` for Cloud-primary**

Use:

```js
function getInitialCatalog(options = {}) {
  const config = getConfig();
  if (config.catalogRuntimeMode === "cloud-primary") {
    return limitCatalogState(bootstrapCatalogState(), options.limit);
  }
  const staticCatalog = getStaticCatalog();
  const cachedCatalog = readLastKnownGoodCatalog();
  const initial = hasCatalogItems(staticCatalog) ? staticCatalog : cachedCatalog || staticCatalog;
  return limitCatalogState(initial, options.limit);
}
```

This preserves non-Cloud compatibility and prevents Cloud-primary static/LKG current paint.

- [ ] **Step 7: Change Cloud-primary resolution**

Implement:

```js
async function resolveCloudPrimaryCatalog(options, request) {
  try {
    const result = await window.WEB00_CATALOG_RUNTIME.loadCatalogFromRuntime(getConfig(), { signal: request.signal });
    const items = normalizeApiItems(result.snapshot.items, { source: "cloud" });
    return stateFromRuntimeResult(result, limitItems(items, options.limit));
  } catch (error) {
    const errorCode = error && error.code ? error.code : "WEB00_CLOUD_ERROR";
    const fallback = await window.WEB00_CATALOG_RUNTIME.loadVerifiedFallback().catch(() => null);
    if (fallback) {
      const items = normalizeApiItems(fallback.snapshot.items, { source: "cloud" });
      return {
        ...stateFromRuntimeResult(fallback, limitItems(items, options.limit)),
        errorCode,
        staticFallbackActive: true,
        degraded: true,
      };
    }
    return degradedStaticState(errorCode, options.limit);
  }
}
```

`degradedStaticState` must use `getStaticCatalog()` only after definitive Cloud failure.

- [ ] **Step 8: Preserve validation and normalization contracts**

Keep exact rejection behavior for:

```js
javascript:
ftp:
malformed URL
username/password credentials
encoded controls
duplicate slugs
invalid responsive image variants
unsafe demo URLs
```

Keep `showDemoInModal` default false except when Cloud snapshot settings explicitly set it true.

- [ ] **Step 9: Run GREEN command**

Run:

```bash
node --test tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-normalization.test.mjs
```

Expected:

```text
PASS
```

- [ ] **Step 10: Commit**

```bash
git add assets/js/catalog-v2/catalog-api.js tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-normalization.test.mjs
git commit -m "feat: add zero-stale catalog state model"
```

---

### Task 4: Atomic UI And Skeleton

**Files:**
- Create: `assets/js/catalog-v2/main.js`
- Modify: `assets/css/catalog-premium.css`
- Modify: `solutions.html`
- Modify: `tests/frontend/catalog-main-retry.test.mjs`
- Modify: `tests/frontend/catalog-resilience.test.mjs`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**
- Consumes: Task 3 state fields `freshness`, `lifecycle`, `items`, `staticFallbackActive`, `revision`, `sha256`.
- Produces: skeleton-first solutions UI and one DOM grid write per accepted revision.

- [ ] **Step 1: Start v2 main as a copy**

Create `assets/js/catalog-v2/main.js` by copying `assets/js/main.js`.

- [ ] **Step 2: Write RED for no static old-card before Cloud**

In `tests/frontend/catalog-main-retry.test.mjs`, load v2 scripts and add:

```js
test("v2 solutions keeps skeleton visible and never renders static old card while Cloud current is delayed", async () => {
  const delayed = deferred();
  const { grid, statusNodes, history } = await bootSolutionsPage(createFakeFetch(() => delayed.promise), {
    scriptSet: "catalog-v2",
    data: { SOLUTIONS: [{ id: "old-card", slug: "old-card", title: "Old Static Card", active: true }] },
    config: cloudConfig(),
  });

  assert.equal(statusNodes["[data-catalog-loading]"].hidden, false);
  assert.match(grid.innerHTML, /catalog-skeleton/);
  assert.doesNotMatch(grid.innerHTML, /Old Static Card/);
  assert.equal(history.some((html) => /Old Static Card/.test(html)), false);
});
```

- [ ] **Step 3: Write RED for deleted and edited ghosts**

Add:

```js
test("v2 solutions never flashes a deleted old cached card before current revision", async () => {
  const runtime = cloudSnapshot([apiSite("new-card", "New Card")]);
  const { history } = await bootSolutionsPage(fetchForCloudRuntime(runtime, { delaySnapshotMs: 100 }), {
    scriptSet: "catalog-v2",
    data: { SOLUTIONS: [{ id: "deleted-card", slug: "deleted-card", title: "Deleted Card", active: true }] },
    config: cloudConfig(),
  });

  assert.equal(history.some((html) => /Deleted Card/.test(html)), false);
  assert.match(history.at(-1), /New Card/);
});
```

```js
test("v2 solutions never flashes old title before edited current revision", async () => {
  const runtime = cloudSnapshot([apiSite("edited-card", "Edited Current Title")]);
  const { history } = await bootSolutionsPage(fetchForCloudRuntime(runtime, { delaySnapshotMs: 100 }), {
    scriptSet: "catalog-v2",
    data: { SOLUTIONS: [{ id: "edited-card", slug: "edited-card", title: "Old Title", active: true }] },
    config: cloudConfig(),
  });

  assert.equal(history.some((html) => /Old Title/.test(html)), false);
  assert.match(history.at(-1), /Edited Current Title/);
});
```

- [ ] **Step 4: Run RED command**

Run:

```bash
node --test tests/frontend/catalog-main-retry.test.mjs tests/frontend/catalog-resilience.test.mjs tests/frontend/static-page-contract.test.mjs
```

Expected before implementation:

```text
FAIL
grid contains old static card before Cloud current resolves
```

- [ ] **Step 5: Implement skeleton render**

In `assets/js/catalog-v2/main.js`, add:

```js
function renderCatalogSkeleton(count = 6) {
  const grid = $("[data-solutions-grid]");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: count }, (_, index) => `
    <article class="solution-card solution-card--skeleton catalog-skeleton" aria-hidden="true" data-skeleton-index="${index}">
      <div class="solution-preview solution-preview--skeleton"></div>
      <div class="solution-card__body">
        <div class="catalog-skeleton__line catalog-skeleton__line--tags"></div>
        <div class="catalog-skeleton__line catalog-skeleton__line--title"></div>
        <div class="catalog-skeleton__line catalog-skeleton__line--text"></div>
        <div class="catalog-skeleton__line catalog-skeleton__line--meta"></div>
        <div class="catalog-skeleton__actions"></div>
      </div>
    </article>
  `).join("");
}
```

Call `renderCatalogSkeleton()` from `initCatalogState()` before starting the Cloud resolution.

- [ ] **Step 6: Change `catalogItems()` to never fallback to static during Cloud bootstrap**

Use:

```js
function catalogItems() {
  if (catalogState && Array.isArray(catalogState.items)) return catalogState.items;
  if (CATALOG && CATALOG.getConfig?.().catalogRuntimeMode === "cloud-primary") return [];
  return solutions();
}
```

If `getConfig` is not exported, add a narrow `isCloudPrimary()` export to `WEB00_CATALOG`.

- [ ] **Step 7: Change `applyCatalogState()` to render only complete accepted states**

Use:

```js
function canRenderCatalogState(state) {
  return state &&
    Array.isArray(state.items) &&
    state.lifecycle === "ready" &&
    ["ready-current", "degraded-verified", "degraded-static"].includes(state.freshness);
}

function applyCatalogState(nextCatalogState) {
  if (!nextCatalogState) return false;
  if (!canRenderCatalogState(nextCatalogState)) {
    updateCatalogStateNodes(nextCatalogState, { loading: nextCatalogState.freshness === "loading-current" });
    return false;
  }
  const previousRevision = catalogState?.revision;
  const previousSha = catalogState?.sha256;
  catalogState = nextCatalogState;
  if (previousRevision === catalogState.revision && previousSha === catalogState.sha256 && gridAlreadyRendered()) {
    updateCatalogStateNodes(catalogState);
    return true;
  }
  renderSolutions();
  updateCatalogStateNodes(catalogState);
  return true;
}
```

The first complete catalog render must replace skeleton with one `grid.innerHTML = ...`.

- [ ] **Step 8: Update retry behavior**

Keep degraded fallback visible after failure. When a retry returns `ready-current`, replace the entire grid once:

```js
const loaded = applyCatalogState(nextCatalogState);
if (!loaded && nextCatalogState?.freshness !== "fatal") scheduleCatalogRetry();
```

Do not append cards individually.

- [ ] **Step 9: Add skeleton CSS**

In `assets/css/catalog-premium.css`, add:

```css
body[data-page="solutions"] .solution-card--skeleton {
  pointer-events: none;
}

body[data-page="solutions"] .solution-preview--skeleton,
body[data-page="solutions"] .catalog-skeleton__line,
body[data-page="solutions"] .catalog-skeleton__actions {
  background: linear-gradient(90deg, rgba(218, 212, 204, 0.4), rgba(244, 241, 236, 0.9), rgba(218, 212, 204, 0.4));
  background-size: 220% 100%;
  border-radius: var(--catalog-radius-sm);
}

body[data-page="solutions"] .solution-preview--skeleton {
  aspect-ratio: 16 / 7.4;
  min-height: 0;
}

body[data-page="solutions"] .catalog-skeleton__line--title {
  width: 72%;
  min-height: 20px;
}

body[data-page="solutions"] .catalog-skeleton__line--text {
  width: 100%;
  min-height: 42px;
}

@media (prefers-reduced-motion: no-preference) {
  body[data-page="solutions"] .solution-card--skeleton .catalog-skeleton__line,
  body[data-page="solutions"] .solution-card--skeleton .solution-preview--skeleton,
  body[data-page="solutions"] .solution-card--skeleton .catalog-skeleton__actions {
    animation: catalog-skeleton-pulse 1.2s ease-in-out infinite;
  }
}
```

Use the existing catalog card dimensions and keep border radius at the current catalog scale.

- [ ] **Step 10: Run GREEN command**

Run:

```bash
node --test tests/frontend/catalog-main-retry.test.mjs tests/frontend/catalog-resilience.test.mjs tests/frontend/static-page-contract.test.mjs
```

Expected:

```text
PASS
```

- [ ] **Step 11: Commit**

```bash
git add assets/js/catalog-v2/main.js assets/css/catalog-premium.css solutions.html tests/frontend/catalog-main-retry.test.mjs tests/frontend/catalog-resilience.test.mjs tests/frontend/static-page-contract.test.mjs
git commit -m "feat: render catalog revisions atomically"
```

---

### Task 5: Early Manifest, Home, And Brief

**Files:**
- Modify: `assets/js/catalog-v2/catalog-runtime.js`
- Modify: `assets/js/catalog-v2/main.js`
- Modify: `index.html`
- Modify: `solutions.html`
- Modify: `brief.html`
- Modify: `tests/frontend/catalog-main-retry.test.mjs`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**
- Consumes: Task 2 `primeManifest()` and one-shot `primedManifestResult`.
- Produces: manifest request starts before DOMContentLoaded catalog init; home/brief do not render stale static catalog content as current.

- [ ] **Step 1: Write RED for pre-DOMContentLoaded manifest prime**

In `tests/frontend/catalog-main-retry.test.mjs`, add:

```js
test("v2 runtime primes manifest before DOMContentLoaded catalog initialization", async () => {
  const fetch = createFakeFetch(() => new Promise(() => undefined));
  const browser = createSolutionsPage(fetch, { scriptSet: "catalog-v2", config: cloudConfig() }).browser;

  await loadClassicScript("assets/js/runtime-config.js", browser);
  await loadClassicScript("assets/js/catalog-v2/catalog-runtime.js", browser);

  assert.equal(fetch.calls.length, 1);
  assert.match(fetch.calls[0].url, /runtime\/production\/catalog\/v1\/manifest\.json/);
});
```

- [ ] **Step 2: Write RED for one-shot successful startup result**

Add:

```js
test("v2 first catalog resolution consumes successful manifest prime without duplicate startup fetch", async () => {
  const runtime = cloudSnapshot([apiSite("current", "Current")]);
  const fetch = fetchForCloudRuntime(runtime);
  const { catalog } = await loadCatalog({
    apiPath: "assets/js/catalog-v2/catalog-api.js",
    runtimePath: "assets/js/catalog-v2/catalog-runtime.js",
    config: cloudConfig(),
    fetch,
  });

  await catalog.resolveCatalogForPage({ kind: "solutions", currentState: catalog.getInitialCatalog() });

  const manifestFetches = fetch.calls.filter((call) => call.url.includes("/manifest.json"));
  assert.equal(manifestFetches.length, 1);
});
```

- [ ] **Step 3: Write RED for retry freshness**

Add:

```js
test("v2 retry after failure makes a fresh manifest request", async () => {
  const fetch = createFakeFetch((_url, _init, callNumber) => {
    if (callNumber === 1) return Promise.reject(new Error("offline"));
    return jsonResponse(validManifest());
  });
  const { catalog } = await loadCatalog({
    apiPath: "assets/js/catalog-v2/catalog-api.js",
    runtimePath: "assets/js/catalog-v2/catalog-runtime.js",
    config: cloudConfig(),
    fetch,
  });

  await catalog.resolveCatalogForPage({ kind: "solutions", currentState: catalog.getInitialCatalog() });
  await catalog.resolveCatalogForPage({ kind: "solutions", currentState: catalog.getInitialCatalog() });

  assert.ok(fetch.calls.filter((call) => call.url.includes("/manifest.json")).length >= 2);
});
```

- [ ] **Step 4: Write RED for home and brief**

In `tests/frontend/static-page-contract.test.mjs`, change the home contract:

```js
test("v2 home popular cards use skeleton until current or degraded catalog state resolves", async () => {
  const source = await readFile("assets/js/catalog-v2/main.js", "utf8");

  assert.match(source, /async function initPopularCatalogState\(\)/);
  assert.match(source, /function renderPopularSkeleton\(\)/);
  assert.doesNotMatch(source, /popularCatalogState = CATALOG\.getInitialCatalog\(\{ limit: 3 \}\);\s*renderPopularSolutions\(\)/);
});
```

Change brief contract:

```js
test("v2 brief waits for current-or-degraded catalog before selected solution lookup", async () => {
  const source = await readFile("assets/js/catalog-v2/main.js", "utf8");

  assert.match(source, /async function initBriefCatalogState\(\)/);
  assert.match(source, /await resolveBriefCatalogReady\(\)/);
  assert.doesNotMatch(source, /solutionByIdStrict\(params\.get\("solution"\) \|\| draft\.solutionId\)/);
});
```

- [ ] **Step 5: Run RED command**

Run:

```bash
node --test tests/frontend/catalog-main-retry.test.mjs tests/frontend/static-page-contract.test.mjs
```

Expected before implementation:

```text
FAIL
manifest request count is 0 before DOMContentLoaded
```

- [ ] **Step 6: Prime manifest during v2 runtime evaluation**

At the end of `assets/js/catalog-v2/catalog-runtime.js`, after assigning `window.WEB00_CATALOG_RUNTIME`, add:

```js
try {
  const config = window.WEB00_CONFIG || {};
  if (config.catalogRuntimeMode === "cloud-primary" && config.catalogManifestUrl === MANIFEST_URL) {
    primeManifest(config).catch(() => undefined);
  }
} catch (_) {
  // Keep page boot resilient when config is absent or blocked.
}
```

Do not add inline HTML script.

- [ ] **Step 7: Add preconnect to the three primary pages**

In `index.html`, `solutions.html`, and `brief.html`, add exactly:

```html
<link rel="preconnect" href="https://web00-public-runtime.s3-website.cloud.ru" crossorigin>
```

Place it in `<head>` near existing preconnects.

- [ ] **Step 8: Implement home skeleton**

In `assets/js/catalog-v2/main.js`, add:

```js
function renderPopularSkeleton() {
  const grid = $("#popular-templates .mock-card-grid");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 3 }, (_, index) => `
    <article class="mock-template-card mock-template-card--skeleton" aria-hidden="true" data-popular-skeleton="${index}">
      <div class="mock-card-body">
        <span class="catalog-skeleton__line catalog-skeleton__line--title"></span>
        <span class="catalog-skeleton__line catalog-skeleton__line--text"></span>
      </div>
    </article>
  `).join("");
}
```

Call it from `initPopularCatalogState()` before `resolveCatalogForPage`.

- [ ] **Step 9: Implement brief ready wait**

In `assets/js/catalog-v2/main.js`, add:

```js
async function resolveBriefCatalogReady() {
  if (!CATALOG || page !== "brief") return null;
  const initial = CATALOG.getInitialCatalog();
  const resolved = await CATALOG.resolveCatalogForPage({ kind: "solutions", currentState: initial });
  if (resolved && hasCatalogItems(resolved)) catalogState = resolved;
  return catalogState;
}
```

Use it before selecting the solution for brief-specific rendering.

- [ ] **Step 10: Run GREEN command**

Run:

```bash
node --test tests/frontend/catalog-main-retry.test.mjs tests/frontend/static-page-contract.test.mjs
```

Expected:

```text
PASS
```

- [ ] **Step 11: Commit**

```bash
git add assets/js/catalog-v2/catalog-runtime.js assets/js/catalog-v2/main.js index.html solutions.html brief.html tests/frontend/catalog-main-retry.test.mjs tests/frontend/static-page-contract.test.mjs
git commit -m "feat: prime catalog manifest before page init"
```

---

### Task 6: Physical Cutover And SW V7

**Files:**
- Modify: `sw.js`
- Modify: all root pages listed in File Structure that load the old script set
- Modify: `tests/frontend/service-worker-catalog-cache.test.mjs`
- Modify: `tests/frontend/service-worker-contract.test.mjs`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 v6 fixture and Task 5 v2 physical runtime paths.
- Produces: deployed pages reference only v2 runtime scripts; v7 SW cannot satisfy v2 runtime with stale query-insensitive cache entries.

- [ ] **Step 1: Write RED for v7 SW cache namespace and exact v2 runtime identity**

In `tests/frontend/service-worker-contract.test.mjs`, replace v6 expectations with:

```js
assert.match(source, /const WEB00_CACHE = "web00-shell-v7-zero-stale";/);
assert.match(source, /function isCatalogV2RuntimeRequest\(url\)/);
assert.match(source, /function networkFirstExactRuntime\(request\)/);
assert.doesNotMatch(source, /catalog-v2[^]*ignoreSearch:\s*true/);
assert.doesNotMatch(source, /runtime-config\.js[^]*cache\.put/);
assert.doesNotMatch(shellAssets, /runtime-config\.js/);
assert.doesNotMatch(shellAssets, /runtime\/production\/catalog\/v1\/manifest\.json/);
```

- [ ] **Step 2: Write RED for v7 runtime network-first**

In `tests/frontend/service-worker-catalog-cache.test.mjs`, add:

```js
test("v7 service worker fetches catalog-v2 runtime by exact URL before cache fallback", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async () => jsResponse("window.__V2_RUNTIME__ = true;"),
  });
  await worker.put("web00-shell-v7-zero-stale", "https://web00.pro/assets/js/catalog-v2/main.js?v=old", "old v2");
  worker.clearOperations();

  const response = await worker.fetch("https://web00.pro/assets/js/catalog-v2/main.js?v=zero-stale-catalog-v1");

  assert.equal(await response.text(), "window.__V2_RUNTIME__ = true;");
  assert.equal(worker.fetchCalls.length, 1);
  assert.equal(worker.fetchCalls[0].cache, "no-store");
  assert.equal(worker.operations[0].type, "fetch");
});
```

Add exact fallback test:

```js
test("v7 service worker offline fallback for catalog-v2 runtime requires exact request URL", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async () => { throw new TypeError("offline"); },
  });
  await worker.put("web00-shell-v7-zero-stale", "https://web00.pro/assets/js/catalog-v2/main.js?v=exact", "exact v2");
  await worker.put("web00-shell-v7-zero-stale", "https://web00.pro/assets/js/catalog-v2/main.js?v=other", "other v2");
  worker.clearOperations();

  const response = await worker.fetch("https://web00.pro/assets/js/catalog-v2/main.js?v=exact");

  assert.equal(await response.text(), "exact v2");
});
```

- [ ] **Step 3: Write RED for full HTML cutover**

In `tests/frontend/static-page-contract.test.mjs`, assert every root page script order is:

```js
[
  "assets/js/data.js?v=zero-stale-catalog-v1",
  "assets/js/runtime-config.js?v=zero-stale-catalog-v1",
  "assets/js/catalog-v2/catalog-runtime.js?v=zero-stale-catalog-v1",
  "assets/js/catalog-v2/catalog-api.js?v=zero-stale-catalog-v1",
  "assets/js/catalog-v2/main.js?v=zero-stale-catalog-v1",
]
```

and no page contains:

```js
/assets\/js\/catalog-runtime\.js\?/
/assets\/js\/catalog-api\.js\?/
/assets\/js\/main\.js\?b9-catalog-lkg-1/
```

- [ ] **Step 4: Run RED command**

Run:

```bash
node --test tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/service-worker-contract.test.mjs tests/frontend/static-page-contract.test.mjs
```

Expected before implementation:

```text
FAIL
expected web00-shell-v7-zero-stale, current sw.js still web00-shell-v6-catalog-network-first
```

- [ ] **Step 5: Update all root pages to v2 script paths together**

For every root page listed in File Structure, replace the five-script catalog block with:

```html
<script defer src="assets/js/data.js?v=zero-stale-catalog-v1"></script>
<script defer src="assets/js/runtime-config.js?v=zero-stale-catalog-v1"></script>
<script defer src="assets/js/catalog-v2/catalog-runtime.js?v=zero-stale-catalog-v1"></script>
<script defer src="assets/js/catalog-v2/catalog-api.js?v=zero-stale-catalog-v1"></script>
<script defer src="assets/js/catalog-v2/main.js?v=zero-stale-catalog-v1"></script>
```

Do not mix legacy and v2 runtime scripts on any page.

- [ ] **Step 6: Update SW namespace and shell assets**

In `sw.js`, set:

```js
const WEB00_CACHE = "web00-shell-v7-zero-stale";
```

Ensure `SHELL_ASSETS` includes v2 runtime files:

```js
"assets/js/data.js",
"assets/js/catalog-v2/catalog-runtime.js",
"assets/js/catalog-v2/catalog-api.js",
"assets/js/catalog-v2/main.js",
```

Ensure `SHELL_ASSETS` does not include:

```js
"assets/js/runtime-config.js"
"runtime/production/catalog/v1/manifest.json"
```

- [ ] **Step 7: Implement v2 runtime request handling**

Add:

```js
function isCatalogV2RuntimeRequest(url) {
  return url.origin === self.location.origin &&
    (
      url.pathname.endsWith("/assets/js/catalog-v2/catalog-runtime.js") ||
      url.pathname.endsWith("/assets/js/catalog-v2/catalog-api.js") ||
      url.pathname.endsWith("/assets/js/catalog-v2/main.js")
    );
}

async function networkFirstExactRuntime(request) {
  let networkResponse;
  let networkError;
  try {
    networkResponse = await fetch(request, { cache: "no-store" });
    if (networkResponse.ok) {
      const cache = await caches.open(WEB00_CACHE);
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    networkError = error;
  }
  const cache = await caches.open(WEB00_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  if (networkResponse) return networkResponse;
  throw networkError || new TypeError("WEB00 runtime unavailable.");
}
```

In fetch handler, before generic shell cache:

```js
if (isCatalogV2RuntimeRequest(url)) {
  event.respondWith(networkFirstExactRuntime(request));
  return;
}
```

- [ ] **Step 8: Preserve runtime-config network-only and manifest exclusion**

Keep:

```js
if (isRuntimeConfigRequest(url) || isApiRequest(url)) return;
if (url.origin !== self.location.origin) return;
```

Cloud manifest is cross-origin, so SW must not intercept it.

- [ ] **Step 9: Keep legacy SW migration reload safe**

Do not reintroduce sessionStorage controllerchange markers. Keep:

```js
let reloadStarted = false;
const hadController = Boolean(navigator.serviceWorker.controller);
navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (!hadController || reloadStarted) return;
  reloadStarted = true;
  window.location.reload();
});
```

This belongs in `assets/js/catalog-v2/main.js`, copied from the current fixed `assets/js/main.js`.

- [ ] **Step 10: Run GREEN command**

Run:

```bash
node --test tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/service-worker-contract.test.mjs tests/frontend/static-page-contract.test.mjs
```

Expected:

```text
PASS
```

- [ ] **Step 11: Commit**

```bash
git add sw.js app.html brief.html cabinet.html cases.html consent-personal-data.html contacts.html faq.html how-it-works.html index.html install.html pricing.html privacy-policy.html services.html solutions.html status.html tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/service-worker-contract.test.mjs tests/frontend/static-page-contract.test.mjs
git commit -m "feat: cut catalog pages to v2 service worker runtime"
```

---

### Task 7: Automated Acceptance Matrix

**Files:**
- Modify: `tests/frontend/catalog-resilience.test.mjs`
- Modify: `tests/frontend/catalog-main-retry.test.mjs`
- Modify: `tests/frontend/service-worker-catalog-cache.test.mjs`
- Modify: `tests/frontend/static-page-contract.test.mjs`
- Modify: `tests/frontend/catalog-normalization.test.mjs`
- Modify: `tests/frontend/service-worker-contract.test.mjs`
- Modify: `tests/frontend/pages-catalog-generator.test.mjs` only if existing generated-contract assertions reference old runtime paths

**Interfaces:**
- Consumes: completed Tasks 2-6 behavior.
- Produces: full frontend regression matrix proving Zero-Stale runtime outcomes.

- [ ] **Step 1: Add warm same-revision acceptance**

In `tests/frontend/catalog-resilience.test.mjs`, assert:

```js
assert.equal(manifestFetchCount, 1);
assert.equal(snapshotNetworkFetchCount, 0);
assert.equal(result.transport, "verified-cache");
assert.equal(result.freshness, "ready-current");
assert.equal(renderCount, 1);
```

- [ ] **Step 2: Add new revision acceptance**

Assert:

```js
assert.equal(oldRevisionRenderedAsCurrent, false);
assert.equal(snapshotNetworkFetchCount, 1);
assert.equal(result.revision, nextRevision);
assert.equal(result.sha256, nextSha);
assert.equal(renderCount, 1);
```

- [ ] **Step 3: Add slow network acceptance**

In `tests/frontend/catalog-main-retry.test.mjs`, delay manifest and snapshot 3-7 simulated seconds with controlled timers. Assert:

```js
assert.match(grid.innerHTML, /catalog-skeleton/);
assert.doesNotMatch(grid.innerHTML, /Old Static/);
assert.equal(renderCountBeforeResolve, 0);
assert.equal(renderCountAfterResolve, 1);
```

- [ ] **Step 4: Add manifest failure to recovery acceptance**

Assert:

```js
assert.equal(firstResult.freshness, "degraded-verified");
assert.equal(secondManifestFetchIsFresh, true);
assert.equal(secondResult.freshness, "ready-current");
assert.equal(cardByCardAppendCount, 0);
```

- [ ] **Step 5: Add corruption rejection acceptance**

Cover these exact cases:

```js
bad cached SHA
missing cache bytes
bad network SHA
bad revision
bad itemsCount
quota error
metadata write failure
```

Each invalid content case must assert:

```js
assert.equal(invalidContentRendered, false);
```

- [ ] **Step 6: Add SW migration acceptance**

In `tests/frontend/service-worker-catalog-cache.test.mjs`, simulate:

```js
legacy v6 SW active
old runtime cached
new HTML requests assets/js/catalog-v2/*
v7 installs and activates
old shell cache retired
one controllerchange reload
reload still loads catalog-v2 scripts
```

Expected JSON-shaped evidence:

```js
{
  legacyToV7Reloads: 1,
  oldShellCacheRetired: true,
  v2RuntimeServedFromNetwork: true,
  duplicateControllerChangeReloads: 0,
  reloadLoopDetected: false
}
```

- [ ] **Step 7: Run focused acceptance**

Run:

```bash
node --test tests/frontend/service-worker-catalog-cache.test.mjs
node --test tests/frontend/catalog-resilience.test.mjs
node --test tests/frontend/catalog-main-retry.test.mjs
node --test tests/frontend/catalog-normalization.test.mjs
node --test tests/frontend/service-worker-contract.test.mjs
node --test tests/frontend/static-page-contract.test.mjs
```

Expected:

```text
PASS
```

- [ ] **Step 8: Run full frontend and generator**

Run:

```bash
node scripts/build-pages-catalog.mjs --check
node --test tests/frontend/*.test.mjs
git diff --check
```

Expected:

```text
PASS
```

Do not regenerate `assets/js/data.js` merely to make Zero-Stale work.

- [ ] **Step 9: Commit**

```bash
git add tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-main-retry.test.mjs tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/static-page-contract.test.mjs tests/frontend/catalog-normalization.test.mjs tests/frontend/service-worker-contract.test.mjs tests/frontend/pages-catalog-generator.test.mjs
git commit -m "test: cover zero-stale catalog runtime acceptance"
```

---

### Task 8: Independent Review And PR Prep

**Files:**
- Review: complete diff from `origin/main`
- Modify: only files already listed in this plan if review finds a load-bearing defect and a RED test is added first

**Interfaces:**
- Consumes: all previous task commits.
- Produces: PR-ready branch with evidence fields for owner review.

- [ ] **Step 1: Run RED review gate**

Run:

```bash
git diff --name-only origin/main...HEAD
node --test tests/frontend/*.test.mjs
node scripts/build-pages-catalog.mjs --check
```

Expected if implementation is not complete:

```text
FAIL or unexpected file path
```

Any failure or unexpected path is the review RED. Do not fix by broad refactor. Add the narrow failing regression to the relevant Task 1-7 test file first, then make the smallest matching source change.

- [ ] **Step 2: Run final GREEN gates**

Run:

```bash
node --version
node --test tests/frontend/*.test.mjs
node scripts/build-pages-catalog.mjs --check
git diff --check
git status --short
```

Expected:

```text
Node 22.x
0 failed frontend tests
generator check passes
diff check passes
status clean except intentional committed branch state
```

- [ ] **Step 3: Run static scans**

Run:

```bash
rg -n "assets/js/catalog-runtime\\.js\\?|assets/js/catalog-api\\.js\\?|assets/js/main\\.js\\?b9-catalog-lkg-1" *.html
rg -n "catalog-v2|ignoreSearch|runtime-config|manifest|web00-shell-v7-zero-stale" sw.js
rg -n "web00-backend-production\\.onrender\\.com|github\\.com|api/sites|publication/pages" assets/js/catalog-v2 tests/frontend
```

Expected:

```text
No migrated HTML references old runtime.
No mixed runtime generations.
catalog-v2 physical files exist.
SW has no ignoreSearch for v2 runtime.
Cloud manifest is not shell cached.
runtime-config remains network-only.
Visitor Cloud-primary path has no Render dependency.
No GitHub CRUD/publication path introduced.
Legacy runtime files remain present.
```

- [ ] **Step 4: Independent review checklist**

Inspect the current diff for:

```text
manifest poisoning
one-shot early prime
cache torn-write
cached rehash
fallback state
static flash
render count
legacy SW escape
new SW exact cache identity
home behavior
brief behavior
demo settings
backend protocol unchanged
```

For any CRITICAL or IMPORTANT defect:

```text
write RED regression test
run focused RED
make narrow fix
run focused GREEN
run full frontend GREEN
commit with a focused message
```

- [ ] **Step 5: Verify scope**

Run:

```bash
git diff --name-only origin/main...HEAD
```

Allowed groups:

```text
assets/js/catalog-v2/*
sw.js
root HTML pages that load public scripts
assets/css/catalog-premium.css
tests/frontend/*
tests/frontend/fixtures/*
```

Not allowed:

```text
backend/**
catalog/cards/**
prisma/**
Render config
Cloud/Supabase credentials
image upload limit files
Direct Pages publication files
```

- [ ] **Step 6: Commit boundary**

If Step 1-5 required review fixes, commit only the regression test and narrow fix:

```bash
git add assets/js/catalog-v2/catalog-runtime.js assets/js/catalog-v2/catalog-api.js assets/js/catalog-v2/main.js sw.js assets/css/catalog-premium.css app.html brief.html cabinet.html cases.html consent-personal-data.html contacts.html faq.html how-it-works.html index.html install.html pricing.html privacy-policy.html services.html solutions.html status.html tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-main-retry.test.mjs tests/frontend/catalog-normalization.test.mjs tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/service-worker-contract.test.mjs tests/frontend/static-page-contract.test.mjs tests/frontend/pages-catalog-generator.test.mjs tests/frontend/fixtures/legacy-sw-v6.js
git commit -m "fix: harden zero-stale catalog runtime"
```

If Step 1-5 required no fixes, make no extra commit in this task.

- [ ] **Step 7: Prepare PR**

Open PR against `main` only after final gates pass.

PR title:

```text
feat: add zero-stale catalog runtime
```

PR body must report:

```text
ZERO_STALE_GHOST
ATOMIC_GRID_RENDER
WARM_VERIFIED_CACHE
NEW_REVISION_PROMOTION
CORRUPTION_REJECTION
SW_MIGRATION
RENDER_INDEPENDENCE
GITHUB_INDEPENDENCE
```

PR body must also state:

```text
No merge performed.
No deploy performed.
No production DB/API mutation performed.
VPN ON/OFF owner acceptance remains post-deploy.
```

- [ ] **Step 8: Stop after PR**

Do not merge.
Do not deploy.
Do not run production smoke.
Do not mutate production data.

---

## Post-Merge Owner Acceptance

Implementation must not execute this section. It is the owner acceptance script after merge/deploy permission.

1. Establish current Cloud revision/SHA.
2. Cold clean-browser load.
3. Warm same-revision load.
4. Controlled canary publish/edit.
5. Verify no old-title flash.
6. Canary delete.
7. Verify no ghost deleted card.
8. VPN OFF.
9. VPN ON.
10. Verify no GitHub CRUD PR/commit.
11. Verify no Render request for initial public catalog.

Final production markers:

```text
ZERO_STALE_GHOST = PASS
ATOMIC_GRID_RENDER = PASS
WARM_VERIFIED_CACHE = PASS
NEW_REVISION_PROMOTION = PASS
CORRUPTION_REJECTION = PASS
SW_MIGRATION = PASS
VPN_OFF = PASS
VPN_ON = PASS
RENDER_INDEPENDENCE = PASS
GITHUB_INDEPENDENCE = PASS
```

---

## Plan Self-Review

### Spec Coverage

- Production source of truth: Tasks 2 and 3 use manifest revision/SHA as freshness authority.
- Zero-Stale rule: Tasks 3 and 4 remove Cloud-primary static current paint and require skeleton-first rendering.
- Warm same revision: Tasks 2 and 7 verify manifest-first plus cache-hit snapshot reuse.
- New revision: Tasks 2, 4, and 7 verify old revision is not rendered as current and current revision renders once.
- Verified cache: Task 2 defines cache namespace, metadata identity, rehash, commit order, torn-write handling, missing cache handling, and quota failure behavior.
- Existing LKG: Task 3 keeps LKG out of Cloud-primary current state.
- data.js role: Task 3 makes static catalog degraded disaster fallback only.
- Slow VPN/network: Tasks 4 and 7 verify stable skeleton and one final render after validation.
- Cloud unavailable: Task 3 verifies degraded verified fallback before static fallback.
- Atomic render contract: Task 4 implements one grid DOM write for accepted catalog state.
- Images: Task 4 fixes skeleton and preview geometry while preserving lazy image loading.
- Early manifest start: Task 5 primes manifest before DOMContentLoaded and avoids duplicate startup fetch.
- Manifest lifecycle: Tasks 2 and 5 clear in-flight references and make fresh retry requests.
- Security invariants: Tasks 2 and 3 preserve approved origin, no credentials, redirect error, schema/count/SHA validation, URL sanitizer, and demo URL security.
- Service Worker migration: Tasks 1 and 6 prove query-string-only risk and require physical v2 paths plus v7 exact request identity.
- UI contract: Task 4 uses skeleton and optional degraded state while preventing stale cards.
- Performance goals: Tasks 2 and 7 verify warm path avoids snapshot download and new revision uses one snapshot download.
- Pages in scope: Tasks 5 and 6 include solutions, home, brief, and all root pages loading the public runtime.
- Compatibility: Tasks 2 and 3 keep Cloud schema v1 and do not change backend Atomic publication.
- Acceptance tests: Task 7 maps every automated acceptance scenario.
- Non-goals: Global Constraints and Task 8 scope exclude backend CRUD, schemas, Cloud schema, GitHub runtime, image upload limit, and production actions.

### Consistency Check

- `primeManifest(config, options)` is defined in Task 2 and consumed by Task 5.
- `loadCatalogFromRuntime(config, options)` returns `freshness`, `transport`, `manifest`, and `snapshot`; Task 3 consumes all four.
- `loadVerifiedFallback(options)` returns degraded verified state; Task 3 consumes it before static fallback.
- `getInitialCatalog(options)` returns bootstrap state for Cloud-primary; Task 4 consumes it without static cards.
- `resolveCatalogForPage(options)` returns explicit `freshness`; Task 4 render gating uses that field.
- Physical v2 paths are consistent across Tasks 1, 4, 5, 6, 7, and 8.
- Cache namespace is consistently `web00-catalog-verified-v1`.
- SW namespace is consistently `web00-shell-v7-zero-stale`.

### Final Plan Gate

Before implementation starts, run:

```bash
node -e "const fs=require('node:fs');const s=fs.readFileSync('docs/superpowers/plans/2026-08-08-catalog-zero-stale-runtime.md','utf8');const parts=['TO','DO','TB','D','FIX','ME','place','holder','implement ','later'];const bad=[parts[0]+parts[1],parts[2]+parts[3],parts[4]+parts[5],parts[6]+parts[7],parts[8]+parts[9]];for(const value of bad){if(s.includes(value)){console.error(value);process.exit(1)}}"
git diff --check
```

Expected:

```text
No unresolved markers.
No whitespace errors.
```
