# WEB00 AP0 Snapshot Dry-Run and Exact RCA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox syntax.

**Goal:** Реализовать полностью read-only production-equivalent dry-run,
который использует тот же pre-storage projection/build path, что и sync,
но не получает lease, не изменяет DB/Storage и возвращает точные безопасные
blockers текущего snapshot_build failure.

**Architecture:** AP0 keeps the current sync orchestration and extracts only a pure pre-storage preparation function shared by sync and dry-run. Dry-run opens one PostgreSQL `REPEATABLE READ` transaction, sets it to `READ ONLY` before any repository query, creates a transaction-scoped read repository inside that callback, and returns safe metadata or deterministic blockers. The admin route and maintenance UI add a guarded read-only RCA action without changing sync, schema, migrations, dependencies, production data, Storage, or PR #14.

**Tech Stack:** Node.js 22.23.1, TypeScript, Express 5, Prisma 7 generated client, @prisma/adapter-pg, PostgreSQL, Vitest, Supertest, existing admin DOM test harness.

## Global Constraints

- No database mutations by AP0 dry-run.
- PostgreSQL transaction must run `READ ONLY`.
- PostgreSQL transaction isolation must be `REPEATABLE READ`.
- No Storage dependency in `createPublicCatalogDryRunService`.
- No Storage method call in dry-run route, service, repository, or preparation.
- No lease acquire, renew, fail, finalize, or release in dry-run.
- No `desiredRevision` increment.
- No `syncStatus` change.
- No audit DB write.
- No storage cleanup job creation or execution.
- No production sync.
- No new dependency.
- No schema or migration.
- No PR #14 change.
- No secret, raw payload, full URL, provider response, stack, request body, or snapshot body logging.
- Current sync behavior and current sync API result contract must remain unchanged.
- Maximum 100 returned blockers.
- Full snapshot bytes and full snapshot object are never returned to admin, browser, logs, or public dry-run response.
- Existing sync stages remain: `lease`, `settings`, `projection`, `snapshot_build`, `snapshot_upload`, `snapshot_verify`, `manifest_upload`, `manifest_verify`, `db_finalize`.
- Dry-run stages are: `control_load`, `settings_load`, `projection_load`, `item_map`, `item_validate`, `catalog_validate`, `serialize`, `size_validate`, `hash`, `final_parse_validate`.

## Verified Repository Contracts

- Production Prisma namespace/type imports use generated client paths such as `../../generated/prisma/client.js` from `backend/src/modules/public-catalog`.
- Integration tests import generated Prisma from `../../src/generated/prisma/client.js`.
- Prisma clients are created through `createPrismaClient(...)` from `../../src/db/prisma.js` in tests.
- Test DB environment uses `parseTestDatabaseEnv(...)` and `assertTestDatabaseUrl(...)` from `../../src/config/database-env.js`.
- Additional AP0 integration guard lives only in `backend/tests` and requires host `127.0.0.1`, port `5433`, database `web00_backend_test`.
- Existing public catalog Storage interface methods are `uploadJson`, `fetchText`, and `getPublicUrl`.
- Existing admin route tests define `createApp`, `createPublicCatalogService`, `adminPrincipal`, and `editorPrincipal` in `backend/tests/admin-public-catalog.routes.test.ts`.
- Existing admin UI tests use `click`, `createFakeDocument`, `setValue`, and `waitFor` from `backend/tests/helpers/admin-ui-wave5-dom.mjs`.
- Existing `createMaintenanceScreen` calls use `{ apiClient, documentRef, onStatus: vi.fn(), role: "admin" }`.
- Existing integration `createAdminApp()` in `backend/tests/integration/admin-api.test.ts` currently passes public catalog only to `createApp(...)`; AP0 integration tests must wire `publicCatalogService` into `createAdminRouter(...)` for admin public catalog routes.

## Worktree Precondition Before Implementation

AP0 implementation must not start from a separate worktree at `a90e86f70a4c7dd035f712432bb74db1f574a804` while the design and plan documents are untracked in the canonical checkout.

- [ ] Owner reviews this amended plan.
- [ ] Owner gives separate authorization for a local docs-only commit.
- [ ] The docs-only commit contains only `docs/WEB00_ATOMIC_PUBLICATION_DESIGN_V1.md` and `docs/superpowers/plans/2026-08-02-web00-ap0-dry-run-rca.md`.
- [ ] No push is performed for the docs-only commit unless separately authorized.
- [ ] AP0 feature worktree is created from that local docs commit.
- [ ] AP0 implementation happens only in the AP0 feature worktree.
- [ ] Canonical production worktree remains clean.

Do not perform this docs-only commit as part of this plan amendment task.

## File Mapping

### Existing Source Files

- `backend/src/modules/public-catalog/public-catalog-control.repository.ts`
  - Export a pure in-memory default control state helper currently represented by private `defaultControlState`.
  - Add `resolvePublicCatalogAnalysisRevision(state): number`.
  - Optionally share exact target-revision calculation with `acquirePublicCatalogLeaseState` only when regression tests prove behavior is unchanged.
  - Add transaction-scoped dry-run repository factory only if keeping it beside existing control logic is clearer than a new repository file.
- `backend/src/modules/public-catalog/public-catalog-readonly-transaction.ts`
  - New production helper for interactive `REPEATABLE READ` transaction and first-operation `SET TRANSACTION READ ONLY`.
  - Exports only `PublicCatalogReadOnlyTx` and `withPublicCatalogReadOnlyTransaction<T>(...)`.
- `backend/src/modules/public-catalog/public-catalog-dry-run.types.ts`
  - New dry-run result, stage, blocker, reason code, and safe internal error types.
- `backend/src/modules/public-catalog/public-catalog-dry-run.diagnostics.ts`
  - New deterministic blocker creation, sorting, truncation, and safe internal error classification helpers.
- `backend/src/modules/public-catalog/public-catalog-snapshot-preparation.ts`
  - New pure shared preparation function. It accepts records/settings/revision/generatedAt/image policy and returns an internal ready/blocked result.
- `backend/src/modules/public-catalog/public-catalog-dry-run.repository.ts`
  - New repository factory bound to `PublicCatalogReadOnlyTx`, with `readControlState`, `readSettings`, and `listSnapshotSites`.
- `backend/src/modules/public-catalog/public-catalog-dry-run.service.ts`
  - New singleton service with active-run guard, read-only transaction orchestration, safe logging, and public dry-run result mapping.
- `backend/src/modules/public-catalog/public-catalog-sync.service.ts`
  - Preserve current stages. Replace only the in-stage snapshot build internals with the shared pure preparation function.
- `backend/src/modules/public-catalog/public-catalog.snapshot.ts`
  - Export existing stable serialization or validation internals only if the pure preparation function needs them; do not change snapshot schema.
- `backend/src/modules/public-catalog/public-catalog.mapper.ts`
  - Keep `mapSiteToPublicCatalogItem` as the production mapper used by both sync and dry-run.
- `backend/src/modules/public-catalog/public-catalog.types.ts`
  - Reuse existing `PublicSiteRecord`, `PublicSiteDetail`, and image types.
- `backend/src/modules/admin/public-catalog/public-catalog-admin.schemas.ts`
  - Add exact dry-run confirmation parser and constant.
- `backend/src/modules/admin/public-catalog/public-catalog-admin.service.ts`
  - Add `dryRun(context)` delegation to singleton dry-run service.
- `backend/src/modules/admin/public-catalog/public-catalog-admin.controller.ts`
  - Add dry-run controller method and safe response.
- `backend/src/modules/admin/public-catalog/public-catalog-admin.routes.ts`
  - Add Express route `POST /public-catalog/dry-run` behind `maintenance.publicCatalog`.
- `backend/src/modules/admin/admin.routes.ts`
  - No behavior change expected; ensure the existing public catalog router receives the expanded service.
- `backend/src/admin/assets/screens/maintenance.js`
  - Add dry-run UI button, exact confirmation, busy state, timeout, and safe result rendering.
- `backend/src/lib/errors.ts`
  - Add `PUBLIC_CATALOG_DRY_RUN_FAILED` and `PUBLIC_CATALOG_DRY_RUN_IN_PROGRESS`.
- `backend/src/lib/logger.ts`
  - Add safe dry-run completed and failed event types.
- `backend/src/server.ts`
  - Compose singleton dry-run service once and pass it to admin public catalog service.
- `backend/package.json`
  - Inspect scripts only. Do not change scripts, dependencies, or devDependencies.
- `backend/prisma/schema.prisma`
  - Inspect only. Do not edit.
- `backend/prisma/migrations`
  - Inspect only. Do not create or edit migrations.

### Existing Tests to Extend

- `backend/tests/public-catalog-sync.service.test.ts`
  - Prove sync stages and Storage calls remain.
- `backend/tests/public-catalog-snapshot.test.ts`
  - Keep current snapshot behavior and add pure preparation equivalence assertions if it is the best local fit.
- `backend/tests/admin-public-catalog.routes.test.ts`
  - Extend existing `createPublicCatalogService` fixture with `dryRun`.
- `backend/tests/admin-ui.maintenance.test.mjs`
  - Use current fake DOM helpers and `documentRef` contract.
- `backend/tests/integration/admin-api.test.ts`
  - Add test-only public catalog admin route wiring and fixture-scoped mutation-proof checks.
- `backend/tests/integration/prisma-migration.test.ts`
  - Keep migration contract; assert AP0 does not add schema/migration changes when needed.
- `backend/tests/health.test.ts`
  - Ensure health/readiness/version behavior is unaffected.

### New Tests to Create

- `backend/tests/integration/public-catalog-readonly-transaction.test.ts`
  - Real PostgreSQL read-only enforcement and strict local test DB guard.
- `backend/tests/public-catalog-dry-run.diagnostics.test.ts`
  - Safe internal errors, blockers, ordering, truncation, and secret stripping.
- `backend/tests/public-catalog-snapshot-preparation.test.ts`
  - Pure preparation ready/blocked behavior and sync/dry-run equivalence.
- `backend/tests/public-catalog-dry-run.repository.test.ts`
  - Read repository uses only read-only transaction delegates and resolves default control state without writing.
- `backend/tests/public-catalog-dry-run.service.test.ts`
  - Singleton guard, transaction-scoped repository factory, public result sanitization, and no Storage dependency.

## Shared Type Contracts

### Read-Only Transaction

`backend/src/modules/public-catalog/public-catalog-readonly-transaction.ts`:

```ts
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { PublicSiteRecord } from "./public-catalog.types.js";

export interface PublicCatalogControlReadRow {
  currentItemsCount: number | null;
  currentSnapshotChecksum: string | null;
  currentSnapshotPath: string | null;
  desiredRevision: number;
  id: string;
  lastSyncErrorCode: string | null;
  lastSyncRequestId: string | null;
  publishedRevision: number;
  showDemoInModal: boolean;
  syncLeaseExpiresAt: Date | null;
  syncLeaseId: string | null;
  syncStatus: string;
}

export interface PublicCatalogControlReadDelegate {
  findUnique(args: {
    select: {
      currentItemsCount: true;
      currentSnapshotChecksum: true;
      currentSnapshotPath: true;
      desiredRevision: true;
      id: true;
      lastSyncErrorCode: true;
      lastSyncRequestId: true;
      publishedRevision: true;
      showDemoInModal: true;
      syncLeaseExpiresAt: true;
      syncLeaseId: true;
      syncStatus: true;
    };
    where: { id: string };
  }): Promise<PublicCatalogControlReadRow | null>;
}

export interface SiteReadDelegate {
  findMany(args: {
    orderBy: Prisma.SiteOrderByWithRelationInput | Prisma.SiteOrderByWithRelationInput[];
    select: typeof import("./public-catalog.repository.js").publicSiteSelect;
    where: Prisma.SiteWhereInput;
  }): Promise<PublicSiteRecord[]>;
}

export interface PublicCatalogReadOnlyTx {
  publicCatalogControl: PublicCatalogControlReadDelegate;
  site: SiteReadDelegate;
}

export async function withPublicCatalogReadOnlyTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: PublicCatalogReadOnlyTx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const readOnlyTx: PublicCatalogReadOnlyTx = {
        publicCatalogControl: {
          findUnique: (args) => tx.publicCatalogControl.findUnique(args)
        },
        site: {
          findMany: (args) => tx.site.findMany(args)
        }
      };
      return operation(readOnlyTx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}
```

The exported `PublicCatalogReadOnlyTx` must not expose `$executeRaw`, `$executeRawUnsafe`, full Prisma model delegates, `create`, `createMany`, `update`, `updateMany`, `upsert`, `delete`, or `deleteMany`.

### Control State and Revision

`backend/src/modules/public-catalog/public-catalog-control.repository.ts`:

```ts
export function createDefaultPublicCatalogControlState(): PublicCatalogControlState {
  return validatePublicCatalogControlState({
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotPath: null,
    desiredRevision: 1,
    id: PUBLIC_CATALOG_CONTROL_ID,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 0,
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "pending"
  });
}

export function resolvePublicCatalogAnalysisRevision(
  state: PublicCatalogControlState
): number {
  validatePublicCatalogControlState(state);

  const revision =
    state.desiredRevision > state.publishedRevision
      ? Math.min(state.publishedRevision + 1, state.desiredRevision)
      : state.desiredRevision;

  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Invalid public catalog analysis revision.");
  }

  return revision;
}
```

### Pure Preparation Input and Result

`backend/src/modules/public-catalog/public-catalog-snapshot-preparation.ts`:

```ts
import type { ManagedImageUrlPolicy } from "../images/image.types.js";
import type {
  BuiltPublicCatalogSnapshot,
  PublicCatalogSnapshotSettings
} from "./public-catalog.snapshot.js";
import type { PublicSiteRecord } from "./public-catalog.types.js";
import type { PublicCatalogDryRunBlocker } from "./public-catalog-dry-run.types.js";

export interface PublicCatalogSnapshotPreparationInput {
  generatedAt: Date;
  imageUrlPolicy?: ManagedImageUrlPolicy;
  records: PublicSiteRecord[];
  revision: number;
  settings: PublicCatalogSnapshotSettings;
}

export interface PublicCatalogSnapshotPreparationReady {
  status: "ready";
  built: BuiltPublicCatalogSnapshot;
  byteLength: number;
  itemsCount: number;
  revision: number;
}

export interface PublicCatalogSnapshotPreparationBlocked {
  status: "blocked";
  blockers: PublicCatalogDryRunBlocker[];
  blockersTruncated: boolean;
  byteLength: null;
  itemsCount: number;
  revision: number;
  sha256: null;
}

export type PublicCatalogSnapshotPreparationResult =
  | PublicCatalogSnapshotPreparationReady
  | PublicCatalogSnapshotPreparationBlocked;
```

This pure function must not accept repository, requestId, logger, duration, Prisma client, transaction, Storage, audit, cleanup, or lease dependencies.

### Public Dry-Run Result

`backend/src/modules/public-catalog/public-catalog-dry-run.types.ts`:

```ts
export type PublicCatalogDryRunStage =
  | "control_load"
  | "settings_load"
  | "projection_load"
  | "item_map"
  | "item_validate"
  | "catalog_validate"
  | "serialize"
  | "size_validate"
  | "hash"
  | "final_parse_validate";

export type PublicCatalogDryRunReasonCode =
  | "INVALID_GALLERY_JSON"
  | "INVALID_GALLERY_SHAPE"
  | "INVALID_REQUIRED_STRING"
  | "INVALID_OPTIONAL_FIELD"
  | "INVALID_URL"
  | "INVALID_URL_PROTOCOL"
  | "INVALID_URL_CREDENTIALS"
  | "INVALID_URL_FRAGMENT"
  | "INVALID_IMAGE_DESCRIPTOR"
  | "INVALID_IMAGE_VARIANTS"
  | "DUPLICATE_SLUG"
  | "INVALID_ITEMS_COUNT"
  | "SNAPSHOT_TOO_LARGE"
  | "SERIALIZATION_UNSUPPORTED_VALUE"
  | "FINAL_SCHEMA_INVALID"
  | "UNKNOWN_MAPPING_FAILURE";

export interface PublicCatalogDryRunBlocker {
  errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED";
  fieldPath: string | null;
  itemIndex: number | null;
  reasonCode: PublicCatalogDryRunReasonCode;
  siteId: string | null;
  slug: string | null;
  stage: PublicCatalogDryRunStage;
}

export interface PublicCatalogDryRunResult {
  blockers: PublicCatalogDryRunBlocker[];
  blockersTruncated: boolean;
  byteLength: number | null;
  durationMs: number;
  itemsCount: number;
  requestId: string;
  revision: number;
  sha256: string | null;
  status: "ready" | "blocked";
}
```

`PublicCatalogDryRunResult` is created only by the dry-run service. It adds `requestId` and `durationMs`; for ready results it copies `byteLength`, `itemsCount`, `revision`, and `built.sha256`; it never copies `built.bytes` or `built.snapshot`; for blocked results it returns `byteLength: null` and `sha256: null`.

## Diagnostic Algorithm

- Records are already in deterministic repository order.
- For each record, capture `itemIndex`, `siteId`, and a safe slug string before mapping.
- Run raw public-field shape checks before mapper invocation.
- Run `mapSiteToPublicCatalogItem(record, imageUrlPolicy)`.
- Run item-level validation on the mapped item.
- Convert known content/data issues into typed internal safe errors and then blockers.
- Continue to the next record after known data blockers.
- Do not classify arbitrary programming or system exceptions as blockers.
- Prisma errors, programming `TypeError`, unexpected invariant failures, and arbitrary mapper exceptions are safe system failures and become `PUBLIC_CATALOG_DRY_RUN_FAILED` HTTP 500.
- `UNKNOWN_MAPPING_FAILURE` is allowed only for a known record-attributed data-shape failure that has been explicitly classified safely.
- Field path and reason code must come from typed internal errors, Zod issues, or explicit validators. Do not derive them only by regex parsing an arbitrary raw exception message.
- Gallery JSONB string or wrong type becomes `INVALID_GALLERY_SHAPE`.
- Invalid gallery item object becomes `INVALID_IMAGE_DESCRIPTOR`.
- Invalid variants become `INVALID_IMAGE_VARIANTS`.
- Invalid supplied gallery or preview URL receives the exact URL reason code: `INVALID_URL`, `INVALID_URL_PROTOCOL`, `INVALID_URL_CREDENTIALS`, or `INVALID_URL_FRAGMENT`.
- Keep `INVALID_GALLERY_JSON` only for a real parsing step that can receive syntactically invalid serialized JSON.
- After successful item mapping, group by slug. Every duplicate group creates a `DUPLICATE_SLUG` blocker for every conflicting card with its `siteId`, `itemIndex`, and slug.
- Before stable serialization, run path-aware serialization preflight and report `SERIALIZATION_UNSUPPORTED_VALUE` for `undefined`, `BigInt`, `NaN`, `Infinity`, invalid object/array member, and invalid UTF-16 surrogate if this project contract rejects it.
- Final parse/schema validation runs over the exact produced bytes.
- `itemsCount` in blocked preparation result is the original projection record count.
- Build all blockers first, then deterministic sort by `itemIndex`, `fieldPath`, `reasonCode`, `siteId`, and `slug`.
- Apply the 100 blocker maximum only after full deterministic sort.
- Do not include raw invalid values, full URLs, credentials, provider responses, snapshot items, snapshot body, stack, request body, cookies, or tokens.

## Task 1: Read-Only Transaction Primitive and PostgreSQL Enforcement

Files:

- Create `backend/src/modules/public-catalog/public-catalog-readonly-transaction.ts`.
- Create `backend/tests/integration/public-catalog-readonly-transaction.test.ts`.
- Do not edit `backend/prisma/schema.prisma`.
- Do not create or edit migrations.

Interfaces:

- Consumes:
  - `Prisma`, `PrismaClient`, and `Prisma.TransactionClient` from generated client.
  - `createPrismaClient(...)` from `../../src/db/prisma.js` in tests.
  - `parseTestDatabaseEnv(...)`, `assertTestDatabaseUrl(...)`, and `parseDatabaseUrl(...)` from `../../src/config/database-env.js` in tests.
- Produces:
  - `PublicCatalogReadOnlyTx`
  - `withPublicCatalogReadOnlyTransaction<T>(prisma, operation): Promise<T>`
  - test-local `assertAp0StrictTestDatabaseUrl(databaseUrl): void`.

Steps:

- [ ] Add the RED integration test with these imports:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertTestDatabaseUrl,
  parseDatabaseUrl,
  parseTestDatabaseEnv
} from "../../src/config/database-env.js";
import { createPrismaClient } from "../../src/db/prisma.js";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.js";
import { PUBLIC_CATALOG_CONTROL_ID } from "../../src/modules/public-catalog/public-catalog-control.repository.js";
import {
  withPublicCatalogReadOnlyTransaction
} from "../../src/modules/public-catalog/public-catalog-readonly-transaction.js";
```

- [ ] Add the test-local strict DB guard:

```ts
function assertAp0StrictTestDatabaseUrl(databaseUrl: string): void {
  const parsed = parseDatabaseUrl(databaseUrl, "TEST_DATABASE_URL");
  if (
    parsed.host !== "127.0.0.1" ||
    parsed.port !== "5433" ||
    parsed.database !== "web00_backend_test"
  ) {
    throw new Error("AP0 local database guard rejected target.");
  }
}
```

- [ ] Add setup using only the project client factory:

```ts
let prisma: PrismaClient;

beforeAll(() => {
  const databaseEnv = parseTestDatabaseEnv(process.env);
  assertTestDatabaseUrl(databaseEnv);
  assertAp0StrictTestDatabaseUrl(databaseEnv.TEST_DATABASE_URL);
  prisma = createPrismaClient({
    databaseUrl: databaseEnv.TEST_DATABASE_URL
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

- [ ] Add the read-only enforcement test:

```ts
it("enforces PostgreSQL read-only mode before callback repository access", async () => {
  const before = await prisma.publicCatalogControl.findUnique({
    where: { id: PUBLIC_CATALOG_CONTROL_ID }
  });

  await expect(
    withPublicCatalogReadOnlyTransaction(prisma, async (tx) => {
      const fullTx = tx as unknown as Prisma.TransactionClient;
      const rows = await fullTx.$queryRawUnsafe<Array<{ transaction_read_only: string }>>(
        "SHOW transaction_read_only"
      );
      expect(rows[0]?.transaction_read_only).toBe("on");

      await fullTx.$executeRawUnsafe(
        "UPDATE public_catalog_control SET desired_revision = desired_revision WHERE false"
      );
    })
  ).rejects.toMatchObject({
    code: expect.stringMatching(/25006/)
  });

  const after = await prisma.publicCatalogControl.findUnique({
    where: { id: PUBLIC_CATALOG_CONTROL_ID }
  });
  expect(after).toEqual(before);
});
```

- [ ] Run RED:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/integration/public-catalog-readonly-transaction.test.ts
```

Expected RED: import fails because `public-catalog-readonly-transaction.ts` does not exist.

- [ ] Implement `withPublicCatalogReadOnlyTransaction` with an interactive transaction, `Prisma.TransactionIsolationLevel.RepeatableRead`, and `SET TRANSACTION READ ONLY` as the first application SQL operation.
- [ ] Narrow the callback argument to explicit delegates `publicCatalogControl.findUnique` and `site.findMany`.
- [ ] Ensure the exported read-only tx type has no `$executeRaw`, `$executeRawUnsafe`, full model delegate, or mutation method.
- [ ] Run GREEN:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/integration/public-catalog-readonly-transaction.test.ts
```

- [ ] Regression:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run typecheck
```

Review checkpoint:

- The strict host/port/database guard is test-only.
- The production module imports generated Prisma types, not package-level client types.
- The test bypass cast appears only in the integration test.
- The mutation proof uses no-op UPDATE against `public_catalog_control`, not a temporary table.
- No commit, push, deploy, sync, schema, or migration action occurs in this task.

## Task 2: Typed Diagnostics and Safe Internal Errors

Files:

- Create `backend/src/modules/public-catalog/public-catalog-dry-run.types.ts`.
- Create `backend/src/modules/public-catalog/public-catalog-dry-run.diagnostics.ts`.
- Create `backend/tests/public-catalog-dry-run.diagnostics.test.ts`.
- Modify `backend/src/lib/errors.ts`.
- Modify `backend/src/lib/logger.ts`.

Interfaces:

- Consumes existing `AppError`, `ErrorCode`, and `AppLogger` contracts.
- Produces dry-run stage/reason unions, safe internal data error classes, blocker helpers, sort/limit helper, and dry-run log entry types.

Steps:

- [ ] Write RED tests for safe ordering and truncation:

```ts
import { describe, expect, it } from "vitest";
import {
  createPublicCatalogDryRunBlocker,
  sortAndLimitPublicCatalogDryRunBlockers
} from "../src/modules/public-catalog/public-catalog-dry-run.diagnostics.js";

describe("public catalog dry-run diagnostics", () => {
  it("sorts all blockers before truncating to 100 safe entries", () => {
    const blockers = Array.from({ length: 105 }, (_unused, index) =>
      createPublicCatalogDryRunBlocker({
        errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED",
        fieldPath: index % 2 === 0 ? "previewImage.url" : "galleryImages[0].url",
        itemIndex: 104 - index,
        reasonCode: "INVALID_URL_CREDENTIALS",
        siteId: `site-${104 - index}`,
        slug: `slug-${104 - index}`,
        stage: "item_validate"
      })
    );

    const result = sortAndLimitPublicCatalogDryRunBlockers(blockers);

    expect(result.blockers).toHaveLength(100);
    expect(result.blockersTruncated).toBe(true);
    expect(result.blockers[0]).toMatchObject({
      itemIndex: 0,
      reasonCode: "INVALID_URL_CREDENTIALS",
      stage: "item_validate"
    });
    expect(JSON.stringify(result)).not.toMatch(/postgres:\/\/|service_role|token=|password|secret|user:pass/i);
  });
});
```

- [ ] Write RED tests that arbitrary system errors are not blockers:

```ts
import { AppError } from "../src/lib/errors.js";
import { mapUnexpectedPublicCatalogDryRunFailure } from "../src/modules/public-catalog/public-catalog-dry-run.diagnostics.js";

it("maps unexpected failures to safe AppError instead of blocker results", () => {
  const error = mapUnexpectedPublicCatalogDryRunFailure(
    new Error("raw provider response postgres://user:pass@host/db token=secret")
  );

  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({
    code: "PUBLIC_CATALOG_DRY_RUN_FAILED",
    statusCode: 500
  });
  expect(JSON.stringify(error)).not.toMatch(/provider response|user:pass|token=secret/i);
});
```

- [ ] Run RED:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-dry-run.diagnostics.test.ts
```

Expected RED: dry-run diagnostic modules and dry-run error codes do not exist.

- [ ] Implement type unions exactly as defined in this plan.
- [ ] Add safe internal data error constructors for known content failures with stage, item identity, field path, and reason code.
- [ ] Add deterministic sort and 100-entry truncation.
- [ ] Add `PUBLIC_CATALOG_DRY_RUN_FAILED` and `PUBLIC_CATALOG_DRY_RUN_IN_PROGRESS` to `ErrorCode`.
- [ ] Add safe logger entry types for `public_catalog_dry_run_completed` and `public_catalog_dry_run_failed`.
- [ ] Ensure unknown system failures can only become safe `AppError` failures, not HTTP 200 blocked results.
- [ ] Run GREEN:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-dry-run.diagnostics.test.ts
```

- [ ] Regression:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run typecheck
```

Review checkpoint:

- Known data blockers and system failures are separate.
- No raw values or secrets appear in blockers, logs, or safe errors.
- `UNKNOWN_MAPPING_FAILURE` is not used for arbitrary thrown exceptions.
- No commit, push, deploy, sync, schema, or migration action occurs in this task.

## Task 3: Pure Shared Preparation With Internal Ready/Blocked Result

Files:

- Create `backend/src/modules/public-catalog/public-catalog-snapshot-preparation.ts`.
- Create `backend/tests/public-catalog-snapshot-preparation.test.ts`.
- Modify `backend/src/modules/public-catalog/public-catalog-sync.service.ts`.
- Modify `backend/tests/public-catalog-sync.service.test.ts`.
- Modify `backend/tests/public-catalog-snapshot.test.ts` only for preparation regression assertions that naturally belong there.

Interfaces:

- Consumes `PublicSiteRecord[]`, `PublicCatalogSnapshotSettings`, `ManagedImageUrlPolicy`, `mapSiteToPublicCatalogItem`, `buildPublicCatalogSnapshot`, and dry-run diagnostic helpers.
- Produces `preparePublicCatalogSnapshotCandidate(input): Promise<PublicCatalogSnapshotPreparationResult>`.

Fixture definitions for this task:

```ts
function createProjectionRecord(overrides: Partial<PublicSiteRecord> = {}): PublicSiteRecord {
  return {
    category: { slug: "business", title: "Business" },
    deliveryLabel: "14 days",
    demoMode: false,
    demoUrl: null,
    developmentDays: 14,
    featured: false,
    features: ["CRM"],
    fullDescription: "Full description",
    galleryImages: [],
    id: "00000000-0000-4000-8000-000000000101",
    previewImageUrl: null,
    previewType: "image",
    priceAmountCents: 120000,
    priceLabel: "from 1200",
    publishedAt: new Date("2026-08-02T04:00:00.000Z"),
    shortDescription: "Short description",
    siteUrl: null,
    slug: "dom-dlya-busi",
    sortOrder: 1,
    tags: ["crm"],
    title: "Дом для Буси",
    ...overrides
  } satisfies PublicSiteRecord;
}

function createControlStateFixture(
  overrides: Partial<PublicCatalogControlState> = {}
): PublicCatalogControlState {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotPath: null,
    desiredRevision: 1,
    id: PUBLIC_CATALOG_CONTROL_ID,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 0,
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "pending",
    ...overrides
  };
}

function createStorageFixture(): PublicCatalogSnapshotStorage {
  return {
    fetchText: vi.fn(async () => ""),
    getPublicUrl: vi.fn(() => "https://example.test/public-catalog/v1/snapshots/revision-1.json"),
    uploadJson: vi.fn(async () => undefined)
  };
}

function createSyncRepositoryFixture(
  records: PublicSiteRecord[]
): PublicCatalogSyncRepository {
  return {
    acquireLease: vi.fn(async () => ({
      leaseId: "lease_1",
      revision: 1,
      state: createControlStateFixture()
    })),
    failLease: vi.fn(async () => createControlStateFixture({ syncStatus: "failed" })),
    finalizeLease: vi.fn(async () => createControlStateFixture({ publishedRevision: 1, syncStatus: "ready" })),
    listSnapshotSites: vi.fn(async () => records),
    readSettings: vi.fn(async () => ({ showDemoInModal: false }))
  };
}
```

Steps:

- [ ] Write RED test for ready pure preparation:

```ts
it("builds deterministic ready internal result from records and settings only", async () => {
  const result = await preparePublicCatalogSnapshotCandidate({
    generatedAt: new Date("2026-08-02T04:00:00.000Z"),
    records: [createProjectionRecord()],
    revision: 7,
    settings: { showDemoInModal: false }
  });

  expect(result.status).toBe("ready");
  if (result.status !== "ready") {
    throw new Error("Expected ready preparation result.");
  }
  expect(result).toMatchObject({
    byteLength: expect.any(Number),
    itemsCount: 1,
    revision: 7
  });
  expect(result.built.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.built.bytes).toContain("\"dom-dlya-busi\"");
});
```

- [ ] Write RED test for known data blocker:

```ts
it("returns safe duplicate slug blockers for each conflicting card", async () => {
  const result = await preparePublicCatalogSnapshotCandidate({
    generatedAt: new Date("2026-08-02T04:00:00.000Z"),
    records: [
      createProjectionRecord({ id: "00000000-0000-4000-8000-000000000201", slug: "duplicate" }),
      createProjectionRecord({ id: "00000000-0000-4000-8000-000000000202", slug: "duplicate" })
    ],
    revision: 8,
    settings: { showDemoInModal: false }
  });

  expect(result).toMatchObject({
    blockersTruncated: false,
    byteLength: null,
    itemsCount: 2,
    revision: 8,
    sha256: null,
    status: "blocked"
  });
  expect(result.status === "blocked" ? result.blockers : []).toEqual([
    expect.objectContaining({ reasonCode: "DUPLICATE_SLUG", siteId: "00000000-0000-4000-8000-000000000201" }),
    expect.objectContaining({ reasonCode: "DUPLICATE_SLUG", siteId: "00000000-0000-4000-8000-000000000202" })
  ]);
});
```

- [ ] Run RED:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-snapshot-preparation.test.ts tests/public-catalog-sync.service.test.ts tests/public-catalog-snapshot.test.ts
```

Expected RED: pure preparation module is missing.

- [ ] Implement the per-item diagnostic algorithm from this plan.
- [ ] Keep preparation pure: no repository, requestId, logger, duration, Prisma, Storage, audit, cleanup, or lease input.
- [ ] Keep `built.bytes` available only inside ready internal preparation result for sync.
- [ ] Preserve current sync stages by changing only the body inside sync stage `snapshot_build`.
- [ ] When preparation is blocked during sync, map it to the existing generic sync failure path, call `failLease` as current code does, and do not expose blockers in the sync result.
- [ ] Keep Storage paths, manifest behavior, and sync public result unchanged.
- [ ] Run GREEN:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-snapshot-preparation.test.ts tests/public-catalog-sync.service.test.ts tests/public-catalog-snapshot.test.ts
```

- [ ] Regression:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run typecheck
```

Review checkpoint:

- Sync reads settings under stage `settings`, projection under stage `projection`, and calls pure preparation under stage `snapshot_build`.
- Dry-run will use the same pure preparation function after its own read-only reads.
- Internal bytes remain available to sync and absent from public dry-run response.
- No commit, push, deploy, sync, schema, or migration action occurs in this task.

## Task 4: Transaction-Scoped Dry-Run Repository and Revision Resolution

Files:

- Create `backend/src/modules/public-catalog/public-catalog-dry-run.repository.ts`.
- Create `backend/tests/public-catalog-dry-run.repository.test.ts`.
- Modify `backend/src/modules/public-catalog/public-catalog-control.repository.ts`.
- Do not add test-only DB URL helpers to production modules.

Interfaces:

- Consumes `PublicCatalogReadOnlyTx`, `PUBLIC_CATALOG_CONTROL_ID`, `validatePublicCatalogControlState`, `createDefaultPublicCatalogControlState`, `resolvePublicCatalogAnalysisRevision`, `publicSiteSelect`, and existing site projection filters.
- Produces:
  - `PublicCatalogDryRunRepository`
  - `createPrismaPublicCatalogDryRunRepository({ tx }): PublicCatalogDryRunRepository`
  - `readControlState(): Promise<PublicCatalogControlState>`
  - `readSettings(): Promise<PublicCatalogSnapshotSettings>`
  - `listSnapshotSites(): Promise<PublicSiteRecord[]>`.

Fixture definitions:

```ts
function createReadOnlyTxFixture(input: {
  control?: Partial<PublicCatalogControlState> | null;
  records?: PublicSiteRecord[];
} = {}) {
  const control =
    input.control === null ? null : createControlStateFixture(input.control);
  const records = input.records ?? [createProjectionRecord()];
  return {
    publicCatalogControl: {
      findUnique: vi.fn(async () => control)
    },
    site: {
      findMany: vi.fn(async () => records)
    }
  } satisfies PublicCatalogReadOnlyTx;
}

function createControlStateFixture(
  overrides: Partial<PublicCatalogControlState> = {}
): PublicCatalogControlState {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotPath: null,
    desiredRevision: 1,
    id: PUBLIC_CATALOG_CONTROL_ID,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 0,
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "pending",
    ...overrides
  };
}
```

Steps:

- [ ] Write RED test for missing singleton in-memory default without writes:

```ts
it("returns validated in-memory default control state when singleton row is absent", async () => {
  const tx = createReadOnlyTxFixture({ control: null });
  const repository = createPrismaPublicCatalogDryRunRepository({ tx });

  const state = await repository.readControlState();

  expect(state).toMatchObject({
    desiredRevision: 1,
    id: PUBLIC_CATALOG_CONTROL_ID,
    publishedRevision: 0,
    syncStatus: "pending"
  });
  expect(tx.publicCatalogControl.findUnique).toHaveBeenCalledTimes(1);
});
```

- [ ] Write RED test for analysis revision rules:

```ts
it("resolves analysis revision without mutating desired revision", () => {
  expect(
    resolvePublicCatalogAnalysisRevision(
      createControlStateFixture({ desiredRevision: 9, publishedRevision: 7 })
    )
  ).toBe(8);
  expect(
    resolvePublicCatalogAnalysisRevision(
      createControlStateFixture({ desiredRevision: 7, publishedRevision: 7, syncStatus: "ready" })
    )
  ).toBe(7);
});
```

- [ ] Write RED test for read methods only:

```ts
it("exposes only readControlState, readSettings, and listSnapshotSites", () => {
  const repository = createPrismaPublicCatalogDryRunRepository({
    tx: createReadOnlyTxFixture()
  });

  expect(Object.keys(repository).sort()).toEqual([
    "listSnapshotSites",
    "readControlState",
    "readSettings"
  ]);
});
```

- [ ] Run RED:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-dry-run.repository.test.ts
```

Expected RED: repository and exported revision helper do not exist.

- [ ] Export `createDefaultPublicCatalogControlState()` and make existing private default state call it.
- [ ] Implement `resolvePublicCatalogAnalysisRevision(state)` with the exact rules above.
- [ ] Implement repository `readControlState()` with only `tx.publicCatalogControl.findUnique`; never call `ensurePublicCatalogControl` or `upsert`.
- [ ] Implement `readSettings()` from the loaded control state or a direct `findUnique` with no write fallback.
- [ ] Implement `listSnapshotSites()` with `tx.site.findMany` using existing production projection filter/order/select.
- [ ] Run GREEN:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-dry-run.repository.test.ts
```

- [ ] Regression:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run typecheck
```

Review checkpoint:

- Repository is transaction-scoped and receives only `PublicCatalogReadOnlyTx`.
- No repository method can access the main Prisma client.
- Missing singleton creates no DB row.
- No commit, push, deploy, sync, schema, or migration action occurs in this task.

## Task 5: Dry-Run Singleton Service and Concurrency Guard

Files:

- Create `backend/src/modules/public-catalog/public-catalog-dry-run.service.ts`.
- Create `backend/tests/public-catalog-dry-run.service.test.ts`.
- Modify `backend/src/server.ts` later in this task only for singleton composition.

Interfaces:

- Consumes `PrismaClient` from generated client, `withPublicCatalogReadOnlyTransaction`, `createPrismaPublicCatalogDryRunRepository`, `resolvePublicCatalogAnalysisRevision`, `preparePublicCatalogSnapshotCandidate`, and `AppLogger`.
- Produces:
  - `PublicCatalogDryRunService`
  - `createPublicCatalogDryRunService(options): PublicCatalogDryRunService`.

Service options must include only:

```ts
export interface PublicCatalogDryRunServiceOptions {
  imageUrlPolicy?: ManagedImageUrlPolicy;
  logger?: Pick<AppLogger, "log">;
  now?: () => Date;
  prepareSnapshotCandidate?: typeof preparePublicCatalogSnapshotCandidate;
  prisma: PrismaClient;
  repositoryFactory?: typeof createPrismaPublicCatalogDryRunRepository;
  runReadOnlyTransaction?: typeof withPublicCatalogReadOnlyTransaction;
}
```

Service options must not include Storage, cleanup, audit, acquireLease, failLease, finalizeLease, or pre-created repository.

Fixture definitions:

```ts
function createDeferredValue<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function createControlStateFixture(overrides = {}): PublicCatalogControlState {
  return {
    currentItemsCount: null,
    currentSnapshotChecksum: null,
    currentSnapshotPath: null,
    desiredRevision: 1,
    id: PUBLIC_CATALOG_CONTROL_ID,
    lastSyncErrorCode: null,
    lastSyncRequestId: null,
    publishedRevision: 0,
    showDemoInModal: false,
    syncLeaseExpiresAt: null,
    syncLeaseId: null,
    syncStatus: "pending",
    ...overrides
  };
}

function createProjectionRecord(overrides: Partial<PublicSiteRecord> = {}): PublicSiteRecord {
  return {
    category: { slug: "business", title: "Business" },
    deliveryLabel: "14 days",
    demoMode: false,
    demoUrl: null,
    developmentDays: 14,
    featured: false,
    features: ["CRM"],
    fullDescription: "Full description",
    galleryImages: [],
    id: "00000000-0000-4000-8000-000000000101",
    previewImageUrl: null,
    previewType: "image",
    priceAmountCents: 120000,
    priceLabel: "from 1200",
    publishedAt: new Date("2026-08-02T04:00:00.000Z"),
    shortDescription: "Short description",
    siteUrl: null,
    slug: "dom-dlya-busi",
    sortOrder: 1,
    tags: ["crm"],
    title: "Дом для Буси",
    ...overrides
  } satisfies PublicSiteRecord;
}

function createReadOnlyTxFixture(input: {
  control?: Partial<PublicCatalogControlState> | null;
  records?: PublicSiteRecord[];
} = {}) {
  const control =
    input.control === null ? null : createControlStateFixture(input.control);
  const records = input.records ?? [createProjectionRecord()];
  return {
    publicCatalogControl: {
      findUnique: vi.fn(async () => control)
    },
    site: {
      findMany: vi.fn(async () => records)
    }
  } satisfies PublicCatalogReadOnlyTx;
}

function createBuiltSnapshotFixture(): BuiltPublicCatalogSnapshot {
  return {
    bytes:
      '{"generatedAt":"2026-08-02T04:00:00.000Z","items":[],"itemsCount":0,"revision":1,"schemaVersion":1,"settings":{"showDemoInModal":false}}\n',
    sha256: "d".repeat(64),
    snapshot: {
      generatedAt: "2026-08-02T04:00:00.000Z",
      items: [],
      itemsCount: 0,
      revision: 1,
      schemaVersion: 1,
      settings: { showDemoInModal: false }
    }
  };
}

function createDryRunServiceOptionsFixture(overrides = {}): PublicCatalogDryRunServiceOptions {
  return {
    logger: { log: vi.fn() },
    now: () => new Date("2026-08-02T04:00:00.000Z"),
    prepareSnapshotCandidate: vi.fn(async () => ({
      built: createBuiltSnapshotFixture(),
      byteLength: 1200,
      itemsCount: 1,
      revision: 1,
      status: "ready"
    })),
    prisma: {} as PrismaClient,
    repositoryFactory: ({ tx }) => createPrismaPublicCatalogDryRunRepository({ tx }),
    runReadOnlyTransaction: async (_prisma, operation) => operation(createReadOnlyTxFixture()),
    ...overrides
  };
}

function createDryRunServiceFixture(overrides = {}) {
  return createPublicCatalogDryRunService(createDryRunServiceOptionsFixture(overrides));
}
```

Steps:

- [ ] Write RED test for transaction-scoped repository construction:

```ts
it("creates dry-run repository inside read-only transaction callback", async () => {
  const tx = createReadOnlyTxFixture();
  const repositoryFactory = vi.fn(({ tx: scopedTx }) =>
    createPrismaPublicCatalogDryRunRepository({ tx: scopedTx })
  );
  const service = createPublicCatalogDryRunService({
    logger: { log: vi.fn() },
    now: () => new Date("2026-08-02T04:00:00.000Z"),
    prepareSnapshotCandidate: vi.fn(async () => ({
      built: createBuiltSnapshotFixture(),
      byteLength: 1200,
      itemsCount: 1,
      revision: 1,
      status: "ready"
    })),
    prisma: {} as PrismaClient,
    repositoryFactory,
    runReadOnlyTransaction: async (_prisma, operation) => operation(tx)
  });

  const result = await service.dryRun({ requestId: "req_dry_ready" });

  expect(repositoryFactory).toHaveBeenCalledWith({ tx });
  expect(result).toMatchObject({
    byteLength: 1200,
    itemsCount: 1,
    requestId: "req_dry_ready",
    revision: 1,
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    status: "ready"
  });
  expect(JSON.stringify(result)).not.toContain("bytes");
  expect(JSON.stringify(result)).not.toContain("snapshot");
});
```

- [ ] Write RED test for singleton concurrency guard:

```ts
it("rejects concurrent dry-run and clears guard after completion or failure", async () => {
  const started = createDeferredValue<void>();
  const release = createDeferredValue<void>();
  const service = createPublicCatalogDryRunService({
    logger: { log: vi.fn() },
    now: () => new Date("2026-08-02T04:00:00.000Z"),
    prepareSnapshotCandidate: vi.fn(async () => {
      started.resolve();
      await release.promise;
      return {
        built: createBuiltSnapshotFixture(),
        byteLength: 1200,
        itemsCount: 1,
        revision: 1,
        status: "ready"
      };
    }),
    prisma: {} as PrismaClient,
    repositoryFactory: ({ tx }) => createPrismaPublicCatalogDryRunRepository({ tx }),
    runReadOnlyTransaction: async (_prisma, operation) => operation(createReadOnlyTxFixture())
  });

  const first = service.dryRun({ requestId: "req_first" });
  await started.promise;
  await expect(service.dryRun({ requestId: "req_second" })).rejects.toMatchObject({
    code: "PUBLIC_CATALOG_DRY_RUN_IN_PROGRESS",
    statusCode: 409
  });
  release.resolve();
  await expect(first).resolves.toMatchObject({ status: "ready" });
  await expect(service.dryRun({ requestId: "req_third" })).resolves.toMatchObject({ status: "ready" });
});
```

- [ ] Write RED type-boundary test that dry-run options have no Storage or sync mutation dependencies:

```ts
it("keeps dry-run service options limited to read-only dependencies", () => {
  const options = createDryRunServiceOptionsFixture();

  expect(Object.keys(options).sort()).toEqual([
    "logger",
    "now",
    "prepareSnapshotCandidate",
    "prisma",
    "repositoryFactory",
    "runReadOnlyTransaction"
  ]);
});

const compileTimeNoStorageOption: PublicCatalogDryRunServiceOptions = {
  ...createDryRunServiceOptionsFixture(),
  // @ts-expect-error storage is not a dry-run service dependency
  storage: {
    fetchText: async () => "",
    getPublicUrl: () => "https://example.test/public-catalog/v1/snapshots/revision-1.json",
    uploadJson: async () => undefined
  }
};
void compileTimeNoStorageOption;
```

- [ ] Run RED:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-dry-run.service.test.ts
```

Expected RED: dry-run service does not exist.

- [ ] Implement singleton `active` boolean inside the service closure.
- [ ] Set `active = true` at the start of `dryRun`.
- [ ] Throw `PUBLIC_CATALOG_DRY_RUN_IN_PROGRESS` / 409 when already active.
- [ ] Clear `active` in `finally` after ready, blocked, or thrown failure.
- [ ] Inside `withPublicCatalogReadOnlyTransaction(prisma, async (tx) => { ... })`, create `const repository = createPrismaPublicCatalogDryRunRepository({ tx })`.
- [ ] Read control, settings, and sites through that transaction-scoped repository.
- [ ] Use `resolvePublicCatalogAnalysisRevision(state)` for revision.
- [ ] Call pure preparation with records/settings/revision/generatedAt/image policy.
- [ ] Map internal ready/blocked preparation to public dry-run result without bytes/snapshot.
- [ ] Log safe completed and failed events only.
- [ ] Convert unexpected failures to `PUBLIC_CATALOG_DRY_RUN_FAILED` without raw message.
- [ ] Compose this service once in `backend/src/server.ts`.
- [ ] Run GREEN:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/public-catalog-dry-run.service.test.ts
```

- [ ] Regression:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run typecheck
```

Review checkpoint:

- Guard is inside singleton dry-run service, not request/controller local state.
- Repository is created inside read-only transaction callback.
- Storage object may still be created for existing sync server composition, but it is not passed to dry-run service and dry-run code path does not call Storage methods.
- No disconnected no-call mocks are used as proof.
- No commit, push, deploy, sync, schema, or migration action occurs in this task.

## Task 6: Express Admin API, RBAC, and Confirmation

Files:

- Modify `backend/src/modules/admin/public-catalog/public-catalog-admin.schemas.ts`.
- Modify `backend/src/modules/admin/public-catalog/public-catalog-admin.service.ts`.
- Modify `backend/src/modules/admin/public-catalog/public-catalog-admin.controller.ts`.
- Modify `backend/src/modules/admin/public-catalog/public-catalog-admin.routes.ts`.
- Modify `backend/tests/admin-public-catalog.routes.test.ts`.
- Modify `backend/tests/integration/admin-api.test.ts` only for route wiring and mutation-proof API coverage.

Interfaces:

- Consumes `PublicCatalogDryRunService` and existing admin `AdminMutationContext`.
- Produces:
  - `PUBLIC_CATALOG_DRY_RUN_CONFIRMATION = "WEB00-PUBLIC-CATALOG-DRY-RUN-V1"`
  - `parsePublicCatalogDryRunInput(input)`
  - `AdminPublicCatalogService.dryRun(context)`
  - Express route `POST /api/admin/public-catalog/dry-run`.

Helper definition for the HTTP concurrency test:

```ts
function createDeferredValue<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
```

Steps:

- [ ] Extend existing `createPublicCatalogService` test fixture in `backend/tests/admin-public-catalog.routes.test.ts`:

```ts
function createPublicCatalogService(): AdminPublicCatalogService {
  return {
    dryRun: vi.fn(async () => ({
      blockers: [],
      blockersTruncated: false,
      byteLength: 1200,
      durationMs: 10,
      itemsCount: 16,
      requestId: "req_public_catalog_dry_run",
      revision: 8,
      sha256: "b".repeat(64),
      status: "ready" as const
    })),
    getStatus: vi.fn(async () => ({
      currentItemsCount: 16,
      currentSnapshotChecksum: "a".repeat(64),
      currentSnapshotPath: "public-catalog/v1/snapshots/revision-7.json",
      desiredRevision: 7,
      lastSyncErrorCode: null,
      lastSyncRequestId: null,
      publishedRevision: 7,
      showDemoInModal: false,
      syncStatus: "ready" as const
    })),
    sync: vi.fn(async () => ({
      checksum: "a".repeat(64),
      itemsCount: 16,
      publishedRevision: 7,
      requestId: "req_public_catalog_sync",
      snapshotPath: "public-catalog/v1/snapshots/revision-7.json",
      status: "ready" as const
    })),
    updateSettings: vi.fn(async () => ({
      status: {
        currentItemsCount: 16,
        currentSnapshotChecksum: "a".repeat(64),
        currentSnapshotPath: "public-catalog/v1/snapshots/revision-7.json",
        desiredRevision: 7,
        lastSyncErrorCode: null,
        lastSyncRequestId: null,
        publishedRevision: 7,
        showDemoInModal: false,
        syncStatus: "ready" as const
      },
      sync: {
        checksum: "a".repeat(64),
        itemsCount: 16,
        publishedRevision: 7,
        requestId: "req_public_catalog_sync",
        snapshotPath: "public-catalog/v1/snapshots/revision-7.json",
        status: "ready" as const
      }
    }))
  };
}
```

- [ ] Add RED route test using existing helpers:

```ts
it("requires admin RBAC and exact confirmation for dry-run", async () => {
  const service = createPublicCatalogService();

  await request(createApp(service))
    .post("/api/admin/public-catalog/dry-run")
    .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
    .expect(401);

  await request(createApp(service, editorPrincipal()))
    .post("/api/admin/public-catalog/dry-run")
    .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
    .expect(403);

  await request(createApp(service, adminPrincipal()))
    .post("/api/admin/public-catalog/dry-run")
    .send({ confirmation: "WEB00-PUBLIC-CATALOG-SYNC-V1" })
    .expect(400);

  expect(service.dryRun).not.toHaveBeenCalled();

  const response = await request(createApp(service, adminPrincipal()))
    .post("/api/admin/public-catalog/dry-run")
    .set("X-Request-Id", "req_public_catalog_dry_run")
    .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
    .expect(200);

  expect(response.body.data).toMatchObject({
    requestId: "req_public_catalog_dry_run",
    status: "ready"
  });
  expect(service.sync).not.toHaveBeenCalled();
});
```

- [ ] Add RED HTTP concurrency test using one app and one singleton service:

```ts
it("keeps dry-run concurrency guard across requests in the same app", async () => {
  const started = createDeferredValue<void>();
  const release = createDeferredValue<void>();
  const service = createPublicCatalogService();
  service.dryRun = vi.fn(async () => {
    started.resolve();
    await release.promise;
    return {
      blockers: [],
      blockersTruncated: false,
      byteLength: 1200,
      durationMs: 10,
      itemsCount: 16,
      requestId: "req_first",
      revision: 8,
      sha256: "b".repeat(64),
      status: "ready" as const
    };
  });
  const app = createApp(service, adminPrincipal());

  const first = request(app)
    .post("/api/admin/public-catalog/dry-run")
    .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" });
  await started.promise;

  await request(app)
    .post("/api/admin/public-catalog/dry-run")
    .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
    .expect(409)
    .expect((response) => {
      expect(response.body.error.code).toBe("PUBLIC_CATALOG_DRY_RUN_IN_PROGRESS");
    });

  release.resolve();
  await first.expect(200);

  await request(app)
    .post("/api/admin/public-catalog/dry-run")
    .send({ confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" })
    .expect(200);
});
```

- [ ] Run RED:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/admin-public-catalog.routes.test.ts
```

Expected RED: dry-run route and service method are absent.

- [ ] Add dry-run parser and constant beside existing sync parser.
- [ ] Add dry-run method to admin service, controller, and router.
- [ ] Keep RBAC permission `maintenance.publicCatalog`.
- [ ] Ensure wrong confirmation never calls dry-run service.
- [ ] Ensure route calls dry-run and never sync.
- [ ] Run GREEN:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/admin-public-catalog.routes.test.ts
```

- [ ] Regression:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/integration/admin-api.test.ts tests/health.test.ts
```

Review checkpoint:

- Express remains the framework.
- Concurrency test uses one app and one service.
- Completed request permits a later request.
- No commit, push, deploy, sync, schema, or migration action occurs in this task.

## Task 7: Maintenance UI Safe Rendering

Files:

- Modify `backend/src/admin/assets/screens/maintenance.js`.
- Modify `backend/tests/admin-ui.maintenance.test.mjs`.
- Do not change public frontend files.
- Do not fix unrelated checkbox behavior.

Interfaces:

- Consumes current fake DOM helpers `click`, `createFakeDocument`, `setValue`, and `waitFor`.
- Consumes existing `publicCatalogStatus(...)` helper already defined in `backend/tests/admin-ui.maintenance.test.mjs`.
- Produces:
  - `PUBLIC_CATALOG_DRY_RUN_PATH = "/api/admin/public-catalog/dry-run"`
  - `PUBLIC_CATALOG_DRY_RUN_CONFIRMATION = "WEB00-PUBLIC-CATALOG-DRY-RUN-V1"`
  - button `data-action="public-catalog-dry-run"`
  - request timeout `timeoutMs: 45000`
  - safe ready/blocked renderer.

Steps:

- [ ] Add RED UI test for exact confirmation and no sync call:

```js
it("runs public catalog dry-run with exact confirmation and never calls sync", async () => {
  const documentRef = createFakeDocument();
  const requests = [];
  const apiClient = {
    requestJson: vi.fn((requestPath, options = {}) => {
      requests.push({ options, requestPath });
      if (requestPath === "/api/admin/public-catalog/dry-run") {
        return Promise.resolve({
          data: {
            blockers: [],
            blockersTruncated: false,
            byteLength: 2048,
            durationMs: 10,
            itemsCount: 16,
            requestId: "req_dry_ready",
            revision: 9,
            sha256: "c".repeat(64),
            status: "ready"
          }
        });
      }
      return Promise.resolve({ data: publicCatalogStatus() });
    })
  };
  const screen = createMaintenanceScreen({
    apiClient,
    documentRef,
    onStatus: vi.fn(),
    role: "admin"
  });

  await screen.load();
  expect(screen.element.textContent).toContain("Проверить каталог без публикации");
  expect(screen.element.textContent).toContain("Проверяет будущий snapshot. Ничего не публикует и не изменяет.");

  click(screen.element, '[data-action="public-catalog-dry-run"]');
  expect(screen.element.querySelector('[data-action="confirm-dialog"]').disabled).toBe(true);
  setValue(screen.element, "typedConfirmation", "WEB00-PUBLIC-CATALOG-DRY-RUN-V1");
  expect(screen.element.querySelector('[data-action="confirm-dialog"]').disabled).toBe(false);
  click(screen.element, '[data-action="confirm-dialog"]');

  await waitFor(() => screen.element.textContent.includes("READY"));
  expect(screen.element.textContent).toContain("req_dry_ready");
  expect(requests).toContainEqual({
    options: {
      body: { confirmation: "WEB00-PUBLIC-CATALOG-DRY-RUN-V1" },
      method: "POST",
      timeoutMs: 45000
    },
    requestPath: "/api/admin/public-catalog/dry-run"
  });
  expect(requests.some((requestItem) => requestItem.requestPath === "/api/admin/public-catalog/sync")).toBe(false);
});
```

- [ ] Add RED UI XSS test using fake DOM element assertions:

```js
it("renders blocked dry-run blockers as text without creating HTML elements", async () => {
  const documentRef = createFakeDocument();
  const maliciousSlug = '<img src=x onerror=alert(1)>';
  const apiClient = {
    requestJson: vi.fn((requestPath) => {
      if (requestPath === "/api/admin/public-catalog/dry-run") {
        return Promise.resolve({
          data: {
            blockers: [
              {
                errorCode: "PUBLIC_CATALOG_DRY_RUN_BLOCKED",
                fieldPath: "galleryImages[0].url",
                itemIndex: 0,
                reasonCode: "INVALID_URL_CREDENTIALS",
                siteId: "site_1",
                slug: maliciousSlug,
                stage: "item_validate"
              }
            ],
            blockersTruncated: false,
            byteLength: null,
            durationMs: 12,
            itemsCount: 1,
            requestId: "req_dry_blocked",
            revision: 9,
            sha256: null,
            status: "blocked"
          }
        });
      }
      return Promise.resolve({ data: publicCatalogStatus() });
    })
  };
  const screen = createMaintenanceScreen({
    apiClient,
    documentRef,
    onStatus: vi.fn(),
    role: "admin"
  });

  await screen.load();
  click(screen.element, '[data-action="public-catalog-dry-run"]');
  setValue(screen.element, "typedConfirmation", "WEB00-PUBLIC-CATALOG-DRY-RUN-V1");
  click(screen.element, '[data-action="confirm-dialog"]');

  await waitFor(() => screen.element.textContent.includes("BLOCKED"));
  expect(screen.element.textContent).toContain(maliciousSlug);
  expect(screen.element.querySelector("img")).toBeNull();
  expect(screen.element.textContent).toContain("INVALID_URL_CREDENTIALS");
  expect(screen.element.textContent).not.toMatch(/postgres:\/\/|token|password|service_role/i);
});
```

- [ ] Run RED:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/admin-ui.maintenance.test.mjs
```

Expected RED: dry-run UI control and renderer are absent.

- [ ] Add button text `Проверить каталог без публикации`.
- [ ] Add description `Проверяет будущий snapshot. Ничего не публикует и не изменяет.`
- [ ] Use current confirmation dialog with field name `typedConfirmation`.
- [ ] Send `timeoutMs: 45000`.
- [ ] Disable button while running to prevent double click.
- [ ] Render `READY`, requestId, item count, byte length, and checksum only for ready result.
- [ ] Render `BLOCKED`, requestId, blocker count, truncation state, and table columns card/slug, field, reason.
- [ ] Use `textContent` and existing safe element creation; do not pass backend values to raw HTML APIs.
- [ ] Do not call sync after dry-run.
- [ ] Run GREEN:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/admin-ui.maintenance.test.mjs
```

- [ ] Regression:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/admin-public-catalog.routes.test.ts tests/admin-ui.maintenance.test.mjs
```

Review checkpoint:

- UI harness uses `documentRef`, `onStatus`, and `setValue`.
- XSS test checks absence of created `img` element.
- UI does not fix unrelated checkbox behavior.
- No commit, push, deploy, sync, schema, or migration action occurs in this task.

## Task 8: Mutation-Proof, Production-Equivalence, Full Regression Gate, and Runbook

Files:

- Modify `backend/tests/integration/admin-api.test.ts`.
- Modify `backend/tests/public-catalog-snapshot-preparation.test.ts`.
- Modify `backend/tests/public-catalog-sync.service.test.ts`.
- Modify `backend/tests/public-catalog-dry-run.service.test.ts`.
- Modify `backend/tests/health.test.ts` only if server composition changes require it.
- Modify `backend/docs/WEB00_PUBLIC_CATALOG_RELEASE_RUNBOOK.md`.
- Modify `backend/docs/WEB00_PUBLIC_CATALOG_SNAPSHOT_PROTOCOL_V1.md` only if it already documents admin snapshot operation contracts.
- Inspect `backend/package.json`, `backend/prisma/schema.prisma`, and `backend/prisma/migrations`.
- Do not edit schema, migrations, or dependencies.

Interfaces:

- Consumes all AP0 source modules and current integration test fixtures.
- Produces final local acceptance evidence and runbook instructions for later owner-triggered AP0 production dry-run.

Integration wiring required in `backend/tests/integration/admin-api.test.ts`:

```ts
const dryRunService = createPublicCatalogDryRunService({
  logger: { log: vi.fn() },
  now: () => new Date("2026-08-02T04:00:00.000Z"),
  prisma
});
const publicCatalogAdminService = createAdminPublicCatalogService({
  repository: createPrismaAdminPublicCatalogRepository({ prisma }),
  syncService: {
    syncOnce: async () => {
      throw new Error("AP0 integration test must not execute public catalog sync.");
    }
  },
  dryRunService
});
const adminRoutes = createAdminRouter({
  auditLogService: createAdminAuditLogService({
    repository: createPrismaAdminAuditLogRepository({ prisma })
  }),
  authService,
  categoryService: createAdminCategoryService({
    repository: createPrismaAdminCategoryRepository({ prisma })
  }),
  publicCatalogService: publicCatalogAdminService,
  siteService: createAdminSiteService({
    repository: createPrismaAdminSiteRepository({ prisma }),
    now: () => new Date("2026-07-25T12:00:00.000Z")
  })
});
```

Fixture-scoped before/after evidence:

```ts
async function readAp0FixtureEvidence(input: {
  categorySlug: string;
  requestIdPrefix: string;
  siteSlug: string;
  userId: string;
}) {
  return {
    auditLogCount: await prisma.auditLog.count({
      where: {
        OR: [
          { actorUserId: input.userId },
          { requestId: { startsWith: input.requestIdPrefix } }
        ]
      }
    }),
    category: await prisma.category.findUnique({ where: { slug: input.categorySlug } }),
    control: await prisma.publicCatalogControl.findUnique({
      where: { id: PUBLIC_CATALOG_CONTROL_ID }
    }),
    site: await prisma.site.findUnique({ where: { slug: input.siteSlug } }),
    sitePublicImageFields: await prisma.site.findUnique({
      select: { galleryImages: true, previewImageUrl: true },
      where: { slug: input.siteSlug }
    }),
    storageCleanupJobCount: await prisma.storageCleanupJob.count({
      where: { entityId: { startsWith: input.requestIdPrefix } }
    }),
    user: await prisma.user.findUnique({ where: { id: input.userId } })
  };
}
```

Steps:

- [ ] Add RED integration test that wires real dry-run service into `createAdminRouter` and safe sync stub that fails if called.
- [ ] In the integration test, create fixture-scoped site/category/user data and capture before evidence with `readAp0FixtureEvidence`.
- [ ] Call `POST /api/admin/public-catalog/dry-run` with admin token and exact confirmation.
- [ ] Assert response status is 200 and response data status is `ready` or `blocked`.
- [ ] Assert response body does not contain `postgres://`, `service_role`, `token`, `password`, `secret`, provider response text, full snapshot body, or raw invalid URL.
- [ ] Capture after evidence and assert:

```ts
expect(after.control).toEqual(before.control);
expect(after.auditLogCount).toBe(before.auditLogCount);
expect(after.storageCleanupJobCount).toBe(before.storageCleanupJobCount);
expect(after.site).toEqual(before.site);
expect(after.sitePublicImageFields).toEqual(before.sitePublicImageFields);
expect(after.category).toEqual(before.category);
expect(after.user).toEqual(before.user);
expect(after.control?.desiredRevision).toBe(before.control?.desiredRevision);
expect(after.control?.publishedRevision).toBe(before.control?.publishedRevision);
expect(after.control?.syncStatus).toBe(before.control?.syncStatus);
expect(after.control?.syncLeaseId).toBe(before.control?.syncLeaseId);
expect(after.control?.syncLeaseExpiresAt).toEqual(before.control?.syncLeaseExpiresAt);
```

- [ ] Add production-equivalence test that same records/settings/revision/generatedAt passed to pure preparation produce identical `built.bytes` and `built.sha256` for sync-stage and dry-run-stage callers.
- [ ] Add sync regression assertion that sync calls `storage.uploadJson`, `storage.fetchText`, and `storage.getPublicUrl`.
- [ ] Add dry-run regression assertion that dry-run service options have no Storage object and dry-run route/service never calls Storage methods.
- [ ] Add runbook AP0 section with route `/api/admin/public-catalog/dry-run`, confirmation `WEB00-PUBLIC-CATALOG-DRY-RUN-V1`, `READ ONLY`, `REPEATABLE READ`, no production sync, ready/blocked evidence, and zero-mutation verification.
- [ ] Run focused GREEN:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run test:run -- tests/integration/public-catalog-readonly-transaction.test.ts tests/public-catalog-dry-run.diagnostics.test.ts tests/public-catalog-snapshot-preparation.test.ts tests/public-catalog-dry-run.repository.test.ts tests/public-catalog-dry-run.service.test.ts tests/admin-public-catalog.routes.test.ts tests/admin-ui.maintenance.test.mjs tests/integration/admin-api.test.ts tests/public-catalog-sync.service.test.ts tests/public-catalog-snapshot.test.ts tests/health.test.ts
```

- [ ] Run full regression:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& "D:\WEB00_WORKTREES\runtimes\node-v22.23.1-win-x64\npm.cmd" run check
Set-Location D:\WEB00_BACKEND
git diff --check
git diff --name-only -- backend/prisma/schema.prisma backend/prisma/migrations backend/package.json
git status --short
git diff --cached --name-only
```

Expected full regression:

- Prisma validate PASS.
- Prisma format check PASS.
- Typecheck PASS.
- Vitest PASS.
- Zero failed tests.
- Build PASS.
- `git diff --check` PASS.
- No schema diff.
- No migration diff.
- No package/dependency diff.
- No staging until a separately authorized AP0 implementation commit.

Review checkpoint:

- Mutation-proof evidence is fixture-scoped, not global counts that unrelated tests can change.
- Existing sync is not executed by the AP0 integration test.
- Runbook documents later production AP0 dry-run but does not execute it.
- No commit, push, deploy, sync, schema, or migration action occurs until separately authorized.

## Final AP0 Local Acceptance Gate

- Focused read-only PostgreSQL transaction test PASS.
- Focused diagnostics tests PASS.
- Focused pure preparation tests PASS.
- Focused dry-run repository tests PASS.
- Focused dry-run service tests PASS.
- Admin route tests PASS.
- Admin UI tests PASS.
- Integration mutation-proof tests PASS.
- Sync regression tests PASS.
- Health tests PASS.
- `npm run check` PASS.
- `git diff --check` PASS.
- `backend/prisma/schema.prisma` unchanged.
- `backend/prisma/migrations` unchanged.
- `backend/package.json` unchanged unless owner separately authorizes a script-only change.
- No production access.
- No production DB access.
- No sync.
- No PR #14 change.
- No deploy.

## Explicit Out of Scope

- Fixing production catalog data.
- Changing normalization policy.
- Changing current sync API result body.
- Changing public frontend loader.
- Changing PR #14.
- Creating schema or migration.
- Adding dependencies.
- Adding cross-process lock, Redis, worker, cron, or service.
- Running production API.
- Running production sync.
- Deploying.
- Pushing.

## Plan Quality Gate

After any amendment, run the owner-required negative scans for stack, Prisma construction, Storage method names, undefined UI helper use, placeholder wording, and trailing whitespace from the shell prompt instead of embedding those literal scan patterns in this plan.

Also run `git diff --check`, `git status --short`, and `git diff --cached --name-only`.

Expected:

- Stack/client/Storage/UI-helper negative scan exits 1 with no matches.
- Placeholder wording scan exits 1 with no matches.
- Trailing whitespace scan exits 1 with no matches.
- `git diff --check` exits 0.
- `git status --short` shows:

```text
?? docs/WEB00_ATOMIC_PUBLICATION_DESIGN_V1.md
?? docs/superpowers/plans/2026-08-02-web00-ap0-dry-run-rca.md
```

- Staging is empty.
