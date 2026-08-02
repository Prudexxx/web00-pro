# WEB00 Public Catalog Snapshot Protocol V1

This document defines the backend-owned public catalog snapshot contract used by WEB00 frontend clients after the always-available catalog rollout.

## Goals

- Keep the public catalog readable when the Render backend is cold or unavailable.
- Publish immutable catalog versions and a small mutable manifest.
- Preserve the previous public manifest on every failed sync boundary.
- Keep the public DTO identical to the existing `/api/sites` catalog item mapper.
- Keep the global demo display setting inside the same verified public snapshot.

## Storage layout

All objects are stored in the existing Supabase Storage bucket configured for public assets.

- Manifest path: `public-catalog/v1/manifest.json`
- Immutable snapshot path: `public-catalog/v1/snapshots/revision-<revision>.json`

The immutable snapshot upload uses `upsert=false`.

The manifest upload uses `upsert=true` only after the immutable version has been uploaded, fetched back, and validated.

## Manifest DTO

```json
{
  "generatedAt": "2026-08-01T16:00:00.000Z",
  "itemsCount": 16,
  "revision": 7,
  "schemaVersion": 1,
  "sha256": "64 lowercase hex characters",
  "snapshotPath": "public-catalog/v1/snapshots/revision-7.json",
  "snapshotUrl": "https://<public-storage-origin>/storage/v1/object/public/<bucket>/public-catalog/v1/snapshots/revision-7.json"
}
```

Validation rules:

- `schemaVersion` must equal `1`;
- `revision` and `itemsCount` must be safe non-negative integers;
- `sha256` must match `^[a-f0-9]{64}$`;
- `snapshotPath` must be the exact immutable revision path shape;
- `snapshotUrl` must be an HTTPS URL without username, password, query, or fragment.

## Snapshot DTO

```json
{
  "generatedAt": "2026-08-01T16:00:00.000Z",
  "items": [],
  "itemsCount": 0,
  "revision": 7,
  "schemaVersion": 1,
  "settings": {
    "showDemoInModal": false
  }
}
```

`items` uses the canonical public catalog item DTO produced by `mapSiteToPublicCatalogItem(site)`. The same mapper is used by the live `/api/sites` API and the snapshot builder, so the API projection and snapshot projection cannot drift silently.

Validation rules:

- `itemsCount` must equal `items.length`;
- item count must not exceed `1000`;
- encoded UTF-8 JSON bytes must not exceed `2 MiB`;
- every slug must be unique;
- no internal admin/database fields are allowed;
- public URLs must be safe absolute public URLs accepted by the existing public mapper rules;
- `settings.showDemoInModal` is a required boolean in V1.

## Deterministic bytes

Snapshot bytes are generated from a stable object-key serializer with a trailing newline.

Properties:

- same public input produces byte-identical JSON;
- DB row order does not affect output;
- public field changes change the SHA-256 checksum;
- non-public field changes do not change the checksum;
- snapshot SHA-256 is calculated over the exact UTF-8 bytes sent to Storage.

## Publish sequence

Every sync attempt follows this order:

1. Acquire a DB lease for the target revision.
2. Read `PublicCatalogControl.showDemoInModal`.
3. Read the current public-visible site projection.
4. Build deterministic snapshot bytes and SHA-256.
5. Upload immutable snapshot with `upsert=false`.
6. Fetch uploaded immutable snapshot.
7. Validate fetched bytes and SHA-256 against the built snapshot.
8. Build manifest pointing to the immutable snapshot.
9. Upload manifest with `upsert=true`.
10. Fetch manifest with cache-busting/no-store semantics.
11. Validate manifest revision, checksum, item count, and snapshot path.
12. Finalize `PublicCatalogControl` in the database.
13. Enqueue stale immutable versions for cleanup.

The database state is finalized only after the fetched manifest points to the exact immutable version that was verified.

## Failure behavior

The previous manifest remains valid if any step fails before finalization.

Failure handling:

- immutable version upload failure: no manifest change;
- immutable version validation failure: no manifest change;
- manifest upload failure: old manifest remains the public source of truth;
- manifest validation failure: DB control remains non-finalized;
- DB finalize conflict: old manifest remains valid and the control state is marked failed/pending according to revision state;
- retention cleanup enqueue failure: sync remains ready because the verified manifest already points to the correct current version.

Errors returned to admin clients use safe application codes and request IDs. Raw provider bodies, service-role values, object URLs with secrets, Prisma raw errors, and SQL details must not be exposed.

## Revision and lease invariants

- `desiredRevision >= publishedRevision`;
- only one singleton `PublicCatalogControl` row exists;
- dirty mutations increment `desiredRevision`;
- acquiring a lease moves `pending|failed` state to `syncing`;
- an old lease cannot finalize;
- an old revision cannot overwrite a newer desired revision;
- a mutation during sync leaves the control state `pending` after the current revision finalizes;
- a stale lease can be recovered back to `pending`;
- a clean `ready` state with equal desired/published revisions produces no storage writes.

## Retention

After a manifest has been verified and DB state finalized:

- the current immutable version is never deleted;
- the previous 19 versions are preserved;
- newly obsolete older versions are enqueued into the existing `StorageCleanupJob` pipeline with reason `public_catalog_retention`;
- cleanup failure is non-fatal for sync;
- any version currently referenced by the manifest is outside the cleanup candidate range.

## Staged migration compatibility

The feature depends on the `public_catalog_control` table, but ordinary backend startup and public/admin flows must not crash if the table is temporarily absent during a staged deploy.

Behavior before migration:

- dirty marking returns an internal `control_table_missing` no-op result;
- settings default to `showDemoInModal=false`;
- sync admission returns `pending` without Storage writes;
- `/api/health` and `/api/ready` must not depend on this optional feature;
- existing `/api/sites` remains backed by the database query path.

The migration is not applied by this implementation task.
