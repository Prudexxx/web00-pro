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

`DATABASE_URL`, `SHADOW_DATABASE_URL`, and `TEST_DATABASE_URL` live only in local `backend/.env`, Render variables, or CI secrets. The local `.env` file is ignored by Git and must not be printed in logs or committed.

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
