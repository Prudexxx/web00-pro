# WEB00 Swiss Reliability Final Design

## 1. Readiness Before Auth Bootstrap

Admin startup begins with a visible readiness state before any auth bootstrap
call. The UI immediately shows `Backend просыпается, подождите...`, calls
`/api/ready` without auth, and only after readiness succeeds calls
`bootstrapSession()`.

If readiness cannot be confirmed inside the bounded deadline, the admin UI
shows a dedicated retry screen: `Backend пока недоступен`,
`Введённые данные не потеряны`, and `Повторить проверку`. This state is distinct
from an unauthenticated session or a login error.

Login submission also performs a readiness preflight when readiness is stale.

## 2. Controlled Request Timeouts

Admin fetches use real finite timeouts through a reusable AbortController-based
timeout helper. The implementation does not depend on `AbortSignal.any` or
`AbortSignal.timeout`, so Samsung Internet has a fallback path.

Default budgets:

- normal authenticated GET: 25 seconds;
- JSON mutation: 45 seconds;
- one readiness attempt: 15 seconds;
- total readiness budget: 90 seconds;
- multipart upload: 120 seconds.

Timeout, caller abort, and network failure are normalized separately:

- `REQUEST_TIMEOUT`: `Сервер не ответил вовремя.`
- `REQUEST_ABORTED`: `Запрос отменён.`
- `NETWORK_ERROR`: `Не удалось связаться с сервером.`

Destroy/navigation aborts are not shown as user-facing network failures.

## 3. Page Lifecycle Form Persistence

Normal typing keeps the 1-second debounced autosave. The same local draft is
written immediately when the page becomes hidden, `pagehide` fires, the browser
goes offline, or the user presses an internal cancel/back action while the form
is dirty.

The local draft stores:

- fields;
- mode;
- siteId;
- updatedAt;
- stable create `clientRequestId`;
- a boolean note that image files had been selected.

The local draft never stores tokens, Authorization, cookies, passwords, JWTs,
secrets, File/Blob bytes, or local file paths. After a full reload, text can be
restored, but File objects cannot; the UI must say
`Текст восстановлен. Изображения выберите повторно.`

Secret/private browsing modes are handled honestly: active-session recovery is
protected when browser storage is available, but complete closure of all secret
tabs may discard local drafts.

## 4. Durable Create Idempotency Without Migration

Create uses a stable client-generated logical operation ID:

- generated once when a create form starts;
- formatted as `req_<uuid>`;
- persisted with the local form draft;
- reused for retry and recovery of the same logical create;
- replaced after successful create or explicit draft discard.

Server-side create idempotency uses existing `audit_logs.request_id`, the
existing create+audit transaction, and a PostgreSQL transaction advisory lock.
No new table, schema change, or migration is required.

Inside the create transaction:

1. Build lock identity from `actorUserId + ":" + requestId`.
2. Acquire `pg_advisory_xact_lock(hashtextextended(<identity>, 0))` via
   parameterized `$queryRaw`.
3. Look up completed `site.create_draft` audit rows for the same actor and
   requestId.
4. Compare a SHA-256 fingerprint of the normalized create input.
5. If the fingerprint matches, return the existing site without inserting a
   second site or audit row.
6. If the fingerprint differs, return controlled `409 IDEMPOTENCY_KEY_REUSED`.
7. If replay audit exists but the site is gone, return controlled
   `409 IDEMPOTENCY_REPLAY_UNAVAILABLE`.

Only the SHA-256 fingerprint is stored for idempotency. Raw create payload,
URLs, titles, email, tokens, and SQL details are not stored or logged.

## 5. One-Click Create And Optional Image Upload Saga

The create form supports a one-click saga:

fill card -> optionally select preview/gallery images -> press
`Сохранить карточку` -> create site -> upload selected images.

PostgreSQL and object storage are not treated as one transaction. The saga is
recoverable:

- selected files are validated before site create;
- invalid files block create;
- successful site create is final even if image upload later fails;
- image retry uses the saved site ID and never repeats the create POST.

## 6. Partial Image Failure Recovery

If preview or gallery upload fails after the site is created, the UI shows:
`Карточка сохранена. Часть изображений не загрузилась.`

It preserves:

- saved site ID;
- in-memory File objects when the browser keeps them;
- succeeded/failed counts;
- requestId for the failed upload when available.

Retry uploads only failed or not-yet-completed images. Gallery batch retry uses
clientFileId mapping to avoid uploading successful files twice.

## 7. No Migration And No Tariff Change

This final pass does not change Prisma schema, does not create a migration, and
does not change Render settings or tariff. It does not deploy Render and does
not write to production DB.

## 8. Final Acceptance Criteria

- Admin readiness happens before auth bootstrap.
- Every admin request has a finite timeout and cleans up timers/listeners.
- Page lifecycle events persist dirty forms immediately.
- Create retry uses one stable request ID and cannot create duplicates.
- Same request ID with different payload returns human `IDEMPOTENCY_KEY_REUSED`.
- One-click create can upload preview/gallery after create.
- Partial image failures preserve the created card and retry only images.
- No File/Blob bytes, secrets, cookies, tokens, raw SQL, Prisma details, or raw
  payload dumps appear in local storage or normal UI.
- Final gates pass without Docker, WSL, migrations, production DB writes, or
  Render deploy.
