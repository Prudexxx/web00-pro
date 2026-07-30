# WEB00 Swiss Reliability Final Closeout

## Implemented Behavior

This closeout records the implemented admin/backend reliability behavior for
the final owner QAmax pass.

## Readiness Before Auth

Admin startup now shows `Backend просыпается, подождите...`, calls `/api/ready`
without auth, and only then starts auth bootstrap. If readiness cannot be
confirmed inside the bounded budget, the admin UI shows:

- `Backend пока недоступен`
- `Введённые данные не потеряны`
- `Повторить проверку`

Login also performs a readiness preflight when the previous readiness result is
stale. Keep-warm remains limited to authenticated visible online admin tabs and
stops on logout/destroy.

## Timeout Model

Admin requests use an AbortController-based timeout helper that combines an
optional caller signal with a new finite timeout signal and cleans up listeners
and timers in `finally`.

Budgets:

- JSON GET: 25 seconds
- JSON mutation: 45 seconds
- readiness attempt: 15 seconds
- readiness total: 90 seconds
- multipart upload: 120 seconds

Normalized client errors:

- `REQUEST_TIMEOUT`: `Сервер не ответил вовремя.`
- `REQUEST_ABORTED`: `Запрос отменён.`
- `NETWORK_ERROR`: `Не удалось связаться с сервером.`

## Draft Recovery

The site form keeps the 1-second debounced autosave and also writes the local
draft immediately on:

- `visibilitychange` to hidden
- `pagehide`
- browser offline
- internal dirty cancel/back

The draft stores fields, mode, siteId, updatedAt, stable create
`clientRequestId`, and whether image files had been selected. It does not store
tokens, cookies, Authorization headers, passwords, JWTs, secrets, File/Blob
bytes, or local file paths. After reload, text can be restored but images must
be selected again; the UI says `Текст восстановлен. Изображения выберите повторно.`

## Create Idempotency

Create uses a stable client-generated `X-Request-Id` for one logical create
operation. The backend implements durable replay without schema changes:

- acquire PostgreSQL transaction advisory lock from actor id + request id;
- look up existing `site.create_draft` audit rows for actor/request id;
- compare SHA-256 request fingerprint of normalized create input;
- same fingerprint returns the existing site without another site insert or
  audit insert;
- different fingerprint returns `409 IDEMPOTENCY_KEY_REUSED`;
- missing replay site returns `409 IDEMPOTENCY_REPLAY_UNAVAILABLE`.

Existing duplicate slug behavior remains `409 SLUG_CONFLICT`.

## Safe Create Retry

After `NETWORK_ERROR` or `REQUEST_TIMEOUT`, the create flow:

1. preserves form data and selected in-memory files;
2. verifies backend readiness;
3. retries create exactly once with the same `X-Request-Id`;
4. falls back to exact slug verification if the response is still ambiguous;
5. keeps the form available for manual retry if no saved card is found.

It does not auto retry validation errors, auth failures, forbidden responses,
idempotency key reuse, duplicate slug, or ordinary backend 500.

## One-Click Images

The create form includes optional preview/gallery controls. Selected files are
validated before site create. File values are not included in the JSON site
payload. After site create succeeds, selected preview/gallery files are uploaded
as multipart requests.

If all selected images upload, the UI says:

`Карточка и изображения сохранены.`

If part of image upload fails after site create, the UI says:

`Карточка сохранена. Часть изображений не загрузилась.`

It keeps the saved site id, in-memory files where the browser allows, counts
successful/failed images, requestId when available, and actions:

- `Повторить загрузку изображений`
- `Открыть изображения`
- `К списку`

Retry uploads only failed/not-completed images and never repeats create POST.

## Safety Boundaries

This final hardening did not change Prisma schema, did not create or apply a
migration, did not deploy Render, did not change Render settings or tariff, and
did not write to production DB.

## Owner QAmax

Recommended final acceptance flow:

- Open admin from a cold browser session and confirm readiness appears before
  login/auth shell.
- Log in and confirm shell loads after readiness.
- Create a draft with Russian title, generated address, ruble price, and one
  external demo URL.
- Select valid preview/gallery images before pressing `Сохранить карточку`.
- Confirm one-click create completes and opens the saved next-step screen.
- Trigger an invalid selected image and confirm create is blocked before POST.
- Trigger/observe partial upload failure and confirm retry uploads only images.
- Reload during dirty edit and confirm text recovery; reselect images manually.
- Confirm `javascript:` and `data:` URLs are rejected.
- Confirm duplicate slug remains human `SLUG_CONFLICT`.
- Confirm no raw Prisma/SQL text appears in normal UI and requestId is copyable.

Production remains unchanged until the owner performs the separate Render
deploy step after merge.
