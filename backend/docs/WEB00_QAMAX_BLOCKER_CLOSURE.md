# WEB00 QAmax blocker closure

Status: code PR ready for owner reconciliation review. This is not Product Final and not a live canary approval.

## Safety boundary

This closure package was prepared without:

- production mutation;
- production database connection;
- production SQL, seed, or migration;
- Prisma schema migration;
- Docker or WSL;
- Render deploy;
- public category/card repair;
- production image upload;
- production reconciliation apply;
- reading `.env`, database URLs, JWT secrets, tokens, cookies, or passwords.

The production baseline incident is documented in `backend/docs/incidents/2026-07-30-production-catalog-baseline-drift.md`.

## Code blockers closed

1. Public bug-report UI was removed from public HTML, CSS, and `assets/js/main.js`.
2. Admin API successful 2xx JSON responses are strict: empty, malformed, or non-JSON success bodies are rejected as `INVALID_RESPONSE`.
3. `204 No Content` is opt-in per caller; permanent delete and logout remain valid no-body operations.
4. Site create/update UI validates saved response identity before showing success or clearing drafts/files.
5. Malformed gallery batch envelopes must contain `succeeded` and `failed` arrays or are rejected.
6. Permanent site delete is blocked while preview or gallery images remain attached.
7. Image attach/reorder/delete repository writes re-check current lifecycle/RBAC inside the transaction.
8. `/api/version` exposes safe build identity without DB access and with `Cache-Control: no-store`.
9. Site-editor save readiness preflight uses `ADMIN_REQUEST_TIMEOUTS.readinessAttempt` instead of generic GET timeout.
10. Local draft storage getter/read/write/remove failures are non-fatal; a blocked storage warning is shown where relevant.
11. Public catalog fatal API state clears stale static catalog cards when static fallback is disabled.
12. Admin keep-warm remains limited to authenticated visible online tabs and stops on logout/destroy.
13. Catalog legacy asset URL resolution is centralized for backend output and admin display.
14. Admin image manager renders approved legacy `assets/...` paths through the public frontend base without changing stored data on GET/render.
15. Public catalog mapper returns consumer-independent absolute image URLs and omits unsafe gallery URLs from public output.
16. Guarded canonical asset reconciliation logic targets only `mebel`, `massage`, and `drova`, with dry-run default, apply confirmation, transaction/rollback, audit, and idempotency tests.
17. Render Free operational gap is closed by an authenticated admin-only maintenance workflow in `/admin`; the CLI remains local/test helper only.
18. Canonical reconciliation apply now locks all three target site rows and their current category rows with `FOR UPDATE OF s, c` in slug order, re-reads the locked rows, and performs a full in-transaction state comparison before any write, including `categoryId` and `categorySlug`.
19. Apply precondition blockers now return controlled HTTP `409 RECONCILIATION_PRECONDITION_FAILED` instead of an ambiguous HTTP `200` blocked report.
20. Legacy asset URL resolution now blocks encoded traversal, encoded separator escapes, query/hash suffixes on legacy paths, and final URL escapes outside `/web00-pro/assets/`.
21. State changes after dry-run planning return controlled HTTP `409 RECONCILIATION_STATE_CHANGED` with zero reconciliation writes and zero audit rows.
22. Unexpected reconciliation transaction/database failures surface through the safe HTTP `500 INTERNAL_ERROR` path with `requestId`; they are not converted into successful or blocked reconciliation reports.
23. Admin maintenance UI report parsing is strict: malformed success responses, wrong target lists, impossible totals, blocked apply reports, and apply responses without real apply/no-op semantics do not show success copy and keep apply locked.

## Production baseline drift

Public production API snapshot:

- sites: 12
- categories: 8
- missing expected canonical sites: `mebel`, `massage`, `drova`
- extra observed category: `product-123` / `Купи Автомобиль`

Source canonical snapshot:

- sites: 15
- categories: 7

Owner baseline decision is now recorded:

- approved manifest: 15 canonical sites / 7 canonical categories;
- `mebel`, `massage`, and `drova` were found soft-deleted and restored by owner as active drafts;
- `product-123` and `opo` / `ui` were confirmed test artifacts and removed by owner;
- source data was not lost, but legacy gallery URLs were unresolved in admin;
- physical person attribution is not proven because actions used one admin account.

No Codex production repair, reconciliation apply, SQL, seed, migration, deploy, publish, or image upload was performed.

## Canonical asset reconciliation status

Implemented in this PR:

- safe resolver for absolute managed URLs and approved legacy asset paths;
- final-path guard that keeps legacy URLs inside `https://prudexxx.github.io/web00-pro/assets/`;
- admin image manager display fix for legacy preview/gallery URLs;
- public API image URL normalization independent of consumer origin;
- admin-only maintenance workflow for Render Free operation;
- `npm run catalog:reconcile-legacy-assets` CLI entrypoint for local/test use;
- hard target list: `mebel`, `massage`, `drova`;
- apply guard: `--apply --confirm=WEB00-CANONICAL-ASSETS-15-7`;
- HTTP/admin apply confirmation: `WEB00-CANONICAL-ASSETS-15-7`;
- all-or-nothing repository contract with audit entries only for changed sites;
- site/category row locks plus full in-transaction state recheck before writes;
- controlled HTTP `409 RECONCILIATION_PRECONDITION_FAILED` for apply precondition blockers;
- controlled HTTP `409 RECONCILIATION_STATE_CHANGED` failure for dry-run/apply race windows;
- safe HTTP `500 INTERNAL_ERROR` with `requestId` for unexpected transaction/database failures;
- deterministic tests for dry-run, apply HTTP contract, strict UI parsing, apply guards, RBAC, UI flow, blockers, rollback, idempotency, preservation, and safe output.

Not performed in this PR:

- production reconciliation apply;
- production DB write;
- publish of the three restored cards;
- deletion or upload of production images.

## Version endpoint

`GET /api/version` returns:

- `service`
- safe 40-hex `commit` or `null`
- safe bounded `branch` or `null`
- safe bounded `version` or `null`
- `environment`

It does not return raw environment variables, secrets, database URLs, filesystem paths, instance IDs, logs, or credentials.

## Keep-warm policy

Approved policy:

- authenticated admin tab only;
- visible tab only;
- online browser only;
- one timer;
- interval around 10 minutes;
- stops on logout and destroy;
- no service worker keep-warm;
- no external cron introduced here;
- no Render settings changed.

## Real PostgreSQL status

`REAL_PG_NOT_RUN — TEST_ENV_NOT_PROVIDED`

No explicit test-only PostgreSQL connection was provided for this closure run. Deterministic unit/static tests were run with an empty `DOTENV_CONFIG_PATH`. This does not block the code PR, but a real isolated PostgreSQL evidence pass remains required before Product Final.

## Future QAmax entry criteria

Before live canary, the owner must:

1. Review PR #7 reconciliation changes.
2. Deploy PR #7 only after approval.
3. Open `/admin` as administrator and use `Обслуживание` → `Восстановление канонических изображений`.
4. Run the maintenance dry-run first.
5. If dry-run report is clean, run apply with the exact confirmation string.
6. Verify `mebel`, `massage`, and `drova` remain draft/unpublished and images render.
7. Optionally provide an isolated test PostgreSQL connection if real DB-backed tests are required before Product Final.

## Canary status

Live canary remains prohibited until PR #7 is approved/deployed and owner-controlled canonical asset reconciliation has been reviewed. No production canary was run.
