# WEB00 P0 image pipeline hardening

Date: 2026-07-31

## Production symptom

Admin gallery uploads reached the backend and returned safe partial results, but
selected PNG files failed with:

`Image processing timed out.`

The first PR #12 timeout fix removed the historical 45 second processor window,
but the follow-up QAmax audit found that the pipeline still had unproved
resource and cancellation boundaries for the current Render Free profile.

## Contradictions confirmed before this hardening pass

The pre-hardening code had these mismatches:

1. Processor timeout default was `150000` ms.
2. Gallery batch timeout was fixed at `180000` ms.
3. Gallery batch processing concurrency was `2`.
4. Five files could require `ceil(5 / 2) * 150000 = 450000` ms before Storage
   and DB attach.
5. Ten files could require `750000` ms before Storage and DB attach.
6. The fixed `180000` ms batch timeout was therefore invalid.
7. Batch timeout did not abort Storage operations.
8. `ImageStorage` operations did not accept an operation context or
   `AbortSignal`.
9. The image semaphore admission queue was unbounded.
10. The earlier local benchmark constrained concurrency to `1`, while
    production defaulted to `2`.
11. `40M` pixel default had no proved 512 MB memory envelope.

## Boundary / invariant map

| Boundary | Input | Output | Held memory | Deadline / cancellation | Idempotency / recovery |
| --- | --- | --- | --- | --- | --- |
| A. Multipart/parser | Multipart stream | bounded parsed file descriptors | incoming part buffer | parser limits remain responsible for file/batch size | rejects before processor/storage |
| B. Source buffer ownership | `ParsedImageFile.source` | processor input | one source `Buffer` per admitted file | rejected queue items do not run metadata or reserve storage | retry uses stable `clientFileId` |
| C. Admission queue | processor operation | active processor slot | queued operation closure and source buffer only while admitted | `maxQueued`, `queueWaitTimeoutMs`, queued abort removal | `IMAGE_PROCESSOR_BUSY` before reservation/upload |
| D. Global processor semaphore | admitted file | running Sharp operation | one active pipeline at weak profile | processing deadline starts after acquire | rejected semaphore work has no side effects |
| E. Metadata read | source buffer | format/size/orientation | Sharp metadata pipeline | native `.timeout()` with remaining deadline + watchdog | terminal validation errors are not retryable |
| F. WebP encode | prepared Sharp clone | WebP variant buffer | one encode pipeline | native `.timeout()` with remaining deadline + watchdog | variant path deterministic by site/slot/asset/width |
| G. AVIF encode | prepared Sharp clone | AVIF variant buffer | one encode pipeline | native `.timeout()` with remaining deadline + watchdog | variant path deterministic by site/slot/asset/width |
| H. Output metadata validation | generated variant buffer | verified dimensions/media type | one output verification pipeline | native `.timeout()` with remaining deadline + watchdog | invalid output is terminal |
| I. Reservation creation | deterministic storage paths | cleanup reservations | DB request only | guarded by batch cancellation state | reservation exists before upload |
| J. Storage upload | one generated object | public object URL | one variant buffer | finite operation context; abortable REST upload path when context exists | same path is inspected/cleaned before retry |
| K. DB attach/audit | managed image metadata | updated Site image state | DB transaction state | batch cancellation checked before attach | attached same `clientFileId` replays success |
| L. Response serialization | succeeded/failed arrays | safe JSON envelope | response body only | no hidden create-flow success before final GET | partial failures include `retryable` and requestId |
| M. Client retry/reconciliation | in-memory retry plan | retry of failed retryable files only | no file bytes in storage/sessionStorage | explicit user retry only | after reload image-manager is source of truth |

## Deadline algebra

### Before

- Processor: fixed `150000` ms.
- Gallery batch: fixed `180000` ms.
- Batch concurrency: `2`.
- Storage operations: no finite adapter deadline.
- Browser create flow: one gallery batch request.

This made the batch deadline smaller than the legal processor work for five or
ten files, before adding Storage and DB attach time.

### After

Current weak-profile defaults:

- `IMAGE_PROCESSING_CONCURRENCY=1`
- `IMAGE_PROCESSING_TIMEOUT_MS=90000`
- `IMAGE_PROCESSING_MAX_PIXELS=16000000`
- `IMAGE_PROCESSING_MAX_QUEUE=2`
- `IMAGE_PROCESSING_QUEUE_WAIT_MS=5000`
- Sharp runtime profile: `sharp.concurrency(1)` and bounded cache memory.
- Admin create flow uploads gallery images sequentially as single-file
  operations.

Retained batch endpoint compatibility uses a derived timeout:

```text
processingWaves = ceil(fileCount / galleryConcurrency)
perFileStorageBudget =
  inspectTimeout +
  removeTimeout +
  maxVariantsPerImage * perObjectUploadTimeout

batchTimeout =
  processingWaves * processorTimeout +
  fileCount * (perFileStorageBudget + dbAttachBudget) +
  cancellationGrace
```

With current constants:

- `galleryConcurrency=1`
- `maxVariantsPerImage=6`
- `inspectTimeout=10000`
- `removeTimeout=15000`
- `perObjectUploadTimeout=15000`
- `dbAttachBudget=10000`
- `cancellationGrace=5000`

## One-click saga

The owner create flow remains one user action, but no longer requires one giant
gallery batch request:

1. Create Site once with stable `X-Request-Id`.
2. Upload Preview as one idempotent operation.
3. Upload each Gallery image as its own idempotent operation, sequentially.
4. Preserve the stable `clientFileId` per selected file.
5. Update progress for each file.
6. Perform final `GET /api/admin/sites/:id` verification before full success.
7. Show complete or partial result.

Retry behavior:

- only failed retryable files are retried;
- terminal failures remain visible but do not create a retry button entry;
- successful gallery files are not resent;
- retry plan is in-memory only for the current page.

## Storage deadline model

`ImageStorage` now accepts an optional operation context for upload/inspect/remove
operations. Supabase upload uses the existing SDK path without context for
compatibility, and an injected abortable REST `fetch` path when operation context
is supplied by the image service.

This avoids pretending the Supabase SDK upload has native `AbortSignal` support
when its `FileOptions` contract does not expose one.

## Error taxonomy

Partial batch failure DTOs now include:

- `clientFileId`
- `code`
- `index`
- safe `message`
- safe `requestId` when present
- `retryable`

Retryable examples currently mapped:

- `CLIENT_ABORTED`
- `CONCURRENT_MODIFICATION`
- `IMAGE_PROCESSING_TIMEOUT`
- `IMAGE_PROCESSOR_BUSY`
- `IMAGE_STORAGE_TIMEOUT`
- `STORAGE_UNAVAILABLE`
- `STORAGE_WRITE_FAILED`

Terminal examples include validation, MIME mismatch, pixel/dimension/output
limits, gallery limit, and upload ID conflicts.

## Observability / safety boundary

Safe fields may include:

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

The code must not log filenames, image bytes, alt text, Site title, Storage URL,
tokens, cookies, secrets, raw Sharp/libvips errors, SQL, Prisma details, or
provider credentials.

## Evidence added

- Focused image hardening regression:
  - env weak-profile parsing;
  - bounded queue admission and queued abort cleanup;
  - native Sharp `.timeout()` application to metadata, encode and output
    verification pipelines;
  - storage abortable REST upload context;
  - per-file retryability in partial envelopes;
  - sequential create-flow gallery uploads;
  - retry-only-failed UI behavior;
  - `Retry-After` for `IMAGE_PROCESSOR_BUSY`;
  - 300 deterministic state-model schedules.

## Benchmark status

The benchmark script now records cache candidate, duration distribution, process
memory, decoded-memory estimate, and Sharp cache/counter snapshots.

A local smoke attempt with the full cache/format matrix and
`IMAGE_BENCH_REPETITIONS=1` exceeded 120 seconds and was stopped. Therefore this
document does not claim Render Free proof, p99 reliability, or a completed
30-repetition benchmark matrix.

## Residual owner / release risks

- Cross-instance exactly-once upload coordination is still outside the original
  B7 single-instance contract.
- A full Render-equivalent resource benchmark with 30 repetitions per practical
  representative class is still required before claiming memory-envelope
  acceptance.
- The local benchmark cannot prove Render Free 0.1 CPU reliability.
- Process restart during uncertain Storage/DB boundaries still requires
  reconciliation evidence from existing managed path/idempotency behavior.

## Production policy

This hardening changes code and tests only. It does not deploy Render, retry
production files, write production DB/API state, run maintenance/reconciliation,
migrate, seed, or change Render billing/plan/settings.
