# WEB00 Backend B7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

## 1. Goal

Build the B7 backend-only image pipeline for WEB00 catalog cards: upload, validate, normalize, store, replace, sort, delete, and clean up preview and gallery images through authenticated admin backend endpoints backed by Supabase Storage.

Architecture:

- The browser never writes directly to Supabase Storage. Admin/editor clients send multipart requests to the backend.
- The backend streams bounded input, validates and normalizes images with Sharp, uploads immutable WebP and AVIF variants to one public Supabase bucket, then commits short Prisma transactions that update existing `Site.previewImageUrl`, existing `Site.galleryImages`, `AuditLog`, and existing `StorageCleanupJob`.
- Storage writes, Sharp processing, and Storage deletes are outside Prisma transactions. Database attach/detach and audit/cleanup-job creation are atomic.

Tech stack:

- Node.js `>=22.23.1 <23`, TypeScript `NodeNext`, Express 5, Prisma 7.8, PostgreSQL 17, Supabase Storage official client, Sharp, Busboy, Vitest, Supertest.

Selected decision set:

- `A3/O1/S2/U1/R1/Q1/P1/L1/M2/G3/B2/C2/H1/D1/L20`.

## 2. Preconditions

Repository and branch:

- Implementation starts from `D:\WEB00_BACKEND`.
- Implementation branch is `feat/web00-backend-b7`.
- Base commit is `1b301d0e6a3b6d9405db2738ee8a93defeb7bc7b`.
- Working tree and staged area are clean before implementation.
- The B7 plan document is locally present before implementation begins.

Runtime and data:

- Portable Node is `D:\WEB00_TOOLS\node-v22.23.1-win-x64`.
- PostgreSQL B2 databases remain isolated: development, shadow, and test databases are separate.
- `TEST_DATABASE_URL` points only to the WEB00 test database.
- Existing B1-B6 backend checks pass before B7 work starts.

Safety gates:

- Do not read or print `.env`, Storage URLs, database URLs, service-role keys, JWTs, cookies, or secret values.
- Do not create Supabase buckets during server startup.
- Do not perform real Supabase Storage writes in the default automated test suite.
- Do not commit inside the ordered implementation tasks. Commit happens only after a separate final owner approval.
- B7 acceptance assumes the current single backend instance deployment model.
- Multi-instance duplicate-upload coordination is a B9 production-scaling requirement and needs a separate schema or distributed-lock strategy.

## 3. Fixed Product Decisions

B7 decisions are fixed:

- Image normalization is performed by the backend.
- Original uploaded bytes are never retained after processing.
- Output formats are WebP and AVIF.
- Responsive widths are `480`, `960`, and `1600`, with no enlargement.
- Original aspect ratio is preserved.
- Crop is forbidden.
- WebP encoder options are `quality=82` and `effort=4`.
- AVIF encoder options are `quality=55`, `effort=4`, and `chromaSubsampling="4:4:4"`.
- Supabase bucket is public.
- Direct browser upload is forbidden.
- Upload is only to an existing `Site`.
- Idempotency scope is exactly `(siteId, slot, assetId)`, where `assetId` is the request `clientFileId` UUID.
- The same `assetId` on different Sites is allowed because Storage paths include `siteId`.
- Editor can mutate images only on draft sites.
- Admin can mutate images on draft and published sites.
- Archived, inactive, and soft-deleted site image mutations are forbidden.
- Preview upload is single-file.
- Gallery upload supports single and batch.
- Batch upload supports partial success.
- Batch maximum is `10` files.
- Per-batch encode concurrency is `2`.
- Process-wide encode semaphore is `4`.
- Valid partial batch responses return HTTP `200`.
- Deletion uses database detach plus `StorageCleanupJob`.
- Gallery maximum is `20` images.
- Original filenames never appear in URLs, paths, DTOs, audit logs, or errors.
- Frontend integration remains B8.

## 4. Scope

B7 implementation scope:

- Add backend dependencies exactly as approved.
- Add typed storage environment parsing.
- Add image parser, processor, storage adapter, services, routes, mappers, cleanup worker, and operational CLI commands.
- Integrate image endpoints under `/api/admin`.
- Narrow B5 generic site create/update schemas so image URLs and gallery JSON can no longer be written through generic endpoints.
- Extend public catalog mappers/types to expose managed variants while preserving legacy fields.
- Extend publish logic so a site cannot be published without `previewImageUrl`.
- Add unit and integration tests using fake Storage by default.

B7 uses the existing Prisma schema. The inspected schema already contains:

- `Site.previewImageUrl String?`
- `Site.galleryImages Json @default("[]")`
- `Site.status String @default("draft")`
- `Site.active Boolean @default(true)`
- `Site.deletedAt DateTime?`
- `Site.publishedAt DateTime?`
- `Site.categoryId String`
- `AuditLog` with `actorUserId`, `requestId`, `beforeJson`, and `afterJson`
- `StorageCleanupJob` with `storagePath`, `reason`, `entityType`, `entityId`, `status`, `attempts`, `lastError`, `runAfter`, and `completedAt`

No B7 schema or migration change is planned.

## 5. Explicit Out-of-Scope

Do not implement:

- frontend/admin UI integration;
- public upload API;
- temporary upload API;
- asset list independent of a `Site`;
- local persistent uploaded files;
- Storage bucket creation on server startup;
- Supabase Storage writes in default tests;
- Prisma schema changes;
- migrations;
- seed or snapshot changes;
- database dumps;
- Redis or distributed rate-limit store;
- antivirus SDK integration;
- FFmpeg, ImageMagick, or GraphicsMagick;
- multer, formidable, file-type, package overrides, `npm audit fix`, or force upgrades;
- Render deploy, GitHub Pages changes, push, PR, merge, or deploy.

## 6. Existing Schema Compatibility

Compatibility decision:

- B7 is schema-compatible and does not require a migration.
- `Site.previewImageUrl` stores the largest WebP public URL for the current preview.
- `Site.galleryImages` stores managed JSON descriptors for gallery images.
- `StorageCleanupJob` stores one object path per row because the existing model has a single `storagePath` field.
- `AuditLog` stores safe before/after mutation payloads.

Preview representation:

```json
{
  "previewImageUrl": "https://public-storage-origin/storage/v1/object/public/web00-catalog-images/sites/<siteId>/preview/<assetId>/1600.webp"
}
```

Managed preview details are reconstructed from strict path parsing:

- bucket must match `SUPABASE_STORAGE_BUCKET`;
- origin must match `STORAGE_PUBLIC_BASE_URL` or official Supabase public URL origin;
- path shape must be `sites/{siteId}/preview/{assetId}/{width}.webp`;
- `siteId` must equal the current database site UUID;
- `assetId` must be UUID;
- width must be a generated positive width.

Gallery managed descriptor:

```json
{
  "assetId": "00000000-0000-4000-8000-000000000001",
  "storagePath": "sites/<siteId>/gallery/<assetId>",
  "url": "https://public-storage-origin/storage/v1/object/public/web00-catalog-images/sites/<siteId>/gallery/<assetId>/1600.webp",
  "alt": "Dashboard preview",
  "sortOrder": 0
}
```

Legacy compatibility:

- Legacy `previewImageUrl` and legacy gallery items remain readable.
- Legacy preview URLs are classified as unmanaged unless strict managed-path validation succeeds.
- Legacy gallery items that lack `assetId` or the managed `storagePath` shape are unmanaged.
- B7 upload/reorder/delete mutations return `409 GALLERY_DATA_INVALID` for malformed or mixed legacy/managed gallery state.
- Legacy public catalog responses remain parseable through existing `previewImageUrl` and `galleryImages[].url`.
- B7 adds managed fields without removing existing fields.

Schema blocker rule:

- If implementation discovers that existing `StorageCleanupJob` cannot store one object-path delete job with retry lifecycle, stop B7 with a blocker naming the exact missing field or constraint.
- If implementation discovers public variants cannot be derived safely from `previewImageUrl` or `galleryImages.storagePath`, stop B7 with a blocker naming the exact incompatible value shape.

## 7. Dependency Contract

Future package changes are limited to these exact versions:

Dependencies:

```json
{
  "@supabase/supabase-js": "2.110.8",
  "busboy": "1.6.0",
  "sharp": "0.35.3"
}
```

Conditional dev dependency if declaration check requires it:

```json
{
  "@types/busboy": "1.5.4"
}
```

`@types/busboy` rule:

- Before adding `@types/busboy`, run read-only metadata and TypeScript compatibility checks.
- Add `@types/busboy@1.5.4` only if `busboy@1.6.0` does not provide sufficient declarations for the current `strict`, `skipLibCheck=false`, `NodeNext` TypeScript config.
- If built-in declarations are sufficient, do not add `@types/busboy` and document the evidence in the final implementation checkpoint.

Forbidden dependency actions:

- Do not install `multer`, `formidable`, `file-type`, ImageMagick, GraphicsMagick, FFmpeg, antivirus SDKs, direct Storage packages other than official Supabase client, package overrides, or `npm audit fix`.
- Do not install packages with ranges. Use exact versions without `^` or `~`.

Required dependency verification:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$env:PATH = "$PortableRoot;$env:PATH"
Set-Location D:\WEB00_BACKEND\backend

& $PortableNpm install --save-exact sharp@0.35.3 busboy@1.6.0 @supabase/supabase-js@2.110.8
# Run this only if Task 1 proves busboy declarations are insufficient.
& $PortableNpm install --save-dev --save-exact @types/busboy@1.5.4
& $PortableNpm ls sharp busboy @supabase/supabase-js @types/busboy --all
& $PortableNpm audit --omit=dev --audit-level=high
& $PortableNpm audit --audit-level=high
```

Implementation gate:

- verify npm metadata and current exact package install;
- verify Sharp load;
- verify WebP/AVIF smoke through `$PortableNode`;
- verify Supabase client import;
- verify Busboy import;
- record TypeScript declaration decision for `@types/busboy`;
- run production and full audit.

Supabase package rule:

- `@supabase/supabase-js` is pinned exactly to `2.110.8`.
- API contract tests are required.
- A new direct moderate finding requires owner risk decision.
- High or critical findings block implementation.
- Automatic update or downgrade is forbidden.

Blockers:

- Sharp cannot install, load, or encode WebP and AVIF on portable Node 22.23.1.
- Any new high or critical vulnerability appears.
- A new moderate vulnerability appears in a direct B7 dependency and has no explicit owner risk decision before the implementation commit.

## 8. Environment And Bucket Contract

Future environment names:

```typescript
export interface StorageEnv {
  STORAGE_PUBLIC_BASE_URL: string;
  STORAGE_WORKER_ENABLED: boolean;
  STORAGE_WORKER_POLL_INTERVAL_SECONDS: number;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_STORAGE_BUCKET: string;
  SUPABASE_URL: string;
}

export interface StorageCredentials {
  serviceRoleKey: string;
  supabaseUrl: string;
}

export interface StorageConfig {
  bucket: "web00-catalog-images";
  credentials: StorageCredentials;
  publicBaseUrl: string;
  workerEnabled: boolean;
  workerPollIntervalSeconds: 60;
}
```

Canonical values:

- `SUPABASE_STORAGE_BUCKET=web00-catalog-images`
- `STORAGE_WORKER_POLL_INTERVAL_SECONDS=60`

Rules:

- `app.ts` does not read `process.env`.
- `server.ts` parses storage env alongside existing app/database/auth env and injects typed config.
- Service-role key is server/CLI/worker only.
- Browser receives no service-role key and no signed URLs.
- Env parser errors include only safe variable names.
- URL and key values are never logged.
- Production bucket must be public.
- Incompatible bucket configuration blocks implementation or startup path that needs Storage.
- Local tests use fake Storage.

Bucket config:

- bucket id: `web00-catalog-images`;
- public: `true`;
- allowed MIME types: `image/webp`, `image/avif`;
- derivative object limit: `5 MiB`;
- server startup never creates or mutates bucket configuration.

## 9. Input And Multipart Contract

Accepted source formats:

- JPEG;
- PNG;
- WebP;
- AVIF.

Rejected source formats:

- SVG;
- GIF;
- animated WebP;
- APNG;
- animated AVIF;
- TIFF;
- HEIF/HEIC;
- PDF;
- executable content that cannot be decoded as an allowed image format;
- unknown format.

Limits:

- source file bytes: `<= 5 MiB`;
- batch file count: `<= 10`;
- total raw batch bytes: `<= 30 MiB`;
- decoded pixels: `<= 40,000,000`;
- source width and height: each `<= 20,000`;
- resulting height: `<= 12,000`;
- gallery final count: `<= 20`;
- preview file count: exactly `1` for PUT and `0` for DELETE.

Single multipart shape:

```text
file field: image
text field: clientFileId = UUID
text field: alt = optional string, max 160; preview ignores persisted alt
```

Batch multipart shape:

```text
file field: images, repeated 1..10 times
text field: metadata = JSON array with one item per file stream index
metadata item: { "clientFileId": "uuid", "alt": "optional string" }
metadata max bytes: 16 KiB
```

Parser rules:

- Use Busboy streaming multipart parsing.
- Do not use global JSON parser for multipart bodies.
- Do not buffer the whole batch before validation starts.
- Each source can be held only in bounded memory up to the approved source limit.
- Exceeding a file limit interrupts that file stream.
- Request abort releases buffers and cancels pending processing.
- Unknown multipart fields are rejected.
- Duplicate `clientFileId` values inside one request are rejected.
- `filename` is untrusted and never persisted or returned.
- Declared MIME is checked.
- Actual format is determined by successful Sharp decode/metadata.
- Declared MIME and decoded format must agree.
- B7 does not claim universal polyglot detection.
- Source bytes are never stored or published.
- Public Storage objects are only Sharp-generated WebP/AVIF derivatives.
- Re-encoded derivatives are decoded again before upload.

Exact Busboy limits:

```typescript
export const IMAGE_MULTIPART_LIMITS = {
  batchFiles: 10,
  batchTotalBytes: 30 * 1024 * 1024,
  fieldNameSize: 80,
  fields: 2,
  fileSize: 5 * 1024 * 1024,
  files: 10,
  headerPairs: 100,
  singleFiles: 1,
  textFieldSize: 16 * 1024
} as const;
```

## 10. Image Normalization Contract

Pipeline:

1. read bounded source bytes;
2. decode with Sharp;
3. inspect metadata;
4. validate declared MIME against decoded format;
5. reject animation and multi-page input;
6. enforce pixel and dimension limits;
7. auto-orient;
8. convert to sRGB;
9. strip EXIF, ICC, XMP, GPS, and unapproved metadata;
10. preserve alpha;
11. resize without crop and without enlargement;
12. encode WebP and AVIF variants;
13. verify every output is non-empty and decodable;
14. upload immutable objects.

Sharp rules:

- Do not call `withMetadata()`.
- Use `rotate()` for auto-orient.
- Use `.toColorspace("srgb")`.
- Preserve transparency for PNG/WebP/AVIF inputs with alpha.
- Reject animation when metadata indicates pages/frames beyond one image.
- Corrupt decode returns `422 IMAGE_INVALID`.
- Pixel or dimension violation returns `422 IMAGE_PIXEL_LIMIT_EXCEEDED`.

Timeouts:

- one source pipeline: `45 seconds`;
- full batch: `180 seconds`;
- timeout cancels remaining processing and uploads where possible;
- already uploaded orphan objects enter cleanup jobs.

## 11. Responsive Variant Contract

Width algorithm:

```typescript
export function selectVariantWidths(originalWidth: number): number[] {
  const widths = [480, 960, 1600, originalWidth]
    .filter((width) => width <= originalWidth);

  return [...new Set(widths)].sort((left, right) => left - right);
}
```

Required behavior:

- original width `< 480`: only original width;
- `480 < original width < 960`: `480` plus original width;
- `960 < original width < 1600`: `480`, `960`, plus original width;
- original width `>= 1600`: `480`, `960`, `1600`;
- exact duplicate widths are removed;
- no output width exceeds original width;
- output height after resize must be `<= 12,000`.

Encoder options:

```typescript
export const IMAGE_ENCODER_OPTIONS = {
  avif: {
    chromaSubsampling: "4:4:4",
    effort: 4,
    quality: 55
  },
  webp: {
    effort: 4,
    quality: 82,
    smartSubsample: true
  }
} as const;
```

AVIF bit depth stays `8` unless implementation proves a need already approved by this plan's quality constraints.

## 12. Storage Paths And Public URL Contract

Immutable object paths:

```text
sites/{siteId}/preview/{assetId}/{width}.webp
sites/{siteId}/preview/{assetId}/{width}.avif
sites/{siteId}/gallery/{assetId}/{width}.webp
sites/{siteId}/gallery/{assetId}/{width}.avif
```

Path rules:

- `siteId` is the database UUID.
- `assetId` equals `clientFileId`.
- `assetId` is scoped by `(siteId, slot, assetId)` and is not globally unique.
- The same `assetId` on different Sites is allowed.
- Different Sites produce different paths because `siteId` is part of every object path.
- `width` is one generated positive integer.
- `slot` is exactly `preview` or `gallery`.
- Caller cannot supply path, URL, bucket, content type, or cache headers.
- Original filenames are ignored.
- Repository-wide JSON scans across all Sites are forbidden.

Upload options:

```typescript
export interface UploadImageObjectInput {
  body: Buffer;
  cacheControl: "31536000";
  contentType: "image/avif" | "image/webp";
  path: string;
  upsert: false;
}

export interface StorageObjectInspection {
  existingPaths: string[];
  missingPaths: string[];
}
```

Storage rules:

- `upsert=false`.
- Overwrite/update API is forbidden.
- `cacheControl=31536000`.
- Exact `contentType` per object.
- No signed URLs.
- Public URLs are produced through official `getPublicUrl` or deterministic safe adapter logic.
- Returned public URL must belong to configured bucket and configured public origin.
- Supabase-specific responses stay inside the adapter.
- Supabase deletion uses Storage API `remove()`, never SQL deletion of `storage.objects`.
- `ImageStorage.inspectObjects(paths)` checks only validated canonical paths.
- Supabase inspection lists the exact canonical asset folder and compares provider results only with expected filenames.
- Arbitrary bucket or prefix input is forbidden.
- Provider listing responses are not returned through API responses.
- Public URL existence is not treated as proof that the object exists.

Partial deterministic object behavior under the upload coordinator:

1. Check database attachment first.
2. If attachment exists, return replay without Storage calls.
3. If attachment is absent, inspect the expected canonical object paths.
4. If a partial object set exists, create durable cleanup reservations, delete stale partial paths through the approved cleanup path, and retry only after the stale set is confirmed absent.
5. If a full unattached object set exists, treat it as orphaned, clean it up, and then retry upload.
6. Never attach an unknown unattached object set as a successful replay.

## 13. Image Descriptor And Legacy Compatibility

Managed preview public DTO:

```typescript
export interface PublicImageVariant {
  avifUrl: string;
  webpUrl: string;
  width: number;
}

export interface PublicPreviewImage {
  assetId: string;
  url: string;
  variants: PublicImageVariant[];
}

export interface ManagedImageDescriptor {
  assetId: string;
  siteId: string;
  slot: "gallery" | "preview";
  storagePath: string;
  url: string;
  widths: number[];
}

export interface ManagedPreviewDescriptor extends ManagedImageDescriptor {
  slot: "preview";
}

export interface ManagedImageUrlPolicy {
  buildVariants(input: ManagedImageDescriptor): PublicImageVariant[];
  parseManagedPreview(
    siteId: string,
    url: string
  ): ManagedPreviewDescriptor | null;
}
```

Public site response compatibility:

- Keep `previewImageUrl`.
- Add `previewImage: PublicPreviewImage | null`.
- Keep `galleryImages[].url`.
- Add `galleryImages[].assetId`.
- Add `galleryImages[].variants`.
- Existing legacy `PublicGalleryImage` remains parseable.
- Invalid managed JSON throws a safe `INTERNAL_ERROR` for public reads and does not leak raw DB values.
- Public mapper receives a `ManagedImageUrlPolicy` through dependency injection and never reads `process.env`.

Managed gallery DTO:

```typescript
export interface ManagedGalleryImage {
  alt: string;
  assetId: string;
  sortOrder: number;
  storagePath: `sites/${string}/gallery/${string}`;
  url: string;
}

export interface PublicManagedGalleryImage extends ManagedGalleryImage {
  variants: PublicImageVariant[];
}
```

Legacy mutation behavior:

- Preview replacement may clear a legacy preview URL but must not delete Storage unless strict managed validation succeeds.
- Gallery upload, reorder, and delete refuse malformed or mixed legacy/managed gallery state with `409 GALLERY_DATA_INVALID`.
- Legacy gallery repair/migration is outside B7 normal mutation paths.
- No silent destructive reset of `galleryImages` is allowed.

Managed classification requires all of:

- approved public origin;
- approved public bucket;
- exact `siteId`;
- exact slot;
- UUID `assetId`;
- allowed filename width and format;
- no query string;
- no fragment;
- no path traversal;
- canonical URL encoding.

## 14. RBAC And Site-State Policy

Use the central permission policy. Do not scatter direct role comparisons.

Permissions:

- Draft image mutation uses `site.updateDraft`.
- Published image mutation uses `site.updateAny`.

Central helper:

```typescript
export interface SiteImageMutationSite {
  active: boolean;
  deletedAt: Date | null;
  id: string;
  status: string;
}

export function assertCanMutateSiteImages(
  principal: AuthenticatedPrincipal,
  site: SiteImageMutationSite,
  policy: PermissionPolicy = createPermissionPolicy()
): void;
```

Rules:

- Editor may mutate only `status="draft"`, `active=true`, `deletedAt=null`.
- Admin may mutate `status="draft"` or `status="published"`, `deletedAt=null`.
- Archived sites return `409 SITE_IMAGE_STATE_FORBIDDEN`.
- Soft-deleted sites return `409 SITE_IMAGE_STATE_FORBIDDEN` after route permission is satisfied.
- Inactive sites return `409 SITE_IMAGE_STATE_FORBIDDEN`.
- Missing site returns `404 SITE_NOT_FOUND`.
- Editor published mutation returns `403 FORBIDDEN`.
- Admin archived mutation returns `409 SITE_IMAGE_STATE_FORBIDDEN`.
- A caller without route permission receives `403 FORBIDDEN` before site existence is revealed.

## 15. API Surface

Preview:

```text
PUT    /api/admin/sites/:id/images/preview
DELETE /api/admin/sites/:id/images/preview
```

Gallery:

```text
POST   /api/admin/sites/:id/images/gallery
POST   /api/admin/sites/:id/images/gallery/batch
PATCH  /api/admin/sites/:id/images/gallery
DELETE /api/admin/sites/:id/images/gallery/:assetId
```

Operational CLI:

```text
npm run storage:bootstrap
npm run storage:cleanup
```

Route ordering:

1. admin cache-control;
2. Bearer auth;
3. route permission;
4. site state validation;
5. upload rate limiter for upload routes;
6. multipart parser for upload routes;
7. controller.

Exact gallery batch route must be registered before dynamic `:assetId` delete.

## 16. Preview Contract

PUT preview:

- Accepts exactly one `image` file and one `clientFileId` UUID.
- Optional `alt` is validated to max `160` and not persisted.
- Generates and uploads all variants before database mutation.
- Opens a short serializable transaction after upload.
- Rechecks site state in the transaction.
- Sets `previewImageUrl` to the largest WebP public URL.
- Creates audit action `site.image.preview_replace`.
- Creates cleanup jobs for previous managed preview variant paths.
- Does not delete legacy preview URLs unless strict managed path validation succeeds.
- Returns HTTP `200`.
- Response includes `data.previewImage`, `data.replaced`, and `data.replayed`.

Preview response shape:

```json
{
  "data": {
    "previewImage": {},
    "replaced": false,
    "replayed": false
  }
}
```

Replay behavior:

- First new preview returns `replayed=false`.
- Replacement returns `replaced=true` and `replayed=false`.
- Exact attached `assetId` replay returns `replayed=true` and `replaced=false`.
- Exact replay performs no upload, no DB update, no audit, and no cleanup job creation.

No-downtime published replacement:

- Existing published preview stays active until the database commit succeeds.
- Encoding/upload failure preserves old preview.
- Database failure preserves old preview and schedules orphan uploaded variants for cleanup.

DELETE preview:

- Draft site: sets `previewImageUrl=null`, creates cleanup jobs for managed variants, creates audit action `site.image.preview_delete`, returns `200`.
- Published site: returns `409 SITE_PREVIEW_REQUIRED`.
- Missing preview: returns `404 IMAGE_NOT_FOUND`.

Publish rule after B7:

- Publishing requires a non-empty `previewImageUrl`.
- Legacy preview values are accepted for publish compatibility.
- Missing preview returns `409 SITE_PREVIEW_REQUIRED`.
- B5 publish tests are updated.

## 17. Gallery Single And Batch Contract

POST single gallery:

- Accepts exactly one `image` file.
- Requires one `clientFileId` UUID.
- Accepts optional `alt`, max `160`.
- Requires final gallery count `<=20`.
- Successful new upload returns HTTP `201`.
- New item is appended.
- `sortOrder` is normalized to contiguous `0..n-1`.
- Site JSON update and audit are atomic.
- Database failure schedules uploaded variants for cleanup.
- Duplicate replay follows the idempotency contract.

POST batch gallery:

- Accepts `1..10` files.
- Requires metadata array with one UUID `clientFileId` per file index.
- Total raw bytes limit is `30 MiB`.
- Encode concurrency inside the batch is `2`.
- Results keep input index.
- Process/upload candidates may finish out of order.
- Successful candidates are attached to the database strictly by ascending input index.
- Each successful candidate commits independently in its own short Serializable transaction.
- Failure of one item does not roll back prior committed successes.
- One audit row is created per successful new image.
- Replay creates no second audit.
- Failure creates no success audit.
- Valid partial batch response is HTTP `200`.

Batch orchestration:

Phase A - parse:

- Determine input indexes `0..n-1`.
- Validate metadata before image processing.
- Duplicate `clientFileId` values inside the request reject the batch envelope.

Phase B - process and upload:

- Run processing/upload with maximum concurrency `2`.
- Store per-item results by input index.
- Invalid items do not create upload reservations and do not consume gallery slots.
- A later candidate may finish processing before an earlier candidate.

Phase C - database attachment:

- Consider only successfully processed candidates, ordered by ascending input index.
- Commit attachments sequentially.
- Re-read gallery count/state inside each transaction.
- Append successes in input order.
- Create one audit per success.
- A failed attach does not roll back previous successes.

Batch response shape:

```typescript
export interface GalleryBatchResponse {
  failed: Array<{
    clientFileId: string | null;
    code: ErrorCode;
    index: number;
    message: string;
  }>;
  succeeded: Array<{
    clientFileId: string;
    image: PublicManagedGalleryImage;
    index: number;
    replayed: boolean;
  }>;
}
```

Gallery slots:

- If current gallery has `18` managed items and batch has `5` otherwise valid new files, exactly `2` new unique uploads may succeed and the remaining valid new items fail with `GALLERY_LIMIT_EXCEEDED`.
- Invalid earlier items do not consume gallery slots.
- Slot reservation is deterministic under concurrency.
- If a processed candidate loses an available gallery slot, its uploaded objects remain protected by active upload cleanup reservations and those reservations are not marked completed.
- Concurrent batch/single requests re-read gallery state during every attach so final gallery count never exceeds `20`.
- A global Storage outage before the first success returns `503 STORAGE_UNAVAILABLE`.
- A Storage outage after at least one success returns HTTP `200` partial result with remaining items failed as `STORAGE_WRITE_FAILED` or `STORAGE_UNAVAILABLE`.

## 18. Idempotency And Concurrency

Idempotency key:

- `clientFileId` UUID is the `assetId`.
- Canonical scope is `(siteId, slot, assetId)`.
- Canonical coordinator key is `${siteId}:${slot}:${assetId}`.
- One scoped key identifies one logical upload under one site and one slot.
- `clientFileId` is not a global system-wide asset ID.
- `siteId` in the path prevents cross-site object path collisions.
- Global uniqueness without a Prisma asset model is not claimed.
- Repository-wide JSON scans across all Sites are forbidden.

Replay rules:

- Same site, same slot, same `assetId`, already attached: return existing descriptor with `replayed=true`, no new DB item, no audit, no upload.
- Same site, different slot, same `assetId`: `409 UPLOAD_ID_CONFLICT`.
- Different Sites with the same `assetId`: allowed because paths include different `siteId` values.
- Different Sites with the same `assetId` create different Storage paths.
- Deterministic path has partial object set: create durable cleanup reservations, clean partial paths through the approved cleanup path, then retry upload only after stale paths are absent.
- Full unattached deterministic object set: treat as orphaned, clean it up, and retry upload.
- Concurrent same `(siteId, slot, assetId)` in one backend instance: exactly one logical attachment and one audit.

Asset upload coordinator:

```typescript
export interface AssetUploadCoordinator {
  runExclusive<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T>;
}
```

Coordinator contract:

- Use an in-process keyed mutex.
- Use no external dependency.
- Requests with different keys run in parallel.
- Requests with the same key run sequentially.
- The key is removed from the internal `Map` after the last waiter completes.
- A rejected operation releases the lock.
- No global mutable test hook is allowed.
- No arbitrary sleeps are allowed.
- Coordinator prevents duplicate concurrent Storage pipelines inside the current process.
- Coordinator helps ensure one attachment/audit for the same key in the current instance.
- Coordinator does not replace Serializable DB transactions.
- Coordinator is not a distributed lock.
- B7 does not claim cross-instance exactly-once upload coordination.
- Multi-instance duplicate-upload coordination is a B9 production-scaling requirement.

Concurrency rules:

- Use short `Serializable` Prisma transactions through the existing B6 retry helper.
- Retry only approved write-conflict cases already covered by B6: Prisma `P2034` and Prisma adapter PostgreSQL `40001`.
- Retry at most five attempts.
- Return safe `409 CONCURRENT_MODIFICATION` on retry exhaustion.
- Do not run Sharp or Storage network calls inside the transaction.
- Do not sleep inside transaction retry loops.

## 19. Gallery Reorder And Delete

PATCH reorder body:

```json
{
  "items": [
    {
      "assetId": "00000000-0000-4000-8000-000000000001",
      "alt": "Updated alt",
      "sortOrder": 0
    }
  ]
}
```

Reorder rules:

- Strict JSON body.
- Full replacement order of current managed gallery.
- Each current managed `assetId` appears exactly once.
- Unknown `assetId` is rejected.
- Missing current `assetId` is rejected.
- Duplicate `assetId` is rejected.
- `sortOrder` is canonicalized to contiguous `0..n-1`.
- `alt` is trimmed.
- Blank `alt` is stored as empty string and public mapper falls back to site title.
- `alt` max is `160`.
- Mixed legacy/managed gallery returns `409 GALLERY_DATA_INVALID`.
- No Storage operation is performed.
- A short serializable transaction updates JSON and creates one `site.image.gallery_update` audit.

DELETE gallery:

- `assetId` route param must be UUID.
- Managed asset only.
- Missing asset returns `404 IMAGE_NOT_FOUND`.
- Legacy unmanaged item returns `409 IMAGE_NOT_MANAGED`.
- Removes descriptor and normalizes remaining `sortOrder`.
- Creates cleanup jobs for all variants.
- Creates `site.image.gallery_delete` audit.
- Site update, cleanup jobs, and audit are atomic.
- Storage is not called inside the transaction.
- Later Storage deletion failure does not restore the gallery item.

## 20. Cleanup Job And Worker

Use existing `StorageCleanupJob` without schema changes.

Existing field mapping:

```typescript
export interface StorageCleanupJobRecord {
  attempts: number;
  completedAt: Date | null;
  entityId: string | null;
  entityType: string | null;
  id: string;
  lastError: string | null;
  reason: string;
  runAfter: Date;
  status: "pending" | "processing" | "completed" | "failed";
  storagePath: string;
  updatedAt: Date;
}
```

Job granularity:

- One row deletes one Storage object path.
- `entityType="site_image"` for B7 image cleanup jobs.
- `entityId` stores the site UUID.
- `reason` is one of `upload_reservation`, `preview_replace`, `preview_delete`, `gallery_delete`, `orphan_upload`, `partial_upload_retry`.

Durable upload cleanup reservation saga:

Before any Storage upload:

1. Confirm the database is available.
2. Create one `StorageCleanupJob` reservation for each expected variant path.
3. Use `status="pending"`.
4. Use `reason="upload_reservation"`.
5. Use `runAfter = now + 15 minutes`.
6. Use `entityType="site_image"`.
7. Use `entityId = siteId`.

The `15 minutes` delay exceeds the single pipeline timeout `45 seconds`, the batch timeout `180 seconds`, and the normal database attach interval.

After reservation creation:

1. Process and upload variants.
2. Run the short Serializable Site attach transaction.
3. In the same transaction, update `Site`, create `AuditLog`, and cancel the matching reservation jobs by setting `status="completed"`, `completedAt=now`, and `lastError=null`.

Failure behavior:

- If processing, upload, or attach fails, Site state remains unchanged.
- Reservation jobs remain `pending`.
- A best-effort database update may move `runAfter` closer to `now`.
- If that best-effort update fails, the worker still deletes orphan paths after the original `15 minutes`.
- Immediate direct Storage delete is allowed only as best effort and does not replace durable reservation jobs.
- If upload never created an object, cleanup worker sees not-found and marks success.
- Replay creates no new reservation jobs, no upload, and no audit.

Worker rules:

- Poll interval is `60 seconds`.
- Batch size is `20` jobs.
- Remove concurrency is `2`.
- Max attempts is `5`.
- Backoff after failures is `1 minute`, `5 minutes`, `30 minutes`, `2 hours`, `12 hours`.
- Select due jobs with `status in ("pending", "failed")`, `runAfter <= now`, `attempts < 5`, and `completedAt=null`.
- Claim jobs as `processing` before removal using a race-safe conditional update.
- Recover stale `processing` jobs older than `15 minutes` by returning them to `pending` without resetting attempts.
- Storage 404/not found counts as success.
- Success sets `status="completed"` and `completedAt=now`.
- Failure increments attempts and stores a safe error code in `lastError`.
- Attempt five failure stays `failed` with no automatic future selection.
- Logs contain no secrets, signed query strings, service-role key, raw URLs with sensitive query, stack, or raw provider error.
- `npm run storage:cleanup` performs one bounded tick.
- Server starts worker only when `STORAGE_WORKER_ENABLED=true`.
- Unit tests manually tick the worker and use no real timers.
- Graceful shutdown waits a bounded time and leaves unfinished jobs retryable.

Race-safe claim algorithm:

1. Select at most `20` candidate IDs where `status in ("pending", "failed")`, `runAfter <= now`, `attempts < 5`, and `completedAt=null`.
2. For each candidate, run a conditional update by `id` that repeats the same `status`, `runAfter`, `attempts`, and `completedAt` predicates.
3. Set `status="processing"` and `updatedAt=now`.
4. Process the job only when conditional update count is `1`.

Claim rules:

- Two workers may see the same candidate.
- Only the worker with update count `1` processes it.
- The second worker skips it.
- Server worker and `storage:cleanup` command safely coexist.
- Provider remove may be repeated across separate cycles, and not-found is success.
- Exactly-once Storage delete is not claimed.
- DB claim gives at-most-one active processor per claim cycle.
- Stale recovery conditionally updates `processing` jobs with `updatedAt` older than `15 minutes`, returns them to `pending`, and never touches completed jobs.

## 21. Bucket Bootstrap

Command:

```text
npm run storage:bootstrap
```

Implementation:

- Production launcher is compiled JS in `dist/cli/storage-bootstrap.command.js`, following the B6 CLI pattern.
- Parse env safely.
- Require interactive TTY.
- Inspect bucket.
- If bucket is absent, print safe desired config and require exact confirmation `CREATE STORAGE BUCKET`.
- If confirmed, create bucket with public WebP/AVIF config.
- If bucket exists and is compatible, return idempotent success.
- If bucket exists and is incompatible, return a safe blocking error.
- Do not silently modify incompatible bucket settings.
- Do not output service-role key or raw Storage URLs.
- Do not run this command from server startup.

Safe desired config:

```json
{
  "allowedMimeTypes": ["image/webp", "image/avif"],
  "fileSizeLimit": 5242880,
  "id": "web00-catalog-images",
  "public": true
}
```

## 22. Audit Contract

Audit actions:

- `site.image.preview_replace`
- `site.image.preview_delete`
- `site.image.gallery_add`
- `site.image.gallery_update`
- `site.image.gallery_delete`

Audit rules:

- `actorUserId` is the authenticated admin/editor user ID.
- `requestId` is set from existing request-id middleware.
- Mutation and audit are atomic.
- Batch creates one audit per successful new image.
- Replay creates no second audit.
- Failure creates no success audit.

Safe payload may include:

- `siteId`;
- `assetId`;
- `slot`;
- `widths`;
- `formats`;
- canonical relative base paths;
- previous and new managed asset IDs;
- reordered asset IDs;
- sanitized alt-change indicator.

Payload must not include:

- binary;
- original filename;
- source bytes;
- multipart body;
- service-role key;
- Authorization header;
- cookies;
- signed URL query strings;
- raw Supabase errors;
- raw Sharp errors;
- raw Prisma errors;
- stack traces.

## 23. Error Contract

Add exact error codes:

```typescript
export type B7ImageErrorCode =
  | "IMAGE_REQUIRED"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_BATCH_LIMIT_EXCEEDED"
  | "IMAGE_TOTAL_SIZE_EXCEEDED"
  | "IMAGE_FORMAT_UNSUPPORTED"
  | "IMAGE_MIME_MISMATCH"
  | "IMAGE_INVALID"
  | "IMAGE_ANIMATION_NOT_ALLOWED"
  | "IMAGE_PIXEL_LIMIT_EXCEEDED"
  | "IMAGE_OUTPUT_TOO_LARGE"
  | "IMAGE_PROCESSING_TIMEOUT"
  | "GALLERY_LIMIT_EXCEEDED"
  | "GALLERY_DATA_INVALID"
  | "IMAGE_NOT_FOUND"
  | "IMAGE_NOT_MANAGED"
  | "SITE_PREVIEW_REQUIRED"
  | "SITE_IMAGE_STATE_FORBIDDEN"
  | "UPLOAD_ID_CONFLICT"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_WRITE_FAILED"
  | "STORAGE_CONFIGURATION_INVALID"
  | "STORAGE_CLEANUP_DEFERRED"
  | "CONCURRENT_MODIFICATION";
```

HTTP mapping:

- `400`: multipart structure errors, `IMAGE_REQUIRED`, malformed `clientFileId`, `IMAGE_BATCH_LIMIT_EXCEEDED`, validation errors, reorder body errors.
- `413`: `IMAGE_TOO_LARGE`, `IMAGE_TOTAL_SIZE_EXCEEDED`, `IMAGE_OUTPUT_TOO_LARGE`.
- `415`: `IMAGE_FORMAT_UNSUPPORTED`, `IMAGE_MIME_MISMATCH`, `IMAGE_ANIMATION_NOT_ALLOWED`.
- `422`: `IMAGE_INVALID`, `IMAGE_PIXEL_LIMIT_EXCEEDED`.
- `404`: `SITE_NOT_FOUND`, `IMAGE_NOT_FOUND`.
- `409`: `GALLERY_LIMIT_EXCEEDED`, `GALLERY_DATA_INVALID`, `IMAGE_NOT_MANAGED`, `SITE_PREVIEW_REQUIRED`, `SITE_IMAGE_STATE_FORBIDDEN`, `UPLOAD_ID_CONFLICT`, `CONCURRENT_MODIFICATION`.
- `503`: `IMAGE_PROCESSING_TIMEOUT`, `STORAGE_UNAVAILABLE`, `STORAGE_WRITE_FAILED`, `STORAGE_CONFIGURATION_INVALID`.

`STORAGE_CLEANUP_DEFERRED` is for safe internal logs and CLI reports when a cleanup reservation remains pending after an upload failure. Normal upload API responses return the original safe processing, Storage, or database error instead.

All responses use the existing error envelope:

```json
{
  "error": {
    "code": "IMAGE_REQUIRED",
    "message": "Image is required.",
    "requestId": "req_example"
  }
}
```

No internal Sharp, Supabase, Prisma, stack, filename, URL, key, or multipart details are returned.
Audit and error payloads never include service keys, source bytes, raw public URLs, signed queries, or raw provider messages. Canonical relative Storage paths are allowed only in safe internal logs and cleanup records.

## 24. Rate-Limit And Resource Controls

Use existing `express-rate-limit`; do not add a new dependency.

Upload limits:

- Preview and single gallery upload: `30 attempts / 15 minutes` per authenticated user ID.
- Batch upload: `6 attempts / 15 minutes` per authenticated user ID.

Rules:

- Use separate limiter instances/stores for single and batch upload routes.
- Key by authenticated user ID; add safe IP supplement only as a secondary component.
- Failed authorization does not consume upload quota because auth/permission middleware runs first.
- Invalid multipart may consume quota because limiter runs before parser.
- Successful replay may consume quota.
- Delete and reorder do not use upload limiter.
- Memory store is accepted for the current single-instance phase.
- Multi-instance rate-limit store is deferred to production scaling.
- `429 RATE_LIMITED` uses the existing envelope.

Resource controls:

- Streaming multipart parser.
- Source bytes `5 MiB`.
- Batch raw bytes `30 MiB`.
- File count `10`.
- Batch processing concurrency `2`.
- Process semaphore `4`.
- Pixel limit `40 MP`.
- No enlargement.
- No crop.
- Pipeline timeout `45 seconds`.
- Batch timeout `180 seconds`.
- Clear Buffer references after processing.
- Upload variants progressively while preserving cleanup list.
- No arbitrary sleeps.

## 25. File Map And Interfaces

Create files:

```text
backend/src/config/storage-env.ts

backend/src/modules/images/image.types.ts
backend/src/modules/images/image.errors.ts
backend/src/modules/images/image-paths.ts
backend/src/modules/images/image-variants.ts
backend/src/modules/images/image-processor.ts
backend/src/modules/images/image-semaphore.ts
backend/src/modules/images/asset-upload-coordinator.ts
backend/src/modules/images/multipart-image-parser.ts
backend/src/modules/images/image-storage.ts
backend/src/modules/images/supabase-image-storage.ts
backend/src/modules/images/image-audit.ts

backend/src/modules/admin/images/site-image.types.ts
backend/src/modules/admin/images/site-image.schemas.ts
backend/src/modules/admin/images/site-image.mapper.ts
backend/src/modules/admin/images/site-image.repository.ts
backend/src/modules/admin/images/site-image.service.ts
backend/src/modules/admin/images/site-image.controller.ts
backend/src/modules/admin/images/site-image.routes.ts
backend/src/modules/admin/images/site-image-rate-limit.ts

backend/src/modules/storage-cleanup/storage-cleanup.types.ts
backend/src/modules/storage-cleanup/storage-cleanup.repository.ts
backend/src/modules/storage-cleanup/storage-cleanup.worker.ts
backend/src/modules/storage-cleanup/storage-cleanup.service.ts

backend/src/cli/storage-bootstrap.command.ts
backend/src/cli/storage-cleanup.command.ts

backend/tests/image-env.test.ts
backend/tests/image-paths.test.ts
backend/tests/image-variants.test.ts
backend/tests/image-processor.test.ts
backend/tests/asset-upload-coordinator.test.ts
backend/tests/multipart-image-parser.test.ts
backend/tests/image-storage.adapter.test.ts
backend/tests/site-image.validation.test.ts
backend/tests/site-image.service.test.ts
backend/tests/storage-cleanup.worker.test.ts
backend/tests/storage-bootstrap.command.test.ts
backend/tests/integration/admin-site-images-api.test.ts
```

Modify files:

```text
backend/package.json
backend/package-lock.json
backend/.env.example
backend/src/lib/errors.ts
backend/src/app.ts
backend/src/server.ts
backend/src/modules/admin/admin.routes.ts
backend/src/modules/admin/sites/site.schemas.ts
backend/src/modules/admin/sites/site.repository.ts
backend/src/modules/admin/sites/site.service.ts
backend/src/modules/admin/sites/site.types.ts
backend/src/modules/public-catalog/public-catalog.mapper.ts
backend/src/modules/public-catalog/public-catalog.service.ts
backend/src/modules/public-catalog/public-catalog.types.ts
backend/tests/setup.ts
backend/tests/admin.site.validation.test.ts
backend/tests/admin.site.service.test.ts
backend/tests/integration/admin-api.test.ts
backend/tests/public-catalog.mapper.test.ts
backend/tests/integration/public-catalog-api.test.ts
```

Primary interfaces:

```typescript
export type ImageSlot = "gallery" | "preview";
export type OutputFormat = "avif" | "webp";

export interface ImageVariant {
  body: Buffer;
  contentType: "image/avif" | "image/webp";
  format: OutputFormat;
  height: number;
  path: string;
  width: number;
}

export interface ProcessedImage {
  assetId: string;
  originalHeight: number;
  originalWidth: number;
  variants: ImageVariant[];
  widths: number[];
}

export interface ImageProcessor {
  process(input: {
    assetId: string;
    declaredMimeType: string;
    source: Buffer;
    slot: ImageSlot;
    siteId: string;
  }): Promise<ProcessedImage>;
}

export interface ParsedImageFile {
  alt: string;
  assetId: string;
  declaredMimeType: string;
  index: number;
  source: Buffer;
}

export interface MultipartImageParser {
  parseBatch(request: Request): Promise<ParsedImageFile[]>;
  parseSingle(request: Request): Promise<ParsedImageFile>;
}

export interface ImageStorage {
  createBucket(input: StorageBucketConfig): Promise<StorageBucketResult>;
  getPublicUrl(path: string): string;
  inspectBucket(bucket: string): Promise<StorageBucketInspection>;
  inspectObjects(paths: readonly string[]): Promise<StorageObjectInspection>;
  removeObjects(paths: readonly string[]): Promise<StorageRemoveResult>;
  uploadObject(input: UploadImageObjectInput): Promise<StorageUploadResult>;
}

export interface StorageObjectInspection {
  existingPaths: string[];
  missingPaths: string[];
}

export interface ImagePipelineSemaphore {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export interface AssetUploadCoordinator {
  runExclusive<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T>;
}

export interface Clock {
  now(): Date;
}

export interface ManagedImageUrlPolicy {
  buildVariants(input: ManagedImageDescriptor): PublicImageVariant[];
  parseManagedPreview(
    siteId: string,
    url: string
  ): ManagedPreviewDescriptor | null;
}
```

Service interfaces:

```typescript
export interface PreviewImageService {
  deletePreview(input: SiteImageMutationInput): Promise<PreviewImageResponse>;
  replacePreview(input: SiteImageUploadInput): Promise<PreviewImageResponse>;
}

export interface GalleryImageService {
  addBatch(input: GalleryBatchInput): Promise<GalleryBatchResponse>;
  addSingle(input: SiteImageUploadInput): Promise<GalleryImageResponse>;
  deleteImage(input: GalleryDeleteInput): Promise<GalleryImageListResponse>;
  reorder(input: GalleryReorderInput): Promise<GalleryImageListResponse>;
}

export interface StorageCleanupRepository {
  createJobs(input: CreateStorageCleanupJobInput[]): Promise<void>;
  createUploadReservations(
    input: CreateUploadReservationInput[]
  ): Promise<StorageCleanupJobRecord[]>;
  claimDueJobs(input: ClaimStorageCleanupJobsInput): Promise<StorageCleanupJobRecord[]>;
  markUploadReservationsCompleted(
    input: MarkUploadReservationsCompletedInput
  ): Promise<void>;
  markCompleted(input: MarkStorageCleanupJobCompletedInput): Promise<void>;
  markFailed(input: MarkStorageCleanupJobFailedInput): Promise<void>;
  recoverStaleProcessing(input: RecoverStaleProcessingInput): Promise<number>;
}

export interface StorageCleanupWorker {
  tick(): Promise<StorageCleanupTickResult>;
  start(): void;
  stop(): Promise<void>;
}

export interface StorageBucketBootstrapService {
  run(input: StorageBucketBootstrapInput): Promise<StorageBucketBootstrapResult>;
}
```

Do not build one large upload service. Keep parser, processor, storage, business rules, cleanup, and routes in separate files.

## 26. App/Server/Public API Integration

App integration:

- `app.ts` continues to receive typed routers/services.
- `app.ts` does not read `process.env`.
- Multipart image routes are registered under `/api/admin`.
- Existing JSON body parser remains for JSON routes and does not handle multipart.
- Error middleware remains last.

Server integration:

- `server.ts` parses storage env.
- `server.ts` constructs Supabase image storage adapter.
- `server.ts` constructs image processor and semaphores.
- `server.ts` constructs preview/gallery services and cleanup worker.
- `server.ts` starts cleanup worker only when `STORAGE_WORKER_ENABLED=true`.
- Shutdown stops cleanup worker before Prisma disconnect.

B5 generic site mutation changes:

- Remove `previewImageUrl` from generic create and patch input.
- Remove `galleryImages` from generic create and patch input.
- Client-provided `previewImageUrl` or `galleryImages` through generic endpoints returns `400 VALIDATION_ERROR`.
- Existing records remain readable.
- Seed remains unchanged.

Public mapper changes:

- Existing `previewImageUrl` remains.
- Existing `galleryImages[].url` remains.
- Add managed `previewImage` and `galleryImages[].variants`.
- Legacy gallery JSON remains parseable.
- Managed gallery JSON requires `assetId`, `storagePath`, `url`, `alt`, and `sortOrder`.
- Malformed gallery JSON returns a safe existing envelope and does not leak DB content.
- Create `createManagedImageUrlPolicy({ bucket, publicBaseUrl })` from typed `StorageConfig` in `server.ts`.
- Pass `ManagedImageUrlPolicy` into the public-catalog mapper or service factory.
- Public mapper stays pure and environment-free.
- `app.ts` does not read Storage env.
- Health route does not require Storage config.
- Tests pass fake `ManagedImageUrlPolicy`.
- Legacy mapper behavior remains available without Storage network.

## 27. Testing Strategy

Dependency/env tests:

- exact package versions;
- Sharp load;
- WebP encode smoke;
- AVIF encode smoke;
- storage env parser safe names;
- service-role key never logged;
- bucket config validation.

Multipart tests:

- valid single upload;
- valid batch upload;
- missing file;
- too many files;
- per-file byte limit;
- total byte limit;
- unknown field;
- duplicate `clientFileId`;
- aborted request cleanup;
- no unbounded buffering.

Processor tests:

- JPEG, PNG, WebP, AVIF accept;
- SVG/GIF/TIFF/HEIC/PDF reject;
- animated inputs reject;
- MIME mismatch rejects;
- corrupt input rejects;
- pixel bomb rejects safely;
- orientation applied;
- metadata stripped;
- alpha preserved;
- sRGB conversion;
- no enlargement;
- aspect preserved;
- exact width sets;
- encoder option contract;
- timeout;
- output decode;
- valid image with trailing arbitrary bytes either rejects during strict decode or re-encodes into clean derivatives;
- derivative output does not contain appended source bytes;
- original source Buffer is never passed to `ImageStorage`.

Asset coordinator tests:

- same key operations run sequentially;
- different key operations run in parallel;
- rejected operation releases the lock;
- key is removed from `Map` after the last waiter;
- no global mutable test hook is required;
- no arbitrary sleeps are used.

Storage tests:

- immutable paths;
- `upsert=false`;
- exact content type;
- cache control;
- public URL validation;
- `inspectObjects` returns expected existing and missing canonical paths;
- inspection rejects arbitrary bucket/prefix input;
- provider listing responses never leave the adapter;
- adapter safe error mapping;
- partial upload cleanup.

Preview tests:

- editor draft replace;
- editor published denied;
- admin draft replace;
- admin published replace;
- archived/deleted/inactive denied;
- replacement no downtime;
- DB failure preserves old preview;
- cleanup jobs created;
- draft delete;
- published delete denied;
- publish requires preview;
- legacy preview accepted for publish;
- unmanaged legacy preview not deleted from Storage;
- exact attached asset replay returns `replayed=true`, `replaced=false`;
- preview replay creates no upload, no DB update, no audit, and no cleanup jobs.

Gallery tests:

- single upload;
- batch partial success;
- input order preservation;
- concurrency `2`;
- process semaphore `4`;
- limit `20`;
- invalid item does not consume slot;
- `18 + 5` slot behavior;
- exact replay;
- replay after client timeout;
- conflicting slot;
- concurrent duplicate;
- partial object set retry;
- same site plus same slot plus same `assetId` replays;
- same site plus different slot plus same `assetId` conflicts;
- different Sites plus same `assetId` are allowed;
- different Sites create different Storage paths;
- no repository-wide JSON scan across all Sites occurs;
- upload reservations are created before Storage upload;
- successful attach marks reservations completed in the same transaction as Site update and audit;
- attach failure leaves reservations pending;
- second image may finish encoding first while DB append order remains input order;
- first invalid batch item does not consume the first available slot;
- concurrent batch/single requests never exceed 20 gallery items;
- rejected slot candidate is eventually cleaned by reservation jobs;
- reorder exact set;
- alt update;
- delete;
- cleanup jobs;
- legacy/malformed handling.

Cleanup tests:

- due job claim;
- race-safe claim through conditional update;
- attempts;
- exact backoff values;
- batch size `20`;
- remove concurrency `2`;
- Storage 404 success;
- failure after five attempts;
- no secrets in logs;
- one-shot command;
- graceful shutdown.
- two independent Prisma clients/workers cannot actively process the same due job concurrently;
- server worker and one-shot cleanup command can safely coexist.

Bucket tests:

- absent bucket plus confirmation creates;
- compatible bucket is idempotent;
- incompatible bucket blocks;
- startup does not auto-create;
- no secrets in output.

Regression:

- all existing B1-B6 tests remain PASS;
- auth and session invalidation remain PASS;
- B5 site/category/user/audit behavior remains PASS;
- public catalog compatibility remains PASS.

Test safety:

- Integration tests use only `TEST_DATABASE_URL`.
- `assertTestDatabaseUrl` runs before Prisma test writes.
- B7 cleanup targets only B7 fixture prefixes and IDs.
- Do not mutate seed data.
- Do not use table-wide delete.
- Fake `ImageStorage` is the default.
- Full suite requires no network.
- Optional real Supabase contract tests are excluded unless isolated test credentials and separate owner authorization are present.
- Generated in-memory Sharp fixtures are small and bounded.

## 28. Ordered Implementation Tasks

### Task 1: Dependency Contract And Storage Env

Files:

- Modify `backend/package.json`.
- Modify `backend/package-lock.json`.
- Modify `backend/.env.example`.
- Create `backend/src/config/storage-env.ts`.
- Modify `backend/tests/setup.ts`.
- Create `backend/tests/image-env.test.ts`.

Interfaces consumed:

- Existing `AppEnv`, `parseEnv`, `DatabaseEnv`, and `AuthEnv` patterns.

Interfaces produced:

- `StorageEnv`
- `StorageConfig`
- `StorageCredentials`
- `parseStorageEnv(input: NodeJS.ProcessEnv): StorageEnv`
- `toStorageConfig(env: StorageEnv): StorageConfig`

Steps:

- [ ] Write failing tests for required env names, safe error messages, canonical bucket, poll interval `60`, boolean worker flag, and no raw values in errors.
- [ ] Run `& $PortableNpm test -- image-env.test.ts` and confirm failure from missing `storage-env.ts`.
- [ ] Check Busboy declaration metadata and current TypeScript config before deciding whether `@types/busboy` is needed.
- [ ] Install only exact approved packages.
- [ ] Implement `storage-env.ts` with safe names only.
- [ ] Extend test env restoration keys for Storage variables.
- [ ] Run `& $PortableNpm ls sharp busboy @supabase/supabase-js @types/busboy --all`.
- [ ] Run `& $PortableNpm test -- image-env.test.ts`.
- [ ] PASS criteria: exact versions, no overrides, env parser safe, tests pass.
- [ ] Rollback boundary: revert only package files, env example, setup env keys, and storage env files.

Out-of-scope:

- No Storage calls.
- No image routes.
- No schema changes.

### Task 2: Image Types, Paths, Descriptors And Variants

Files:

- Create `backend/src/modules/images/image.types.ts`.
- Create `backend/src/modules/images/image.errors.ts`.
- Create `backend/src/modules/images/image-paths.ts`.
- Create `backend/src/modules/images/image-variants.ts`.
- Create `backend/src/modules/images/asset-upload-coordinator.ts`.
- Create `backend/tests/image-paths.test.ts`.
- Create `backend/tests/image-variants.test.ts`.
- Create `backend/tests/asset-upload-coordinator.test.ts`.

Interfaces consumed:

- `ErrorCode` from `backend/src/lib/errors.ts`.

Interfaces produced:

- `ImageSlot`, `OutputFormat`, `ImageVariant`, `ProcessedImage`, `ManagedGalleryImage`, `PublicImageVariant`, `PublicPreviewImage`.
- `buildImageBasePath(siteId, slot, assetId): string`.
- `buildVariantPath(basePath, width, format): string`.
- `parseManagedPreviewUrl(input): ManagedPreviewDescriptor | null`.
- `selectVariantWidths(originalWidth): number[]`.
- `createAssetUploadCoordinator(): AssetUploadCoordinator`.

Steps:

- [ ] Write failing tests for UUID path validation, slot validation, no filename use, managed preview URL detection, legacy URL classification, width selection, duplicate removal, and path traversal rejection.
- [ ] Write failing coordinator tests for same-key sequencing, different-key parallelism, rejected operation lock release, and key removal after the last waiter.
- [ ] Run focused tests and confirm missing exports fail.
- [ ] Implement pure path/variant functions and the no-dependency in-process keyed coordinator.
- [ ] Run focused tests.
- [ ] PASS criteria: all path/variant/coordinator tests pass, functions have no Supabase dependency, and the coordinator makes no distributed-lock claim.
- [ ] Rollback boundary: remove only image types/path/variant/coordinator files and tests.

Out-of-scope:

- No Sharp processing.
- No routes.

### Task 3: Sharp Normalization Pipeline And Semaphore

Files:

- Create `backend/src/modules/images/image-processor.ts`.
- Create `backend/src/modules/images/image-semaphore.ts`.
- Create `backend/tests/image-processor.test.ts`.

Interfaces consumed:

- `ImageProcessor`, `ImagePipelineSemaphore`, `selectVariantWidths`, and path builders.

Interfaces produced:

- `createSharpImageProcessor(options): ImageProcessor`.
- `createImagePipelineSemaphore(maxActive: 4): ImagePipelineSemaphore`.

Steps:

- [ ] Write failing tests for accepted formats, rejected formats, animation, MIME mismatch, corrupt input, pixel limits, orientation, metadata stripping, alpha, sRGB, no enlargement, width sets, WebP/AVIF options, timeout, decodable output, trailing arbitrary source bytes, derivative byte cleanliness, and original Buffer not passed to Storage.
- [ ] Run focused tests and confirm failures from missing processor.
- [ ] Implement bounded processor with Sharp.
- [ ] Implement semaphore with no external dependency.
- [ ] Add Sharp load and WebP/AVIF smoke scripts or tests.
- [ ] Run `& $PortableNpm test -- image-processor.test.ts`.
- [ ] PASS criteria: processor tests pass, outputs decode, no metadata copied.
- [ ] Rollback boundary: remove processor/semaphore files and focused tests.

Out-of-scope:

- No Storage upload.
- No DB mutation.

### Task 4: Streaming Multipart Parser And Request Limits

Files:

- Create `backend/src/modules/images/multipart-image-parser.ts`.
- Create `backend/tests/multipart-image-parser.test.ts`.

Interfaces consumed:

- `ParsedImageFile` and image error helpers.

Interfaces produced:

- `createBusboyMultipartImageParser(options): MultipartImageParser`.

Steps:

- [ ] Write failing tests for single shape, batch shape, missing file, too many files, total bytes, per-file bytes, unknown fields, duplicate IDs, metadata length mismatch, and request abort cleanup.
- [ ] Run parser tests and confirm missing parser failures.
- [ ] Implement Busboy streaming parser with exact limits.
- [ ] Ensure parser rejects global JSON parsing for multipart by operating directly on request stream.
- [ ] Run focused parser tests.
- [ ] PASS criteria: parser tests pass and no unbounded batch buffer is introduced.
- [ ] Rollback boundary: remove parser and tests.

Out-of-scope:

- No Sharp decode.
- No Supabase adapter.

### Task 5: Supabase Storage Adapter And Bucket Bootstrap CLI

Files:

- Create `backend/src/modules/images/image-storage.ts`.
- Create `backend/src/modules/images/supabase-image-storage.ts`.
- Create `backend/src/cli/storage-bootstrap.command.ts`.
- Create `backend/tests/image-storage.adapter.test.ts`.
- Create `backend/tests/storage-bootstrap.command.test.ts`.
- Modify `backend/package.json`.

Interfaces consumed:

- `StorageConfig`, `ImageStorage`, CLI terminal patterns from B6.

Interfaces produced:

- `createSupabaseImageStorage(config: StorageConfig): ImageStorage`.
- `ImageStorage.inspectObjects(paths): Promise<StorageObjectInspection>`.
- `runStorageBootstrapCommand(options): Promise<number>`.

Steps:

- [ ] Write failing tests for upload options, public URL origin validation, safe object inspection, partial object set detection, provider listing containment, safe provider error mapping, compatible bucket, incompatible bucket, absent bucket confirmation, non-TTY failure, and no secrets in output.
- [ ] Run focused tests and confirm failures.
- [ ] Implement adapter using official Supabase client only.
- [ ] Implement interactive CLI requiring `CREATE STORAGE BUCKET`.
- [ ] Add `storage:bootstrap` production script pointing to compiled JS.
- [ ] Run focused tests.
- [ ] PASS criteria: adapter maps outcomes safely, object inspection accepts only canonical paths, and bootstrap never auto-runs.
- [ ] Rollback boundary: remove adapter, command, tests, and script entry.

Out-of-scope:

- No real bucket creation in tests.
- No server startup bucket creation.

### Task 6: Preview Upload, Replace And Delete

Files:

- Create `backend/src/modules/admin/images/site-image.types.ts`.
- Create `backend/src/modules/admin/images/site-image.repository.ts`.
- Create `backend/src/modules/admin/images/site-image.service.ts`.
- Create `backend/src/modules/admin/images/site-image.mapper.ts`.
- Create `backend/src/modules/images/image-audit.ts`.
- Create `backend/tests/site-image.service.test.ts`.
- Create `backend/tests/integration/admin-site-images-api.test.ts`.

Interfaces consumed:

- `ImageProcessor`, `ImageStorage`, path parser, `AssetUploadCoordinator`, `StorageCleanupRepository`, `runSerializableWithRetry`.

Interfaces produced:

- `PreviewImageService`.
- `assertCanMutateSiteImages`.
- preview response mapper.

Steps:

- [ ] Write failing unit tests for editor draft, editor published denial, admin draft/published, archived/deleted/inactive denial, replacement preserving old preview on failure, cleanup reservation creation before upload, reservation completion inside attach transaction, failed attach leaving reservations pending, legacy unmanaged preview handling, exact replay response, no upload/DB/audit/cleanup on replay, and safe audit payload.
- [ ] Write failing integration tests for PUT/DELETE preview route contract.
- [ ] Run focused tests and confirm missing service/route failures.
- [ ] Implement repository methods with short serializable transaction and safe audit.
- [ ] Implement service orchestration: create upload reservations first, process/upload second, DB attach/audit/reservation-completion third, and leave reservations pending on processing/upload/attach failure.
- [ ] Implement preview delete rules.
- [ ] Run focused unit and integration tests.
- [ ] PASS criteria: preview contract passes, exact replay is side-effect-free, reservations protect orphan cleanup, and no Storage call happens in DB transaction.
- [ ] Rollback boundary: remove preview service/repository route wiring and preview tests.

Out-of-scope:

- No gallery upload.
- No public mapper changes.

### Task 7: Single Gallery Upload And Idempotency

Files:

- Modify `backend/src/modules/admin/images/site-image.repository.ts`.
- Modify `backend/src/modules/admin/images/site-image.service.ts`.
- Modify `backend/src/modules/admin/images/site-image.mapper.ts`.
- Modify `backend/tests/site-image.service.test.ts`.
- Modify `backend/tests/integration/admin-site-images-api.test.ts`.

Interfaces consumed:

- `GalleryImageService`, `ManagedGalleryImage`, `ImageProcessor`, `ImageStorage`, `AssetUploadCoordinator`, `StorageCleanupRepository`.

Interfaces produced:

- `GalleryImageService.addSingle`.

Steps:

- [ ] Write failing tests for single append, sort normalization, count limit, same-site same-slot replay, same-site different-slot conflict, same `assetId` on another Site allowed, different Sites producing different Storage paths, no repository-wide JSON scan, partial Storage object inspection and cleanup before retry, reservation creation before upload, DB failure leaving reservations pending, and one audit per new image.
- [ ] Run focused tests and confirm failures.
- [ ] Implement managed gallery parsing and safe `GALLERY_DATA_INVALID`.
- [ ] Implement single upload with `(siteId, slot, assetId)` idempotency, coordinator exclusivity, durable reservations, object inspection, and serializable mutation.
- [ ] Run focused tests.
- [ ] PASS criteria: single gallery upload returns `201`, scoped replay is safe, cross-site `assetId` reuse is allowed, and no duplicate audit exists for one scoped key.
- [ ] Rollback boundary: revert single gallery changes and tests.

Out-of-scope:

- No batch upload.
- No reorder/delete.

### Task 8: Batch Gallery Upload With Partial Results

Files:

- Modify `backend/src/modules/admin/images/site-image.service.ts`.
- Modify `backend/src/modules/admin/images/site-image.controller.ts`.
- Modify `backend/src/modules/admin/images/site-image.mapper.ts`.
- Modify `backend/tests/site-image.service.test.ts`.
- Modify `backend/tests/integration/admin-site-images-api.test.ts`.

Interfaces consumed:

- `MultipartImageParser.parseBatch`, `ImagePipelineSemaphore`, `AssetUploadCoordinator`, `GalleryImageService.addSingle`.

Interfaces produced:

- `GalleryImageService.addBatch`.
- `GalleryBatchResponse`.

Steps:

- [ ] Write failing tests for batch max `10`, partial success, input index order, second image finishing encode first while DB order stays input order, first invalid item not consuming a slot, `18 + 5` deterministic limit behavior, concurrent batch/single never exceeding `20`, rejected slot candidate cleanup reservations, per-batch concurrency `2`, Storage outage before first success, Storage outage after success, and per-success audit.
- [ ] Run focused batch tests and confirm failures.
- [ ] Implement parse/process/attach phases: parse indexes first, process/upload with concurrency `2`, then attach successful candidates sequentially by ascending input index.
- [ ] Implement batch timeout `180 seconds`.
- [ ] Run focused batch tests.
- [ ] PASS criteria: valid partial batches return HTTP `200`, DB append order follows input order, gallery count never exceeds `20`, and failed items do not rollback successful prior items.
- [ ] Rollback boundary: revert batch service/controller/tests.

Out-of-scope:

- No public frontend flow.

### Task 9: Gallery Reorder/Delete And Legacy Handling

Files:

- Create `backend/src/modules/admin/images/site-image.schemas.ts`.
- Modify `backend/src/modules/admin/images/site-image.repository.ts`.
- Modify `backend/src/modules/admin/images/site-image.service.ts`.
- Modify `backend/src/modules/admin/images/site-image.controller.ts`.
- Modify `backend/tests/site-image.validation.test.ts`.
- Modify `backend/tests/site-image.service.test.ts`.
- Modify `backend/tests/integration/admin-site-images-api.test.ts`.

Interfaces consumed:

- `GalleryImageService`, managed gallery parser, cleanup repository.

Interfaces produced:

- `parseGalleryReorderInput`.
- `GalleryImageService.reorder`.
- `GalleryImageService.deleteImage`.

Steps:

- [ ] Write failing validation tests for strict body, unknown/missing/duplicate `assetId`, invalid `sortOrder`, and alt max.
- [ ] Write failing service tests for reorder exact set, canonical sort order, blank alt fallback contract, mixed legacy blocking, delete managed, delete missing, delete legacy, cleanup jobs, and audit.
- [ ] Run focused tests and confirm failures.
- [ ] Implement reorder parser.
- [ ] Implement reorder transaction with no Storage.
- [ ] Implement delete transaction with cleanup jobs and no Storage inside transaction.
- [ ] Run focused tests.
- [ ] PASS criteria: reorder/delete contracts pass and legacy mutation is blocked safely.
- [ ] Rollback boundary: revert reorder/delete files and tests.

Out-of-scope:

- No legacy repair endpoint.

### Task 10: Cleanup Jobs, Worker And One-Shot CLI

Files:

- Create `backend/src/modules/storage-cleanup/storage-cleanup.types.ts`.
- Create `backend/src/modules/storage-cleanup/storage-cleanup.repository.ts`.
- Create `backend/src/modules/storage-cleanup/storage-cleanup.worker.ts`.
- Create `backend/src/modules/storage-cleanup/storage-cleanup.service.ts`.
- Create `backend/src/cli/storage-cleanup.command.ts`.
- Create `backend/tests/storage-cleanup.worker.test.ts`.
- Modify `backend/package.json`.

Interfaces consumed:

- `ImageStorage.removeObjects`, `StorageCleanupJob` existing model, `Clock`.

Interfaces produced:

- `StorageCleanupRepository`.
- `StorageCleanupRepository.createUploadReservations`.
- `StorageCleanupRepository.markUploadReservationsCompleted`.
- `StorageCleanupWorker`.
- `runStorageCleanupCommand(options): Promise<number>`.

Steps:

- [ ] Write failing tests for conditional claim due jobs, two independent clients/workers not processing one job concurrently, stale recovery without attempt reset, attempts, backoff values, upload reservations, reservation completion, batch size `20`, concurrency `2`, Storage 404 success, failure after five attempts, safe logs, one-shot command coexistence with server worker, and shutdown.
- [ ] Run focused tests and confirm failures.
- [ ] Implement repository with exact existing fields, one-path-per-job reservations, conditional claim updates, and stale processing recovery.
- [ ] Implement worker tick/start/stop.
- [ ] Implement one-shot CLI and package script.
- [ ] Run focused cleanup tests.
- [ ] PASS criteria: cleanup lifecycle and upload reservations map to existing fields, claim is race-safe, and no migration is needed.
- [ ] Rollback boundary: remove cleanup module, command, tests, and script.

Out-of-scope:

- No SQL writes to Supabase Storage metadata.

### Task 11: Public API And B5 Mutation/Publish Compatibility

Files:

- Modify `backend/src/modules/admin/sites/site.schemas.ts`.
- Modify `backend/src/modules/admin/sites/site.repository.ts`.
- Modify `backend/src/modules/admin/sites/site.service.ts`.
- Modify `backend/src/modules/admin/sites/site.types.ts`.
- Modify `backend/src/modules/public-catalog/public-catalog.mapper.ts`.
- Modify `backend/src/modules/public-catalog/public-catalog.service.ts`.
- Modify `backend/src/modules/public-catalog/public-catalog.types.ts`.
- Modify `backend/tests/admin.site.validation.test.ts`.
- Modify `backend/tests/admin.site.service.test.ts`.
- Modify `backend/tests/integration/admin-api.test.ts`.
- Modify `backend/tests/public-catalog.mapper.test.ts`.
- Modify `backend/tests/integration/public-catalog-api.test.ts`.

Interfaces consumed:

- Managed descriptor parser, public variant builder, and injected `ManagedImageUrlPolicy`.

Interfaces produced:

- Public preview/gallery managed DTO fields.
- Public catalog mapper/service factory that accepts `ManagedImageUrlPolicy`.
- B5 generic mutation rejection for image fields.
- Publish preview requirement.

Steps:

- [ ] Write failing tests proving generic create/PATCH rejects `previewImageUrl` and `galleryImages`.
- [ ] Write failing publish test for missing preview returning `SITE_PREVIEW_REQUIRED`.
- [ ] Write failing public mapper tests for managed preview variants, managed gallery variants, legacy compatibility, environment-free mapper behavior, strict URL policy classification, and fake policy injection.
- [ ] Run focused compatibility tests and confirm failures.
- [ ] Remove image fields from generic schemas and repository write mapping.
- [ ] Add publish preview requirement.
- [ ] Extend public mapper/types/service factory while preserving legacy fields and requiring policy injection from `server.ts`.
- [ ] Run focused compatibility tests.
- [ ] PASS criteria: generic image URL writes are closed and public reads remain backward-compatible.
- [ ] Rollback boundary: revert B5/public compatibility modifications and tests.

Out-of-scope:

- No seed change.
- No frontend adapter.

### Task 12: App, Server, RBAC, Routes And Rate-Limit Integration

Files:

- Create `backend/src/modules/admin/images/site-image.controller.ts`.
- Create `backend/src/modules/admin/images/site-image.routes.ts`.
- Create `backend/src/modules/admin/images/site-image-rate-limit.ts`.
- Modify `backend/src/modules/admin/admin.routes.ts`.
- Modify `backend/src/server.ts`.
- Modify `backend/src/app.ts` only if typed route injection needs an option change.
- Modify `backend/src/lib/errors.ts`.
- Modify `backend/tests/integration/admin-site-images-api.test.ts`.

Interfaces consumed:

- Preview/gallery services, parser, limiter, central permission policy, storage config, and managed image URL policy.

Interfaces produced:

- Admin image router registered under `/api/admin`.
- B7 error codes in `ErrorCode`.
- Server composition for Storage adapter, asset coordinator, cleanup worker, and public managed URL policy.

Steps:

- [ ] Write failing route-order tests for auth before existence, exact `/gallery/batch` before `/:assetId`, multipart parser only on upload routes, rate limiter after permission, `app.ts` staying environment-free, and public URL policy created only in `server.ts`.
- [ ] Write failing API tests for every endpoint path and safe error envelope.
- [ ] Run focused API tests and confirm failures.
- [ ] Add B7 error codes.
- [ ] Implement controllers and route wiring.
- [ ] Inject services from `server.ts`, create the in-process asset coordinator, create `ManagedImageUrlPolicy` from typed `StorageConfig`, and start cleanup worker based on env.
- [ ] Run focused API tests.
- [ ] PASS criteria: all endpoints route correctly, admin cache-control remains, public mapper receives policy by DI, and no route leaks site existence before permission.
- [ ] Rollback boundary: revert route/server/app/error wiring and integration tests.

Out-of-scope:

- No deploy.
- No bucket auto-create.

### Task 13: Unit And PostgreSQL/Fake-Storage Integration Tests

Files:

- Modify all B7 tests.
- Modify `backend/tests/integration/test-database.ts` only if a B7-specific fixture cleanup helper is required.

Interfaces consumed:

- All B7 modules.

Interfaces produced:

- Full B7 regression suite.

Steps:

- [ ] Add fixture helpers that assert `TEST_DATABASE_URL` and target only B7 fixture IDs.
- [ ] Add fake Storage adapter for integration tests.
- [ ] Add tests for no real network in default suite.
- [ ] Run focused B7 tests.
- [ ] Run integration image API tests.
- [ ] Run existing admin/public/auth tests touched by compatibility.
- [ ] PASS criteria: all B7 focused tests pass and no test prints env values or raw URLs.
- [ ] Rollback boundary: revert only test helpers and B7 tests.

Out-of-scope:

- No production Supabase contract tests without explicit isolated credentials and owner authorization.

### Task 14: Full B7 Checkpoint

Files:

- No new implementation files in this task.
- Verification only.

Interfaces consumed:

- Completed B7 implementation.

Interfaces produced:

- Final evidence for owner review.

Steps:

- [ ] Run dependency tree verification.
- [ ] Run Sharp load and WebP/AVIF smoke.
- [ ] Run Prisma validation/generate/migrate status.
- [ ] Run snapshot verification.
- [ ] Run focused B7 tests.
- [ ] Run full test suite.
- [ ] Run typecheck, build, and check.
- [ ] Run production and full audit at high level.
- [ ] Run compiled storage CLI safe-output checks.
- [ ] Run git scope checks.
- [ ] PASS criteria: all commands pass, high/critical audit findings are zero, forbidden files are absent, and no commit/push/deploy occurs.
- [ ] Rollback boundary: no code changes in this task; failure returns to the task that introduced the failing behavior.

Out-of-scope:

- No commit without separate owner instruction.

## 29. Final Verification Checkpoint

Run from PowerShell:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$env:PATH = "$PortableRoot;$env:PATH"
Set-Location D:\WEB00_BACKEND\backend

& $PortableNpm ci
& $PortableNode -e "import('sharp').then(async ({default: sharp}) => { const input = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(); await sharp(input).webp({ quality: 82, effort: 4 }).toBuffer(); await sharp(input).avif({ quality: 55, effort: 4, chromaSubsampling: '4:4:4' }).toBuffer(); console.log('sharp webp/avif smoke PASS'); })"
& $PortableNpm run prisma:validate
& $PortableNpm run prisma:generate
& $PortableNpm run db:migrate:status
& $PortableNpm run seed:verify
& $PortableNpm test -- image-env.test.ts image-paths.test.ts image-variants.test.ts image-processor.test.ts multipart-image-parser.test.ts image-storage.adapter.test.ts site-image.validation.test.ts site-image.service.test.ts storage-cleanup.worker.test.ts storage-bootstrap.command.test.ts integration/admin-site-images-api.test.ts
& $PortableNpm run test:run
& $PortableNpm run typecheck
& $PortableNpm run build
& $PortableNpm run check
& $PortableNpm audit --omit=dev --audit-level=high
& $PortableNpm audit --audit-level=high
& $PortableNode -e "await import('./dist/cli/storage-bootstrap.command.js'); await import('./dist/cli/storage-cleanup.command.js'); console.log('compiled storage CLI imports PASS')"

Set-Location D:\WEB00_BACKEND
git diff --check
git status --short
git diff --cached --name-only
git diff --name-only -- backend/prisma/schema.prisma
git diff --name-only -- backend/prisma/migrations
git diff --name-only -- backend/prisma/seed-data
git diff --name-only -- assets
git diff --name-only -- .github
```

Expected:

- dependencies exactly approved;
- no unexpected direct packages;
- schema unchanged;
- migrations unchanged;
- seed/snapshot unchanged;
- existing B1-B6 tests PASS;
- B7 tests PASS;
- default suite uses fake Storage and no real network;
- production audit high/critical `0`;
- full audit high/critical `0`;
- direct B7 dependency moderate risk has owner decision if present;
- Sharp smoke uses `$PortableNode` directly;
- compiled CLI import smoke uses `$PortableNode` directly;
- `npm exec node`, `npx`, system Node, and remote package execution are not used for verification;
- `.env`, generated client, `dist`, `node_modules`, and `coverage` absent from Git scope;
- staged area empty unless owner explicitly starts the final commit task;
- no push, PR, merge, or deploy.

## 30. Acceptance Criteria

B7 is acceptable when:

- backend-only image upload flow exists for preview and gallery;
- originals are not retained;
- output is WebP and AVIF;
- widths are selected exactly from `480`, `960`, `1600`, and original-width fallback without enlargement;
- crop is never used;
- public bucket is used;
- all Storage writes happen server-side;
- direct browser upload is unavailable;
- upload requires existing site UUID;
- idempotency scope is `(siteId, slot, assetId)`;
- same `assetId` on different Sites is allowed;
- same Site plus same slot plus same `assetId` replays;
- same Site plus different slot plus same `assetId` conflicts;
- in-process `AssetUploadCoordinator` serializes duplicate work for the current single backend instance;
- no cross-instance exactly-once guarantee is claimed;
- editor can mutate only draft image state;
- admin can mutate draft and published image state;
- archived, inactive, and soft-deleted mutations are blocked;
- published preview replacement has no downtime;
- gallery batch partial success is deterministic;
- batch maximum is `10`;
- batch encode concurrency is `2`;
- batch DB attachment follows ascending input index;
- concurrent gallery mutations never exceed `20` items;
- process semaphore is `4`;
- gallery maximum is `20`;
- publish requires preview;
- generic create/PATCH cannot set image URLs or gallery JSON;
- cleanup jobs use existing `StorageCleanupJob`;
- upload cleanup reservations are created before Storage upload;
- successful attach completes reservations atomically with Site update and audit;
- cleanup worker claim is race-safe through conditional updates;
- `ImageStorage.inspectObjects` supports safe canonical object inspection;
- public mapper receives `ManagedImageUrlPolicy` through DI and reads no env;
- universal polyglot detection is not claimed;
- public exposure contains only clean Sharp-generated derivatives;
- strict legacy handling prevents unsafe deletion or destructive reset;
- no Storage or Sharp work happens in Prisma transactions;
- B7 audit payloads are safe and atomic;
- B7 errors use existing envelope and request IDs;
- all B7 and regression tests pass;
- high/critical audit findings are zero;
- schema, migrations, seed, assets, frontend, workflows, push, PR, merge, and deploy are unchanged unless separately authorized.

## 31. Rollback Boundary

Rollback is file-scoped by task:

- Dependency/env rollback reverts package files, `.env.example`, storage env, and env tests.
- Pure image module rollback removes `backend/src/modules/images/*` B7 files, including asset coordinator files, and matching tests.
- Admin image rollback removes `backend/src/modules/admin/images/*` and route wiring.
- Cleanup rollback removes `backend/src/modules/storage-cleanup/*`, upload reservation behavior, and storage cleanup CLI.
- Compatibility rollback reverts B5 schema/service/public mapper/policy-injection changes and matching tests.

Rollback must not:

- modify Prisma schema;
- modify migrations;
- modify seed snapshot;
- delete Storage objects manually;
- drop databases;
- change frontend/assets/workflows;
- run deploy;
- run force/reset/rebase without explicit owner instruction.

If uploaded orphan objects exist during a failed implementation run, record cleanup jobs or use the approved fake Storage test adapter. Do not manually delete production objects outside the cleanup service/CLI contract.

## 32. Risks, Mitigations And Blockers

Risks and mitigations:

| Risk | Mitigation |
| --- | --- |
| Sharp binary does not load on portable Node 22.23.1 | Sharp load plus WebP/AVIF smoke blocks implementation before commit |
| Direct B7 dependency adds moderate vulnerability | Owner risk decision required before implementation commit |
| High or critical vulnerability appears | Block implementation |
| Multipart memory growth | Stream with Busboy, enforce per-file and total byte limits, clear buffers |
| Pixel bomb | Metadata and decoded pixel limits, safe tests without huge allocations |
| Storage and DB are not one transaction | Durable upload reservations are created before Storage upload; Site attach completes reservations atomically with audit |
| Published preview downtime | Keep old preview until DB commit succeeds |
| Unsafe legacy deletion | Strict managed-path detection; unmanaged legacy is never deleted from Storage |
| Gallery JSON malformed | Mutations return `GALLERY_DATA_INVALID`; public mapper returns safe error |
| Concurrent duplicate upload inside one backend instance | In-process keyed `AssetUploadCoordinator`, Serializable transaction, deterministic paths, replay detection, B6 retry helper |
| Concurrent duplicate upload across multiple backend instances | No cross-instance exactly-once claim; B9 requires schema or distributed-lock strategy |
| Partial or full unattached Storage object set exists | Safe `inspectObjects`, cleanup reservations, cleanup before retry, never attach unknown objects |
| Cleanup workers race | Conditional claim update gives at-most-one active processor per claim cycle; not-found is success |
| Source-level malware or universal polyglot detection is absent | Originals are not stored, outputs are Sharp-generated WebP/AVIF derivatives, metadata is stripped, derivatives are decoded before upload |
| Long transactions | No Sharp or Storage inside transaction |
| Secrets in logs/output | Safe env parser, safe adapter errors, safe audit payload, tests for output |
| Bucket mismatch | Bootstrap and startup inspection block incompatible config |
| Default tests mutate real Storage | Fake Storage default and no-network tests |
| Rate limit is memory-only | Accepted for single-instance phase; production scaling store is a later task |

Implementation blockers:

- Missing or incompatible existing `StorageCleanupJob` field mapping.
- Sharp cannot load or encode WebP/AVIF.
- Supabase bucket exists but is not public WebP/AVIF-only with approved limit.
- New high/critical audit finding.
- Direct B7 dependency moderate risk without owner decision.
- Existing `galleryImages` data cannot be safely classified as managed or legacy.
- Multi-instance duplicate-upload coordination is required before horizontal production scaling.

Plan self-review:

- No open product decisions remain.
- Original bytes are never stored.
- WebP and AVIF are both required.
- Widths `480/960/1600` are fixed.
- No upscaling and no crop are fixed.
- Public bucket and backend-only Storage writes are fixed.
- Published replacement no-downtime behavior is fixed.
- Partial batch behavior is exact.
- Idempotency scope is `siteId + slot + assetId`.
- Same `assetId` across Sites is allowed.
- In-process keyed coordinator is defined.
- Cross-instance limitation is documented.
- `ImageStorage.inspectObjects` is defined.
- Durable cleanup reservations are created before upload.
- Reservation cancellation is atomic with Site attach and audit.
- Batch DB commits follow input order.
- Gallery never exceeds `20` under concurrency.
- Cleanup claims are race-safe.
- Public mapper receives Storage URL policy through DI.
- Universal polyglot detection is not claimed.
- Preview replay response is defined.
- `$PortableNode` is used directly in final verification.
- Final gallery maximum is `20`.
- Preview is required before publish.
- Generic PATCH cannot set image URLs.
- Cleanup schema compatibility is verified against existing fields.
- Legacy handling is exact.
- No Storage call or Sharp work happens inside DB transactions.
- Rate and resource limits are exact.
- Dependency versions are exact.
- Frontend, deploy, push, PR, merge, schema, migrations, and seed are outside B7 implementation scope.
