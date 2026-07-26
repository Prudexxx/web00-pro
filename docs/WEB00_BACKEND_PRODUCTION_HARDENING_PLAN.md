# WEB00 Backend Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the WEB00 backend for a first Render deployment by removing production startup blockers, adding scoped public catalog CORS, adding database readiness, and documenting the manual Render Free launch model.

**Architecture:** Keep `app.ts` dependency-injected and free from `process.env`; keep environment parsing and real adapter wiring in `server.ts` and operational CLI entrypoints. Add small typed config modules and Express middleware instead of new dependencies or Render-specific runtime branches.

**Tech stack:** Node.js `>=22.23.1 <23`, TypeScript NodeNext ESM, Express 5, Prisma 7.8, PostgreSQL, Supabase Storage client already present, Vitest, Supertest.

**Global constraints:** No new dependency, no package file change, no Prisma schema change, no migration change, no seed data change, no frontend change, no asset change, no network write, no Render/Supabase resource creation, no deploy.

## 1. Goal

Create a future implementation path for WEB00 Backend Production Hardening before the first Render deployment.

The future implementation must close these blockers and gaps:

- production server startup currently requires `DATABASE_URL`, `SHADOW_DATABASE_URL`, and `TEST_DATABASE_URL`;
- production `AUTH_ORIGIN` can be omitted while `createOriginGuard()` still allows any provided `Origin`;
- no public catalog CORS allowlist exists;
- no database readiness endpoint exists;
- Render Free cannot run shell, one-off jobs, or a pre-deploy command;
- migration deploy, one-time seed, Storage bootstrap, and admin bootstrap must run from a trusted machine outside Render Free startup.

This document is the only file created by the current plan-only task. It does not implement production code.

## 2. Preconditions

Before implementing this plan, run from `D:\WEB00_BACKEND`:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
git diff --cached --name-only
git diff --check
git ls-remote --heads origin feat/web00-backend-production
```

Required start state:

- branch is `feat/web00-backend-production`;
- HEAD is `f283ff7e20aed97604d702a3b959fe1185794d6b` or a later owner-accepted descendant of the docs-only plan commit;
- working tree is clean;
- staged area is empty;
- `git diff --check` exits `0`;
- remote branch `origin/feat/web00-backend-production` is absent unless the owner explicitly changes the branch/push model.

Use the approved portable runtime for future verification:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$env:PATH = "$PortableRoot;$env:PATH"
```

Implementation must stop before code changes if:

- `.env`, `.env.*`, secret files, credential exports, tokens, or private keys need to be read;
- the working tree is dirty with unrelated changes;
- package dependency installation beyond `npm ci` is required;
- a Render or Supabase write would be needed;
- Prisma schema, migrations, seed data, frontend, assets, or package files would need changes beyond the explicit file map below.

## 3. Fixed production decisions

### P1 - Runtime database env split

Runtime server and runtime operational CLI commands require only:

- `DATABASE_URL`.

Prisma migration/config tooling uses:

- `DATABASE_URL`;
- `SHADOW_DATABASE_URL`, because the current `backend/prisma.config.ts` includes `shadowDatabaseUrl: env("SHADOW_DATABASE_URL")`.

Tests use:

- `TEST_DATABASE_URL`.

Rules:

- `server.ts` does not parse `TEST_DATABASE_URL`;
- `server.ts` does not parse `SHADOW_DATABASE_URL`;
- production runtime does not receive test DB credentials;
- tests do not use `DATABASE_URL` for writes;
- Prisma migration behavior remains preserved;
- schema and migrations do not change.

### P2 - Production auth origin

When `NODE_ENV=production`:

- `AUTH_ORIGIN` is required;
- value must be an absolute HTTPS origin;
- path must be exactly `/`;
- credentials, query, and fragment are rejected;
- trailing slash normalizes to the origin form;
- `localhost` and `127.0.0.1` over HTTP are allowed only outside production;
- missing or invalid `AUTH_ORIGIN` stops startup;
- origin comparison remains exact;
- wildcard is prohibited.

Development and test compatibility remain intact.

### P3 - Public CORS allowlist

Add environment variable:

- `PUBLIC_CORS_ORIGINS`.

Format:

- comma-separated exact origins;
- trim whitespace;
- unique normalized origins;
- maximum `10` origins;
- production requires at least one origin;
- development and test may use an empty list;
- wildcard is prohibited;
- credentials, query, and fragment are rejected;
- production allows HTTPS only;
- localhost HTTP is allowed only in development and test.

CORS applies only to public catalog API routes:

- `GET /api/sites`;
- `GET /api/sites/popular`;
- `GET /api/sites/:slug`;
- `GET /api/categories`;
- `GET /api/categories/:slug`;
- safe `HEAD` behavior only where Express GET route semantics support it;
- `OPTIONS` preflight.

CORS never expands:

- auth routes;
- admin routes;
- cookies;
- `Authorization`;
- private endpoints.

Allowed request origin behavior:

- `Access-Control-Allow-Origin` equals the exact request origin;
- `Vary: Origin` is present;
- `Access-Control-Allow-Methods` equals `GET, HEAD, OPTIONS`;
- `Access-Control-Allow-Credentials` is absent;
- wildcard is absent;
- origin reflection occurs only after allowlist match.

Untrusted request origin behavior:

- ordinary `GET` receives the existing public response without CORS allow headers;
- untrusted `OPTIONS` receives controlled `403 CORS_ORIGIN_FORBIDDEN`;
- no additional site/category existence signal is introduced beyond existing public GET behavior.

### P4 - Readiness endpoint

Add:

- `GET /api/ready`.

Ready response:

```json
{
  "status": "ready"
}
```

Not ready response:

```json
{
  "status": "not_ready"
}
```

Rules:

- ready returns HTTP `200`;
- not ready returns HTTP `503`;
- readiness performs a minimal PostgreSQL probe through an injected dependency;
- readiness performs no migration;
- readiness performs no write;
- readiness performs no Storage request;
- readiness performs no auth check;
- raw Prisma/PostgreSQL error text is not returned;
- stack trace is not returned;
- `GET /api/health` remains DB-free;
- `app.ts` does not read `process.env`;
- tests use fake readiness probes;
- `server.ts` wires the real Prisma readiness probe.

### P5 - Storage fail-fast remains

Production server startup still requires:

- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `SUPABASE_STORAGE_BUCKET`;
- `STORAGE_PUBLIC_BASE_URL`.

Reason:

- B7 image routes are production functionality;
- the server must not start with image endpoints known to be broken.

Storage bucket creation remains outside server startup and is run by `npm run storage:bootstrap` from a trusted machine.

### P6 - Explicit production mode

Render configuration must set:

- `NODE_ENV=production`.

Production mode is not inferred from `RENDER`. No Render-specific runtime code is added. Local development compatibility remains.

## 4. Scope

Future implementation scope:

- split database env parsing into runtime, migration, and test interfaces;
- make production `AUTH_ORIGIN` a hard startup gate;
- add typed public CORS env parsing;
- add small Express middleware scoped to public catalog routes;
- add `/api/ready` with injected database readiness probe;
- wire production readiness in `server.ts`;
- keep `/api/health` public and DB-free;
- update safe env documentation in `backend/.env.example` without reading or printing real values;
- update `backend/README.md` with Render Free and trusted-machine operational steps;
- add focused unit, route, integration, and composition tests;
- preserve all current backend behavior for auth, admin, public catalog, images, storage cleanup, seed idempotency, and repository boundaries.

Current task scope:

- create only `docs/WEB00_BACKEND_PRODUCTION_HARDENING_PLAN.md`;
- create one local docs-only commit after verification;
- do not push, create a PR, merge, deploy, or create resources.

## 5. Explicit out-of-scope

Out of scope for future implementation:

- new package dependencies;
- package file edits;
- Prisma schema edits;
- migration edits;
- seed data edits;
- frontend edits;
- asset replacement;
- public bug-report UI;
- Render-specific runtime branches;
- Supabase project creation;
- Supabase bucket creation during server startup;
- automatic migration in `npm run start`;
- automatic seed in `npm run start`;
- automatic admin bootstrap;
- automatic Storage bootstrap;
- Docker operations;
- paid API use;
- push, PR, merge, and deploy unless separately approved.

Out of scope for the current plan-only task:

- production code changes;
- dependency installation;
- database writes;
- network writes;
- Render/Supabase resource creation;
- reading `.env`, `.env.*`, or secret-like files.

## 6. Existing blocker evidence

Safe inspection found these current-code blockers and boundaries:

| Area | Evidence | Production implication |
| --- | --- | --- |
| Combined database env | `backend/src/config/database-env.ts` defines `DatabaseEnv` with `DATABASE_URL`, `SHADOW_DATABASE_URL`, and `TEST_DATABASE_URL`; `parseDatabaseEnv()` reads all three as required. | Production runtime startup currently requires test and shadow database variables. |
| Server startup | `backend/src/server.ts` `main()` calls `parseDatabaseEnv(process.env)` and `startServer()` uses only `databaseEnv.DATABASE_URL`. | Server only needs the runtime URL but validates more than it consumes. |
| Prisma config | `backend/prisma.config.ts` references `env("DATABASE_URL")` and `env("SHADOW_DATABASE_URL")`. | Migration/config tooling currently requires shadow env because the factual config references it. |
| Operational CLI | `backend/src/cli/admin-bootstrap.command.ts`, `backend/src/cli/user-create.command.ts`, `backend/src/cli/user-set-password.command.ts`, and `backend/src/cli/storage-cleanup.command.ts` call `parseDatabaseEnv()` and consume only `DATABASE_URL`. | Trusted-machine production CLI commands inherit unnecessary test/shadow requirements. |
| Seed entrypoint | `backend/prisma/seed.ts` calls `parseDatabaseEnv()` and then `assertMigrationDatabaseUrl(...)`, while the seed data implementation is separate in `backend/prisma/seed-web00-data.ts`. | One-time production seed needs explicit handling without changing seed data or adding seed to startup. |
| Auth origin parser | `backend/src/config/auth-env.ts` has `AUTH_ORIGIN?: string`; `parseAuthOrigin()` allows omission and currently accepts HTTP origins if they are syntactic origins. | Production can start without an auth origin, and HTTP can pass parser validation. |
| Auth origin guard | `backend/src/modules/auth/auth-origin.ts` rejects missing production `Origin`, but when `authOrigin` is undefined a provided origin is not compared. | Production `AUTH_ORIGIN` must be required before route handling. |
| Public catalog routes | `backend/src/modules/public-catalog/public-catalog.routes.ts` registers only GET routes under `/api`; no CORS or preflight handling exists. | Browser frontend origin access is not controlled by a typed public allowlist. |
| App boundary | `backend/src/app.ts` mounts `/api/health`, public catalog, auth, admin, test routes, 404, and error handler; tests assert `app.ts` is free from `process.env`. | Readiness and CORS must be injected, not process-env driven inside `app.ts`. |
| Health route | `backend/src/modules/health/health.route.ts` returns service/status/time and does not touch DB. | Keep health DB-free and use a new readiness endpoint for database state. |
| Storage env | `backend/src/config/storage-env.ts` requires Supabase and Storage public base config; `server.ts` parses it before `startServer()`. | Storage remains fail-fast and bucket bootstrap stays operational. |
| Readiness audit | `docs/WEB00_BACKEND_READINESS_AUDIT.md` records backend readiness as `NO`. | This hardening plan is a pre-deploy readiness step, not a deploy. |
| B3 boundary | `docs/WEB00_BACKEND_B3_IMPLEMENTATION_PLAN.md` scoped public catalog API and kept CORS out for a later task. | This plan is that later scoped CORS task for public catalog only. |
| B7 boundary | `docs/WEB00_BACKEND_B7_IMPLEMENTATION_PLAN.md` forbids Supabase bucket creation during server startup and uses fake Storage in default tests. | Preserve B7 image and Storage behavior. |

Start gate evidence for this docs-only plan:

- current branch: `feat/web00-backend-production`;
- previous HEAD: `f283ff7e20aed97604d702a3b959fe1185794d6b`;
- working tree: clean before file creation;
- staged area: empty before file creation;
- `git diff --check`: clean before file creation;
- remote branch `origin/feat/web00-backend-production`: absent before file creation.

## 7. Runtime database environment split

Create exact interfaces in `backend/src/config/database-env.ts`:

```typescript
export interface RuntimeDatabaseEnv {
  DATABASE_URL: string;
}

export interface MigrationDatabaseEnv {
  DATABASE_URL: string;
  SHADOW_DATABASE_URL: string;
}

export interface TestDatabaseEnv {
  TEST_DATABASE_URL: string;
}
```

Keep `DatabaseUrlParts` and safe validation errors, but split parser entrypoints:

```typescript
export function parseRuntimeDatabaseEnv(input: NodeJS.ProcessEnv): RuntimeDatabaseEnv;
export function parseMigrationDatabaseEnv(input: NodeJS.ProcessEnv): MigrationDatabaseEnv;
export function parseTestDatabaseEnv(input: NodeJS.ProcessEnv): TestDatabaseEnv;
export function parseDatabaseUrl(
  value: string,
  variableName: keyof RuntimeDatabaseEnv | keyof MigrationDatabaseEnv | keyof TestDatabaseEnv
): DatabaseUrlParts;
export function assertRuntimeDatabaseUrl(env: RuntimeDatabaseEnv): void;
export function assertMigrationDatabaseUrl(
  env: MigrationDatabaseEnv,
  nodeEnv: string | undefined
): void;
export function assertTestDatabaseUrl(env: TestDatabaseEnv): void;
```

Runtime parser contract:

- requires syntactically valid PostgreSQL `DATABASE_URL`;
- rejects test database names for runtime;
- does not inspect `TEST_DATABASE_URL`;
- does not inspect `SHADOW_DATABASE_URL`;
- does not require isolation against missing test/shadow values;
- does not print raw URL values.

Migration parser contract:

- requires syntactically valid PostgreSQL `DATABASE_URL`;
- requires syntactically valid PostgreSQL `SHADOW_DATABASE_URL` because current `backend/prisma.config.ts` references it;
- rejects equal runtime/shadow targets;
- rejects test database names for migration runtime target;
- keeps existing migrate-dev production guard;
- does not require `TEST_DATABASE_URL`.

Test parser contract:

- requires syntactically valid PostgreSQL `TEST_DATABASE_URL`;
- requires database name to end with `_test` or include `_test_`;
- rejects production-like markers;
- does not require `DATABASE_URL`;
- does not require `SHADOW_DATABASE_URL`.

Runtime consumers:

- `backend/src/server.ts`;
- `backend/src/cli/admin-bootstrap.command.ts`;
- `backend/src/cli/user-create.command.ts`;
- `backend/src/cli/user-set-password.command.ts`;
- `backend/src/cli/storage-cleanup.command.ts`;
- one-time seed entrypoint `backend/prisma/seed.ts` only for parser split, preserving `seedWeb00Catalog()` behavior and seed data.

Migration consumers:

- `backend/prisma.config.ts` through Prisma CLI env resolution;
- migration guard tests;
- any explicit migration helper tests.

Test consumers:

- integration tests;
- seed tests;
- test database helper;
- future route tests with DB writes.

## 8. Production authentication origin

Modify `backend/src/config/auth-env.ts` so parsing receives the already parsed node environment:

```typescript
export interface AuthEnvParseOptions {
  nodeEnv: NodeEnvironment;
}

export function parseAuthEnv(
  input: NodeJS.ProcessEnv,
  options: AuthEnvParseOptions
): AuthEnv;
```

Production validation:

- missing `AUTH_ORIGIN` produces an `AuthEnvValidationError`;
- invalid URL produces an `AuthEnvValidationError`;
- HTTP origin produces an `AuthEnvValidationError`;
- wildcard produces an `AuthEnvValidationError`;
- username/password in URL produces an `AuthEnvValidationError`;
- query string produces an `AuthEnvValidationError`;
- fragment produces an `AuthEnvValidationError`;
- path other than `/` produces an `AuthEnvValidationError`;
- trailing slash normalizes to the origin without slash;
- exact HTTPS origin passes.

Development/test validation:

- missing `AUTH_ORIGIN` remains allowed;
- `http://127.0.0.1:3000` and `http://localhost:3000` remain allowed;
- exact non-local HTTP origin remains rejected unless a test explicitly proves existing behavior needs it;
- wildcard, credentials, query, and fragment remain rejected.

Route behavior:

- `createOriginGuard()` remains exact comparison only;
- production missing `Origin` remains `403 ORIGIN_NOT_ALLOWED`;
- production wrong `Origin` remains `403 ORIGIN_NOT_ALLOWED`;
- production correct `Origin` passes;
- development/test missing `Origin` passes;
- development/test configured mismatch remains `403 ORIGIN_NOT_ALLOWED`.

## 9. Public CORS allowlist

Create `backend/src/config/public-cors-env.ts`:

```typescript
import type { NodeEnvironment } from "./env.js";

export interface PublicCorsEnv {
  PUBLIC_CORS_ORIGINS: readonly string[];
}

export interface PublicCorsConfig {
  allowedMethods: readonly ["GET", "HEAD", "OPTIONS"];
  allowedOrigins: ReadonlySet<string>;
  maxOrigins: 10;
}

export interface PublicCorsEnvParseOptions {
  nodeEnv: NodeEnvironment;
}

export function parsePublicCorsEnv(
  input: NodeJS.ProcessEnv,
  options: PublicCorsEnvParseOptions
): PublicCorsEnv;

export function toPublicCorsConfig(env: PublicCorsEnv): PublicCorsConfig;
```

Parser contract:

- input is `PUBLIC_CORS_ORIGINS`;
- split on comma;
- trim entries;
- drop empty entries after trimming;
- normalize each URL to exact origin;
- deduplicate normalized origins preserving first occurrence;
- reject more than `10`;
- reject wildcard `*`;
- reject credentials;
- reject query;
- reject fragment;
- reject path other than `/`;
- reject HTTP in production;
- allow localhost HTTP only in development/test;
- require at least one origin in production;
- allow empty list in development/test;
- error messages include variable names only, not raw origin values.

## 10. Database readiness endpoint

Create readiness module:

- `backend/src/modules/readiness/readiness.types.ts`;
- `backend/src/modules/readiness/readiness.service.ts`;
- `backend/src/modules/readiness/readiness.routes.ts`.

Exact interfaces:

```typescript
export interface ReadinessProbe {
  check(): Promise<void>;
}

export interface ReadinessService {
  check(): Promise<ReadinessStatus>;
}

export type ReadinessStatus = "ready" | "not_ready";

export interface ReadinessResponse {
  status: ReadinessStatus;
}
```

Service contract:

- calls `probe.check()`;
- returns `"ready"` when the probe resolves;
- returns `"not_ready"` when the probe rejects;
- never returns raw error text;
- never logs secrets;
- never calls Storage;
- never mutates database state.

Route contract:

- `GET /api/ready` returns `200` and `{ "status": "ready" }` when ready;
- `GET /api/ready` returns `503` and `{ "status": "not_ready" }` when not ready;
- `Content-Type` is JSON;
- no auth middleware;
- no CORS credentials;
- no secret output;
- raw Prisma/PostgreSQL error and stack are absent.

Real production probe:

```typescript
export function createPrismaReadinessProbe(
  prisma: Pick<PrismaClient, "$queryRaw">
): ReadinessProbe;
```

The probe must run the smallest safe query, such as `SELECT 1`, through Prisma. It must not run migrations, write rows, inspect Storage, or read env.

## 11. Storage startup policy

Keep `backend/src/config/storage-env.ts` fail-fast behavior:

- `SUPABASE_URL` required;
- `SUPABASE_SERVICE_ROLE_KEY` required;
- `SUPABASE_STORAGE_BUCKET` required and equals `web00-catalog-images`;
- `STORAGE_PUBLIC_BASE_URL` required;
- `STORAGE_WORKER_ENABLED` explicit boolean;
- `STORAGE_WORKER_POLL_INTERVAL_SECONDS` equals `60`.

Keep startup behavior:

- `server.ts` parses storage env during `main()`;
- `server.ts` constructs Supabase image storage adapter;
- `server.ts` starts storage cleanup worker only when `STORAGE_WORKER_ENABLED=true`;
- server startup does not create buckets;
- server startup does not run `storage:bootstrap`;
- readiness does not probe Storage.

Operational Storage bootstrap:

- `npm run storage:bootstrap` remains separate;
- command runs from a trusted machine;
- command inspects/creates bucket only after explicit CLI confirmation;
- command is not part of Render Build Command;
- command is not part of Render Start Command.

## 12. Environment variable matrix

### Runtime server

Runtime Render service env names:

| Name | Required in production | Notes |
| --- | --- | --- |
| `NODE_ENV` | Yes | Must be `production` on Render. |
| `PORT` | Yes | Render provides/sets the service port. |
| `DATABASE_URL` | Yes | Supabase PostgreSQL session pooler or direct connection from Supabase Connect UI. |
| `LOG_LEVEL` | Yes | Existing parser accepts `silent`, `error`, `warn`, `info`, `debug`. |
| `SERVICE_NAME` | Yes | Use `web00-backend`. |
| `JWT_ACCESS_SECRET_BASE64` | Yes | Secret value only in Render env or trusted machine env. |
| `JWT_ISSUER` | Yes | Must be `web00-backend`. |
| `JWT_AUDIENCE` | Yes | Must be `web00-admin`. |
| `ACCESS_TOKEN_TTL_SECONDS` | Yes | Existing approved production value remains `900` unless owner changes it later. |
| `REFRESH_TOKEN_TTL_SECONDS` | Yes | Existing approved production value remains `604800` unless owner changes it later. |
| `AUTH_FINGERPRINT_SECRET_BASE64` | Yes | Must differ from access secret. |
| `TRUST_PROXY_HOPS` | Yes | Integer `0` to `3`; never boolean `true`. |
| `AUTH_ORIGIN` | Yes | Exact HTTPS admin/frontend origin in production. |
| `PUBLIC_CORS_ORIGINS` | Yes | Exact HTTPS public frontend origins, comma-separated, max `10`. |
| `SUPABASE_URL` | Yes | Supabase project API origin. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side only; not in Git/chat/screenshots. |
| `SUPABASE_STORAGE_BUCKET` | Yes | Must be `web00-catalog-images`. |
| `STORAGE_PUBLIC_BASE_URL` | Yes | Exact public storage origin. |
| `STORAGE_WORKER_ENABLED` | Yes | Explicit `true` or `false`. |
| `STORAGE_WORKER_POLL_INTERVAL_SECONDS` | Yes | Must be `60`. |

Runtime server must not receive:

- `TEST_DATABASE_URL`;
- `SHADOW_DATABASE_URL`.

### Migration tooling

Migration tooling env names:

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Target database for Prisma migration commands. |
| `SHADOW_DATABASE_URL` | Yes in current repo | Required because `backend/prisma.config.ts` references `shadowDatabaseUrl`. |

Migration tooling must not require:

- `TEST_DATABASE_URL`.

### Test only

Test-only env names:

| Name | Required | Notes |
| --- | --- | --- |
| `TEST_DATABASE_URL` | Yes | Must point only to isolated WEB00 test database. |

Tests must not use:

- `DATABASE_URL` for writes;
- production/staging database URLs;
- Supabase production Storage credentials in default test suite.

## 13. Render Free operating model

Initial Render service configuration:

| Field | Value |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `npm ci && npm run prisma:generate && npm run build` |
| Start Command | `npm run start` |
| Health Check Path after readiness implementation | `/api/ready` |
| Runtime env | `NODE_ENV=production` plus runtime matrix from section 12 |

Render Free limitations to document:

- Free Web Service sleeps after a period without traffic;
- first request after sleep can be slow;
- Free Web Service has no Dashboard Shell/SSH;
- Free Web Service has no one-off jobs;
- Free Web Service has no pre-deploy command;
- filesystem is ephemeral;
- backend does not use local persistent uploads;
- database and images remain in external PostgreSQL and Supabase Storage;
- Free is suitable for first public smoke/staging;
- stable commercial production requires paid Render or Docker operations.

No keep-alive workaround is added.

Trusted-machine initial launch commands before first deploy:

```powershell
Set-Location D:\WEB00_BACKEND\backend

& $PortableNpm ci
& $PortableNpm run prisma:generate
& $PortableNpm run db:migrate:deploy
& $PortableNpm run seed
& $PortableNpm run storage:bootstrap
& $PortableNpm run admin:bootstrap
```

Operational rules:

- migration deploy runs separately before deploy;
- one-time seed runs only for an empty production DB;
- seed does not run on every deploy;
- Storage bootstrap runs once and is confirmed through CLI;
- admin bootstrap runs once and is confirmed through CLI;
- none of these commands are added to Start Command;
- none of these commands are silently executed by Render Free.

Subsequent schema migrations on Render Free:

- run migration deploy from a trusted machine before deploy; or
- move service to a paid instance with a pre-deploy command;
- do not add migration deploy to Start Command.

## 14. Supabase production model

Initial production setup uses one separate Supabase project for WEB00:

- PostgreSQL database;
- Supabase Storage;
- isolated from the massage backend;
- no reuse of an existing unrelated project;
- database connection string comes from Supabase Connect UI;
- when direct IPv6 connection is unavailable for persistent Render backend, use the approved Supabase session pooler;
- do not automatically choose transaction pooler;
- secret values do not enter Git, chat, screenshots, docs, logs, or test output.

This is operational design only. This plan does not create the Supabase project.

## 15. File map and interfaces

### Future modify

- `backend/src/config/database-env.ts`: split runtime, migration, and test database env parsers and interfaces.
- `backend/src/config/auth-env.ts`: require production `AUTH_ORIGIN` with HTTPS exact-origin policy.
- `backend/src/config/env.ts`: no required change expected; keep `NODE_ENV` parser as production mode source.
- `backend/src/server.ts`: parse runtime DB, app env, auth env, public CORS env, storage env; wire Prisma readiness probe and CORS config.
- `backend/src/app.ts`: accept injected `publicCorsConfig` and `readinessService`; mount readiness and scoped public catalog CORS without reading `process.env`.
- `backend/src/lib/errors.ts`: add `CORS_ORIGIN_FORBIDDEN` only if middleware uses `AppError`; direct controlled response may avoid this change.
- `backend/src/modules/auth/auth-origin.ts`: keep exact comparison; adjust only if types require non-optional production origin handling.
- `backend/src/modules/public-catalog/public-catalog.routes.ts`: attach public CORS middleware, preflight, and safe HEAD behavior for catalog routes only.
- `backend/src/cli/admin-bootstrap.command.ts`: consume `RuntimeDatabaseEnv` instead of combined database env.
- `backend/src/cli/user-create.command.ts`: consume `RuntimeDatabaseEnv` instead of combined database env.
- `backend/src/cli/user-set-password.command.ts`: consume `RuntimeDatabaseEnv` instead of combined database env.
- `backend/src/cli/storage-cleanup.command.ts`: consume `RuntimeDatabaseEnv` instead of combined database env.
- `backend/prisma/seed.ts`: consume runtime DB parser for the one-time seed entrypoint while preserving `seedWeb00Catalog()` behavior and seed data.
- `backend/tests/setup.ts`: preserve and restore `PUBLIC_CORS_ORIGINS`.
- `backend/.env.example`: add safe placeholder names for `AUTH_ORIGIN`, `PUBLIC_CORS_ORIGINS`, and production runtime split; no real values.
- `backend/README.md`: document Render Free model, trusted-machine command sequence, and env ownership.

### Future create

- `backend/src/config/public-cors-env.ts`: typed `PUBLIC_CORS_ORIGINS` parser and config conversion.
- `backend/src/modules/public-catalog/public-cors.middleware.ts`: Express middleware for exact-origin public catalog CORS and preflight.
- `backend/src/modules/readiness/readiness.types.ts`: readiness probe/service/response types.
- `backend/src/modules/readiness/readiness.service.ts`: fake-friendly service and real Prisma probe factory.
- `backend/src/modules/readiness/readiness.routes.ts`: `GET /api/ready` route.
- `backend/tests/public-cors-env.test.ts`: env parser unit tests.
- `backend/tests/public-cors.middleware.test.ts`: middleware route tests.
- `backend/tests/readiness.test.ts`: readiness service/route tests.

### Expected unchanged

- `backend/package.json`;
- `backend/package-lock.json`;
- `backend/prisma/schema.prisma`;
- `backend/prisma/migrations/**`;
- `backend/prisma/seed-data/web00-catalog.json`;
- frontend files;
- assets;
- GitHub workflows;
- B7 image behavior and managed image path rules.

### Interfaces consumed and produced

Database:

```typescript
export interface RuntimeDatabaseEnv {
  DATABASE_URL: string;
}

export interface MigrationDatabaseEnv {
  DATABASE_URL: string;
  SHADOW_DATABASE_URL: string;
}

export interface TestDatabaseEnv {
  TEST_DATABASE_URL: string;
}
```

Public CORS:

```typescript
export interface PublicCorsEnv {
  PUBLIC_CORS_ORIGINS: readonly string[];
}

export interface PublicCorsConfig {
  allowedMethods: readonly ["GET", "HEAD", "OPTIONS"];
  allowedOrigins: ReadonlySet<string>;
  maxOrigins: 10;
}
```

Readiness:

```typescript
export interface ReadinessProbe {
  check(): Promise<void>;
}

export interface ReadinessService {
  check(): Promise<"ready" | "not_ready">;
}
```

App composition:

```typescript
export interface CreateAppOptions {
  adminRoutes?: Router;
  authRoutes?: Router;
  env: AppEnv;
  logger?: AppLogger;
  publicCatalogService?: PublicCatalogService;
  publicCorsConfig?: PublicCorsConfig;
  readinessService?: ReadinessService;
  registerTestRoutes?: (app: Express) => void;
  now?: () => Date;
  trustProxyHops?: number;
}
```

## 16. Error and HTTP contract

Public CORS:

- allowed GET/HEAD public catalog request with trusted `Origin` returns existing status/body plus exact CORS headers;
- allowed OPTIONS returns `204` with exact CORS headers and no body;
- untrusted GET returns existing public response without `Access-Control-Allow-Origin`;
- untrusted OPTIONS returns `403` and safe JSON:

```json
{
  "error": {
    "code": "CORS_ORIGIN_FORBIDDEN",
    "message": "CORS origin is not allowed.",
    "requestId": "req_example"
  }
}
```

- auth and admin routes receive no new CORS headers from this middleware;
- wildcard is never emitted;
- `Access-Control-Allow-Credentials` is never emitted;
- `Authorization` is never listed as allowed.

Readiness:

- `GET /api/ready` ready response is exactly `{ "status": "ready" }`;
- `GET /api/ready` not-ready response is exactly `{ "status": "not_ready" }`;
- readiness does not use the app-wide error response envelope because it must be a minimal health check body;
- raw DB errors, stack traces, URLs, and secret names are absent.

Health:

- `GET /api/health` remains existing JSON shape with `data.service`, `data.status`, and `data.time`;
- health remains DB-free, auth-free, and Storage-free.

Auth origin:

- production startup fails on missing or invalid `AUTH_ORIGIN`;
- production auth route `Origin` comparison remains exact and returns `403 ORIGIN_NOT_ALLOWED` on mismatch.

## 17. Testing strategy

Database env tests:

- runtime requires `DATABASE_URL` only;
- runtime ignores `TEST_DATABASE_URL`;
- runtime ignores `SHADOW_DATABASE_URL`;
- runtime rejects test database names;
- migration parser requires `DATABASE_URL`;
- migration parser requires `SHADOW_DATABASE_URL` while Prisma config references it;
- migration parser does not require `TEST_DATABASE_URL`;
- test parser requires `TEST_DATABASE_URL`;
- test parser rejects non-test names and production-like targets;
- integration write helpers consume `TestDatabaseEnv`.

AUTH_ORIGIN tests:

- production missing fails;
- production invalid fails;
- production HTTP fails;
- production wildcard fails;
- production credentials/query/fragment fails;
- exact HTTPS passes;
- trailing slash normalizes;
- development localhost HTTP passes;
- exact origin comparison remains enforced.

Public CORS env tests:

- production missing fails;
- exact one origin passes;
- multiple origins pass;
- trim/deduplicate passes;
- max `10` passes;
- `11` origins fail;
- wildcard fails;
- credentials/query/fragment fail;
- HTTP production fails;
- localhost development/test HTTP passes.

Public CORS middleware tests:

- allowed GET emits exact `Access-Control-Allow-Origin`;
- allowed GET emits `Vary: Origin`;
- allowed GET omits credentials;
- untrusted GET emits no `Access-Control-Allow-Origin`;
- allowed OPTIONS returns `204`;
- untrusted OPTIONS returns `403 CORS_ORIGIN_FORBIDDEN`;
- admin/auth routes have no new CORS headers;
- no wildcard;
- no origin reflection.

Readiness tests:

- DB probe success returns `200`;
- DB probe failure returns `503`;
- response is safe;
- raw error absent;
- health remains DB-free;
- readiness does not call Storage;
- app injection works;
- server wiring passes fake and real-probe type checks.

Regression tests:

- all current 305 backend tests remain passing;
- B4 auth/session security remains;
- B5/B6 admin behavior remains;
- B7 images and cleanup remain;
- schema, migrations, seed data, frontend, assets, package files remain unchanged.

## 18. Ordered implementation tasks

### Task 1: Runtime/migration/test database env split

**Files:**

- Modify: `backend/src/config/database-env.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/cli/admin-bootstrap.command.ts`
- Modify: `backend/src/cli/user-create.command.ts`
- Modify: `backend/src/cli/user-set-password.command.ts`
- Modify: `backend/src/cli/storage-cleanup.command.ts`
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/tests/database-env.test.ts`
- Modify: `backend/tests/integration/test-database.ts`
- Modify: DB-consuming integration tests only where parser types require it
- Test: `backend/tests/database-env.test.ts`
- Test: `backend/tests/server.test.ts`
- Test: `backend/tests/cli.admin-bootstrap.test.ts`
- Test: `backend/tests/cli.user-create.test.ts`
- Test: `backend/tests/cli.user-set-password.test.ts`
- Test: `backend/tests/seed.test.ts`

**Interfaces consumed:**

- Existing `DatabaseUrlParts`
- Existing `createPrismaClient({ databaseUrl })`
- Existing CLI repository factories

**Interfaces produced:**

- `RuntimeDatabaseEnv`
- `MigrationDatabaseEnv`
- `TestDatabaseEnv`
- `parseRuntimeDatabaseEnv(input)`
- `parseMigrationDatabaseEnv(input)`
- `parseTestDatabaseEnv(input)`
- `assertRuntimeDatabaseUrl(env)`
- `assertMigrationDatabaseUrl(env, nodeEnv)`
- `assertTestDatabaseUrl(env)`

**Behavioral contract:**

- server startup and runtime CLI commands require only `DATABASE_URL`;
- migration parser requires `DATABASE_URL` and `SHADOW_DATABASE_URL`;
- test parser requires only `TEST_DATABASE_URL`;
- tests cannot write through `DATABASE_URL`;
- seed data and `seedWeb00Catalog()` behavior remain unchanged;
- no raw database URL values appear in thrown error strings.

**Strict TDD RED:**

- [ ] Add failing tests showing `parseRuntimeDatabaseEnv({ DATABASE_URL })` passes without shadow/test.
- [ ] Add failing tests showing `parseMigrationDatabaseEnv({ DATABASE_URL, SHADOW_DATABASE_URL })` passes without test.
- [ ] Add failing tests showing `parseTestDatabaseEnv({ TEST_DATABASE_URL })` passes without runtime/shadow.
- [ ] Add failing tests showing server `main()` and CLI repository creation do not inspect `TEST_DATABASE_URL` or `SHADOW_DATABASE_URL`.

Exact RED command from `D:\WEB00_BACKEND\backend`:

```powershell
& $PortableNpm exec vitest run tests/database-env.test.ts tests/server.test.ts tests/cli.admin-bootstrap.test.ts tests/cli.user-create.test.ts tests/cli.user-set-password.test.ts tests/seed.test.ts
```

Expected RED:

- new parser names are missing;
- server/CLI tests fail because current code calls `parseDatabaseEnv()`;
- no DB write occurs in parser-only tests.

**Minimal GREEN:**

- implement the three parser entrypoints by reusing existing URL parser helpers;
- keep safe validation errors with variable names only;
- update `server.ts` `StartServerOptions.databaseEnv` to `RuntimeDatabaseEnv`;
- update runtime CLI repository creation to use `parseRuntimeDatabaseEnv()`;
- update `backend/prisma/seed.ts` to parse `RuntimeDatabaseEnv` for the one-time seed entrypoint while keeping the seed data implementation unchanged;
- update integration helpers to use `parseTestDatabaseEnv()`.

Exact GREEN command:

```powershell
& $PortableNpm exec vitest run tests/database-env.test.ts tests/server.test.ts tests/cli.admin-bootstrap.test.ts tests/cli.user-create.test.ts tests/cli.user-set-password.test.ts tests/seed.test.ts
```

Related regression commands:

```powershell
& $PortableNpm exec vitest run tests/integration/test-database.ts tests/integration/public-catalog-api.test.ts tests/integration/auth-api.test.ts tests/integration/admin-api.test.ts tests/integration/admin-users-api.test.ts tests/integration/admin-site-images-api.test.ts
git diff --name-only -- backend/prisma/schema.prisma backend/prisma/migrations backend/prisma/seed-data
git diff --name-only -- backend/package.json backend/package-lock.json
```

**PASS criteria:**

- runtime parser requires only `DATABASE_URL`;
- migration parser does not require `TEST_DATABASE_URL`;
- test parser does not require `DATABASE_URL` or `SHADOW_DATABASE_URL`;
- integration write helpers use `TEST_DATABASE_URL`;
- schema, migrations, seed data, and package files are unchanged.

**Rollback boundary:**

- revert `backend/src/config/database-env.ts`, changed runtime consumers, and database env tests as one unit.

**Out-of-scope:**

- changing Prisma schema;
- changing migrations;
- changing seed snapshot data;
- adding package dependencies;
- adding production database markers through external config.

### Task 2: Production AUTH_ORIGIN hard gate

**Files:**

- Modify: `backend/src/config/auth-env.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/modules/auth/auth-origin.ts` only if type compatibility requires it
- Modify: `backend/tests/auth-env.test.ts`
- Modify: `backend/tests/auth.origin.test.ts`
- Modify: `backend/tests/integration/auth-api.test.ts`

**Interfaces consumed:**

- `NodeEnvironment` from `backend/src/config/env.ts`
- Existing `AuthEnv`
- Existing `createOriginGuard({ authOrigin, nodeEnv })`

**Interfaces produced:**

- `AuthEnvParseOptions`
- `parseAuthEnv(input, { nodeEnv })`

**Behavioral contract:**

- production parser requires exact HTTPS `AUTH_ORIGIN`;
- development/test parser keeps missing and localhost HTTP compatibility;
- route guard remains exact comparison;
- missing or invalid production origin fails before `startServer()`.

**Strict TDD RED:**

- [ ] Add failing parser tests for production missing, HTTP, wildcard, credentials, query, fragment, non-root path.
- [ ] Add failing parser test for trailing slash normalization.
- [ ] Add failing server composition test proving `parseAuthEnv()` receives parsed `NODE_ENV`.
- [ ] Add route guard regression tests for exact comparison.

Exact RED command:

```powershell
& $PortableNpm exec vitest run tests/auth-env.test.ts tests/auth.origin.test.ts tests/integration/auth-api.test.ts tests/server.test.ts
```

Expected RED:

- production missing currently passes parser;
- production HTTP currently passes parser;
- `parseAuthEnv()` signature lacks `nodeEnv`.

**Minimal GREEN:**

- add `AuthEnvParseOptions`;
- parse auth origin with node env awareness;
- normalize `https://example.test/` to `https://example.test`;
- reject wildcard, credentials, query, fragment, and non-root path;
- update `server.ts` to call `parseAuthEnv(process.env, { nodeEnv: env.NODE_ENV })`;
- preserve existing auth route guard semantics.

Exact GREEN command:

```powershell
& $PortableNpm exec vitest run tests/auth-env.test.ts tests/auth.origin.test.ts tests/integration/auth-api.test.ts tests/server.test.ts
```

Related regression commands:

```powershell
& $PortableNpm exec vitest run tests/auth.cookie.test.ts tests/auth.cache-control.test.ts tests/auth.middleware.test.ts tests/auth.service.test.ts tests/integration/auth-session-invalidation.test.ts
```

**PASS criteria:**

- production `AUTH_ORIGIN` missing or invalid fails startup parsing;
- production exact HTTPS passes;
- development/test localhost HTTP remains usable;
- auth/admin CORS behavior is not expanded.

**Rollback boundary:**

- revert auth env parser, server callsite, and auth origin tests.

**Out-of-scope:**

- OAuth/OIDC;
- frontend token storage;
- cookie policy changes;
- admin route CORS.

### Task 3: PUBLIC_CORS_ORIGINS parser and typed policy

**Files:**

- Create: `backend/src/config/public-cors-env.ts`
- Create: `backend/tests/public-cors-env.test.ts`
- Modify: `backend/tests/setup.ts`

**Interfaces consumed:**

- `NodeEnvironment` from `backend/src/config/env.ts`

**Interfaces produced:**

- `PublicCorsEnv`
- `PublicCorsConfig`
- `PublicCorsEnvParseOptions`
- `parsePublicCorsEnv(input, { nodeEnv })`
- `toPublicCorsConfig(env)`

**Behavioral contract:**

- production requires one to ten exact HTTPS origins;
- development/test allow empty list and localhost HTTP;
- wildcard and unsafe URL components are rejected;
- errors expose variable names only.

**Strict TDD RED:**

- [ ] Add failing parser tests for production missing, one origin, multiple origins, trim/deduplicate, max ten, eleven rejected.
- [ ] Add failing parser tests for wildcard, credentials, query, fragment, HTTP production, localhost development.
- [ ] Add test setup restoration for `PUBLIC_CORS_ORIGINS`.

Exact RED command:

```powershell
& $PortableNpm exec vitest run tests/public-cors-env.test.ts
```

Expected RED:

- `public-cors-env.ts` does not exist;
- test setup does not preserve `PUBLIC_CORS_ORIGINS`.

**Minimal GREEN:**

- implement parser with `URL`;
- normalize to `url.origin`;
- enforce production HTTPS;
- add `PUBLIC_CORS_ORIGINS` to `tests/setup.ts` mutable env keys;
- convert env to `ReadonlySet` config.

Exact GREEN command:

```powershell
& $PortableNpm exec vitest run tests/public-cors-env.test.ts
```

Related regression commands:

```powershell
& $PortableNpm exec vitest run tests/env.test.ts tests/auth-env.test.ts tests/image-env.test.ts tests/database-env.test.ts
```

**PASS criteria:**

- parser covers every section 9 rule;
- no raw origin values appear in validation error strings;
- no new dependency appears in package files.

**Rollback boundary:**

- remove `public-cors-env.ts`, its tests, and the `tests/setup.ts` env key.

**Out-of-scope:**

- route middleware;
- auth/admin CORS;
- credentials;
- frontend changes.

### Task 4: Public catalog CORS middleware and OPTIONS behavior

**Files:**

- Create: `backend/src/modules/public-catalog/public-cors.middleware.ts`
- Create: `backend/tests/public-cors.middleware.test.ts`
- Modify: `backend/src/modules/public-catalog/public-catalog.routes.ts`
- Modify: `backend/tests/public-catalog.routes.test.ts`
- Modify: `backend/tests/integration/public-catalog-api.test.ts` only for CORS route assertions
- Modify: `backend/src/lib/errors.ts` only if `AppError` is used for `CORS_ORIGIN_FORBIDDEN`

**Interfaces consumed:**

- `PublicCorsConfig`
- existing `PublicCatalogService`
- existing request id middleware and error handler

**Interfaces produced:**

- `createPublicCatalogCorsMiddleware(config: PublicCorsConfig): RequestHandler`
- `createPublicCatalogPreflightHandler(config: PublicCorsConfig): RequestHandler`

**Behavioral contract:**

- CORS middleware runs only inside public catalog router;
- allowed GET emits exact `Access-Control-Allow-Origin`;
- allowed GET emits `Vary: Origin`;
- no credentials header;
- untrusted GET emits no allow-origin header;
- allowed OPTIONS returns `204`;
- untrusted OPTIONS returns `403 CORS_ORIGIN_FORBIDDEN`;
- auth/admin routes are untouched;
- no wildcard;
- no reflection without allowlist match.

**Strict TDD RED:**

- [ ] Add failing middleware tests for allowed GET, untrusted GET, allowed OPTIONS, untrusted OPTIONS.
- [ ] Add failing app-level tests proving `/api/auth/*` and `/api/admin/*` do not receive public CORS headers.
- [ ] Add failing route tests preserving `/sites/popular` before `/:slug`.

Exact RED command:

```powershell
& $PortableNpm exec vitest run tests/public-cors.middleware.test.ts tests/public-catalog.routes.test.ts tests/server.test.ts
```

Expected RED:

- middleware file does not exist;
- router does not accept CORS config;
- OPTIONS route does not exist.

**Minimal GREEN:**

- implement origin lookup through `PublicCorsConfig.allowedOrigins`;
- set `Vary: Origin` for trusted origins;
- set `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`;
- set no credentials header;
- add OPTIONS handlers for exact catalog paths;
- keep GET route order unchanged;
- use `response.status(403).json(...)` or `AppError` with `CORS_ORIGIN_FORBIDDEN`.

Exact GREEN command:

```powershell
& $PortableNpm exec vitest run tests/public-cors.middleware.test.ts tests/public-catalog.routes.test.ts tests/server.test.ts
```

Related regression commands:

```powershell
& $PortableNpm exec vitest run tests/integration/public-catalog-api.test.ts tests/integration/auth-api.test.ts tests/integration/admin-api.test.ts
```

**PASS criteria:**

- CORS applies only to five public catalog GET routes plus safe HEAD/OPTIONS behavior;
- auth/admin routes have no new CORS headers;
- no wildcard and no credentials;
- public catalog data behavior is unchanged.

**Rollback boundary:**

- remove middleware and route CORS changes without touching service, repository, mapper, or schemas.

**Out-of-scope:**

- credentials CORS;
- Authorization header exposure;
- private endpoint CORS;
- frontend adapter work.

### Task 5: Database readiness service and /api/ready

**Files:**

- Create: `backend/src/modules/readiness/readiness.types.ts`
- Create: `backend/src/modules/readiness/readiness.service.ts`
- Create: `backend/src/modules/readiness/readiness.routes.ts`
- Create: `backend/tests/readiness.test.ts`
- Modify: `backend/tests/health.test.ts`

**Interfaces consumed:**

- Prisma client `$queryRaw` capability
- Express Router

**Interfaces produced:**

- `ReadinessProbe`
- `ReadinessService`
- `ReadinessResponse`
- `createReadinessService({ probe })`
- `createPrismaReadinessProbe(prisma)`
- `createReadinessRouter({ service })`

**Behavioral contract:**

- DB probe success returns `200 { "status": "ready" }`;
- DB probe failure returns `503 { "status": "not_ready" }`;
- raw error and stack are absent;
- no Storage call;
- no auth;
- no write;
- no migration.

**Strict TDD RED:**

- [ ] Add failing service tests for probe success and probe failure.
- [ ] Add failing route tests for `200` and `503`.
- [ ] Add failing safety tests proving raw error text is absent.
- [ ] Add failing health regression proving health does not call readiness or DB.

Exact RED command:

```powershell
& $PortableNpm exec vitest run tests/readiness.test.ts tests/health.test.ts
```

Expected RED:

- readiness module does not exist;
- health tests fail only where new readiness assertions reference missing injection.

**Minimal GREEN:**

- add types;
- implement `createReadinessService`;
- implement `createReadinessRouter`;
- implement Prisma probe with `SELECT 1`;
- add no Storage dependencies.

Exact GREEN command:

```powershell
& $PortableNpm exec vitest run tests/readiness.test.ts tests/health.test.ts
```

Related regression commands:

```powershell
& $PortableNpm exec vitest run tests/errors.test.ts tests/request-id.test.ts tests/server.test.ts
```

**PASS criteria:**

- `/api/ready` response shape is exact;
- health remains DB-free and unchanged;
- readiness dependency is injectable;
- raw errors are absent.

**Rollback boundary:**

- remove readiness module and readiness tests only.

**Out-of-scope:**

- Storage readiness probe;
- migration status endpoint;
- auth gate;
- detailed diagnostics output.

### Task 6: Server/app composition integration

**Files:**

- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/tests/server.test.ts`
- Modify: `backend/tests/health.test.ts`
- Modify: `backend/tests/readiness.test.ts`
- Modify: `backend/tests/public-cors.middleware.test.ts`

**Interfaces consumed:**

- `RuntimeDatabaseEnv`
- `AuthEnv`
- `PublicCorsConfig`
- `StorageConfig`
- `ReadinessService`
- `ReadinessProbe`
- existing admin/auth/public catalog routers

**Interfaces produced:**

- updated `CreateAppOptions` with `publicCorsConfig?` and `readinessService?`;
- updated `StartServerOptions` with runtime DB env and public CORS config;
- production `main()` parse order: app env, runtime DB env, auth env with `NODE_ENV`, public CORS env with `NODE_ENV`, storage env.

**Behavioral contract:**

- `app.ts` remains free of `process.env`;
- `/api/health` mounts before public catalog, auth, and admin;
- `/api/ready` mounts before final 404 and is public;
- public CORS is passed only to public catalog router;
- `server.ts` wires real Prisma readiness probe;
- storage cleanup worker behavior remains unchanged.

**Strict TDD RED:**

- [ ] Add failing source-boundary test proving `app.ts` has no `process.env` and imports readiness only through injected options.
- [ ] Add failing test proving server startup options consume `RuntimeDatabaseEnv`.
- [ ] Add failing test proving `main()` no longer parses test/shadow env for runtime.
- [ ] Add failing route order test for health, ready, public catalog, auth, admin.

Exact RED command:

```powershell
& $PortableNpm exec vitest run tests/server.test.ts tests/health.test.ts tests/readiness.test.ts tests/public-cors.middleware.test.ts
```

Expected RED:

- `CreateAppOptions` lacks readiness and public CORS config;
- `server.ts` still uses combined database env;
- app has no ready route.

**Minimal GREEN:**

- update `CreateAppOptions`;
- mount readiness route when `readinessService` is provided;
- pass `publicCorsConfig` to `createPublicCatalogRouter`;
- wire `createReadinessService({ probe: createPrismaReadinessProbe(prisma) })` in `server.ts`;
- parse public CORS env in `main()`;
- keep storage worker lifecycle unchanged.

Exact GREEN command:

```powershell
& $PortableNpm exec vitest run tests/server.test.ts tests/health.test.ts tests/readiness.test.ts tests/public-cors.middleware.test.ts
```

Related regression commands:

```powershell
& $PortableNpm exec vitest run tests/integration/public-catalog-api.test.ts tests/integration/auth-api.test.ts tests/integration/admin-api.test.ts tests/integration/admin-users-api.test.ts tests/integration/admin-site-images-api.test.ts
```

**PASS criteria:**

- `app.ts` does not read process env;
- `server.ts` does not parse `TEST_DATABASE_URL` or `SHADOW_DATABASE_URL` for runtime startup;
- `/api/ready` is wired in production;
- health, auth, admin, catalog, image behavior remain intact.

**Rollback boundary:**

- revert `app.ts`, `server.ts`, and composition tests.

**Out-of-scope:**

- starting a dev server;
- making a deploy;
- changing route names.

### Task 7: .env.example and production operational contract

**Files:**

- Modify: `backend/.env.example`
- Modify: `backend/README.md`
- Modify: `backend/tests/prisma-toolchain.test.ts` only for safe env example assertions
- Modify: `backend/tests/cli.production-scripts.test.ts` only for operational command documentation assertions if needed

**Interfaces consumed:**

- env matrix from section 12
- package scripts already present

**Interfaces produced:**

- documented runtime env split;
- documented migration env ownership;
- documented test-only env ownership;
- documented Render Free initial launch model;
- documented trusted-machine command sequence.

**Behavioral contract:**

- no real values in docs;
- no secrets printed;
- `.env.example` remains safe placeholders only;
- Render Build Command and Start Command are documented exactly;
- no automatic migration, seed, Storage bootstrap, or admin bootstrap is added to package scripts.

**Strict TDD RED:**

- [ ] Add failing safe assertion that `.env.example` includes `PUBLIC_CORS_ORIGINS=`.
- [ ] Add failing safe assertion that runtime docs separate `DATABASE_URL` from test/shadow variables.
- [ ] Add failing assertion that package scripts still do not include migration/seed/bootstrap in `start`.

Exact RED command:

```powershell
& $PortableNpm exec vitest run tests/prisma-toolchain.test.ts tests/cli.production-scripts.test.ts
```

Expected RED:

- `.env.example` lacks `PUBLIC_CORS_ORIGINS`;
- docs may not yet describe Render Free model.

**Minimal GREEN:**

- update `.env.example` with placeholders only;
- update README with Render service fields, trusted-machine steps, and limitations;
- keep package scripts unchanged.

Exact GREEN command:

```powershell
& $PortableNpm exec vitest run tests/prisma-toolchain.test.ts tests/cli.production-scripts.test.ts
```

Related regression commands:

```powershell
git diff --name-only -- backend/package.json backend/package-lock.json
git diff --name-only -- backend/prisma/schema.prisma backend/prisma/migrations backend/prisma/seed-data
```

**PASS criteria:**

- `PUBLIC_CORS_ORIGINS` documented safely;
- runtime/migration/test env split documented;
- Render Free limitations documented;
- package files unchanged.

**Rollback boundary:**

- revert `.env.example`, README, and related assertions only.

**Out-of-scope:**

- real secret values;
- Render dashboard edits;
- Supabase project creation;
- package script changes.

### Task 8: Focused integration/regression tests

**Files:**

- Modify: `backend/tests/integration/public-catalog-api.test.ts`
- Modify: `backend/tests/integration/auth-api.test.ts`
- Modify: `backend/tests/integration/admin-api.test.ts`
- Modify: `backend/tests/integration/admin-users-api.test.ts`
- Modify: `backend/tests/integration/admin-site-images-api.test.ts`
- Modify: `backend/tests/repository-boundary.test.ts` only if new docs/config expectations require it
- Modify: focused unit tests from Tasks 1-7 as needed

**Interfaces consumed:**

- all interfaces produced by Tasks 1-7

**Interfaces produced:**

- regression evidence that current 305 backend tests plus new production-hardening tests pass.

**Behavioral contract:**

- B4 auth/session security remains;
- B5/B6 admin behavior remains;
- B7 image and cleanup behavior remains;
- public catalog visibility and projection remain;
- integration writes use only `TEST_DATABASE_URL`;
- no package/schema/migration/seed data/frontend/asset changes.

**Strict TDD RED:**

- [ ] Add missing regression assertions before implementation where a behavior lacks coverage.
- [ ] Run focused integration tests and record failures caused by missing new wiring only.

Exact RED command:

```powershell
& $PortableNpm exec vitest run tests/integration/public-catalog-api.test.ts tests/integration/auth-api.test.ts tests/integration/admin-api.test.ts tests/integration/admin-users-api.test.ts tests/integration/admin-site-images-api.test.ts
```

Expected RED:

- only new assertions fail before their implementation task is complete;
- existing assertions should not regress.

**Minimal GREEN:**

- update tests to consume split test env parser;
- add CORS assertions on public catalog integration only;
- add readiness app integration assertions using fake probe;
- keep auth/admin/image expectations unchanged.

Exact GREEN command:

```powershell
& $PortableNpm exec vitest run tests/integration/public-catalog-api.test.ts tests/integration/auth-api.test.ts tests/integration/admin-api.test.ts tests/integration/admin-users-api.test.ts tests/integration/admin-site-images-api.test.ts
```

Related regression commands:

```powershell
& $PortableNpm run test:run
git diff --name-only -- backend/prisma/schema.prisma backend/prisma/migrations backend/prisma/seed-data
git diff --name-only -- backend/package.json backend/package-lock.json
git diff --name-only -- assets
git diff --name-only -- "*.html"
```

**PASS criteria:**

- all existing tests plus new tests pass;
- no weakened repository boundary;
- no backend package or database schema drift.

**Rollback boundary:**

- revert only focused test changes that belong to this hardening plan.

**Out-of-scope:**

- broad test rewrite;
- parallelizing DB integration tests;
- weakening DB guard tests.

### Task 9: Full production-hardening checkpoint

**Files:**

- No new source files beyond Tasks 1-8
- No package files
- No schema/migration/seed data files
- No frontend files
- No assets

**Interfaces consumed:**

- all final interfaces from Tasks 1-8

**Interfaces produced:**

- verified production-hardening implementation ready for owner review.

**Behavioral contract:**

- runtime server requires only `DATABASE_URL`;
- migration tooling uses `DATABASE_URL` and current required `SHADOW_DATABASE_URL`;
- tests use only `TEST_DATABASE_URL` for writes;
- production `AUTH_ORIGIN` is required;
- production `PUBLIC_CORS_ORIGINS` is required;
- CORS is scoped to public catalog;
- readiness probes DB;
- health remains DB-free;
- Storage remains fail-fast;
- no automatic migration or seed in Start Command.

**Strict TDD RED:**

- [ ] Re-run any focused command that failed during Tasks 1-8 before declaring the task complete.
- [ ] Confirm no new failure is accepted without a matching code or test fix inside the approved file map.

Exact RED recheck command when a focused failure remains:

```powershell
& $PortableNpm run test:run
```

Expected RED:

- no RED state is accepted at checkpoint; any failure blocks completion.

**Minimal GREEN:**

- run the full verification checklist in section 19;
- inspect git diff for prohibited files;
- document any remaining owner decision as a blocker instead of shipping around it.

Exact GREEN command:

```powershell
& $PortableNpm run check
```

Related regression commands:

```powershell
& $PortableNpm audit --omit=dev --audit-level=high
& $PortableNpm audit --audit-level=high
git diff --name-only -- backend/prisma/schema.prisma backend/prisma/migrations backend/prisma/seed-data
git diff --name-only -- backend/package.json backend/package-lock.json
git diff --name-only -- assets
git diff --name-only -- "*.html"
```

**PASS criteria:**

- full verification in section 19 passes or blocks with exact evidence;
- critical/high audit count is `0`;
- accepted Prisma moderate advisories are documented if still present;
- package files unchanged;
- schema/migrations/seed data unchanged;
- frontend/assets unchanged.

**Rollback boundary:**

- if checkpoint fails because of hardening changes, revert the smallest task boundary that introduced the failure.

**Out-of-scope:**

- commit inside tasks;
- push;
- PR;
- deploy;
- Render/Supabase writes.

## 19. Final verification checkpoint

Future implementation verification from a clean checkout:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$env:PATH = "$PortableRoot;$env:PATH"

Set-Location D:\WEB00_BACKEND\backend

& $PortableNpm ci
& $PortableNpm run prisma:validate
& $PortableNpm run prisma:generate
& $PortableNpm run db:migrate:status
& $PortableNpm run seed:verify
& $PortableNpm run test:run
& $PortableNpm run typecheck
& $PortableNpm run build
& $PortableNpm run check
& $PortableNpm audit --omit=dev --audit-level=high
& $PortableNpm audit --audit-level=high
```

Expected:

- existing 305 tests plus new production-hardening tests pass;
- typecheck passes;
- build passes;
- critical/high audit findings equal `0`;
- accepted Prisma moderate advisories are documented if still present;
- schema, migrations, and seed data unchanged;
- package files unchanged;
- no network writes except npm registry reads/audit reads from explicitly listed verification commands;
- no deploy.

Final git scope checks after future implementation:

```powershell
Set-Location D:\WEB00_BACKEND

git diff --check
git diff --name-only -- backend/prisma/schema.prisma backend/prisma/migrations backend/prisma/seed-data
git diff --name-only -- assets
git diff --name-only -- "*.html"
git diff --name-only -- .github
git diff --name-only -- "*package*.json"
```

Expected:

- package files unchanged;
- schema/migrations/seed data unchanged;
- frontend/assets unchanged;
- workflow files unchanged.

## 20. Acceptance criteria

Implementation acceptance:

- runtime server requires only `DATABASE_URL`;
- `TEST_DATABASE_URL` is never required by server startup;
- `SHADOW_DATABASE_URL` is never required by server startup;
- migration parser requirements match factual Prisma config;
- tests write only through `TEST_DATABASE_URL`;
- production `AUTH_ORIGIN` is required and HTTPS exact-origin only;
- production `PUBLIC_CORS_ORIGINS` is required and exact-origin only;
- wildcard is prohibited everywhere;
- CORS is scoped only to public catalog;
- no auth/admin/private CORS expansion;
- public CORS does not include credentials;
- public CORS does not expose `Authorization`;
- `/api/ready` exists and probes DB;
- `/api/ready` does not probe Storage;
- `/api/ready` does not return raw errors;
- `/api/health` remains DB-free;
- Storage startup fail-fast remains;
- no automatic bucket creation;
- no automatic migration in Start Command;
- no automatic seed in Start Command;
- no Render-specific runtime code;
- Render Free limitations are documented;
- Supabase production model is documented;
- no new dependency;
- package files unchanged;
- schema/migrations/seed data unchanged;
- frontend/assets unchanged;
- no push, PR, merge, or deploy without separate approval.

Current docs-only plan acceptance:

- only `docs/WEB00_BACKEND_PRODUCTION_HARDENING_PLAN.md` is created;
- staged file is exactly that plan file;
- commit is local and docs-only;
- remote branch remains absent;
- working tree is clean after commit.

## 21. Rollback boundary

Future implementation rollback:

- Task 1 rollback reverts database env parser split and parser consumers.
- Task 2 rollback reverts auth env production-origin parser changes.
- Task 3 rollback removes public CORS env parser and tests.
- Task 4 rollback removes public catalog CORS middleware and route changes.
- Task 5 rollback removes readiness module and route.
- Task 6 rollback reverts app/server composition changes.
- Task 7 rollback reverts `.env.example`, README, and safe documentation assertions.
- Task 8 rollback reverts only focused regression test additions.
- Task 9 rollback is not a code rollback; it blocks completion until the failing task boundary is fixed or reverted.

Current docs-only rollback:

```powershell
git restore --staged docs/WEB00_BACKEND_PRODUCTION_HARDENING_PLAN.md
Remove-Item -LiteralPath docs/WEB00_BACKEND_PRODUCTION_HARDENING_PLAN.md
```

Use the current docs-only rollback only before the local docs commit is created. After commit, use a normal revert commit only if the owner requests it.

## 22. Risks, mitigations and blockers

| Risk | Mitigation | Blocks deploy |
| --- | --- | --- |
| Render Free sleeps and has slow first request after sleep | Document honestly; no keep-alive workaround | No for smoke/staging, yes for stable commercial production |
| Render Free cannot run shell, one-off jobs, or pre-deploy commands | Run migration/seed/bootstrap commands from trusted machine | Yes until trusted-machine launch steps complete |
| Production server receives test DB credentials | Split runtime DB parser and Render env matrix | Yes |
| Production auth origin omitted | Production parser hard gate | Yes |
| Public frontend cannot call catalog API safely | Exact-origin public CORS allowlist scoped to catalog | Yes for browser integration |
| CORS accidentally expands auth/admin | Router-scoped middleware and negative tests | Yes |
| Readiness leaks DB error details | Minimal response shape and fake failure tests | Yes |
| Readiness probes Storage and causes false negatives | DB-only readiness contract | Yes if violated |
| Storage env omitted | Preserve storage fail-fast | Yes |
| Bucket missing | Run `npm run storage:bootstrap` from trusted machine | Yes before image endpoints are accepted |
| Seed repeated in production routine | Document one-time empty-DB seed only; never add seed to Start Command | Yes if routine seed is proposed |
| Prisma moderate audit advisory remains | Document accepted moderate separately; high/critical remains blocking | High/critical yes |
| Direct IPv6 unavailable from Render | Use Supabase session pooler from Connect UI | Yes until connection is verified |
| Secret leakage through docs/logs/tests | Variable-name-only errors and no real env reads | Yes |

Known future blockers if encountered:

- production launch needs a schema or migration change;
- production launch needs a new package dependency;
- production launch needs a seed data edit;
- Prisma config changes so `SHADOW_DATABASE_URL` is no longer factually required but tests still assume it;
- Supabase project is not isolated from other backends;
- trusted-machine access to production DB/Storage is unavailable.

## 23. Future deployment handoff

After future implementation passes section 19 and owner accepts the hardening branch, the deployment handoff is:

1. Create separate WEB00 Supabase project.
2. Configure Supabase PostgreSQL and Storage.
3. Copy production secrets only into trusted local env and Render env, never into Git/chat/screenshots.
4. Use Supabase Connect UI connection string; prefer session pooler for persistent Render backend when direct IPv6 is unavailable.
5. From trusted machine, run:

```powershell
Set-Location D:\WEB00_BACKEND\backend

& $PortableNpm ci
& $PortableNpm run prisma:generate
& $PortableNpm run db:migrate:deploy
& $PortableNpm run seed
& $PortableNpm run storage:bootstrap
& $PortableNpm run admin:bootstrap
```

6. Configure Render:

```text
Root Directory: backend
Build Command: npm ci && npm run prisma:generate && npm run build
Start Command: npm run start
Health Check Path: /api/ready
NODE_ENV: production
```

7. Deploy only after owner approval.
8. Smoke test `/api/ready`, `/api/health`, public catalog routes, auth login/refresh/logout, admin endpoints, and B7 image endpoints.
9. Treat Render Free as first public smoke/staging; move to paid Render or Docker operations for stable commercial production.
