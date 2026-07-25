# WEB00 Backend B2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add the WEB00 backend database foundation, Prisma 7 PostgreSQL toolchain, legacy catalog snapshot, idempotent seed, and PostgreSQL integration tests without adding public API, auth, admin UI, storage upload, frontend integration, or deploy work.

**Architecture:** B2 extends the committed B1 backend scaffold inside `backend/` only. Prisma CLI configuration lives beside `backend/package.json`, runtime database access is isolated behind a PrismaPg adapter module, and seed/runtime code reads only backend-owned files while a local verifier compares the backend snapshot against the trusted legacy source in `assets/js/data.js`.

**Tech Stack:** Node.js `22.23.1`, TypeScript `5.9.x`, Express 5, Vitest 3, Prisma ORM `7.x`, PostgreSQL, `@prisma/client`, `@prisma/adapter-pg`, `pg`, and `dotenv`. B2 local implementation uses local PostgreSQL only; Supabase PostgreSQL remains future staging/production infrastructure.

## Global Constraints

- Work from `D:\WEB00_BACKEND` on branch `feat/web00-backend-b2`.
- B2 starts from commit `a91bb358304f0c80c744660c73cdb300d8d46e43`.
- All implementation files must stay under `backend/`.
- This plan file is the only file created during the planning task.
- Root `package.json` must remain absent.
- Frontend files, docs other than this B2 plan, and GitHub workflows must not change during B2 implementation.
- Do not add public catalog API, authentication, JWT, roles enforcement, admin CRUD, uploads, Supabase Storage operations, admin UI, frontend adapter, Redis, Docker, Render deploy, requests/status/support/bug-report features, or GitHub Pages changes in B2.
- Prisma code, migrations, seed scripts, database connections, dependencies, and package scripts are future implementation work and are not created by this plan task.
- All npm commands in future implementation must run from `D:\WEB00_BACKEND\backend` through `D:\WEB00_TOOLS\node-v22.23.1-win-x64\npm.cmd`.
- Do not use bare `node`, `npm`, or `npx` in future B2 implementation commands.
- Do not commit generated Prisma Client, `backend/dist`, `backend/node_modules`, `backend/coverage`, `backend/.env`, local database dumps, or npm cache.
- All relative imports inside backend TypeScript source must use the future emitted `.js` extension under NodeNext ESM.
- Prisma Client must be generated before typecheck, build, and test commands.
- Plain `new PrismaClient()` without `PrismaPg` adapter is forbidden.
- Real database URLs and credentials never enter Git.

---

## 1. Goal

B2 prepares the database layer for later backend phases:

- install the approved Prisma/PostgreSQL dependencies in `backend/package.json`;
- add Prisma 7 configuration and PostgreSQL schema;
- add an initial PostgreSQL-only SQL migration;
- generate Prisma Client to `backend/src/generated/prisma`;
- add a database client module that constructs Prisma Client through `PrismaPg`;
- add a legacy catalog snapshot at `backend/prisma/seed-data/web00-catalog.json`;
- add safe local snapshot builder/verifier tooling;
- add idempotent seed behavior for exactly 7 categories and 15 sites;
- add PostgreSQL integration tests for schema, migrations, constraints, seed, snapshot safety, adapter use, and database isolation;
- preserve all 27 B1 tests.

B2 is successful only when database tooling is ready and verified. No application API endpoint consumes the catalog database in B2.

## 2. Preconditions

Before any B2 implementation begins:

- current branch is `feat/web00-backend-b2`;
- `git log -1 --format="%H %s"` is `a91bb358304f0c80c744660c73cdb300d8d46e43 feat: add WEB00 backend B1 scaffold`;
- `git status --short` shows only the future B2 plan file if it is not committed yet, or is clean after an approved plan commit;
- staged files are empty;
- `backend/` exists from B1;
- `backend/.gitignore` excludes `node_modules/`, `dist/`, `coverage/`, `.env`, `.env.*`, includes `!.env.example`, and must be extended in B2 to exclude `src/generated/prisma/`;
- `backend/package.json` contains only B1 dependencies before Task 1;
- `backend/.env` is absent;
- root `package.json` is absent;
- PostgreSQL development, shadow, and test databases are provisioned separately before any migration or integration test command is run;
- if `SHADOW_DATABASE_URL` is missing or points to the same database as `DATABASE_URL`, implementation is blocked before migration work;
- if `TEST_DATABASE_URL` is missing or points to production/runtime/shadow database, integration tests are blocked before any database mutation.

## 3. Scope

B2 includes:

- Prisma ORM `7.x` toolchain;
- PostgreSQL database schema for `User`, `RefreshSession`, `Category`, `Site`, `AuditLog`, and `StorageCleanupJob`;
- PostgreSQL-only initial SQL migration;
- Prisma config at `backend/prisma.config.ts`;
- runtime Prisma Client module using `PrismaPg`;
- strict database URL parsing and guard helpers;
- safe `.env.example` placeholders for database variables;
- generated Prisma Client output path contract;
- local snapshot builder and verifier for current WEB00 catalog data;
- `backend/prisma/seed-data/web00-catalog.json` snapshot;
- idempotent seed script with conflict reporting;
- PostgreSQL integration tests;
- README notes for database setup and safety commands;
- B1 checkpoint preservation.

## 4. Explicit Out-Of-Scope

B2 does not include:

- public catalog API;
- authentication implementation;
- JWT;
- refresh cookie behavior beyond schema fields;
- admin CRUD;
- image upload implementation;
- Supabase Storage writes, buckets, policies, or cleanup processor;
- admin UI;
- frontend API adapter;
- Render deployment;
- Docker;
- Redis;
- lead requests, status tracking, support messages, or bug reports;
- analytics or automatic view counting;
- production seed execution against live data;
- any commit, push, pull request, merge, or deploy unless separately approved after B2 implementation review.

## 5. Architecture Decisions

- B2 keeps the B1 Express app boundary intact. `backend/src/app.ts` continues to accept `CreateAppOptions` and must not read `process.env`.
- Database URL parsing and database guards live outside `app.ts` so app construction remains testable without a database.
- `backend/src/server.ts` may continue reading B1 environment through `parseEnv(process.env)`, but B2 must not connect to the database during server startup until a later phase wires real routes.
- Runtime database construction is explicit: the caller passes `DATABASE_URL` into `createPrismaClient({ databaseUrl, logger })`.
- Prisma CLI reads migration URL through `backend/prisma.config.ts`; runtime Prisma Client receives `DATABASE_URL` through `PrismaPg`.
- `PrismaPg` is the only allowed adapter for Prisma Client. A direct `new PrismaClient()` call is a review failure.
- Generated Prisma Client output is `backend/src/generated/prisma`; it is generated locally and ignored by Git.
- SQL check constraints are used for enum-like fields instead of PostgreSQL enum types. This keeps Prisma model fields simple strings while enforcing database-level values for `role`, `status`, `demoMode`, `entityType`, and storage cleanup status.
- UUID primary keys use PostgreSQL `uuid` columns and database defaults through `gen_random_uuid()`. Initial migration enables `pgcrypto`.
- Timestamps use PostgreSQL `timestamptz`; Prisma fields use `@db.Timestamptz(6)`.
- Category deletion with related sites is blocked at the foreign-key level with `ON DELETE RESTRICT`. Cascading site deletion is forbidden.
- Refresh sessions cascade when a user is deleted because refresh sessions have no standalone value after user removal.
- Audit logs keep nullable actor references with `ON DELETE SET NULL`.
- Storage cleanup jobs store generic entity references without Prisma relations because they may point to site, category, upload, or future entities.
- The seed is append-and-compare. It never deletes records and never overwrites changed records silently.
- Snapshot builder uses the TypeScript compiler API to parse trusted `assets/js/data.js` as syntax. It must not use `eval`, `Function`, Node `vm`, browser execution, or dynamic import of the legacy file.
- Production seed reads only `backend/prisma/seed-data/web00-catalog.json` and never reads `../assets/js/data.js`.
- B2 local database work uses one local PostgreSQL server with three isolated databases: `web00_backend_dev`, `web00_backend_shadow`, and `web00_backend_test`.
- Supabase PostgreSQL is not used for B2 `migrate dev` or integration tests. Supabase remains the future staging/production database and is connected by a separate approved task before deploy.
- Runtime pool limits and connection timeouts are explicit `PrismaPg` adapter options. They must not be passed through runtime database URL parameters.
- Database credentials belong to a dedicated Prisma database user, not a broad owner/admin account.

## 6. File Map

Future B2 implementation may create or modify only these paths:

- `backend/package.json`: add approved B2 dependencies, Prisma scripts, seed scripts, and ensure generate runs before typecheck/build/test.
- `backend/package-lock.json`: update through approved portable npm install commands only.
- `backend/.gitignore`: add `src/generated/prisma/`.
- `backend/.env.example`: add safe placeholder names for `DATABASE_URL`, `SHADOW_DATABASE_URL`, and `TEST_DATABASE_URL`.
- `backend/README.md`: add B2 database setup, safety, and checkpoint commands.
- `backend/prisma.config.ts`: Prisma CLI configuration for schema path, migration path, seed command, datasource URL, and shadow datasource URL.
- `backend/prisma/schema.prisma`: Prisma 7 PostgreSQL schema and `prisma-client` generator.
- `backend/prisma/migrations/migration_lock.toml`: Prisma migration history lock file created by Prisma CLI and committed with the initial migration.
- `backend/prisma/migrations/<prisma_generated_timestamp>_init/migration.sql`: initial PostgreSQL-only migration with tables, constraints, indexes, and extension setup.
- `backend/prisma/seed.ts`: seed entrypoint that reads only backend snapshot and runs idempotent seed.
- `backend/prisma/seed-web00-data.ts`: category/site seed implementation and conflict reporting.
- `backend/prisma/seed-data/web00-catalog.json`: legacy catalog snapshot with source metadata, 7 categories, and 15 sites.
- `backend/scripts/build-catalog-snapshot.ts`: local trusted builder from `assets/js/data.js` to snapshot JSON.
- `backend/scripts/verify-catalog-snapshot.ts`: local verifier comparing snapshot metadata, shape, counts, slugs, fields, and images.
- `backend/scripts/check-prisma-format.ts`: safe Prisma format check equivalent if `prisma format --check` is unavailable in Prisma 7 CLI.
- `backend/src/config/database-env.ts`: database URL parsing, isolation checks, and safe validation errors.
- `backend/src/db/prisma.ts`: PrismaPg adapter construction and Prisma Client factory.
- `backend/src/db/prisma-types.ts`: optional narrow exported database helper types if needed by tests.
- `backend/tests/database-env.test.ts`: unit tests for database URL guards and production/test isolation.
- `backend/tests/prisma-adapter.test.ts`: unit test proving the runtime client factory uses PrismaPg and rejects plain PrismaClient construction patterns.
- `backend/tests/snapshot-builder.test.ts`: safe parser and snapshot builder tests.
- `backend/tests/snapshot-verifier.test.ts`: snapshot integrity, duplicate slug, SHA mismatch, missing image tests.
- `backend/tests/seed.test.ts`: seed idempotency and conflict tests using isolated PostgreSQL database.
- `backend/tests/integration/prisma-migration.test.ts`: migration/table/constraint/relation tests using isolated PostgreSQL database.
- `backend/tests/integration/test-database.ts`: test database helper that refuses production URLs and resets only the test schema/database.

Future B2 implementation must not create:

- root `package.json`;
- `prisma/` at repo root;
- `.env`;
- files under `assets/`, frontend root, `docs/` other than this plan unless separately approved, or `.github/`;
- Docker, Render, Redis, storage bucket, or workflow files.

## 7. Dependency Contract

Modify `backend/package.json` only in Task 1.

Add production dependencies:

```json
{
  "@prisma/client": "7.x",
  "@prisma/adapter-pg": "7.x",
  "pg": "^8",
  "dotenv": "^17"
}
```

Add development dependencies:

```json
{
  "prisma": "7.x",
  "@types/pg": "^8"
}
```

Keep B1 dependencies:

```json
{
  "express": "^5.2.1",
  "zod": "^4.4.3"
}
```

Keep B1 dev dependencies:

```json
{
  "@types/express": "^5.0.6",
  "@types/node": "^22.20.1",
  "@types/supertest": "^6.0.3",
  "supertest": "^7.2.2",
  "tsx": "^4.23.1",
  "typescript": "~5.9.0",
  "vitest": "^3.2.7"
}
```

No other package may be added unless an implementation review records a concrete B2 requirement that cannot be met with the existing toolchain. Snapshot parsing must use the existing `typescript` compiler API rather than adding a JavaScript parser dependency.

Script contract:

```json
{
  "db:migrate:dev": "prisma migrate dev --schema prisma/schema.prisma",
  "db:migrate:deploy": "prisma migrate deploy --schema prisma/schema.prisma",
  "db:migrate:status": "prisma migrate status --schema prisma/schema.prisma",
  "prisma:validate": "prisma validate --schema prisma/schema.prisma",
  "prisma:format": "prisma format --schema prisma/schema.prisma",
  "prisma:format:check": "tsx scripts/check-prisma-format.ts",
  "prisma:generate": "prisma generate --schema prisma/schema.prisma",
  "seed": "tsx prisma/seed.ts",
  "seed:verify": "tsx scripts/verify-catalog-snapshot.ts",
  "seed:build-snapshot": "tsx scripts/build-catalog-snapshot.ts",
  "typecheck": "npm run prisma:generate && tsc -p tsconfig.typecheck.json",
  "test:run": "npm run prisma:generate && vitest run",
  "build": "npm run prisma:generate && tsc -p tsconfig.build.json",
  "check": "npm run prisma:validate && npm run prisma:format:check && npm run prisma:generate && npm run typecheck && npm run test:run && npm run build"
}
```

Lifecycle script restrictions:

- no `postinstall`;
- no script that opens a network connection except approved Prisma migration/seed/test commands using explicit database URLs;
- no script that reads files outside `backend/` except `seed:build-snapshot` and `seed:verify`, which are local development tools only;
- no script that modifies `assets/js/data.js`;
- no script that mutates production database from `migrate dev`, integration tests, or snapshot tools.

## 8. Environment And Database Isolation

Add safe placeholders to `backend/.env.example`:

```text
DATABASE_URL="postgresql://web00_prisma_user:password@localhost:5432/web00_backend_dev?schema=public"
SHADOW_DATABASE_URL="postgresql://web00_prisma_user:password@localhost:5432/web00_backend_shadow?schema=public"
TEST_DATABASE_URL="postgresql://web00_prisma_user:password@localhost:5432/web00_backend_test?schema=public"
```

Placeholder values are safe examples. Real URLs must live only in local `.env`, Render environment variables, or CI secrets.

Environment variable responsibilities:

- `DATABASE_URL`: local `web00_backend_dev` runtime development database.
- `SHADOW_DATABASE_URL`: local `web00_backend_shadow` Prisma migrate dev shadow database only.
- `TEST_DATABASE_URL`: local `web00_backend_test` isolated integration test database only.

Free B2 database environment:

- Use one local PostgreSQL server with three separate databases: `web00_backend_dev`, `web00_backend_shadow`, and `web00_backend_test`.
- `DATABASE_URL` points to `web00_backend_dev`.
- `SHADOW_DATABASE_URL` points to `web00_backend_shadow`.
- `TEST_DATABASE_URL` points to `web00_backend_test`.
- Supabase is not required for local B2 implementation, `migrate dev`, or integration tests.
- Supabase remains a future production/staging database and is connected by a separate approved task before deploy.
- B2 implementation must not start until local PostgreSQL and all three isolated databases are prepared.

Isolation rules:

- `DATABASE_URL`, `SHADOW_DATABASE_URL`, and `TEST_DATABASE_URL` must be syntactically valid PostgreSQL URLs.
- All three URLs must point to distinct database names or distinct hosts.
- `DATABASE_URL` and `SHADOW_DATABASE_URL` must not be equal.
- `TEST_DATABASE_URL` must not equal `DATABASE_URL` or `SHADOW_DATABASE_URL`.
- `TEST_DATABASE_URL` database name must end with `_test` or include `_test_`.
- `SHADOW_DATABASE_URL` database name must end with `_shadow` or include `_shadow_`.
- `DATABASE_URL` must not include `_test` when used by runtime or migration commands.
- `migrate dev` refuses to run when `NODE_ENV=production`.
- `migrate dev` refuses to run if `DATABASE_URL` host or database name matches known production markers supplied through a future allowlist/denylist constant.
- integration tests refuse to run when `TEST_DATABASE_URL` includes production markers, lacks test markers, or equals another database URL.
- production database is never used by integration tests.
- development database is never used as shadow database.
- if no dedicated shadow database exists, B2 implementation stops before migrations.

`backend/src/config/database-env.ts` must export:

```typescript
export interface DatabaseEnv {
  DATABASE_URL: string;
  SHADOW_DATABASE_URL: string;
  TEST_DATABASE_URL: string;
}

export interface DatabaseUrlParts {
  database: string;
  host: string;
  href: string;
  port: string;
  protocol: "postgresql:" | "postgres:";
  schema: string;
}

export class DatabaseEnvValidationError extends Error {
  readonly issues: readonly string[];
}

export function parseDatabaseEnv(input: NodeJS.ProcessEnv): DatabaseEnv;
export function parseDatabaseUrl(value: string, variableName: keyof DatabaseEnv): DatabaseUrlParts;
export function assertDatabaseIsolation(env: DatabaseEnv): void;
export function assertTestDatabaseUrl(env: DatabaseEnv): void;
export function assertMigrationDatabaseUrl(env: DatabaseEnv, nodeEnv: string | undefined): void;
```

Safe error rule: validation errors name only the variable and rule. They never include raw URLs, passwords, usernames, query parameters, or hosts.

## 9. Prisma 7 Contract

Prisma config file:

- path: `backend/prisma.config.ts`;
- located beside `backend/package.json`;
- exact implementation:

```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: env("DATABASE_URL"),
    shadowDatabaseUrl: env("SHADOW_DATABASE_URL")
  }
});
```

- `DATABASE_URL` and `SHADOW_DATABASE_URL` must not be equal;
- config must not hard-code secrets.

Prisma schema generator:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

Datasource block:

```prisma
datasource db {
  provider = "postgresql"
}
```

Generated client contract:

- generated path: `backend/src/generated/prisma`;
- import generated client from relative path with `.js` extension, for example `import { PrismaClient } from "../generated/prisma/client.js";`;
- generated client is never committed;
- `backend/.gitignore` must include `src/generated/prisma/`;
- `prisma generate` runs before `typecheck`, `test:run`, and `build`;
- reviewers must verify generated files are not staged.

Runtime adapter contract:

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export interface CreatePrismaClientOptions {
  databaseUrl: string;
  logQueries?: boolean;
  poolMax?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.databaseUrl,
    max: options.poolMax ?? 5,
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ?? 10_000,
    idleTimeoutMillis:
      options.idleTimeoutMillis ?? 10_000
  });

  return new PrismaClient({
    adapter,
    log: options.logQueries ? ["query", "warn", "error"] : ["warn", "error"]
  });
}
```

Rules:

- `new PrismaClient()` without `adapter` is forbidden;
- Prisma query logs must not include raw SQL in API responses;
- logging configuration must not include database URL values;
- `PrismaPg` receives `connectionString`, `max`, `connectionTimeoutMillis`, and `idleTimeoutMillis`;
- runtime URL parameters for `connection_limit` and `connect_timeout` are forbidden with PrismaPg;
- connection timeout and pool limits are adapter options, not URL query parameters;
- production/staging Supabase connection mode is out-of-scope for B2 and must be approved separately before deploy.

## 10. Database Model

### Prisma Schema

Use this Prisma schema as the implementation target:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id              String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email           String           @unique(map: "users_email_key") @db.Text
  passwordHash    String           @map("password_hash") @db.Text
  role            String           @default("editor") @db.Text
  active          Boolean          @default(true)
  lastLoginAt     DateTime?        @map("last_login_at") @db.Timestamptz(6)
  createdAt       DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  refreshSessions RefreshSession[]
  auditLogs       AuditLog[]

  @@index([active, role], map: "idx_users_active_role")
  @@map("users")
}

model RefreshSession {
  id                  String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId              String            @map("user_id") @db.Uuid
  tokenHash           String            @unique(map: "refresh_sessions_token_hash_key") @map("token_hash") @db.Text
  familyId            String            @map("family_id") @db.Uuid
  replacedBySessionId String?           @unique(map: "refresh_sessions_replaced_by_session_id_key") @map("replaced_by_session_id") @db.Uuid
  revokedAt           DateTime?         @map("revoked_at") @db.Timestamptz(6)
  expiresAt           DateTime          @map("expires_at") @db.Timestamptz(6)
  ipHash              String?           @map("ip_hash") @db.Text
  userAgentHash       String?           @map("user_agent_hash") @db.Text
  createdAt           DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)
  user                User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  replacedBySession   RefreshSession?   @relation("RefreshSessionReplacement", fields: [replacedBySessionId], references: [id], onDelete: SetNull)
  replacementSource   RefreshSession?   @relation("RefreshSessionReplacement")

  @@index([userId, expiresAt], map: "idx_refresh_sessions_user_expires")
  @@index([familyId, revokedAt], map: "idx_refresh_sessions_family_revoked")
  @@map("refresh_sessions")
}

model Category {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug        String   @unique(map: "categories_slug_key") @db.Text
  title       String   @db.Text
  description String?  @db.Text
  sortOrder   Int      @default(0) @map("sort_order")
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  sites       Site[]

  @@index([active, sortOrder], map: "idx_categories_active_sort_order")
  @@map("categories")
}

model Site {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug             String    @unique(map: "sites_slug_key") @db.Text
  title            String    @db.Text
  categoryId       String    @map("category_id") @db.Uuid
  legacyTitle      String?   @map("legacy_title") @db.Text
  shortDescription String    @map("short_description") @db.Text
  fullDescription  String?   @map("full_description") @db.Text
  features         String[]  @default([])
  tags             String[]  @default([])
  demoUrl          String?   @map("demo_url") @db.Text
  siteUrl          String?   @map("site_url") @db.Text
  previewImageUrl  String?   @map("preview_image_url") @db.Text
  galleryImages    Json      @default("[]") @map("gallery_images") @db.JsonB
  previewType      String?   @map("preview_type") @db.Text
  demoMode         String?   @map("demo_mode") @db.Text
  demoLocalUrl     String?   @map("demo_local_url") @db.Text
  externalDemoUrl  String?   @map("external_demo_url") @db.Text
  originalDemoUrl  String?   @map("original_demo_url") @db.Text
  priceAmountCents Int?      @map("price_amount_cents")
  priceLabel       String?   @map("price_label") @db.Text
  developmentDays  Int?      @map("development_days")
  deliveryLabel    String?   @map("delivery_label") @db.Text
  status           String    @default("draft") @db.Text
  active           Boolean   @default(true)
  featured         Boolean   @default(false)
  views            Int       @default(0)
  sortOrder        Int       @default(0) @map("sort_order")
  publishedAt      DateTime? @map("published_at") @db.Timestamptz(6)
  deletedAt        DateTime? @map("deleted_at") @db.Timestamptz(6)
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  category         Category  @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  @@index([status, active, deletedAt], map: "idx_sites_status_active_deleted")
  @@index([categoryId, status, active, deletedAt], map: "idx_sites_category_public")
  @@index([featured, views, sortOrder, createdAt], map: "idx_sites_featured_order")
  @@index([tags], type: Gin, map: "idx_sites_tags_gin")
  @@index([features], type: Gin, map: "idx_sites_features_gin")
  @@map("sites")
}

model AuditLog {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  actorUserId   String?   @map("actor_user_id") @db.Uuid
  action        String    @db.Text
  entityType    String    @map("entity_type") @db.Text
  entityId      String?   @map("entity_id") @db.Uuid
  beforeJson    Json?     @map("before_json") @db.JsonB
  afterJson     Json?     @map("after_json") @db.JsonB
  requestId     String    @map("request_id") @db.Text
  ipHash        String?   @map("ip_hash") @db.Text
  userAgentHash String?   @map("user_agent_hash") @db.Text
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  actorUser     User?     @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([actorUserId, createdAt], map: "idx_audit_logs_actor_created")
  @@index([entityType, entityId], map: "idx_audit_logs_entity")
  @@index([action, createdAt], map: "idx_audit_logs_action_created")
  @@map("audit_logs")
}

model StorageCleanupJob {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  storagePath String    @map("storage_path") @db.Text
  reason      String    @db.Text
  entityType  String?   @map("entity_type") @db.Text
  entityId    String?   @map("entity_id") @db.Uuid
  status      String    @default("pending") @db.Text
  attempts    Int       @default(0)
  lastError   String?   @map("last_error") @db.Text
  runAfter    DateTime  @default(now()) @map("run_after") @db.Timestamptz(6)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  completedAt DateTime? @map("completed_at") @db.Timestamptz(6)

  @@index([status, runAfter], map: "idx_storage_cleanup_jobs_status_run_after")
  @@index([entityType, entityId], map: "idx_storage_cleanup_jobs_entity")
  @@map("storage_cleanup_jobs")
}
```

### Check Constraints And SQL-Only Additions

The initial migration must add PostgreSQL constraints Prisma cannot fully model:

```sql
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'editor')),
  ADD CONSTRAINT users_email_lowercase_check CHECK (email = lower(email));

ALTER TABLE sites
  ADD CONSTRAINT sites_status_check CHECK (status IN ('draft', 'published', 'archived')),
  ADD CONSTRAINT sites_views_non_negative_check CHECK (views >= 0),
  ADD CONSTRAINT sites_price_positive_check CHECK (price_amount_cents IS NULL OR price_amount_cents > 0),
  ADD CONSTRAINT sites_development_days_positive_check CHECK (development_days IS NULL OR development_days > 0),
  ADD CONSTRAINT sites_demo_mode_check CHECK (demo_mode IS NULL OR demo_mode IN ('none', 'external-iframe'));

ALTER TABLE storage_cleanup_jobs
  ADD CONSTRAINT storage_cleanup_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  ADD CONSTRAINT storage_cleanup_jobs_attempts_non_negative_check CHECK (attempts >= 0);

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_entity_type_check CHECK (entity_type IN ('site', 'category', 'user', 'upload', 'auth'));
```

Prisma supports PostgreSQL GIN indexes for scalar lists. `idx_sites_tags_gin` and `idx_sites_features_gin` must be modeled with `@@index(..., type: Gin, ...)` in `Site` and must not be duplicated manually in migration SQL when Prisma generates them.

### Model Rules

User:

- `email` is lowercase before write and enforced by check constraint;
- `email` is unique;
- `passwordHash` is required and never nullable;
- `role` is `admin` or `editor`;
- last active admin protection is implemented later in B5, not B2.

RefreshSession:

- `tokenHash` is unique and stores only the hash;
- `familyId` groups token rotation chains;
- `replacedBySessionId` is a nullable self-reference;
- indexes support user expiry lookup and family revocation lookup;
- user deletion cascades sessions.

Category:

- `slug` is unique;
- delete with related sites is blocked through `onDelete: Restrict`;
- cascading site deletion is forbidden.

Site:

- `slug` is unique and uses legacy `id` for initial seed;
- `views` is a non-negative integer;
- `priceAmountCents` is positive when present;
- `developmentDays` is positive when present;
- `galleryImages` is JSONB and validated by application-level snapshot/seed validators;
- public leakage guards for draft/archived/deleted data are implemented in B3;
- automatic view counting is not part of B2.

Gallery image object:

```json
{
  "url": "https://...",
  "storagePath": "catalog/sites/...",
  "alt": "string",
  "sortOrder": 0
}
```

AuditLog:

- `actorUserId` is nullable;
- actor deletion sets `actorUserId` to null;
- `beforeJson` and `afterJson` contain sanitized state only;
- `requestId` is required for correlation.

StorageCleanupJob:

- status is `pending`, `processing`, `completed`, or `failed`;
- attempts is non-negative;
- jobs are queued by future B6 logic and not processed in B2.

## 11. Migration Strategy

Initial migration:

- path: `backend/prisma/migrations/<prisma_generated_timestamp>_init/migration.sql`;
- `backend/prisma/migrations/migration_lock.toml` is committed with the initial migration history;
- the timestamped migration directory is created only by Prisma CLI;
- do not manually create a fake timestamp folder before running Prisma CLI;
- PostgreSQL-only SQL;
- no MySQL syntax;
- no SQLite syntax;
- enables `pgcrypto` with `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`;
- creates all six tables;
- adds foreign keys with explicit names and actions;
- adds all unique constraints, check constraints, and indexes;
- includes Prisma-generated GIN indexes for `sites.tags` and `sites.features` through the `Site` model `@@index(..., type: Gin, ...)` declarations;
- uses `jsonb` for `gallery_images`, `before_json`, and `after_json`;
- uses `timestamptz` for all timestamp columns;
- uses `uuid` primary keys with `gen_random_uuid()`;
- does not create views, triggers, functions, row-level-security policies, or Supabase Storage objects.

Command strategy:

- create the initial migration with `prisma migrate dev --name init --create-only`;
- review generated SQL before applying it;
- add only the approved custom CHECK constraints after generated SQL review;
- apply the reviewed migration after the approved custom CHECK constraints are in place;
- `prisma migrate dev` only against development database and dedicated shadow database;
- `prisma migrate deploy` only for a future production deploy task;
- `prisma migrate status` required after migration apply;
- `prisma db push` is forbidden as a production or review workflow;
- schema drift check uses `prisma migrate status` plus integration assertions against `information_schema` and PostgreSQL catalogs.

Migration review:

- inspect generated SQL before applying;
- verify custom SQL contains only approved CHECK constraints and non-duplicated additions Prisma cannot model;
- verify GIN indexes are not duplicated manually when Prisma already generated them;
- verify no destructive statements after initial empty database migration;
- verify table and column names match B0 `@map`/`@@map` naming;
- verify constraints and indexes have stable names;
- verify category-site FK blocks cascading site delete.

Rollback boundary:

- before merge, rollback is deleting B2 files and dropping local/test databases created for B2;
- after a future production migration, rollback requires a separate database rollback plan and is outside B2 implementation.

## 12. Legacy Snapshot Contract

Create `backend/prisma/seed-data/web00-catalog.json`.

Snapshot metadata:

```json
{
  "sourceRepository": "https://github.com/Prudexxx/web00-pro.git",
  "sourceCommit": "a91bb358304f0c80c744660c73cdb300d8d46e43",
  "sourceFile": "assets/js/data.js",
  "sourceSha256": "computed lowercase sha256",
  "generatedAt": "2026-07-24T00:00:00.000Z",
  "categories": [],
  "sites": []
}
```

Category slugs from current legacy `filter` values:

- `individual`;
- `goods`;
- `construction`;
- `medicine`;
- `services`;
- `realty`;
- `delivery`.

Site slugs from current legacy `id` values:

- `site-custom`;
- `mebel`;
- `odezhda`;
- `doma-bani`;
- `medicina`;
- `narko-medicine`;
- `uslugi`;
- `cleaning`;
- `advokat`;
- `krovlya`;
- `digital-projects`;
- `ruberoid-roof`;
- `rental-house`;
- `massage`;
- `drova`.

Snapshot category object:

```json
{
  "slug": "goods",
  "title": "Товары",
  "description": null,
  "sortOrder": 20,
  "active": true
}
```

Snapshot site object:

```json
{
  "slug": "mebel",
  "title": "Мебельный магазин",
  "categorySlug": "goods",
  "legacyTitle": "Мебельный магазин",
  "shortDescription": "Витрина мебельного магазина с категориями, карточками товаров, условиями доставки и заявкой на расчёт.",
  "fullDescription": null,
  "features": ["Каталог товаров", "Категории", "Карточки товаров", "Заявка на расчёт"],
  "tags": [],
  "demoUrl": "https://prudexxx.github.io/MEBELPlanet/",
  "siteUrl": null,
  "previewImageUrl": "assets/img/previews/mebel-home.png",
  "galleryImages": [
    {
      "url": "assets/img/solution-gallery/mebel-01.png",
      "storagePath": "catalog/sites/mebel/gallery/mebel-01.png",
      "alt": "Мебельный магазин",
      "sortOrder": 0
    }
  ],
  "previewType": "goods",
  "demoMode": "external-iframe",
  "demoLocalUrl": null,
  "externalDemoUrl": "https://prudexxx.github.io/MEBELPlanet/",
  "originalDemoUrl": "https://prudexxx.github.io/MEBELPlanet/",
  "priceAmountCents": null,
  "priceLabel": "Стоимость после анкеты",
  "developmentDays": null,
  "deliveryLabel": "от 3 дней",
  "status": "draft",
  "active": true,
  "featured": false,
  "views": 0,
  "sortOrder": 20,
  "publishedAt": null
}
```

Legacy mapping rules:

- `assets/js/data.js` is the source for local builder/verifier only;
- production seed reads only snapshot inside `backend/`;
- legacy `id` becomes canonical `slug`;
- legacy `filter` becomes `categorySlug`;
- legacy `category` becomes category display `title`;
- legacy `description` becomes `shortDescription`;
- legacy `features` becomes `features`;
- legacy `priceFrom` becomes `priceLabel`;
- legacy `deliveryTime` becomes `deliveryLabel`;
- legacy `previewImage` becomes `previewImageUrl` as an approved static fallback path for B2;
- legacy `galleryImages` becomes `galleryImages`;
- gallery `storagePath` is derived as `catalog/sites/{siteSlug}/gallery/{fileName}`;
- gallery `url` preserves the current local static path in B2 seed rows because B2 does not upload files to Supabase Storage;
- B2 seed uses `status: "draft"` for all seeded sites until B3/B6 approval defines public leakage and upload behavior;
- all demo fields are preserved: `demoUrl`, `demoMode`, `demoLocalUrl`, `externalDemoUrl`, `originalDemoUrl`;
- existing frontend `assets/js/data.js` remains unchanged.

Gallery URL publication blocker:

- B0's public gallery contract uses HTTPS URLs.
- B2 stores current local static paths only in draft seed data because upload to Supabase Storage is out-of-scope.
- Before any seeded site is published or exposed by B3 public API, implementation must either upload assets in B6 or receive a separate approval for static fallback URLs in public responses.

## 13. Seed Contract

Seed entrypoint:

- file: `backend/prisma/seed.ts`;
- reads `backend/prisma/seed-data/web00-catalog.json`;
- validates snapshot shape before database writes;
- calls idempotent seed implementation;
- prints summary as JSON and human-readable text;
- exits with code `0` when no conflicts exist;
- exits non-zero when conflicts exist or snapshot validation fails;
- never reads `../assets/js/data.js`.

Seed order:

1. validate database URL is not test/production-forbidden for the chosen command context;
2. validate snapshot metadata and shape;
3. create missing categories;
4. compare existing categories;
5. create missing sites;
6. compare existing sites;
7. report summary;
8. return non-zero exit code on conflicts.

Seed summary:

```json
{
  "categories": {
    "created": 7,
    "unchanged": 0,
    "conflicts": 0
  },
  "sites": {
    "created": 15,
    "unchanged": 0,
    "conflicts": 0
  }
}
```

Idempotency rules:

- categories are matched by `slug`;
- sites are matched by `slug`;
- missing records are created;
- existing records are compared against seed-owned fields;
- unchanged records are counted as `unchanged`;
- changed records are counted as `conflicts`;
- conflicts are never overwritten automatically;
- seed never deletes categories, sites, users, sessions, audit logs, or cleanup jobs;
- seed never soft-deletes or archives records;
- safe transactions are used for create operations and consistency checks;
- conflicts include field names and slugs but do not include secrets or raw database URLs.

Seed-owned fields:

- Category: `slug`, `title`, `description`, `sortOrder`, `active`.
- Site: all fields sourced from snapshot except database-generated `id`, `createdAt`, and `updatedAt`.

Conflict example:

```json
{
  "type": "site",
  "slug": "mebel",
  "fields": ["title", "shortDescription"]
}
```

## 14. Integration Test Strategy

Integration tests require `TEST_DATABASE_URL`. If it is absent, integration tests fail with a clear safe error and do not fall back to `DATABASE_URL`.

Required test coverage:

- Prisma Client generation succeeds before typecheck/build/test.
- `prisma validate` passes.
- Prisma format check or safe equivalent passes.
- Initial migration applies to isolated PostgreSQL database.
- `prisma migrate status` reports clean state after apply.
- Tables exist: `users`, `refresh_sessions`, `categories`, `sites`, `audit_logs`, `storage_cleanup_jobs`.
- Check constraints exist for role, site status, cleanup status, non-negative views, positive optional price, positive optional development days, and non-negative attempts.
- Unique constraints reject duplicate user email, category slug, site slug, and refresh token hash.
- `email = lower(email)` check rejects mixed-case direct SQL inserts.
- Category deletion with related sites fails and does not cascade-delete sites.
- RefreshSession user relation cascades on user delete.
- RefreshSession self-relation stores replacement link.
- AuditLog actor relation sets null on user delete.
- Site numeric checks reject negative `views`, zero/negative `priceAmountCents`, and zero/negative `developmentDays`.
- Seed creates exactly 7 categories.
- Seed creates exactly 15 sites.
- Repeated seed reports unchanged and creates no duplicates.
- Editing a seeded record creates a conflict and does not overwrite the edit.
- Snapshot SHA mismatch fails verification.
- Duplicate snapshot category or site slug fails verification.
- Missing required snapshot field fails verification.
- Missing referenced local image fails verification.
- Snapshot builder/verifier does not use `eval`, `Function`, `vm`, or dynamic import of `assets/js/data.js`.
- Production seed reads only `backend/prisma/seed-data/web00-catalog.json`.
- Test database guard rejects production-like URLs and refuses equality with runtime/shadow URL.
- Existing 27 B1 tests remain PASS.

Test file layout:

- `backend/tests/database-env.test.ts`: unit database URL guard tests.
- `backend/tests/prisma-adapter.test.ts`: PrismaPg adapter factory tests.
- `backend/tests/snapshot-builder.test.ts`: trusted parser/builder tests.
- `backend/tests/snapshot-verifier.test.ts`: snapshot shape, SHA, slug, and image tests.
- `backend/tests/seed.test.ts`: seed behavior against isolated PostgreSQL.
- `backend/tests/integration/prisma-migration.test.ts`: migration and database constraint tests.

Test command rules:

- focused unit tests can run without database when they do not touch PostgreSQL;
- integration tests require explicit `TEST_DATABASE_URL`;
- tests must never create or drop the production database;
- tests may create/drop only schemas or records inside the test database approved by `TEST_DATABASE_URL`;
- tests must restore or reset test database state between cases.

## 15. Ordered Implementation Tasks

### Task 1: Dependency And Prisma Toolchain

**Goal:** add approved Prisma/PostgreSQL dependencies, Prisma scripts, generated-client ignore rule, and toolchain tests without creating schema behavior yet.

**Files:**

- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `backend/.gitignore`
- Modify: `backend/.env.example`
- Modify: `backend/README.md`
- Create: `backend/scripts/check-prisma-format.ts`
- Create: `backend/tests/prisma-toolchain.test.ts`

**Dependencies:** B1 committed backend scaffold.

**TDD RED/GREEN:**

- [ ] Write failing tests that read `backend/package.json` and assert approved B2 direct dependencies, approved dev dependencies, no `postinstall`, and scripts from section 7.
- [ ] Write failing test that reads `backend/.gitignore` and asserts `src/generated/prisma/` is ignored.
- [ ] Write failing test that reads `backend/.env.example` and asserts database variable names exist with local placeholder values only.
- [ ] Assert `.env.example` maps `DATABASE_URL`, `SHADOW_DATABASE_URL`, and `TEST_DATABASE_URL` to `web00_backend_dev`, `web00_backend_shadow`, and `web00_backend_test` without PrismaPg pool query parameters.
- [ ] Run `& $PortableNpm run test:run -- tests/prisma-toolchain.test.ts`; expected failure names missing dependencies/scripts/ignore/env placeholders.
- [ ] Modify only approved files.
- [ ] Run portable npm install commands for approved packages only:

```powershell
& $PortableNpm install @prisma/client@7 @prisma/adapter-pg@7 pg dotenv
& $PortableNpm install --save-dev prisma@7 @types/pg
```

- [ ] Implement `backend/scripts/check-prisma-format.ts` so it copies `prisma/schema.prisma` to a temp location, runs Prisma format against the temp copy, compares content, and removes the temp file. The script must not mutate the real schema.
- [ ] Re-run focused test and `& $PortableNpm run typecheck`.

**Commands:**

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run test:run -- tests/prisma-toolchain.test.ts
& $PortableNpm run typecheck
```

**PASS Criteria:**

- `package.json` has only approved direct dependencies;
- `package-lock.json` is updated by portable npm;
- generated client output is ignored;
- `.env.example` contains safe local PostgreSQL placeholders only;
- `.env.example` does not use runtime pool query parameters;
- no Prisma schema, migration, seed, or database connection exists yet unless created by a later task.

**Rollback:**

- restore B1 `backend/package.json`, `backend/package-lock.json`, `.gitignore`, `.env.example`, README text;
- remove `backend/scripts/check-prisma-format.ts`;
- remove `backend/tests/prisma-toolchain.test.ts`.

**Out-Of-Scope:** database schema, migrations, generated client, seed, API, auth, upload, deploy.

### Task 2: Environment And Database Safety Contract

**Goal:** add database URL validation and isolation guards before any migration or seed command can mutate a database.

**Files:**

- Create: `backend/src/config/database-env.ts`
- Create: `backend/tests/database-env.test.ts`
- Modify: `backend/tests/setup.ts` if additional database env restoration keys are needed.

**Dependencies:** Task 1.

**Interfaces:**

- Produces `DatabaseEnv`, `DatabaseEnvValidationError`, `parseDatabaseEnv`, `parseDatabaseUrl`, `assertDatabaseIsolation`, `assertTestDatabaseUrl`, `assertMigrationDatabaseUrl`.
- Consumed by Tasks 4, 5, 7, and 8.

**TDD RED/GREEN:**

- [ ] Write failing tests for valid dev/shadow/test URLs.
- [ ] Write failing tests that reject missing URL variables.
- [ ] Write failing tests that reject equal `DATABASE_URL`, `SHADOW_DATABASE_URL`, and `TEST_DATABASE_URL`.
- [ ] Write failing tests that reject `TEST_DATABASE_URL` without `_test` marker.
- [ ] Write failing tests that reject `SHADOW_DATABASE_URL` without `_shadow` marker.
- [ ] Write failing tests that reject `migrate dev` when `NODE_ENV=production`.
- [ ] Write failing tests that prove thrown messages do not include password, username, host, query string, or raw URL.
- [ ] Run focused tests and confirm failure is missing implementation.
- [ ] Implement URL parsing with the standard `URL` class and Zod for variable presence.
- [ ] Implement safe issue collection.
- [ ] Re-run focused tests and full B1 tests.

**Commands:**

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run test:run -- tests/database-env.test.ts
& $PortableNpm run test:run
& $PortableNpm run typecheck
```

**PASS Criteria:**

- invalid URLs fail safely;
- test/shadow/runtime databases must be distinct;
- production-like test URL is rejected;
- B1 tests remain PASS.

**Rollback:**

- remove `backend/src/config/database-env.ts`;
- remove `backend/tests/database-env.test.ts`;
- restore `backend/tests/setup.ts` if changed.

**Out-Of-Scope:** connecting to PostgreSQL, migrations, seed.

### Task 3: Prisma Schema

**Goal:** add Prisma 7 schema matching section 10 and validate it without applying a migration.

**Files:**

- Create: `backend/prisma/schema.prisma`
- Create: `backend/tests/prisma-schema.test.ts`

**Dependencies:** Tasks 1 and 2.

**TDD RED/GREEN:**

- [ ] Write failing tests that read `backend/prisma/schema.prisma` and assert generator provider `prisma-client`, output `../src/generated/prisma`, datasource provider `postgresql`, six model names, `@@map` names, UUID fields, timestamp fields, relation names, and `onDelete` actions.
- [ ] Write failing tests that assert no Prisma enum type is introduced unless the migration also keeps B0-compatible constraints.
- [ ] Run focused schema test and confirm failure is missing schema.
- [ ] Create schema from section 10.
- [ ] Run `& $PortableNpm run prisma:validate`.
- [ ] Run `& $PortableNpm run prisma:format:check`.
- [ ] Run focused test and typecheck.

**Commands:**

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run test:run -- tests/prisma-schema.test.ts
& $PortableNpm run prisma:validate
& $PortableNpm run prisma:format:check
& $PortableNpm run typecheck
```

**PASS Criteria:**

- Prisma schema validates;
- schema names map to approved table and column names;
- generated client output remains ignored;
- no database migration has run.

**Rollback:**

- remove `backend/prisma/schema.prisma`;
- remove `backend/tests/prisma-schema.test.ts`.

**Out-Of-Scope:** migration apply, seed, database connection.

### Task 4: Initial Migration

**Goal:** create and verify the PostgreSQL-only initial migration.

**Files:**

- Create: `backend/prisma/migrations/migration_lock.toml`
- Create: `backend/prisma/migrations/<prisma_generated_timestamp>_init/migration.sql`
- Create: `backend/tests/integration/prisma-migration.test.ts`
- Create: `backend/tests/integration/test-database.ts`
- Modify: `backend/README.md`

**Dependencies:** Tasks 1, 2, and 3; provisioned development, shadow, and test databases.

**TDD RED/GREEN:**

- [ ] Write failing integration helper test that refuses to run without safe `TEST_DATABASE_URL`.
- [ ] Write failing migration tests that assert tables do not exist before migration in an empty test database.
- [ ] Write failing tests for required tables, constraints, indexes, FKs, and relation behavior.
- [ ] Run focused integration tests against isolated PostgreSQL and confirm failure is missing migration.
- [ ] Run `prisma migrate dev --name init --create-only` against local development and shadow databases.
- [ ] Verify Prisma CLI created `migration_lock.toml` and the timestamped `init` migration directory.
- [ ] Review generated migration SQL with `pgcrypto`, six tables, generated indexes, and FKs before applying.
- [ ] Add only approved custom CHECK constraints Prisma cannot model.
- [ ] Confirm no manual fake timestamp folder was created before Prisma CLI and no Prisma-generated GIN index is duplicated manually.
- [ ] Run migration apply against development database only after `assertMigrationDatabaseUrl` passes.
- [ ] Apply migration to isolated test database.
- [ ] Run `prisma migrate status`.
- [ ] Run focused integration tests again.

**Commands:**

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run prisma:validate
& $PortableNpm exec prisma migrate dev --name init --create-only --schema prisma/schema.prisma
& $PortableNpm run db:migrate:dev
& $PortableNpm run db:migrate:status
& $PortableNpm run test:run -- tests/integration/prisma-migration.test.ts
```

**PASS Criteria:**

- migration applies cleanly to PostgreSQL;
- migration history includes `backend/prisma/migrations/migration_lock.toml`;
- initial migration directory was created by Prisma CLI;
- migration status is clean;
- constraints and relation behavior are proven by integration tests;
- no production database URL is used;
- no MySQL syntax appears in migration SQL;
- Prisma-generated GIN indexes are not duplicated manually.

**Rollback:**

- remove migration directory;
- remove `backend/prisma/migrations/migration_lock.toml`;
- reset/drop only local development/test database objects created by B2;
- keep frontend/docs/workflows untouched.

**Out-Of-Scope:** seed, public API, auth, upload, deploy.

### Task 5: Prisma Client Adapter Module

**Goal:** generate Prisma Client and add a runtime factory that always uses PrismaPg.

**Files:**

- Create: `backend/src/db/prisma.ts`
- Create: `backend/tests/prisma-adapter.test.ts`
- Modify: `backend/README.md`

**Dependencies:** Tasks 1, 2, 3, and 4.

**Interfaces:**

```typescript
export interface CreatePrismaClientOptions {
  databaseUrl: string;
  logQueries?: boolean;
  poolMax?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient;
```

**TDD RED/GREEN:**

- [ ] Write failing test that imports `createPrismaClient` and asserts missing `databaseUrl` is rejected by TypeScript or runtime guard.
- [ ] Write failing test that mocks `@prisma/adapter-pg` and verifies `PrismaPg` receives `connectionString`, `max`, `connectionTimeoutMillis`, and `idleTimeoutMillis`.
- [ ] Write failing test or static scan that rejects runtime database URLs containing pooling parameters instead of adapter options.
- [ ] Write failing static scan test that rejects `new PrismaClient()` in `backend/src` unless the same object literal includes `adapter`.
- [ ] Run focused tests and confirm failure is missing module.
- [ ] Run `& $PortableNpm run prisma:generate`.
- [ ] Implement adapter module importing generated client with `.js` extension.
- [ ] Re-run focused tests and typecheck.

**Commands:**

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run prisma:generate
& $PortableNpm run test:run -- tests/prisma-adapter.test.ts
& $PortableNpm run typecheck
```

**PASS Criteria:**

- generated client exists locally but is ignored;
- adapter module uses PrismaPg with explicit pool options;
- runtime pool limits and timeouts are not passed through URL parameters;
- plain Prisma Client construction is forbidden by test;
- app/server behavior from B1 remains unchanged.

**Rollback:**

- remove `backend/src/db/prisma.ts`;
- remove `backend/tests/prisma-adapter.test.ts`;
- remove generated client from local workspace if the rollback task explicitly permits deleting generated ignored files.

**Out-Of-Scope:** route integration, query handlers, API, auth.

### Task 6: Snapshot Builder And Verifier

**Goal:** create the backend-owned catalog snapshot and local verification tooling without executing legacy JavaScript.

**Files:**

- Create: `backend/scripts/build-catalog-snapshot.ts`
- Create: `backend/scripts/verify-catalog-snapshot.ts`
- Create: `backend/prisma/seed-data/web00-catalog.json`
- Create: `backend/tests/snapshot-builder.test.ts`
- Create: `backend/tests/snapshot-verifier.test.ts`
- Modify: `backend/README.md`

**Dependencies:** Tasks 1 and 2.

**Interfaces:**

```typescript
export interface CatalogSnapshot {
  sourceRepository: string;
  sourceCommit: string;
  sourceFile: "assets/js/data.js";
  sourceSha256: string;
  generatedAt: string;
  categories: CatalogSnapshotCategory[];
  sites: CatalogSnapshotSite[];
}
```

**TDD RED/GREEN:**

- [ ] Write failing parser tests using small fixture source strings that contain `SOLUTIONS` and `SOLUTION_GALLERIES`.
- [ ] Write failing tests proving parser rejects computed expressions, function calls, spreads, imports, and non-literal values.
- [ ] Write failing verifier tests for SHA mismatch, duplicate category slug, duplicate site slug, missing required field, and missing image path.
- [ ] Write failing test that scans builder/verifier source and rejects `eval`, `Function`, `vm`, and dynamic import of legacy source.
- [ ] Run focused tests and confirm failure is missing scripts.
- [ ] Implement parser using `typescript` compiler API with literal-only AST extraction.
- [ ] Build snapshot from `assets/js/data.js`.
- [ ] Verify snapshot has 7 categories and 15 sites.
- [ ] Verify all preview and gallery local paths exist.
- [ ] Re-run focused tests and `seed:verify`.

**Commands:**

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run test:run -- tests/snapshot-builder.test.ts tests/snapshot-verifier.test.ts
& $PortableNpm run seed:build-snapshot
& $PortableNpm run seed:verify
```

**PASS Criteria:**

- snapshot contains source metadata;
- snapshot source SHA matches `assets/js/data.js`;
- 7 categories and 15 sites are present;
- site slugs match current legacy ids;
- category slugs match current filter values;
- image references exist locally;
- builder/verifier do not execute legacy JavaScript.

**Rollback:**

- remove builder/verifier scripts;
- remove snapshot JSON;
- remove snapshot tests;
- restore README if changed.

**Out-Of-Scope:** database seed execution, upload migration, public API.

### Task 7: Idempotent Seed

**Goal:** seed categories and sites from the backend snapshot safely and repeatedly.

**Files:**

- Create: `backend/prisma/seed.ts`
- Create: `backend/prisma/seed-web00-data.ts`
- Create: `backend/tests/seed.test.ts`
- Modify: `backend/README.md`

**Dependencies:** Tasks 2, 4, 5, and 6; isolated PostgreSQL test database.

**Interfaces:**

```typescript
export interface SeedSummary {
  categories: SeedEntitySummary;
  sites: SeedEntitySummary;
}

export interface SeedEntitySummary {
  created: number;
  unchanged: number;
  conflicts: number;
}

export interface SeedConflict {
  type: "category" | "site";
  slug: string;
  fields: string[];
}

export async function seedWeb00Catalog(prisma: PrismaClient, snapshot: CatalogSnapshot): Promise<{
  summary: SeedSummary;
  conflicts: SeedConflict[];
}>;
```

**TDD RED/GREEN:**

- [ ] Write failing integration test that starts with empty test database and expects 7 categories and 15 sites created.
- [ ] Write failing repeated seed test expecting zero created and 7/15 unchanged.
- [ ] Write failing conflict test that edits a site title, re-runs seed, expects one conflict and verifies the edited title remains unchanged.
- [ ] Write failing test that seed never deletes an extra category or site.
- [ ] Write failing test that production seed imports only `backend/prisma/seed-data/web00-catalog.json`.
- [ ] Run focused seed tests and confirm failure is missing seed implementation.
- [ ] Implement snapshot loading, validation, category seed, site seed, compare logic, conflict summary, and exit codes.
- [ ] Re-run focused seed tests.

**Commands:**

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run test:run -- tests/seed.test.ts
& $PortableNpm run seed
& $PortableNpm run seed
```

**PASS Criteria:**

- first seed creates 7 categories and 15 sites;
- repeated seed reports unchanged;
- edited record becomes conflict and is not overwritten;
- seed never deletes records;
- seed reads only backend snapshot;
- non-zero exit on conflict.

**Rollback:**

- remove seed files;
- remove seed tests;
- reset only test/development database records created by B2;
- restore README if changed.

**Out-Of-Scope:** admin edits, public API, uploads, auth.

### Task 8: PostgreSQL Integration Tests

**Goal:** consolidate B2 database tests and ensure B1 tests still pass with generated Prisma Client.

**Files:**

- Modify: `backend/tests/integration/prisma-migration.test.ts`
- Modify: `backend/tests/seed.test.ts`
- Modify: `backend/tests/repository-boundary.test.ts` only if B2 generated-client ignore behavior needs a new assertion.
- Create: `backend/tests/integration/database-constraints.test.ts` if migration tests become too large.

**Dependencies:** Tasks 1 through 7.

**TDD RED/GREEN:**

- [ ] Add relation behavior assertions: refresh session cascade, audit actor set-null, category delete restriction.
- [ ] Add unique constraint assertions: email, category slug, site slug, token hash.
- [ ] Add numeric check assertions for site and cleanup job fields.
- [ ] Add migration status assertion.
- [ ] Add database guard assertion that test helper refuses production-like URLs.
- [ ] Run focused integration tests.
- [ ] Refactor helper duplication only after tests pass.
- [ ] Run full B1+B2 test suite.

**Commands:**

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run test:run -- tests/integration/prisma-migration.test.ts tests/integration/database-constraints.test.ts tests/seed.test.ts
& $PortableNpm run test:run
```

**PASS Criteria:**

- database constraints are proven by PostgreSQL, not only mocked code;
- migration status is clean;
- seed tests pass against isolated test DB;
- existing B1 tests remain PASS.

**Rollback:**

- remove or restore integration test files changed in this task;
- reset only test database objects created by this task.

**Out-Of-Scope:** production database, API, auth, admin UI.

### Task 9: Full B2 Checkpoint

**Goal:** run the full B2 verification gate and stop before push, PR, merge, or deploy.

**Files:**

- No new files beyond Tasks 1 through 8.

**Dependencies:** Tasks 1 through 8.

**Steps:**

- [ ] Verify current branch is `feat/web00-backend-b2`.
- [ ] Verify root `package.json` is absent.
- [ ] Verify `backend/.env` is absent.
- [ ] Verify `backend/src/generated/prisma/`, `backend/dist/`, `backend/node_modules/`, and `backend/coverage/` are ignored.
- [ ] Run all final checkpoint commands from section 16.
- [ ] Verify Git changes are only in `backend/` and this B2 plan file.
- [ ] Verify generated Prisma Client is not staged.
- [ ] Verify no `backend/.env`, database dump, npm cache, `dist`, `node_modules`, frontend, docs except this plan, or workflow file is staged.
- [ ] Verify future B2 commit scope includes `backend/prisma/migrations/migration_lock.toml` when the initial migration is committed.
- [ ] Verify future B2 commit scope includes only the Prisma CLI generated `init` migration directory, not a manually invented timestamp folder.
- [ ] Stop and request owner approval before any commit.

**Commands:**

```powershell
Set-Location D:\WEB00_BACKEND
git branch --show-current
git status --short
git diff --check
git diff --name-only -- . ":(exclude)backend/**" ":(exclude)docs/WEB00_BACKEND_B2_IMPLEMENTATION_PLAN.md"
git ls-files --others --exclude-standard -- . ":(exclude)backend/**" ":(exclude)docs/WEB00_BACKEND_B2_IMPLEMENTATION_PLAN.md"
```

**PASS Criteria:**

- final checkpoint passes;
- B1 tests remain PASS;
- B2 integration tests pass against isolated PostgreSQL;
- only approved files changed;
- migration commit scope includes `backend/prisma/migrations/migration_lock.toml` and the generated `init` migration SQL;
- implementation has not been pushed, deployed, merged, or exposed through API.

**Rollback:**

- remove all B2 files and restore modified B1 backend files;
- reset local/test databases created for B2;
- do not change frontend, root package files, workflows, or production database.

**Out-Of-Scope:** commit/push/PR/deploy without separate owner approval.

## 16. Final Verification Checkpoint

Do not run these commands during the planning task. They are future B2 implementation checks.

Use portable Node:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$OriginalPath = $env:PATH
$env:PATH = "$PortableRoot;$OriginalPath"

Set-Location D:\WEB00_BACKEND\backend

& $PortableNode --version
& $PortableNpm --version
& $PortableNpm ci
& $PortableNpm run prisma:validate
& $PortableNpm run prisma:format:check
& $PortableNpm run prisma:generate
& $PortableNpm run db:migrate:dev
& $PortableNpm run db:migrate:status
& $PortableNpm run seed:verify
& $PortableNpm run seed
& $PortableNpm run seed
& $PortableNpm run typecheck
& $PortableNpm run test:run
& $PortableNpm run build
& $PortableNpm run check
& $PortableNpm audit --json

$env:PATH = $OriginalPath
```

Expected results:

- Node is `v22.23.1`;
- npm is `10.9.8`;
- `npm ci` succeeds;
- Prisma schema validates;
- Prisma format check or safe equivalent passes;
- Prisma Client generation succeeds;
- migration applies only to development database with dedicated shadow database;
- local B2 migration and integration tests use `web00_backend_dev`, `web00_backend_shadow`, and `web00_backend_test`;
- Supabase is not required for local B2 migration or integration tests;
- migration history includes `backend/prisma/migrations/migration_lock.toml`;
- generated GIN indexes for `sites.tags` and `sites.features` are not duplicated manually;
- migration status is clean;
- snapshot verification passes;
- first seed creates missing records or reports unchanged in an already seeded dev DB;
- repeated seed reports unchanged and zero conflicts;
- typecheck passes;
- B1+B2 tests pass;
- build passes;
- npm audit reports zero vulnerabilities or only owner-approved low/moderate dev-only risk;
- `backend/dist/server.js` may exist locally but is ignored;
- `backend/src/generated/prisma/` may exist locally but is ignored;
- `backend/.env` is absent from Git.

Git boundary checkpoint:

```powershell
Set-Location D:\WEB00_BACKEND
git diff --check
git status --short
git diff --name-only -- . ":(exclude)backend/**" ":(exclude)docs/WEB00_BACKEND_B2_IMPLEMENTATION_PLAN.md"
git ls-files --others --exclude-standard -- . ":(exclude)backend/**" ":(exclude)docs/WEB00_BACKEND_B2_IMPLEMENTATION_PLAN.md"
Test-Path package.json
Test-Path backend\.env
git check-ignore -q backend\node_modules
git check-ignore -q backend\dist
git check-ignore -q backend\coverage
git check-ignore -q backend\.env
git check-ignore -q backend\src\generated\prisma
```

Expected results:

- `git diff --check` passes;
- non-backend changes are empty except this B2 plan when the plan is intentionally uncommitted;
- root `package.json` is absent;
- `backend/.env` is absent;
- ignored generated/local paths are excluded from future commit scope.

## 17. Acceptance Criteria

B2 is accepted when:

- branch is `feat/web00-backend-b2`;
- B2 implementation changes only approved backend files and this B2 plan file;
- Prisma ORM 7.x dependencies are installed exactly as specified;
- no unexpected direct package is added;
- `backend/prisma.config.ts` configures Prisma CLI URL, shadow database URL, migration path, and seed command;
- `DATABASE_URL` and `SHADOW_DATABASE_URL` cannot be equal;
- `backend/prisma/schema.prisma` uses `generator client` provider `prisma-client` and output `../src/generated/prisma`;
- generated client is created locally and not committed;
- `backend/.gitignore` excludes `src/generated/prisma/`;
- runtime database module creates Prisma Client with `PrismaPg`;
- `PrismaPg` receives pool options through adapter fields, not URL query parameters;
- plain Prisma Client without adapter is forbidden by test;
- development, shadow, and test databases are the three local PostgreSQL databases `web00_backend_dev`, `web00_backend_shadow`, and `web00_backend_test`;
- Supabase is not required for B2 `migrate dev` or integration tests;
- test database guard rejects production-like URLs;
- initial PostgreSQL migration creates all six B0 models;
- initial migration is created with `prisma migrate dev --name init --create-only`;
- `backend/prisma/migrations/migration_lock.toml` is included in migration history and future commit scope;
- UUID primary keys and `timestamptz` timestamps are used;
- check constraints and indexes are present;
- `Site` defines GIN indexes for `tags` and `features` through Prisma `@@index(..., type: Gin, ...)`;
- Prisma-generated GIN indexes are not duplicated manually in migration SQL;
- category delete does not cascade-delete sites;
- snapshot contains exactly 7 categories and 15 sites;
- snapshot source metadata and SHA verification pass;
- builder/verifier do not execute legacy JavaScript;
- production seed reads only backend snapshot;
- seed creates missing categories/sites;
- repeated seed reports unchanged;
- changed existing record reports conflict and is not overwritten;
- seed never deletes records;
- existing B1 tests remain PASS;
- B2 tests pass;
- typecheck/build/check pass;
- npm audit is acceptable under policy;
- no public API/auth/admin/upload/frontend/deploy work is present.

## 18. Rollback Boundary

Before merge, rollback is local and file-based:

- restore B1 versions of modified backend files;
- remove B2-created files under `backend/prisma`, `backend/scripts`, `backend/src/db`, and B2 test files;
- remove ignored generated `backend/src/generated/prisma` only when rollback task explicitly permits local ignored cleanup;
- restore `backend/package.json` and `backend/package-lock.json` to B1 dependency set;
- reset or drop only local development/test databases created for B2;
- never touch production database;
- never touch frontend, root files, GitHub workflows, or assets.

After a future production migration, rollback is not covered by B2. It must be handled by a separate database rollback plan with owner approval.

## 19. Risks And Mitigations

| Risk | Mitigation |
|---|---|
| Prisma 7 CLI behavior differs from expected `format --check` support | Use `backend/scripts/check-prisma-format.ts` safe equivalent that verifies formatting without mutating the real schema. |
| Generated Prisma Client enters commit scope | Add `src/generated/prisma/` to `backend/.gitignore`; run `git diff --cached --name-only` forbidden-path guard before commit. |
| Local PostgreSQL is not prepared before implementation | Stop B2 before dependency or Prisma work until one local PostgreSQL server and `web00_backend_dev`, `web00_backend_shadow`, and `web00_backend_test` exist. |
| Integration tests mutate runtime or production database | Require `TEST_DATABASE_URL`, `_test` marker, URL inequality checks, local database names, and guard tests before any test mutation. |
| `migrate dev` runs without shadow database | `assertMigrationDatabaseUrl` blocks missing or non-isolated `SHADOW_DATABASE_URL`; implementation stops before migration. |
| PrismaPg pool settings drift into URL query parameters | Keep pool size and timeout settings in `PrismaPg` options and reject runtime URLs that contain pool query parameters. |
| Supabase is used prematurely for local B2 | Treat Supabase as future staging/production infrastructure; local B2 migration and integration tests use only local PostgreSQL. |
| Generated GIN indexes are duplicated manually | Model `tags` and `features` indexes with Prisma `@@index(..., type: Gin, ...)`; review generated SQL before adding custom CHECK constraints. |
| Seed overwrites owner/admin edits | Compare existing seed-owned fields and report conflicts with non-zero exit instead of overwriting. |
| Snapshot drifts from `assets/js/data.js` | Store source SHA-256 and source commit; verifier compares trusted source to snapshot before approval. |
| Legacy image paths are missing | Verifier checks every preview and gallery path exists in repository before snapshot passes. |
| B2 drifts into public catalog API or auth | File map and tasks exclude routes, auth, admin UI, frontend adapter, JWT, cookies, uploads, and deploy. |
| Local static gallery paths conflict with future public HTTPS contract | Keep seeded sites as draft in B2; B3/B6 must approve public image URL strategy before publishing or exposing records. |

## 20. Implementation Blockers

B2 implementation must stop with `BLOCKED` if any condition is true:

- branch is not `feat/web00-backend-b2`;
- HEAD is not based on B1 commit `a91bb358304f0c80c744660c73cdb300d8d46e43`;
- working tree contains unrelated changes outside approved B2 scope;
- portable Node `v22.23.1` is unavailable;
- approved dependency install tries to add packages outside the dependency contract;
- `DATABASE_URL` is missing when migration/seed work begins;
- `SHADOW_DATABASE_URL` is missing for `migrate dev`;
- `TEST_DATABASE_URL` is missing for integration tests;
- local PostgreSQL server or any of `web00_backend_dev`, `web00_backend_shadow`, or `web00_backend_test` is not prepared;
- database URLs are equal or fail isolation markers;
- a command would run against production database during development migration or test;
- a B2 task requires Supabase credentials, Supabase `migrate dev`, or Supabase integration tests;
- migration SQL requires non-PostgreSQL syntax;
- snapshot builder needs `eval`, `Function`, `vm`, or dynamic import to read legacy data;
- snapshot count is not exactly 7 categories and 15 sites;
- legacy image references are missing;
- seed would need to overwrite an existing changed record to pass;
- public API, auth, admin UI, upload, frontend adapter, Render, Docker, Redis, or workflow changes become necessary.
