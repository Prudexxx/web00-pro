# First Load Catalog Flash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public catalog paint immediately from LKG or bundled published snapshot, then revalidate against immutable public snapshot artifacts without depending on Render `/api/sites`.

**Architecture:** Add a deterministic bundled published snapshot script containing revision 1, 16 solutions, and a separate popular-three list. Extend the existing frontend catalog client so initial state uses LKG -> bundled snapshot -> legacy `data.js`, runtime revalidation uses `public-catalog/v1/manifest.json -> manifest.snapshotUrl`, equal revisions do not trigger DOM/image work, and newer revisions preload images before a single swap.

**Tech Stack:** Static HTML, classic browser scripts, Node `node:test`, local deterministic Node generator, existing WEB00 frontend helpers.

## Global Constraints

- Work only in `D:\WEB00_WORKTREES\web00-first-load-catalog-flash`.
- Branch must remain `fix/web00-first-load-catalog-flash`.
- Base HEAD is `3df17e0813f625bb8ad509248d80c946bc7e90fe`.
- Do not touch backend behavior, Prisma, Render, production DB, admin/sync, PR #14 state, or production APIs.
- Runtime authoritative source is `public-catalog/v1/manifest.json -> manifest.snapshotUrl -> immutable revision-N.json`.
- First frame source order is LKG -> bundled published snapshot -> legacy `assets/js/data.js` emergency fallback.
- Bundled artifact must contain revision `1`, 16 solution cards, `site-custom`, `dom-dlya-busi` / `Дом для Буси`, and authoritative popular 3.
- If remote snapshot semantically matches current bundled/LKG, do not rerender DOM and do not reload images.
- If remote snapshot is newer, keep old catalog visible, preload new images, then perform one atomic swap.
- If manifest/snapshot/preload/timeout fails, keep current catalog visible and preserve the no-good-to-empty invariant.
- Public catalog must not require Render `/api/sites` or Render cold start.
- Add tests before production code and verify RED before implementation.
- Final commit message must be `fix: eliminate first-load catalog flash`.
- Push is normal fast-forward only: `git push origin HEAD:main`.

---

### Task 1: Bundled Published Snapshot Artifact And Generator

**Files:**
- Create: `assets/js/public-catalog-bundled-snapshot.js`
- Create: `scripts/build-public-catalog-bundled-snapshot.mjs`
- Modify: `tests/frontend/catalog-normalization.test.mjs`
- Create: `tests/frontend/public-catalog-bundled-snapshot.test.mjs`
- Modify: `tests/frontend/static-page-contract.test.mjs`
- Modify: `tests/frontend/service-worker-contract.test.mjs`

**Interfaces:**
- Produces `window.WEB00_PUBLIC_CATALOG_BUNDLED_SNAPSHOT` with `{ schemaVersion, revision, generatedAt, settings, itemsCount, items, popular }`.
- `items` are public API-shaped site objects acceptable to `WEB00_CATALOG.normalizeApiSite`.
- `popular` is a separate array of exactly 3 public API-shaped site objects.
- Generator command: `node scripts/build-public-catalog-bundled-snapshot.mjs`.

- [ ] **Step 1: Write failing artifact and generator tests**

Add tests that load `assets/js/public-catalog-bundled-snapshot.js` and assert:

```js
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.revision, 1);
assert.equal(snapshot.itemsCount, 16);
assert.equal(snapshot.items.some((item) => item.slug === "site-custom"), true);
assert.equal(snapshot.items.some((item) => item.slug === "dom-dlya-busi" && item.title === "Дом для Буси"), true);
assert.deepEqual(snapshot.popular.map((item) => item.slug), ["mebel", "medicina", "doma-bani"]);
assert.equal(JSON.stringify(snapshot).includes("demoLocalUrl"), false);
assert.equal(JSON.stringify(snapshot).includes("externalDemoUrl"), false);
assert.equal(JSON.stringify(snapshot).includes("originalDemoUrl"), false);
```

Add generator test that runs `node scripts/build-public-catalog-bundled-snapshot.mjs --check` and expects exit 0 after implementation.

- [ ] **Step 2: Verify RED**

Run:

```powershell
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\node.exe" --test tests\frontend\public-catalog-bundled-snapshot.test.mjs
```

Expected before implementation: FAIL because the bundled script and generator do not exist.

- [ ] **Step 3: Implement generator and artifact**

Create a deterministic generator that reads `assets/js/data.js` in a VM, maps active legacy `SOLUTIONS` into public snapshot items, appends the owner-known `dom-dlya-busi` public card, selects popular slugs `mebel`, `medicina`, `doma-bani`, writes stable JSON in a classic script wrapper, and supports `--check`.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\node.exe" scripts\build-public-catalog-bundled-snapshot.mjs --check
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\node.exe" --test tests\frontend\public-catalog-bundled-snapshot.test.mjs
```

Expected: PASS, revision 1, 16 items, popular 3, no private fields.

### Task 2: Snapshot-First Catalog Client

**Files:**
- Modify: `assets/js/catalog-api.js`
- Create: `assets/js/public-catalog-snapshot.js`
- Modify: `assets/js/runtime-config.js`
- Modify: `tests/frontend/catalog-api-client.test.mjs`
- Modify: `tests/frontend/catalog-resilience.test.mjs`
- Create: `tests/frontend/public-catalog-snapshot.test.mjs`
- Modify: `tests/frontend/runtime-config.test.mjs`

**Interfaces:**
- `WEB00_CATALOG.getInitialCatalog({ limit })` returns LKG -> bundled snapshot -> legacy static.
- `WEB00_CATALOG.resolveCatalogForPage({ kind, limit, currentState })` uses `WEB00_PUBLIC_CATALOG_SNAPSHOT.resolveCatalogState` when `publicCatalogManifestUrl` is configured.
- `WEB00_PUBLIC_CATALOG_SNAPSHOT.resolveCatalogState` returns `null` for same/equivalent snapshot and a ready state for newer snapshots.
- LKG storage stores revisioned public snapshot state and enforces schema, URL, item count, and 2 MiB bounds.

- [ ] **Step 1: Write failing snapshot client tests**

Add tests for:

```js
assert.equal(catalog.getInitialCatalog().source, "bundled");
assert.equal(catalog.getInitialCatalog().revision, 1);
assert.equal(catalog.getInitialCatalog().items.length, 16);
assert.equal(await catalog.resolveCatalogForPage({ kind: "solutions", currentState: catalog.getInitialCatalog() }), null);
assert.equal(fetch.calls.some((call) => call.url.includes("onrender.com")), false);
```

Add malformed manifest/snapshot and timeout tests that preserve current state or return `null` rather than empty/fatal when a good current state exists.

- [ ] **Step 2: Verify RED**

Run:

```powershell
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\node.exe" --test tests\frontend\public-catalog-snapshot.test.mjs tests\frontend\catalog-resilience.test.mjs tests\frontend\catalog-api-client.test.mjs tests\frontend\runtime-config.test.mjs
```

Expected before implementation: FAIL because snapshot source, bundled source, and runtime config fields are absent.

- [ ] **Step 3: Implement snapshot-first catalog client**

Add safe manifest/snapshot validation, SHA-256 verification via WebCrypto, no-credentials no-store fetch, trusted Supabase storage URL allowlist, LKG read/write, semantic snapshot comparison by revision and item slugs, and API fallback only when snapshot client is not configured.

- [ ] **Step 4: Verify GREEN**

Run the same focused command. Expected: PASS.

### Task 3: First-Frame Render, Same-Revision No-Op, And Atomic Swap

**Files:**
- Modify: `assets/js/main.js`
- Modify: `tests/frontend/catalog-main-retry.test.mjs`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**
- `initCatalogState()` sets `catalogState = CATALOG.getInitialCatalog()` synchronously before background revalidation.
- `initPopularCatalogState()` sets `popularCatalogState = CATALOG.getInitialCatalog({ limit: 3 })` synchronously.
- `refreshCatalogInBackground()` treats `null` as unchanged and does not schedule retry for same/equivalent snapshot.
- Newer states pass `preloadCatalogImages(nextState)` before `applyCatalogState(nextState)`.
- `applyCatalogState(nextState)` performs a single render after preload.

- [ ] **Step 1: Write failing render tests**

Add tests proving:

```js
assert.equal(history.length, 1); // same snapshot after first paint
assert.equal(imageLoads.length, 0); // same snapshot
assert.deepEqual(events, ["preload:new-a", "preload:new-b", "render"]);
assert.match(history.at(-1), /Newer 17th/);
assert.doesNotMatch(history.at(-1), /Newer 17th/); // when preload fails
```

Add a home-page test that popular first frame renders bundled popular 3 without waiting for network.

- [ ] **Step 2: Verify RED**

Run:

```powershell
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\node.exe" --test tests\frontend\catalog-main-retry.test.mjs tests\frontend\static-page-contract.test.mjs
```

Expected before implementation: FAIL because popular renders only API, same revision schedules retry/rerender, and preload does not gate swaps.

- [ ] **Step 3: Implement render behavior**

Allow `snapshot`, `lkg`, and `bundled` ready states to render. Preserve existing modal/brief lookup. Add bounded image preloading for preview and responsive variant URLs. On preload failure, mark current state degraded and do not swap.

- [ ] **Step 4: Verify GREEN**

Run the same focused command. Expected: PASS.

### Task 4: Script Order, Service Worker, Full Verification, Review, Commit, Push, Pages

**Files:**
- Modify: root HTML pages that load B9 scripts
- Modify: `sw.js`
- Modify: `tests/frontend/service-worker-contract.test.mjs`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**
- Root pages load `data.js`, `runtime-config.js`, `public-catalog-bundled-snapshot.js`, `catalog-api.js`, `public-catalog-snapshot.js`, `main.js` in that order with one cache-bust version.
- Service worker precaches the bundled snapshot and snapshot client, but keeps runtime config and `/api/*` network-only.

- [ ] **Step 1: Write/update failing static contract tests**

Assert root script order and service worker shell assets include the two new snapshot scripts.

- [ ] **Step 2: Verify RED**

Run:

```powershell
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\node.exe" --test tests\frontend\static-page-contract.test.mjs tests\frontend\service-worker-contract.test.mjs
```

Expected before implementation: FAIL until HTML/SW are updated.

- [ ] **Step 3: Implement script order and service worker cache version**

Update all root pages, bump cache-bust token, bump `WEB00_CACHE`, add new JS assets to `SHELL_ASSETS`, and leave runtime config and `/api/*` network-only.

- [ ] **Step 4: Full verification**

Run:

```powershell
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\node.exe" --test tests\frontend\*.test.mjs
Set-Location backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run check
Set-Location ..
git diff --check
git diff -- backend backend\prisma
```

Expected: frontend tests pass, backend `npm run check` passes, diff check passes, backend behavior/prisma unchanged.

- [ ] **Step 5: Request code review**

Dispatch read-only code review for `3df17e0813f625bb8ad509248d80c946bc7e90fe..HEAD` checking no Render dependency, no same-revision rerender, no image reload, atomic swap, LKG bounds, no secrets/private fields, and no PR #14 mutation.

- [ ] **Step 6: Commit, push, and Pages verification**

After fresh full PASS and review fixes:

```powershell
git add -- assets docs scripts tests *.html sw.js
git diff --cached --check
git commit -m "fix: eliminate first-load catalog flash"
git push origin HEAD:main
gh run list --repo Prudexxx/web00-pro --branch main --limit 10
```

Wait until the GitHub Pages deployment workflow for the pushed commit succeeds.
