# Atomic Cloud Primary Cutover Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL:
> use superpowers:subagent-driven-development
> or superpowers:executing-plans.

**Goal:** Public catalog cards load from Cloud.ru Atomic Runtime and remain available when Render is sleeping/down, with bundled static catalog as immediate fallback.

**Architecture:** GitHub Pages renders static first, validates Cloud.ru mutable manifest plus immutable snapshot plus SHA-256, then promotes validated Cloud data. Render is absent from the public catalog read path. Backend automatically reconciles dirty public catalog state to Cloud.ru through the existing manifest-last Atomic publisher.

**Tech Stack:** Node 22.23.1, TypeScript, Express, Prisma/PostgreSQL, AWS SDK S3 client, vanilla browser JS, GitHub Pages, Cloud.ru Object Storage.

## Global Constraints

- Do not ask new architecture questions; the design is frozen in `docs/superpowers/specs/2026-08-07-atomic-cloud-primary-cutover-design.md`.
- Public catalog source priority is Cloud.ru Atomic Runtime, then bundled static catalog fallback.
- Render API must not be a public catalog read fallback.
- Production runtime prefix is `runtime/production`.
- Shadow runtime prefix remains `canary/shadow`.
- Production manifest path is `runtime/production/catalog/v1/manifest.json`.
- Production immutable releases live under `runtime/production/catalog/v1/releases/`.
- Cloud.ru CORS remains exact origin `https://prudexxx.github.io` with methods `GET` and `HEAD`.
- Public frontend receives no S3 credentials, Render secrets, Supabase secrets, admin tokens, or signed write URLs.
- Publisher order is immutable snapshot, authenticated read-back, public read-back, lease ownership verification, mutable manifest last, public manifest verification, DB finalize.
- Manual Sync remains maintenance/recovery tooling, not normal production workflow.
- Admin mutation success must not depend on Cloud.ru availability.
- Do not publish from inside a Prisma transaction.
- Dirty marking stays transactional; reconcile scheduling happens after successful operation completion.
- Node 22 executable is `D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe`.
- Known historical baseline failures must be compared by fingerprint; new failures must be zero.

---

## Current Code Map

This plan maps backend Atomic Runtime code from the linked worktree `D:\WEB00_ATOMIC_BLOCK1` at branch `feat/atomic-runtime-shadow-publisher`, commit `7cefbe3`, because the current `D:\WEB00_BACKEND` checkout is on `fix/sw-catalog-network-first` and does not contain the backend Atomic Runtime files yet. It maps frontend catalog and service worker code from the current `D:\WEB00_BACKEND` checkout.

Backend Atomic Runtime files already present in `D:\WEB00_ATOMIC_BLOCK1`:

- `backend/src/config/cloudru-runtime-env.ts`: parses `WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED`, Cloud.ru S3 values, `CLOUDRU_PUBLIC_BASE_URL`, and `CLOUDRU_RUNTIME_PREFIX`; currently accepts only `canary/shadow`.
- `backend/src/modules/public-catalog/public-runtime-storage.ts`: owns `PUBLIC_RUNTIME_MANIFEST_PATH`, `PUBLIC_RUNTIME_RELEASES_PREFIX`, `createPublicRuntimePathBuilder`, `normalizeRuntimePrefix`, `assertRuntimeObjectPath`, `assertPositiveRevision`, and `assertSha256`.
- `backend/src/modules/public-catalog/cloudru-s3-public-runtime-storage.ts`: creates `PublicRuntimeStorage`, writes immutable objects with `public, max-age=31536000, immutable`, writes manifests with `no-store, no-cache, must-revalidate, max-age=0`, uses `fetch(..., { cache: "no-store", credentials: "omit", redirect: "error" })`, and maps provider errors to `AppError`.
- `backend/src/modules/public-catalog/public-catalog.snapshot.ts`: owns deterministic `buildPublicCatalogSnapshot`, `buildPublicCatalogManifest`, `serializePublicCatalogManifest`, `validatePublicCatalogSnapshot`, `validatePublicCatalogManifest`, and `sha256Hex`.
- `backend/src/modules/public-catalog/public-catalog-control.repository.ts`: owns `PublicCatalogControlState`, `markPublicCatalogDirty`, `updatePublicCatalogSettings`, `createPrismaPublicCatalogSyncRepository`, `createPrismaPublicCatalogControlStatusReader`, lease CAS helpers, and `finalizePublicCatalogLeaseState`.
- `backend/src/modules/public-catalog/public-catalog-sync.service.ts`: owns `PublicCatalogSyncRepository`, `PublicCatalogSyncService`, `PublicCatalogSyncResult`, and `createPublicCatalogSyncService({ repository, storage, pathPrefix })`; performs manifest-last publish and clean no-op handling through `noLeaseResult`.
- `backend/src/modules/public-catalog/public-runtime-shadow.ts`: owns `createPublicRuntimeShadowDependencies`, `PublicRuntimeShadowDependencies`, `PublicRuntimeShadowStatusService`, shadow status DTO normalization, and manual shadow sync result normalization.
- `backend/src/modules/admin/maintenance/public-runtime.routes.ts`: owns `/api/admin/maintenance/public-runtime` and `/api/admin/maintenance/public-runtime/sync`; manual sync uses `syncService.syncOnce({ requestId })`.
- `backend/src/modules/admin/admin.routes.ts`: wires `publicRuntimeShadow` into the admin router when dependencies exist.
- `backend/src/server.ts`: parses `parseCloudRuRuntimeEnv(process.env)`, creates `publicRuntimeShadow`, passes it into `createAdminRouter`, and stops `pagesPublicationReconciliationWorker` plus `storageCleanupWorker` during shutdown.

Backend dirty-marking files already present in `D:\WEB00_ATOMIC_BLOCK1`:

- `backend/src/modules/admin/sites/site.repository.ts`: calls `markPublicCatalogDirty` inside `permanentlyDeleteSite`, `lifecycleUpdate`, and `updateSite`; uses `shouldMarkPublicCatalogDirtyForSiteChange` and `PUBLIC_CATALOG_SITE_FIELDS`.
- `backend/src/modules/admin/sites/site.service.ts`: methods `createDraft`, `deleteSite`, `permanentlyDeleteSite`, `publishSite`, `restoreSite`, `unpublishSite`, and `updateSite` call repository methods and return mapped DTOs through `mapAdminSiteDetail`.
- `backend/src/modules/admin/categories/category.repository.ts`: calls `markPublicCatalogDirty` inside `updateCategory` when `hasPublicCategoryProjectionChange` is true and linked public sites exist.
- `backend/src/modules/admin/categories/category.service.ts`: methods `createCategory`, `deleteCategory`, and `updateCategory` call repository methods and return mapped DTOs through `mapAdminCategoryDetail`.
- `backend/src/modules/admin/images/site-image.repository.ts`: calls `markDirtyForPublicImageMutation` for gallery add/delete/reorder and preview replace/delete; that helper calls `markPublicCatalogDirty` only when a public site projection changes.
- `backend/src/modules/admin/images/site-image.service.ts`: exposes `gallery.addBatch`, `gallery.addBatchStream`, `gallery.addSingle`, `gallery.deleteImage`, `gallery.reorder`, `preview.deletePreview`, and `preview.replacePreview`.

Current frontend files in `D:\WEB00_BACKEND`:

- `assets/js/runtime-config.js`: defines `window.WEB00_CONFIG = Object.freeze({ apiBaseUrl, requestTimeoutMs, staticFallbackEnabled })`; `apiBaseUrl` currently points at `https://web00-backend-production.onrender.com`.
- `assets/js/catalog-api.js`: owns `validateConfig`, `getConfig`, `getStaticCatalog`, `readLastKnownGoodCatalog`, `saveLastKnownGoodCatalog`, `getInitialCatalog`, `loadAllSites`, `loadPopularSites`, `loadSiteDetail`, `loadCategoryDetail`, `preservedCatalogState`, `resolveCatalogForPage`, `buildApiUrl`, `fetchJson`, `loadPaginatedSites`, and `createRequestChannel`.
- `assets/js/main.js`: owns catalog UI state through `initCatalogState`, `refreshCatalogInBackground`, `applyCatalogState`, `updateCatalogStateNodes`, `initPopularCatalogState`, `initBriefCatalogState`, and `registerServiceWorker`.
- `sw.js`: cache version `web00-shell-v6-catalog-network-first`; treats `assets/js/runtime-config.js` and same-origin `/api` requests as network-only; uses `networkFirstCatalogData` for same-origin `assets/js/data.js`; does not currently handle cross-origin Cloud.ru runtime requests.

Current directly relevant tests:

- Backend Vitest: `backend/tests/public-runtime-config.test.ts`, `backend/tests/public-runtime-paths-snapshot.test.ts`, `backend/tests/cloudru-public-runtime-storage.test.ts`, `backend/tests/public-catalog-control.repository.test.ts`, `backend/tests/public-catalog-sync.service.test.ts`, `backend/tests/public-runtime-dirty-marking.test.ts`, `backend/tests/public-runtime-shadow.wiring.test.ts`.
- Frontend Node tests: `tests/frontend/catalog-resilience.test.mjs`, `tests/frontend/catalog-normalization.test.mjs`, `tests/frontend/service-worker-catalog-cache.test.mjs`, `tests/frontend/service-worker-contract.test.mjs`, `tests/frontend/static-page-contract.test.mjs`, `tests/frontend/pages-catalog-generator.test.mjs`.

## File Structure / Responsibility Map

- Modify `backend/prisma/schema.prisma`: add `publishedRuntimeTargetKey String? @map("published_runtime_target_key") @db.Text` to `PublicCatalogControl`.
- Create `backend/prisma/migrations/20260807130000_public_runtime_target_identity/migration.sql`: forward-only `ALTER TABLE public_catalog_control ADD COLUMN published_runtime_target_key TEXT`.
- Create `backend/src/modules/public-catalog/public-runtime-target.ts`: define target role, target config, deterministic target key creation, and target equality helpers.
- Modify `backend/src/config/cloudru-runtime-env.ts`: parse target-aware Cloud.ru runtime config for shadow and primary without credential leakage in target keys.
- Modify `backend/src/modules/public-catalog/public-runtime-storage.ts`: make path builder target-aware enough to reject empty production prefix and enforce configured prefix/path contract.
- Modify `backend/src/modules/public-catalog/public-catalog.snapshot.ts`: add optional manifest target identity field only if implementation chooses to expose non-secret target key for public verification.
- Modify `backend/src/modules/public-catalog/public-catalog-control.repository.ts`: store/read `publishedRuntimeTargetKey`, validate ready state against configured target, and finalize with the current target key.
- Modify `backend/src/modules/public-catalog/public-catalog-sync.service.ts`: accept `target: PublicRuntimeTargetConfig`, verify target identity during clean no-op and manifest recovery, and pass target key into `finalizeLease`.
- Modify `backend/src/modules/public-catalog/public-runtime-shadow.ts`: preserve shadow dependencies while delegating to generic target-aware runtime composition.
- Create `backend/src/modules/public-catalog/public-runtime-primary.ts`: compose production primary runtime dependencies for `runtime/production`.
- Create `backend/src/modules/public-catalog/public-catalog-reconciler.ts`: provide non-blocking single-flight reconcile scheduling with bounded retry/backoff.
- Modify `backend/src/modules/admin/maintenance/public-runtime.routes.ts`: keep manual shadow maintenance and add status surface needed for primary target only if admin maintenance currently owns runtime status.
- Modify `backend/src/modules/admin/admin.routes.ts`: pass `publicRuntimePrimary` or `publicCatalogReconciler` through admin service options without exposing public endpoints unnecessarily.
- Modify `backend/src/server.ts`: parse primary runtime config, create primary sync service/reconciler, call `start()` on startup, call `stop()` on shutdown, and inject reconciler into admin services.
- Modify `backend/src/modules/admin/sites/site.service.ts`: call `reconciler.requestReconcile(...)` only after repository calls complete successfully for public-projection mutations.
- Modify `backend/src/modules/admin/categories/category.service.ts`: call `reconciler.requestReconcile(...)` only after repository calls complete successfully for category mutations that can affect public projection.
- Modify `backend/src/modules/admin/images/site-image.service.ts`: call `reconciler.requestReconcile(...)` only after repository calls complete successfully for image mutations that can affect public projection.
- Modify `assets/js/runtime-config.js`: add explicit Cloud runtime config keys separate from `apiBaseUrl`.
- Create `assets/js/catalog-runtime.js`: isolate Cloud manifest/snapshot validation, byte SHA calculation, URL contract checks, and normalized Cloud catalog loading.
- Modify `assets/js/catalog-api.js`: source order becomes static first paint, validated Cloud runtime, then safe LKG/static fallback; remove Render API calls from catalog card display when Cloud primary mode is active.
- Modify `assets/js/main.js`: preserve current static-first rendering and ensure Cloud-ready source causes render while failures only end loading/fallback state.
- Modify `sw.js`: guarantee mutable Cloud manifest is never cache-first pinned; keep static fallback and no reload loop behavior.
- Modify backend tests listed in the Current Code Map: add focused RED/GREEN coverage for target identity, target-aware composition, reconciler, triggers, and publisher invariants.
- Modify frontend tests listed in the Current Code Map: add focused RED/GREEN coverage for Cloud runtime client, runtime config, no Render catalog GET, LKG ordering, spinner resolution, and service worker freshness.

## Task 1: Durable Runtime Target Identity

**Files:**

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260807130000_public_runtime_target_identity/migration.sql`
- Create: `backend/src/modules/public-catalog/public-runtime-target.ts`
- Modify: `backend/src/modules/public-catalog/public-catalog-control.repository.ts`
- Modify: `backend/src/modules/public-catalog/public-catalog-sync.service.ts`
- Test: `backend/tests/public-catalog-control.repository.test.ts`
- Test: `backend/tests/public-catalog-sync.service.test.ts`

**Interfaces:**

- Consumes: `PublicCatalogControlState`, `FinalizePublicCatalogLeaseOptions`, `PublicCatalogSyncRepository.finalizeLease`, `createPublicCatalogSyncService`.
- Produces: `PublicRuntimeRole`, `PublicRuntimeTargetConfig`, `createPublicRuntimeTargetKey`, `isPublicCatalogReadyForTarget`, `publishedRuntimeTargetKey` on durable state and finalize input.

- [ ] **Step 1: Write failing repository tests for target identity readiness**

Add tests in `backend/tests/public-catalog-control.repository.test.ts` under `describe("public catalog durable control state", ...)`:

```ts
import {
  finalizePublicCatalogLeaseState,
  validatePublicCatalogControlState
} from "../src/modules/public-catalog/public-catalog-control.repository.js";
import { createPublicRuntimeTargetKey } from "../src/modules/public-catalog/public-runtime-target.js";

it("rejects false-ready durable state when published target key is legacy null", () => {
  const state = validatePublicCatalogControlState({
    ...control(),
    desiredRevision: 4,
    publishedRevision: 4,
    publishedRuntimeTargetKey: null,
    syncStatus: "ready"
  });
  const targetKey = createPublicRuntimeTargetKey(primaryTargetFixture());

  expect(isPublicCatalogReadyForTarget(state, targetKey, new Date("2026-08-07T12:00:00.000Z"))).toBe(false);
});

it("stores the current target key when finalizing a fenced publication", () => {
  const targetKey = createPublicRuntimeTargetKey(primaryTargetFixture());
  const finalized = finalizePublicCatalogLeaseState({
    ...control(),
    desiredRevision: 5,
    publishedRevision: 4,
    syncLeaseId: "lease-5",
    syncLeaseExpiresAt: new Date("2026-08-07T12:01:00.000Z"),
    syncStatus: "syncing"
  }, {
    checksum: "a".repeat(64),
    generatedAt: new Date("2026-08-07T12:00:00.000Z"),
    itemsCount: 17,
    leaseId: "lease-5",
    publishedRevision: 5,
    requestId: "req-target-identity",
    snapshotPath: `runtime/production/catalog/v1/releases/revision-5-${"a".repeat(64)}.json`,
    publishedRuntimeTargetKey: targetKey
  });

  expect(finalized.publishedRuntimeTargetKey).toBe(targetKey);
  expect(finalized.syncStatus).toBe("ready");
});
```

Define `primaryTargetFixture()` in the test file with non-secret fields:

```ts
function primaryTargetFixture(): PublicRuntimeTargetConfig {
  return {
    bucket: "web00-public-runtime",
    catalogVersion: "v1",
    manifestPath: "runtime/production/catalog/v1/manifest.json",
    prefix: "runtime/production",
    provider: "cloudru",
    publicBaseUrl: "https://web00-public-runtime.s3-website.cloud.ru",
    role: "primary"
  };
}
```

- [ ] **Step 2: Run RED and record expected failure**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-catalog-control.repository.test.ts tests/public-catalog-sync.service.test.ts
```

Expected RED: TypeScript or Vitest fails because `public-runtime-target.ts`, `publishedRuntimeTargetKey`, and `isPublicCatalogReadyForTarget` do not exist.

- [ ] **Step 3: Add schema and forward-only migration**

Add to `model PublicCatalogControl`:

```prisma
  publishedRuntimeTargetKey  String?   @map("published_runtime_target_key") @db.Text
```

Create migration:

```sql
ALTER TABLE "public_catalog_control"
  ADD COLUMN "published_runtime_target_key" TEXT;
```

Do not alter `backend/prisma/migrations/20260807120000_public_runtime_control/migration.sql`.

- [ ] **Step 4: Add target identity helper**

Create `backend/src/modules/public-catalog/public-runtime-target.ts`:

```ts
import { createPublicRuntimePathBuilder } from "./public-runtime-storage.js";

export type PublicRuntimeRole = "primary" | "shadow";
export type PublicRuntimeProvider = "cloudru";

export interface PublicRuntimeTargetConfig {
  bucket: string;
  catalogVersion: "v1";
  manifestPath: string;
  prefix: string;
  provider: PublicRuntimeProvider;
  publicBaseUrl: string;
  role: PublicRuntimeRole;
}

export function createPublicRuntimeTargetKey(target: PublicRuntimeTargetConfig): string {
  const builder = createPublicRuntimePathBuilder({
    prefix: target.prefix,
    publicBaseUrl: target.publicBaseUrl
  });
  const manifestPath = builder.validatePath(target.manifestPath);
  const publicBaseUrl = new URL(target.publicBaseUrl);
  publicBaseUrl.search = "";
  publicBaseUrl.hash = "";
  return [
    `provider=${target.provider}`,
    `bucket=${target.bucket}`,
    `publicBaseUrl=${publicBaseUrl.href.replace(/\/+$/, "")}`,
    `role=${target.role}`,
    `prefix=${target.prefix}`,
    `catalog=${target.catalogVersion}`,
    `manifest=${manifestPath}`
  ].join(";");
}

export function isSamePublicRuntimeTarget(left: string | null, right: string): boolean {
  return typeof left === "string" && left === right;
}
```

The helper must not accept access key, secret key, endpoint credentials, or signed URLs.

- [ ] **Step 5: Wire durable field through repository state and finalize**

Extend `PublicCatalogControlState`, `PublicCatalogControlRow`, `defaultControlState`, and `rowToState` with:

```ts
publishedRuntimeTargetKey: string | null;
```

Extend `FinalizePublicCatalogLeaseOptions`:

```ts
publishedRuntimeTargetKey: string;
```

Set it in `finalizePublicCatalogLeaseState` and `createPrismaPublicCatalogSyncRepository().finalizeLease`:

```ts
publishedRuntimeTargetKey: options.publishedRuntimeTargetKey,
```

Add `isPublicCatalogReadyForTarget(state, targetKey, now)`:

```ts
export function isPublicCatalogReadyForTarget(
  state: PublicCatalogControlState,
  targetKey: string,
  now: Date
): boolean {
  const recovered = recoverStalePublicCatalogLeaseState(state, now);
  return (
    recovered.syncStatus === "ready" &&
    recovered.desiredRevision === recovered.publishedRevision &&
    recovered.publishedRuntimeTargetKey === targetKey
  );
}
```

- [ ] **Step 6: Update sync service to require target key**

Change `createPublicCatalogSyncService` options:

```ts
target: PublicRuntimeTargetConfig;
```

Inside `createPublicCatalogSyncService`, compute:

```ts
const targetKey = createPublicRuntimeTargetKey(options.target);
```

Pass `publishedRuntimeTargetKey: targetKey` into both finalize paths:

```ts
await options.repository.finalizeLease({
  checksum: built.sha256,
  generatedAt,
  itemsCount: built.snapshot.itemsCount,
  leaseId: lease.leaseId,
  publishedRevision: lease.revision,
  publishedRuntimeTargetKey: targetKey,
  requestId: input.requestId,
  snapshotPath
});
```

Change clean no-lease handling:

```ts
return noLeaseResult(
  await options.repository.readCurrentState(),
  input.requestId,
  leaseNow,
  targetKey
) ?? lastPending ?? zeroPending(input.requestId);
```

`noLeaseResult` returns ready only through `isPublicCatalogReadyForTarget(state, targetKey, now)`.

- [ ] **Step 7: Run GREEN focused tests**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-catalog-control.repository.test.ts tests/public-catalog-sync.service.test.ts
```

Expected GREEN: target mismatch and legacy null are pending, exact current target is ready with zero storage writes, finalize stores target key.

- [ ] **Step 8: Focused regression and scope check**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
npm run prisma:validate
npm run prisma:format:check
npm run prisma:generate
git diff -- backend/prisma/schema.prisma backend/prisma/migrations/20260807130000_public_runtime_target_identity/migration.sql backend/src/modules/public-catalog/public-runtime-target.ts backend/src/modules/public-catalog/public-catalog-control.repository.ts backend/src/modules/public-catalog/public-catalog-sync.service.ts backend/tests/public-catalog-control.repository.test.ts backend/tests/public-catalog-sync.service.test.ts
```

Expected: only target identity schema, helper, repository, sync service, and focused tests changed.

Recommended future commit boundary: `feat: add public runtime target identity`.

## Task 2: Generalize Atomic Runtime Target

**Files:**

- Modify: `backend/src/config/cloudru-runtime-env.ts`
- Modify: `backend/src/modules/public-catalog/public-runtime-storage.ts`
- Modify: `backend/src/modules/public-catalog/public-runtime-shadow.ts`
- Create: `backend/src/modules/public-catalog/public-runtime-primary.ts`
- Modify: `backend/src/modules/public-catalog/public-catalog-sync.service.ts`
- Test: `backend/tests/public-runtime-config.test.ts`
- Test: `backend/tests/public-runtime-shadow.wiring.test.ts`
- Test: `backend/tests/public-runtime-paths-snapshot.test.ts`

**Interfaces:**

- Consumes: `CloudRuRuntimeStorageConfig`, `createCloudRuS3PublicRuntimeStorage`, `createPublicRuntimePathBuilder`, `createPublicCatalogSyncService`, `createPrismaPublicCatalogSyncRepository`.
- Produces: `CloudRuRuntimeTargetEnvConfig`, `CloudRuRuntimeEnvConfig` with separate `shadow` and `primary` targets, `createPublicRuntimePrimaryDependencies`.

- [ ] **Step 1: Write failing config and path tests**

Add tests:

```ts
it("accepts primary runtime/production while preserving shadow canary/shadow", () => {
  const config = parseCloudRuRuntimeEnv({
    ...baseEnv,
    WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED: "true",
    WEB00_PUBLIC_RUNTIME_PRIMARY_ENABLED: "true",
    CLOUDRU_RUNTIME_SHADOW_PREFIX: "canary/shadow",
    CLOUDRU_RUNTIME_PRIMARY_PREFIX: "runtime/production"
  });

  expect(config.shadow.enabled).toBe(true);
  expect(config.primary.enabled).toBe(true);
  if (config.shadow.enabled) expect(config.shadow.target.role).toBe("shadow");
  if (config.primary.enabled) expect(config.primary.target.role).toBe("primary");
});

it("does not include credentials in the runtime target key", () => {
  const left = parseCloudRuRuntimeEnv({ ...baseEnv, CLOUDRU_S3_SECRET_ACCESS_KEY: "first-secret" });
  const right = parseCloudRuRuntimeEnv({ ...baseEnv, CLOUDRU_S3_SECRET_ACCESS_KEY: "second-secret" });

  expect(left.shadow.enabled && right.shadow.enabled).toBe(true);
  if (left.shadow.enabled && right.shadow.enabled) {
    expect(left.shadow.targetKey).toBe(right.shadow.targetKey);
    expect(left.shadow.targetKey).not.toContain("secret");
  }
});
```

Add path tests proving empty production prefix is rejected:

```ts
expect(() => createPublicRuntimePathBuilder({
  prefix: "",
  publicBaseUrl: "https://web00-public-runtime.s3-website.cloud.ru"
}).manifestPath()).not.toThrow();

expect(() => assertConfiguredRuntimePrefix("", "primary")).toThrow();
```

`assertConfiguredRuntimePrefix` is produced by this task.

- [ ] **Step 2: Run RED and expected failure**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-runtime-config.test.ts tests/public-runtime-shadow.wiring.test.ts tests/public-runtime-paths-snapshot.test.ts
```

Expected RED: primary env keys and target-aware dependency factory are missing.

- [ ] **Step 3: Generalize env return shape while preserving shadow compatibility**

Replace the single enabled/disabled shape with target slots:

```ts
export type CloudRuRuntimeTargetEnvConfig =
  | { enabled: false }
  | {
      enabled: true;
      storage: CloudRuRuntimeStorageConfig;
      target: PublicRuntimeTargetConfig;
      targetKey: string;
    };

export interface CloudRuRuntimeEnvConfig {
  primary: CloudRuRuntimeTargetEnvConfig;
  shadow: CloudRuRuntimeTargetEnvConfig;
}
```

Parse shadow from existing env names for backward compatibility:

```ts
WEB00_PUBLIC_RUNTIME_SHADOW_ENABLED
CLOUDRU_RUNTIME_SHADOW_PREFIX
CLOUDRU_RUNTIME_PREFIX
```

Parse primary from explicit production names:

```ts
WEB00_PUBLIC_RUNTIME_PRIMARY_ENABLED
CLOUDRU_RUNTIME_PRIMARY_PREFIX
```

Both targets use the same Cloud.ru endpoint, region, bucket, public base URL, and backend-only credentials. Shadow accepts only `canary/shadow`. Primary accepts only `runtime/production`.

- [ ] **Step 4: Add role-specific prefix assertion**

In `public-runtime-storage.ts`, add:

```ts
export function assertConfiguredRuntimePrefix(
  prefix: string,
  role: "primary" | "shadow"
): string {
  const normalized = normalizeRuntimePrefix(prefix);
  if (role === "primary" && normalized !== "runtime/production") throw storageConfigurationInvalid();
  if (role === "shadow" && normalized !== "canary/shadow") throw storageConfigurationInvalid();
  return normalized;
}
```

Keep `normalizeRuntimePrefix` as a generic path normalizer for tests and internal helpers.

- [ ] **Step 5: Create primary dependency factory**

Create `backend/src/modules/public-catalog/public-runtime-primary.ts`:

```ts
import type { CloudRuRuntimeTargetEnvConfig } from "../../config/cloudru-runtime-env.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createCloudRuS3PublicRuntimeStorage } from "./cloudru-s3-public-runtime-storage.js";
import { createPrismaPublicCatalogSyncRepository } from "./public-catalog-control.repository.js";
import { createPublicCatalogSyncService, type PublicCatalogSyncService } from "./public-catalog-sync.service.js";
import type { PublicRuntimeStorage } from "./public-runtime-storage.js";

export interface PublicRuntimePrimaryDependencies {
  storage: PublicRuntimeStorage;
  syncService: PublicCatalogSyncService;
  targetKey: string;
}

export function createPublicRuntimePrimaryDependencies(options: {
  createStorage?: (config: CloudRuRuntimeTargetEnvConfig & { enabled: true }) => PublicRuntimeStorage;
  env: CloudRuRuntimeTargetEnvConfig;
  now?: () => Date;
  prisma: PrismaClient;
}): PublicRuntimePrimaryDependencies | null {
  if (!options.env.enabled) return null;
  const storage = createCloudRuS3PublicRuntimeStorage({ config: options.env.storage });
  const repository = createPrismaPublicCatalogSyncRepository({ prisma: options.prisma });
  return {
    storage,
    syncService: createPublicCatalogSyncService({
      ...(options.now === undefined ? {} : { now: options.now }),
      pathPrefix: options.env.storage.prefix,
      repository,
      storage,
      target: options.env.target
    }),
    targetKey: options.env.targetKey
  };
}
```

Use the exact `CloudRuRuntimeStorageConfig` type if TypeScript rejects the narrow `createStorage` signature.

- [ ] **Step 6: Refactor shadow factory to use target-aware config**

Change `createPublicRuntimeShadowDependencies` to read `options.env.shadow` and pass `target: options.env.shadow.target` into `createPublicCatalogSyncService`.

Keep:

```ts
export const PUBLIC_RUNTIME_SHADOW_SYNC_CONFIRMATION = "WEB00-PUBLIC-RUNTIME-SHADOW-SYNC-V1";
```

Keep manual shadow status `mode: "shadow"` and existing routes for diagnostics.

- [ ] **Step 7: Run GREEN focused tests**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-runtime-config.test.ts tests/public-runtime-shadow.wiring.test.ts tests/public-runtime-paths-snapshot.test.ts tests/public-catalog-sync.service.test.ts
```

Expected GREEN: primary and shadow stay isolated; configured target key changes on bucket, public base URL, prefix, catalog version/path, or role changes; credentials do not affect key.

- [ ] **Step 8: Diff and scope check**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1
git diff -- backend/src/config/cloudru-runtime-env.ts backend/src/modules/public-catalog/public-runtime-storage.ts backend/src/modules/public-catalog/public-runtime-shadow.ts backend/src/modules/public-catalog/public-runtime-primary.ts backend/tests/public-runtime-config.test.ts backend/tests/public-runtime-shadow.wiring.test.ts backend/tests/public-runtime-paths-snapshot.test.ts
```

Expected: no duplicate publisher implementation and no path that lets shadow write primary or primary write shadow.

Recommended future commit boundary: `feat: generalize atomic runtime targets`.

## Task 3: Automatic Reconciler

**Files:**

- Create: `backend/src/modules/public-catalog/public-catalog-reconciler.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/public-catalog-reconciler.test.ts`
- Test: `backend/tests/public-runtime-shadow.wiring.test.ts`

**Interfaces:**

- Consumes: `PublicCatalogSyncService.syncOnce({ requestId })`, `PublicCatalogSyncResult`, `isPublicCatalogTerminalSyncStatus`.
- Produces: `PublicCatalogReconciler`, `createPublicCatalogReconciler`, `requestReconcile`, `start`, `stop`.

- [ ] **Step 1: Write failing reconciler tests**

Create `backend/tests/public-catalog-reconciler.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createPublicCatalogReconciler } from "../src/modules/public-catalog/public-catalog-reconciler.js";

describe("public catalog reconciler", () => {
  it("coalesces rapid triggers into one active sync and one follow-up pass", async () => {
    const syncOnce = vi.fn()
      .mockResolvedValueOnce({ status: "pending", desiredRevision: 2, publishedRevision: 1, requestId: "req-1" })
      .mockResolvedValueOnce({ status: "ready", desiredRevision: 2, publishedRevision: 2, itemsCount: 17, requestId: "req-2", snapshotPath: "runtime/production/catalog/v1/releases/revision-2-" + "a".repeat(64) + ".json" });
    const reconciler = createPublicCatalogReconciler({
      createRequestId: () => "req-1",
      initialDelayMs: 0,
      maxDelayMs: 1,
      syncService: { syncOnce }
    });

    reconciler.requestReconcile({ reason: "site.publish", requestId: "admin-1" });
    reconciler.requestReconcile({ reason: "site.update", requestId: "admin-2" });
    await reconciler.drainForTest();

    expect(syncOnce).toHaveBeenCalledTimes(2);
  });

  it("bounds retry after failed publication", async () => {
    const syncOnce = vi.fn().mockResolvedValue({
      status: "failed",
      desiredRevision: 3,
      errorCode: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
      publishedRevision: 2,
      requestId: "req-fail"
    });
    const reconciler = createPublicCatalogReconciler({
      initialDelayMs: 0,
      maxAttempts: 3,
      maxDelayMs: 1,
      syncService: { syncOnce }
    });

    reconciler.requestReconcile({ reason: "startup", requestId: "startup" });
    await reconciler.drainForTest();

    expect(syncOnce).toHaveBeenCalledTimes(3);
  });
});
```

`drainForTest()` is test-only and must be omitted from production types exported to app code if a cleaner private test seam already exists.

- [ ] **Step 2: Run RED and expected failure**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-catalog-reconciler.test.ts
```

Expected RED: `public-catalog-reconciler.ts` does not exist.

- [ ] **Step 3: Create reconciler interface and single-flight scheduler**

Create `backend/src/modules/public-catalog/public-catalog-reconciler.ts`:

```ts
import type { PublicCatalogSyncService } from "./public-catalog-sync.service.js";

export interface PublicCatalogReconcileRequest {
  reason: string;
  requestId: string;
}

export interface PublicCatalogReconciler {
  requestReconcile(input: PublicCatalogReconcileRequest): void;
  start(): void;
  stop(): Promise<void>;
}

export function createPublicCatalogReconciler(options: {
  createRequestId?: () => string;
  initialDelayMs?: number;
  maxAttempts?: number;
  maxDelayMs?: number;
  onError?: (error: unknown) => void;
  syncService: PublicCatalogSyncService;
}): PublicCatalogReconciler {
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID());
  const maxAttempts = options.maxAttempts ?? 5;
  const initialDelayMs = options.initialDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  let started = false;
  let running = false;
  let queued = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(delayMs: number): void {
    if (!started || stopped || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void runLoop();
    }, delayMs);
  }

  async function runLoop(): Promise<void> {
    if (running || stopped) {
      queued = true;
      return;
    }
    running = true;
    try {
      let attempts = 0;
      do {
        queued = false;
        attempts += 1;
        const result = await options.syncService.syncOnce({ requestId: createRequestId() });
        if (result.status === "ready") break;
        if (result.status === "pending" && !queued) break;
        if (result.status === "failed" && attempts < maxAttempts) {
          await delay(Math.min(maxDelayMs, initialDelayMs * 2 ** (attempts - 1)));
        }
      } while ((queued || attempts < maxAttempts) && !stopped);
    } catch (error) {
      options.onError?.(error);
    } finally {
      running = false;
      if (queued && !stopped) schedule(0);
    }
  }

  return {
    requestReconcile() {
      queued = true;
      schedule(0);
    },
    start() {
      started = true;
      schedule(0);
    },
    async stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    }
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
```

Adjust the loop in implementation if tests show a pending result with queued work needs exactly one follow-up pass.

- [ ] **Step 4: Wire reconciler startup/shutdown**

In `backend/src/server.ts`, after `publicRuntimePrimary` is created:

```ts
const publicCatalogReconciler = publicRuntimePrimary === null
  ? null
  : createPublicCatalogReconciler({
      onError: (error) => {
        logger.log({
          environment: options.env.NODE_ENV,
          event: "public-catalog.reconcile.failed",
          level: "error",
          service: options.env.SERVICE_NAME,
          time: (options.now ?? (() => new Date()))().toISOString()
        });
      },
      syncService: publicRuntimePrimary.syncService
    });
```

After worker starts:

```ts
publicCatalogReconciler?.start();
```

During shutdown:

```ts
await Promise.all([
  publicCatalogReconciler?.stop() ?? Promise.resolve(),
  pagesPublicationReconciliationWorker.stop(),
  storageCleanupWorker.stop()
]);
```

- [ ] **Step 5: Run GREEN focused tests**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-catalog-reconciler.test.ts tests/public-runtime-shadow.wiring.test.ts
```

Expected GREEN: single-flight, bounded retry, clean startup no-op, safe stop.

- [ ] **Step 6: Scope check**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1
git diff -- backend/src/modules/public-catalog/public-catalog-reconciler.ts backend/src/server.ts backend/tests/public-catalog-reconciler.test.ts
```

Expected: no sync call inside repository transactions and no Cloud write in request path.

Recommended future commit boundary: `feat: add public catalog reconciler`.

## Task 4: Backend Trigger Matrix

**Files:**

- Modify: `backend/src/modules/admin/sites/site.service.ts`
- Modify: `backend/src/modules/admin/categories/category.service.ts`
- Modify: `backend/src/modules/admin/images/site-image.service.ts`
- Modify: `backend/src/modules/admin/admin.routes.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/public-runtime-dirty-marking.test.ts`
- Test: `backend/tests/admin.site.service.test.ts`
- Test: `backend/tests/admin.category.validation.test.ts`
- Test: `backend/tests/admin.site.routes.test.ts`

**Interfaces:**

- Consumes: `PublicCatalogReconciler.requestReconcile({ reason, requestId })`, `AdminMutationContext`, `AdminSiteService`, `AdminCategoryService`, `SiteImageService`.
- Produces: optional reconciler injection into admin services; post-commit scheduling for public-projection mutations.

- [ ] **Step 1: Write failing service tests for post-commit triggers**

In `backend/tests/public-runtime-dirty-marking.test.ts`, add service-layer tests using fake repositories:

```ts
function adminMutationContext(requestId: string): AdminMutationContext {
  return {
    actor: {
      email: "admin@example.com",
      id: "11111111-1111-4111-8111-111111111111",
      role: "admin",
      sessionId: "22222222-2222-4222-8222-222222222222",
      tokenId: "33333333-3333-4333-8333-333333333333"
    },
    now: new Date("2026-08-07T12:00:00.000Z"),
    requestId
  };
}

function siteLifecycleRecord(title: string): SiteLifecycleRecord {
  return {
    deletedAt: null,
    status: "published",
    title
  } as SiteLifecycleRecord;
}

function adminSiteDetailRecord(title: string): AdminSiteRecord {
  return {
    active: true,
    categoryId: "44444444-4444-4444-8444-444444444444",
    deletedAt: null,
    deliveryLabel: null,
    demoMode: null,
    demoUrl: null,
    developmentDays: null,
    featured: false,
    features: [],
    fullDescription: "",
    galleryImages: [],
    id: "55555555-5555-4555-8555-555555555555",
    legacyTitle: null,
    originalDemoUrl: null,
    previewImageUrl: "https://example.test/preview.webp",
    previewType: "image",
    priceAmountCents: null,
    priceLabel: null,
    publishedAt: new Date("2026-08-07T11:00:00.000Z"),
    shortDescription: "Short",
    siteUrl: null,
    slug: "site-one",
    sortOrder: 0,
    status: "published",
    tags: [],
    title
  } as AdminSiteRecord;
}

it("schedules reconcile after published site update commits", async () => {
  const requestReconcile = vi.fn();
  const repository = {
    getSite: vi.fn(async () => siteLifecycleRecord("Before")),
    updateSite: vi.fn(async () => adminSiteDetailRecord("After"))
  } as unknown as AdminSiteRepository;
  const service = createAdminSiteService({
    publicCatalogReconciler: { requestReconcile, start: vi.fn(), stop: vi.fn() },
    repository
  });

  await service.updateSite("site-1", { title: "After" }, adminMutationContext("req-site-update"));

  expect(requestReconcile).toHaveBeenCalledWith({
    reason: "site.update",
    requestId: "req-site-update"
  });
});

it("does not schedule reconcile when repository mutation fails", async () => {
  const requestReconcile = vi.fn();
  const service = createAdminSiteService({
    publicCatalogReconciler: { requestReconcile, start: vi.fn(), stop: vi.fn() },
    repository: {
      getSite: vi.fn(async () => siteLifecycleRecord("Before")),
      updateSite: vi.fn(async () => {
        throw new Error("repository failed");
      })
    } as unknown as AdminSiteRepository
  });

  await expect(service.updateSite("site-1", { title: "After" }, adminMutationContext("req-fail"))).rejects.toThrow();
  expect(requestReconcile).not.toHaveBeenCalled();
});
```

Use the same pattern for `createAdminCategoryService` and `createSiteImageService` with their exact exported factory names.

- [ ] **Step 2: Run RED and expected failure**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-runtime-dirty-marking.test.ts tests/admin.site.service.test.ts
```

Expected RED: service factories do not accept `publicCatalogReconciler`, and no post-commit calls occur.

- [ ] **Step 3: Add optional reconciler to site service**

Change `createAdminSiteService` options:

```ts
export function createAdminSiteService(options: {
  now?: () => Date;
  publicCatalogReconciler?: Pick<PublicCatalogReconciler, "requestReconcile">;
  repository: AdminSiteRepository;
}): AdminSiteService {
```

Call after successful repository operations that can affect public projection:

```ts
async publishSite(id, context) {
  const record = await options.repository.publishSite(id, context);
  options.publicCatalogReconciler?.requestReconcile({
    reason: "site.publish",
    requestId: context.requestId
  });
  return mapAdminSiteDetail(record, context.actor.role);
}
```

Apply the same post-commit pattern to:

- `deleteSite` using reason `site.soft_delete`;
- `permanentlyDeleteSite` using reason `site.permanent_delete`;
- `publishSite` using reason `site.publish`;
- `restoreSite` using reason `site.restore`;
- `unpublishSite` using reason `site.unpublish`;
- `updateSite` using reason `site.update`.

Do not schedule after `createDraft` because draft create is not public projection.

- [ ] **Step 4: Add optional reconciler to category and image services**

For `createAdminCategoryService`, inject:

```ts
publicCatalogReconciler?: Pick<PublicCatalogReconciler, "requestReconcile">;
```

Schedule after `updateCategory` succeeds:

```ts
options.publicCatalogReconciler?.requestReconcile({
  reason: "category.update",
  requestId: context.requestId
});
```

For `createSiteImageService`, add the same optional dependency to `CreateSiteImageServiceOptions` and schedule after successful repository calls:

- preview `replacePreview`: `site.image.preview_replace`;
- preview `deletePreview`: `site.image.preview_delete`;
- gallery `addSingle` and batch attach: `site.image.gallery_add`;
- gallery `deleteImage`: `site.image.gallery_delete`;
- gallery `reorder`: `site.image.gallery_update`.

If tests show batch calls can schedule once per image, coalesce at service level by calling `requestReconcile` once after the batch completes.

- [ ] **Step 5: Wire services in server**

In `backend/src/server.ts`, pass `publicCatalogReconciler` into:

```ts
createAdminSiteService({ repository, publicCatalogReconciler })
createAdminCategoryService({ repository, publicCatalogReconciler })
createSiteImageService({ ..., publicCatalogReconciler })
```

Pass through `adminRouterOptions` only if routes need read-only status. Do not expose new public endpoints.

- [ ] **Step 6: Run GREEN focused tests**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-runtime-dirty-marking.test.ts tests/admin.site.service.test.ts tests/admin.site.routes.test.ts
```

Expected GREEN: dirty marking remains transactional, reconcile scheduling occurs only after successful service calls, and Cloud failure in the reconciler cannot fail the admin mutation response.

- [ ] **Step 7: Diff/scope check**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1
git diff -- backend/src/modules/admin/sites/site.service.ts backend/src/modules/admin/categories/category.service.ts backend/src/modules/admin/images/site-image.service.ts backend/src/server.ts backend/tests/public-runtime-dirty-marking.test.ts
```

Expected: no repository method calls `syncOnce`; services only enqueue reconciliation after awaited repository success.

Recommended future commit boundary: `feat: trigger catalog reconciliation after public mutations`.

## Task 5: Cloud Primary Browser Client

**Files:**

- Create: `assets/js/catalog-runtime.js`
- Modify: `assets/js/catalog-api.js`
- Modify: `assets/js/main.js`
- Test: `tests/frontend/catalog-resilience.test.mjs`
- Test: `tests/frontend/catalog-normalization.test.mjs`
- Test: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**

- Consumes: `validateConfig`, `getStaticCatalog`, `normalizeApiSite`, `saveLastKnownGoodCatalog`, `preservedCatalogState`, `resolveCatalogForPage`, `applyCatalogState`.
- Produces: `window.WEB00_CATALOG_RUNTIME.loadCatalogFromRuntime`, `validateRuntimeManifest`, `validateRuntimeSnapshot`, `sha256HexFromArrayBuffer`, and Cloud source state `{ source: "cloud", lifecycle: "ready", items }`.

- [ ] **Step 1: Write failing frontend runtime tests**

In `tests/frontend/catalog-resilience.test.mjs`, add:

```js
test("valid Cloud runtime manifest and snapshot replaces static without Render catalog GET", async () => {
  const snapshot = JSON.stringify({
    generatedAt: "2026-08-07T12:00:00.000Z",
    items: [apiSite("web00-smoke-create", "WEB00 Smoke Updated")],
    itemsCount: 1,
    revision: 6,
    schemaVersion: 1,
    settings: { showDemoInModal: false },
  }) + "\n";
  const sha256 = await sha256Hex(snapshot);
  const manifestUrl = "https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json";
  const snapshotUrl = `https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/releases/revision-6-${sha256}.json`;
  const fetchCalls = [];
  const fetch = createFakeFetch(async (url, init) => {
    fetchCalls.push(String(url));
    if (String(url).startsWith(manifestUrl)) {
      return jsonResponse({
        generatedAt: "2026-08-07T12:00:00.000Z",
        itemsCount: 1,
        revision: 6,
        schemaVersion: 1,
        sha256,
        snapshotPath: `runtime/production/catalog/v1/releases/revision-6-${sha256}.json`,
        snapshotUrl,
      });
    }
    if (String(url) === snapshotUrl) {
      return new Response(new TextEncoder().encode(snapshot), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        status: 200,
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  const { catalog } = await loadCatalog({
    fetch,
    config: {
      apiBaseUrl: "https://web00-backend-production.onrender.com",
      catalogManifestUrl: manifestUrl,
      catalogRuntimeMode: "cloud-primary",
      requestTimeoutMs: 1000,
      staticFallbackEnabled: true,
    },
  });

  const initial = catalog.getInitialCatalog();
  assert.equal(initial.source, "static");
  const resolved = await catalog.resolveCatalogForPage({ currentState: initial });
  assert.equal(resolved.source, "cloud");
  assert.equal(resolved.items[0].slug, "web00-smoke-create");
  assert.equal(fetchCalls.some((url) => url.includes("web00-backend-production.onrender.com/api/sites")), false);
});
```

Add rejection tests for SHA mismatch, revision mismatch, itemsCount mismatch, wrong snapshot origin, wrong prefix, malformed manifest, and Cloud timeout keeping current state.

- [ ] **Step 2: Run RED and expected failure**

Run:

```powershell
cd D:\WEB00_BACKEND
node --test tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-normalization.test.mjs tests/frontend/static-page-contract.test.mjs
```

Expected RED: `catalogManifestUrl`, `catalogRuntimeMode`, `window.WEB00_CATALOG_RUNTIME`, and Cloud source are missing.

- [ ] **Step 3: Create `assets/js/catalog-runtime.js`**

Expose only a browser global:

```js
(function () {
  const SCHEMA_VERSION = 1;
  const PRODUCTION_PREFIX = "runtime/production/catalog/v1/";
  const APPROVED_ORIGIN = "https://web00-public-runtime.s3-website.cloud.ru";

  async function loadCatalogFromRuntime(config, options = {}) {
    const manifest = await fetchManifest(config.catalogManifestUrl, options.signal);
    const snapshotBytes = await fetchSnapshotBytes(manifest.snapshotUrl, options.signal);
    const actualSha = await sha256HexFromArrayBuffer(snapshotBytes);
    if (actualSha !== manifest.sha256) throw runtimeError("WEB00_CLOUD_SHA_MISMATCH");
    const snapshot = parseSnapshot(snapshotBytes, manifest);
    return { manifest, snapshot };
  }

  window.WEB00_CATALOG_RUNTIME = Object.freeze({
    loadCatalogFromRuntime,
    sha256HexFromArrayBuffer,
    validateRuntimeManifest,
    validateRuntimeSnapshot
  });
})();
```

Validation rules:

- manifest `schemaVersion === 1`;
- `revision` positive safe integer;
- `itemsCount` non-negative safe integer;
- `sha256` lowercase 64 hex;
- `snapshotPath` exactly `runtime/production/catalog/v1/releases/revision-${revision}-${sha256}.json`;
- `snapshotUrl` is `https://web00-public-runtime.s3-website.cloud.ru/${snapshotPath}`;
- manifest fetch uses `cache: "no-store"`, `credentials: "omit"`, `redirect: "error"`, and nonce query;
- snapshot fetch reads `ArrayBuffer`;
- snapshot JSON is decoded only after SHA match.

- [ ] **Step 4: Integrate Cloud runtime into `catalog-api.js`**

Extend `CONFIG_DEFAULTS` and `validateConfig`:

```js
catalogManifestUrl: "",
catalogRuntimeMode: "static",
```

Config is valid for catalog runtime only when:

```js
catalogRuntimeMode === "cloud-primary" &&
catalogManifestUrl === "https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json"
```

Add:

```js
async function loadCloudRuntimeCatalog(options = {}) {
  const config = options.config || getConfig();
  if (config.catalogRuntimeMode !== "cloud-primary") {
    throw createCatalogError("WEB00_CLOUD_NOT_CONFIGURED");
  }
  const runtime = window.WEB00_CATALOG_RUNTIME;
  if (!runtime || typeof runtime.loadCatalogFromRuntime !== "function") {
    throw createCatalogError("WEB00_CLOUD_RUNTIME_UNAVAILABLE");
  }
  const result = await runtime.loadCatalogFromRuntime(config, { signal: options.signal });
  return catalogResultFromItems(normalizeApiItems(result.snapshot.items), "cloud");
}
```

Change `resolveCatalogForPage` for `kind === "solutions"`:

```js
const result = config.catalogRuntimeMode === "cloud-primary"
  ? await loadCloudRuntimeCatalog({ signal: request.signal, config })
  : await loadAllSites({ signal: request.signal, config });
```

Save LKG only after full Cloud verification:

```js
if (kind === "solutions" && (result.source === "cloud" || result.source === "api")) {
  saveLastKnownGoodCatalog(result.items);
}
```

When Cloud primary is configured, do not call `loadAllSites` as fallback for catalog display.

- [ ] **Step 5: Update `main.js` source handling**

In `applyCatalogState`, treat Cloud like API for rendering:

```js
if ((nextCatalogState.source === "cloud" || nextCatalogState.source === "api") &&
    nextCatalogState.lifecycle === "ready" &&
    hasCatalogItems(nextCatalogState)) {
  renderSolutions();
  return true;
}
```

Keep initial:

```js
catalogState = CATALOG.getInitialCatalog();
refreshCatalogInBackground();
```

This preserves first paint from static.

- [ ] **Step 6: Run GREEN frontend tests**

Run:

```powershell
cd D:\WEB00_BACKEND
node --test tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-normalization.test.mjs tests/frontend/static-page-contract.test.mjs
```

Expected GREEN: static first paint, valid Cloud replaces static, invalid Cloud keeps current visible state, stale LKG cannot override fresh Cloud/static, and no Render catalog GET in Cloud primary mode.

- [ ] **Step 7: Diff/scope check**

Run:

```powershell
cd D:\WEB00_BACKEND
git diff -- assets/js/catalog-runtime.js assets/js/catalog-api.js assets/js/main.js tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-normalization.test.mjs tests/frontend/static-page-contract.test.mjs
```

Expected: no backend edits in this task and no public secret values.

Recommended future commit boundary: `feat: load catalog from validated Cloud runtime`.

## Task 6: Public Runtime Config

**Files:**

- Modify: `assets/js/runtime-config.js`
- Modify: `assets/js/catalog-api.js`
- Modify: root HTML files that include frontend scripts if `assets/js/catalog-runtime.js` is new
- Test: `tests/frontend/static-page-contract.test.mjs`
- Test: `tests/frontend/catalog-resilience.test.mjs`

**Interfaces:**

- Consumes: `window.WEB00_CONFIG`, `validateConfig`, script order tests.
- Produces: `catalogRuntimeMode`, `catalogManifestUrl`, optional `catalogRuntimeTargetKey` if frontend LKG target scoping uses it.

- [ ] **Step 1: Write failing config tests**

In `tests/frontend/static-page-contract.test.mjs`, assert:

```js
test("frontend config separates Render API from Cloud catalog runtime", async () => {
  const runtimeConfig = await readFile("assets/js/runtime-config.js", "utf8");
  assert.match(runtimeConfig, /apiBaseUrl:\s*"https:\/\/web00-backend-production\.onrender\.com"/);
  assert.match(runtimeConfig, /catalogRuntimeMode:\s*"cloud-primary"/);
  assert.match(runtimeConfig, /catalogManifestUrl:\s*"https:\/\/web00-public-runtime\.s3-website\.cloud\.ru\/runtime\/production\/catalog\/v1\/manifest\.json"/);
  assert.doesNotMatch(runtimeConfig, /canary\/shadow/);
});
```

Add a fetch test in `catalog-resilience.test.mjs` that fails if any catalog request URL contains `web00-backend-production.onrender.com/api/sites`.

- [ ] **Step 2: Run RED and expected failure**

Run:

```powershell
cd D:\WEB00_BACKEND
node --test tests/frontend/static-page-contract.test.mjs tests/frontend/catalog-resilience.test.mjs
```

Expected RED: config keys do not exist and script order does not include `catalog-runtime.js`.

- [ ] **Step 3: Add explicit config keys**

Change `assets/js/runtime-config.js`:

```js
(function () {
  window.WEB00_CONFIG = Object.freeze({
    apiBaseUrl: "https://web00-backend-production.onrender.com",
    catalogManifestUrl: "https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json",
    catalogRuntimeMode: "cloud-primary",
    requestTimeoutMs: 8000,
    staticFallbackEnabled: true,
  });
})();
```

Do not repurpose `apiBaseUrl`; it remains available for unrelated backend features.

- [ ] **Step 4: Update script order only if a new runtime file is created**

In root public pages that load `assets/js/catalog-api.js`, insert:

```html
<script src="assets/js/catalog-runtime.js" defer></script>
```

before:

```html
<script src="assets/js/catalog-api.js" defer></script>
```

Update `tests/frontend/static-page-contract.test.mjs` to assert the order. Do not alter page content or UI.

- [ ] **Step 5: Run GREEN config tests**

Run:

```powershell
cd D:\WEB00_BACKEND
node --test tests/frontend/static-page-contract.test.mjs tests/frontend/catalog-resilience.test.mjs
```

Expected GREEN: config is explicit, production path is `runtime/production`, and no catalog display fetch goes to Render.

- [ ] **Step 6: Scope check**

Run:

```powershell
cd D:\WEB00_BACKEND
git diff -- assets/js/runtime-config.js index.html app.html status.html install.html cabinet.html tests/frontend/static-page-contract.test.mjs
```

Expected: only script order/config changes if needed; no `canary/shadow` in public config.

Recommended future commit boundary: `feat: configure Cloud primary catalog runtime`.

## Task 7: Service Worker Freshness

**Files:**

- Modify: `sw.js`
- Modify: `assets/js/main.js` only if controller update tests require no-loop guard adjustment
- Test: `tests/frontend/service-worker-catalog-cache.test.mjs`
- Test: `tests/frontend/service-worker-contract.test.mjs`

**Interfaces:**

- Consumes: `WEB00_CACHE`, `isRuntimeConfigRequest`, `isCatalogDataRequest`, `networkFirstCatalogData`, `registerServiceWorker`.
- Produces: `isCloudRuntimeManifestRequest` only if SW decides to explicitly network-only Cloud manifests; otherwise documents that cross-origin Cloud runtime is not intercepted.

- [ ] **Step 1: Write failing SW tests for Cloud manifest freshness**

In `tests/frontend/service-worker-catalog-cache.test.mjs`, add:

```js
test("service worker does not intercept cross-origin Cloud runtime manifest", async () => {
  const worker = await loadServiceWorker({
    fetchHandler: async () => jsonResponse({ marker: "fresh-cloud-manifest" }),
  });

  const manifestUrl = "https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json?v=fresh";
  const response = await worker.fetch(manifestUrl);

  assert.equal(await response.json().then((body) => body.marker), "fresh-cloud-manifest");
  assert.equal(worker.fetchCalls.length, 1);
  assert.equal(worker.operations.some((entry) => entry.type === "cache.match"), false);
});
```

Add a second test that simulates v6 to future SW controller update and confirms two separate genuine controller migrations can each reload once with no loop. Keep existing tests:

- `main.js registers service worker updates without HTTP cache and reloads once after controller migration`;
- `an existing marker from the previous completed migration does not block a later genuine controller change`;
- `main.js does not reload on first service worker install without an existing controller`.

- [ ] **Step 2: Run RED and expected failure**

Run:

```powershell
cd D:\WEB00_BACKEND
node --test tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/service-worker-contract.test.mjs
```

Expected RED only if current SW test harness treats cross-origin requests incorrectly or script order introduced `catalog-runtime.js` without cache rules.

- [ ] **Step 3: Keep or enforce non-interception for Cloud runtime**

Current SW already returns for cross-origin:

```js
if (url.origin !== self.location.origin) return;
```

Keep that invariant. If future changes add cross-origin handling, add an earlier return:

```js
if (url.origin === "https://web00-public-runtime.s3-website.cloud.ru") return;
```

Do not cache-first the mutable manifest. Do not add Cloud manifest to `SHELL_ASSETS`.

- [ ] **Step 4: Keep static fallback assets safe**

If `assets/js/catalog-runtime.js` is created, add it to `SHELL_ASSETS` only as a shell asset. Do not cache Cloud manifest or snapshots in SW.

Keep `networkFirstCatalogData` for same-origin `assets/js/data.js`:

```js
networkResponse = await fetch(request, { cache: "no-store" });
```

- [ ] **Step 5: Run GREEN SW tests**

Run:

```powershell
cd D:\WEB00_BACKEND
node --test tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/service-worker-contract.test.mjs
```

Expected GREEN: old SW cannot permanently pin Cloud manifest, static fallback remains usable, and no reload loop.

- [ ] **Step 6: Scope check**

Run:

```powershell
cd D:\WEB00_BACKEND
git diff -- sw.js assets/js/main.js tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/service-worker-contract.test.mjs
```

Expected: no unrelated shell caching changes.

Recommended future commit boundary: `fix: keep Cloud runtime manifest network fresh`.

## Task 8: Backend and Frontend Focused Test Closure

**Files:**

- Modify: `backend/tests/public-runtime-config.test.ts`
- Modify: `backend/tests/public-runtime-paths-snapshot.test.ts`
- Modify: `backend/tests/cloudru-public-runtime-storage.test.ts`
- Modify: `backend/tests/public-catalog-control.repository.test.ts`
- Modify: `backend/tests/public-catalog-sync.service.test.ts`
- Modify: `backend/tests/public-runtime-dirty-marking.test.ts`
- Modify: `backend/tests/public-runtime-shadow.wiring.test.ts`
- Modify: `backend/tests/public-catalog-reconciler.test.ts`
- Modify: `tests/frontend/catalog-resilience.test.mjs`
- Modify: `tests/frontend/catalog-normalization.test.mjs`
- Modify: `tests/frontend/service-worker-catalog-cache.test.mjs`
- Modify: `tests/frontend/service-worker-contract.test.mjs`
- Modify: `tests/frontend/static-page-contract.test.mjs`

**Interfaces:**

- Consumes: all interfaces produced by Tasks 1 through 7.
- Produces: focused regression suite proving the design invariants before full gates.

- [ ] **Step 1: Add backend invariant tests**

Ensure backend tests include exact cases:

```ts
it("target identity mismatch forces pending without storage writes", async () => {
  const storage = createStorage();
  const repository = createRepository({
    acquireLease: vi.fn().mockResolvedValue(null),
    readCurrentState: vi.fn().mockResolvedValue(control({
      desiredRevision: 4,
      publishedRevision: 4,
      publishedRuntimeTargetKey: shadowTargetKey(),
      syncStatus: "ready"
    }))
  });
  const service = createPublicCatalogSyncService({
    pathPrefix: "runtime/production",
    repository,
    storage,
    target: primaryTargetFixture()
  });

  const result = await service.syncOnce({ requestId: "req-target-mismatch" });

  expect(result.status).toBe("pending");
  expect(storage.operations).toEqual([]);
});
```

Also include:

- legacy `NULL` target is not ready;
- correct target ready has zero writes;
- finalize stores current target key;
- credential changes do not change target identity;
- prefix, bucket, public base URL, catalog path, and role changes do change target identity;
- startup pending reconciliation calls `syncOnce`;
- startup clean-ready no-op writes zero objects;
- single-flight and rapid trigger coalescing;
- failed publish bounded retry/backoff;
- stale lease safety;
- crash-before-manifest keeps previous manifest;
- dirty transaction independent from Cloud failure.

- [ ] **Step 2: Add frontend invariant tests**

Ensure frontend tests include:

```js
test("Cloud timeout keeps static catalog and resolves loading state", async () => {
  const never = () => new Promise(() => undefined);
  const { catalog } = await loadCatalog({
    fetch: never,
    data: freshSmokeStaticData(),
    config: {
      catalogManifestUrl: "https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json",
      catalogRuntimeMode: "cloud-primary",
      requestTimeoutMs: 1,
      staticFallbackEnabled: true,
    },
  });

  const initial = catalog.getInitialCatalog();
  const resolved = await catalog.resolveCatalogForPage({ currentState: initial });

  assert.equal(resolved.lifecycle, "ready");
  assert.equal(resolved.staticFallbackActive, true);
  assert.equal(resolved.items[0].slug, "web00-smoke-create");
});
```

Also include:

- static first paint;
- valid Cloud manifest/snapshot replaces static;
- exact SHA success;
- SHA mismatch rejection;
- revision mismatch rejection;
- itemsCount mismatch rejection;
- wrong snapshot origin rejection;
- wrong production prefix rejection;
- malformed manifest rejection;
- Cloud timeout/network failure keeps static;
- stale LKG never beats fresh valid Cloud;
- Render never requested for catalog;
- spinner resolves;
- service worker freshness.

- [ ] **Step 3: Run focused backend suite**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-runtime-config.test.ts tests/public-runtime-paths-snapshot.test.ts tests/cloudru-public-runtime-storage.test.ts tests/public-catalog-control.repository.test.ts tests/public-catalog-sync.service.test.ts tests/public-runtime-dirty-marking.test.ts tests/public-runtime-shadow.wiring.test.ts tests/public-catalog-reconciler.test.ts
```

Expected GREEN: all focused backend tests pass.

- [ ] **Step 4: Run focused frontend suite**

Run:

```powershell
cd D:\WEB00_BACKEND
node --test tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-normalization.test.mjs tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/service-worker-contract.test.mjs tests/frontend/static-page-contract.test.mjs
```

Expected GREEN: all focused frontend tests pass.

- [ ] **Step 5: Diff/scope check**

Run:

```powershell
cd D:\WEB00_BACKEND
git diff --stat
git diff --check
```

Expected: no backend/runtime-config/catalog-card changes outside planned files and no whitespace errors.

Recommended future commit boundary: `test: cover Cloud primary catalog runtime`.

## Task 9: Node 22 Verification Gates

**Files:**

- No product source files.
- Verification artifacts only if the implementation task explicitly writes JSON results under `D:\WEB00_VERIFY_RESULTS`.

**Interfaces:**

- Consumes: complete implementation from Tasks 1 through 8.
- Produces: verification evidence for focused tests, Prisma, typecheck, build, diff check, secret scan, and Node22 differential.

- [ ] **Step 1: Verify Node 22 executable**

Run:

```powershell
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" --version
```

Expected:

```text
v22.23.1
```

- [ ] **Step 2: Run backend focused tests**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-runtime-config.test.ts tests/public-runtime-paths-snapshot.test.ts tests/cloudru-public-runtime-storage.test.ts tests/public-catalog-control.repository.test.ts tests/public-catalog-sync.service.test.ts tests/public-runtime-dirty-marking.test.ts tests/public-runtime-shadow.wiring.test.ts tests/public-catalog-reconciler.test.ts
```

Expected: zero failed focused backend tests.

- [ ] **Step 3: Run frontend focused tests**

Run:

```powershell
cd D:\WEB00_BACKEND
node --test tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-normalization.test.mjs tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/service-worker-contract.test.mjs tests/frontend/static-page-contract.test.mjs tests/frontend/pages-catalog-generator.test.mjs
```

Expected: zero failed focused frontend tests.

- [ ] **Step 4: Run toolchain**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
npm run prisma:validate
npm run prisma:format:check
npm run prisma:generate
npm run typecheck
npm run build
cd D:\WEB00_BACKEND
node scripts/build-pages-catalog.mjs
node scripts/build-pages-catalog.mjs --check
git diff --check
```

Expected: all exit 0.

- [ ] **Step 5: Run staged/diff secret scan**

Run a diff-only scan, not a filesystem secret file scan:

```powershell
cd D:\WEB00_BACKEND
git diff -- . ':!**/*.png' ':!**/*.jpg' ':!**/*.jpeg' ':!**/*.webp' | rg -n --pcre2 "(?i)(aws_access_key_id|secret_access_key|BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)"
```

Expected: no real secrets. Any test fixture env-key strings must be reviewed as fake values before claiming clean.

- [ ] **Step 6: Run full Node22 non-integration differential**

Run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run --exclude "tests/integration/**" --reporter=json --outputFile D:\WEB00_VERIFY_RESULTS\atomic-cloud-primary-node22.json
```

Compare mechanically against:

```text
D:\WEB00_VERIFY_RESULTS\baseline-node22-vitest.json
```

Required:

- block-only new failures = 0;
- changed baseline failure fingerprints = 0.

Do not claim PASS merely because the total failure count is equal.

- [ ] **Step 7: Verification report scope check**

Run:

```powershell
cd D:\WEB00_BACKEND
git status --short
git diff --stat
```

Expected: only planned files are modified; no commit, push, PR, deploy, migration apply, Render change, Supabase change, or Cloud.ru mutation is performed by verification.

Recommended future commit boundary: no code commit for this gate; attach evidence to the implementation branch report.

## Task 10: Safe Deployment Sequence

**Files:**

- Create or modify release notes only if owner requests a deployment runbook.
- No source changes in this task after implementation has passed gates.

**Interfaces:**

- Consumes: verified backend/schema/reconciler, frontend Cloud reader, service worker freshness, and production owner-assisted access.
- Produces: phased cutover evidence and rollback decision points.

- [ ] **Step 1: Phase A - deploy backend/schema/reconciler support while Pages still uses old behavior**

Actions:

- deploy backend code with the new forward-only migration available;
- do not enable public frontend Cloud primary reader yet;
- do not point Pages catalog display at Cloud primary yet.

Verify:

```text
backend health PASS
readiness PASS
public_catalog_control has published_runtime_target_key column
primary runtime feature is disabled or not yet used by public Pages
```

Rollback:

```text
rollback backend to previous Render build if startup/readiness fails
do not delete migration
leave public Pages static/API behavior unchanged
```

- [ ] **Step 2: Phase B - configure runtime/production target**

Actions:

- set backend production runtime target to `runtime/production`;
- keep shadow `canary/shadow` unchanged;
- keep credentials backend-only.

Verify:

```text
configured target key role=primary
configured prefix runtime/production
shadow target key remains canary/shadow
credentials absent from logs and public config
```

Rollback:

```text
disable primary runtime target flag
leave shadow diagnostics intact
```

- [ ] **Step 3: Phase C - publish first production runtime revision**

Actions:

- allow startup reconciler or approved maintenance recovery to publish `runtime/production`;
- do not publish from a Prisma transaction;
- do not delete old immutable releases.

Verify:

```text
DB target key equals configured primary target key
DB desiredRevision equals publishedRevision
manifest revision equals DB publishedRevision
snapshot revision equals manifest revision
itemsCount equals DB public projection count
calculated snapshot SHA equals manifest sha256
GitHub Pages browser CORS fetch returns HTTP 200
```

Rollback:

```text
point manifest back to a previously verified immutable snapshot
or disable frontend Cloud primary until production runtime verifies
```

- [ ] **Step 4: Phase D - deploy frontend Cloud-primary reader**

Actions:

- deploy Pages build with `catalogRuntimeMode: "cloud-primary"`;
- manifest URL is `https://web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json`;
- service worker freshness rules are included.

Verify:

```text
first paint uses bundled static data
Cloud runtime replaces static only after manifest and snapshot validation
DevTools Network shows no Render catalog GET for card display
stale LKG does not override fresh Cloud
```

Rollback:

```text
restore previous GitHub Pages build
Cloud runtime objects remain untouched
```

- [ ] **Step 5: Phase E - production acceptance**

Actions:

- run owner-assisted browser, mobile, Render sleep, Cloud failure, admin mutation, rapid mutation, and service worker update checks from Task 11.

Rollback:

```text
frontend rollback for reader issues
runtime manifest rollback for bad Cloud revision
backend rollback only for backend startup or reconciler defects
```

Recommended future commit boundary: no commit for deployment; deploy only after owner approval.

## Task 11: Production Acceptance

**Files:**

- No source files.
- Optional evidence report under `D:\WEB00_VERIFY_RESULTS` only if owner requests a saved acceptance artifact.

**Interfaces:**

- Consumes: deployed backend, configured primary runtime target, deployed Pages reader, owner browsers, DevTools, and approved production access.
- Produces: acceptance evidence that Atomic Cloud Primary solves Render sleep catalog visibility.

- [ ] **Step 1: Fresh desktop browser**

Use a new profile or cleared site data for the public GitHub Pages URL.

Expected:

```json
{
  "staticFirstPaintVisible": true,
  "cloudCatalogPromoted": true,
  "catalogEmpty": false,
  "spinnerHidden": true
}
```

- [ ] **Step 2: Fresh mobile browser**

Use owner mobile browser on public GitHub Pages URL.

Expected:

```json
{
  "cardsVisible": true,
  "currentProductionCardsVisible": true,
  "spinnerHidden": true,
  "layoutUsable": true
}
```

- [ ] **Step 3: Render awake**

Open public catalog while Render backend is awake.

Expected:

```json
{
  "catalogVisible": true,
  "renderCatalogGet": false,
  "cloudManifestGet": true,
  "cloudSnapshotGet": true
}
```

- [ ] **Step 4: Render sleeping/down**

Let Render sleep or block only Render requests in DevTools.

Expected:

```json
{
  "catalogVisible": true,
  "renderCatalogGet": false,
  "renderSleepDoesNotHideCards": true
}
```

- [ ] **Step 5: Cloud manifest available**

Fetch manifest and snapshot from browser DevTools.

Expected:

```json
{
  "manifestHttp": 200,
  "snapshotHttp": 200,
  "shaMatches": true,
  "revisionMatches": true,
  "itemsCountMatches": true
}
```

- [ ] **Step 6: Cloud unavailable simulation without mutating bucket**

Use DevTools request blocking for `web00-public-runtime.s3-website.cloud.ru/runtime/production/catalog/v1/manifest.json`.

Expected:

```json
{
  "staticFallbackVisible": true,
  "catalogEmpty": false,
  "spinnerHidden": true,
  "renderCatalogGet": false
}
```

- [ ] **Step 7: Admin edit creates automatic revision**

Edit a public card title or public projection field through Admin UI.

Expected:

```json
{
  "adminMutationHttp": 200,
  "desiredRevisionAdvanced": true,
  "publicationAutomatic": true,
  "newManifestRevision": true,
  "editedCardVisibleOnPages": true
}
```

- [ ] **Step 8: Admin create creates automatic revision**

Create and publish a synthetic owner-approved card.

Expected:

```json
{
  "adminMutationHttp": 200,
  "desiredRevisionAdvanced": true,
  "newCardVisibleOnPages": true,
  "renderCatalogGet": false
}
```

- [ ] **Step 9: Unpublish/delete creates automatic revision**

Unpublish or delete the synthetic card.

Expected:

```json
{
  "adminMutationHttp": 200,
  "desiredRevisionAdvanced": true,
  "removedCardAbsentOnPages": true,
  "cloudSnapshotItemsCountUpdated": true
}
```

- [ ] **Step 10: Rapid edits coalesce**

Apply several rapid public projection edits to the same synthetic card.

Expected:

```json
{
  "latestEditVisible": true,
  "intermediateRevisionLoss": false,
  "desiredRevisionEqualsPublishedRevisionAfterDrain": true,
  "duplicateCloudWritesUnbounded": false
}
```

- [ ] **Step 11: Verify DevTools Network**

Filter DevTools Network by:

```text
web00-backend-production.onrender.com/api/sites
web00-backend-production.onrender.com/api/categories
```

Expected:

```json
{
  "renderCatalogGet": false,
  "cloudManifestGet": true,
  "cloudSnapshotGet": true
}
```

- [ ] **Step 12: Verify exact SHA**

Use browser or local verification to compute snapshot SHA from exact bytes and compare to manifest.

Expected:

```json
{
  "manifestSha": "64 lowercase hex",
  "calculatedSha": "same 64 lowercase hex",
  "shaMatches": true
}
```

- [ ] **Step 13: Service worker update from prior deployed version**

Use a persistent profile that had the previous service worker, then load the new deployment.

Expected:

```json
{
  "controllerChangeReloads": 1,
  "reloadLoopDetected": false,
  "newCloudManifestFetched": true,
  "oldManifestPinned": false
}
```

Recommended future commit boundary: no commit for acceptance; report evidence only.

## Final Integrated Gate

After Tasks 1 through 8 are implemented and before any PR is created, run:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run tests/public-runtime-config.test.ts tests/public-runtime-paths-snapshot.test.ts tests/cloudru-public-runtime-storage.test.ts tests/public-catalog-control.repository.test.ts tests/public-catalog-sync.service.test.ts tests/public-runtime-dirty-marking.test.ts tests/public-runtime-shadow.wiring.test.ts tests/public-catalog-reconciler.test.ts
npm run prisma:validate
npm run prisma:format:check
npm run prisma:generate
npm run typecheck
npm run build
cd D:\WEB00_BACKEND
node --test tests/frontend/catalog-resilience.test.mjs tests/frontend/catalog-normalization.test.mjs tests/frontend/service-worker-catalog-cache.test.mjs tests/frontend/service-worker-contract.test.mjs tests/frontend/static-page-contract.test.mjs tests/frontend/pages-catalog-generator.test.mjs
node scripts/build-pages-catalog.mjs
node scripts/build-pages-catalog.mjs --check
git diff --check
```

Then run full Node22 non-integration differential and compare failure fingerprints:

```powershell
cd D:\WEB00_ATOMIC_BLOCK1\backend
& "D:\WEB00_TOOLS\node-v22.23.1-win-x64\node.exe" .\node_modules\vitest\vitest.mjs run --exclude "tests/integration/**" --reporter=json --outputFile D:\WEB00_VERIFY_RESULTS\atomic-cloud-primary-node22.json
```

Required:

- focused backend tests pass;
- focused frontend tests pass;
- Prisma validate/format/generate pass;
- typecheck pass;
- build pass;
- generator and generator check pass;
- `git diff --check` pass;
- diff-only secret scan has no real secrets;
- block-only new failures = 0;
- changed baseline failure fingerprints = 0.

## Self Review

- Every design requirement maps to a task: target identity in Task 1, target-aware runtime in Task 2, reconciler in Task 3, post-commit triggers in Task 4, Cloud browser client in Task 5, runtime config in Task 6, service worker freshness in Task 7, focused tests in Task 8, Node22 gates in Task 9, phased deployment in Task 10, production acceptance in Task 11.
- The plan avoids changing production code during this planning run.
- Render is not a public catalog read fallback; Cloud primary mode forbids `/api/sites` and `/api/categories` catalog display reads to `web00-backend-production.onrender.com`.
- Static first paint is preserved through `getInitialCatalog()` and `initCatalogState()`.
- Production prefix is `runtime/production`; shadow prefix remains `canary/shadow`; public config must not point to shadow.
- False-ready target identity bug is closed by `publishedRuntimeTargetKey` plus configured target key comparison.
- Automatic reconciliation occurs after successful admin operations, never inside a Prisma transaction.
- Cloud failure cannot roll back an already committed admin mutation because publication is scheduled after commit and failure is durable pending/failed state.
- Service worker cannot pin the mutable Cloud manifest because cross-origin Cloud runtime is not intercepted and the manifest is not added to shell cache.
- Every deployment phase has a rollback path.
- Public config contains no secrets and no write URLs.
- Scope is limited to Atomic Runtime, control state, reconciler, frontend catalog loader, runtime config, service worker correctness, focused tests, deployment gates, and acceptance evidence.
