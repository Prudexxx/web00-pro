# WEB00 Public Catalog Release Runbook

This runbook records the release order for the always-available public catalog and global demo display control.

## Fact-based deploy path audit

The backend worktree contains no `render.yaml`, `render.yml`, or `Dockerfile`.

`backend/package.json` defines:

- `build`: `npm run prisma:generate && tsc -p tsconfig.build.json && node scripts/copy-admin-assets.mjs`
- `start`: `node dist/server.js`
- `db:migrate:deploy`: `prisma migrate deploy --schema prisma/schema.prisma`

There is no migration command in `build` and no migration command in `start`.

Therefore the safe release model is staged/manual migration compatibility:

- new backend code must not crash if `PublicCatalogControl` is temporarily absent;
- production migration must be applied as an explicit owner-approved operational step;
- first public snapshot sync must occur after the migration and backend deploy;
- frontend snapshot consumption must be merged only after the backend manifest is readable and verified.

## Stage A: backend PR

1. Merge backend PR into `feat/web00-backend-production` after owner approval.
2. Do not merge the frontend PR yet.
3. Apply the backend database migration via the approved production migration path:
   `npm run db:migrate:deploy`
4. Deploy the approved backend commit to Render.
5. Confirm backend health/readiness.
6. In admin maintenance, open `Публичный каталог`.
7. Confirm status is available and the current settings match owner expectation.
8. Run manual public catalog sync.
9. Verify manifest and immutable snapshot:
   - manifest is readable;
   - manifest `schemaVersion=1`;
   - `itemsCount` equals expected production public count;
   - `sha256` is 64 lowercase hex;
   - snapshot bytes match the manifest checksum;
   - `settings.showDemoInModal` matches the admin toggle;
   - expected owner-known card `Дом для Буси` is present.

If sync fails, leave frontend PR unmerged. Existing public site remains on current Render API/static fallback behavior.

## Stage B: frontend PR

Merge the frontend PR into `main` only after all Stage A checks pass.

The frontend PR must explicitly depend on:

- backend deployed;
- migration applied;
- first snapshot ready;
- public manifest readable;
- expected item count verified;
- `Дом для Буси` present in the snapshot.

After frontend deploy, Render is no longer the critical initial read path for the public catalog.

## Rollback

Backend rollback before frontend merge:

- revert or redeploy the previous backend commit;
- do not merge frontend PR;
- existing public site behavior remains unchanged.

Frontend rollback after frontend merge:

- revert frontend snapshot client changes on `main`;
- existing static catalog data remains the built-in fallback;
- backend snapshot feature can remain deployed because it is additive.

Database rollback:

- do not drop `public_catalog_control` automatically during incident response;
- disabling frontend snapshot consumption is safer than destructive DB rollback;
- any schema rollback must be a separately owner-approved migration plan.

## Production safety boundaries

This implementation task does not:

- apply the migration to production;
- run a Render deploy;
- call production APIs;
- mutate production DB;
- create a production snapshot;
- run reconciliation or maintenance against production;
- publish/unpublish/create/delete cards.
