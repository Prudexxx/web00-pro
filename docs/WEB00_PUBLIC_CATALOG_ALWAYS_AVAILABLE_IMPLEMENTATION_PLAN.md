# WEB00 Public Catalog Always-Available Implementation Plan

This plan is the execution contract for the always-available public catalog and global demo display control. It is scoped to the backend worktree `codex/web00-public-catalog-snapshot-p0` and the frontend worktree `codex/web00-public-catalog-snapshot-ui-p0`. The two branches remain isolated: backend code and backend migrations stay in the backend worktree; frontend static-site code stays in the frontend worktree.

## 1. Backend file map

- `backend/prisma/schema.prisma`: add `PublicCatalogControl`, preserving existing models and staged migration compatibility.
- `backend/prisma/migrations/<timestamp>_public_catalog_control/migration.sql`: create only the public catalog control table and indexes required by the control/lease state machine.
- `backend/src/modules/public-catalog/public-catalog-control.repository.ts`: singleton control access, typed revision/status transitions, stale lease recovery, dirty marking, and migration-missing compatibility.
- `backend/src/modules/public-catalog/public-catalog.mapper.ts`: expose `mapSiteToPublicCatalogItem(site, imageUrlPolicy)` as the canonical mapper shared by `/api/sites` parity tests and the snapshot builder.
- `backend/src/modules/public-catalog/public-catalog.snapshot.ts`: snapshot/manifest DTOs, schema validation, stable JSON serialization, SHA-256 checksum, item/byte limits.
- `backend/src/modules/public-catalog/public-catalog-snapshot.repository.ts`: deterministic public projection query using the existing public visibility predicate and public ordering.
- `backend/src/modules/public-catalog/public-catalog-snapshot-storage.ts`: abortable JSON object upload/fetch contract for immutable snapshot versions and the mutable manifest.
- `backend/src/modules/public-catalog/public-catalog-sync.service.ts`: revision/lease state machine and atomic publish sequence.
- `backend/src/modules/admin/public-catalog-admin.routes.ts`: admin-only status, settings, and manual sync endpoints.
- `backend/src/modules/admin/admin.routes.ts` and related route factories: mount the public catalog admin router without changing public API routes.
- `backend/src/modules/admin/site/*`, `backend/src/modules/admin/category/*`, `backend/src/modules/images/*`: call `markPublicCatalogDirty(tx, reason, context)` inside the same transaction as every public-visible mutation.
- `backend/src/admin/assets/screens/maintenance.js`: add the “Публичный каталог” maintenance card, status rendering, manual retry, and global demo toggle.
- `backend/docs/WEB00_PUBLIC_CATALOG_SNAPSHOT_PROTOCOL_V1.md`: backend protocol details for manifest/version JSON, checksum, retention, and safe errors.
- `backend/docs/WEB00_PUBLIC_CATALOG_RELEASE_RUNBOOK.md`: staged backend-first/frontend-second release and rollback runbook.
- `backend/tests/*public-catalog*`, `backend/tests/admin-*`, `backend/tests/site-image*`, `backend/tests/storage-cleanup*`: regression and fault-injection tests.

## 2. Frontend file map

- `assets/js/runtime-config.js`: add snapshot manifest URL, timeout, byte cap, background Render revalidation flag, and trusted demo origin config.
- `assets/js/public-catalog-snapshot.js`: focused snapshot client with manifest/snapshot fetch, validation, checksum verification, request channel, and CacheStorage LKG helpers.
- `assets/js/catalog-api.js`: keep legacy Render client functions, but move initial catalog resolution to static → LKG → Supabase snapshot; Render background revalidation remains disabled by default and non-critical.
- `assets/js/main.js`: consume one catalog store across solutions, homepage popular cards, filters, detail modal, gallery, prices, deadlines, retry state, failure banner, and demo behavior.
- `solutions.html`, `index.html`, and other catalog consumers: include the snapshot client before catalog/state consumers and preserve existing static rendering.
- `tests/frontend/*.test.mjs`: update source-policy tests and add snapshot/LKG/demo-toggle/failure UX coverage.

## 3. Interfaces between modules

Backend interfaces:

```ts
type PublicCatalogSyncStatus = "pending" | "syncing" | "ready" | "failed";

type PublicCatalogDirtyReason =
  | "site.publish"
  | "site.unpublish"
  | "site.update"
  | "site.activate"
  | "site.deactivate"
  | "site.softDelete"
  | "site.restore"
  | "site.permanentDelete"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "image.preview.replace"
  | "image.preview.delete"
  | "image.gallery.add"
  | "image.gallery.delete"
  | "image.gallery.reorder"
  | "image.gallery.batch"
  | "settings.showDemoInModal";

type MarkPublicCatalogDirtyResult =
  | { marked: true; desiredRevision: number }
  | { marked: false; reason: "control_table_missing" | "not_public_visible" | "no_public_change" };

type PublicCatalogSyncResult =
  | { status: "ready"; desiredRevision: number; publishedRevision: number; manifestPath: string; snapshotPath: string; checksum: string; itemsCount: number; requestId: string }
  | { status: "pending"; desiredRevision: number; publishedRevision: number; requestId: string }
  | { status: "failed"; desiredRevision: number; publishedRevision: number; errorCode: string; requestId: string };
```

Frontend interfaces:

```js
loadManifest(options) => Promise<ManifestEnvelope>
loadSnapshot(manifest, options) => Promise<SnapshotEnvelope>
validateManifest(value) => Manifest
validateSnapshot(value, manifest) => Snapshot
verifySnapshotChecksum(bytes, checksum) => Promise<boolean>
normalizeSnapshotCatalog(snapshot) => CatalogState
createSnapshotRequestChannel(options) => { signal, dispose, abort }
readLastKnownGood() => Promise<CatalogState | null>
writeLastKnownGood(snapshot) => Promise<void>
removeInvalidLastKnownGood() => Promise<void>
```

## 4. Public snapshot DTO

The snapshot is UTF-8 JSON with deterministic key order:

```json
{
  "schemaVersion": 1,
  "revision": 17,
  "generatedAt": "2026-08-01T00:00:00.000Z",
  "itemsCount": 16,
  "settings": {
    "showDemoInModal": false
  },
  "items": [
    {
      "slug": "domain-portfolio",
      "category": { "slug": "business", "title": "Business" },
      "title": "Domain Portfolio",
      "shortDescription": "Public short description",
      "fullDescription": "Public full description",
      "features": ["feature"],
      "tags": ["tag"],
      "demoUrl": "https://prudexxx.github.io/web00-pro/example.html",
      "siteUrl": "https://example.com",
      "previewImageUrl": "https://prudexxx.github.io/web00-pro/assets/example.webp",
      "previewImage": null,
      "galleryImages": [],
      "previewType": "image",
      "demoMode": "external",
      "priceAmountCents": 100000,
      "priceLabel": "от 10 000 ₽",
      "developmentDays": 7,
      "deliveryLabel": "7 дней",
      "featured": false,
      "publishedAt": "2026-08-01T00:00:00.000Z"
    }
  ]
}
```

Snapshot acceptance requires:

- `schemaVersion === 1`;
- safe integer `revision >= 0`;
- `itemsCount === items.length`;
- `0 <= items.length <= 1000`;
- serialized bytes `<= 2 MiB`;
- unique non-empty slugs;
- public URLs contain no credentials or fragments;
- every item passes the canonical public mapper validation;
- settings object includes `showDemoInModal`, defaulting to `false` only when older static data has no setting.

## 5. Manifest DTO

The manifest is UTF-8 JSON with deterministic key order:

```json
{
  "schemaVersion": 1,
  "revision": 17,
  "generatedAt": "2026-08-01T00:00:00.000Z",
  "itemsCount": 16,
  "snapshotPath": "public-catalog/v1/snapshots/revision-17.json",
  "snapshotUrl": "https://<supabase-public-origin>/storage/v1/object/public/<bucket>/public-catalog/v1/snapshots/revision-17.json",
  "sha256": "64 lowercase hex characters"
}
```

Manifest acceptance requires:

- exact schema version;
- safe integer revision;
- exact public Supabase origin and bounded path under `public-catalog/v1/snapshots/`;
- checksum shape `^[a-f0-9]{64}$`;
- item count within the same snapshot bounds;
- no query, hash, username, password, wildcard host, or scheme broadening.

## 6. Public visibility predicate

The existing public predicate remains canonical:

- site `status === "published"`;
- site `active === true`;
- site `deletedAt === null`;
- category `active === true`.

Snapshot projection uses this same predicate. Draft, inactive, soft-deleted, archived, unpublished, and category-inactive rows are excluded. Public order remains deterministic: `sortOrder asc`, `createdAt desc`, `slug asc`, matching the existing public catalog order.

## 7. Mutation dirty matrix

`markPublicCatalogDirty(tx, reason, context)` runs inside the same DB transaction as the mutation that changes public projection.

Dirty:

- site publish/unpublish;
- update of a currently published site affecting category, slug, title, descriptions, features, tags, price, delivery, demo fields, sort order, featured flag, active flag, canonical preview/gallery URL, or public lifecycle;
- soft delete, restore into a public-visible state, and permanent delete of a row that was ever public-visible;
- category active/slug/title/sort order changes that affect public sites;
- category deletion when it removes a public category projection;
- preview add/replace/delete for a public-visible site;
- gallery add/delete/reorder/batch for a public-visible site;
- global `showDemoInModal` toggle.

Not dirty:

- views counters;
- login/auth/session changes;
- audit-only writes;
- draft-only edit where the site has never been public-visible;
- idempotent replay that produces no public projection change;
- cleanup job state changes.

If `PublicCatalogControl` does not exist during staged rollout, ordinary admin/public mutations keep succeeding and return `marked=false, reason="control_table_missing"` internally; the feature status endpoint reports pending/unavailable until migration is applied.

## 8. Revision state machine

Control invariants:

- singleton id is `public-catalog`;
- `desiredRevision >= publishedRevision`;
- revisions are positive safe integers;
- dirty marking increments `desiredRevision` exactly once per public projection transaction;
- `syncStatus` is one of `pending`, `syncing`, `ready`, `failed`;
- `ready` requires `publishedRevision === desiredRevision` and a verified manifest;
- `pending` means `desiredRevision > publishedRevision` or retry is explicitly requested;
- `failed` preserves the previous valid manifest and records only safe error code/requestId.

Transitions:

- `ready -> pending` on dirty mutation;
- `failed -> pending` on dirty mutation or manual retry;
- `pending -> syncing` when a valid lease is acquired;
- `syncing -> ready` only after version upload, version verification, manifest upload, manifest verification, and DB finalization for the same lease/revision;
- `syncing -> pending` when a newer dirty mutation lands during sync;
- `syncing -> failed` when the current revision fails and no newer revision is pending.

## 9. Lease state machine

Lease fields:

- `syncLeaseId`;
- `syncLeaseExpiresAt`;
- `syncStatus`.

Rules:

- acquire lease only from `pending`, `failed`, or stale `syncing`;
- lease id is unguessable and bounded;
- old lease cannot finalize;
- old revision cannot overwrite a newer desired revision;
- stale lease recovery clears expired `syncing` and returns to `pending`;
- mutation during sync makes the next state `pending` after the active revision finalizes or fails;
- one bounded coalesced second pass is attempted by the admin sync operation; no infinite loop.

## 10. Storage publish sequence

For revision `R`:

1. Query public DB projection.
2. Map with the canonical public mapper.
3. Build deterministic snapshot bytes and SHA-256.
4. Upload immutable version path `public-catalog/v1/snapshots/revision-R.json` with `upsert=false`.
5. Fetch/inspect immutable version with finite timeout and `AbortSignal`.
6. Validate fetched bytes, checksum, revision, and item count.
7. Upload manifest path `public-catalog/v1/manifest.json` with `upsert=true`.
8. Fetch manifest with cache-buster/no-store.
9. Validate manifest points to the exact immutable version and checksum.
10. Finalize DB control state to `ready` for the same lease and revision.

Failure behavior:

- previous manifest remains readable;
- new immutable version without manifest reference is a cleanup candidate, not an outage;
- no raw provider body, object path with credentials, token, or URL secret is returned/logged;
- errors use safe codes such as `PUBLIC_CATALOG_STORAGE_TIMEOUT`, `PUBLIC_CATALOG_STORAGE_UNAVAILABLE`, `PUBLIC_CATALOG_SNAPSHOT_INVALID`, or `PUBLIC_CATALOG_SYNC_CONFLICT`.

## 11. Frontend source state machine

Startup state order:

1. Render static `WEB00_DATA` immediately.
2. Read validated CacheStorage LKG asynchronously.
3. Replace only with equal/newer valid full snapshot.
4. Fetch Supabase manifest.
5. Fetch Supabase snapshot.
6. Verify checksum and schema.
7. Full-replace catalog state.
8. Persist the valid snapshot as LKG.

States:

- `STATIC_READY`: static data rendered, revision `0`.
- `LKG_READY`: validated cached snapshot rendered.
- `CURRENT_READY`: validated current Supabase snapshot rendered.
- `DEGRADED_WITH_DATA`: later source failed while a previous source contains cards.
- `FATAL_NO_DATA`: all three sources failed or are empty.

Rules:

- never merge records by slug;
- every valid snapshot fully replaces catalog;
- never clear the current catalog because a later source failed;
- Render API is not called on the initial critical path;
- optional Render revalidation is default `false`, cannot downgrade revision, and cannot clear snapshot data.

## 12. CacheStorage LKG contract

Cache key stores only validated public snapshot JSON plus metadata:

- schema version;
- revision;
- checksum;
- items count;
- settings;
- public catalog items.

Rules:

- older revision cannot replace newer LKG;
- corrupt cache is removed;
- CacheStorage unavailable is non-fatal;
- quota/write failure is non-fatal;
- no auth, admin, request headers, cookies, or provider error bodies are cached.

## 13. Global demo toggle contract

Source:

- `snapshot.settings.showDemoInModal`;
- default `false` when setting is absent from legacy static data.

OFF:

- demo opens in a new tab/window with `noopener,noreferrer`;
- iframe modal is not created.

ON:

- iframe is used only for exact allowlisted origins, initially `https://prudexxx.github.io`;
- existing large modal styling is reused;
- navigation remains inside iframe;
- “Открыть отдельно” opens with `noopener,noreferrer`;
- close removes the iframe node;
- Escape closes the modal;
- focus returns to the opener when possible;
- mobile viewport keeps the modal usable.

Untrusted/blocked origin:

- iframe is not used;
- external-open fallback is shown;
- blank modal is never shown.

CSP:

- `connect-src` allows the exact Supabase public origin used by the manifest/snapshot client;
- `frame-src` allows only trusted demo origins;
- no wildcard `*.github.io`, broad `https:`, or relaxation of `script-src`, `object-src`, or `default-src`.

## 14. Migration/deploy compatibility

Fact from current backend scripts:

- `backend/package.json` `build` runs Prisma generate and TypeScript build; it does not run `prisma migrate deploy`;
- `backend/package.json` `start` runs `node dist/server.js`; it does not run `prisma migrate deploy`;
- `db:migrate:deploy` exists as a separate script and is the explicit migration command.

Chosen staged rollout is variant B:

- new backend remains backward-compatible if `PublicCatalogControl` is temporarily absent;
- ordinary `/api/health`, `/api/ready`, public catalog routes, and existing admin mutations must not crash because the optional control table is missing;
- snapshot status/sync/settings endpoints report a safe pending/unavailable state until migration exists;
- dirty marking inside existing mutations treats missing control table as non-fatal during the staged window;
- production migration is not applied in this task.

Release order:

1. merge backend PR;
2. owner applies migration through the approved production migration path;
3. deploy backend;
4. run first owner-approved snapshot sync;
5. verify manifest/version checksum/count and “Дом для Буси”;
6. merge frontend PR.

## 15. Rollback path

Before frontend PR merge:

- rollback backend deploy to previous Render commit if snapshot endpoints regress;
- existing public site continues using current Render API/static behavior;
- previous manifest remains valid if a sync attempt fails.

After frontend PR merge:

- rollback frontend GitHub Pages commit to restore old Render-critical behavior;
- backend snapshot feature can remain deployed because existing public API/admin flows are backward-compatible;
- if manifest is bad, owner disables use by reverting frontend config or frontend commit; cache validation removes corrupt LKG.

Database rollback:

- no destructive rollback is required for ordinary rollback;
- the new control table is additive and can remain unused;
- no production migration is applied by Codex in this task.

## 16. Test matrix

Backend:

- control singleton create/idempotency;
- revision invariant and overflow rejection;
- status transition validation;
- stale lease recovery;
- old lease and old revision cannot finalize;
- mutation during sync returns pending;
- deterministic randomized state schedules with at least 300 fixed-seed schedules;
- canonical mapper parity between API projection and snapshot projection;
- visibility exclusions for draft, inactive, deleted, archived/unpublished, category inactive;
- deterministic JSON bytes and checksum;
- item count boundary `0/1/15/16/1000/1001`;
- byte boundary around `2 MiB`;
- duplicate slug rejection;
- malformed URL rejection/sanitization;
- storage failure at upload, version verification, manifest upload, manifest verification, and DB finalize;
- previous manifest survives every failure;
- dirty marking coverage for site, category, preview, gallery, and global setting mutations;
- admin status/settings/sync RBAC and safe requestId/error behavior;
- retention preserves current and previous 19 versions and enqueues older versions only.

Frontend:

- immediate static render;
- valid LKG upgrade;
- valid current snapshot upgrade;
- all eight source combinations across static/LKG/current availability;
- full replacement, removed site disappears, no duplicate slug merge;
- no revision downgrade;
- Supabase timeout, malformed manifest, malformed snapshot, checksum mismatch;
- retry does not clear UI and does not call Render;
- Render not called on initial path;
- homepage popular, filters, detail modal, gallery, price/deadline consumers after upgrade;
- global demo OFF, ON trusted origin, untrusted origin fallback, blocked iframe fallback, close destroys iframe;
- mobile viewport modal behavior;
- CSP exact-origin checks.

## 17. Release order

Backend PR to `feat/web00-backend-production`:

- includes additive migration, backend snapshot/control/sync/admin work, backend tests, and backend docs;
- does not deploy Render;
- does not apply production migration;
- does not create production snapshot.

Owner manual backend release:

- apply migration through the approved production migration path;
- deploy backend;
- use admin-only manual sync;
- verify manifest and immutable version by checksum, revision, count, and known item “Дом для Буси”.

Frontend PR to `main`:

- explicitly depends on deployed backend, applied migration, first ready snapshot, readable manifest, expected item count, and “Дом для Буси” present;
- removes Render from the initial critical read path only after backend snapshot readiness exists;
- keeps static data as the last built-in fallback.

Stop condition:

- after both PRs are open and pushed, no merge, deploy, production API call, production DB action, migration application, seed, Docker/WSL, branch deletion, or third PR is performed.
