# WEB00 Backend B1

Isolated backend scaffold for WEB00 Pro.

## Scope

B1 includes Node.js, TypeScript, Express, environment validation, request IDs, structured logging, the approved error contract, `GET /api/health`, graceful shutdown, and automated tests. B2 adds the local PostgreSQL, Prisma, migration, snapshot, and seed foundation without public API, auth, admin UI, uploads, frontend integration, or deploy work.

B2 does not include Supabase runtime use, authentication, JWT, roles enforcement, CRUD routes, uploads, admin UI, Redis, Docker changes, Render config, GitHub Actions, or frontend integration.

## Runtime

- Node.js: `>=22.23.1 <23`
- TypeScript: `5.9.x`
- Module mode: ESM

All relative imports inside TypeScript source files use the future emitted `.js` extension.

Read-only runtime identity is available at `GET /api/version`. The endpoint does
not use the database and returns only allowlisted, bounded fields: service,
commit, branch, package/runtime version when available, and environment. It must
not expose raw environment variables, database URLs, JWT secrets, tokens,
filesystem paths, build logs, or credentials.

## Commands

Run commands from `D:\WEB00_BACKEND\backend` with the approved portable Node.js runtime:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$OriginalPath = $env:PATH
$env:PATH = "$PortableRoot;$OriginalPath"

& $PortableNpm run typecheck
& $PortableNpm run test:run
& $PortableNpm run build
& $PortableNpm run check

$env:PATH = $OriginalPath
```

Do not create a root `package.json`; backend tooling stays inside this directory.

## B2 Local Database

B2 uses PostgreSQL `17.10` on `127.0.0.1:5433` with three isolated local databases:

- `web00_backend_dev` for development migration and seed work.
- `web00_backend_shadow` for Prisma migrate shadow database work.
- `web00_backend_test` for integration tests.

For local development, `DATABASE_URL`, `SHADOW_DATABASE_URL`, and
`TEST_DATABASE_URL` live in local `backend/.env`. CI may provide
`TEST_DATABASE_URL` for isolated test writes. Trusted-machine migration and
seed operations use the variables required by their command.
Render web service variables must include only runtime values. The local `.env`
file is ignored by Git and must not be printed in logs or committed.

Prisma Client is generated into `backend/src/generated/prisma`, which is ignored by Git. Run B2 commands through the portable Node runtime:

```powershell
& $PortableNpm run prisma:validate
& $PortableNpm run prisma:format:check
& $PortableNpm run prisma:generate
& $PortableNpm run db:migrate:dev
& $PortableNpm run db:migrate:status
& $PortableNpm run seed:verify
& $PortableNpm run seed
```

## Production Runtime Environment

Production runtime env belongs to the web service process and must not include
test or shadow database credentials.

- Runtime server: `NODE_ENV`, `PORT`, `LOG_LEVEL`, `SERVICE_NAME`, `DATABASE_URL`, authentication variables, `AUTH_ORIGIN`, `PUBLIC_CORS_ORIGINS`, Storage variables, and cleanup worker variables.
- Migration tooling: `DATABASE_URL` plus `SHADOW_DATABASE_URL`, because the current Prisma config uses a shadow database URL.
- Test only: `TEST_DATABASE_URL`, used only by automated tests that write to an isolated test database.

`AUTH_ORIGIN` must be one exact HTTPS origin in production. `PUBLIC_CORS_ORIGINS`
must be exact HTTPS origins, comma-separated, with at most 10 entries. Secret
values belong only in trusted local env, CI secrets, or Render env, never in Git,
chat, screenshots, logs, or docs.

## Render Free Operating Model

Initial Render Free service fields:

- Root Directory: `backend`
- Build Command: `npm ci && npm run prisma:generate && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/api/ready`
- Runtime: `NODE_ENV=production`

Render Free is suitable for first public smoke/staging only. It can sleep after
idle periods, has a slow first request after sleep, has no dashboard shell or
SSH, has no one-off jobs, has no pre-deploy command, and uses an ephemeral
filesystem. The only approved keep-warm behavior is the admin UI's authenticated,
visible, online tab readiness ping around every 10 minutes; it stops on hidden,
offline, logout, and app destroy. Do not add service-worker keep-warm, external
cron, Render-specific runtime branches, automatic migration, automatic seed,
Storage bootstrap, or admin bootstrap to the Start Command.

Before first deploy, run the launch operations from a trusted machine:

```powershell
Set-Location D:\WEB00_BACKEND\backend

& $PortableNpm ci
& $PortableNpm run prisma:generate
& $PortableNpm run db:migrate:deploy
& $PortableNpm run seed
& $PortableNpm run storage:bootstrap
& $PortableNpm run admin:bootstrap
```

Run `seed` only for an empty production database. Run `storage:bootstrap` and
`admin:bootstrap` as explicit one-time operations. For later schema changes on
Render Free, run `db:migrate:deploy` from a trusted machine before deploy, or
move to an environment with a pre-deploy command. Do not put migrations or seed
inside `npm run start`.

## Supabase Production Model

Use a separate WEB00 Supabase project for PostgreSQL and Storage. Do not reuse
an unrelated project. Get the database connection string from the Supabase
Connect UI; if direct IPv6 is unavailable for the persistent Render backend, use
the approved session pooler. Storage bucket creation remains outside server
startup and is handled only by `npm run storage:bootstrap` from a trusted
machine.
