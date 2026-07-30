# WEB00 QAmax blocker closure

Status: code PR ready for owner baseline decision. This is not Product Final and not a live canary approval.

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

## Production baseline drift

Public production API snapshot:

- sites: 12
- categories: 8
- missing expected canonical sites: `mebel`, `massage`, `drova`
- extra observed category: `product-123` / `Купи Автомобиль`

Source canonical snapshot:

- sites: 15
- categories: 7

No repair was attempted. The owner must approve the exact manifest before live canary.

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

Before live canary, the owner must provide or approve:

1. Exact catalog manifest:
   - `15 / 7`, or
   - `12 / 8`, or
   - another exact list of site/category identities.
2. Owner audit evidence for `mebel`, `massage`, `drova`, and `product-123`.
3. Decision whether `product-123` is canonical, a real business category, a test artifact, or an erroneous record.
4. Optional explicit test-only PostgreSQL connection if real DB-backed tests are required.

## Canary status

Live canary remains prohibited until the baseline decision is made. No production canary was run.
