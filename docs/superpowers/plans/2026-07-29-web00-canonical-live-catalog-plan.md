# WEB00 Canonical Live Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** publish the canonical WEB00 catalog by default, preserve owner Admin UI changes, fix multipart auth refresh, and make the production public frontend API-authoritative.

**Architecture:** Backend seed creates only missing canonical rows from a published deterministic snapshot and never rewrites existing owner rows. A one-time Prisma migration promotes only eligible existing canonical rows. The public frontend uses `catalog-api.js` as the single catalog access layer and disables production static fallback and sessionStorage API caching.

**Tech Stack:** Node 22, TypeScript, Prisma 7, PostgreSQL SQL migrations, Vitest for backend, Node test runner for frontend classic-script tests, static HTML/CSS/JS.

## Global Constraints

- Work branch: `feat/web00-backend-production`.
- Expected initial HEAD: `8e8fa43e1ceef20eb55e12348f90e53ad812b7e7` or direct descendant.
- Do not touch `main`, PR #1, GitHub Pages source, or merge PR #2.
- Do not delete, unpublish, or edit `drova-test-copy-20260729`.
- Canonical slugs: `site-custom`, `mebel`, `odezhda`, `doma-bani`, `medicina`, `narko-medicine`, `uslugi`, `cleaning`, `advokat`, `krovlya`, `digital-projects`, `ruberoid-roof`, `rental-house`, `massage`, `drova`.
- New Admin UI sites remain `draft`.
- No dependency install or package-lock changes unless an existing script already requires its generated output.
- No startup seed/bootstrap.

---

### Task 1: Health Gate and Documentation

**Files:**
- Create: `docs/superpowers/specs/2026-07-29-web00-canonical-live-catalog-design.md`
- Create: `docs/superpowers/plans/2026-07-29-web00-canonical-live-catalog-plan.md`

**Interfaces:**
- Consumes: owner-approved production task.
- Produces: frozen implementation contract for backend, migration, frontend, verification, release branch, and PR #2.

- [ ] **Step 1: Run precheck**

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git log -5 --oneline
git remote -v
git merge-base --is-ancestor 8e8fa43e1ceef20eb55e12348f90e53ad812b7e7 HEAD; $LASTEXITCODE
```

Expected: clean worktree, branch `feat/web00-backend-production`, HEAD equal to or descendant of `8e8fa43e1ceef20eb55e12348f90e53ad812b7e7`, remote `Prudexxx/web00-pro`.

- [ ] **Step 2: Write design/spec**

Document root causes, canonical allowlist, snapshot defaults, one-time migration guard, multipart refresh/replay, API-authoritative frontend policy, production verification, and release boundaries.

- [ ] **Step 3: Write implementation plan**

Create this task-by-task plan with exact commands and files.

### Task 2: Multipart Auth Refresh and Replay

**Files:**
- Modify: `backend/tests/admin-ui.api-client.test.mjs`
- Modify: `backend/src/admin/assets/api-client.js`

**Interfaces:**
- Consumes: `createApiClient({ authStore, fetchImpl })`, `requestMultipart(path, options)`, existing `refreshAccess`.
- Produces: `requestMultipart(path, options, replayed=false)` behavior matching JSON refresh without setting multipart `Content-Type`.

- [ ] **Step 1: Write failing tests**

Add tests that prove:

```js
await api.requestMultipart("/api/admin/sites/00000000-0000-4000-8000-000000000002/images/preview", {
  body: formData,
  method: "PUT",
  signal
});
```

first sees `401 UNAUTHORIZED`, refreshes once through `/api/auth/refresh`, replays once with the same `FormData` object and the new Authorization token, then resolves the `201` body. Add separate tests for second `401` no loop and `auth:false` no refresh.

- [ ] **Step 2: Verify RED**

```powershell
Set-Location D:\WEB00_BACKEND\backend
npm run prisma:generate
npx vitest run tests/admin-ui.api-client.test.mjs
```

Expected: new multipart replay tests fail because `requestMultipart` does not refresh/replay yet.

- [ ] **Step 3: Implement minimal code**

Change `requestMultipart` to accept `replayed=false`, check `isAuthExpiredResponse(response, body)`, call `refreshAccess({ signal: requestOptions?.signal })`, and recursively replay once. Update `toMultipartFetchOptions` so `auth:false` suppresses Authorization and existing body/method/signal behavior stays unchanged.

- [ ] **Step 4: Verify GREEN**

```powershell
Set-Location D:\WEB00_BACKEND\backend
npx vitest run tests/admin-ui.api-client.test.mjs
```

Expected: all admin API client tests pass and the JSON auth tests still pass.

- [ ] **Step 5: Commit**

```powershell
git add backend/tests/admin-ui.api-client.test.mjs backend/src/admin/assets/api-client.js
git commit -m "fix: refresh auth for multipart admin uploads"
```

### Task 3: Canonical Snapshot and Seed Preservation

**Files:**
- Modify: `backend/tests/snapshot-builder.test.ts`
- Modify: `backend/tests/snapshot-verifier.test.ts`
- Modify: `backend/tests/seed.test.ts`
- Modify: `backend/scripts/build-catalog-snapshot.ts`
- Modify: `backend/scripts/verify-catalog-snapshot.ts`
- Modify: `backend/prisma/seed-web00-data.ts`
- Modify: `backend/prisma/seed-data/web00-catalog.json`

**Interfaces:**
- Consumes: `buildCatalogSnapshot({ sourceCommit, sourceSha256, sourceText })`, `validateCatalogSnapshot`, `seedWeb00Catalog`.
- Produces: deterministic published canonical snapshot for new rows and non-overwriting repeated seed behavior for owner rows.

- [ ] **Step 1: Write failing tests**

Update snapshot builder/verifier fixtures to expect:

```ts
status: "published",
publishedAt: "2026-07-24T00:00:00.000Z"
```

Add seed tests that mutate existing `mebel` and soft-delete existing `drova`, then re-run `seedWeb00Catalog` and assert the changed title and soft-delete/draft/null-published state are preserved.

- [ ] **Step 2: Verify RED**

```powershell
Set-Location D:\WEB00_BACKEND\backend
npx vitest run tests/snapshot-builder.test.ts tests/snapshot-verifier.test.ts tests/seed.test.ts
```

Expected: snapshot tests fail because builder/verifier and JSON snapshot still use `draft`/`null`.

- [ ] **Step 3: Implement builder and verifier contract**

Set a `SNAPSHOT_GENERATED_AT` constant to `2026-07-24T00:00:00.000Z`. Use it for `generatedAt` and `publishedAt`; widen snapshot status type to `"draft" | "published"` where required; add verifier checks that published sites have non-empty valid ISO `publishedAt`.

- [ ] **Step 4: Rebuild snapshot with approved builder**

```powershell
Set-Location D:\WEB00_BACKEND\backend
npm run seed:build-snapshot
npm run seed:verify
```

Expected: snapshot has 7 categories, 15 sites, every site published with deterministic `publishedAt`.

- [ ] **Step 5: Verify GREEN**

```powershell
Set-Location D:\WEB00_BACKEND\backend
npx vitest run tests/snapshot-builder.test.ts tests/snapshot-verifier.test.ts tests/seed.test.ts tests/cli.production-scripts.test.ts
```

Expected: focused tests pass and production start remains seed-free.

### Task 4: One-Time Prisma Migration

**Files:**
- Create: `backend/prisma/migrations/20260729120000_publish_canonical_catalog/migration.sql`
- Modify: `backend/tests/integration/prisma-migration.test.ts`

**Interfaces:**
- Consumes: existing PostgreSQL `sites` table.
- Produces: one-time promotion of eligible current production canonical rows.

- [ ] **Step 1: Write failing migration tests**

Add integration checks that read the migration SQL and verify it contains all 15 canonical slugs, `drova-test-copy-20260729` is absent, the guard accepts only update counts `0` and `15`, and the update predicate includes:

```sql
status = 'draft'
published_at IS NULL
active = true
deleted_at IS NULL
```

- [ ] **Step 2: Verify RED**

```powershell
Set-Location D:\WEB00_BACKEND\backend
npx vitest run tests/integration/prisma-migration.test.ts
```

Expected: new test fails because the migration file does not exist.

- [ ] **Step 3: Add migration SQL**

Create a PostgreSQL `DO $$` block that updates only eligible canonical rows, captures `ROW_COUNT`, and raises an exception unless count is `0` or `15`.

- [ ] **Step 4: Verify GREEN**

```powershell
Set-Location D:\WEB00_BACKEND\backend
npx vitest run tests/integration/prisma-migration.test.ts
npm run prisma:validate
```

Expected: migration contract tests and Prisma validation pass.

- [ ] **Step 5: Commit**

```powershell
git add backend/tests/snapshot-builder.test.ts backend/tests/snapshot-verifier.test.ts backend/tests/seed.test.ts backend/tests/integration/prisma-migration.test.ts backend/scripts/build-catalog-snapshot.ts backend/scripts/verify-catalog-snapshot.ts backend/prisma/seed-web00-data.ts backend/prisma/seed-data/web00-catalog.json backend/prisma/migrations/20260729120000_publish_canonical_catalog/migration.sql
git commit -m "feat: publish canonical catalog by default"
```

### Task 5: API-Authoritative Public Frontend

**Files:**
- Create/Modify: `assets/js/catalog-api.js`
- Modify: `assets/js/runtime-config.js`
- Modify: `assets/js/main.js`
- Modify: HTML pages that load public scripts
- Modify: `sw.js`
- Create/Modify: `tests/frontend/catalog-api-client.test.mjs`
- Create/Modify: `tests/frontend/runtime-config.test.mjs`
- Create/Modify: `tests/frontend/static-page-contract.test.mjs`
- Create/Modify: frontend helper tests under `tests/frontend/helpers/`

**Interfaces:**
- Consumes: public API envelopes from `https://web00-backend-production.onrender.com`.
- Produces: `window.WEB00_CATALOG.resolveCatalogForPage`, `loadAllSites`, `loadPopularSites`, `loadSiteDetail`, and normalized catalog item models.

- [ ] **Step 1: Write failing frontend tests**

Add Node test-runner tests asserting configured API with `{data: [], meta:{total:0}}` returns zero items and `staticFallbackActive=false`; API error plus `staticFallbackEnabled:false` returns `lifecycle="fatal"`; API disabled returns static catalog; two API-backed calls perform two fetches; popular and solutions use the same fallback policy.

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/frontend/*.test.mjs
```

Expected: tests fail on production branch because `catalog-api.js` or required API-authoritative behavior is absent.

- [ ] **Step 3: Port and harden catalog API layer**

Bring in the existing release catalog API layer, remove sessionStorage API result reads/writes for production API mode, change configured empty result to `source="api"`, `lifecycle="empty"`, and set production runtime config `staticFallbackEnabled:false`.

- [ ] **Step 4: Wire pages**

Ensure all public pages that use `assets/js/main.js` load `assets/js/runtime-config.js` and `assets/js/catalog-api.js` before `main.js`. Ensure `main.js` renders homepage popular and solutions pages from `WEB00_CATALOG.resolveCatalogForPage` when present and keeps static mode when API is disabled.

- [ ] **Step 5: Verify GREEN**

```powershell
node --test tests/frontend/*.test.mjs
```

Expected: frontend tests pass.

- [ ] **Step 6: Commit**

```powershell
git add assets js html sw.js tests/frontend
git commit -m "fix: make production catalog API authoritative"
```

### Task 6: Full Local Verification

**Files:**
- Reads all changed files and test suites.

**Interfaces:**
- Consumes: completed commits on `feat/web00-backend-production`.
- Produces: local evidence for push/deploy.

- [ ] **Step 1: Backend focused verification**

```powershell
Set-Location D:\WEB00_BACKEND\backend
npx vitest run tests/admin-ui.api-client.test.mjs tests/snapshot-builder.test.ts tests/snapshot-verifier.test.ts tests/seed.test.ts tests/integration/prisma-migration.test.ts tests/integration/admin-api.test.ts tests/integration/admin-site-images-api.test.ts
```

- [ ] **Step 2: Backend full check**

```powershell
Set-Location D:\WEB00_BACKEND\backend
npm run check
```

- [ ] **Step 3: Frontend full test suite**

```powershell
Set-Location D:\WEB00_BACKEND
node --test tests/frontend/*.test.mjs
```

- [ ] **Step 4: Local release smoke**

Serve root statically, open desktop and mobile viewport, and verify no duplicate slugs, no broken images, no console errors, no horizontal overflow, 3/2/1 grid columns, the test clone sorts last when production API is reachable, gallery has four images, and delivery filter shows original plus clone.

### Task 7: Push, Deploy, Release Branch, PR #2

**Files:**
- Git branches and PR description only.

**Interfaces:**
- Consumes: local verified production branch.
- Produces: deployed production backend and updated release branch/PR #2 without merging main.

- [ ] **Step 1: Push production branch**

```powershell
git push origin feat/web00-backend-production
```

- [ ] **Step 2: Wait for Render deploy**

Poll health/readiness and deployed commit until it matches pushed production HEAD.

- [ ] **Step 3: Verify production public API**

```powershell
Invoke-RestMethod 'https://web00-backend-production.onrender.com/api/sites?limit=20&page=1&sort=sortOrder'
```

Expected: `meta.total=16`, canonical slug count `15`, `drova-test-copy-20260729` count `1`, published rows only, clone last by `sortOrder=999`.

- [ ] **Step 4: Update release branch without force**

Switch to `release/web00-production-live`, merge or fast-forward from `feat/web00-backend-production` without history rewrite, run release gate, push release.

- [ ] **Step 5: Update PR #2 only**

Update description/status to include Admin UI, canonical 15 published, multipart 401 fix, API-authoritative frontend, production verification, real mobile checks, and exact test results. Do not merge PR #2.

### Task 8: Final Report

**Files:**
- No additional files required.

**Interfaces:**
- Consumes: git, test, deploy, release, and PR evidence.
- Produces: owner-facing final report.

- [ ] **Step 1: Report exact required sections**

Return the owner report with:

```text
1. PRECHECK branch/initial HEAD/worktree status
2. ROOT CAUSES why 15 draft, why multipart 401, why live frontend didn't see clone, why stale fallback blocked true delete
3. CHANGES files/migrations/tests/docs
4. COMMITS SHA/message/branch
5. LOCAL VERIFICATION commands exact PASS/FAIL number test files/tests
6. PRODUCTION DEPLOY Render commit/migration result/health-ready/public API total/canonical=15/test clone=1
7. RELEASE BRANCH HEAD/PR #2/main unchanged
8. RISKS only real risks
9. FINAL STATUS READY_FOR_OWNER_LIVE_MERGE or BLOCKED
```

Stop after `READY_FOR_OWNER_LIVE_MERGE`; do not merge PR #2.
