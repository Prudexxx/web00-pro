# Production catalog baseline drift — 2026-07-30

Status: owner baseline decision recorded; no Codex production repair or reconciliation apply performed.

## Context

- Repository: `Prudexxx/web00-pro`
- Production branch: `feat/web00-backend-production`
- Deployed production commit under audit: `7f1abddc7e0bf5bc076bf495f79aadf1e0bcc522`
- Production API observed only with bounded anonymous GET requests.
- No production POST/PATCH/PUT/DELETE, SQL, seed, migration, deploy, category edit, or card repair was performed.

## Owner baseline outcome recorded after audit

Owner approved the canonical manifest from `backend/prisma/seed-data/web00-catalog.json`:

- canonical sites: 15
- canonical categories: 7

Owner production audit and manual cleanup outcome:

- `mebel` existed as soft-deleted, was restored by owner through `/admin`, and is now an active draft.
- `massage` existed as soft-deleted, was restored by owner through `/admin`, and is now an active draft.
- `drova` existed as soft-deleted, was restored by owner through `/admin`, and is now an active draft.
- The restored `mebel`, `massage`, and `drova` cards remain unpublished.
- Their source data was not lost: each restored card still has four gallery records, but preview is missing and legacy gallery URLs did not render in admin.
- Test site `opo` / `ui` was owner soft-deleted and then permanently deleted.
- Test category `product-123` / `Купи Автомобиль` was deleted after owner confirmed site count `0`.
- Physical person attribution is not proven because the relevant actions used one admin account.
- No owner publish action for `mebel`, `massage`, or `drova` was performed during this cleanup.

Legacy image defect discovered:

- Restored cards have missing previews.
- Each restored card has four unresolved legacy gallery URLs.
- The defect is URL-origin resolution: stored legacy relative paths such as `assets/img/...` must resolve against `https://prudexxx.github.io/web00-pro/`, not the Render admin origin.

## Observed public production sites

`GET /api/sites?limit=20&page=1` returned:

- `total`: 12
- `totalPages`: 1
- slugs, in response order:
  - `site-custom`
  - `odezhda`
  - `doma-bani`
  - `medicina`
  - `narko-medicine`
  - `uslugi`
  - `cleaning`
  - `advokat`
  - `krovlya`
  - `digital-projects`
  - `ruberoid-roof`
  - `rental-house`

`GET /api/sites/popular?limit=20` returned the same public slug set.

Direct detail checks:

- `GET /api/sites/mebel`: 404
- `GET /api/sites/massage`: 404
- `GET /api/sites/drova`: 404

## Observed public production categories

`GET /api/categories` returned 8 active public categories.

Observed extra category:

- slug: `product-123`
- title: `Купи Автомобиль`
- description: `Продаем автомобили`
- sortOrder: `1`

Other observed category slugs:

- `individual`
- `goods`
- `construction`
- `medicine`
- `services`
- `realty`
- `delivery`

## Source canonical baseline

Source file: `backend/prisma/seed-data/web00-catalog.json`

Expected canonical sites: 15

- `site-custom`
- `mebel`
- `odezhda`
- `doma-bani`
- `medicina`
- `narko-medicine`
- `uslugi`
- `cleaning`
- `advokat`
- `krovlya`
- `digital-projects`
- `ruberoid-roof`
- `rental-house`
- `massage`
- `drova`

Expected canonical categories: 7

- `individual`
- `goods`
- `construction`
- `medicine`
- `services`
- `realty`
- `delivery`

## Drift summary

| Area | Source expected | Public observed | Drift |
| --- | ---: | ---: | --- |
| Sites | 15 | 12 | Missing `mebel`, `massage`, `drova` |
| Categories | 7 | 8 | Extra `product-123` |

No changed title/category/status field is asserted here beyond the public identity/count drift above.

## Updated drift status after owner action

- Canonical identity decision is complete: 15 sites / 7 categories.
- Production canonical identity cleanup was completed by owner for the test artifacts listed above.
- `mebel`, `massage`, and `drova` are restored but intentionally remain draft/unpublished.
- Remaining known blocker is canonical legacy asset reconciliation: preview restoration and gallery URL normalization for only `mebel`, `massage`, and `drova`.
- Codex did not run reconciliation apply and did not mutate production.

## Source and migration notes

- Canonical source data contains `mebel`, `massage`, and `drova` as published/active records.
- Migration `backend/prisma/migrations/20260729120000_publish_canonical_catalog/migration.sql` only publishes already-existing canonical slugs and accepts `updated_count` of `0` or `15`; it does not prove that all 15 rows exist in production.
- Recent canonical-data-related commits observed in git history include `31914ec`, `271a8f5`, `1b499b1`, `c1f8432`, and `5684d9c`.
- No migration, seed, SQL, or production database connection was executed during this incident capture.

## What is proven

- The public production API exposed 12 sites at the audited time.
- The public production API did not expose direct details for `mebel`, `massage`, or `drova`.
- The public production categories endpoint exposed an additional `product-123` category.
- The source canonical snapshot in this repository contains 15 sites and 7 categories.
- Owner approved the source canonical snapshot as the intended manifest.
- Owner restored `mebel`, `massage`, and `drova` as active drafts.
- Owner removed the confirmed test site/category artifacts `opo` / `ui` and `product-123`.
- The unresolved gallery display defect is consistent with legacy relative asset URLs resolving against the wrong origin.

## What is not proven

- Physical person attribution is not proven because the actions used one admin account.
- Codex did not independently inspect production secrets, database URLs, private cookies, or tokens.
- Codex did not run production reconciliation apply.
- Codex did not prove real PostgreSQL integration behavior for the reconciliation path because no isolated test DB was provided.

## Why direct repair is prohibited

Repairing this drift required an owner decision about the intended canonical truth. That decision is now recorded as 15 sites / 7 categories. Remaining automated repair is still prohibited for Codex in this task: production reconciliation apply must be run only by the owner through the guarded reconciliation runbook.

## Owner audit checklist

Use `/admin` manually. Do not copy or expose emails, tokens, cookies, passwords, private keys, or any secret values.

1. Open `/admin`.
2. Open `Журнал`.
3. Check audit entries for:
   - `mebel`
   - `massage`
   - `drova`
   - `product-123`
4. Record only:
   - action
   - timestamp
   - role
   - entityId
   - requestId
5. Do not change cards or categories during this audit.
6. Use `backend/docs/WEB00_CANONICAL_ASSET_RECONCILIATION.md` for the next owner-controlled dry-run/apply review.
