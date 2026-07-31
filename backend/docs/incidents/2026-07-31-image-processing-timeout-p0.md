# WEB00 P0 image processing timeout fix

Date: 2026-07-31

## Production symptom

Admin gallery batch uploads reached the backend and returned HTTP 200 partial
results, but selected PNG files failed with the safe user-facing message:

`Image processing timed out.`

The retry-only-failed batch duration was approximately 45.8 seconds, which
matched the old processor-level timeout rather than the 180 second gallery
batch timeout.

## Root cause in code

- `backend/src/modules/images/image-processor.ts` used a fixed 45,000 ms
  per-file processor timeout.
- The timeout was wrapped outside the processor semaphore, so queue time could
  count against the image processing budget.
- Timeout used `Promise.race` without destroying active Sharp/libvips pipelines,
  so timed-out work could continue consuming CPU until it settled.
- Variant generation created a fresh `sharp(input.source)` pipeline for every
  WebP/AVIF width, repeating source decode/rotate work up to six times per
  image.
- `limitInputPixels: false` was used for metadata and variant pipelines, so the
  code relied only on later metadata validation rather than also bounding Sharp
  decode work.
- HTTP 200 partial gallery batch responses did not include a top-level
  `requestId`, and per-file failures did not carry the safe requestId.

## Fixed model

- Image processing timeout is configured with safe non-secret env:
  `IMAGE_PROCESSING_TIMEOUT_MS`.
- Default/min/max: 150,000 ms / 60,000 ms / 170,000 ms.
- Image processor concurrency is explicitly bounded with safe env:
  `IMAGE_PROCESSING_CONCURRENCY`.
- Default/min/max: 2 / 1 / 2.
- The timeout starts after the processor semaphore is acquired.
- Metadata preflight reads format, width, height, pixels, and orientation once.
- Sharp decode is bounded with `limitInputPixels`.
- Variant generation uses a prepared rotated sRGB Sharp pipeline and `clone()`
  for sequential WebP/AVIF variants.
- Active Sharp pipelines are destroyed on processing timeout.
- Gallery batch partial success remains per-file; timed-out files do not create
  upload reservations or storage uploads.
- HTTP 200 gallery batch envelopes include top-level `requestId`; failed items
  include safe `requestId` when available.

## Observability boundary

Gallery per-file logs use event `site.gallery_image.file` and safe fields only:

- `requestId`
- `clientFileId`
- `stage`
- `format`
- `width`
- `height`
- `pixels`
- `orientation`
- `variantCount`
- `durationMs`
- `timeoutMs`
- `errorCategory`

The logs intentionally do not include filenames, image bytes, storage URLs,
tokens, raw Sharp/libvips errors, SQL, Prisma details, cookies, or secrets.

## Production policy

This fix changes code only. It does not deploy Render, retry production files,
write production DB/API state, run maintenance/reconciliation, migrate, seed, or
change Render billing/plan settings.
