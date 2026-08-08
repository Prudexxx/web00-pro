# WEB00 Atomic Cloud Primary Cutover Design

## Goal

Freeze the final Atomic Cloud Primary architecture for WEB00 public catalog reads and admin catalog writes.

Atomic Cloud Primary makes Cloud.ru Object Storage the primary public catalog runtime, with GitHub Pages loading the catalog directly from Cloud.ru. Render is removed from the critical public read path for catalog cards, so Render free-instance sleep or outage cannot hide already published cards.

## Current Verified State

These facts are accepted owner-assisted production evidence and are not rediscovered by this design freeze:

- PR #22 is merged.
- Render commit `4b7b5e1` is live.
- The production migration was recovered.
- Atomic shadow is enabled.
- Cloud.ru bucket is `web00-public-runtime`.
- Verified shadow prefix is `canary/shadow`.
- Real shadow manifest has `revision = 5` and `itemsCount = 17`.
- Real shadow immutable snapshot has `revision = 5` and `itemsCount = 17`.
- DB public catalog count is 17.
- Cloud.ru public read works.
- GitHub Pages browser CORS test returned HTTP 200 with `CLOUDRU_CORS_PASS = true`.
- Allowed CORS origin is `https://prudexxx.github.io`.
- Allowed public methods are `GET` and `HEAD`.
- Public runtime snapshot contains current production cards, including `WEB00 Smoke Updated`, `Дом для Буси`, and the existing production catalog.
- Render free-instance sleep must not affect public catalog visibility.

## Architecture

Public catalog source priority is:

1. Validated Cloud.ru Atomic Runtime under the production namespace.
2. Bundled static catalog fallback.

Render API is not a public catalog read fallback. The public site may still use Render for unrelated API flows, but it must not contact Render merely to display catalog cards.

Production namespace:

```text
runtime/production
```

Shadow namespace:

```text
canary/shadow
```

Canonical production runtime paths:

```text
runtime/production/catalog/v1/manifest.json
runtime/production/catalog/v1/releases/revision-{revision}-{sha256}.json
```

Shadow and production are separate targets. Code, durable state, manifests, and verification must treat them as different runtime identities, even when the catalog content is byte-for-byte identical.

## Public Read Path

The GitHub Pages frontend loads the catalog as follows:

1. Display the bundled static catalog immediately from the Pages build.
2. Start a background Cloud.ru production manifest fetch.
3. Fetch the mutable manifest with freshness-sensitive request semantics:
   - `cache: "no-store"`;
   - a cache-busting query parameter;
   - service worker network-first behavior for the manifest path.
4. Validate the manifest before trusting it:
   - `schemaVersion`;
   - `revision`;
   - `itemsCount`;
   - `sha256`;
   - `snapshotPath`;
   - `snapshotUrl`;
   - target identity fields, when present.
5. Fetch the immutable snapshot from `snapshotUrl`.
6. Calculate SHA-256 from the exact snapshot response bytes.
7. Compare the calculated SHA exactly with `manifest.sha256`.
8. Validate snapshot schema, revision, and item count against the manifest.
9. Replace the visible static catalog with the Cloud catalog only after every validation passes.
10. Save the validated Cloud result as last-known-good only when it belongs to the same production runtime target and fits existing safety limits.
11. On any Cloud failure, keep the current visible catalog stable.
12. End loading or retry UI deterministically; the catalog spinner must not hang.

Last-known-good data is a continuity cache, not a higher-priority source than fresh Cloud runtime. It must never override a valid fresh Cloud result and must not prevent bundled static catalog from rendering immediately. If an LKG entry is kept, it is accepted only when it matches the current runtime target identity and the same validation rules as a Cloud snapshot.

## Publisher/Write Path

Admin writes continue through the backend because the public frontend never receives write credentials.

Write sequence:

1. Admin UI sends the mutation to Render backend.
2. Backend authenticates and authorizes the admin request.
3. Supabase DB transaction applies the mutation.
4. If the public projection changed, the transaction advances durable `desiredRevision`.
5. After commit, backend schedules the automatic reconciler.
6. Admin mutation returns without waiting for Cloud.ru publication to finish.
7. Publisher acquires a fenced lease with CAS semantics.
8. Publisher builds deterministic snapshot bytes from the DB projection.
9. Publisher writes immutable snapshot first.
10. Publisher performs authenticated read-back.
11. Publisher performs public read-back.
12. Publisher verifies exact SHA and snapshot metadata.
13. Publisher verifies it still owns the lease.
14. Publisher writes the mutable manifest last.
15. Publisher performs public manifest verification.
16. Publisher finalizes DB state only after public manifest verification succeeds.

`publishedRevision` must never advance before public manifest verification. An old lease cannot finalize. If `desiredRevision` changes while a publication is in progress, the current publisher may finalize only the revision it actually published, and durable state must remain pending for the later desired revision.

If publication crashes before the manifest write, the previous public manifest remains valid. If publication crashes after manifest write but before DB finalize, recovery verifies the public manifest and immutable snapshot against the deterministic DB projection, revision, SHA, and target identity before finalizing or retrying.

## Automatic Reconciliation

Manual Sync is maintenance and recovery tooling, not the normal production workflow.

The automatic reconciler is triggered by:

- a successful admin mutation that changes public catalog projection;
- a successful public settings mutation that changes public runtime output;
- backend startup when durable state shows pending work, failed work, stale target identity, or unfinalized manifest evidence.

Reconciler requirements:

- single-flight per runtime target;
- bounded retry attempts with backoff;
- no infinite retry loop;
- no request blocking on Cloud.ru publication completion;
- admin mutation success does not depend on Cloud.ru availability;
- pending durable state survives process failure and restart;
- multiple rapid writes coalesce into the latest `desiredRevision`;
- a second worker cannot steal an unexpired live lease;
- manual admin sync remains available only for maintenance and recovery.

If Cloud.ru is unavailable, the reconciler records durable pending or failed state and schedules bounded retry. Public readers continue to use the last valid public manifest or bundled static fallback.

## Target Identity Invariant

The production activation bug must be impossible to repeat: `syncStatus = ready` and `desiredRevision = publishedRevision` are not sufficient proof that the configured runtime target is synchronized.

Smallest durable schema addition:

```text
public_catalog_control.published_runtime_target_key TEXT NULL
```

`published_runtime_target_key` is a deterministic, non-secret identity string computed from the active runtime target:

```text
provider=cloudru;bucket=web00-public-runtime;role=production;prefix=runtime/production;catalog=v1;manifest=runtime/production/catalog/v1/manifest.json
```

Shadow uses a different key:

```text
provider=cloudru;bucket=web00-public-runtime;role=shadow;prefix=canary/shadow;catalog=v1;manifest=canary/shadow/catalog/v1/manifest.json
```

Runtime readiness is true only when all of these are true:

- `desiredRevision === publishedRevision`;
- `syncStatus === "ready"`;
- `published_runtime_target_key === current configured runtime target key`;
- the public manifest and immutable snapshot verify for that same target.

Legacy rows with `published_runtime_target_key IS NULL` are not treated as synchronized for a newly configured production target. A row finalized for `canary/shadow` is not ready for `runtime/production`. Any runtime prefix, bucket, catalog version, manifest path, or role change requires reconciliation even if revisions are numerically equal.

On successful finalize, the publisher stores the current target key with the published revision. On target mismatch, the publisher republishes the current deterministic projection to the configured target; it does not assume a revision bump is required unless the public projection itself changed.

## Failure Semantics

- Render sleeping or down: public catalog still reads from GitHub Pages plus Cloud.ru runtime or static fallback.
- Cloud manifest unavailable: static catalog remains visible, and no Render catalog fallback is attempted.
- Cloud manifest stale through browser or service worker cache: manifest is fetched network-first with no-store/cache-busting semantics; stale manifest cannot permanently pin old cards.
- Cloud manifest invalid: frontend rejects it and keeps current visible catalog.
- Snapshot SHA mismatch: frontend rejects it and keeps current visible catalog.
- Snapshot revision or item count mismatch: frontend rejects it and keeps current visible catalog.
- Crash before immutable PUT: no public change.
- Crash after immutable PUT but before manifest PUT: old public manifest remains active.
- Crash after manifest PUT but before DB finalize: startup reconciliation verifies and finalizes only if manifest, snapshot, SHA, revision, item count, and target identity match.
- Rapid admin writes: latest `desiredRevision` wins; intermediate writes can coalesce safely.
- Active lease held by another publisher: later worker returns pending and writes nothing.
- Expired stale lease: later worker may acquire only through CAS and fencing checks.
- Cloud credential or provider setup failure: backend records setup-required or failed state without leaking credentials.

## Cache Strategy

Manifest caching policy:

- mutable manifest is freshness-sensitive;
- frontend uses `cache: "no-store"` plus a cache-busting query;
- service worker must not cache-first the manifest;
- service worker must not permanently pin `assets/js/data.js` or runtime manifest responses.

Snapshot caching policy:

- immutable snapshot may use normal browser and CDN caching;
- snapshot URL contains revision and SHA;
- snapshot bytes are trusted only after exact SHA-256 verification against the manifest.

Bundled static catalog policy:

- static catalog renders immediately on first paint;
- static catalog is the offline and Cloud-failure fallback;
- static catalog must not be overridden by stale LKG data during initial display.

Last-known-good policy:

- LKG may store only validated Cloud data;
- LKG must include the runtime target key it was validated against;
- LKG never beats a fresh valid Cloud manifest and snapshot;
- LKG never causes an empty or spinner-only catalog when static data exists.

## CORS/Security

Public frontend receives no:

- S3 credentials;
- Render secrets;
- Supabase secrets;
- admin tokens;
- signed write URLs.

Cloud.ru runtime is public read-only. Publisher credentials remain backend-only.

Cloud.ru CORS remains exact:

```text
origin: https://prudexxx.github.io
methods: GET, HEAD
```

Wildcard CORS is not part of this design. Any future wildcard CORS change requires separate approval.

Public URL construction must escape path segments, reject prefix traversal, and only generate URLs under the configured target prefix. Production code must not derive production paths from shadow paths by string replacement at runtime.

## Rollback

Frontend rollback:

- restore the previous GitHub Pages build;
- static fallback remains bundled in the Pages build;
- no backend rollback is required merely to restore public catalog visibility.

Runtime rollback:

- point the mutable production manifest to a previously verified immutable snapshot;
- verify snapshot SHA, revision, item count, schema, and target identity before rollback finalize;
- do not delete immutable historical releases during cutover or rollback.

Shadow rollback and diagnostics:

- `canary/shadow` remains available for diagnostics and evidence;
- shadow data must not be promoted by treating shadow durable state as production durable state.

## Migration/Cutover Sequence

1. Freeze this design document.
2. Add the backward-compatible target identity schema field while leaving existing runtime behavior unchanged.
3. Harden backend publisher readiness checks so target mismatch requires reconciliation.
4. Add focused tests for target mismatch, legacy null target, shadow-versus-production isolation, crash recovery, lease fencing, and coalescing.
5. Add automatic reconciler triggers after public projection mutations and on backend startup.
6. Add frontend Cloud runtime loader behind production runtime config, while preserving immediate bundled static render.
7. Add service worker cache rules required for manifest freshness and static fallback stability.
8. Run Node 22 focused and full differential gates with zero new failures.
9. Deploy backend code with migration support, without enabling destructive behavior.
10. Configure production runtime target as `runtime/production`.
11. Let startup or the approved maintenance sync publish the first production runtime manifest.
12. Verify production manifest, snapshot, public CORS, DB count, and current production cards.
13. Deploy the GitHub Pages frontend that reads Cloud.ru production runtime.
14. Run acceptance gates for Render awake, Render sleeping, Cloud unavailable, admin create/edit/unpublish/delete, rapid mutations, and stale-cache resistance.
15. Keep shadow enabled for diagnostics until owner approves any later cleanup.

There is no big-bang cutover. Backend publication, target identity hardening, frontend reader, service worker behavior, and production enablement are independently verifiable phases.

## Test Matrix

| Area | Required proof |
| --- | --- |
| Production manifest | Manifest schema, revision, item count, SHA, snapshot path, snapshot URL, and target identity are valid. |
| Snapshot integrity | Exact bytes SHA-256 matches manifest SHA. |
| Snapshot metadata | Snapshot revision and item count match manifest. |
| DB projection | DB public projection count matches snapshot item count. |
| CORS | GitHub Pages browser fetch to Cloud.ru returns HTTP 200 for allowed origin. |
| Current cards | `WEB00 Smoke Updated`, `Дом для Буси`, and existing production cards render from validated runtime. |
| Render awake | Catalog works without requiring Render for card display. |
| Render sleeping | Catalog still works from Cloud.ru or static fallback. |
| Cloud unavailable | Static catalog appears immediately and remains non-empty. |
| Admin edit | Successful public edit advances desired revision and schedules automatic publication. |
| Admin create | Successful public create advances desired revision and schedules automatic publication. |
| Admin unpublish/delete | Successful removal from public projection advances desired revision and new runtime no longer contains the card. |
| Rapid mutations | Multiple writes coalesce without losing the latest desired revision. |
| Crash before manifest | Previous public manifest remains valid. |
| No Render fallback | Public catalog rendering performs no Render catalog GET. |
| LKG freshness | Stale LKG cannot beat fresh valid Cloud runtime or immediate static fallback. |
| Service worker | Service worker cannot permanently pin stale manifest or data assets. |
| Secrets | No public secrets, credentials, tokens, signed write URLs, or provider errors leak. |
| Differential tests | Node 22 focused and full differential gates show zero new failures. |

## Acceptance Gates

Final implementation must prove:

1. Production manifest is valid.
2. Snapshot SHA exactly matches manifest.
3. Snapshot revision matches manifest.
4. Snapshot `itemsCount` matches manifest.
5. DB public projection count matches snapshot.
6. GitHub Pages CORS fetch passes.
7. Current production cards render.
8. Render awake still works.
9. Render sleeping or unavailable still works.
10. Cloud unavailable keeps static fallback working immediately.
11. Admin edit automatically publishes a new revision.
12. Admin create automatically publishes a new revision.
13. Unpublish/delete automatically publishes a new revision.
14. Rapid mutations coalesce correctly.
15. Crash before manifest preserves previous revision.
16. Public catalog display performs no Render catalog GET.
17. Stale LKG never beats fresh valid Cloud data.
18. Service worker cannot permanently pin stale manifest or data.
19. No secrets leak.
20. Node 22 focused and full differential gates have zero new failures.

## Explicit Non-Goals

- Admin redesign.
- New product features.
- Billing changes.
- Cloudflare migration.
- New hosting platform.
- UI redesign.
- Catalog content cleanup.
- Expanding Render's role in public catalog reads.
- Sending Cloud.ru, Render, Supabase, or admin secrets to the public frontend.
- Deleting immutable historical runtime releases during cutover.
- Applying production DB migrations as part of this design freeze.
- Mutating Cloud.ru, Render, Supabase, or GitHub Pages from this document-only task.

## Self Review

- No production code, Prisma schema, migration, frontend runtime, backend runtime, Cloud.ru state, Render state, Supabase state, commit, push, PR, merge, or deploy is changed by this document.
- Shadow and production are isolated by explicit runtime target keys and separate prefixes.
- Render is absent from the public catalog read path and is not a fallback for catalog cards.
- Bundled static catalog is the public fallback when Cloud runtime is unavailable or invalid.
- Publisher ordering is immutable snapshot first, authenticated read-back, public read-back, manifest last, public manifest verification, then DB finalize.
- Target identity mismatch, legacy null target identity, and shadow-as-production confusion require reconciliation instead of false ready.
- Cutover is phased and reversible, not a big-bang switch.
- Rollback uses previous Pages build or previously verified immutable snapshot.
- Scope remains limited to Atomic Runtime, control state, reconciler, frontend loader, runtime config, service worker correctness, focused tests, and Pages acceptance.
