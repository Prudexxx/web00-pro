# External Demo iframe Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make «Открывать демо внутри WEB00» embed safe external HTTPS demos instead of forcing same-origin fallback.

**Architecture:** Change only `assets/js/catalog-v2/main.js`: replace the same-origin predicate with strict HTTPS/no-credentials validation and keep the existing modal/fallback structure. Prove behavior through the existing catalog-v2 fake-browser harness.

**Tech Stack:** Vanilla JS, Node.js 22 `node:test`, existing frontend helpers.

## Global Constraints

- OFF => external fallback, no iframe.
- ON + HTTPS URL without username/password => iframe attempt.
- Unsafe/malformed/non-HTTPS => no iframe.
- «Открыть отдельно» always remains for external demos.
- Do not proxy/strip CSP or X-Frame-Options.
- Internal demos unchanged.
- Do not touch Zero-Stale, CRUD/publication, backend, images, Render env, Supabase, Cloud.ru.

---

### Task 1: Implement and prove external iframe policy

**Files:**
- Modify: `tests/frontend/catalog-main-retry.test.mjs:390-560`
- Modify: `assets/js/catalog-v2/main.js:1020-1045`
- Modify: `assets/js/catalog-v2/main.js:1665-1695`

**Interfaces:**
- Consumes: `catalogState.settings.showDemoInModal`, `solution.demoMode`, `solutionDemoUrl(solution)`
- Produces: `isSafeExternalDemoUrl(url) -> boolean`

- [ ] **Step 1: Extend the solutions test harness**

Add `demoContent`, `demoModal`, `demoDialog` doubles to `createSolutionsPage()`. Map:

```js
if (selector === "[data-demo-modal-content]") return demoContent;
if (selector === '[data-modal="demo"]') return demoModal;
if (selector === '[data-modal="demo"] .modal__dialog') return demoDialog;
```

`demoContent` captures `innerHTMl`; its `querySelector()` returns `null`, `querySelectorAll()` returns `[]`.

- [ ] **Step 2: Write failing product-contract tests**

Use a current Cloud item:

```js
const item = {
  ...catalogItem("spasilen", "Спасилен"),
  demoMode: "external-iframe",
  demoUrl: "https://spasilen.com/",
  externalDemoUrl: "https://spasilen.com/",
};
```

With `settings: { showDemoInModal: true }`, trigger the existing `[data-open-demo-id]` click path and assert:

```js
assert.match(page.demoContent.html, /data-demo-iframe/);
assert.match(page.demoContent.html, /src="https:\/\/spasilen\.com\/"/);
assert.match(page.demoContent.html, /Открыть отдельно/);
assert.doesNotMatch(page.demoContent.html, /Полный просмотр открывается отдельно/);
```

Add cases: OFF => fallback/no iframe; `http://...` => no iframe; `https://user:pass@...` => no iframe; malformed => no iframe; internal demo unchanged.

- [ ] **Step 3: Verify RED**

```cmd
node --test tests/frontend/catalog-main-retry.test.mjs
```

Expected: ON + external HTTPS fails because current helper requires same origin.

- [ ] **Step 4: Minimal implementation**

Replace:

```js
function isTrustedInternalDemoUrl(url) {
```

with:

```js
function isSafeExternalDemoUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "";
  } catch (_) {
    return false;
  }
}
```

Update `openDemoModal()`:

```js
const showExternalDemoInside = isExternalDemo &&
  catalogShowDemoInModal() &&
  Boolean(demoUrl) &&
  isSafeExternalDemoUrl(demoUrl);
```

Do not add proxying, preflight fetches, allowlists, or CSP detection.

- [ ] **Step 5: Verify GREEN and regressions**

```cmd
node --test tests/frontend/catalog-main-retry.test.mjs
node --test tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/catalog-normalization.test.mjs tests/frontend/static-contract.test.mjs
node --check assets/js/catalog-v2/main.js
git diff --check
```

Expected: all selected suites PASS.

- [ ] **Step 6: Scope review and commit**

```cmd
git status --short
git diff -- assets/js/catalog-v2/main.js tests/frontend/catalog-main-retry.test.mjs
git add assets/js/catalog-v2/main.js tests/frontend/catalog-main-retry.test.mjs
git commit -m "fix: allow safe external demos in modal"
```

Expected implementation scope: only v2 `main.js` + focused test; docs are separate planning commits.

### Task 2: Merge gate and production acceptance

- [ ] **Step 1: Full frontend gate**

Run the repository's established full frontend test command; if there is no wrapper, run all `tests/frontend/*.test.mjs` with Node 22. No new failures vs `main`.

- [ ] **Step 2: Compare with main**

```cmd
git diff --name-only main...HEAD
git diff --check main...HEAD
```

Expected: spec, plan, `assets/js/catalog-v2/main.js`, focused test only.

- [ ] **Step 3: Push / PR / CI**

Push branch, open PR to `main`, review diff, require green CI before merge.

- [ ] **Step 4: Production acceptance**

For published `Спасилен`:
`demoMode=external-iframe`, `demoUrl=https://spasilen.com/`, setting ON.

Expected: WEB00 attempts an iframe and keeps «Открыть отдельно»; it must not immediately render its own external-only fallback. If the third-party site blocks framing via CSP/X-Frame-Options, record that as third-party policy. Verify setting OFF still forces fallback.
