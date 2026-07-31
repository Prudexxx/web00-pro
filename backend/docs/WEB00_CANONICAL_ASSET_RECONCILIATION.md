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
- unexpected relative prefixes
- malformed URLs
- excessively long values

The resolver performs no network request. It returns a controlled result/null and never relies on the admin Render origin.

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

## CLI

Script:

`npm run catalog:reconcile-legacy-assets`

Default mode is dry-run.

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

In one controlled transaction, for each changed site:

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

A second apply after a successful apply is a controlled no-op:

- zero semantic changes;
- zero duplicate mutation;
- zero duplicate audit entries.

## Verification status

Implemented deterministic tests cover:

- resolver accept/reject matrix;
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
2. Run the CLI without `--apply`.
3. Review the dry-run report for all three target cards.
4. Confirm no blocker is present.
5. Run apply only if the owner approves:
   `npm run catalog:reconcile-legacy-assets -- --apply --confirm=WEB00-CANONICAL-ASSETS-15-7`
6. Verify in `/admin`:
   - `mebel`, `massage`, and `drova` are still drafts;
   - `active=true`;
   - previews render;
   - four gallery images render for each card;
   - order is unchanged.
7. Verify public API only after the owner chooses whether these drafts should remain hidden or be published later.

Do not publish the three cards as part of reconciliation.

## Rollback strategy

The preferred rollback is transaction rollback on failure. If a future owner apply succeeds but must be reverted, use audit snapshots to restore previous preview/gallery URL state for the same three sites only. Do not use seed, migration, or broad SQL unless separately approved.

## Migration status

No Prisma schema change.

No migration.

No seed run.
