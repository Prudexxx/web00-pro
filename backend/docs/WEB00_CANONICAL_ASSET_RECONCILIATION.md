# WEB00 canonical asset reconciliation runbook

Status: implemented for PR review; production apply not run by Codex.

## Purpose

This package reconciles the restored canonical draft cards:

- `mebel`
- `massage`
- `drova`

It restores each missing preview from the approved source manifest and normalizes each canonical legacy gallery URL to an absolute public frontend URL.

Source truth:

`backend/prisma/seed-data/web00-catalog.json`

Canonical public asset base:

`https://prudexxx.github.io/web00-pro/`

## Resolver policy

The resolver accepts:

- safe absolute `http:` / `https:` URLs without credentials;
- approved legacy paths:
  - `assets/...`
  - `./assets/...`
  - `/web00-pro/assets/...`

The resolver rejects:

- `javascript:`
- `data:`
- `file:`
- `blob:`
- protocol-relative `//host/path`
- credentials in URL
- backslash path tricks
- encoded scheme tricks
- traversal such as `../`
- encoded traversal such as `%2e%2e` and double-encoded traversal such as `%252e%252e`
- encoded slash/backslash escape attempts
- query/hash suffixes on legacy paths
- unexpected relative prefixes
- malformed URLs
- excessively long values

The resolver performs no network request. It returns a controlled result/null and never relies on the admin Render origin.

For legacy paths, the final resolved URL must remain inside:

`https://prudexxx.github.io/web00-pro/assets/`

The final-path guard rejects normalized URL escapes even when the input looked like an `assets/...` string before URL normalization.

## Public API behavior

Public catalog output is normalized on read:

- legacy preview/gallery URLs are returned as absolute GitHub Pages URLs;
- managed storage URLs remain unchanged;
- unsafe preview URLs become `null`;
- unsafe gallery URLs are omitted from public output;
- database rows are not mutated by GET/serialization.

## Admin image manager behavior

Admin image manager display uses the resolved presentation URL only:

- legacy preview/gallery URLs render from the public frontend base;
- managed absolute URLs continue to render unchanged;
- unsafe/unknown URLs still show `URL изображения недоступен.`;
- legacy display includes the marker `Изображение из публичного каталога`;
- delete/reorder payloads continue to use existing `assetId`, `sortOrder`, and `alt` contract fields;
- render does not mutate stored data.

## Admin maintenance workflow

Render Free does not provide a reliable owner Shell/SSH/one-off-job path for this operation. PR #7 therefore includes one authenticated admin-only maintenance action:

- dry-run: `GET /api/admin/maintenance/canonical-assets`
- apply: `POST /api/admin/maintenance/canonical-assets/reconcile`
- admin UI: `/admin` → `Обслуживание` → `Восстановление канонических изображений`

RBAC:

- anonymous requests: `401`;
- editor requests: `403`;
- admin dry-run: read-only report;
- admin apply: exact confirmation required.

Apply confirmation:

`WEB00-CANONICAL-ASSETS-15-7`

HTTP result contract:

- dry-run returns HTTP `200` with a read-only report, including controlled blocked reports;
- apply returns HTTP `200` only when the operation actually reports `applied` or `already-reconciled`;
- apply precondition blockers return HTTP `409` with code `RECONCILIATION_PRECONDITION_FAILED`;
- dry-run/apply race changes return HTTP `409` with code `RECONCILIATION_STATE_CHANGED`;
- unexpected transaction/database failures are not converted into successful or blocked reconciliation reports; the standard safe error envelope returns HTTP `500`, `INTERNAL_ERROR`, and `requestId` without raw Prisma, SQL, database URL, token, cookie, or password material.

Apply precondition blocker message:

`Восстановление не выполнено. Повторите проверку состояния.`

If card state changes between dry-run planning and transactional apply, the backend returns the controlled state-change failure:

`RECONCILIATION_STATE_CHANGED`

Message:

`Данные карточек изменились. Повторите проверку состояния.`

The admin UI keeps apply disabled until the latest dry-run report is structurally valid, has mode `dry-run`, status `ready`, exactly the expected targets in order (`mebel`, `massage`, `drova`), `targetSites=3`, and zero blockers. The confirmation dialog requires the exact confirmation string. A successful apply is shown only for a structurally valid apply report with status `applied` or `already-reconciled`; malformed success responses, wrong target lists, impossible totals, and blocker reports do not show success copy. A successful apply shows that the cards remain drafts and are not published.

The UI shows safe failure copy and requestId only; it must not display database URLs, Prisma internals, raw SQL, tokens, cookies, or passwords.

## CLI local/test helper

Script:

`npm run catalog:reconcile-legacy-assets`

Default mode is dry-run. The CLI remains useful for local/test verification and deterministic test injection, but the production-owner path on Render Free is the authenticated admin maintenance workflow above.

The CLI targets only:

- `mebel`
- `massage`
- `drova`

It does not accept an arbitrary slug list for apply.

The command requires an explicit runtime DB environment when no test repository is injected. It must not print the database URL, tokens, cookies, passwords, or private payloads.

## Dry-run

Dry-run performs:

- site lookup for the three fixed slugs;
- precondition evaluation;
- planned preview update count;
- planned gallery URL update count;
- safe JSON report.

Dry-run does not perform:

- site update;
- audit insert;
- publish;
- image upload;
- image deletion;
- schema migration.

Expected report fields include:

- slug;
- found;
- deleted;
- status;
- active;
- category match;
- title match;
- preview state;
- gallery count;
- gallery source match;
- planned preview update;
- planned gallery URL updates;
- blocker reason.

## Apply guard

Apply is allowed only with both parameters:

`--apply --confirm=WEB00-CANONICAL-ASSETS-15-7`

Without both parameters:

- zero writes;
- controlled blocked report.

With a wrong confirmation string:

- zero writes;
- non-zero exit.

Codex did not run apply in this PR task.

## Preconditions before any apply

All three sites must pass before any write occurs:

- exact slug exists;
- row is not deleted;
- status is `draft`;
- `active=true`;
- category slug matches source;
- title matches source;
- gallery count matches source count;
- gallery sort order matches canonical order;
- each current gallery URL is either recognized canonical legacy path or exact canonical absolute URL for that slot;
- `previewImageUrl` is either `null` or exact canonical absolute preview URL.

If one site fails:

- all three are blocked;
- zero writes;
- no partial repair.

## Apply behavior

In one controlled transaction:

- all three target site rows and their current category rows are locked in deterministic slug order: `drova`, `massage`, `mebel`;
- the repository lock query joins `sites` to `categories` and uses `FOR UPDATE OF s, c`;
- the locked rows are re-read after the locks are acquired;
- the full expected state from planning is compared against the locked current state before any write, including both `categoryId` and `categorySlug`;
- lifecycle, identity, category/title, preview, gallery URL, gallery alt, gallery sort order, and storage metadata changes during the race window block the operation;
- if the full recheck fails, zero site updates and zero audit rows are retained.

After the lock/recheck succeeds, for each changed site:

- `previewImageUrl: null` becomes the exact canonical absolute preview URL;
- exact canonical preview is no-op;
- unexpected non-null preview blocks all;
- gallery `url` is changed only from recognized canonical legacy value to exact canonical absolute value;
- already normalized gallery URL is no-op;
- unknown gallery URL blocks all.

The transaction preserves:

- id;
- slug;
- title;
- descriptions;
- category;
- categoryId;
- status;
- active;
- deletedAt;
- publishedAt;
- demo fields;
- price;
- development days;
- site sortOrder;
- tags/features;
- views;
- gallery assetId;
- storage metadata;
- alt;
- gallery sortOrder.

The transaction does not publish a site.

## Audit logging

Each changed site receives one audit row:

- action: `site.reconcile_canonical_assets`
- entityType: `site`
- requestId: one stable operation requestId for the command invocation

Audit snapshots include only:

- slug;
- preview URL state before/after;
- gallery URL state/count before/after;
- safe asset IDs/storage paths/sort orders.

Audit snapshots do not include:

- database URLs;
- tokens;
- cookies;
- passwords;
- raw SQL;
- full site payload.

## Rollback and idempotency

If any update or audit insert fails:

- the transaction rolls back;
- first/second site changes are not retained;
- no partial audit rows are retained.
- unexpected transaction/database failures are surfaced through the safe application error path instead of being converted into a successful or blocked reconciliation report.

If any target row changes after the initial plan but before transactional apply:

- the transaction performs zero reconciliation writes;
- the operation reports `RECONCILIATION_STATE_CHANGED`;
- the owner must repeat dry-run before trying again.

A second apply after a successful apply is a controlled no-op:

- zero semantic changes;
- zero duplicate mutation;
- zero duplicate audit entries.

## Verification status

Implemented deterministic tests cover:

- resolver accept/reject matrix;
- encoded traversal, encoded separator, query/hash, and final-path escape rejection;
- backend/browser resolver parity;
- admin maintenance route RBAC and exact confirmation;
- admin maintenance route HTTP apply contract: `200` only for `applied`/`already-reconciled`, `409 RECONCILIATION_PRECONDITION_FAILED` for precondition blockers, `409 RECONCILIATION_STATE_CHANGED` for race changes, and safe `500 INTERNAL_ERROR` for unexpected failures;
- admin maintenance UI strict report parsing, dry-run/apply/blocked/failure behavior, invalid response handling, and no false-success fallback copy;
- admin legacy display;
- public API normalization;
- dry-run zero writes;
- apply confirmation guards;
- fixed target list;
- missing/deleted/published/inactive/category mismatch blockers;
- gallery count/order/URL blockers;
- unexpected preview blocker;
- preview restoration for three sites;
- gallery URL normalization for twelve entries;
- deterministic site/category lock order and expected-site handoff;
- in-transaction full state recheck blockers;
- preservation of assetId/storage metadata/alt/order/lifecycle fields;
- one audit row per changed site;
- rollback on third-site failure;
- second apply no-op;
- safe output with no secret/raw DB material.

Real PostgreSQL integration status:

`REAL_PG_NOT_RUN — TEST_ENV_NOT_PROVIDED`

This is intentional until an isolated test database is provided.

## Owner runbook

After PR #7 is reviewed and deployed by the owner:

1. Confirm branch and deployment point are the intended PR #7 state.
2. Open `/admin` as an administrator.
3. Open `Обслуживание` → `Восстановление канонических изображений`.
4. Run dry-run with `Проверить состояние`.
5. Review the dry-run report for all three target cards.
6. Confirm no blocker is present and the report status is `ready`.
7. Run apply only if the owner approves, using the exact confirmation string:
   `WEB00-CANONICAL-ASSETS-15-7`
8. Verify in `/admin`:
   - `mebel`, `massage`, and `drova` are still drafts;
   - `active=true`;
   - previews render;
   - four gallery images render for each card;
   - order is unchanged.
9. Verify public API only after the owner chooses whether these drafts should remain hidden or be published later.

Do not publish the three cards as part of reconciliation.

## Rollback strategy

The preferred rollback is transaction rollback on failure. If a future owner apply succeeds but must be reverted, use audit snapshots to restore previous preview/gallery URL state for the same three sites only. Do not use seed, migration, or broad SQL unless separately approved.

## Migration status

No Prisma schema change.

No migration.

No seed run.
