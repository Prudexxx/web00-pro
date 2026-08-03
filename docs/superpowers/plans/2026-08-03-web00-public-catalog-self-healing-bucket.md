# WEB00 Public Catalog Self-Healing Bucket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first authenticated catalog sync automatically ensure the dedicated public JSON bucket exists and is compatible before uploading the immutable snapshot, without exposing production secrets locally and without changing dry-run behavior.

**Architecture:** Extract public catalog bucket administration into a focused manager module that owns the `web00-public-catalog` contract and Supabase bucket inspect/create logic. Keep snapshot object upload/fetch in `public-catalog-snapshot-storage.ts`, inject the bucket manager only into sync, and make the optional CLI reuse the same manager instead of duplicating compatibility behavior.

**Tech Stack:** TypeScript, Vitest, Express server composition, `@supabase/supabase-js`, existing `StorageConfig`, existing `AppError` and `AppLogger`.

## Global Constraints

- Repository: `D:\WEB00_BACKEND`.
- Branch: `feat/web00-backend-production`.
- Base HEAD: `b820c68f72cec8d6219d7eb6ee3a6a1ed27e9ff0`.
- Preserve the current reviewed public-catalog-storage diff and do not reset, stash, clean, or delete it.
- No force push.
- No production DB access.
- No local production secret retrieval.
- No production bucket CLI run from the local shell.
- No production API calls, dry-run, sync, deploy hook, or Render mutation.
- No frontend or PR #14 changes.
- No Prisma schema, migration, package-lock, dependency, `assets/**`, or `.github/**` changes.
- `StorageConfig.bucket` remains the image bucket `web00-catalog-images`.
- Image bucket MIME remains `image/webp` and `image/avif`.
- Public catalog bucket is `web00-public-catalog`, public `true`, allowed MIME `application/json`, file size limit `2097152`.
- Snapshot and manifest upload content type is exactly `application/json`.
- Bucket-ready is not required before commit or push; Render runtime sync creates or reuses the bucket.

---

## File Structure

- Create `backend/src/modules/public-catalog/public-catalog-storage-bucket.ts`: shared dedicated bucket constants, bucket manager interfaces, Supabase manager factory, compatibility checks, safe error mapping, and optional safe bucket diagnostics.
- Modify `backend/src/modules/public-catalog/public-catalog-snapshot-storage.ts`: import `PUBLIC_CATALOG_STORAGE_BUCKET` from the shared bucket module; keep object upload/fetch only.
- Modify `backend/src/modules/public-catalog/public-catalog-sync.service.ts`: add `bucketManager`, stage `bucket_ensure`, and call `ensureReady()` after `snapshot_build` and before `snapshot_upload`.
- Modify `backend/src/cli/public-catalog-storage-bootstrap.command.ts`: remove duplicated bucket config/compatibility code and reuse the shared manager/constant.
- Modify `backend/src/lib/logger.ts`: add bucket diagnostic operation names and `pathKind: "bucket"` if needed.
- Modify `backend/src/server.ts`: instantiate the shared manager and inject it into sync only.
- Add `backend/tests/public-catalog-storage-bucket.test.ts`: TDD coverage for manager inspect/create/reinspect/race/error/secret behavior.
- Modify `backend/tests/public-catalog-sync.service.test.ts`: stage-order, failure, coalesced-pass, and dry-run boundary coverage.
- Modify `backend/tests/public-catalog-storage-bootstrap.command.test.ts`: assert CLI behavior through the shared manager boundary.
- Modify existing focused tests only as required: `backend/tests/public-catalog-snapshot-storage.test.ts`, `backend/tests/public-catalog-snapshot.test.ts`, `backend/tests/cli.production-scripts.test.ts`, `backend/tests/server.test.ts`, `backend/tests/health.test.ts`.

---

### Task 1: Extract Shared Dedicated-Bucket Contract And Manager

**Files:**
- Create: `backend/src/modules/public-catalog/public-catalog-storage-bucket.ts`
- Test: `backend/tests/public-catalog-storage-bucket.test.ts`
- Modify later: `backend/src/modules/public-catalog/public-catalog-snapshot-storage.ts`

**Interfaces:**
- Produces:

```ts
export const PUBLIC_CATALOG_STORAGE_BUCKET = "web00-public-catalog";

export const PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG = {
  id: "web00-public-catalog",
  public: true,
  allowedMimeTypes: ["application/json"],
  fileSizeLimit: 2 * 1024 * 1024
} as const;

export interface PublicCatalogBucketInspection {
  exists: boolean;
  compatible: boolean;
}

export interface PublicCatalogStorageBucketManager {
  inspect(input: { requestId: string }): Promise<PublicCatalogBucketInspection>;
  ensureReady(input: { requestId: string }): Promise<{ status: "ready" | "created" }>;
}

export function createPublicCatalogStorageBucketManager(
  config: StorageConfig,
  options?: {
    client?: SupabaseStorageLike;
    logger?: Pick<AppLogger, "log">;
    now?: () => number;
  }
): PublicCatalogStorageBucketManager;
```

- Consumes: `StorageConfig.credentials.supabaseUrl`, `StorageConfig.credentials.serviceRoleKey`, existing `AppError`, existing `SupabaseStorageLike` shape.

- [ ] **Step 1: Write failing manager tests**

Create `backend/tests/public-catalog-storage-bucket.test.ts` with fakes that implement:

```ts
type BucketCall =
  | `getBucket:${string}`
  | `createBucket:${string}:${string}:${number}:${boolean}`;

function createStorageClient(script: Array<{ data: unknown; error: unknown }>) {
  const calls: BucketCall[] = [];
  const storage = {
    async createBucket(bucket: string, options: {
      allowedMimeTypes: string[];
      fileSizeLimit: number;
      public: boolean;
    }) {
      calls.push(
        `createBucket:${bucket}:${options.allowedMimeTypes.join(",")}:${options.fileSizeLimit}:${options.public}`
      );
      return script.shift() ?? { data: {}, error: null };
    },
    from() {
      throw new Error("object storage is not used by bucket manager");
    },
    async getBucket(bucket: string) {
      calls.push(`getBucket:${bucket}`);
      return script.shift() ?? { data: {}, error: null };
    }
  };
  return { calls, client: { storage } };
}
```

Add tests named:
- `inspects a compatible public catalog bucket and ensureReady skips creation`
- `creates an absent public catalog bucket with exact config then verifies it`
- `fails closed for an incompatible existing public catalog bucket`
- `treats a create conflict race as ready when reinspection is compatible`
- `fails unavailable when create fails and the bucket remains absent`
- `treats 401 and 403 inspect errors as storage unavailable`
- `treats malformed provider responses as storage unavailable`
- `marks image-only MIME configuration incompatible`
- `does not expose service-role keys or provider bodies through thrown errors or logs`

- [ ] **Step 2: Run RED manager tests**

Run:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-storage-bucket.test.ts
```

Expected RED: module import fails or `ensureReady`/manager functions are missing.

- [ ] **Step 3: Implement manager**

Implementation requirements:
- `inspect()` calls `storage.getBucket("web00-public-catalog")`.
- Explicit upstream `404` returns `{ exists: false, compatible: false }`.
- Upstream `401`, `403`, `500`, missing status, malformed error, missing `getBucket`, malformed response, and thrown SDK errors throw `PUBLIC_CATALOG_STORAGE_UNAVAILABLE`.
- Compatible bucket requires id/name equals `web00-public-catalog` when provider exposes one, `public === true` when exposed, file size limit at least `2097152` when exposed, and `allowed_mime_types` or `allowedMimeTypes` includes `application/json` when exposed.
- Existing image-only MIME arrays are incompatible.
- `ensureReady()` inspects, returns `ready` for compatible, throws configuration invalid for incompatible, creates exact config when absent, reinspects once, returns `created` only after compatible reinspection.
- If create returns any error, reinspection happens exactly once. Compatible reinspection returns `ready`; incompatible throws configuration invalid; absent or unavailable throws storage unavailable.
- Logger calls, if added, must be best-effort and must contain only `requestId`, `operation`, `upstreamStatus`, `durationMs`, `pathKind: "bucket"`.

- [ ] **Step 4: Run GREEN manager tests**

Run the same command. Expected: `tests/public-catalog-storage-bucket.test.ts` PASS with zero failures.

---

### Task 2: Keep Snapshot Storage On Dedicated Bucket Constant

**Files:**
- Modify: `backend/src/modules/public-catalog/public-catalog-snapshot-storage.ts`
- Modify: `backend/tests/public-catalog-snapshot-storage.test.ts`

**Interfaces:**
- Consumes: `PUBLIC_CATALOG_STORAGE_BUCKET` from `public-catalog-storage-bucket.ts`.
- Produces: object upload/fetch URLs that keep using `/storage/v1/object/web00-public-catalog/` and `/storage/v1/object/public/web00-public-catalog/`.

- [ ] **Step 1: Write/update failing snapshot storage tests**

In `backend/tests/public-catalog-snapshot-storage.test.ts`, assert:
- imported `PUBLIC_CATALOG_STORAGE_BUCKET` is `web00-public-catalog`;
- snapshot upload URL uses `/storage/v1/object/web00-public-catalog/public-catalog/v1/snapshots/revision-7.json`;
- manifest upload URL uses `/storage/v1/object/web00-public-catalog/public-catalog/v1/manifest.json`;
- public manifest URL uses `/storage/v1/object/public/web00-public-catalog/public-catalog/v1/manifest.json`;
- upload header `"content-type"` is exactly `"application/json"`;
- logger failures do not replace `PUBLIC_CATALOG_STORAGE_UNAVAILABLE`.

- [ ] **Step 2: Run RED/GREEN snapshot storage tests**

Run:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-snapshot-storage.test.ts
```

Expected after implementation: PASS.

- [ ] **Step 3: Remove local duplicate constant**

Delete `PUBLIC_CATALOG_STORAGE_BUCKET` from `public-catalog-snapshot-storage.ts` and import it from `public-catalog-storage-bucket.ts`.

---

### Task 3: Integrate `bucket_ensure` Into Sync

**Files:**
- Modify: `backend/src/modules/public-catalog/public-catalog-sync.service.ts`
- Modify: `backend/src/lib/logger.ts`
- Modify: `backend/tests/public-catalog-sync.service.test.ts`

**Interfaces:**
- Consumes: `Pick<PublicCatalogStorageBucketManager, "ensureReady">`.
- Produces: `PublicCatalogSyncServiceOptions.bucketManager`.
- Produces stage union value: `"bucket_ensure"`.

- [ ] **Step 1: Write RED sync tests**

In `backend/tests/public-catalog-sync.service.test.ts`:
- add `createBucketManager()` with `operations: string[]` and `ensureReady: vi.fn(async () => { operations.push("bucket_ensure"); return { status: "ready" as const }; })`;
- have `createStorage()` push operations into the same array when provided;
- update success operations to include `"bucket_ensure"` between snapshot build completion and snapshot upload;
- add test `ensures the bucket once before snapshot upload when it is already ready`;
- add test `continues upload when ensure creates the bucket`;
- add test `fails before object uploads when bucket ensure is unavailable`;
- add test `fails before object uploads when bucket ensure finds incompatible configuration`;
- add test `does not ensure bucket when snapshot build fails`;
- update coalesced sync pass to expect one `bucket_ensure` per publication pass.

Exact failure expectations:

```ts
expect(result).toMatchObject({
  errorCode: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE",
  status: "failed"
});
expect(storage.uploadJson).not.toHaveBeenCalled();
expect(repository.failLease).toHaveBeenCalledWith(expect.objectContaining({
  errorCode: "PUBLIC_CATALOG_STORAGE_UNAVAILABLE"
}));
```

- [ ] **Step 2: Run RED sync tests**

Run:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-sync.service.test.ts
```

Expected RED: `bucketManager` option and `bucket_ensure` stage missing.

- [ ] **Step 3: Implement sync integration**

Modify:

```ts
export interface PublicCatalogSyncServiceOptions {
  bucketManager: Pick<PublicCatalogStorageBucketManager, "ensureReady">;
  cleanup?: Pick<StorageCleanupRepository, "createJobs">;
  ...
}
```

Call after snapshot build:

```ts
await runPublicCatalogSyncStage(
  {
    logger: options.logger,
    requestId: input.requestId,
    revision: lease.revision,
    stage: "bucket_ensure"
  },
  () => options.bucketManager.ensureReady({ requestId: input.requestId })
);
```

Add `"bucket_ensure"` to `PublicCatalogSyncFailedStage`.

- [ ] **Step 4: Run GREEN sync tests**

Run the same command. Expected: PASS with zero failures.

---

### Task 4: Reuse Manager From CLI

**Files:**
- Modify: `backend/src/cli/public-catalog-storage-bootstrap.command.ts`
- Modify: `backend/tests/public-catalog-storage-bootstrap.command.test.ts`

**Interfaces:**
- Consumes: `PUBLIC_CATALOG_STORAGE_BUCKET`, `PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG`, and `PublicCatalogStorageBucketManager`.
- Produces: `runPublicCatalogStorageBootstrapCommand()` using the shared manager for inspect/create/reinspect.

- [ ] **Step 1: Write/update CLI RED tests**

Keep existing cases and adjust fakes to satisfy `PublicCatalogStorageBucketManager`:
- compatible manager: `inspect` returns exists/compatible, `ensureReady` not needed;
- absent manager: command prints plan, requires confirmation, calls `ensureReady`, emits `public_catalog_bucket_created` then `public_catalog_bucket_ready`;
- incompatible inspect throws/returns config invalid safely;
- wrong confirmation does not call `ensureReady`;
- provider error returns safe output without body/secret.

- [ ] **Step 2: Run RED CLI tests**

Run:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-storage-bootstrap.command.test.ts tests/cli.production-scripts.test.ts
```

Expected RED: CLI still exposes duplicate bootstrap storage interfaces.

- [ ] **Step 3: Implement CLI reuse**

Remove duplicated bucket config/compatibility helpers from the CLI. Keep `safeErrorOutput`, terminal prompts, and output codes. Use the shared manager factory by default.

- [ ] **Step 4: Run GREEN CLI tests**

Run the same command. Expected: PASS.

---

### Task 5: Server Composition And Dry-Run Boundary

**Files:**
- Modify: `backend/src/server.ts`
- Modify: `backend/tests/server.test.ts`
- Modify only if needed: `backend/tests/health.test.ts`

**Interfaces:**
- Consumes: `createPublicCatalogStorageBucketManager(storageConfig, { logger })`.
- Produces: sync service wired with `bucketManager`.
- Dry-run constructor/options remain unchanged and do not accept a bucket manager.

- [ ] **Step 1: Write RED server composition tests**

In `backend/tests/server.test.ts`, add source-composition assertions:

```ts
expect(serverSource).toContain("createPublicCatalogStorageBucketManager");
expect(serverSource).toContain("bucketManager: publicCatalogStorageBucketManager");
expect(serverSource).not.toContain("createPublicCatalogDryRunService({\\n    bucketManager");
expect(serverSource).not.toContain("ensureReady({ requestId:");
```

Keep startup test using mocks to prove `startServer()` does not call bucket control-plane code during listener bootstrap.

- [ ] **Step 2: Run RED server tests**

Run:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/server.test.ts tests/health.test.ts
```

Expected RED: manager not imported/wired.

- [ ] **Step 3: Implement server wiring**

Instantiate:

```ts
const publicCatalogStorageBucketManager = createPublicCatalogStorageBucketManager(
  options.storageConfig,
  { logger }
);
```

Pass it only to `createPublicCatalogSyncService`.

- [ ] **Step 4: Run GREEN server tests**

Run the same command. Expected: PASS.

---

### Task 6: Verification, Review, Commit, And Push

**Files:**
- Include all changed source/test/plan files from Tasks 1-5.
- Do not include forbidden files.

**Interfaces:**
- Produces one commit: `fix: self-heal public catalog storage bucket`.
- Produces normal push to `origin feat/web00-backend-production:feat/web00-backend-production`.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-storage-bucket.test.ts tests/public-catalog-snapshot-storage.test.ts tests/public-catalog-storage-bootstrap.command.test.ts tests/public-catalog-sync.service.test.ts tests/public-catalog-snapshot.test.ts tests/cli.production-scripts.test.ts tests/server.test.ts tests/health.test.ts
```

Expected: all focused files PASS, zero failures.

- [ ] **Step 2: Run full check**

Run:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run check
```

Expected: Prisma validate PASS, Prisma format PASS, Prisma generate PASS, typecheck PASS, all tests PASS, build PASS, zero failures.

- [ ] **Step 3: Run scope gate**

Run:

```powershell
Set-Location D:\WEB00_BACKEND
git diff --check
git status --short
git diff --name-only
git diff -- backend/prisma/schema.prisma backend/prisma/migrations backend/package-lock.json assets .github
```

Expected: no whitespace errors, only approved paths, no forbidden diffs.

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review` with review range `b820c68f72cec8d6219d7eb6ee3a6a1ed27e9ff0..HEAD` plus working-tree diff if not yet committed. Review specifically the bucket manager, sync ordering, CLI reuse, startup/dry-run boundary, safe diagnostics, image bucket contract, and absence of production actions.

- [ ] **Step 5: Fix Critical/Important findings**

For each Critical/Important finding, write a failing test first, run it RED, implement the smallest fix, rerun focused tests, then rerun full `npm run check`.

- [ ] **Step 6: Stage exact files**

Run:

```powershell
Set-Location D:\WEB00_BACKEND
git add -- docs/superpowers/plans/2026-08-03-web00-public-catalog-self-healing-bucket.md backend/package.json backend/src/cli/public-catalog-storage-bootstrap.command.ts backend/src/lib/logger.ts backend/src/modules/public-catalog/public-catalog-storage-bucket.ts backend/src/modules/public-catalog/public-catalog-snapshot-storage.ts backend/src/modules/public-catalog/public-catalog-sync.service.ts backend/src/server.ts backend/tests/cli.production-scripts.test.ts backend/tests/public-catalog-snapshot-storage.test.ts backend/tests/public-catalog-snapshot.test.ts backend/tests/public-catalog-storage-bootstrap.command.test.ts backend/tests/public-catalog-storage-bucket.test.ts backend/tests/public-catalog-sync.service.test.ts backend/tests/server.test.ts
git diff --cached --name-only
git diff --cached --check
```

Expected: staged files are exactly approved source/test/plan/script files; no `.env`, Prisma, migrations, frontend, package-lock, `assets`, `.github`.

- [ ] **Step 7: Commit**

Run:

```powershell
git commit -m "fix: self-heal public catalog storage bucket"
git rev-parse HEAD
git status --short
```

Expected: one new commit, working tree clean.

- [ ] **Step 8: Push**

Run:

```powershell
git fetch origin --prune
git push origin feat/web00-backend-production:feat/web00-backend-production
git rev-parse HEAD
git rev-parse origin/feat/web00-backend-production
git ls-remote origin refs/heads/feat/web00-backend-production
```

Expected: non-force push succeeds and all reported SHAs match the new commit.

---

## Self-Review

**Spec coverage:** The plan covers the shared manager, inspect/ensure behavior, explicit 404 handling, unauthorized handling, incompatible fail-closed behavior, create race, sync stage order, dry-run/startup boundaries, CLI reuse, safe diagnostics, focused/full tests, code review, commit, and normal push. It keeps production bucket creation out of the local shell.

**Placeholder scan:** The plan contains no TBD, TODO, “implement later”, or unspecified “write tests” steps. Every task names files, interfaces, commands, and pass/fail criteria.

**Type consistency:** `PUBLIC_CATALOG_STORAGE_BUCKET`, `PUBLIC_CATALOG_STORAGE_BUCKET_CONFIG`, `PublicCatalogBucketInspection`, `PublicCatalogStorageBucketManager`, `createPublicCatalogStorageBucketManager`, and `bucket_ensure` are named consistently across producer and consumer tasks.
