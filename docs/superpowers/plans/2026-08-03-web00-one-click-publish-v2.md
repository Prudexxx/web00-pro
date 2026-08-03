# WEB00 One-Click Publish V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable one-click admin publication flow and Public Catalog V2 so the owner can publish a card and verified images with one primary control, while the public frontend reads an always-available 10,000-card sharded release from Supabase Storage.

**Architecture:** Keep content lifecycle, publication operation lifecycle and public release lifecycle separate. Backend builds immutable V2 release artifacts in `web00-public-catalog`, switches `active.json` last, and verifies exact media/card parity before the UI shows `Опубликовано`. Public frontend reads V2 Storage artifacts first, caches immutable artifacts in CacheStorage and uses IndexedDB for active metadata.

**Tech Stack:** Node 22.23.1, TypeScript, Express, Prisma 7.8, PostgreSQL, Supabase Storage, Sharp, Vitest, browser JS tests with `node --test`.

## Global Constraints

- Work in isolated task branches only.
- Do not touch production DB, production API, production Supabase Storage, Render, GitHub Pages or PR #14 without a separate explicit owner release gate.
- Do not change old migrations.
- Do not force push; rollback uses normal revert/redeploy or a new activation event.
- Do not use `assets/js/data.js` as a production V2 generator input.
- Do not add multiple ordinary publication buttons.
- JSON Storage bucket is `web00-public-catalog`.
- Image Storage bucket remains `web00-catalog-images`.
- V1 remains available during rollout.
- Default automatic snapshot publication is ON.
- Default demo inside WEB00 modal is ON.
- Owner success state `Опубликовано` requires public read-back parity PASS.
- Local test data may be synthetic only when its file or test name includes `synthetic` or `fixture`.

---

## File Structure

### Backend V2 catalog

- Create `backend/src/modules/public-catalog-v2/public-catalog-v2.types.ts`: exported DTO and operation types.
- Create `backend/src/modules/public-catalog-v2/public-catalog-v2.schemas.ts`: runtime validators for V2 active, manifest, index, popular, categories and chunk payloads.
- Create `backend/src/modules/public-catalog-v2/public-catalog-v2.paths.ts`: Storage path builders and bucket guards.
- Create `backend/src/modules/public-catalog-v2/public-catalog-v2.serializer.ts`: stable JSON serialization and exact SHA-256 helpers.
- Create `backend/src/modules/public-catalog-v2/public-catalog-v2.repository.ts`: Prisma keyset projection, operation rows, release rows and activation events.
- Create `backend/src/modules/public-catalog-v2/public-catalog-v2.builder.ts`: bounded generation of index, popular, categories and chunks.
- Create `backend/src/modules/public-catalog-v2/public-catalog-v2.storage.ts`: bounded Supabase JSON upload/read-back verification.
- Create `backend/src/modules/public-catalog-v2/public-catalog-v2.orchestrator.ts`: operation state machine and recovery.
- Create `backend/src/modules/public-catalog-v2/public-catalog-v2.reconciler.ts`: restart and active-pointer reconciliation.
- Create `backend/src/modules/public-catalog-v2/public-catalog-v2.routes.ts`: admin operation status and read-only V2 diagnostics.

### Backend admin publication

- Create `backend/src/modules/admin/publication/publication.routes.ts`.
- Create `backend/src/modules/admin/publication/publication.controller.ts`.
- Create `backend/src/modules/admin/publication/publication.service.ts`.
- Create `backend/src/modules/admin/publication/publication.repository.ts`.
- Modify `backend/src/modules/admin/admin.routes.ts`.
- Modify `backend/src/modules/admin/sites/site.repository.ts`.
- Modify `backend/src/modules/admin/sites/site.service.ts`.
- Modify `backend/src/modules/admin/images/site-image.repository.ts`.
- Modify `backend/src/modules/admin/images/site-image.service.ts`.
- Create `backend/src/modules/admin/images/site-media-assets.repository.ts`.

### Prisma

- Modify `backend/prisma/schema.prisma`.
- Create `backend/prisma/migrations/20260803170000_public_catalog_v2_publication/migration.sql`.

### Admin UI

- Modify `backend/src/admin/assets/screens/site-editor.js`.
- Modify `backend/src/admin/assets/screens/sites-list.js`.
- Modify `backend/src/admin/assets/screens/image-manager.js`.
- Modify `backend/src/admin/assets/screens/maintenance.js`.
- Modify `backend/src/admin/assets/forms.js`.
- Modify `backend/src/admin/assets/api-client.js`.
- Modify `backend/src/admin/assets/admin.css`.

### Public frontend

- Create `assets/js/public-catalog-v2-client.js`.
- Create `assets/js/public-catalog-v2-cache.js`.
- Create `assets/js/public-catalog-v2-renderer.js`.
- Create `assets/js/public-catalog-v2-gallery.js`.
- Create `assets/js/public-catalog-v2-demo.js`.
- Create `assets/js/public-catalog-emergency-release.js`.
- Create `scripts/build-public-catalog-emergency-release.mjs`.
- Modify `assets/js/runtime-config.js`.
- Modify `assets/js/catalog-api.js`.
- Modify `assets/js/main.js`.
- Modify `sw.js`.
- Modify `index.html`.
- Modify `solutions.html`.
- Modify `cases.html`.
- Modify `services.html`.
- Modify `pricing.html`.
- Modify `faq.html`.
- Modify `how-it-works.html`.
- Modify `contacts.html`.
- Modify `brief.html`.
- Modify `cabinet.html`.
- Modify `app.html`.
- Modify `status.html`.
- Modify `install.html`.
- Modify `privacy-policy.html`.
- Modify `consent-personal-data.html`.

### Tests

- Backend create: `backend/tests/public-catalog-v2.paths.test.ts`, `public-catalog-v2.serializer.test.ts`, `public-catalog-v2.builder.test.ts`, `public-catalog-v2.storage.test.ts`, `public-catalog-v2.orchestrator.test.ts`, `public-catalog-v2.recovery.test.ts`, `public-catalog-v2.media-parity.test.ts`, `public-catalog-v2.10000.test.ts`, `admin.publication.routes.test.ts`, `admin.publication.service.test.ts`, `integration/public-catalog-v2-publication.test.ts`.
- Admin UI create: `backend/tests/admin-ui.publication-button.test.mjs`, `admin-ui.demo-switch.test.mjs`, `admin-ui.publication-progress.test.mjs`, `admin-ui.maintenance-visibility.test.mjs`.
- Public frontend create: `tests/frontend/public-catalog-v2-client.test.mjs`, `public-catalog-v2-cache.test.mjs`, `public-catalog-v2-renderer.test.mjs`, `public-catalog-v2-gallery.test.mjs`, `public-catalog-v2-demo.test.mjs`, `public-catalog-v2-antifabrication.test.mjs`, `service-worker-v2-cache.test.mjs`.
- E2E create: `backend/tests/e2e/one-click-publication.e2e.test.ts`, `backend/tests/e2e/public-catalog-v2-recovery.e2e.test.ts`.

### Docs and runbooks

- Create `backend/docs/WEB00_PUBLIC_CATALOG_V2_PROTOCOL.md`.
- Create `backend/docs/WEB00_ONE_CLICK_PUBLICATION_RUNBOOK.md`.

---

## Mandatory Per-Phase Execution Contract

Every OPV2 implementation phase is blocked until its own contract below is satisfied. The exact file list for each phase is the phase-local **Files** block only; changing any other file is a scope failure. Each phase must use RED tests first, preserve PR #14, avoid production systems, avoid force push, and request code review before completion.

### OPV2-1 Contract

- Objective: create baseline failing tests for V2 paths, serialization, ordering, popular order, media parity and anti-fabrication.
- Prior dependencies: OPV2-A0 approved design and plan only.
- Exact file list: OPV2-1 **Files** block only.
- Prohibition list: no production source, no Prisma, no migrations, no dependencies, no production access, no force push.
- RED tests: path, serializer, builder order, popular order, parity, source-policy and anti-fabrication tests.
- Expected RED reason: V2 modules and generator files do not exist.
- Implementation steps: write tests only; do not create V2 source in this phase.
- Focused GREEN result: none in OPV2-1; tests remain RED until OPV2-4 supplies minimal modules.
- Full regression command: not run for OPV2-1 alone; record focused RED command output.
- Scope gate: `git diff --name-only` must show only OPV2-1 test files.
- Security gate: anti-fabrication and source-policy tests are present before production generator code exists.
- Code-review gate: review confirms tests fail for missing V2 code, not syntax errors.
- Completion evidence: RED output and file list.
- Rollback evidence: normal revert of OPV2-1 test commit removes only test files.
- Owner actions: none.

### OPV2-2 Contract

- Objective: add durable publication, media identity, release and activation schema plus repository skeleton.
- Prior dependencies: OPV2-1 RED tests reviewed.
- Exact file list: OPV2-2 **Files** block only.
- Prohibition list: no old migration edits, no production DB, no production migration apply, no force push.
- RED tests: migration model, idempotency fingerprint, coalescing, activation-event uniqueness, media slot/site FK tests.
- Expected RED reason: tables, constraints and repository functions do not exist.
- Implementation steps: additive migration, Prisma models, repository skeleton, local migration test.
- Focused GREEN result: OPV2-2 integration tests PASS on local test DB.
- Full regression command: `npm run check` from `backend` after focused PASS.
- Scope gate: only Prisma schema, new migration, V2 repository/types and OPV2-2 tests changed.
- Security gate: DB constraints reject wrong-site and wrong-slot media assignment.
- Code-review gate: review validates idempotency, coalescing and activation-event uniqueness.
- Completion evidence: focused PASS, full check PASS, diff check PASS.
- Rollback evidence: normal revert of OPV2-2 commit; production migration is not applied in this phase.
- Owner actions: none.

### OPV2-3 Contract

- Objective: persist exact technical image identity and read publication media parity before release building.
- Prior dependencies: OPV2-2 schema exists locally.
- Exact file list: OPV2-3 **Files** block only.
- Prohibition list: no subjective image-content validation, no remote image ingestion, no production Storage, no force push.
- RED tests: source SHA-256, decoded dimensions, variants, slot/site FK rejection, parity mismatch, security image validation.
- Expected RED reason: asset repository and parity reader do not exist.
- Implementation steps: compute SHA-256, persist typed assets, attach preview/gallery through typed rows, keep compatibility mirrors.
- Focused GREEN result: image service/repository/media parity tests PASS.
- Full regression command: `npm run check` from `backend`.
- Scope gate: only image service/repository/types and OPV2-3 tests changed.
- Security gate: reject traversal paths, oversized/decompression-bomb input and arbitrary remote image URLs.
- Code-review gate: review verifies no semantic image substitution and no subjective content checks.
- Completion evidence: focused PASS, full check PASS, exact asset parity evidence.
- Rollback evidence: normal revert of OPV2-3 commit; typed tables remain unused until accepted phase chain.
- Owner actions: none.

### OPV2-4 Contract

- Objective: build sharded deterministic V2 releases for 10,000 cards with bounded memory and exact artifact verification.
- Prior dependencies: OPV2-2 schema and OPV2-3 media identity complete.
- Exact file list: OPV2-4 **Files** block only.
- Prohibition list: no full catalog JSON artifact, no localStorage full payload, no slug-based catalog order, no production Storage, no force push.
- RED tests: path guards, serializer, schemas, AsyncIterable builder, DB order, popular order, storage read-back, 10,000 benchmark.
- Expected RED reason: V2 builder, storage and schema modules do not exist.
- Implementation steps: path guards, stable serializer, schemas, keyset page builder, storage upload/read-back verifier.
- Focused GREEN result: V2 paths, serializer, builder, storage and 10,000 tests PASS.
- Full regression command: `npm run check` from `backend`.
- Scope gate: only V2 catalog modules and OPV2-4 tests changed.
- Security gate: wrong bucket, revision, checksum, content type and unsafe URL tests fail before activation.
- Code-review gate: review validates active pointer last, deterministic bytes and bounded memory.
- Completion evidence: focused PASS, benchmark output, full check PASS.
- Rollback evidence: normal revert of OPV2-4 commit; no production artifact was written.
- Owner actions: none.

### OPV2-5 Contract

- Objective: implement one-click publication API, durable orchestrator, boot-time recovery and active-pointer finalization.
- Prior dependencies: OPV2-2 through OPV2-4 complete.
- Exact file list: OPV2-5 **Files** block only.
- Prohibition list: no false `Опубликовано`, no duplicate conflicting release, no production API, no production sync, no force push.
- RED tests: route, duplicate click, concurrent admin, boot recovery, every-stage restart injection, DB-finalize-after-activation reconciliation.
- Expected RED reason: routes, orchestrator and reconciler do not exist.
- Implementation steps: controller, content-intent transaction, operation coalescing, checkpointed orchestrator, boot scanner, reconciler.
- Focused GREEN result: admin publication, orchestrator and recovery tests PASS.
- Full regression command: `npm run check` from `backend`.
- Scope gate: only admin publication, V2 orchestrator/reconciler, `server.ts` and OPV2-5 tests changed.
- Security gate: RBAC, CSRF, idempotency fingerprint and safe error mapping tests PASS.
- Code-review gate: review validates public success means active release read-back parity, not DB status alone.
- Completion evidence: focused PASS, full check PASS, restart matrix output.
- Rollback evidence: normal revert of OPV2-5 commit; active pointer rollback uses activation event if production is ever activated under a release gate.
- Owner actions: none.

### OPV2-6 Contract

- Objective: replace routine admin publication UX with one primary control and one autosaving demo switch.
- Prior dependencies: OPV2-5 API complete.
- Exact file list: OPV2-6 **Files** block only.
- Prohibition list: no ordinary dry-run/sync/apply/status-refresh/save-setting controls, no second publish button, no PR #14, no force push.
- RED tests: table-driven UI states, one-control invariant, progress copy, raw internal text absence, overflow destructive actions, state preservation on errors, demo switch.
- Expected RED reason: existing admin UI exposes maintenance controls and lifecycle-only publication.
- Implementation steps: route calls, idempotency key handling, progress copy, switch autosave, overflow menu, expert recovery placement.
- Focused GREEN result: admin UI publication, progress, maintenance visibility and switch tests PASS.
- Full regression command: `npm run check` from `backend`.
- Scope gate: only listed admin assets and admin UI tests changed.
- Security gate: no revision, checksum, bucket, manifest, lease or Storage path visible in ordinary UI.
- Code-review gate: review validates owner never needs internal maintenance knowledge.
- Completion evidence: focused PASS, full check PASS, UI state matrix.
- Rollback evidence: normal revert of OPV2-6 commit restores prior admin UI.
- Owner actions: none.

### OPV2-7 Contract

- Objective: make public frontend read V2 Storage releases with bounded cache, no Render catalog dependency and no visual flash.
- Prior dependencies: OPV2-4 V2 artifacts accepted locally.
- Exact file list: OPV2-7 **Files** block only.
- Prohibition list: no Render `/api/` catalog dependency, no full catalog localStorage, no valid-to-empty replacement, no force push.
- RED tests: clean visitor, repeat visitor, unchanged revision no-op, newer revision atomic swap, background failure over valid catalog, source policy, cache bounds, service worker.
- Expected RED reason: V2 frontend client/cache/renderer do not exist.
- Implementation steps: Storage client, CacheStorage/IndexedDB, checksum verification, atomic swap, virtualization, service worker caching.
- Focused GREEN result: V2 client/cache/renderer/service worker tests PASS.
- Full regression command: `node --test tests/frontend/*.test.mjs` plus backend `npm run check` only when backend files changed in the same phase.
- Scope gate: only public frontend files, service worker, public HTML and frontend tests changed.
- Security gate: public bundles contain no service-role key or write token; all catalog fetch URLs are Storage JSON or final emergency fallback.
- Code-review gate: review validates no hidden Render dependency and no fabricated cards.
- Completion evidence: focused PASS, source-policy output, cache-bound output.
- Rollback evidence: normal revert of OPV2-7 commit and service worker cache version rollback.
- Owner actions: none.

### OPV2-8 Contract

- Objective: implement exact-order Gallery V2 and managed demo modal policy.
- Prior dependencies: OPV2-7 renderer and V2 item DTO complete.
- Exact file list: OPV2-8 **Files** block only.
- Prohibition list: no arbitrary iframe guarantee, no semantic image replacement, no force push.
- RED tests: Gallery exact ordered asset IDs, failed-image explicit error, controls/a11y, demo allowlist, iframe sandbox/CSP.
- Expected RED reason: Gallery V2 and demo modules do not exist.
- Implementation steps: gallery modal, preload queue, image error state, demo policy, iframe lifecycle.
- Focused GREEN result: V2 gallery and demo tests PASS.
- Full regression command: `node --test tests/frontend/*.test.mjs`.
- Scope gate: only Gallery/demo frontend files, CSS and frontend tests changed.
- Security gate: CSP and sandbox assertions PASS.
- Code-review gate: review validates external sites are not promised as embeddable.
- Completion evidence: focused PASS, a11y/control evidence.
- Rollback evidence: normal revert of OPV2-8 commit.
- Owner actions: none.

### OPV2-9 Contract

- Objective: prepare local backfill and release runbook without production mutation.
- Prior dependencies: OPV2-2 through OPV2-8 complete locally.
- Exact file list: OPV2-9 **Files** block only.
- Prohibition list: no production migration, no production dry-run, no production activation, no deploy, no force push.
- RED tests: local backfill parity, CLI local DB guard, runbook hard-stop sequence.
- Expected RED reason: backfill CLI and V2 runbooks do not exist.
- Implementation steps: local backfill command, package script, runbook sequence, local tests.
- Focused GREEN result: backfill and CLI tests PASS locally.
- Full regression command: `npm run check` from `backend`.
- Scope gate: only backfill CLI, package script, docs and OPV2-9 tests changed.
- Security gate: local/test DB guard blocks production-looking targets.
- Code-review gate: review validates migration, backend deploy, activation and frontend deploy are separate hard stops.
- Completion evidence: focused PASS, full check PASS, runbook review.
- Rollback evidence: normal revert of OPV2-9 commit; no production action occurred.
- Owner actions: none.

### OPV2-10 Contract

- Objective: define and verify production acceptance gates while keeping V1 available until accepted.
- Prior dependencies: OPV2-1 through OPV2-9 complete and separately authorized for release actions.
- Exact file list: OPV2-10 **Files** block only.
- Prohibition list: no production action without explicit owner command, no PR #14 change, no force push.
- RED tests: local one-click E2E, active-upload recovery E2E, live contract smoke harness.
- Expected RED reason: E2E harness and production acceptance checks do not exist.
- Implementation steps: local E2E, recovery E2E, operator evidence checklist, owner acceptance checklist, V1 retirement gate.
- Focused GREEN result: local E2E tests PASS.
- Full regression command: backend `npm run check`, frontend `node --test tests/frontend/*.test.mjs`, `git diff --check`.
- Scope gate: only OPV2-10 tests and runbook docs changed unless owner authorizes release execution.
- Security gate: live acceptance proves no `/api/` catalog dependency and no write credentials in public bundles.
- Code-review gate: review validates local PASS is not production PASS.
- Completion evidence: local gates plus deployed live browser evidence only after owner release authorization.
- Rollback evidence: normal revert/redeploy for code; active pointer rollback uses new activation event.
- Owner actions: explicit authorization for production migration, backend deploy, V2 activation, frontend deploy and live acceptance.

---

### OPV2-1: Baseline Invariants And RED Contract Tests

**Files:**

- Create: `backend/tests/public-catalog-v2.paths.test.ts`
- Create: `backend/tests/public-catalog-v2.serializer.test.ts`
- Create: `backend/tests/public-catalog-v2.builder.test.ts`
- Create: `backend/tests/public-catalog-v2.media-parity.test.ts`
- Create: `tests/frontend/public-catalog-v2-antifabrication.test.mjs`
- Create: `tests/frontend/public-catalog-v2-client.test.mjs`
- Modify: no production source in this phase

**Interfaces:**

- Produces failing tests that require `PUBLIC_CATALOG_V2_SCHEMA_VERSION`, `buildV2ReleasePath`, `stableSerializeJson`, `sha256Hex`, `buildPublicCatalogV2Release`, and anti-fabrication scanners.
- Consumes current V1 `mapSiteToPublicCatalogItem`, `publicGalleryImagesSchema`, and local synthetic fixtures.

- [ ] **Step 1: Write RED backend path tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildPublicCatalogV2ActivePath,
  buildPublicCatalogV2ReleasePath,
  assertPublicCatalogV2StoragePath
} from "../src/modules/public-catalog-v2/public-catalog-v2.paths.js";

const IMAGE_STORAGE_BUCKET = "web00-catalog-images";

describe("Public Catalog V2 paths", () => {
  it("uses the canonical JSON bucket layout and rejects image-bucket catalog paths", () => {
    expect(buildPublicCatalogV2ActivePath()).toBe("public-catalog/v2/active.json");
    expect(buildPublicCatalogV2ReleasePath(7, "manifest")).toBe(
      "public-catalog/v2/releases/revision-7/manifest.json"
    );
    const imageBucketCatalogObject = [
      IMAGE_STORAGE_BUCKET,
      "public-catalog/v2/releases/revision-7/manifest.json"
    ].join("/");
    expect(() =>
      assertPublicCatalogV2StoragePath(imageBucketCatalogObject)
    ).toThrow("Invalid Public Catalog V2 Storage path.");
  });
});
```

- [ ] **Step 2: Run RED path test**

Run:

```powershell
Set-Location backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-v2.paths.test.ts
```

Expected: FAIL because `public-catalog-v2.paths.ts` does not exist.

- [ ] **Step 3: Write RED serialization tests**

```ts
import { describe, expect, it } from "vitest";
import { sha256Hex, stableSerializeJson } from "../src/modules/public-catalog-v2/public-catalog-v2.serializer.js";

describe("Public Catalog V2 serializer", () => {
  it("produces deterministic bytes with trailing newline and checksum over exact bytes", () => {
    const left = stableSerializeJson({ b: 2, a: { d: 4, c: 3 } });
    const right = stableSerializeJson({ a: { c: 3, d: 4 }, b: 2 });

    expect(left).toBe(right);
    expect(left.endsWith("\n")).toBe(true);
    expect(sha256Hex(left)).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

Expected: FAIL because serializer module does not exist.

- [ ] **Step 4: Write RED builder invariants**

```ts
import { describe, expect, it } from "vitest";
import { syntheticProjectionPages } from "./helpers/public-catalog-v2-synthetic-fixtures.js";
import { buildPublicCatalogV2Release } from "../src/modules/public-catalog-v2/public-catalog-v2.builder.js";

describe("Public Catalog V2 builder", () => {
  it("preserves DB catalog order across nonalphabetical slugs", async () => {
    const pages = syntheticProjectionPages([
      { slug: "z-site", sortOrder: 1 },
      { slug: "a-site", sortOrder: 2 }
    ]);

    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages,
      revision: 1,
      settings: { showDemoInModal: true }
    });

    expect(release.index.items.map((item) => item.slug)).toEqual(["z-site", "a-site"]);
  });

  it("emits authoritative popular order separately from catalog order", async () => {
    const pages = syntheticProjectionPages([
      { createdAt: "2026-08-03T10:00:00.000Z", featured: false, id: "2", slug: "catalog-first", sortOrder: 1, views: 1 },
      { createdAt: "2026-08-03T09:00:00.000Z", featured: true, id: "1", slug: "popular-first", sortOrder: 2, views: 100 }
    ]);

    const release = await buildPublicCatalogV2Release({
      chunkSize: 100,
      generatedAt: new Date("2026-08-03T16:00:00.000Z"),
      pages,
      revision: 1,
      settings: { showDemoInModal: true }
    });

    expect(release.index.items.map((item) => item.slug)).toEqual(["catalog-first", "popular-first"]);
    expect(release.popular.items.map((item) => item.slug)).toEqual(["popular-first", "catalog-first"]);
    expect(release.popular.popularOrder).toEqual(["popular-first", "catalog-first"]);
  });
});
```

Expected: FAIL because builder module and helper do not exist.

- [ ] **Step 5: Write RED media parity test**

```ts
import { describe, expect, it } from "vitest";
import { assertPublicCatalogV2ReadBackParity } from "../src/modules/public-catalog-v2/public-catalog-v2.builder.js";

describe("Public Catalog V2 media parity", () => {
  it.each([
    ["public DTO field", (actual) => { actual.description = "Changed"; }],
    ["preview assetId", (actual) => { actual.previewImage.assetId = "preview-b"; }],
    ["preview sourceSha256", (actual) => { actual.previewImage.sourceSha256 = "e".repeat(64); }],
    ["preview variants", (actual) => { actual.previewImage.variants = [{ width: 480 }]; }],
    ["Gallery ordered assetId list", (actual) => { actual.galleryImages = actual.galleryImages.toReversed(); }],
    ["Gallery sourceSha256", (actual) => { actual.galleryImages[0].sourceSha256 = "f".repeat(64); }],
    ["Gallery variants", (actual) => { actual.galleryImages[0].variants = [{ width: 320 }]; }],
    ["Gallery sortOrder", (actual) => { actual.galleryImages[0].sortOrder = 4; }],
    ["item count", (actual) => { actual.itemCount = 2; }],
    ["unique slug count", (actual) => { actual.uniqueSlugCount = 2; }],
    ["revision", (actual) => { actual.revision = 2; }],
    ["JSON bucket ID", (actual) => { actual.bucketId = "wrong-bucket"; }],
    ["content type", (actual) => { actual.contentType = "text/plain"; }],
    ["artifact SHA", (actual) => { actual.sha256 = "0".repeat(64); }]
  ])("rejects %s mismatch before publication success", (_caseName, mutate) => {
    const expected = {
      bucketId: "web00-public-catalog",
      contentType: "application/json",
      description: "Exact public field",
      galleryImages: [
        { assetId: "gallery-a", sourceSha256: "a".repeat(64), sortOrder: 0, variants: [{ width: 480 }] },
        { assetId: "gallery-b", sourceSha256: "b".repeat(64), sortOrder: 1, variants: [{ width: 480 }] }
      ],
      itemCount: 1,
      previewImage: { assetId: "preview-a", sourceSha256: "c".repeat(64), variants: [{ width: 1600 }] },
      revision: 1,
      sha256: "d".repeat(64),
      slug: "site-custom",
      uniqueSlugCount: 1
    };
    const actual = structuredClone(expected);
    mutate(actual);

    expect(() => assertPublicCatalogV2ReadBackParity(expected, actual)).toThrow(
      "Public Catalog V2 read-back parity mismatch."
    );
  });
});
```

Expected: FAIL because parity function does not exist.

- [ ] **Step 6: Write RED frontend anti-fabrication scan**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertNoCardObjectConstruction,
  assertNoDataJsImport,
  assertNoFixtureImport,
  assertNoJsonStringCardPayload,
  assertNoManualProductionItemConstruction,
  assertNoSlugTitleSwitchOrMap,
  buildProductionImportGraph,
  collectProductionV2Files,
  parseProductionModuleAst,
  verifyV2ManifestChunkChain
} from "./helpers/public-catalog-v2-provenance-fixture.mjs";

const productionV2Files = await collectProductionV2Files([
  "scripts/build-public-catalog-emergency-release.mjs",
  "backend/src/modules/public-catalog-v2/*.ts",
  "assets/js/public-catalog-v2-*.js",
  "assets/js/public-catalog-emergency-release.js",
  "assets/js/catalog-api.js",
  "assets/js/main.js"
]);

test("Public Catalog V2 production generator and reader have verified release provenance", async () => {
  const importGraph = await buildProductionImportGraph(productionV2Files);

  for (const relativePath of productionV2Files) {
    const ast = await parseProductionModuleAst(relativePath);

    assertNoDataJsImport(importGraph, relativePath);
    assertNoFixtureImport(importGraph, relativePath);
    assertNoCardObjectConstruction(ast);
    assertNoManualProductionItemConstruction(ast);
    assertNoSlugTitleSwitchOrMap(ast);
    assertNoJsonStringCardPayload(ast);
  }
});

test("fabricated valid-looking cards are rejected outside a verified manifest and chunk checksum chain", async () => {
  const fabricated = {
    chunks: [{ items: [{ slug: "site-custom", title: "Fabricated" }] }],
    manifest: { revision: 7, chunks: [{ path: "public-catalog/v2/releases/revision-7/chunks/chunk-000001.json", sha256: "0".repeat(64) }] }
  };

  assert.throws(() => verifyV2ManifestChunkChain(fabricated), /PUBLIC_CATALOG_V2_PROVENANCE_INVALID/);
});
```

Expected: FAIL because the generator file does not exist.

- [ ] **Step 7: Commit baseline tests only after OPV2-4 GREEN**

Do not commit in OPV2-1 until OPV2-4 creates the minimal V2 modules and all OPV2-1 tests pass.

---

### OPV2-2: Additive Durable Publication And Outbox Schema

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260803170000_public_catalog_v2_publication/migration.sql`
- Create: `backend/tests/integration/public-catalog-v2-publication.test.ts`
- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.repository.ts`
- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.types.ts`

**Interfaces:**

- Produces Prisma models `PublicCatalogSetting`, `SiteImageAsset`, `SiteGalleryImage`, `PublicCatalogPublicationOperation`, `PublicCatalogRelease`, `PublicCatalogActivationEvent`.
- Produces repository functions `createOrCoalescePublicationOperation`, `claimNextPublicationOperation`, `recordPublicationCheckpoint`, `finalizePublicationOperation`, `recordActivationEvent`, `iteratePublicCatalogV2ProjectionPages`.

- [ ] **Step 1: Write RED integration migration test**

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "../helpers/prisma.js";

describe("Public Catalog V2 schema", () => {
  it("persists publication operation separately from site lifecycle", async () => {
    const setting = await prisma.publicCatalogSetting.upsert({
      create: { id: "public-catalog" },
      update: {},
      where: { id: "public-catalog" }
    });

    expect(setting.autoPublish).toBe(true);
    expect(setting.showDemoInModal).toBe(true);

    const operation = await prisma.publicCatalogPublicationOperation.create({
      data: {
        action: "publish",
        idempotencyKey: "synthetic-opv2-key",
        operationGroupKey: "public-catalog",
        operationScope: "site:11111111-1111-4111-8111-111111111111",
        requestFingerprint: "a".repeat(64),
        requestId: "synthetic-request",
        stage: "content_transaction",
        status: "queued",
        targetRevision: 1,
        trigger: "site_publish"
      }
    });

    expect(operation.status).toBe("queued");
  });

  it("coalesces one active operation per catalog and rejects reused keys with changed input", async () => {
    await expect(
      createOrCoalescePublicationOperation({
        action: "publish",
        idempotencyKey: "synthetic-same-key",
        operationGroupKey: "public-catalog",
        operationScope: "site:11111111-1111-4111-8111-111111111111",
        requestFingerprint: "b".repeat(64)
      })
    ).resolves.toMatchObject({ status: "queued" });

    await expect(
      createOrCoalescePublicationOperation({
        action: "publish",
        idempotencyKey: "synthetic-same-key",
        operationGroupKey: "public-catalog",
        operationScope: "site:22222222-2222-4222-8222-222222222222",
        requestFingerprint: "c".repeat(64)
      })
    ).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("rejects wrong-site and wrong-slot preview and gallery asset assignments", async () => {
    await expect(insertPreviewWithGalleryAssetSlot()).rejects.toThrow(/site_preview_images_asset_slot_fkey/);
    await expect(insertGalleryWithPreviewAssetSlot()).rejects.toThrow(/site_gallery_images_asset_slot_fkey/);
    await expect(insertGalleryWithOtherSiteAsset()).rejects.toThrow(/site_gallery_images_asset_slot_fkey/);
  });
});
```

Expected: FAIL before schema and migration exist.

- [ ] **Step 2: Add migration SQL**

Create an additive migration with these operations:

```sql
CREATE TABLE "public_catalog_settings" (
  "id" text NOT NULL,
  "show_demo_in_modal" boolean NOT NULL DEFAULT true,
  "auto_publish" boolean NOT NULL DEFAULT true,
  "desired_revision" integer NOT NULL DEFAULT 1,
  "active_revision" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_catalog_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_catalog_settings_singleton_id_chk" CHECK ("id" = 'public-catalog'),
  CONSTRAINT "public_catalog_settings_revision_chk" CHECK ("desired_revision" >= 1 AND "active_revision" >= 0 AND "desired_revision" >= "active_revision")
);

CREATE TABLE "site_image_assets" (
  "asset_id" uuid NOT NULL,
  "site_id" uuid NOT NULL,
  "slot" text NOT NULL,
  "source_sha256" char(64) NOT NULL,
  "source_mime" text NOT NULL,
  "decoded_format" text NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "storage_path" text NOT NULL,
  "variants" jsonb NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_image_assets_pkey" PRIMARY KEY ("asset_id"),
  CONSTRAINT "site_image_assets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "site_image_assets_site_asset_slot_key" UNIQUE ("site_id", "asset_id", "slot"),
  CONSTRAINT "site_image_assets_slot_chk" CHECK ("slot" IN ('preview', 'gallery')),
  CONSTRAINT "site_image_assets_source_sha256_chk" CHECK ("source_sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "site_image_assets_dimensions_chk" CHECK ("width" > 0 AND "height" > 0)
);

ALTER TABLE "sites"
  ADD COLUMN "preview_asset_id" uuid;

CREATE TABLE "site_preview_images" (
  "site_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "slot" text NOT NULL DEFAULT 'preview',
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_preview_images_pkey" PRIMARY KEY ("site_id"),
  CONSTRAINT "site_preview_images_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "site_preview_images_asset_slot_fkey" FOREIGN KEY ("site_id", "asset_id", "slot") REFERENCES "site_image_assets"("site_id", "asset_id", "slot") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "site_preview_images_slot_chk" CHECK ("slot" = 'preview')
);

CREATE TABLE "site_gallery_images" (
  "site_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "slot" text NOT NULL DEFAULT 'gallery',
  "sort_order" integer NOT NULL,
  "alt" text NOT NULL DEFAULT '',
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_gallery_images_pkey" PRIMARY KEY ("site_id", "asset_id"),
  CONSTRAINT "site_gallery_images_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "site_gallery_images_asset_slot_fkey" FOREIGN KEY ("site_id", "asset_id", "slot") REFERENCES "site_image_assets"("site_id", "asset_id", "slot") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "site_gallery_images_slot_chk" CHECK ("slot" = 'gallery'),
  CONSTRAINT "site_gallery_images_sort_order_chk" CHECK ("sort_order" >= 0),
  CONSTRAINT "site_gallery_images_site_sort_order_key" UNIQUE ("site_id", "sort_order")
);

CREATE TABLE "public_catalog_publication_operations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "idempotency_key" text NOT NULL,
  "action" text NOT NULL,
  "request_fingerprint" char(64) NOT NULL,
  "projection_hash" char(64),
  "operation_scope" text NOT NULL,
  "operation_group_key" text NOT NULL,
  "trigger" text NOT NULL,
  "actor_user_id" uuid,
  "site_id" uuid,
  "target_revision" integer NOT NULL,
  "status" text NOT NULL,
  "stage" text NOT NULL,
  "retry_count" integer NOT NULL DEFAULT 0,
  "lease_id" text,
  "locked_at" timestamptz(6),
  "locked_by" text,
  "last_checkpoint" jsonb NOT NULL DEFAULT '{}',
  "last_error_code" text,
  "request_id" text NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" timestamptz(6),
  CONSTRAINT "public_catalog_publication_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_catalog_publication_operations_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "public_catalog_publication_operations_action_chk" CHECK ("action" IN ('publish', 'unpublish', 'settings_publish', 'reconcile')),
  CONSTRAINT "public_catalog_publication_operations_status_chk" CHECK ("status" IN ('queued', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled')),
  CONSTRAINT "public_catalog_publication_operations_fingerprint_chk" CHECK ("request_fingerprint" ~ '^[a-f0-9]{64}$' AND ("projection_hash" IS NULL OR "projection_hash" ~ '^[a-f0-9]{64}$')),
  CONSTRAINT "public_catalog_publication_operations_retry_count_chk" CHECK ("retry_count" >= 0),
  CONSTRAINT "public_catalog_publication_operations_target_revision_chk" CHECK ("target_revision" >= 1)
);

CREATE UNIQUE INDEX "public_catalog_publication_operations_active_group_key"
  ON "public_catalog_publication_operations" ("operation_group_key")
  WHERE "status" IN ('queued', 'running', 'retry_wait');

CREATE TABLE "public_catalog_releases" (
  "revision" integer NOT NULL,
  "status" text NOT NULL,
  "items_count" integer NOT NULL,
  "chunks_count" integer NOT NULL,
  "popular_count" integer NOT NULL,
  "manifest_path" text NOT NULL,
  "manifest_sha256" char(64) NOT NULL,
  "index_path" text NOT NULL,
  "index_sha256" char(64) NOT NULL,
  "popular_path" text NOT NULL,
  "popular_sha256" char(64) NOT NULL,
  "categories_path" text NOT NULL,
  "categories_sha256" char(64) NOT NULL,
  "active_pointer_sha256" char(64),
  "generated_at" timestamptz(6) NOT NULL,
  "activated_at" timestamptz(6),
  CONSTRAINT "public_catalog_releases_pkey" PRIMARY KEY ("revision"),
  CONSTRAINT "public_catalog_releases_status_chk" CHECK ("status" IN ('building', 'verified', 'active', 'superseded', 'failed')),
  CONSTRAINT "public_catalog_releases_counts_chk" CHECK ("items_count" >= 0 AND "chunks_count" >= 0 AND "popular_count" >= 0)
);

CREATE TABLE "public_catalog_activation_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "operation_id" uuid,
  "event_type" text NOT NULL,
  "revision" integer NOT NULL,
  "previous_revision" integer,
  "active_pointer_sha256" char(64) NOT NULL,
  "request_id" text NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_catalog_activation_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_catalog_activation_events_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "public_catalog_activation_events_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "public_catalog_publication_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "public_catalog_activation_events_revision_fkey" FOREIGN KEY ("revision") REFERENCES "public_catalog_releases"("revision") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "public_catalog_activation_events_previous_revision_fkey" FOREIGN KEY ("previous_revision") REFERENCES "public_catalog_releases"("revision") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "public_catalog_activation_events_type_chk" CHECK ("event_type" IN ('activate', 'rollback', 'reconcile'))
);
```

- [ ] **Step 3: Update Prisma schema**

Add Prisma models matching the SQL names and mappings. Do not remove `PublicCatalogControl`.

- [ ] **Step 4: Implement repository skeleton**

```ts
export interface PublicCatalogV2Repository {
  createOrCoalescePublicationOperation(input: CreatePublicationOperationInput): Promise<PublicationOperationRecord>;
  claimNextPublicationOperation(input: ClaimPublicationOperationInput): Promise<PublicationOperationRecord | null>;
  recordPublicationCheckpoint(input: PublicationCheckpointInput): Promise<PublicationOperationRecord>;
  finalizePublicationOperation(input: FinalizePublicationOperationInput): Promise<PublicationOperationRecord>;
  recordActivationEvent(input: RecordActivationEventInput): Promise<void>;
  iteratePublicCatalogV2ProjectionPages(input: {
    afterCursor: PublicCatalogV2ProjectionCursor | null;
    take: 100;
  }): AsyncIterable<PublicCatalogV2ProjectionPage>;
}
```

- [ ] **Step 5: Run migration tests GREEN locally**

Run:

```powershell
Set-Location backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/integration/public-catalog-v2-publication.test.ts
```

Expected: PASS against local test DB only.

---

### OPV2-3: Exact Image And Media Publication Contract

**Files:**

- Modify: `backend/src/modules/admin/images/site-image.service.ts`
- Modify: `backend/src/modules/admin/images/site-image.repository.ts`
- Create: `backend/src/modules/admin/images/site-media-assets.repository.ts`
- Modify: `backend/src/modules/images/image-processor.ts`
- Modify: `backend/src/modules/images/image.types.ts`
- Create: `backend/tests/public-catalog-v2.media-parity.test.ts`
- Modify: `backend/tests/site-image.service.test.ts`
- Modify: `backend/tests/site-image.repository.test.ts`

**Interfaces:**

- Produces `PersistedSiteImageAsset`.
- Produces `readSitePublicationMediaParity(siteId)`.
- Produces source SHA-256 and decoded dimensions for preview and gallery.

- [ ] **Step 1: Write RED asset metadata test**

```ts
import { describe, expect, it } from "vitest";
import { createSiteImageService } from "../src/modules/admin/images/site-image.service.js";
import { createSiteImageServiceFakes } from "./helpers/site-image-service-fakes.js";

describe("site image asset metadata", () => {
  it("persists source sha256, decoded dimensions and variants before DB attachment", async () => {
    const fakes = createSiteImageServiceFakes();
    fakes.processor.process.mockResolvedValueOnce({
      originalFormat: "png",
      originalHeight: 900,
      originalOrientation: null,
      originalPixels: 1440000,
      originalWidth: 1600,
      variants: [{ body: Buffer.from("webp"), contentType: "image/webp", path: "sites/site/preview/asset/1600.webp" }],
      widths: [1600]
    });

    const service = createSiteImageService(fakes.options);
    await service.preview.replacePreview(fakes.previewInput());

    expect(fakes.assetRepository.upsertAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        decodedFormat: "png",
        height: 900,
        sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        width: 1600
      })
    );
  });
});
```

Expected: FAIL until image service accepts asset repository and stores metadata.

- [ ] **Step 2: Write RED media security tests**

```ts
it("rejects unsafe image ingestion and path inputs before variant generation", async () => {
  await expect(uploadImageByRemoteUrl("https://example.invalid/pic.png")).rejects.toThrow("REMOTE_IMAGE_URL_FORBIDDEN");
  await expect(uploadImageWithStoragePath("../escape.png")).rejects.toThrow("IMAGE_STORAGE_PATH_INVALID");
  await expect(uploadDecompressionBombSyntheticFixture()).rejects.toThrow("IMAGE_PIXEL_LIMIT_EXCEEDED");
});

it("escapes public/admin text and enforces demo CSP and sandbox boundaries", async () => {
  expect(renderEscapedPublicTitle("<script>alert(1)</script>")).not.toContain("<script>");
  expect(buildDemoFramePolicy("https://demo.web00.invalid")).toMatchObject({
    cspFrameSrc: ["https://demo.web00.invalid"],
    sandboxAllowsSameOrigin: true
  });
  expect(buildDemoFramePolicy("https://external.invalid")).toMatchObject({
    cspFrameSrc: [],
    sandboxAllowsSameOrigin: false
  });
});
```

Expected: FAIL until technical security checks and rendering policies exist.

- [ ] **Step 3: Add metadata calculation**

In `image-processor.ts`, include original source SHA-256 in `ProcessedImage`:

```ts
sourceSha256: createHash("sha256").update(input.source).digest("hex")
```

Keep decoded format, width, height and variants from existing Sharp metadata.

- [ ] **Step 4: Persist media assets**

In `site-media-assets.repository.ts`, implement:

```ts
export interface SiteMediaAssetsRepository {
  upsertAsset(input: PersistedSiteImageAssetInput, tx: Prisma.TransactionClient): Promise<void>;
  readSitePublicationMediaParity(siteId: string, tx: Prisma.TransactionClient): Promise<SitePublicationMediaParity>;
}
```

- [ ] **Step 5: Attach preview and gallery through typed asset rows**

Modify preview replace to upsert `SiteImageAsset`, write `SitePreviewImage`, mirror `sites.preview_asset_id` and `preview_image_url` for compatibility, then create audit and dirty marker in the same transaction.

Modify gallery add/reorder/delete to update `SiteGalleryImage`, keep `sites.gallery_images` JSON for compatibility, then create audit and dirty marker in the same transaction.

- [ ] **Step 6: Run focused GREEN**

Run:

```powershell
Set-Location backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/site-image.service.test.ts tests/site-image.repository.test.ts tests/public-catalog-v2.media-parity.test.ts
```

Expected: PASS with exact asset identity and gallery order checks.

---

### OPV2-4: Sharded Public Catalog Release V2

**Files:**

- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.types.ts`
- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.schemas.ts`
- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.paths.ts`
- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.serializer.ts`
- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.builder.ts`
- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.storage.ts`
- Create: `backend/tests/public-catalog-v2.paths.test.ts`
- Create: `backend/tests/public-catalog-v2.serializer.test.ts`
- Create: `backend/tests/public-catalog-v2.builder.test.ts`
- Create: `backend/tests/public-catalog-v2.storage.test.ts`
- Create: `backend/tests/public-catalog-v2.10000.test.ts`

**Interfaces:**

- Consumes `PublicCatalogV2ProjectionRecord` from repository.
- Produces `BuiltPublicCatalogV2Release` with exact bytes and checksums.
- Produces `uploadAndVerifyPublicCatalogV2Release`.
- Builder entrypoint consumes `AsyncIterable<PublicCatalogV2ProjectionPage>`, not a full production records array.

- [ ] **Step 1: Implement V2 path guards**

```ts
export const PUBLIC_CATALOG_V2_ACTIVE_PATH = "public-catalog/v2/active.json";
export function buildPublicCatalogV2ReleaseRoot(revision: number): string;
export function buildPublicCatalogV2ReleasePath(revision: number, kind: "manifest" | "index" | "popular" | "categories"): string;
export function buildPublicCatalogV2ChunkPath(revision: number, chunkIndex: number): string;
export function assertPublicCatalogV2StoragePath(path: string): void;
```

- [ ] **Step 2: Implement stable serializer**

Use recursive object-key sorting, preserve array order and append one newline. Compute SHA-256 with Node `crypto.createHash("sha256").update(bytes, "utf8").digest("hex")`.

- [ ] **Step 3: Implement runtime schemas**

Validate active pointer, manifest, index, categories, popular and chunks. Reject:

- wrong schema version;
- wrong revision;
- wrong bucket path;
- wrong content type;
- non-hex checksum;
- duplicate slugs;
- duplicate chunk membership;
- gallery order gaps;
- image URLs with query, credentials or fragment;
- missing `sourceSha256`.

- [ ] **Step 4: Implement builder**

Build chunks of exactly `100` records except the final chunk from `AsyncIterable<PublicCatalogV2ProjectionPage>`. Preserve keyset repository order for catalog. Build popular order with projection fields `(featured desc, views desc, sortOrder asc, createdAt desc, slug asc, id asc)` and persist `popularOrder` in `popular.json`.

- [ ] **Step 5: Implement DB order integration test**

Insert records whose slug order conflicts with DB order across at least two keyset pages. Read through `iteratePublicCatalogV2ProjectionPages({ take: 100, afterCursor })`, build V2, and assert global `index.items`, chunk membership and rendered frontend order equal `(sortOrder asc, createdAt desc, slug asc, id asc)`. Include Gallery `sortOrder` parity across the same boundary.

Expected: FAIL until repository keyset pagination and builder streaming are implemented.

- [ ] **Step 6: Implement storage read-back verification tests**

`backend/tests/public-catalog-v2.storage.test.ts` must upload to fake/local Storage, read back `active.json`, manifest, index, popular, categories and every chunk, then compare:

- exact bytes SHA-256;
- parsed object deep equality to generated data;
- JSON bucket id `web00-public-catalog`;
- revision;
- checksum;
- `application/json` content type.

Negative cases must prove wrong bucket, wrong revision, wrong checksum and wrong content type fail before activation and before owner success. Storage upload uses a semaphore capped at `2` concurrent JSON operations.

Storage policy acceptance tests must prove anonymous/public clients can `GET` expected JSON/image objects and cannot `POST`, `PUT`, `DELETE`, request signed upload URLs or overwrite existing artifacts. Frontend bundles must scan clean for service-role keys, write tokens and authorization headers.

Expected: FAIL until Storage verifier and concurrency cap exist.

- [ ] **Step 7: Implement 10,000-card stress and benchmark test**

```ts
it("builds 100 chunks for 10000 synthetic cards from keyset pages within memory and byte budgets", async () => {
  const pages = syntheticKeysetProjectionPages({ total: 10000, pageSize: 100 });
  const release = await buildPublicCatalogV2Release({
    chunkSize: 100,
    generatedAt: new Date("2026-08-03T16:00:00.000Z"),
    pages,
    revision: 10,
    settings: { showDemoInModal: true }
  });

  expect(release.manifest.itemsCount).toBe(10000);
  expect(release.manifest.chunksCount).toBe(100);
  expect(new Set(release.index.items.map((item) => item.slug)).size).toBe(10000);
  expect(release.metrics.maxRetainedChunkBytes).toBeLessThanOrEqual(512 * 1024);
  expect(release.metrics.maxLiveFullRecords).toBeLessThanOrEqual(125);
  expect(release.metrics.heapDeltaBytes).toBeLessThanOrEqual(256 * 1024 * 1024);
  expect(release.metrics.manifestBytes).toBeLessThanOrEqual(96 * 1024);
  expect(release.metrics.indexBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(release.metrics.initialCleanVisitorBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(release.metrics.usedOffsetPagination).toBe(false);
});
```

- [ ] **Step 8: Run focused GREEN**

Run:

```powershell
Set-Location backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-v2.paths.test.ts tests/public-catalog-v2.serializer.test.ts tests/public-catalog-v2.builder.test.ts tests/public-catalog-v2.storage.test.ts tests/public-catalog-v2.10000.test.ts
```

Expected: PASS.

---

### OPV2-5: Durable One-Click Publication Orchestrator And Recovery

**Files:**

- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.orchestrator.ts`
- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.reconciler.ts`
- Create: `backend/src/modules/admin/publication/publication.service.ts`
- Create: `backend/src/modules/admin/publication/publication.repository.ts`
- Create: `backend/src/modules/admin/publication/publication.controller.ts`
- Create: `backend/src/modules/admin/publication/publication.routes.ts`
- Modify: `backend/src/modules/admin/admin.routes.ts`
- Modify: `backend/src/server.ts`
- Create: `backend/tests/public-catalog-v2.orchestrator.test.ts`
- Create: `backend/tests/public-catalog-v2.recovery.test.ts`
- Create: `backend/tests/admin.publication.routes.test.ts`
- Create: `backend/tests/admin.publication.service.test.ts`

**Interfaces:**

- Consumes `PublicCatalogV2Repository`, builder, Storage and admin site repository.
- Produces `POST /api/admin/sites/:id/publication` and `GET /api/admin/public-catalog/operations/:id`.

- [ ] **Step 1: Write RED route tests**

```ts
it("starts one publish operation and returns no false success before activation", async () => {
  const response = await request(app)
    .post(`/api/admin/sites/${siteId}/publication`)
    .send({ action: "publish", idempotencyKey: "synthetic-key" })
    .expect(202);

  expect(response.body.data.status).toBe("running");
  expect(response.body.data.stableStatus).toBe("Черновик");
  expect(response.body.data.buttonLabel).toBe("Публикуем...");
  expect(response.body.data.label).toBeUndefined();
});
```

Add RED cases:

- same idempotency key, same action, same fingerprint returns the same operation;
- same idempotency key with changed action, site or fingerprint returns `IDEMPOTENCY_KEY_REUSED`;
- two administrators publish different changed cards concurrently and the repository returns one nonterminal catalog operation with one target revision;
- operation response and status DTO never expose revision, checksum, bucket, manifest path or lease to ordinary UI.

- [ ] **Step 2: Implement publication controller**

Accept `action` values `publish` and `unpublish`. Require UUID idempotency key. Return operation DTO with `status`, `stableStatus`, `buttonLabel` and `retryable`. Do not return a `label` field for ordinary nonterminal publication progress.

- [ ] **Step 3: Implement atomic content transaction**

Inside one transaction:

- save content changes and publication intent without setting `Site.status='published'` or `publishedAt` before `db_finalize`;
- validate preview and gallery media parity;
- lock `public_catalog_settings` and increment or reuse V2 `desiredRevision`;
- create or reuse one nonterminal operation row by `operationGroupKey`;
- create audit row;
- keep V1 compatibility from observing public success until active V2 read-back parity passes.

- [ ] **Step 4: Implement orchestrator checkpoints**

For each operation stage, persist `stage`, `lastCheckpoint`, `retryCount` and safe `lastErrorCode`. Claim uses a lease with expiration. A process restart resumes from the last verified checkpoint.

- [ ] **Step 5: Implement boot-time recovery**

In `server.ts`, start `publicCatalogV2Orchestrator` and `publicCatalogV2Reconciler` on backend boot. They immediately scan `queued`, `retry_wait` and expired `running` operations with row locking and `SKIP LOCKED`, then tick below the `60000` ms lease TTL. A test commits the content transaction, discards the old app instance, starts a fresh app instance, and observes the same operation/revision finish or retry without a second HTTP publish call.

- [ ] **Step 6: Implement active pointer switch last**

Upload and verify all release artifacts. Upload `active.json` only after manifest verify. Fetch `active.json` and compare manifest SHA, revision, URL, bucket id and content type. Read back the release artifacts needed for the changed site and call `assertPublicCatalogV2ReadBackParity(expectedProjection, activeReadbackItem)`. Then finalize DB, `Site.status='published'`, `publishedAt`, `PublicCatalogSetting.activeRevision`, activation event and operation terminal status in one transaction.

- [ ] **Step 7: Implement recovery matrix tests**

Force failure after every stage:

- `content_transaction`;
- `media_preflight`;
- `projection_page`;
- `index_build`;
- `chunk_build`;
- `chunk_upload`;
- `chunk_verify`;
- `popular_build`;
- `popular_upload`;
- `popular_verify`;
- `categories_build`;
- `categories_upload`;
- `categories_verify`;
- `manifest_build`;
- `manifest_upload`;
- `manifest_verify`;
- `active_build`;
- `active_upload`;
- `active_verify`;
- `db_finalize`;
- `reconcile`.

Each test kills/restarts the orchestrator, resumes from checkpoint, proves the same revision, no duplicate active event, no duplicate uploads, and old release remains active until verified activation.

- [ ] **Step 8: Run focused GREEN**

Run:

```powershell
Set-Location backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/admin.publication.routes.test.ts tests/admin.publication.service.test.ts tests/public-catalog-v2.orchestrator.test.ts tests/public-catalog-v2.recovery.test.ts
```

Expected: PASS.

---

### OPV2-6: Premium Admin One-Button UI And Modal Switch

**Files:**

- Modify: `backend/src/admin/assets/screens/site-editor.js`
- Modify: `backend/src/admin/assets/screens/sites-list.js`
- Modify: `backend/src/admin/assets/screens/image-manager.js`
- Modify: `backend/src/admin/assets/screens/maintenance.js`
- Modify: `backend/src/admin/assets/api-client.js`
- Modify: `backend/src/admin/assets/forms.js`
- Modify: `backend/src/admin/assets/admin.css`
- Create: `backend/tests/admin-ui.publication-button.test.mjs`
- Create: `backend/tests/admin-ui.demo-switch.test.mjs`
- Create: `backend/tests/admin-ui.publication-progress.test.mjs`
- Create: `backend/tests/admin-ui.maintenance-visibility.test.mjs`

**Interfaces:**

- Consumes admin publication endpoints.
- Produces one visible publication control and autosaving switch.

- [ ] **Step 1: Write RED UI tests**

```js
test("ordinary admin site screen exposes one publication button and no manual catalog maintenance buttons", async () => {
  for (const status of ["draft", "published", "needs_republish", "running", "failed", "unpublished_restorable"]) {
    const screen = await renderSiteEditorSyntheticFixture({ status });

    assert.equal(screen.querySelectorAll('[data-primary-publication-control="true"]').length, 1);
    assert.equal(screen.getAllByRole("button", { name: /Опубликовать|Сохраняем|Загружаем изображения|Проверяем|Публикуем|Опубликовано|Повторить публикацию/ }).filter(isVisibleOrdinaryPrimaryAction).length, 1);
    for (const forbiddenAction of [
      "sync-public-catalog",
      "public-catalog-dry-run",
      "refresh-public-catalog-status",
      "apply-public-catalog",
      "save-public-catalog-settings",
      "bootstrap-public-catalog-bucket",
      "repair-public-catalog-snapshot",
      "publish-site-lifecycle-only",
      "unpublish-site-lifecycle-only"
    ]) {
      assert.equal(screen.querySelectorAll(`[data-action="${forbiddenAction}"]`).length, 0);
    }
    assert.equal(findVisibleOrdinaryButtonsByText(screen, /Опубликовать|Повторить публикацию|Снять с публикации|Синхронизировать|Dry-run|Apply|Refresh/).filter((button) => !button.closest('[data-primary-publication-control="true"]') && !button.closest('[data-overflow-menu="true"]')).length, 0);
  }
});
```

Add RED tests that destructive/restorative actions `Снять с публикации`, `Удалить` and `Восстановить` are absent from ordinary visible action rows and appear only after opening the overflow menu with destructive confirmation where applicable.

Add RED tests for network error, validation error, operation failure and polling timeout proving form values, Preview/Gallery selections, upload queues, selected filenames and unsaved local edits remain available for retry.

- [ ] **Step 2: Replace ordinary lifecycle publish action**

The visible button calls `POST /api/admin/sites/:id/publication` rather than the old lifecycle-only endpoint. It uses one idempotency key per click and disables duplicate submit until operation state returns.

- [ ] **Step 3: Implement progress copy**

Map operation stages to exact copy:

- `content_transaction`: `Сохраняем...`
- `media_preflight`: `Проверяем...`
- `projection_page`: `Проверяем...`
- `index_build`: `Публикуем...`
- `chunk_build`: `Публикуем...`
- `chunk_upload`: `Публикуем...`
- `chunk_verify`: `Публикуем...`
- `popular_build`: `Публикуем...`
- `popular_upload`: `Публикуем...`
- `popular_verify`: `Публикуем...`
- `categories_build`: `Публикуем...`
- `categories_upload`: `Публикуем...`
- `categories_verify`: `Публикуем...`
- `manifest_build`: `Публикуем...`
- `manifest_upload`: `Публикуем...`
- `manifest_verify`: `Публикуем...`
- `active_build`: `Публикуем...`
- `active_upload`: `Публикуем...`
- `active_verify`: `Публикуем...`
- `db_finalize`: `Публикуем...`
- `reconcile`: `Публикуем...`
- terminal succeeded: `Опубликовано`
- terminal failed: `Повторить публикацию`

All transient copy renders inside the single primary publication control. The stable status badge may show only `Черновик`, `Опубликовано`, `Нужна повторная публикация` or `Снимается с публикации`; it must not show live progress. Tests assert no raw stage, revision, checksum, bucket, manifest path, lease or Storage path appears in ordinary UI.

- [ ] **Step 4: Implement demo switch**

Switch label: `Открывать демо внутри WEB00`. Use `role="switch"`, `aria-checked`, default checked. Autosave calls settings endpoint and then starts or coalesces publication operation. Compact states are `Сохранено`, `Публикуется`, `Ошибка`.

- [ ] **Step 5: Move maintenance controls**

In ordinary site screens remove normal access to public catalog dry-run/sync/status/apply controls. Keep expert screen section named `Восстановление и диагностика` for admin-only recovery.

- [ ] **Step 6: Move rare destructive actions to overflow**

Move `Снять с публикации`, `Удалить` and `Восстановить` to the overflow menu. Ordinary visible action rows contain no destructive/restorative button. Destructive actions require confirmation and never run a hidden catalog sync button.

- [ ] **Step 7: Run admin UI focused GREEN**

Run:

```powershell
Set-Location backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/admin-ui.publication-button.test.mjs tests/admin-ui.demo-switch.test.mjs tests/admin-ui.publication-progress.test.mjs tests/admin-ui.maintenance-visibility.test.mjs
```

Expected: PASS.

---

### OPV2-7: Public Frontend V2 Reader, Cache And Virtualization

**Files:**

- Create: `assets/js/public-catalog-v2-client.js`
- Create: `assets/js/public-catalog-v2-cache.js`
- Create: `assets/js/public-catalog-v2-renderer.js`
- Create: `assets/js/public-catalog-emergency-release.js`
- Create: `scripts/build-public-catalog-emergency-release.mjs`
- Modify: `assets/js/runtime-config.js`
- Modify: `assets/js/catalog-api.js`
- Modify: `assets/js/main.js`
- Modify: `sw.js`
- Modify: `index.html`
- Modify: `solutions.html`
- Modify: `cases.html`
- Modify: `services.html`
- Modify: `pricing.html`
- Modify: `faq.html`
- Modify: `how-it-works.html`
- Modify: `contacts.html`
- Modify: `brief.html`
- Modify: `cabinet.html`
- Modify: `app.html`
- Modify: `status.html`
- Modify: `install.html`
- Modify: `privacy-policy.html`
- Modify: `consent-personal-data.html`
- Create: `tests/frontend/public-catalog-v2-client.test.mjs`
- Create: `tests/frontend/public-catalog-v2-cache.test.mjs`
- Create: `tests/frontend/public-catalog-v2-renderer.test.mjs`
- Create: `tests/frontend/service-worker-v2-cache.test.mjs`

**Interfaces:**

- Consumes V2 Storage artifacts.
- Produces `window.WEB00_PUBLIC_CATALOG_V2`.

- [ ] **Step 1: Write RED frontend client tests**

```js
test("clean visitor renders V2 first page without Render API", async () => {
  const fetches = createSyntheticV2FetchFixture();
  const catalog = await loadPublicCatalogV2({ fetchImpl: fetches.fetch, cache: memoryCache() });

  assert.equal(fetches.urls.some((url) => new URL(url).hostname.endsWith("onrender.com")), false);
  assert.equal(fetches.urls.some((url) => new URL(url).pathname.startsWith("/api/")), false);
  assert.equal(fetches.readRuntimeApiBase, false);
  assert.equal(catalog.items.length, 100);
  assert.equal(catalog.popular.items.length, 3);
  assert.deepEqual(catalog.popular.items.map((item) => item.slug), fetches.authoritativePopularSlugs);
});
```

Add RED tests that the public V2 path does not read `runtime-config.js` API base, `window.WEB00_API_BASE`, `/api/sites`, `/api/sites/popular`, `/api/categories`, `/api/sites/:slug`, `/api/search` or any Render host. Legacy `data.js` is reachable only after Storage, valid cache and bundled emergency release all fail.

Add RED test instrumentation that records maximum concurrent public artifact fetches and fails above `4`.

Add RED test instrumentation for first visible row image preload/decode requests and fail when maximum concurrent image preloads exceeds `2`.

- [ ] **Step 2: Implement V2 client**

Fetch `active.json`, manifest, index, popular and first chunk with AbortController timeouts and public artifact fetch concurrency capped at `4`. Verify exact SHA-256 for every artifact. Reject malformed JSON, wrong content type, wrong revision, wrong bucket path and wrong checksum.

- [ ] **Step 3: Implement CacheStorage and IndexedDB strategy**

Cache immutable artifacts by revision and path. Store active revision metadata in IndexedDB. Store no full catalog payload in localStorage.

- [ ] **Step 4: Implement unchanged revision no-op**

If active revision and manifest SHA equal the current rendered release, do not call `renderSolutions`, do not replace DOM, and do not preload images again.

- [ ] **Step 5: Implement newer revision atomic swap**

Keep old catalog visible. Preload first visible row images with concurrency `2`. After all required images decode or reach explicit asset-error placeholder state, swap the catalog DOM once. Timed-out Preview/Gallery assets render with `data-image-status="error"` and keep the expected `assetId`; no different image is substituted.

- [ ] **Step 6: Implement background refresh failure no-banner behavior**

If a valid catalog is already visible and background `active.json`, manifest or chunk refresh fails, keep the catalog visible, show no red blocking banner, and record only nonblocking diagnostic state.

- [ ] **Step 7: Implement virtualization**

Render at most `120` card nodes. Use chunk membership from index and load chunks on demand for pagination/infinite scroll.

- [ ] **Step 8: Run frontend focused GREEN**

Run:

```powershell
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\node.exe" --test tests/frontend/public-catalog-v2-client.test.mjs tests/frontend/public-catalog-v2-cache.test.mjs tests/frontend/public-catalog-v2-renderer.test.mjs tests/frontend/service-worker-v2-cache.test.mjs
```

Expected: PASS.

---

### OPV2-8: Gallery And Managed Demo Modal

**Files:**

- Create: `assets/js/public-catalog-v2-gallery.js`
- Create: `assets/js/public-catalog-v2-demo.js`
- Modify: `assets/js/main.js`
- Modify: `assets/css/catalog-premium.css`
- Modify: `assets/css/components.css`
- Create: `tests/frontend/public-catalog-v2-gallery.test.mjs`
- Create: `tests/frontend/public-catalog-v2-demo.test.mjs`

**Interfaces:**

- Consumes normalized V2 item DTO.
- Produces gallery modal controls and demo modal policy.

- [ ] **Step 1: Write RED Gallery order test**

```js
test("V2 gallery opens images in exact backend sortOrder", async () => {
  const item = syntheticV2ItemWithGallery(["asset-a", "asset-b", "asset-c"]);
  const modal = renderV2Gallery(item);

  assert.deepEqual(readVisibleGalleryAssetIds(modal), ["asset-a", "asset-b", "asset-c"]);
});

test("V2 gallery adjacent image preload is capped at two concurrent requests", async () => {
  const preload = instrumentImagePreloader();
  renderV2Gallery(syntheticV2ItemWithGallery(["asset-a", "asset-b", "asset-c", "asset-d"]), { preload });

  assert.equal(preload.maxConcurrent, 2);
});
```

- [ ] **Step 2: Implement gallery controls**

Support thumbnails, previous, next, keyboard arrows, Escape, swipe, focus trap and focus restoration. Preload adjacent image with concurrency `2`. Failed image keeps placeholder plus `data-image-status="error"` and accessible error copy while preserving the expected `assetId`.

- [ ] **Step 3: Write RED demo policy test**

```js
test("demo modal embeds only managed allowed origins and falls back to outside link", async () => {
  const allowed = renderDemoAction(syntheticV2Item({ demoUrl: "https://demo.web00.invalid/site", demoPolicy: "managed" }));
  const blocked = renderDemoAction(syntheticV2Item({ demoUrl: "https://external.invalid", demoPolicy: "external" }));

  assert.equal(allowed.querySelectorAll("iframe").length, 1);
  assert.equal(blocked.querySelectorAll("iframe").length, 0);
  assert.match(blocked.textContent, /Открыть отдельно/);
  assert.equal(allowed.querySelector("iframe").getAttribute("sandbox").includes("allow-same-origin"), true);
  assert.equal(blocked.querySelector("[data-demo-mode]").dataset.demoMode, "external");
});
```

Add RED tests for CSP `frame-src` limited to approved origins, no `allow-same-origin` for non-WEB00 origins, iframe `src` removal on close, Escape/focus restoration and mobile layout.

- [ ] **Step 4: Implement demo modal**

Use `demoUrl` for managed modal, `siteUrl` for external open. Remove iframe `src` on close. Use sandbox and CSP-compatible origin checks.

- [ ] **Step 5: Run frontend focused GREEN**

Run:

```powershell
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\node.exe" --test tests/frontend/public-catalog-v2-gallery.test.mjs tests/frontend/public-catalog-v2-demo.test.mjs
```

Expected: PASS.

---

### OPV2-9: Migration, Backfill And V2 Release Creation

**Files:**

- Create: `backend/src/modules/public-catalog-v2/public-catalog-v2.backfill.ts`
- Create: `backend/src/cli/public-catalog-v2-backfill.command.ts`
- Modify: `backend/package.json`
- Create: `backend/tests/public-catalog-v2.backfill.test.ts`
- Create: `backend/tests/cli.public-catalog-v2-backfill.test.ts`
- Create: `backend/docs/WEB00_PUBLIC_CATALOG_V2_PROTOCOL.md`
- Create: `backend/docs/WEB00_ONE_CLICK_PUBLICATION_RUNBOOK.md`

**Interfaces:**

- Produces local-only backfill command for migrating existing preview/gallery JSON into typed asset tables.
- Produces owner-authorized production sequence, but does not execute production.

- [ ] **Step 1: Write RED backfill tests**

```ts
it("backfills typed image assets from managed preview and gallery JSON without changing public site fields", async () => {
  const before = await readSyntheticSitePublicProjection(siteId);

  await runPublicCatalogV2Backfill({ databaseUrl: localDatabaseUrl, mode: "apply" });

  const after = await readSyntheticSitePublicProjection(siteId);
  expect(after).toEqual(before);
  expect(await countTypedMediaAssets(siteId)).toBe(5);
});
```

- [ ] **Step 2: Implement local backfill command**

Command:

```json
"catalog:v2:backfill": "node dist/cli/public-catalog-v2-backfill.command.js"
```

The command requires explicit local/test database guard unless a separate owner production task authorizes production.

- [ ] **Step 3: Document release sequence**

Runbook must split release into hard-stop operator phases. The next phase cannot start until the previous phase has explicit owner acceptance.

1. Additive migration preparation: local migration only, local check evidence, rollback by normal revert before production apply.
2. Backend deploy preparation: commit and push only after owner authorization, no deploy in this phase.
3. Backend deploy: manual Render deploy only after owner authorization, verify exact commit plus `/api/health`, `/api/ready`, `/api/version`.
4. V2 activation: one owner-authorized production dry-run, one owner-authorized release activation, read-only operator validation of `active.json`, manifest, index, popular, categories, every manifest-listed chunk, checksums, content type and item counts.
5. Public frontend deploy: only after backend V2 active release acceptance, deploy GitHub Pages with V2 reader.
6. Live browser acceptance: fresh profile and repeat visitor smoke on deployed public frontend.

The operator evidence checklist may include revision, checksum, bucket, manifest and chunk details. The owner acceptance checklist must use owner-facing outcomes only.

- [ ] **Step 4: Run focused GREEN**

Run:

```powershell
Set-Location backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-v2.backfill.test.ts tests/cli.public-catalog-v2-backfill.test.ts
```

Expected: PASS.

---

### OPV2-10: Production E2E Acceptance And V1 Retirement Gate

**Files:**

- Create: `backend/tests/e2e/one-click-publication.e2e.test.ts`
- Create: `backend/tests/e2e/public-catalog-v2-recovery.e2e.test.ts`
- Modify: `backend/docs/WEB00_ONE_CLICK_PUBLICATION_RUNBOOK.md`
- Modify: `backend/docs/WEB00_PUBLIC_CATALOG_RELEASE_RUNBOOK.md`
- Create: `tests/frontend/public-catalog-v2-live-contract.test.mjs`

**Interfaces:**

- Produces final owner acceptance gates.
- Keeps V1 available until V2 E2E PASS.

- [ ] **Step 1: Write local E2E test**

```ts
it("publishes a real synthetic card with preview and Gallery A/B/C through one button contract", async () => {
  const card = await admin.createDraft(syntheticCardInput());
  const preview = await admin.uploadPreview(card.id, syntheticImage("preview"));
  const gallery = await admin.uploadGallery(card.id, [syntheticImage("A"), syntheticImage("B"), syntheticImage("C")]);

  const operation = await admin.publishOneClick(card.id);
  await admin.waitForPublication(operation.id, "succeeded");

  const publicItem = await catalogV2.readActiveItem(card.slug);
  expect(publicItem.previewImage.assetId).toBe(preview.assetId);
  expect(publicItem.galleryImages.map((image) => image.assetId)).toEqual(gallery.map((image) => image.assetId));
});
```

- [ ] **Step 2: Write recovery E2E test**

Force a synthetic stage failure after `active_upload`, restart orchestrator, run reconciler and expect active pointer plus DB finalization to converge without new revision.

- [ ] **Step 3: Define owner production acceptance checklist**

Operator technical evidence is PASS only after migration applied, backend deployed, health/ready/version PASS, one owner-authorized V2 release active, active pointer readable, manifest readable, every manifest-listed chunk readable, checksum valid for every artifact, content type valid and item count correct. If dry-run generated-release evidence is used, every live artifact byte string and parsed object must equal that evidence; otherwise every live object byte string must match its manifest checksum, parse under the V2 schema and match manifest membership.

Owner acceptance is PASS only after owner-facing evidence:

- one primary `Опубликовать` control completes;
- UI shows `Опубликовано` only after parity;
- exact test card is visible in the public catalog;
- exact Preview asset is visible;
- Gallery A/B/C order matches uploaded asset order;
- demo switch behavior matches ON modal policy or safe outside fallback;
- background refresh failure does not cover a valid catalog with a red banner;
- deployed public frontend live smoke PASS;
- PR #14 remains untouched unless a separate owner action supersedes it.

Production live browser acceptance requires a deployed public frontend, fresh browser profile with no cache, repeat visitor run, desktop viewport, mobile viewport, exact test card, exact Preview asset, Gallery A/B/C order, demo policy, proof no `/api/` catalog dependency is used, screenshot/log evidence and read-only release artifact validation. Local unit-test PASS is not production PASS; production PASS requires deployed live browser acceptance and read-only release artifact validation.

- [ ] **Step 4: Run full local backend and frontend gates**

Run:

```powershell
Set-Location backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run check
Set-Location ..
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\node.exe" --test tests/frontend/*.test.mjs
git diff --check
git diff -- backend/package.json backend/package-lock.json
git diff -- backend/prisma/migrations
```

Expected:

- `npm run check` PASS.
- Frontend tests PASS.
- `git diff --check` PASS.
- No dependency drift unless the phase explicitly changed `backend/package.json`.
- Old migrations unchanged.

---

## Review Gate

Before any implementation branch is considered ready:

- Request code review for the full branch diff.
- Review for no sync semantic drift from V1 compatibility.
- Review for one ordinary publication button only.
- Review for no fabricated frontend data.
- Review for exact stage recovery.
- Review for exact image parity.
- Review for no raw secrets or provider bodies in logs.
- Review for no hidden Render public API dependency.
- Fix every Critical and Important finding.
- Re-run focused tests and full `npm run check`.

## Rollback Evidence Gate

Every implementation phase must record:

- commit SHA;
- migration file name when present;
- files changed;
- focused tests;
- full checks;
- rollback command by normal revert;
- proof old immutable releases remain readable;
- proof `active.json` rollback uses a new activation event.

## Final Local Verification Commands

```powershell
Set-Location D:\WEB00_WORKTREES\web00-one-click-publish-v2-plan
git diff --check
git diff --cached --name-only
git status --short
```

Expected:

- `git diff --check` PASS.
- Staging empty unless a separate implementation task explicitly stages.
- Only allowed docs are changed in OPV2-A0.
