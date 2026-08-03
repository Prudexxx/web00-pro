# WEB00 One-Click Publish V2 Design

## Scope

This is OPV2-A0, a forensic design and plan gate for WEB00 one-click publication and Public Catalog V2. It is based on repository evidence from `origin/feat/web00-backend-production` at `8a730241502233910902ca62de79cb4de3da642d` and `origin/main` at `d8037613245d1c0e754763afc25684eb269a5002`.

No production code, database, Supabase Storage, Render service, sync endpoint, dry-run endpoint, PR #14 branch, staged files, commits, pushes, or deploys are touched by this document.

## Evidence Summary

Remote refs verified:

- `origin/feat/web00-backend-production`: `8a730241502233910902ca62de79cb4de3da642d`
- `origin/main`: `d8037613245d1c0e754763afc25684eb269a5002`
- PR #14: `OPEN`, base `main`, head `codex/web00-public-catalog-snapshot-ui-p0`, head SHA `bae52528a606bb5dd7deb5adda44fa540c8f426f`, not merged

Measured local repository artifacts:

- `backend/prisma/seed-data/web00-catalog.json`: 36,329 bytes, 15 sites, 7 categories, 4 gallery images per seeded site, 2,421.93 bytes per seeded site on average
- `origin/main:assets/js/data.js`: 36,519 bytes
- `origin/main:assets/js/catalog-api.js`: 28,487 bytes
- `origin/main:assets/js/main.js`: 139,412 bytes
- `origin/main:sw.js`: 2,407 bytes
- `origin/main:assets/img/previews` plus `origin/main:assets/img/solution-gallery`: 87 files, 19,392,676 bytes total, 222,904.32 bytes average, max 804,862 bytes at `assets/img/solution-gallery/krovlya-01.png`

Current hard limits and timeouts from source:

- Backend V1 snapshot item limit: `1_000`
- Backend V1 snapshot byte limit: `2 * 1024 * 1024`
- Frontend API/LKG item limit: `1000`
- Frontend localStorage LKG byte limit: `2 * 1024 * 1024`
- Frontend API request timeout: `8000` ms
- Admin JSON GET timeout: `25000` ms
- Admin JSON mutation timeout: `45000` ms
- Admin multipart timeout: `240000` ms
- Snapshot Storage timeout: `15000` ms
- Public catalog lease TTL: `60000` ms
- Image processing default timeout: `90000` ms
- Image processing concurrency: `1`
- Gallery batch file limit: `10`
- Current gallery item limit: `20`

## Current Implementation Inventory

### Backend routes

- Public catalog API:
  - `GET /api/sites`
  - `GET /api/sites/popular`
  - `GET /api/sites/:slug`
  - `GET /api/categories`
  - `GET /api/categories/:slug`
- Admin site lifecycle:
  - `POST /api/admin/sites`
  - `PATCH /api/admin/sites/:id`
  - `POST /api/admin/sites/:id/publish`
  - `POST /api/admin/sites/:id/unpublish`
  - `POST /api/admin/sites/:id/restore`
  - `DELETE /api/admin/sites/:id`
  - `DELETE /api/admin/sites/:id/permanent`
- Admin images:
  - `PUT /api/admin/sites/:id/images/preview`
  - `DELETE /api/admin/sites/:id/images/preview`
  - `POST /api/admin/sites/:id/images/gallery/batch`
  - `POST /api/admin/sites/:id/images/gallery`
  - `PATCH /api/admin/sites/:id/images/gallery`
  - `DELETE /api/admin/sites/:id/images/gallery/:assetId`
- Admin public catalog maintenance:
  - `GET /api/admin/public-catalog/status`
  - `PATCH /api/admin/public-catalog/settings`
  - `POST /api/admin/public-catalog/sync`
  - `POST /api/admin/public-catalog/dry-run`
- Service identity:
  - `GET /api/health`
  - `GET /api/ready`
  - `GET /api/version`

### Backend modules

- Server composition: `backend/src/server.ts`, `backend/src/app.ts`
- Public catalog API: `backend/src/modules/public-catalog/public-catalog.routes.ts`, `public-catalog.controller.ts`, `public-catalog.service.ts`, `public-catalog.repository.ts`, `public-catalog.schemas.ts`, `public-catalog.mapper.ts`, `public-catalog.sort.ts`, `public-catalog.visibility.ts`, `public-catalog.types.ts`
- Snapshot V1: `public-catalog.snapshot.ts`, `public-catalog-snapshot-preparation.ts`, `public-catalog-snapshot-storage.ts`, `public-catalog-storage-bucket.ts`, `public-catalog-sync.service.ts`, `public-catalog-control.repository.ts`, `public-catalog-dry-run.service.ts`, `public-catalog-dry-run.repository.ts`, `public-catalog-dry-run.diagnostics.ts`, `public-catalog-readonly-transaction.ts`
- Admin public catalog: `backend/src/modules/admin/public-catalog/public-catalog-admin.routes.ts`, `public-catalog-admin.controller.ts`, `public-catalog-admin.service.ts`, `public-catalog-admin.repository.ts`, `public-catalog-admin.schemas.ts`
- Admin site lifecycle: `backend/src/modules/admin/sites/site.routes.ts`, `site.controller.ts`, `site.service.ts`, `site.repository.ts`, `site.schemas.ts`, `site.mapper.ts`, `site.types.ts`
- Admin image flow: `backend/src/modules/admin/images/site-image.routes.ts`, `site-image.controller.ts`, `site-image.service.ts`, `site-image.repository.ts`, `site-image.schemas.ts`, `site-image.types.ts`, `site-image-rate-limit.ts`
- Image pipeline: `backend/src/modules/images/image-processor.ts`, `image-storage.ts`, `supabase-image-storage.ts`, `image-paths.ts`, `image-variants.ts`, `multipart-image-parser.ts`, `asset-upload-coordinator.ts`
- Storage cleanup: `backend/src/modules/storage-cleanup/storage-cleanup.repository.ts`, `storage-cleanup.service.ts`, `storage-cleanup.worker.ts`, `storage-cleanup.types.ts`
- RBAC: `backend/src/modules/admin/rbac.policy.ts`, `rbac.types.ts`, `rbac.middleware.ts`
- Admin DOM: `backend/src/admin/assets/main.js`, `screens/sites-list.js`, `screens/site-editor.js`, `screens/image-manager.js`, `screens/maintenance.js`, `site-image-upload.js`, `forms.js`, `api-client.js`, `dom.js`, `dialog.js`, `admin.css`

### Prisma models and migrations

- `User`, `RefreshSession`, `Category`, `Site`, `AuditLog`, `StorageCleanupJob`, `PublicCatalogControl`
- Initial constraints in `backend/prisma/migrations/20260725061552_init/migration.sql`
- V1 control table in `backend/prisma/migrations/20260801153000_public_catalog_control/migration.sql`
- Audit constraint extension for `public_catalog` in `backend/prisma/migrations/20260802044500_public_catalog_audit_entity_type/migration.sql`
- Optional URL normalization in `backend/prisma/migrations/20260803000000_normalize_optional_site_urls/migration.sql`

### Public frontend on `origin/main`

- Runtime config: `assets/js/runtime-config.js`
- Legacy data: `assets/js/data.js`
- API client and LKG: `assets/js/catalog-api.js`
- Renderer, gallery and demo modal: `assets/js/main.js`
- Service worker: `sw.js`
- Public pages: `index.html`, `solutions.html`, `brief.html`, `app.html`, `cabinet.html`, `cases.html`, `contacts.html`, `faq.html`, `how-it-works.html`, `pricing.html`, `privacy-policy.html`, `services.html`, `status.html`, `install.html`, `consent-personal-data.html`
- Frontend tests: `tests/frontend/catalog-api-client.test.mjs`, `catalog-normalization.test.mjs`, `catalog-source-policy.test.mjs`, `catalog-resilience.test.mjs`, `runtime-config.test.mjs`, `service-worker-contract.test.mjs`, `static-page-contract.test.mjs`, `responsive-images.test.mjs`

## Current Data Flow

### Admin form to draft

Source of truth: `sites` row. Durable state: `sites`, `audit_logs`. Idempotency: create draft uses advisory lock keyed by actor plus request ID and a request fingerprint stored in the create audit row. Timeout: admin JSON mutation `45000` ms, repository statement timeout for image DB attach `10000` ms. Error mapping: `AppError` codes such as `SLUG_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `CATEGORY_INACTIVE`. Concurrency: create draft serializes identical request IDs; update uses normal transaction semantics. Recovery: replay can return the already-created draft when the same request fingerprint is reused. User-visible behavior: ordinary admin form says save success after DB write, before any public release exists. Gap: save and public activation are separate.

### Image upload to stored media

Source of truth: Supabase image bucket `web00-catalog-images` plus DB fields. Durable state: preview URL in `sites.preview_image_url`; gallery JSON in `sites.gallery_images`; cleanup reservations and cleanup jobs in `storage_cleanup_jobs`; audit rows in `audit_logs`. Idempotency: `assetId` and coordinator key for preview/gallery; existing asset ID replay for already attached media. Timeout: image processor `90000` ms default, multipart `240000` ms, Storage upload `15000` ms per object, DB attach `10000` ms. Retry: serializable transaction retry on conflicts, cleanup worker retries. Concurrency: image processing concurrency `1`, gallery batch concurrency `1`, gallery batch max `10`. Recovery: unattached objects are cleaned before retry, upload reservations prevent orphaned objects from being forgotten. User-visible behavior: image manager updates preview/gallery state after DB attach. Gap: exact source SHA-256, decoded dimensions, and read-back parity are not first-class publication gates.

### Preview assignment

Source of truth: `sites.preview_image_url`. Durable state: URL string and cleanup jobs. Current identity model: URL encodes `siteId`, `preview`, `assetId`, width and format in `web00-catalog-images`; `ManagedImageUrlPolicy` can parse it. User-visible behavior: preview can be replaced/deleted in Image Manager. Gap: no typed FK from `sites` to an image asset table; snapshot parity depends on URL parsing.

### Gallery assignment and order

Source of truth: `sites.gallery_images` JSON array. Durable state per item: `alt`, `assetId`, `sortOrder`, `storagePath`, `url`. Current order behavior: `site-image.repository.ts` normalizes gallery order by array index and writes `sortOrder=index`; frontend normalizes by `sortOrder`. Gap: the V1 snapshot sorts items by slug, and there is no separate release-level parity proof that gallery order survived all boundaries.

### Site publish lifecycle

Source of truth: `sites.status`, `sites.active`, `sites.deleted_at`, `sites.published_at`. Durable state: site row and audit row. Idempotency: lifecycle mutations use update conditions and transactions, but no durable publication operation exists. Error mapping: `SITE_NOT_DRAFT`, `SITE_NOT_PUBLISHED`, `SITE_PREVIEW_REQUIRED`. Concurrency: DB transaction protects one update, but two admins can race around the separate sync step. Recovery: a published DB row can remain without a public snapshot. User-visible behavior: the site list can show `Опубликовать` success after DB mutation. Gap: UI success is not tied to verified public release activation.

### Public catalog dirty revision

Source of truth: `public_catalog_control`. Durable state: singleton row with `desiredRevision`, `publishedRevision`, `syncStatus`, lease fields, snapshot fields and setting `showDemoInModal`. Idempotency: dirty increments desired revision; sync lease prevents one concurrent V1 sync. Recovery: stale lease can be returned to pending. Gap: dirty state is not a durable operation queue with stage checkpoints; process restart between mutation and sync relies on the owner or maintenance flow.

### Dry-run

Source of truth: current DB inside a read-only transaction. Durable state: none. Timeout: admin UI uses `45000` ms for dry-run call. Retry: singleton in-process guard only. Error mapping: blockers return `PUBLIC_CATALOG_DRY_RUN_BLOCKED`; system failures return `PUBLIC_CATALOG_DRY_RUN_FAILED`. User-visible behavior: maintenance screen shows ready or blockers. Gap: routine publication must not require the owner to invoke dry-run.

### Snapshot preparation

Source of truth: `listSnapshotSites()` query ordered by `siteOrderBy("sortOrder")`, then `mapSiteToPublicCatalogItem`. Durable state: none until Storage upload. Current snapshot builder then sorts the items by slug in `createPublicCatalogSnapshot`, which can destroy DB `sortOrder`. Current V1 has no authoritative popular order payload. Gap: V2 must preserve catalog order and publish popular order separately.

### Storage upload and manifest activation

Source of truth during generation: DB lease plus generated bytes. Durable state: immutable snapshot object and mutable V1 manifest object in `web00-public-catalog`. Idempotency: immutable snapshot upload uses `upsert=false`; manifest uses `upsert=true` after snapshot read-back. Timeout: `15000` ms per Storage operation. Recovery: old manifest remains valid for failures before manifest upload; if active manifest changes but DB finalization fails, V1 can show new public data while DB says failed. Gap: V2 needs a release table and activation events to reconcile Storage and DB without ambiguity.

### Public frontend fetch and render

Source of truth: `assets/js/runtime-config.js` points to `https://web00-backend-production.onrender.com`, and `assets/js/catalog-api.js` fetches `/api/sites` and `/api/sites/popular`. Durable client state: localStorage key `web00.catalog.api.lkg.v1`. Timeout: `8000` ms. Retry: finite background retries in `main.js`. Recovery: valid current catalog is preserved on API error; static `data.js` is fallback. User-visible behavior: initial frame can show legacy static cards, then API cards. Gap: the current API-first reader is cold-start sensitive, and the legacy LKG shape cannot scale to the V2 sharded catalog.

### Gallery viewer

Source of truth: normalized item `galleryImages`, falling back to preview when gallery is empty. Durable state: none client-side beyond catalog cache. User-visible behavior: modal thumbnails keep order by normalized gallery `sortOrder`; image failures are isolated by native broken-image behavior. Gaps: no placeholder/LQIP contract, no focus trap for gallery state, no adjacent-image preload, no hard image decode timeout.

### Demo action

Source of truth: current item fields `demoMode`, `demoUrl`, `siteUrl`, `externalDemoUrl`, `originalDemoUrl`, `demoLocalUrl`. Current admin setting `showDemoInModal` exists in snapshot V1, but public frontend does not read V1 snapshot after rollback. User-visible behavior: `demoMode === "external-iframe"` shows external fallback plus an outside link; other demo URLs can be placed in iframe. Gap: V2 must enforce managed embeddable origin policy and distinguish `demoUrl` from `siteUrl`.

## Current Contradictions Resolved By V2

- Snapshot limit moves from `1_000` to at least `10_000` by sharding the release.
- Slug sorting is removed from release order; DB catalog order from `(sortOrder asc, createdAt desc, slug asc, id asc)` is preserved.
- Popular order becomes an authoritative release artifact, not a frontend slice.
- Site lifecycle and public activation become one durable operation from the owner perspective.
- Public frontend stops depending on Render `/api/sites` for catalog reads.
- Full-catalog payloads move out of localStorage into CacheStorage plus IndexedDB metadata.
- Ordinary admin UI loses manual dry-run/sync/status/apply buttons.
- Demo modal setting becomes one premium autosaving switch, default ON.
- Preview and Gallery image identity are represented by asset IDs, source hashes, variant descriptors and gallery order across DB, release and frontend.
- Process restart is recovered by durable publication operation rows.
- Concurrent publication coalesces into a single target revision and active release.
- A bad image cannot replace a valid active release because active pointer switches last.
- V1 remains readable during V2 rollout under `public-catalog/v1`.
- Fabricated frontend data cannot pass production generator tests because generation consumes only verified V2 release artifacts.

## Chosen Architecture

Use three separated lifecycles:

- Content lifecycle: `Site.status`, `active`, `deletedAt`, `publishedAt`. Public-facing `published` is finalized only after V2 active release read-back parity passes.
- Publication operation lifecycle: durable outbox rows that track one owner-initiated or coalesced publication attempt from queued to terminal.
- Public release lifecycle: immutable V2 release artifacts and one mutable active pointer.

Do not extend `Site.status` for publication stages. `Site.status` remains content state. User-facing publication labels are derived from the latest publication operation, the active release, and whether the site has public-projection changes newer than the active release.

## Durable State Model

Additive database model names:

- `PublicCatalogSetting`: singleton `id='public-catalog'`, `showDemoInModal boolean not null default true`, `autoPublish boolean not null default true`, revision counters, active operation coalescing fields, timestamps.
- `SiteImageAsset`: `assetId uuid primary key`, `siteId uuid`, `slot text check preview/gallery`, `sourceSha256 char(64)`, `sourceMime text`, `decodedFormat text`, `width int`, `height int`, `storagePath text`, `variants jsonb`, `createdAt`, `updatedAt`, unique `(siteId, assetId, slot)`.
- `SiteGalleryImage`: `siteId uuid`, `assetId uuid`, `slot text generated or constant 'gallery'`, `sortOrder int`, `alt text`, composite primary key `(siteId, assetId)`, unique `(siteId, sortOrder)`, composite FK `(siteId, assetId, slot)` to `SiteImageAsset(siteId, assetId, slot)` so wrong-site and wrong-slot gallery rows are impossible.
- `SitePreviewImage`: `siteId uuid primary key`, `assetId uuid`, `slot text generated or constant 'preview'`, composite FK `(siteId, assetId, slot)` to `SiteImageAsset(siteId, assetId, slot)`; `sites.preview_asset_id` may remain a compatibility mirror but cannot be the only durable proof.
- `PublicCatalogPublicationOperation`: durable operation row with `id uuid`, `idempotencyKey text unique`, `action text`, `requestFingerprint char(64)`, `projectionHash char(64) null`, `operationScope text`, `operationGroupKey text`, `trigger text`, `actorUserId uuid null`, `siteId uuid null`, `targetRevision int`, `status text`, `stage text`, `retryCount int`, `leaseId text null`, `lockedAt timestamptz null`, `lockedBy text null`, `lastCheckpoint jsonb`, `lastErrorCode text null`, `requestId text`, `createdAt`, `updatedAt`, `completedAt null`. A partial unique index enforces one nonterminal operation per `operationGroupKey` where `status in ('queued','running','retry_wait')`.
- `PublicCatalogRelease`: `revision int primary key`, `status text`, `itemsCount int`, `chunksCount int`, `popularCount int`, `manifestPath text`, `manifestSha256 char(64)`, `indexPath text`, `indexSha256 char(64)`, `popularPath text`, `popularSha256 char(64)`, `categoriesPath text`, `categoriesSha256 char(64)`, `activePointerSha256 char(64) null`, `generatedAt`, `activatedAt null`.
- `PublicCatalogActivationEvent`: append-only event with `id uuid`, `operationId uuid unique null`, `eventType text check activate/rollback/reconcile`, `revision int FK PublicCatalogRelease`, `previousRevision int null FK PublicCatalogRelease`, `activePointerSha256 char(64)`, `requestId text`, `createdAt`.

Operation statuses:

- `queued`
- `running`
- `retry_wait`
- `succeeded`
- `failed`
- `cancelled`

Operation stages:

- `content_transaction`
- `media_preflight`
- `projection_page`
- `index_build`
- `chunk_build`
- `chunk_upload`
- `chunk_verify`
- `popular_build`
- `popular_upload`
- `popular_verify`
- `categories_build`
- `categories_upload`
- `categories_verify`
- `manifest_build`
- `manifest_upload`
- `manifest_verify`
- `active_build`
- `active_upload`
- `active_verify`
- `db_finalize`
- `reconcile`

User-facing states are derived:

- `Черновик`: site is draft and no active release contains it.
- `Публикуется`: latest operation for the site or coalesced catalog release is `queued`, `running`, or `retry_wait`.
- `Опубликовано`: active V2 release contains the site with exact field and media parity, and `db_finalize` has marked the content as publicly published.
- `Нужна повторная публикация`: content has a publish intent or public-projection changes newer than the active release, but active release parity does not yet match the current projection.
- `Снимается с публикации`: latest unpublish operation is active.

## One-Click Publication Flow

The owner presses one visible primary button: `Опубликовать`.

The backend receives one request:

`POST /api/admin/sites/:id/publication`

Request:

```json
{
  "idempotencyKey": "uuid-v4-or-ulid",
  "action": "publish"
}
```

The backend transaction atomically persists:

- content changes and publication intent; it does not set `Site.status='published'` or `publishedAt` before V2 activation parity passes;
- exact public projection dirty state;
- durable publication operation;
- audit event.

No HTTP success body says `Опубликовано` until the active V2 pointer and immutable release are read back and parity checks pass. For long operations, the request returns `202` with operation state and the UI polls:

`GET /api/admin/public-catalog/operations/:id`

Duplicate button clicks reuse the same idempotency key while the current submit is in flight. If the same key is replayed with the same action, site, request fingerprint and operation scope, the operation row is returned. If reused for different input, backend returns `IDEMPOTENCY_KEY_REUSED`.

Two administrators pressing publish close together coalesce into one target revision. The transaction locks `public_catalog_settings` with row locking or serializable retry, allocates or updates `desiredRevision`, and creates or reuses the single nonterminal operation for the catalog `operationGroupKey`. The orchestrator builds the latest desired revision and finalizes pending when all queued public changes are included.

Response DTO:

```json
{
  "data": {
    "operationId": "55555555-5555-4555-8555-555555555555",
    "status": "queued",
    "stableStatus": "Черновик",
    "buttonLabel": "Публикуем...",
    "retryable": false
  }
}
```

Ordinary UI renders `buttonLabel` for nonterminal publication progress and must not render a separate live-progress label. Status DTO omits revision, checksum, bucket and Storage paths from ordinary UI responses. Expert diagnostics may expose those fields only in the separately named recovery area.

## Public Catalog V2 Storage Layout

Canonical JSON bucket: `web00-public-catalog`.

Image bucket: `web00-catalog-images`.

Paths:

- `public-catalog/v2/active.json`
- `public-catalog/v2/releases/revision-N/manifest.json`
- `public-catalog/v2/releases/revision-N/index.json`
- `public-catalog/v2/releases/revision-N/popular.json`
- `public-catalog/v2/releases/revision-N/categories.json`
- `public-catalog/v2/releases/revision-N/chunks/chunk-000001.json`

All release files are immutable. Only `active.json` is mutable and switches last.

### active.json

```json
{
  "schemaVersion": 2,
  "activeRevision": 42,
  "activatedAt": "2026-08-03T16:00:00.000Z",
  "manifestPath": "public-catalog/v2/releases/revision-42/manifest.json",
  "manifestUrl": "https://storage.web00.invalid/storage/v1/object/public/web00-public-catalog/public-catalog/v2/releases/revision-42/manifest.json",
  "manifestSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "previousRevision": 41
}
```

### release manifest

```json
{
  "schemaVersion": 2,
  "revision": 42,
  "generatedAt": "2026-08-03T16:00:00.000Z",
  "itemsCount": 10000,
  "uniqueSlugCount": 10000,
  "catalogOrder": "sortOrder-createdAtDesc-slug-id",
  "chunkSize": 100,
  "chunksCount": 100,
  "index": {
    "path": "public-catalog/v2/releases/revision-42/index.json",
    "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "bytes": 120000
  },
  "popular": {
    "path": "public-catalog/v2/releases/revision-42/popular.json",
    "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "count": 3
  },
  "categories": {
    "path": "public-catalog/v2/releases/revision-42/categories.json",
    "sha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "count": 7
  },
  "chunks": [
    {
      "index": 1,
      "path": "public-catalog/v2/releases/revision-42/chunks/chunk-000001.json",
      "sha256": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "itemsCount": 100,
      "firstSlug": "advokat",
      "lastSlug": "site-custom",
      "bytes": 240000
    }
  ],
  "settings": {
    "showDemoInModal": true
  }
}
```

### index.json

```json
{
  "schemaVersion": 2,
  "revision": 42,
  "itemsCount": 10000,
  "items": [
    {
      "slug": "site-custom",
      "title": "Сайт под заказ",
      "shortDescription": "string",
      "categorySlug": "individual",
      "categoryTitle": "Индивидуально",
      "tags": ["string"],
      "features": ["string"],
      "priceLabel": "string",
      "deliveryLabel": "string",
      "preview": {
        "assetId": "uuid",
        "lqip": "data:image/webp;base64,...",
        "width": 1600,
        "height": 900
      },
      "chunk": 1,
      "order": 1,
      "popularOrder": null
    }
  ]
}
```

The index excludes full descriptions, all gallery variants and private DB fields. It is enough for first page, search/filter, route lookup and visible card shell.

### chunk payload

```json
{
  "schemaVersion": 2,
  "revision": 42,
  "chunkIndex": 1,
  "itemsCount": 100,
  "items": [
    {
      "slug": "site-custom",
      "title": "Сайт под заказ",
      "shortDescription": "string",
      "fullDescription": "string",
      "category": {
        "slug": "individual",
        "title": "Индивидуально"
      },
      "tags": ["string"],
      "features": ["string"],
      "priceLabel": "string",
      "deliveryLabel": "string",
      "demoMode": "managed-modal",
      "demoUrl": "https://demo.web00.invalid/site",
      "siteUrl": "https://public-site.web00.invalid",
      "publishedAt": "2026-08-03T16:00:00.000Z",
      "previewImage": {
        "assetId": "uuid",
        "sourceSha256": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        "width": 1600,
        "height": 900,
        "url": "https://storage.web00.invalid/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/preview/22222222-2222-4222-8222-222222222222/1600.webp",
        "lqip": "data:image/webp;base64,...",
        "variants": [
          {
            "width": 480,
            "webpUrl": "https://storage.web00.invalid/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/preview/22222222-2222-4222-8222-222222222222/480.webp",
            "avifUrl": "https://storage.web00.invalid/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/preview/22222222-2222-4222-8222-222222222222/480.avif"
          }
        ]
      },
      "galleryImages": [
        {
          "assetId": "uuid",
          "sourceSha256": "9999999999999999999999999999999999999999999999999999999999999999",
          "sortOrder": 0,
          "alt": "string",
          "width": 1600,
          "height": 900,
          "url": "https://storage.web00.invalid/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/gallery/33333333-3333-4333-8333-333333333333/1600.webp",
          "lqip": "data:image/webp;base64,...",
          "variants": [
            {
              "width": 480,
              "webpUrl": "https://storage.web00.invalid/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/gallery/33333333-3333-4333-8333-333333333333/480.webp",
              "avifUrl": "https://storage.web00.invalid/storage/v1/object/public/web00-catalog-images/sites/11111111-1111-4111-8111-111111111111/gallery/33333333-3333-4333-8333-333333333333/480.avif"
            }
          ]
        }
      ]
    }
  ]
}
```

### popular payload

```json
{
  "schemaVersion": 2,
  "revision": 42,
  "items": [
    {
      "slug": "site-custom",
      "popularOrder": 1,
      "chunk": 1
    }
  ]
}
```

### category metadata

```json
{
  "schemaVersion": 2,
  "revision": 42,
  "categories": [
    {
      "slug": "individual",
      "title": "Индивидуально",
      "description": "string",
      "sortOrder": 1,
      "itemsCount": 10
    }
  ]
}
```

## Generation Strategy For 10,000 Cards

Chunk size: `100` cards. This produces `100` chunks for 10,000 cards, keeps each full-data chunk near the measured `2421.93 bytes * 100 = 242,193 bytes` baseline before V2 media metadata growth, and keeps fetch retry units small enough for slow mobile networks.

Database pagination: keyset pagination using `(sortOrder asc, createdAt desc, slug asc, id asc)` with `take=100`. The query returns only the V2 projection and joins typed media assignments. The generator writes one chunk at a time, computes SHA-256 over exact bytes, uploads with bounded parallelism `2`, then discards chunk bytes before building the next.

Memory boundary: no worker may hold all 10,000 full records and all generated chunk bytes at the same time. The only all-catalog in-memory structure is the compact index entries. If local measurement shows index memory above `32 MiB`, index writing becomes streamed NDJSON-to-JSON with a temporary local file in test only and direct Storage upload in production.

Builder input is an `AsyncIterable<PublicCatalogV2ProjectionPage>` supplied by repository keyset pagination. A full `records: PublicCatalogV2ProjectionRecord[]` input is allowed only in small unit tests whose file or helper name contains `synthetic` or `fixture`; it is forbidden in the production release builder entrypoint.

Authoritative popular order source fields are part of the V2 projection: `featured`, `views`, `sortOrder`, `createdAt`, `slug` and `id`. `popular.json` stores `popularOrder` explicitly and is rendered as authoritative order; the public frontend never derives popular cards by slicing the catalog order.

## Atomic Activation And Recovery

| Boundary | Durable source of truth | Safe retry | Reader view | New revision |
| --- | --- | --- | --- | --- |
| DB transaction committed, no artifacts uploaded | operation row `queued` or `running`, target revision | resume same operation and revision | old active release | no |
| Some chunks uploaded | `PublicCatalogRelease.status='building'`, chunk checkpoints | upload missing chunks, verify existing bytes by SHA | old active release | no |
| All chunks uploaded, verification incomplete | chunk checkpoint list | verify chunks and continue | old active release | no |
| Release manifest uploaded | release row and manifest SHA | fetch manifest, verify, continue to active pointer | old active release | no |
| `active.json` switched | activation event may be missing | fetch active pointer, verify, insert missing activation/finalize DB | new release | no |
| `active.json` switched, DB finalization failed | active pointer plus operation row | reconcile DB to active pointer with an activation event | new release | no |
| UI connection lost | operation row | UI polls operation by ID | old or new depending on activation | no |
| Render restarted | operation row with lease expiration | expired lease resumes from checkpoint | old or new depending on activation | no |
| Supabase temporarily unavailable | operation row retry count and last checkpoint | retry with exponential backoff capped at 5 attempts | old active release | no |
| Repeated owner click | idempotency key and operation coalescing | return existing operation or append to same target revision | old or new depending on activation | no |

Cleanup policy: immutable release artifacts are never rewritten. Incomplete release artifacts older than 24 hours and not referenced by `active.json` are eligible for cleanup jobs. The active release and previous 19 releases are retained.

Every operation stage listed in the durable state model has a restart/failure-injection test. After restart, the worker resumes from checkpoint, keeps the same revision, creates no duplicate uploads, creates no duplicate activation event, and leaves the old release active until `active_verify` passes. On backend boot, `server.ts` starts the V2 orchestrator and reconciler, immediately scans `queued`, `retry_wait` and expired `running` operations with row locking and `SKIP LOCKED`, then ticks on an interval below the lease TTL.

## Exact Image Contract

Allowed validation is technical and security-only:

- declared MIME and decoded format agreement;
- decoded format is JPEG, PNG, WebP or AVIF;
- byte-size and pixel-count limits;
- decompression bomb protection through Sharp metadata and pixel bounds;
- backend-generated WebP and AVIF variants;
- no executable payload;
- no path traversal;
- no arbitrary remote upload URL.

Stored media identity:

- `assetId`;
- `sourceSha256`;
- decoded `width` and `height`;
- generated variant paths and public URLs;
- Gallery `sortOrder`;
- slot `preview` or `gallery`.

Before publication starts, backend reads the current site media assignments and proves they match the requested publication input. Before UI says `Опубликовано`, backend reads back `active.json`, manifest, chunk and item and proves exact card fields, preview asset and gallery asset list/order match the DB projection. The parity assertion compares every public DTO field, revision, item count, unique slug count, bucket id, content type, artifact SHA, preview `assetId`, preview `sourceSha256`, preview variants, gallery ordered `assetId` list, gallery `sourceSha256`, gallery variants and Gallery `sortOrder`.

No slug-based substitutions, no manually constructed card, and no fallback image replacing a real uploaded image are allowed. A failed or timed-out Preview/Gallery asset keeps its expected `assetId` and displays an explicit asset error state such as `data-image-status="error"` with accessible diagnostic copy; it never silently substitutes a different semantic image. Publication read-back fails if the referenced Storage object or checksum is invalid.

## Admin UI Contract

Normal screen contains:

- form fields;
- Preview manager;
- Gallery manager;
- one primary publication control;
- compact stable publication state badge;
- one modal-demo switch.

Normal screen does not contain:

- dry-run button;
- sync button;
- status refresh button;
- apply button;
- save demo setting button;
- bucket bootstrap button;
- snapshot repair button.

Primary publication button copy:

- `Опубликовать`
- `Сохраняем...`
- `Загружаем изображения X из Y...`
- `Проверяем...`
- `Публикуем...`
- `Опубликовано`
- `Повторить публикацию`

All transient publication progress appears only in the single primary publication control. The adjacent state badge may show only stable final state and may not duplicate live progress or expose raw stage, revision, checksum, bucket or Storage path text.

Status copy:

- `Черновик`
- `Опубликовано`
- `Нужна повторная публикация`
- `Снимается с публикации`

Premium switch:

- label: `Открывать демо внутри WEB00`
- default: ON
- autosave: yes
- separate Save button: no
- compact states: `Сохранено`, `Публикуется`, `Ошибка`

Rare actions in overflow menu:

- `Снять с публикации`
- `Удалить`
- `Восстановить`

Publication, upload, autosave and polling errors must not reset form fields, Preview/Gallery selections, upload queues, selected filenames or unsaved local edits. Retry resumes from the latest safe checkpoint without requiring the owner to know revision, checksum, bucket, lease or manifest details.

Expert recovery area can keep maintenance diagnostics under a separately named `Восстановление и диагностика` screen. It is not part of routine publication.

## Public Frontend V2

Primary source is Supabase Storage:

`public-catalog/v2/active.json` -> release manifest -> index, popular, categories and chunks.

Repeat visitor:

1. Read validated active metadata from IndexedDB.
2. Render cached release shell and visible chunk from CacheStorage.
3. Fetch `active.json` in background.
4. If revision and manifest SHA are unchanged, do not replace DOM and do not reload images.

Clean visitor:

1. Fetch `active.json` with finite timeout.
2. Fetch manifest, index, popular and first chunk.
3. Verify SHA-256 and schema.
4. Render authoritative first page and popular payload.
5. Use legacy `data.js` only when no V2 source, no valid cache and no bundled emergency release are available.

Network failure:

1. Use validated CacheStorage release.
2. Use bundled emergency release.
3. Use legacy data.js only as final emergency compatibility fallback.

No full-catalog payload is stored in localStorage. IndexedDB stores active revision metadata, chunk membership, search index metadata and small state. CacheStorage stores immutable artifact responses.

Rendering:

- fixed aspect-ratio media frames;
- deterministic branded placeholder or LQIP visible before image decode;
- first visible row eager and high priority;
- rows after the first viewport lazy;
- image hidden until load/decode succeeds;
- failed image keeps placeholder plus explicit asset error state while retaining expected `assetId`;
- bounded DOM nodes through virtualization;
- prefetch next chunk and adjacent gallery image with concurrency `2`;
- no empty-to-valid flash;
- no valid-to-empty replacement;
- no red retry banner over valid content.

## Gallery V2

Gallery consumes V2 `galleryImages` exactly as ordered by `sortOrder`.

Supported behavior:

- Preview and Gallery distinction;
- thumbnails;
- previous/next controls;
- keyboard arrows;
- Escape closes;
- swipe on touch;
- focus trap;
- focus restoration;
- responsive mobile layout;
- no layout shift;
- no duplicate images;
- failed image isolation.

## Demo Modal V2

Fields are distinct:

- `demoUrl`: managed demo URL eligible for WEB00 modal when policy permits;
- `siteUrl`: public external site URL opened separately.

Modal embedding is guaranteed only for managed or explicitly allowed demo origins. The allowlist is backend-owned and included in public release metadata only as safe policy names, not secrets.

Iframe policy:

- allowed origins only;
- `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"` only for managed origins that require it;
- no same-origin privilege unless the origin is a WEB00-controlled demo origin;
- CSP `frame-src` limited to approved origins;
- fallback link when target blocks embedding through `X-Frame-Options` or CSP;
- iframe `src` removed on close;
- Escape closes and restores focus;
- desktop/mobile preview modes remain for managed demos.

## Anti-Fabrication Controls

Production generator rules:

- consumes only verified V2 release manifest/artifacts;
- never imports `assets/js/data.js`;
- has no function named or behaving like `domDlyaBusiPublicItem`;
- has no slug/title special cases;
- has no manual item append/push in production artifact generation;
- does not contain hardcoded production card text inside generator or production tests;
- does not merge legacy data into verified release data.

Release verification compares:

- every public field;
- every `assetId`;
- every `sourceSha256`;
- every Gallery `sortOrder`;
- exact item count;
- exact unique slug count;
- exact bytes SHA-256;
- Storage bucket ID;
- revision;
- content type.

Forbidden-pattern scans:

- `domDlyaBusiPublicItem`
- `specialCaseBySlug`
- `manual item push`
- `WEB00_PUBLIC_CATALOG_BUNDLED_SNAPSHOT` in production generator
- concatenating the image bucket constant with `public-catalog/v2`
- `assets/js/data.js` import in generator

Fixtures are allowed only in unit tests and must use names with `synthetic` or `fixture`.

## Performance Budgets

Measurement method: local repository artifacts only, no production reads.

Budgets:

- `active.json`: max `2 KiB`.
- Release manifest: max `96 KiB` for 100 chunk descriptors.
- Index: target `<= 1.5 MiB`, hard max `2 MiB`, because it excludes gallery variant lists and full descriptions.
- Chunk: target `<= 300 KiB`, hard max `512 KiB`, based on 100 cards times the measured 2.42 KiB seeded-card baseline plus media metadata headroom.
- Popular payload: max `16 KiB` for the initial 3 and future top lists up to 20.
- Categories payload: max `64 KiB`.
- Initial clean visitor catalog bytes before images: `active + manifest + index + popular + first chunk <= 2.0 MiB`.
- First content render after first byte of `active.json`: target `<= 1200 ms` on a throttled local browser test.
- Maximum live catalog card DOM nodes: `120`.
- Release generation heap growth for 10,000 cards: target `<= 192 MiB`, hard max `256 MiB`, measured by a local stress test that generates 10,000 synthetic records with 4 gallery images each.
- Storage upload concurrency: `2`.
- Public artifact fetch concurrency: `4`.
- Image preload concurrency: `2`.
- Publication request timeout before switching to poll: `45000` ms.
- Operation polling interval: `1000` ms for first 10 seconds, then `3000` ms.
- Recovery time after process restart: first retry within `60` seconds because the lease TTL is `60000` ms.

## Security Controls

- RBAC: one-click publish requires `site.publish`; operation read requires `site.read`; recovery screen requires `maintenance.publicCatalog`.
- CSRF: admin mutations require same-site cookies plus authorization token and request ID.
- Idempotency: client sends one idempotency key per button press; backend enforces unique key and fingerprint.
- Replay: reused key with different payload returns `IDEMPOTENCY_KEY_REUSED`.
- File content validation: decode through Sharp and compare declared MIME.
- Decompression bomb: pixel count and dimension bounds before variant generation.
- Path traversal: generated Storage paths only from UUIDs and fixed slot names.
- SSRF: no backend fetch of arbitrary image URLs; uploads are multipart bytes only.
- URL validation: public URLs must be absolute HTTP/HTTPS, no credentials, no fragments, no query for image URLs.
- Iframe sandbox/CSP: managed allowlist only.
- Stored XSS: all admin/public rendering escapes text; release schema rejects unsafe URLs.
- Audit logging: operation transitions and publication events log request ID, actor ID, entity IDs and safe codes only.
- Secrets redaction: no service-role key, auth header, environment secret or DB URL in logs, reports or docs.
- Service-role confinement: Supabase writes occur only in backend orchestrator.
- Public bucket writes: browser never receives write credentials.
- Storage policy acceptance: anonymous/public clients can `GET` approved JSON artifacts and images, while `POST`, `PUT`, `DELETE`, signed upload and overwrite attempts fail. Frontend bundles contain no service-role key or write token.
- Cleanup safety: cleanup job cannot delete active or previous 19 releases.
- Rate limiting: publish endpoint uses admin mutation rate limit and per-site operation coalescing.
- Denial-of-service: 10,000-card generation uses keyset pagination, bounded chunking and upload concurrency.

## Rollout Plan

Sequence:

1. Additive schema migration locally.
2. Backend V2 builder, Storage, outbox and orchestrator locally.
3. Full backend checks locally.
4. Backend commit only after separate owner authorization.
5. Push only after separate owner authorization.
6. Render manual deploy only after separate owner authorization.
7. Verify deployed commit, health, ready and version.
8. One owner-authorized production dry-run.
9. One owner-authorized V2 release activation.
10. Read-only validation of active pointer, release manifest, index, popular, categories and chunks.
11. Implement and deploy public frontend V2 only after backend V2 active release is accepted.
12. GitHub Pages live contract smoke.
13. Real owner E2E card publication.
14. Keep V1 recovery available until V2 acceptance.
15. Ordinary sync/status/apply/dry-run controls are removed from routine screens in OPV2-6; V1 recovery remains available only inside the separately named expert diagnostics/recovery screen until V2 E2E PASS.

## Rollback Design

- Backend code rollback: normal revert or redeploy previous backend commit.
- Additive migration rollback: leave additive tables in place during incident response; disable V2 orchestrator by feature flag and keep V1 active.
- Publication orchestrator rollback: stop new operations, allow current active pointer to keep serving old release.
- Active pointer rollback: create a new activation event that points `active.json` back to a previous immutable release; never rewrite old release artifacts.
- Rollback activation event: `eventType='rollback'`, reason code, previous revision and target revision are recorded for incident audit; normal activation uses `eventType='activate'`, reconciler repair uses `eventType='reconcile'`.
- Frontend rollback: normal git revert on `main`; service worker cache version changes remove the V2 client.
- Corrupted release: do not activate; if already activated, publish a pointer rollback event to the previous verified release.
- Incomplete chunks: mark release failed and schedule cleanup if not referenced by active pointer.
- Bad Gallery: create a new corrected release with the fixed DB media order; do not mutate old chunk bytes.
- Bad demo policy: switch setting and publish a new release; if embedding fails for an origin, fallback to outside link without changing card data.

## Proposed File Mapping

Backend create:

- `backend/src/modules/public-catalog-v2/public-catalog-v2.types.ts`
- `backend/src/modules/public-catalog-v2/public-catalog-v2.schemas.ts`
- `backend/src/modules/public-catalog-v2/public-catalog-v2.paths.ts`
- `backend/src/modules/public-catalog-v2/public-catalog-v2.serializer.ts`
- `backend/src/modules/public-catalog-v2/public-catalog-v2.repository.ts`
- `backend/src/modules/public-catalog-v2/public-catalog-v2.builder.ts`
- `backend/src/modules/public-catalog-v2/public-catalog-v2.storage.ts`
- `backend/src/modules/public-catalog-v2/public-catalog-v2.orchestrator.ts`
- `backend/src/modules/public-catalog-v2/public-catalog-v2.reconciler.ts`
- `backend/src/modules/public-catalog-v2/public-catalog-v2.routes.ts`
- `backend/src/modules/admin/publication/publication.routes.ts`
- `backend/src/modules/admin/publication/publication.controller.ts`
- `backend/src/modules/admin/publication/publication.service.ts`
- `backend/src/modules/admin/publication/publication.repository.ts`
- `backend/src/modules/admin/images/site-media-assets.repository.ts`
- `backend/prisma/migrations/20260803170000_public_catalog_v2_publication/migration.sql`

Backend modify:

- `backend/prisma/schema.prisma`
- `backend/src/server.ts`
- `backend/src/app.ts`
- `backend/src/modules/admin/admin.routes.ts`
- `backend/src/modules/admin/sites/site.repository.ts`
- `backend/src/modules/admin/sites/site.service.ts`
- `backend/src/modules/admin/images/site-image.repository.ts`
- `backend/src/modules/admin/images/site-image.service.ts`
- `backend/src/modules/public-catalog/public-catalog.mapper.ts`
- `backend/src/modules/storage-cleanup/storage-cleanup.repository.ts`
- `backend/src/modules/admin/rbac.types.ts`
- `backend/src/modules/admin/rbac.policy.ts`
- `backend/src/lib/logger.ts`

Admin frontend modify:

- `backend/src/admin/assets/screens/site-editor.js`
- `backend/src/admin/assets/screens/sites-list.js`
- `backend/src/admin/assets/screens/image-manager.js`
- `backend/src/admin/assets/screens/maintenance.js`
- `backend/src/admin/assets/forms.js`
- `backend/src/admin/assets/api-client.js`
- `backend/src/admin/assets/admin.css`

Public frontend create:

- `assets/js/public-catalog-v2-client.js`
- `assets/js/public-catalog-v2-cache.js`
- `assets/js/public-catalog-v2-renderer.js`
- `assets/js/public-catalog-v2-gallery.js`
- `assets/js/public-catalog-v2-demo.js`
- `assets/js/public-catalog-emergency-release.js`
- `scripts/build-public-catalog-emergency-release.mjs`

Public frontend modify:

- `assets/js/runtime-config.js`
- `assets/js/catalog-api.js`
- `assets/js/main.js`
- `sw.js`
- `index.html`
- `solutions.html`
- `cases.html`
- `services.html`
- `pricing.html`
- `faq.html`
- `how-it-works.html`
- `contacts.html`
- `brief.html`
- `cabinet.html`
- `app.html`
- `status.html`
- `install.html`
- `privacy-policy.html`
- `consent-personal-data.html`

Docs create:

- `backend/docs/WEB00_PUBLIC_CATALOG_V2_PROTOCOL.md`
- `backend/docs/WEB00_ONE_CLICK_PUBLICATION_RUNBOOK.md`

Docs modify:

- `docs/superpowers/plans/2026-08-03-web00-one-click-publish-v2.md`

Forbidden for implementation phases unless separately authorized:

- PR #14 branch files;
- production database;
- Supabase production writes;
- Render deploy;
- GitHub Pages deploy before frontend phase gate;
- `assets/js/data.js` as a production generator input;
- old migrations.

## Required Test Matrix

Backend tests:

- `backend/tests/public-catalog-v2.paths.test.ts`
- `backend/tests/public-catalog-v2.serializer.test.ts`
- `backend/tests/public-catalog-v2.builder.test.ts`
- `backend/tests/public-catalog-v2.storage.test.ts`
- `backend/tests/public-catalog-v2.orchestrator.test.ts`
- `backend/tests/public-catalog-v2.recovery.test.ts`
- `backend/tests/public-catalog-v2.media-parity.test.ts`
- `backend/tests/public-catalog-v2.10000.test.ts`
- `backend/tests/admin.publication.routes.test.ts`
- `backend/tests/admin.publication.service.test.ts`
- `backend/tests/integration/public-catalog-v2-publication.test.ts`

Admin frontend tests:

- `backend/tests/admin-ui.publication-button.test.mjs`
- `backend/tests/admin-ui.demo-switch.test.mjs`
- `backend/tests/admin-ui.publication-progress.test.mjs`
- `backend/tests/admin-ui.maintenance-visibility.test.mjs`

Public frontend tests:

- `tests/frontend/public-catalog-v2-client.test.mjs`
- `tests/frontend/public-catalog-v2-cache.test.mjs`
- `tests/frontend/public-catalog-v2-renderer.test.mjs`
- `tests/frontend/public-catalog-v2-gallery.test.mjs`
- `tests/frontend/public-catalog-v2-demo.test.mjs`
- `tests/frontend/public-catalog-v2-antifabrication.test.mjs`
- `tests/frontend/service-worker-v2-cache.test.mjs`

E2E tests:

- `backend/tests/e2e/one-click-publication.e2e.test.ts`
- `backend/tests/e2e/public-catalog-v2-recovery.e2e.test.ts`

## Self-Review

- Owner one-click contract maps to durable operation, admin UI and release verification.
- Ordinary UI has one primary publish control.
- 10,000-card behavior has chunk size, memory, DOM and fetch budgets.
- Image parity is end-to-end through asset IDs, source hashes, dimensions, variants and order.
- Demo modal does not promise arbitrary external embedding.
- Recovery exists at each PostgreSQL and Storage failure boundary.
- No production mutation is proposed before a separate explicit owner release gate.
- Fabricated card data is structurally blocked by generator source rules and scans.
- PR #14 is read-only and untouched.
- No open alternatives remain in this design.
