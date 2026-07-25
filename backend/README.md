# WEB00 Backend B1

Isolated backend scaffold for WEB00 Pro.

## Scope

B1 includes Node.js, TypeScript, Express, environment validation, request IDs, structured logging, the approved error contract, `GET /api/health`, graceful shutdown, and automated tests.

B1 does not include Prisma, PostgreSQL, Supabase, authentication, JWT, roles, CRUD, uploads, admin UI, Redis, Docker, Render config, GitHub Actions, or frontend integration.

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
