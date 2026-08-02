# WEB00 Atomic Publication Design v1

## 1. Status

Status: amended design gate for local documentation only.

This document is the Design Gate for WEB00 fail-closed atomic public catalog publication. It is not AP0 and is not an implementation phase. It records owner decisions for the future implementation sequence and corrects the earlier architecture contradictions around rollback revisions, SiteVersion state, public pointer shape, idempotency, settings, image policy, legacy manifest behavior, and frontend PR #14 gating.

This documentation task changes only `docs/WEB00_ATOMIC_PUBLICATION_DESIGN_V1.md`. It does not change backend code, frontend code, Prisma schema, migrations, dependencies, Render settings, Supabase objects, production data, production APIs, or PR #14. It does not run sync and does not access production.

The design is based on branch `feat/web00-backend-production` at commit `a90e86f70a4c7dd035f712432bb74db1f574a804`. The current incident context reported by the owner remains: Render service `web00-backend-production`, Auto-Deploy OFF, health/readiness/version passing, production migration `20260802044500_public_catalog_audit_entity_type` applied, and manual public catalog sync failing at `snapshot_build` with `PUBLIC_CATALOG_SYNC_FAILED` for request `req_edf70b40-1920-4309-982f-3550d4527c87`.

Final owner decision: fail-closed atomic publication. A card becomes public only when the full future catalog release is validated, built, uploaded to immutable Storage, read back, byte/SHA-256 verified, and activated through one database pointer transaction. Any failure keeps the previous public release active.

## 2. Context and verified incident

The current backend has a public catalog snapshot subsystem. It reads public-visible `Site` rows, maps them through the same mapper used by `/api/sites`, builds deterministic JSON bytes, uploads an immutable snapshot, verifies it, uploads a mutable manifest, verifies the manifest, and then finalizes `public_catalog_control`.

The current manual production sync is confirmed by the owner as failing at `snapshot_build` with generic code `PUBLIC_CATALOG_SYNC_FAILED`. That confirms a stage-level failure but does not prove a specific malformed field.

The RCA diagnostics already in the branch log failed stages safely for `lease`, `settings`, `projection`, `snapshot_build`, `snapshot_upload`, `snapshot_verify`, `manifest_upload`, `manifest_verify`, and `db_finalize`. Each event contains only `requestId`, `stage`, safe `errorCode`, `errorClass`, `revision`, and `durationMs`. `PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID` is preserved as its exact code.

Current architectural mismatch: admin publish can make mutable `sites` data public through the database/API projection before the snapshot path accepts the exact payload. When `snapshot_build` fails, the system can be left with a published row and no accepted immutable catalog release. Atomic publication fixes that by making public visibility derived from committed release membership, not from mutable draft rows.

## 3. Current architecture

Current database model:

- `sites` stores mutable draft and public fields in one row.
- Public visibility is currently `status = 'published'`, `active = true`, `deleted_at IS NULL`, and active category.
- `public_catalog_control` is a singleton row with current settings, desired/published revisions, sync status, current snapshot metadata, last sync error/request, and lease fields.
- `audit_logs.entity_type` allows `public_catalog`.
- `storage_cleanup_jobs` supports asynchronous object cleanup.

Current backend routes and services:

- Public API under `/api` reads live database projections.
- Admin API exposes `/api/admin/public-catalog/status`, `/api/admin/public-catalog/settings`, and `/api/admin/public-catalog/sync`.
- Manual sync requires `WEB00-PUBLIC-CATALOG-SYNC-V1`.
- `/api/health`, `/api/ready`, and `/api/version` are release readiness endpoints.

Current storage protocol:

- Legacy manifest path: `public-catalog/v1/manifest.json`.
- Legacy immutable snapshot path: `public-catalog/v1/snapshots/revision-<revision>.json`.
- Immutable snapshot upload uses `upsert=false`.
- Manifest upload uses `upsert=true`.

Current frontend state:

- Production frontend currently uses the existing static/API path.
- `assets/js/runtime-config.js` points `apiBaseUrl` to Render.
- Built-in static `WEB00_DATA` remains a fallback.
- PR #14 remains WAIT and is not merged by this design.

## 4. Confirmed guarantees

Current guarantees that remain useful:

- Existing public mapper and snapshot builder already share the public DTO shape.
- Snapshot bytes are deterministic for identical public input and generated timestamp.
- Current snapshot validation rejects duplicate slugs, unsafe counts, unsafe URL credentials/fragments, unsafe manifest URLs with query strings, and oversized bytes.
- Current safe stage logs avoid secrets, raw provider bodies, credentialed URLs, request bodies, and tokens.
- `public_catalog_control` was added in a staged-compatible way.
- `backend/package.json` has `db:migrate:deploy` as a separate script; `build` and `start` do not apply migrations.
- Health/readiness/version endpoints do not depend on catalog snapshot success.

## 5. Current gaps

Gaps to close:

- `Site` has no immutable approved public version separate from draft fields.
- `SiteVersion` state in the previous design incorrectly included `published` and `superseded`; publication must be derived from release membership and `Site.publishedVersionId`.
- The previous design made `public_catalog_pointer_v1` a view; the corrected design requires a dedicated singleton table with RLS.
- Rollback revision and snapshot artifact revision were conflated.
- Settings were duplicated in the pointer and mutable control state; the corrected design has one immutable release settings source.
- Preview image policy was too strict; missing preview must use a deterministic frontend placeholder.
- The previous AP0 was a design/documentation gate; corrected AP0 is a future production-equivalent dry-run and exact RCA phase.
- Public API fallback to mutable `sites` was not cut off irreversibly after atomic activation.
- Legacy mutable manifest behavior was left open; corrected design freezes it and does not create a bridge.

## 6. Goals

The system must provide these guarantees:

- A site can become public only through a committed `PublicCatalogRelease`.
- A `SiteVersion` is an immutable validated public payload for one site and never represents publication status by itself.
- `Site.publishedVersionId`, `PublicCatalogReleaseItem`, and the active committed release determine public state.
- A failed validation, build, storage, verification, idempotency, lease, or pointer step never changes the active public pointer.
- AP0 creates a read-only production-equivalent dry-run that finds exact blockers before schema work starts.
- AP1 creates typed deterministic builder and normalization before any schema implementation.
- Schema implementation is prohibited until AP0 and AP1 pass.
- Rollback uses a new activation revision while preserving the old immutable snapshot revision and object.
- The public pointer is a singleton table that contains only public data and no settings.
- Settings used by a release come only from immutable `PublicCatalogRelease.settingsPayload`.
- Missing preview is allowed and rendered with a bundled deterministic placeholder.
- Supplied invalid preview or gallery data blocks the candidate.
- After first atomic cutover, public API never falls back to mutable draft rows.
- Legacy mutable manifest is frozen and no compatibility bridge is created.
- PR #14 remains WAIT until AP10 production acceptance, then AP11 updates/releases it as pointer-first.

## 7. Non-goals

This design does not authorize:

- Production DB mutation.
- Production API calls.
- Public catalog sync.
- Render deploy.
- Frontend PR #14 merge or modification in this task.
- Dependency changes.
- Old migration edits.
- Backend or frontend source changes in this task.
- Manual SQL repair, seed, reset, or forced migration.
- Partial releases that publish valid cards while excluding invalid cards.

## 8. System architecture

Chosen architecture: database pointer activation plus immutable Storage artifacts.

Layers:

- `Site`: mutable admin draft workspace and stable site identity.
- `SiteVersion`: immutable validated public payload for one site.
- `PublicCatalogRelease`: release-level candidate, idempotency, lease, settings, immutable artifact metadata, and commit status.
- `PublicCatalogReleaseItem`: deterministic membership of site versions in a release.
- `public_catalog_pointer_v1`: dedicated singleton public table with row `id = 'active'`.
- Supabase Storage: immutable snapshot JSON artifacts.

Public activation:

- Storage upload alone does not activate a release.
- `PublicCatalogRelease.status = 'committed'` alone does not make it active.
- Public activation is the single Transaction C update that commits the release, mirrors internal control state, updates `Site.publishedVersionId`, and updates `public_catalog_pointer_v1`.

Read paths:

- Before the first committed atomic pointer, legacy live DB public API may continue as temporary compatibility mode.
- The first successful Transaction C writes an irreversible cutover marker.
- After cutover, public API always reads committed release data and returns safe `503` if the committed release/pointer is damaged.
- After cutover, public API never returns to mutable `sites` draft rows.
- The frontend reads `public_catalog_pointer_v1`, fetches the immutable snapshot, verifies SHA-256, and uses LKG/static data only as client resilience, not as a mutable DB fallback.

Legacy manifest:

- `public-catalog/v1/manifest.json` is frozen.
- Atomic publication does not update it.
- No compatibility bridge writes legacy manifest data from atomic releases.
- Production frontend continues the currently deployed path until AP11.

## 9. Domain model

`Site` roles:

- Draft workspace for admin editing.
- Stable identity with optional pointers to draft and published validated versions.
- Derived public state from active release membership.

`SiteVersion` roles:

- Immutable candidate or valid public payload for exactly one site.
- Stores source and content fingerprints.
- Does not store `published` or `superseded` states.
- May be reused by rollback or by multiple releases without status mutation.

`PublicCatalogRelease` roles:

- Owns activation revision, snapshot artifact revision, candidate fingerprint, immutable settings, idempotency key, lease, and storage metadata.
- Represents a whole-catalog candidate. It never publishes a partial subset after blockers are found.

`PublicCatalogReleaseItem` roles:

- Binds one release to one `SiteVersion` belonging to the same site.
- Stores deterministic membership facts used for rebuild parity.
- Becomes immutable after the parent release leaves `candidate`.

`PublicCatalogControl` roles:

- Internal singleton for admin status, lease compatibility, cutover markers, and mirrors of active release metadata.
- Not the public anonymous pointer.

`public_catalog_pointer_v1` roles:

- Public singleton table containing only active committed public release metadata.
- Source for frontend pointer reads through Supabase REST.
- Does not include settings; settings are read from verified immutable snapshot bytes.

## 10. Database model

Final naming uses Prisma camelCase with PostgreSQL snake_case mappings.

`sites` additive fields:

- `draftVersionId` mapped to `draft_version_id`, nullable UUID.
- `publishedVersionId` mapped to `published_version_id`, nullable UUID.
- `publicationState` mapped to `publication_state`, text, default `draft`.
- `publicationUpdatedAt` mapped to `publication_updated_at`, timestamptz nullable.
- `publicationErrorCode` mapped to `publication_error_code`, text nullable.
- `publicationErrorPath` mapped to `publication_error_path`, text nullable.

`Site.publicationState` allowed values:

- `draft`
- `validating`
- `validation_failed`
- `ready_to_publish`

Derived public site states, not stored as `Site.publicationState`:

- `never_published`: no active committed release item and no `publishedVersionId`.
- `current`: `publishedVersionId` is included in the active committed release and source fingerprint still matches current public dependencies.
- `stale`: current source fingerprint differs from `publishedVersionId.sourceFingerprintSha256`, or a dependent category/image/public field changed after publication.
- `archived`: site is inactive, deleted, or intentionally excluded from future releases.

`site_versions` table:

- `id` UUID primary key.
- `site_id` UUID not null FK to `sites.id` with `ON DELETE RESTRICT`.
- `version_number` integer not null.
- `status` text not null.
- `public_payload` JSONB not null.
- `content_sha256` text not null.
- `source_fingerprint_sha256` text not null.
- `source_observed_at` timestamptz not null.
- `created_by_user_id` UUID nullable FK to `users.id` with `ON DELETE SET NULL`.
- `request_id` text not null.
- `validation_error_code` text nullable.
- `validation_error_path` text nullable.
- `created_at` timestamptz not null default current timestamp.
- `updated_at` timestamptz not null default current timestamp.

`site_versions.status` allowed values:

- `candidate`
- `valid`
- `rejected`
- `archived`

`site_versions` constraints and indexes:

- Unique `(id, site_id)`.
- Unique `(site_id, version_number)`.
- Unique `(site_id, content_sha256)`.
- Check `version_number >= 1`.
- Check `content_sha256 ~ '^[a-f0-9]{64}$'`.
- Check `source_fingerprint_sha256 ~ '^[a-f0-9]{64}$'`.
- Check `jsonb_typeof(public_payload) = 'object'`.
- Index `(site_id, status)`.
- Index `(source_fingerprint_sha256)`.
- Index `(content_sha256)`.

Composite FKs preventing cross-site references:

- `sites(draft_version_id, id)` references `site_versions(id, site_id)`.
- `sites(published_version_id, id)` references `site_versions(id, site_id)`.
- `public_catalog_release_items(site_version_id, site_id)` references `site_versions(id, site_id)`.

`public_catalog_releases` table:

- `id` UUID primary key.
- `revision` integer not null unique.
- `snapshot_revision` integer not null.
- `idempotency_key` text not null unique.
- `status` text not null.
- `candidate_fingerprint_sha256` text not null.
- `settings_payload` JSONB not null.
- `settings_sha256` text not null.
- `snapshot_path` text nullable.
- `snapshot_url` text nullable.
- `snapshot_sha256` text nullable.
- `items_count` integer nullable.
- `generated_at` timestamptz not null.
- `committed_at` timestamptz nullable.
- `failed_at` timestamptz nullable.
- `source_release_id` UUID nullable FK to `public_catalog_releases.id` with `ON DELETE RESTRICT`.
- `rollback_of_release_id` UUID nullable FK to `public_catalog_releases.id` with `ON DELETE RESTRICT`.
- `retry_of_release_id` UUID nullable FK to `public_catalog_releases.id` with `ON DELETE RESTRICT`.
- `attempt_number` integer not null default `1`.
- `lease_id` text nullable.
- `lease_expires_at` timestamptz nullable.
- `lock_version` integer not null default `0`.
- `failure_stage` text nullable.
- `failure_code` text nullable.
- `failure_class` text nullable.
- `failure_kind` text nullable.
- `request_id` text not null.
- `created_by_user_id` UUID nullable FK to `users.id` with `ON DELETE SET NULL`.
- `created_at` timestamptz not null default current timestamp.
- `updated_at` timestamptz not null default current timestamp.

`public_catalog_releases.status` allowed values:

- `candidate`
- `validating`
- `snapshot_built`
- `storage_uploading`
- `storage_verified`
- `committed`
- `failed`

`public_catalog_releases` constraints and indexes:

- Check `revision >= 1`.
- Check `snapshot_revision >= 1`.
- Check `attempt_number >= 1`.
- Check `lock_version >= 0`.
- Check `candidate_fingerprint_sha256 ~ '^[a-f0-9]{64}$'`.
- Check `settings_sha256 ~ '^[a-f0-9]{64}$'`.
- Check `snapshot_sha256 IS NULL OR snapshot_sha256 ~ '^[a-f0-9]{64}$'`.
- Check `items_count IS NULL OR items_count >= 0`.
- Check normal publication has `revision = snapshot_revision` and `source_release_id IS NULL`.
- Check rollback has `revision > snapshot_revision`, `source_release_id IS NOT NULL`, and `rollback_of_release_id IS NOT NULL`.
- Check committed rows have `snapshot_path`, `snapshot_url`, `snapshot_sha256`, `items_count`, and `committed_at`.
- Index `(status, revision)`.
- Index `(lease_expires_at)`.
- Index `(candidate_fingerprint_sha256)`.

`public_catalog_release_items` table:

- `release_id` UUID not null FK to `public_catalog_releases.id` with `ON DELETE CASCADE`.
- `site_id` UUID not null FK to `sites.id` with `ON DELETE RESTRICT`.
- `site_version_id` UUID not null.
- `slug` text not null.
- `sort_order` integer not null.
- `content_sha256` text not null.
- Primary key `(release_id, site_id)`.

`public_catalog_release_items` constraints and indexes:

- Composite FK `(site_version_id, site_id)` references `site_versions(id, site_id)`.
- Unique `(release_id, slug)`.
- Unique `(release_id, sort_order, slug)`.
- Check `sort_order >= 0`.
- Check `content_sha256 ~ '^[a-f0-9]{64}$'`.
- Index `(site_version_id, site_id)`.

`public_catalog_control` additive fields:

- `activeReleaseId` mapped to `active_release_id`, nullable UUID FK to `public_catalog_releases.id`.
- `activeRevision` mapped to `active_revision`, integer not null default `0`.
- `activeSnapshotRevision` mapped to `active_snapshot_revision`, integer nullable.
- `atomicCutoverAt` mapped to `atomic_cutover_at`, timestamptz nullable.
- `atomicCutoverReleaseId` mapped to `atomic_cutover_release_id`, UUID nullable.
- `mutableDbFallbackDisabled` mapped to `mutable_db_fallback_disabled`, boolean not null default `false`.
- `legacyManifestFrozenAt` mapped to `legacy_manifest_frozen_at`, timestamptz nullable.
- Existing sync fields remain internal status mirrors.

`public_catalog_pointer_v1` singleton table:

- `id` text primary key, always `active`.
- `schema_version` integer not null, always `1`.
- `revision` integer not null.
- `snapshot_revision` integer not null.
- `items_count` integer not null.
- `sha256` text not null.
- `snapshot_path` text not null.
- `snapshot_url` text not null.
- `generated_at` timestamptz not null.
- `committed_at` timestamptz not null.

Pointer constraints:

- Check `id = 'active'`.
- Check `schema_version = 1`.
- Check `revision >= 1`.
- Check `snapshot_revision >= 1`.
- Check `revision >= snapshot_revision`.
- Check `items_count >= 0`.
- Check `sha256 ~ '^[a-f0-9]{64}$'`.

Staged migration order for circular nullable relations:

- Create new tables and nullable columns without composite constraints.
- Backfill locally or in the owner-approved production backfill stage.
- Add composite constraints after data is internally consistent.
- Verify constraints and trigger behavior with integration tests.
- Do not delete existing data as part of this migration path.

## 11. Publication state machine

Site draft-validation states:

| State | Meaning | Public effect |
| --- | --- | --- |
| `draft` | Mutable admin draft exists or changed after last validation. | No public change. |
| `validating` | Candidate payload/fingerprint is being derived. | No public change. |
| `validation_failed` | Candidate payload was rejected with safe field diagnostics. | Previous committed release remains active. |
| `ready_to_publish` | A valid `SiteVersion` exists for the current source fingerprint. | No public change until release commit. |

SiteVersion states:

| State | Meaning | Public effect |
| --- | --- | --- |
| `candidate` | Version payload is being validated. | No public change. |
| `valid` | Payload and source fingerprint are accepted and immutable. | Can be included in a release. |
| `rejected` | Payload failed validation. | Cannot be included in a release. |
| `archived` | Version is retained but unavailable for new releases. | Existing committed releases may still reference older valid versions. |

Release states:

| State | Meaning | Public effect |
| --- | --- | --- |
| `candidate` | Release row and membership may be assembled. | No pointer change. |
| `validating` | Candidate fingerprint, settings, source fingerprints, and payloads are checked. | No pointer change. |
| `snapshot_built` | Deterministic bytes and SHA are built from immutable inputs. | No pointer change. |
| `storage_uploading` | Immutable object upload/read-back is underway. | No pointer change. |
| `storage_verified` | Read-back bytes and SHA match exactly. | Eligible for Transaction C. |
| `committed` | Release metadata is immutable and may be active if pointer references it. | Public only when pointer row references it. |
| `failed` | Release attempt failed safely. | Previous active pointer remains. |

Derived public site states:

- `never_published`: no committed active release item for the site.
- `current`: active release item references `Site.publishedVersionId` and current source fingerprint still matches.
- `stale`: active release uses an older valid version after site/category/image/settings-independent public source changed.
- `archived`: site is excluded from future release candidates.

Invalid transitions return `INVALID_STATE_TRANSITION`, `PUBLIC_CATALOG_RELEASE_CONFLICT`, or the more specific safe code. No non-committed release state can update `public_catalog_pointer_v1`.

## 12. Transaction boundaries

AP0 dry-run boundary:

- Does not acquire a sync or release lease.
- Does not change `desiredRevision`.
- Does not write DB.
- Does not write Storage.
- Does not create snapshot objects.
- Builds the production-equivalent projection.
- Uses current code evidence to identify exact `snapshot_build` blockers.
- Returns `READY` or blockers containing `siteId`, `slug`, `itemIndex`, `fieldPath`, and `reasonCode`.
- Must pass local RED/GREEN tests before any owner-approved production dry-run.
- Production dry-run requires a separate owner gate.

Transaction A, site version validation after AP2:

- Lock the target site row.
- Build public payload from draft fields, category state, image descriptors, and relevant source versions.
- Compute `sourceFingerprintSha256`.
- Validate and normalize the payload.
- Insert or reuse `SiteVersion` by `(site_id, content_sha256)`.
- Store `draftVersionId` only when the version belongs to the same site through composite FK.
- Set `publicationState` to `ready_to_publish` or `validation_failed`.
- Write safe audit rows.
- Commit without changing public pointer or `publishedVersionId`.

Transaction B, release reservation:

- Acquire the release creation lock.
- Read all publishable sites and current source fingerprints.
- Automatically derive in-memory candidate versions for stale sites.
- Persist required valid versions only in the actual release path, never in AP0 dry-run.
- Reject the whole release if any site is invalid.
- Reserve monotonic activation `revision`.
- For normal publication, set `snapshotRevision = revision`.
- Capture immutable `settingsPayload` and `settingsSha256`.
- Compute `candidateFingerprintSha256`.
- Insert `PublicCatalogRelease` and `PublicCatalogReleaseItem` rows.
- Commit without Storage calls and without pointer change.

Network phase:

- Renew lease before Storage upload.
- Build bytes from release items and immutable `settingsPayload`.
- Compute SHA-256.
- Derive path from `snapshotRevision` and SHA-256.
- Upload with `upsert=false`.
- On same-path conflict, fetch and accept only exact byte/SHA match.
- Renew lease before read-back.
- Fetch public object with no credentials and no cache.
- Validate exact bytes, schema, `snapshotRevision`, item count, path, and checksum.
- Mark release `storage_verified` with CAS by release id, lease id, and lock version.

Transaction C, activation:

- Renew lease before entering the transaction.
- Lock `public_catalog_control`.
- Re-read release by id.
- Require `storage_verified`.
- Require CAS by `releaseId`, `leaseId`, and `lockVersion`.
- Require exact revision, snapshotRevision, SHA, path, URL, settings SHA, and item count.
- Require no newer active revision.
- Update `PublicCatalogRelease.status` to `committed`.
- Update `PublicCatalogControl` active fields and cutover marker.
- Update `Site.publishedVersionId` for included sites.
- Upsert `public_catalog_pointer_v1` row `active`.
- Mark `mutableDbFallbackDisabled = true` on first atomic commit.
- Write audit rows.
- Commit. This is the only public activation boundary.

Failure marking:

- Failure before Transaction C marks the release `failed` with safe stage/code/class/kind/request.
- Failure after Transaction C is not automatically rolled back.
- Rollback is a separate owner-triggered pointer transaction.

## 13. Deterministic builder

AP1 owns the typed deterministic builder and normalization before schema work.

Inputs:

- Immutable `PublicCatalogRelease.settingsPayload`.
- Immutable release membership records.
- Immutable `SiteVersion.publicPayload`.
- Release `generatedAt`.
- Release `snapshotRevision`.

Canonical ordering:

- Primary: captured `sortOrder`.
- Secondary: captured `slug`.
- Tertiary: captured `siteId`.

Canonical JSON rules:

- UTF-8 JSON.
- Object keys sorted lexicographically at every level.
- Arrays preserve normalized semantic order.
- One trailing newline.
- No `undefined`.
- No `NaN`, `Infinity`, `-Infinity`, or `BigInt`.
- Dates are ISO 8601 UTC strings.
- `generatedAt` comes from the release row, not retry wall-clock time.
- SHA-256 is lowercase hex over exact bytes.

Snapshot envelope:

```json
{
  "generatedAt": "2026-08-02T00:00:00.000Z",
  "items": [],
  "itemsCount": 0,
  "revision": 1,
  "schemaVersion": 1,
  "settings": {
    "showDemoInModal": false
  }
}
```

Revision rules:

- Normal publication: `revision = snapshotRevision`; snapshot JSON `revision` equals both.
- Rollback: activation `revision` is new and monotonic; `snapshotRevision` remains the original artifact revision; snapshot JSON `revision` equals `snapshotRevision`.
- Frontend downgrade protection compares pointer `revision`.
- Frontend artifact verification requires `snapshot.revision === pointer.snapshotRevision`.
- Frontend also requires `snapshotPath` to contain the pointer `snapshotRevision` and pointer `sha256`.

Candidate fingerprint stable serialization:

```json
{
  "settings": {},
  "items": [
    {
      "siteId": "uuid",
      "siteVersionId": "uuid",
      "contentSha256": "64 lowercase hex",
      "slug": "site-slug",
      "sortOrder": 0
    }
  ]
}
```

`candidateFingerprintSha256` is the SHA-256 of this stable serialization after normalization.

## 14. Validation and normalization

Validation is fail-closed. A rejected field blocks the whole candidate release and returns safe diagnostics. No release publishes a partial subset.

Source fingerprint:

- `sourceFingerprintSha256` replaces `sourceSiteUpdatedAt` as the primary conflict token.
- It includes public draft fields from `Site`.
- It includes category id, slug, title, active flag, and category version/timestamp.
- It includes preview descriptor when supplied.
- It includes gallery descriptors.
- It includes image asset ids and storage paths.
- It includes relevant source timestamps or versions.
- It excludes settings.
- Settings are stored separately in release `settingsPayload` and included in `candidateFingerprintSha256`.

Before release reservation:

- Recompute each site's source fingerprint.
- If a selected valid version fingerprint mismatches, return `PUBLIC_CATALOG_SOURCE_CHANGED` with HTTP 409.
- Category and image changes mark related sites stale.
- Release dry-run automatically derives in-memory candidate versions for stale sites and reports blockers.
- Owner does not need to manually open each stale card.

String rules:

- Required public strings are trimmed and non-empty.
- Optional empty strings become `null`.
- Control characters are rejected.
- DTO field length caps are explicit in validation tests.

Slug rules:

- Slug must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Slug uniqueness is enforced inside each release.
- Duplicate slug blocks the full release with `PUBLIC_CATALOG_DUPLICATE_SLUG`.

Image policy:

- `previewImageUrl` may be `null`.
- `null` preview does not block publication.
- Frontend uses a bundled deterministic placeholder for missing preview.
- Supplied preview with invalid URL or descriptor blocks the candidate.
- `galleryImages = []` is valid.
- Supplied invalid gallery item blocks the candidate.
- Bad gallery items are not silently removed.

URL rules:

- Credentials and fragments are always rejected.
- Managed image URLs must match configured public origin, bucket `web00-catalog-images`, canonical site id, asset id, slot, width, and format.
- Legacy asset paths normalize only through the existing safe catalog asset policy.
- Public snapshot and pointer URLs cannot contain credentials, fragments, service-role material, or signed secret query parameters.

Backfill and acceptance tests use this preview policy: missing preview passes with placeholder; invalid supplied preview blocks.

## 15. Storage protocol

Atomic storage uses immutable snapshot objects only.

Snapshot path:

```text
public-catalog/atomic/v1/snapshots/revision-<10-digit-snapshotRevision>-sha256-<64-lowercase-hex>.json
```

Example:

```text
public-catalog/atomic/v1/snapshots/revision-0000000042-sha256-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.json
```

Upload contract:

- Supabase Storage object upload.
- Service-role credentials used only by backend.
- `content-type`: `application/json; charset=utf-8`.
- `cache-control`: `public, max-age=31536000, immutable`.
- `x-upsert`: `false`.
- Timeout is finite.
- No credentials appear in logs or public DTOs.

Read-back contract:

- Fetch the public object URL with `credentials: omit`, `cache: no-store`, and `redirect: error`.
- Require HTTP success.
- Require JSON content type.
- Require exact byte equality with built bytes.
- Parse and validate schema.
- Recompute SHA-256 over fetched bytes.
- Require fetched SHA equals `snapshotSha256`.
- Require snapshot JSON `revision` equals release `snapshotRevision`.
- Require object path contains release `snapshotRevision` and `snapshotSha256`.

Rollback storage:

- Rollback does not rebuild a snapshot.
- Rollback reuses source release `snapshotPath`, `snapshotUrl`, and `snapshotSha256`.
- Rollback verifies the reused artifact before Transaction C.
- Rollback creates a new activation `revision` with the old `snapshotRevision`.

Retention:

- Never delete the active pointer artifact.
- Never delete rollback source artifacts.
- Preserve the last 20 committed activation releases and any artifact referenced by them.
- Cleanup runs asynchronously after commit.
- Cleanup failure never changes pointer status.

## 16. Public pointer

Chosen pointer contract: dedicated singleton table `public_catalog_pointer_v1`.

Fields:

- `id = 'active'`.
- `schema_version`.
- `revision`.
- `snapshot_revision`.
- `items_count`.
- `sha256`.
- `snapshot_path`.
- `snapshot_url`.
- `generated_at`.
- `committed_at`.

Rules:

- The table contains only public data.
- The table contains no settings.
- Settings are read only from the verified immutable snapshot.
- Transaction C atomically updates `PublicCatalogRelease`, `PublicCatalogControl`, `Site.publishedVersionId`, and `public_catalog_pointer_v1`.
- The pointer row exists only after first atomic commit.
- Pointer `revision` is the activation revision.
- Pointer `snapshot_revision` is the artifact revision inside the snapshot.
- Frontend uses `revision` for downgrade protection.
- Frontend verifies `snapshot.revision === snapshot_revision`.
- Frontend verifies `snapshot_path` contains `snapshot_revision` and `sha256`.

Security:

- RLS is enabled on `public_catalog_pointer_v1`.
- Anonymous public role has only `SELECT` on the active row.
- Authenticated users do not receive write permissions.
- Backend/service role performs writes.
- Base release/version/control tables are not opened to anonymous clients.
- Service-role key never enters frontend code or runtime config.
- Frontend runtime config contains only public project URL and publishable key.
- Supabase REST request uses configured public project URL and publishable key.
- This design does not write real environment values.

## 17. Idempotency and locking

`PublicCatalogRelease` stores:

- `idempotencyKey`.
- `candidateFingerprintSha256`.
- `leaseId`.
- `leaseExpiresAt`.
- `lockVersion`.
- `settingsPayload`.
- `settingsSha256`.

Idempotency behavior:

- Same idempotency key and same candidate fingerprint returns replay.
- Same idempotency key and different candidate fingerprint returns HTTP 409 `IDEMPOTENCY_CONFLICT`.
- Committed release returns the previous success payload.
- Active release returns current active release metadata.
- Permanent failure requires content correction and a new idempotency key.
- Retriable failure requires explicit retry of the existing release.
- Retry does not read current mutable settings.
- Retry reuses the same `settingsPayload`, `settingsSha256`, candidate fingerprint, membership, `generatedAt`, and `snapshotRevision`.
- Retry may reuse existing Storage object only after exact read-back verification.

Lease contract:

- TTL is 120 seconds.
- No background worker is required.
- Lease is renewed before Storage upload.
- Lease is renewed before Storage read-back.
- Lease is renewed before Transaction C.
- Each renewal uses CAS by `releaseId`, `leaseId`, and `lockVersion`.
- Each status transition increments `lockVersion`.
- Stale lease can be safely released after expiry.
- A stale lease release does not activate or fail a release by itself.

## 18. Admin API

Future admin API:

- `POST /api/admin/public-catalog/dry-run`
- `GET /api/admin/public-catalog/status`
- `POST /api/admin/sites/:id/publication/validate`
- `POST /api/admin/sites/:id/publication/approve`
- `POST /api/admin/public-catalog/releases`
- `GET /api/admin/public-catalog/releases/:id`
- `POST /api/admin/public-catalog/releases/:id/retry`
- `POST /api/admin/public-catalog/rollback`

AP0 dry-run endpoint:

- Read-only.
- No lease.
- No DB writes.
- No Storage writes.
- No `desiredRevision` mutation.
- No snapshot object creation.
- Returns `READY` or blockers.

Dry-run blocker shape:

```json
{
  "siteId": "uuid-or-null",
  "slug": "dom-dlya-busi",
  "itemIndex": 0,
  "fieldPath": "galleryImages[2].url",
  "reasonCode": "PUBLIC_CATALOG_ASSET_INVALID"
}
```

Permissions:

- Existing `maintenance.publicCatalog` controls catalog dry-run, release, retry, status, and rollback.
- Existing `site.publish` controls site public approval.
- Editor draft permissions remain draft-only.

Confirmations:

- Existing `WEB00-PUBLIC-CATALOG-SYNC-V1` stays bound to the legacy manual sync path only.
- Atomic release confirmation: `WEB00-PUBLIC-CATALOG-PUBLISH-V1`.
- Rollback confirmation: `WEB00-PUBLIC-CATALOG-ROLLBACK-V1`.

Errors:

- All API failures use safe `AppError` response shape.
- Raw provider response, SQL text, stack traces, service-role values, request bodies, signed URLs, cookies, and tokens are never returned.

## 19. Admin UX

Admin UX states:

- Draft saved.
- Validation running.
- Validation failed with safe field blockers.
- Ready to publish.
- Release running.
- Release failed with stage/code/request ID.
- Release committed.
- Rollback available.

Card publication panel:

- Shows draft hash, source fingerprint, valid version hash, active published version hash, and derived public state.
- Does not show a site as public only because `Site.publicationState = ready_to_publish`.
- Shows missing preview as allowed with placeholder behavior.
- Shows invalid supplied preview/gallery items as blockers.

Catalog maintenance panel:

- Runs AP0 dry-run before release.
- Shows `READY` or blockers with `siteId`, `slug`, `itemIndex`, `fieldPath`, and `reasonCode`.
- Shows active activation revision, snapshot revision, items count, checksum, snapshot path, last failure stage, safe code, request ID, and cutover marker.
- Shows whether `dom-dlya-busi` / `Дом для Буси` is present in the active committed snapshot after AP10.
- Requires exact confirmation for release and rollback.
- Retry appears only for retriable failed releases.

No admin UI text may claim public success before pointer row, release row, and verified snapshot agree on revision/snapshotRevision/SHA/count.

## 20. Frontend resilience

Frontend source order after AP11:

- Render static `WEB00_DATA` immediately.
- Read validated CacheStorage last-known-good.
- Fetch `public_catalog_pointer_v1` through Supabase REST.
- Use only configured public project URL and publishable key.
- Fetch immutable snapshot from pointer.
- Verify SHA-256 with Web Crypto.
- Validate schema, item count, `snapshotRevision`, path, and settings.
- Replace catalog only with a valid equal-or-newer activation `revision`.
- Persist valid snapshot as LKG.

Rules:

- Pointer `revision` protects against downgrade.
- `snapshot.revision` must equal pointer `snapshotRevision`.
- `snapshotPath` must contain pointer `snapshotRevision` and `sha256`.
- Settings come only from verified immutable snapshot bytes.
- Pointer settings are not read because pointer has no settings.
- Missing preview renders bundled deterministic placeholder.
- Pointer fetch failure does not clear visible catalog.
- Snapshot fetch or checksum failure does not clear visible catalog.
- Older activation revision cannot replace newer LKG.
- Render API is not called on the initial atomic critical path.

Before AP11:

- Production frontend continues current deployed path.
- PR #14 remains WAIT.
- AP7 changes PR #14 branch to pointer-first logic.
- Merge of PR #14 is allowed only after AP10 production acceptance.

## 21. Migration and backfill

Migration principles:

- Additive migrations only.
- Old migrations are not edited.
- Schema work starts only after AP0 dry-run/RCA and AP1 typed builder/normalization pass.
- Production migration is a separate owner-authorized action.
- No migration command is added to Render `build` or `start`.

Staged order:

- Create tables/columns without composite constraints that depend on backfilled nullable relations.
- Run backfill locally/test first and production only in AP9.
- Add composite constraints after data is internally consistent.
- Verify constraints, triggers, and pointer RLS.
- Preserve existing data.

Backfill policy:

- Backfill reads current public-visible rows through the production-equivalent projection.
- Missing preview passes and uses frontend placeholder.
- Invalid supplied preview blocks candidate.
- Empty gallery passes.
- Invalid supplied gallery item blocks candidate.
- Category/image/source fingerprint mismatch creates stale candidate state.
- One invalid site blocks the full release.
- No partial release is committed.

Cutover:

- Before first atomic committed release, legacy live DB path is temporary compatibility mode.
- First atomic commit sets `mutableDbFallbackDisabled = true`.
- After cutover, public API returns committed release data or safe `503`.
- After cutover, public API never falls back to mutable `sites` rows.

## 22. Rollback

Rollback model:

- `revision` is monotonic activation revision.
- `snapshotRevision` is the revision written inside the immutable snapshot.
- Normal publication has `revision = snapshotRevision`.
- Rollback gets a new monotonic `revision`.
- Rollback keeps `snapshotRevision` from the source artifact.
- Rollback reuses old `snapshotPath`, `snapshotUrl`, and `snapshotSha256`.
- `sourceReleaseId` points to the committed release whose artifact is reused.
- `rollbackOfReleaseId` points to the active release being rolled back from.
- Snapshot is not rebuilt.

Rollback verification:

- Backend verifies source release exists.
- Backend verifies source artifact is readable.
- Backend verifies fetched bytes match source SHA.
- Backend verifies snapshot JSON `revision` equals source `snapshotRevision`.
- Backend verifies path contains source `snapshotRevision` and SHA.
- Transaction C writes new pointer activation revision after verification.

Rollback does not:

- Delete release rows.
- Delete Storage objects.
- Mutate `SiteVersion.publicPayload`.
- Change `SiteVersion.status`.
- Rewrite old committed release metadata.
- Run arbitrary SQL.

Frontend accepts rollback only because activation `revision` increases. It still verifies the older artifact via `snapshotRevision`.

## 23. Audit and observability

Audit actions:

- `public_catalog.dry_run`
- `site.public_version.validate`
- `site.public_version.reject`
- `site.public_version.approve`
- `public_catalog.release.create`
- `public_catalog.release.storage_verified`
- `public_catalog.release.commit`
- `public_catalog.release.fail`
- `public_catalog.release.retry`
- `public_catalog.release.rollback`
- `public_catalog.pointer.update`
- `public_catalog.cutover`

Audit entity types:

- Site version actions use `entityType = 'site'` and `entityId = site.id`.
- Catalog release actions use `entityType = 'public_catalog'` and `entityId = release.id`.
- Dry-run with no release may use `entityType = 'public_catalog'` and `entityId = NULL`.

Safe failed-stage logs:

- Keep existing current stages during legacy path.
- Add atomic stages: `dry_run_projection`, `version_validate`, `release_reserve`, `source_fingerprint`, `settings_capture`, `snapshot_build`, `snapshot_upload`, `snapshot_verify`, `pointer_commit`, `rollback_verify`, `rollback_commit`.
- Log only `requestId`, `stage`, safe `errorCode`, `errorClass`, `revision`, and `durationMs`.

Safe error codes:

- Preserve current storage/sync codes exactly.
- Add `PUBLIC_CATALOG_SOURCE_CHANGED`.
- Add `PUBLIC_CATALOG_VALIDATION_FAILED`.
- Add `PUBLIC_CATALOG_DUPLICATE_SLUG`.
- Add `PUBLIC_CATALOG_ASSET_INVALID`.
- Add `PUBLIC_CATALOG_STORAGE_CONFLICT`.
- Add `PUBLIC_CATALOG_RELEASE_CONFLICT`.
- Add `PUBLIC_CATALOG_POINTER_COMMIT_FAILED`.
- Add `IDEMPOTENCY_CONFLICT`.
- Unknown errors remain `PUBLIC_CATALOG_SYNC_FAILED`.

## 24. Failure matrix

| Failure | Stage | Public effect | Stored diagnostic | Retry behavior |
| --- | --- | --- | --- | --- |
| AP0 blocker found | `dry_run_projection` | No mutation | blocker with siteId/slug/itemIndex/fieldPath/reasonCode | Fix source then rerun dry-run |
| Source fingerprint changed | `source_fingerprint` | Old release stays active | `PUBLIC_CATALOG_SOURCE_CHANGED` HTTP 409 | Re-reserve after revalidation |
| Category change invalidates site | `source_fingerprint` | Old release stays active | stale site blocker | Dry-run derives new candidate |
| Image change invalidates site | `source_fingerprint` | Old release stays active | stale site blocker | Dry-run derives new candidate |
| Invalid required text | `version_validate` | Old release stays active | `PUBLIC_CATALOG_VALIDATION_FAILED` | Requires content fix |
| Missing preview | `version_validate` | Candidate may proceed | placeholder evidence | No retry needed |
| Invalid supplied preview | `version_validate` | Old release stays active | `PUBLIC_CATALOG_ASSET_INVALID` | Requires asset fix |
| Empty gallery | `version_validate` | Candidate may proceed | none | No retry needed |
| Invalid supplied gallery item | `version_validate` | Old release stays active | `PUBLIC_CATALOG_ASSET_INVALID` | Requires asset fix |
| Duplicate slug | `release_reserve` | Old release stays active | `PUBLIC_CATALOG_DUPLICATE_SLUG` | Requires slug fix |
| Same key different fingerprint | `release_reserve` | Old release stays active | `IDEMPOTENCY_CONFLICT` HTTP 409 | New key or original candidate |
| Lease renewal conflict | `lease` | Old release stays active | `PUBLIC_CATALOG_RELEASE_CONFLICT` | Re-read release |
| Stale lease | `lease` | Old release stays active | safe stale lease event | Retry after expiry |
| Snapshot exceeds limits | `snapshot_build` | Old release stays active | `PUBLIC_CATALOG_SNAPSHOT_INVALID` | Requires payload fix |
| Settings changed during retry | `snapshot_build` | Retry bytes unchanged | settings SHA evidence | No mutable read |
| Storage config invalid | `snapshot_upload` | Old release stays active | `PUBLIC_CATALOG_STORAGE_CONFIGURATION_INVALID` | Requires config fix |
| Storage timeout | `snapshot_upload` or `snapshot_verify` | Old release stays active | `PUBLIC_CATALOG_STORAGE_TIMEOUT` | Explicit retry |
| Storage conflict bytes differ | `snapshot_upload` | Old release stays active | `PUBLIC_CATALOG_STORAGE_CONFLICT` | RCA required |
| Fetched bytes mismatch | `snapshot_verify` | Old release stays active | `PUBLIC_CATALOG_SNAPSHOT_INVALID` | RCA required |
| Pointer commit conflict | `pointer_commit` | Old/newer release remains active | `PUBLIC_CATALOG_POINTER_COMMIT_FAILED` | Re-read active pointer |
| Rollback source artifact invalid | `rollback_verify` | Current active release unchanged | rollback safe code | Choose valid source |
| Pointer damaged after cutover | public API read | API returns safe 503 | safe server code | Owner rollback/RCA |
| Frontend checksum mismatch | frontend verify | Visible data remains LKG/static | frontend safe code | Retry without clearing |
| Unknown exception | any stage | Old release stays active | `PUBLIC_CATALOG_SYNC_FAILED` | RCA before retry |

## 25. Testing strategy

AP0 dry-run tests:

- Dry-run gets no lease.
- Dry-run does not change `desiredRevision`.
- Dry-run writes zero DB rows.
- Dry-run writes zero Storage objects.
- Dry-run creates no snapshot object.
- Dry-run returns `READY` or exact blockers with `siteId`, `slug`, `itemIndex`, `fieldPath`, and `reasonCode`.
- Local RED/GREEN proves a known bad projection fails before production dry-run is authorized.

Builder and normalization tests:

- Deterministic bytes are stable for identical typed input.
- Candidate fingerprint stable serialization matches the documented shape.
- Source fingerprint changes when public Site field changes.
- Source fingerprint changes when category id/slug/title/active/version changes.
- Source fingerprint changes when preview/image asset id or storage path changes.
- Settings do not enter source fingerprint.
- Settings enter candidate fingerprint and snapshot bytes.
- Missing preview uses placeholder.
- Invalid supplied preview blocks.
- Empty gallery passes.
- Invalid supplied gallery item blocks.

Database integration tests:

- `site_versions` has unique `(id, site_id)`.
- `sites(draft_version_id, id)` rejects a version from another site.
- `sites(published_version_id, id)` rejects a version from another site.
- `public_catalog_release_items(site_version_id, site_id)` rejects a foreign site version.
- Valid `SiteVersion` payload update is rejected by trigger.
- Valid `SiteVersion.contentSha256` update is rejected by trigger.
- Valid `SiteVersion.sourceFingerprintSha256` update is rejected by trigger.
- Release item insert/update/delete is rejected after release leaves `candidate`.
- Committed release metadata update is rejected by trigger.
- Pointer RLS allows anon select active row only.
- Base release/version/control tables are not anonymous-readable.

Service tests:

- Same key and same fingerprint replays.
- Same key and different fingerprint returns `IDEMPOTENCY_CONFLICT`.
- Lease TTL is 120 seconds.
- Lease renewal CAS uses release id, lease id, and lock version.
- Stale lease releases only after expiry.
- Settings changed during retry do not alter bytes.
- Normal release has `revision = snapshotRevision`.
- Rollback has `revision != snapshotRevision`.
- Rollback verifies source artifact revision.
- Rollback reuses source snapshot path and SHA.
- Public pointer returns activation revision and snapshot revision.
- Legacy mutable rows never leak after atomic cutover.

Frontend tests:

- Frontend uses pointer `revision` for downgrade protection.
- Frontend verifies `snapshot.revision === snapshotRevision`.
- Frontend verifies path contains `snapshotRevision` and SHA.
- Pointer has no settings; settings come from verified snapshot.
- Pointer/snapshot failure does not clear visible data.
- Missing preview renders deterministic bundled placeholder.
- PR #14 pointer-first branch does not call Render on the initial critical path after AP11.

Full future checkpoint:

- Focused public catalog unit tests.
- Focused admin integration tests.
- Focused Prisma migration/invariant tests.
- Focused frontend pointer/LKG tests.
- Full `npm run check`.

## 26. Delivery decomposition

Design Gate, this document:

- Scope: owner-approved design decisions only.
- Runtime effect: none.
- Not AP0.
- No code, schema, migration, production access, sync, commit, push, or deploy.

AP0, production-equivalent snapshot dry-run and exact RCA:

- Scope: read-only dry-run path and blocker reporting.
- Must not acquire lease, mutate `desiredRevision`, write DB, write Storage, or create objects.
- Returns `READY` or blockers with `siteId`, `slug`, `itemIndex`, `fieldPath`, and `reasonCode`.
- Local RED/GREEN tests first.
- Production dry-run only under separate owner gate.
- Schema implementation is prohibited before AP0 passes.

AP1, typed deterministic builder and normalization:

- Scope: typed DTO validation, source fingerprint, candidate fingerprint, settings capture shape, deterministic bytes.
- Tests: builder, normalization, fingerprint, preview/gallery policy, settings immutability tests.
- Acceptance: AP1 builder can reproduce production-equivalent bytes and blockers locally.
- Schema implementation is prohibited before AP1 passes.

AP2, additive SiteVersion/PublicCatalogRelease schema:

- Scope: additive tables, columns, composite FKs, pointer singleton table, RLS, triggers.
- Tests: migration, composite FK, trigger, RLS integration tests.
- Acceptance: cross-site references are impossible and immutable rows cannot be mutated after valid/committed boundaries.

AP3, atomic publication orchestrator/idempotency:

- Scope: release reservation, idempotency, leases, CAS, retry behavior, no partial releases.
- Tests: same key replay, conflict, lease TTL, renewal, stale lease, source changed.
- Acceptance: all pre-pointer failures leave active pointer unchanged.

AP4, public pointer/storage retention:

- Scope: immutable Storage path, upload/read-back verify, singleton pointer write, retention.
- Tests: upload conflict same/different bytes, pointer fields, retention protections.
- Acceptance: pointer exposes only public data and no settings.

AP5, admin publication API/UX:

- Scope: dry-run UI, site validation panel, release/rollback/retry UI, safe blockers.
- Tests: RBAC, confirmations, safe diagnostics, no false success.
- Acceptance: owner can see blockers and release state without raw secrets.

AP6, public API committed-release reads:

- Scope: switch public API to committed release data after cutover.
- Tests: before cutover legacy compatibility; after cutover no mutable fallback; safe 503 on damaged pointer/release.
- Acceptance: mutable draft rows never leak after atomic cutover.

AP7, frontend pointer/LKG/fallback:

- Scope: update PR #14 branch to pointer-first, snapshotRevision verification, LKG, placeholder image, no Render critical path.
- Tests: pointer/LKG/fallback/checksum/downgrade tests.
- Acceptance: PR #14 remains unmerged but updated for atomic contract.

AP8, failure injection/recovery:

- Scope: fault injection across dry-run, validation, storage, leases, pointer, rollback, frontend resilience.
- Tests: all failure matrix rows.
- Acceptance: every failure keeps old public release or current visible data.

AP9, controlled production migration/backfill:

- Scope: owner-approved migration and backfill after AP0-AP8 pass.
- Tests: production-safe verification gates, no destructive data deletion.
- Acceptance: production has schema and backfilled candidates without public cutover unless release commits.

AP10, first controlled publication:

- Scope: owner-approved first atomic release.
- Tests: health, ready, version, pointer active row, immutable snapshot bytes/SHA/count, `dom-dlya-busi` present.
- Acceptance: production atomic release accepted.

AP11, update and release frontend PR #14:

- Scope: final PR #14 pointer-first review/merge after AP10.
- Tests: frontend pointer-first production acceptance.
- Acceptance: frontend can consume committed atomic release and keep LKG/static resilience.

## 27. Acceptance criteria

Design amendment acceptance:

- AP0 is dry-run/RCA, not this design document.
- Recommended next step is AP0 implementation plan.
- Schema/migration is not the next step.
- Rollback revision model distinguishes `revision` and `snapshotRevision`.
- `SiteVersion` has only `candidate`, `valid`, `rejected`, and `archived`.
- `Site.publicationState` has only draft-validation states.
- Public site state is derived.
- Cross-site version references are impossible through composite FKs.
- DB immutability triggers are defined.
- Candidate fingerprint and source fingerprint are defined.
- Lease TTL, renewal points, CAS, and stale release rules are defined.
- Pointer contract is a dedicated singleton table, not a view.
- Pointer has no settings.
- Settings source is immutable release `settingsPayload`.
- Preview policy is unambiguous.
- Public API mutable DB fallback is permanently disabled after cutover.
- Legacy mutable manifest is frozen and no bridge is created.
- PR #14 remains WAIT and is updated in AP7, merged only after AP10.
- No alternatives remain unresolved.

Future production acceptance:

- Production migration authorized and applied in AP9.
- First atomic release authorized and run in AP10.
- `/api/health`, `/api/ready`, and `/api/version` pass.
- Pointer active row has expected activation revision and snapshot revision.
- Immutable snapshot is readable.
- Snapshot SHA-256 matches pointer.
- Snapshot JSON revision equals pointer snapshot revision.
- Item count matches owner expectation.
- `dom-dlya-busi` / `Дом для Буси` is present.
- Frontend PR #14 remains WAIT until these checks pass.

## 28. Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| AP0 dry-run differs from production sync | Wrong RCA | Production-equivalent projection, local RED/GREEN, owner gate before production dry-run |
| Schema work starts too early | Locks in wrong contract | AP0/AP1 pass required before AP2 |
| Rollback revision confuses frontend downgrade logic | Valid rollback rejected | Pointer exposes activation `revision` and artifact `snapshotRevision`; tests cover rollback |
| Cross-site version reference | Wrong payload published | Composite FKs with `(id, site_id)` and integration tests |
| Valid payload mutated after approval | Non-reproducible release | PostgreSQL immutability triggers |
| Settings read during retry | Retry bytes change | Retry uses immutable `settingsPayload` only |
| Missing preview policy misunderstood | Valid card blocked | Null preview allowed and placeholder tested |
| Invalid gallery silently disappears | Hidden data loss | Invalid supplied gallery item blocks release |
| Mutable DB fallback remains after cutover | Draft leak | Irreversible cutover marker and API tests |
| Legacy manifest bridge reintroduces split brain | Two public pointers | Legacy manifest frozen and no bridge |
| PR #14 consumes old manifest contract | Frontend mismatch | AP7 updates PR #14 to pointer-first |
| Production values leak to frontend | Secret exposure | Runtime config uses only public URL and publishable key |

## 29. Compatibility with existing code

Compatible pieces:

- Existing `PublicSiteDetail` DTO remains the public item baseline.
- Existing mapper and snapshot validation inform AP0/AP1.
- Existing `public_catalog_control` remains internal and is extended.
- Existing `audit_logs_entity_type_check` already supports `public_catalog`.
- Existing health/readiness/version endpoints remain release gates.
- Existing storage cleanup infrastructure can handle obsolete immutable artifacts.
- Existing `WEB00-PUBLIC-CATALOG-SYNC-V1` remains bound to legacy manual sync until the atomic path replaces owner workflow.

Required future changes:

- Public API reads committed releases after cutover.
- `site.publish` no longer means immediate public visibility.
- Category/image/public draft changes mark related sites stale.
- AP0 dry-run and AP1 builder diagnose blockers before schema work.
- PR #14 is changed to pointer-first and released only in AP11.

Compatibility boundary:

- Before first atomic commit, legacy live DB path may continue as temporary mode.
- First atomic commit disables mutable DB fallback permanently.
- Legacy mutable manifest remains frozen.
- Atomic publication writes no legacy manifest bridge.

## 30. Explicit decisions

Decisions:

- This document is the Design Gate and not AP0.
- AP0 is production-equivalent snapshot dry-run and exact RCA.
- AP1 is typed deterministic builder and normalization.
- AP2 is additive schema.
- Schema implementation is prohibited before AP0/AP1 pass.
- Public pointer is dedicated singleton table `public_catalog_pointer_v1`.
- Pointer contains no settings.
- Settings source is immutable `PublicCatalogRelease.settingsPayload`.
- `revision` is activation revision.
- `snapshotRevision` is artifact revision.
- Rollback uses new activation revision and old snapshot revision.
- Rollback reuses old snapshot path and SHA without rebuilding.
- `SiteVersion` statuses are `candidate`, `valid`, `rejected`, and `archived`.
- Publication fact is derived from `Site.publishedVersionId`, release items, and active committed release.
- Cross-site version references are prohibited through composite FKs.
- PostgreSQL triggers enforce DB immutability.
- Candidate fingerprint and source fingerprint are required.
- Lease TTL is 120 seconds with explicit renewal and CAS.
- Missing preview is valid and uses frontend placeholder.
- Invalid supplied preview or gallery item blocks candidate.
- After cutover, public API never falls back to mutable `sites`.
- Legacy mutable manifest is frozen and no bridge is created.
- PR #14 remains WAIT, is updated in AP7, and can merge only after AP10 acceptance.
- Unknown errors remain generic while specific safe public catalog codes are preserved.
- No production action is part of this documentation task.

Alternatives rejected:

- Pointer as a view: rejected because the owner chose a dedicated singleton table with RLS.
- Mutable manifest bridge: rejected because it creates a second public pointer.
- SiteVersion `published`/`superseded`: rejected because publication is derived.
- Required preview image: rejected because null preview uses deterministic placeholder.
- Mutable DB fallback after cutover: rejected because it can leak draft rows.
- Partial releases: rejected because owner chose whole-catalog fail-closed activation.

No alternatives remain unresolved.

## 31. Implementation blockers

External prerequisites before future code or production work:

- Owner approval of this amended design.
- Owner authorization for AP0 implementation plan.
- Environment values for local/test Supabase-compatible pointer and Storage testing.
- Owner authorization before any production dry-run.
- Owner authorization before any production migration, backfill, first publication, or frontend PR #14 merge.

No design decisions remain open in this section.

## 32. Recommended next step

Recommended next step: create the AP0 implementation plan for a production-equivalent read-only snapshot dry-run and exact RCA path.

AP0 must be local-first with RED/GREEN tests. It must not acquire a lease, mutate `desiredRevision`, write DB, write Storage, create snapshot objects, run sync, deploy, or touch production. Production dry-run is a later separate owner-gated action.
