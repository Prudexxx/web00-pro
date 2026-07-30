# Production catalog baseline drift — 2026-07-30

Status: recorded incident, no production repair performed.

## Context

- Repository: `Prudexxx/web00-pro`
- Production branch: `feat/web00-backend-production`
- Deployed production commit under audit: `7f1abddc7e0bf5bc076bf495f79aadf1e0bcc522`
- Production API observed only with bounded anonymous GET requests.
- No production POST/PATCH/PUT/DELETE, SQL, seed, migration, deploy, category edit, or card repair was performed.

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

## What is not proven

- No data loss is proven.
- No deletion actor, timestamp, or root cause is proven.
- No database row state is proven for missing cards.
- No authenticated admin audit evidence is captured here.
- It is not proven whether `product-123` is a test artifact, a real business category, an intended canonical record, or an erroneous record.

## Why direct repair is prohibited

Repairing this drift would require an owner decision about the intended canonical truth. Directly recreating `mebel`, `massage`, or `drova`, or editing/removing `product-123`, could overwrite legitimate production intent. Production mutation is therefore blocked until the owner approves an exact manifest.

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
6. Decide the approved manifest before any live canary:
   - Option 1: 15 cards / 7 categories
   - Option 2: 12 cards / 8 categories
   - Option 3: another exact identity manifest
