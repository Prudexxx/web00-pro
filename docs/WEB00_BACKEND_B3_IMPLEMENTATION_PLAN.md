# WEB00 Backend B3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for future tracking.

**Goal:** add the public read-only WEB00 catalog API for sites and categories without changing seed data, adding auth/admin/upload/frontend integration, or deploying.

**Architecture:** B3 adds one isolated `public-catalog` module under `backend/src/modules/public-catalog/`. Request parsing lives in Zod schemas, Prisma access is isolated in a repository with centralized immutable public visibility guards, service code owns domain decisions, mappers own public projection and JSON validation, and Express controllers/routes only adapt HTTP to the service contract.

**Tech Stack:** Node.js `22.23.1`, TypeScript `5.9.x`, Express 5, Zod, Vitest, Supertest, Prisma `7.8.0`, PostgreSQL 17.10, `@prisma/client`, `@prisma/adapter-pg`, and `pg`.

## Global Constraints

- Work from `D:\WEB00_BACKEND` on branch `feat/web00-backend-b3`.
- B3 starts from commit `5684d9cab01469e7fd727cd2aaefc656468e289b`.
- This planning task creates only `docs/WEB00_BACKEND_B3_IMPLEMENTATION_PLAN.md`.
- Future B3 implementation may change only backend implementation files and tests required by this plan.
- Existing root frontend files, root assets, docs other than approved B3 planning/closeout documents, and GitHub workflows must not change during B3 implementation.
- Do not change Prisma schema, migrations, migration lock, or B2 seed/snapshot in B3.
- B2 seed keeps the current 15 site records as `draft`; B3 tests create their own published/draft/inactive/deleted fixtures in `TEST_DATABASE_URL`.
- Do not add authentication, JWT, cookies, admin API, admin UI, mutations, uploads, Supabase Storage, Redis, frontend adapter, CORS for GitHub Pages, Render deploy, GitHub Pages changes, automatic views counter, or database indexes.
- All backend TypeScript relative imports continue to use emitted `.js` extensions under NodeNext ESM.
- `app.ts` must not read `process.env`; production environment parsing remains in `server.ts`.
- Health route must not access the database.
- All final commands run from `D:\WEB00_BACKEND\backend` through `D:\WEB00_TOOLS\node-v22.23.1-win-x64\npm.cmd`.
- Do not print `backend/.env`, database URLs, passwords, raw Prisma errors, SQL text from failures, stack traces, or secrets.
- Do not commit generated Prisma Client, `backend/.env`, `backend/dist`, `backend/node_modules`, `backend/coverage`, database dumps, npm cache, frontend files, workflow files, or deploy artifacts.

---

## 1. Goal

B3 implements the first public catalog API surface:

- `GET /api/sites`;
- `GET /api/sites/popular`;
- `GET /api/sites/:slug`;
- `GET /api/categories`;
- `GET /api/categories/:slug`.

The API is read-only. It exposes only public-safe catalog projections backed by the B2 PostgreSQL schema. It must hide all sites unless they satisfy the centralized site visibility guard:

```typescript
status = "published";
active = true;
deletedAt = null;
```

Categories are public only when `active = true`.

B3 is successful when public routes, projections, validation, database query behavior, dependency injection, and API/integration tests are complete while all existing B1/B2 tests continue to pass.

## 2. Preconditions

Before a future B3 implementation starts:

```powershell
Set-Location D:\WEB00_BACKEND
git branch --show-current
git log -1 --format="%H %s"
git status --short
git diff --cached --name-only
Test-Path backend\.env
git check-ignore -q backend/.env
```

Expected:

- branch is `feat/web00-backend-b3`;
- HEAD is `5684d9cab01469e7fd727cd2aaefc656468e289b feat: add WEB00 backend B2 database foundation`;
- working tree is clean except the approved B3 plan file if it has not yet been committed;
- staged area is empty before implementation;
- `backend/.env` exists locally and is ignored by Git;
- PostgreSQL 17.10 is available on `127.0.0.1:5433`;
- B2 migration is applied to `web00_backend_dev` and `web00_backend_test`;
- `backend/prisma/seed-data/web00-catalog.json` still contains 7 categories and 15 draft sites.

Run read-only checks:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$env:PATH = "$PortableRoot;$env:PATH"

Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run prisma:validate
& $PortableNpm run db:migrate:status
& $PortableNpm run seed:verify
```

Expected:

- Prisma schema is valid;
- migration status is clean;
- snapshot verification reports `categories=7 sites=15`;
- no database data is changed by precondition checks.

## 3. Scope

B3 includes:

- public read-only site list, popular list, site detail, category list, and category detail endpoints;
- Zod validation for params and query strings;
- centralized public site/category visibility contracts;
- Prisma repository using explicit `select` projections and no unrestricted `include`;
- service layer for pagination, filtering, route/domain rules, and safe error creation;
- mapper layer for public response projections and gallery JSON validation;
- Express controllers and routes;
- dependency injection from `server.ts` into `createApp`;
- graceful Prisma disconnect during server shutdown;
- unit tests for validation, mapping, sorting, visibility guard, and service behavior;
- Supertest API tests with fake services where useful;
- PostgreSQL integration tests using only `TEST_DATABASE_URL`;
- final verification with existing B1/B2 tests preserved.

## 4. Explicit Out-Of-Scope

B3 does not include:

- admin API;
- authentication, JWT, sessions, cookies, users, or roles enforcement;
- site/category create, update, delete, archive, publish, or admin CRUD;
- image upload;
- Supabase Storage;
- admin UI;
- frontend adapter or frontend changes;
- Redis;
- automatic views counter;
- Render deploy;
- GitHub Pages changes;
- CORS for GitHub Pages, which remains a separate B8 integration task;
- database schema changes, new migrations, new indexes, new extensions, or seed changes;
- changing the current 15 B2 seed sites from `draft` to `published`;
- exposing internal UUIDs or internal catalog fields;
- adding new dependencies.

## 5. Public API Contract

### 5.1 `GET /api/sites`

Query parameters:

| Name | Type | Default | Rule |
| --- | --- | --- | --- |
| `page` | integer | `1` | minimum `1` |
| `limit` | integer | `12` | minimum `1`, maximum `20` |
| `search` | string | absent | trimmed, maximum `100`; empty string becomes absent |
| `category` | slug string | absent | exact match against `category.slug` |
| `tags` | comma-separated string | absent | max `10` normalized unique tags; all must be present |
| `sort` | enum | `sortOrder` | `sortOrder`, `newest`, `popular`, `title` |

Unknown query fields are rejected with `400 VALIDATION_ERROR`. This strict option is chosen because public catalog filtering is small and stable; rejecting unknown fields catches integration mistakes early instead of silently returning surprising data.

Semantics:

- `skip = (page - 1) * limit`;
- `take = limit`;
- `search` checks `title` and `shortDescription` with `contains` and `mode: "insensitive"`;
- `category` uses exact `category.slug`;
- `tags` uses Prisma `hasEvery` after trimming, lowercasing, empty removal, and duplicate removal;
- records and count run in one Prisma `$transaction`;
- every query applies the centralized public site visibility guard;
- every sort mode has a stable secondary sort.

Sort contracts:

```typescript
sortOrder: [
  { sortOrder: "asc" },
  { createdAt: "desc" },
  { slug: "asc" }
]

newest: [
  { createdAt: "desc" },
  { slug: "asc" }
]

popular: [
  { featured: "desc" },
  { views: "desc" },
  { sortOrder: "asc" },
  { createdAt: "desc" },
  { slug: "asc" }
]

title: [
  { title: "asc" },
  { slug: "asc" }
]
```

Response:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 0,
    "totalPages": 0
  }
}
```

### 5.2 `GET /api/sites/popular`

Query parameters:

| Name | Type | Default | Rule |
| --- | --- | --- | --- |
| `limit` | integer | `6` | minimum `1`, maximum `20` |
| `category` | slug string | absent | exact match against `category.slug` |

Unknown query fields are rejected with `400 VALIDATION_ERROR`.

Sorting is exactly:

```typescript
[
  { featured: "desc" },
  { views: "desc" },
  { sortOrder: "asc" },
  { createdAt: "desc" },
  { slug: "asc" }
]
```

Rules:

- public visibility guard is applied;
- `views` is not incremented;
- route `/api/sites/popular` is registered before `/api/sites/:slug`;
- response is `{ "data": SiteSummary[] }`.

### 5.3 `GET /api/sites/:slug`

Rules:

- `slug` is validated before repository access;
- returns only public-visible sites;
- missing, draft, archived, inactive, or deleted site returns `404 SITE_NOT_FOUND`;
- response excludes internal UUIDs and internal fields;
- invalid `galleryImages` JSON throws a safe `INTERNAL_ERROR` through the existing error middleware;
- raw DB data, raw JSON, stack, SQL, and DB URLs are never returned.

Response:

```json
{
  "data": {
    "slug": "example",
    "title": "Example",
    "category": { "slug": "goods", "title": "Товары" },
    "shortDescription": "Short description",
    "fullDescription": "Full description",
    "features": [],
    "tags": [],
    "demoUrl": null,
    "siteUrl": null,
    "previewImageUrl": null,
    "galleryImages": [],
    "previewType": null,
    "demoMode": null,
    "priceAmountCents": null,
    "priceLabel": null,
    "developmentDays": null,
    "deliveryLabel": null,
    "featured": false,
    "publishedAt": "2026-07-24T00:00:00.000Z"
  }
}
```

### 5.4 `GET /api/categories`

Query parameters:

| Name | Type | Default | Rule |
| --- | --- | --- | --- |
| `includeCounts` | boolean | `false` | accepts `true` or `false` only |

Unknown query fields are rejected with `400 VALIDATION_ERROR`.

Rules:

- returns only active categories;
- sorted by `sortOrder ASC`, `title ASC`, `slug ASC`;
- when `includeCounts=true`, `siteCount` counts only sites that satisfy the centralized public site visibility guard;
- draft, archived, inactive, and deleted sites are not counted.

Response without counts:

```json
{
  "data": [
    {
      "slug": "goods",
      "title": "Товары",
      "description": null,
      "sortOrder": 20
    }
  ]
}
```

Response with counts:

```json
{
  "data": [
    {
      "slug": "goods",
      "title": "Товары",
      "description": null,
      "sortOrder": 20,
      "siteCount": 3
    }
  ]
}
```

### 5.5 `GET /api/categories/:slug`

Query parameters:

| Name | Type | Default | Rule |
| --- | --- | --- | --- |
| `includeSites` | boolean | `false` | accepts `true` or `false` only |
| `page` | integer | `1` | minimum `1`; used only when `includeSites=true` |
| `limit` | integer | `12` | minimum `1`, maximum `20`; used only when `includeSites=true` |
| `sort` | enum | `sortOrder` | same site sort contract; used only when `includeSites=true` |

Unknown query fields are rejected with `400 VALIDATION_ERROR`.

Rules:

- inactive or missing category returns `404 CATEGORY_NOT_FOUND`;
- when `includeSites=false`, response does not include `sites` and does not include pagination `meta`;
- when `includeSites=true`, response includes only public-visible sites in the category;
- `siteCount`, `total`, and `totalPages` never include hidden records.

Response without sites:

```json
{
  "data": {
    "slug": "goods",
    "title": "Товары",
    "description": null,
    "sortOrder": 20
  }
}
```

Response with sites:

```json
{
  "data": {
    "slug": "goods",
    "title": "Товары",
    "description": null,
    "sortOrder": 20,
    "siteCount": 1,
    "sites": []
  },
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 1,
    "totalPages": 1
  }
}
```

## 6. Architecture And Dependency Injection

### 6.1 Existing Boundaries To Preserve

Current B1/B2 contracts:

```typescript
export interface CreateAppOptions {
  env: AppEnv;
  logger?: AppLogger;
  registerTestRoutes?: (app: Express) => void;
  now?: () => Date;
}
```

```typescript
export interface CreatePrismaClientOptions {
  databaseUrl: string;
  logQueries?: boolean;
  poolMax?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}
```

B3 must extend these contracts without moving environment reads into `app.ts`.

### 6.2 Future `createApp` Contract

Future B3 updates `CreateAppOptions` to accept the public catalog service:

```typescript
import type { Express } from "express";
import type { AppEnv } from "./config/env.js";
import type { AppLogger } from "./lib/logger.js";
import type { PublicCatalogService } from "./modules/public-catalog/public-catalog.service.js";

export interface CreateAppOptions {
  env: AppEnv;
  logger?: AppLogger;
  publicCatalogService?: PublicCatalogService;
  registerTestRoutes?: (app: Express) => void;
  now?: () => Date;
}
```

Mounting rule:

```typescript
if (options.publicCatalogService) {
  app.use("/api", createPublicCatalogRouter({ service: options.publicCatalogService }));
}
```

Required route order inside `createPublicCatalogRouter`:

```typescript
router.get("/sites", controller.listSites);
router.get("/sites/popular", controller.listPopularSites);
router.get("/sites/:slug", controller.getSiteBySlug);
router.get("/categories", controller.listCategories);
router.get("/categories/:slug", controller.getCategoryBySlug);
```

Important: because Express matches routes in declaration order, the future implementation must register `/sites/popular` before `/sites/:slug`. If a single router groups `/sites` routes, the exact order inside that group must still put `/popular` before `/:slug`.

### 6.3 Future `server.ts` Contract

`server.ts` remains the only place that reads process environment for production startup:

```typescript
export interface StartServerOptions {
  env: AppEnv;
  databaseEnv: DatabaseEnv;
  logger?: AppLogger;
  now?: () => Date;
  createPrisma?: typeof createPrismaClient;
}

export interface StartedServer {
  prisma: PrismaClient;
  server: Server;
}

export function startServer(options: StartServerOptions): StartedServer;
```

Production startup:

```typescript
export function main(): StartedServer {
  const env = parseEnv(process.env);
  const databaseEnv = parseDatabaseEnv(process.env);

  return startServer({ env, databaseEnv });
}
```

Production dependency construction:

```typescript
const prisma = createPrisma({
  databaseUrl: options.databaseEnv.DATABASE_URL
});
const repository = createPrismaPublicCatalogRepository({ prisma });
const service = createPublicCatalogService({ repository });
const app = createApp({
  env: options.env,
  logger,
  now,
  publicCatalogService: service
});
```

Shutdown rule:

```typescript
server.close(async (error?: Error) => {
  clearTimeout(forcedTimeout);
  await prisma.$disconnect();
  if (error) {
    options.exit(1);
    return;
  }
});
```

The future shutdown implementation must call `prisma.$disconnect()` exactly once for a normal shutdown signal and must still avoid duplicate shutdown on repeated signals.

### 6.4 Failure Handling

- DB connection failure during public API calls becomes a safe `500 INTERNAL_ERROR`.
- Raw Prisma error names, SQL, stack traces, and database URLs never enter the HTTP response.
- Error logging, if added, must use existing safe logger patterns and must not log secrets.
- `GET /api/health` remains DB-free and returns successfully even when the public catalog service is absent in isolated tests.
- `registerTestRoutes` remains test-only and is never called from production `main()`.

## 7. File Map

Create:

- `backend/src/modules/public-catalog/public-catalog.types.ts`: shared public query, record, response, repository, and service interfaces.
- `backend/src/modules/public-catalog/public-catalog.schemas.ts`: Zod params/query validators and public response schemas.
- `backend/src/modules/public-catalog/public-catalog.visibility.ts`: immutable public site and category visibility guards.
- `backend/src/modules/public-catalog/public-catalog.sort.ts`: approved sort enums and Prisma orderBy mapping.
- `backend/src/modules/public-catalog/public-catalog.mapper.ts`: public projection and `galleryImages` validation.
- `backend/src/modules/public-catalog/public-catalog.repository.ts`: Prisma repository with explicit `select`, `$transaction`, and no N+1.
- `backend/src/modules/public-catalog/public-catalog.service.ts`: domain behavior, not-found errors, pagination metadata, and repository orchestration.
- `backend/src/modules/public-catalog/public-catalog.controller.ts`: Express request/response adapter and async handlers.
- `backend/src/modules/public-catalog/public-catalog.routes.ts`: route registration with `/sites/popular` before `/sites/:slug`.
- `backend/tests/public-catalog.validation.test.ts`: query parsing, slug validation, tags normalization, unknown query rejection, and boundaries.
- `backend/tests/public-catalog.sort.test.ts`: sort mapping and stable secondary sorts.
- `backend/tests/public-catalog.mapper.test.ts`: public projection, hidden-field exclusion, gallery JSON validation.
- `backend/tests/public-catalog.visibility.test.ts`: centralized immutable visibility guards.
- `backend/tests/public-catalog.service.test.ts`: service behavior with fake repository.
- `backend/tests/public-catalog.routes.test.ts`: controller/router behavior with fake service, including `/popular` precedence.
- `backend/tests/integration/public-catalog-api.test.ts`: PostgreSQL-backed API behavior through Supertest and `TEST_DATABASE_URL`.

Modify:

- `backend/src/app.ts`: extend `CreateAppOptions`, mount public catalog router when service is injected.
- `backend/src/server.ts`: parse `DatabaseEnv` in `main`, create Prisma client/repository/service in `startServer`, disconnect Prisma on shutdown.
- `backend/src/lib/errors.ts`: add `SITE_NOT_FOUND` and `CATEGORY_NOT_FOUND` to `ErrorCode`.
- `backend/tests/server.test.ts`: cover Prisma disconnect on graceful shutdown and production dependency injection shape.
- `backend/tests/errors.test.ts`: cover new public not-found codes and safe DB failure mapping if not already covered elsewhere.

Do not modify:

- `backend/prisma/schema.prisma`;
- `backend/prisma/migrations/**`;
- `backend/prisma/seed-data/web00-catalog.json`;
- `backend/prisma/seed.ts`;
- `backend/prisma/seed-web00-data.ts`;
- `backend/package.json`;
- `backend/package-lock.json`;
- frontend files;
- workflows.

## 8. Validation Contract

### 8.1 Shared Validation Helpers

`public-catalog.schemas.ts` produces these values:

```typescript
export const siteSortSchema = z.enum(["sortOrder", "newest", "popular", "title"]);
export type SiteSort = z.infer<typeof siteSortSchema>;

export interface PaginationQuery {
  limit: number;
  page: number;
}

export interface SiteListQuery extends PaginationQuery {
  category?: string;
  search?: string;
  sort: SiteSort;
  tags: string[];
}

export interface PopularSitesQuery {
  category?: string;
  limit: number;
}

export interface CategoryListQuery {
  includeCounts: boolean;
}

export interface CategoryDetailQuery extends PaginationQuery {
  includeSites: boolean;
  sort: SiteSort;
}
```

Slug validation:

```typescript
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
```

Integer parsing:

```typescript
function parseIntegerQuery(value: unknown, field: string): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw validationError(field, "Must be a positive integer.");
  }

  return Number.parseInt(value, 10);
}
```

Boolean parsing:

```typescript
function parseBooleanQuery(value: unknown, field: string, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw validationError(field, "Must be true or false.");
}
```

Tag normalization:

```typescript
export function normalizeTags(value: unknown): string[] {
  if (value === undefined || value === "") {
    return [];
  }

  if (typeof value !== "string") {
    throw validationError("tags", "Must be a comma-separated string.");
  }

  const tags = Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLocaleLowerCase("ru-RU"))
        .filter((tag) => tag.length > 0)
    )
  );

  if (tags.length > 10) {
    throw validationError("tags", "Must contain no more than 10 tags.");
  }

  return tags;
}
```

### 8.2 Unknown Query Handling

Each parser owns an allow-list:

```typescript
const siteListQueryKeys = new Set(["page", "limit", "search", "category", "tags", "sort"]);
```

If `Object.keys(request.query)` contains a key outside the allow-list, the parser throws:

```typescript
new AppError({
  code: "VALIDATION_ERROR",
  details: [{ path: key, message: "Unknown query field." }],
  message: "Invalid request.",
  statusCode: 400
});
```

## 9. Public Visibility And Projection

### 9.1 Visibility Guards

`public-catalog.visibility.ts` defines the single source of truth:

```typescript
import type { Prisma } from "../../generated/prisma/client.js";

export const PUBLIC_SITE_VISIBILITY_WHERE = Object.freeze({
  active: true,
  deletedAt: null,
  status: "published"
} satisfies Prisma.SiteWhereInput);

export const PUBLIC_CATEGORY_VISIBILITY_WHERE = Object.freeze({
  active: true
} satisfies Prisma.CategoryWhereInput);

export function publicSiteVisibilityWhere(): Prisma.SiteWhereInput {
  return { ...PUBLIC_SITE_VISIBILITY_WHERE };
}

export function publicCategoryVisibilityWhere(): Prisma.CategoryWhereInput {
  return { ...PUBLIC_CATEGORY_VISIBILITY_WHERE };
}
```

Rules:

- repositories compose queries by calling `publicSiteVisibilityWhere()` and `publicCategoryVisibilityWhere()`;
- controllers and services never hand-build visibility filters;
- draft, archived, inactive, and deleted sites never appear publicly;
- inactive categories never appear publicly;
- relation counts use the same site visibility helper.

### 9.2 Public Site Summary

```typescript
export interface PublicSiteSummary {
  category: {
    slug: string;
    title: string;
  };
  deliveryLabel: string | null;
  demoMode: string | null;
  demoUrl: string | null;
  developmentDays: number | null;
  featured: boolean;
  features: string[];
  galleryImages: PublicGalleryImage[];
  previewImageUrl: string | null;
  previewType: string | null;
  priceAmountCents: number | null;
  priceLabel: string | null;
  shortDescription: string;
  siteUrl: string | null;
  slug: string;
  tags: string[];
  title: string;
}
```

### 9.3 Public Site Detail

```typescript
export interface PublicSiteDetail extends PublicSiteSummary {
  fullDescription: string | null;
  publishedAt: string | null;
}
```

### 9.4 Gallery Image

```typescript
export interface PublicGalleryImage {
  alt: string;
  sortOrder: number;
  storagePath: string;
  url: string;
}
```

Validation:

```typescript
export const publicGalleryImageSchema = z.object({
  alt: z.string().min(1),
  sortOrder: z.number().int().min(0),
  storagePath: z.string().min(1),
  url: z.string().min(1)
});

export const publicGalleryImagesSchema = z.array(publicGalleryImageSchema);
```

If `galleryImages` fails validation, mapper throws:

```typescript
new AppError({
  code: "INTERNAL_ERROR",
  message: "Internal server error.",
  statusCode: 500
});
```

Fields that must never be returned:

- `id`;
- `categoryId`;
- `legacyTitle`;
- `demoLocalUrl`;
- `externalDemoUrl`;
- `originalDemoUrl`;
- `views`;
- `active`;
- `status`;
- `deletedAt`;
- `createdAt`;
- `updatedAt`;
- audit fields;
- auth fields.

## 10. Sites Query Contract

### 10.1 Repository Interface

```typescript
export interface PublicCatalogRepository {
  getPublicSiteBySlug(slug: string): Promise<PublicSiteRecord | null>;
  listPopularSites(query: PopularSitesQuery): Promise<PublicSiteRecord[]>;
  listSites(query: SiteListQuery): Promise<PaginatedPublicSiteRecords>;
  getPublicCategoryBySlug(slug: string): Promise<PublicCategoryRecord | null>;
  listCategories(query: CategoryListQuery): Promise<PublicCategoryRecord[]>;
  getPublicCategoryWithSites(
    slug: string,
    query: CategoryDetailQuery
  ): Promise<PublicCategoryWithSitesRecord | null>;
}
```

### 10.2 Site Record Select

The repository uses one explicit select:

```typescript
export const publicSiteSelect = {
  category: {
    select: {
      slug: true,
      title: true
    }
  },
  deliveryLabel: true,
  demoMode: true,
  demoUrl: true,
  developmentDays: true,
  featured: true,
  features: true,
  fullDescription: true,
  galleryImages: true,
  previewImageUrl: true,
  previewType: true,
  priceAmountCents: true,
  priceLabel: true,
  publishedAt: true,
  shortDescription: true,
  siteUrl: true,
  slug: true,
  tags: true,
  title: true
} satisfies Prisma.SiteSelect;
```

No repository method may use unrestricted `include`.

### 10.3 List Query

```typescript
const where: Prisma.SiteWhereInput = {
  ...publicSiteVisibilityWhere(),
  ...(query.search
    ? {
        OR: [
          { title: { contains: query.search, mode: "insensitive" } },
          { shortDescription: { contains: query.search, mode: "insensitive" } }
        ]
      }
    : {}),
  ...(query.category ? { category: { slug: query.category } } : {}),
  ...(query.tags.length > 0 ? { tags: { hasEvery: query.tags } } : {})
};

const [total, rows] = await prisma.$transaction([
  prisma.site.count({ where }),
  prisma.site.findMany({
    orderBy: siteOrderBy(query.sort),
    select: publicSiteSelect,
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    where
  })
]);
```

Pagination metadata:

```typescript
const meta = {
  page: query.page,
  limit: query.limit,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / query.limit)
};
```

### 10.4 Popular Query

```typescript
const where: Prisma.SiteWhereInput = {
  ...publicSiteVisibilityWhere(),
  ...(query.category ? { category: { slug: query.category } } : {})
};

const rows = await prisma.site.findMany({
  orderBy: siteOrderBy("popular"),
  select: publicSiteSelect,
  take: query.limit,
  where
});
```

No write query is executed for popular endpoint.

### 10.5 Detail Query

```typescript
const row = await prisma.site.findFirst({
  select: publicSiteSelect,
  where: {
    ...publicSiteVisibilityWhere(),
    slug
  }
});
```

Service maps `null` to:

```typescript
new AppError({
  code: "SITE_NOT_FOUND",
  message: "Site not found.",
  statusCode: 404
});
```

## 11. Categories Query Contract

### 11.1 Category Selects

```typescript
export const publicCategorySelect = {
  description: true,
  slug: true,
  sortOrder: true,
  title: true
} satisfies Prisma.CategorySelect;
```

With counts:

```typescript
export const publicCategoryWithCountSelect = {
  ...publicCategorySelect,
  _count: {
    select: {
      sites: {
        where: publicSiteVisibilityWhere()
      }
    }
  }
} satisfies Prisma.CategorySelect;
```

If Prisma generated types reject filtered relation count syntax in this version, use a repository `$transaction` with a grouped safe equivalent:

```typescript
const [categories, counts] = await prisma.$transaction([
  prisma.category.findMany({ select: publicCategorySelect, where, orderBy }),
  prisma.site.groupBy({
    by: ["categoryId"],
    _count: { _all: true },
    where: {
      ...publicSiteVisibilityWhere(),
      category: publicCategoryVisibilityWhere()
    }
  })
]);
```

The fallback may use `categoryId` inside the repository only. It must not expose `categoryId` to services, controllers, or responses.

### 11.2 List Categories

```typescript
const rows = await prisma.category.findMany({
  orderBy: [
    { sortOrder: "asc" },
    { title: "asc" },
    { slug: "asc" }
  ],
  select: query.includeCounts ? publicCategoryWithCountSelect : publicCategorySelect,
  where: publicCategoryVisibilityWhere()
});
```

### 11.3 Category Detail

First check the category:

```typescript
const category = await prisma.category.findFirst({
  select: publicCategorySelect,
  where: {
    ...publicCategoryVisibilityWhere(),
    slug
  }
});
```

If missing:

```typescript
new AppError({
  code: "CATEGORY_NOT_FOUND",
  message: "Category not found.",
  statusCode: 404
});
```

If `includeSites=true`, run site count and site rows in one `$transaction`:

```typescript
const siteWhere: Prisma.SiteWhereInput = {
  ...publicSiteVisibilityWhere(),
  category: { slug }
};

const [total, sites] = await prisma.$transaction([
  prisma.site.count({ where: siteWhere }),
  prisma.site.findMany({
    orderBy: siteOrderBy(query.sort),
    select: publicSiteSelect,
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    where: siteWhere
  })
]);
```

## 12. Error Contract

Extend `ErrorCode`:

```typescript
export type ErrorCode =
  | "ROUTE_NOT_FOUND"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "SITE_NOT_FOUND"
  | "CATEGORY_NOT_FOUND";
```

Public catalog errors:

| Condition | HTTP | Code | Message |
| --- | --- | --- | --- |
| Invalid query or param | `400` | `VALIDATION_ERROR` | `Invalid request.` |
| Missing or hidden site | `404` | `SITE_NOT_FOUND` | `Site not found.` |
| Missing or inactive category | `404` | `CATEGORY_NOT_FOUND` | `Category not found.` |
| Unknown DB/runtime failure | `500` | `INTERNAL_ERROR` | `Internal server error.` |

All error responses keep the B1 envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request.",
    "requestId": "req_example",
    "details": []
  }
}
```

Rules:

- every public error includes `requestId`;
- validation details may include `path`, `message`, and optional machine `code`;
- raw Prisma errors, SQL, stack, DB URLs, and secrets are not returned;
- Express 5 async handlers may return `Promise<void>`;
- rejected promises must flow into the existing error middleware;
- do not call `next(error)` manually inside every async controller and also throw the same error.

## 13. Database Query Strategy

B3 uses the B2 PostgreSQL schema as-is.

Rules:

- all public site queries apply `publicSiteVisibilityWhere()`;
- all public category queries apply `publicCategoryVisibilityWhere()`;
- list endpoints use explicit `select`;
- list endpoints never use unrestricted `include`;
- category data for site list/detail is fetched via Prisma relation `select` to avoid N+1 queries;
- `count` and `findMany` for paginated site responses run in one `$transaction`;
- maximum page size is `20`;
- no new database index is added in B3;
- no `pg_trgm` extension is added in B3;
- future search quality improvements may consider `pg_trgm` and dedicated indexes only after measured query evidence in a later database performance task.

## 14. Testing Strategy

### 14.1 Unit Tests

Unit tests cover:

- query parsing for every endpoint;
- `page` and `limit` boundaries;
- `tags` normalization, duplicate removal, and max tag rejection;
- strict unknown query rejection;
- sorting mapping for every approved mode;
- public projection for summary and detail;
- gallery JSON validation;
- public visibility guard immutability and reuse;
- service not-found behavior;
- DB failure safe `INTERNAL_ERROR` mapping through API layer when using a fake throwing service.

### 14.2 Integration/API Tests

Integration tests use `TEST_DATABASE_URL` only.

Rules:

- never use `DATABASE_URL`;
- never mutate dev or production data;
- create B3-specific fixtures in `web00_backend_test`;
- clean fixtures before and after each test;
- do not rely on B2 seed being published;
- create minimal categories/sites per test;
- use deterministic `views`, `featured`, `sortOrder`, `createdAt`, and `publishedAt`;
- verify no internal UUID/fields leak in serialized responses.

Fixture categories:

```typescript
const categories = {
  goods: { active: true, slug: "goods", title: "Товары" },
  services: { active: true, slug: "services", title: "Услуги" },
  inactive: { active: false, slug: "hidden-category", title: "Hidden" }
};
```

Fixture site states:

- `published`: `status="published"`, `active=true`, `deletedAt=null`;
- `draft`: `status="draft"`, `active=true`, `deletedAt=null`;
- `archived`: `status="archived"`, `active=true`, `deletedAt=null`;
- `inactive`: `status="published"`, `active=false`, `deletedAt=null`;
- `deleted`: `status="published"`, `active=true`, `deletedAt` set.

Required API tests:

- `GET /api/sites` returns `200`;
- pagination and `meta` are correct;
- search is case-insensitive over `title` and `shortDescription`;
- category filter uses exact category slug;
- tags use `hasEvery`;
- each sort mode returns deterministic order;
- max limit rejection returns `400 VALIDATION_ERROR`;
- invalid query returns `400 VALIDATION_ERROR`;
- draft sites are hidden;
- archived sites are hidden;
- inactive sites are hidden;
- deleted sites are hidden;
- inactive category is hidden;
- `/api/sites/popular` is not treated as `:slug`;
- popular ordering matches approved sort;
- site detail returns `200` for published and `404 SITE_NOT_FOUND` for missing/hidden;
- categories list returns active categories only;
- `includeCounts=true` counts public records only;
- category detail `includeSites=false` excludes sites and pagination meta;
- category detail `includeSites=true` includes only public sites and correct meta;
- fake DB failure returns safe `500 INTERNAL_ERROR`;
- `requestId` is present on errors;
- responses do not contain internal UUIDs or internal fields;
- all existing 60 B1/B2 tests remain PASS.

## 15. Ordered Implementation Tasks

### Task 1: Public Contracts And Validation

**Files:**

- Create: `backend/src/modules/public-catalog/public-catalog.types.ts`
- Create: `backend/src/modules/public-catalog/public-catalog.schemas.ts`
- Test: `backend/tests/public-catalog.validation.test.ts`

**Interfaces consumed:**

- `AppError` from `backend/src/lib/errors.ts`
- Zod from existing dependency `zod`

**Interfaces produced:**

```typescript
export type SiteSort = "sortOrder" | "newest" | "popular" | "title";
export interface SiteListQuery {
  category?: string;
  limit: number;
  page: number;
  search?: string;
  sort: SiteSort;
  tags: string[];
}
export interface PopularSitesQuery {
  category?: string;
  limit: number;
}
export interface CategoryListQuery {
  includeCounts: boolean;
}
export interface CategoryDetailQuery {
  includeSites: boolean;
  limit: number;
  page: number;
  sort: SiteSort;
}
export function parseSiteListQuery(input: unknown): SiteListQuery;
export function parsePopularSitesQuery(input: unknown): PopularSitesQuery;
export function parseCategoryListQuery(input: unknown): CategoryListQuery;
export function parseCategoryDetailQuery(input: unknown): CategoryDetailQuery;
export function parseSlugParam(input: unknown, path: string): string;
export function normalizeTags(value: unknown): string[];
```

- [ ] **Step 1: Write failing validation tests**

Add tests for defaults, integer parsing, limit boundaries, search trimming, slug validation, tags normalization, boolean parsing, sort enum validation, and unknown query rejection.

Run:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$env:PATH = "$PortableRoot;$env:PATH"
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm exec vitest run tests/public-catalog.validation.test.ts
```

Expected RED:

- fails because `public-catalog.schemas.ts` does not exist or exported parsers are missing.

- [ ] **Step 2: Implement validation module**

Create the schemas and parsers exactly as described in sections 8 and 5.

- [ ] **Step 3: Run focused validation tests**

Run:

```powershell
& $PortableNpm exec vitest run tests/public-catalog.validation.test.ts
```

Expected GREEN:

- validation tests pass;
- invalid query produces `AppError` with `code="VALIDATION_ERROR"` and `statusCode=400`;
- no backend files outside the new public catalog module and its test changed.

**PASS criteria:**

- all parsers return normalized typed values;
- unknown query fields are rejected;
- `limit` is capped at `20`;
- no dependencies added.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/src/modules/public-catalog/public-catalog.types.ts backend/src/modules/public-catalog/public-catalog.schemas.ts backend/tests/public-catalog.validation.test.ts
```

**Out-of-scope:**

- Prisma queries;
- Express routes;
- schema or seed changes.

### Task 2: Repository And Prisma Queries

**Files:**

- Create: `backend/src/modules/public-catalog/public-catalog.visibility.ts`
- Create: `backend/src/modules/public-catalog/public-catalog.sort.ts`
- Create: `backend/src/modules/public-catalog/public-catalog.repository.ts`
- Test: `backend/tests/public-catalog.sort.test.ts`
- Test: `backend/tests/public-catalog.visibility.test.ts`

**Interfaces consumed:**

- `SiteListQuery`, `PopularSitesQuery`, `CategoryListQuery`, `CategoryDetailQuery`
- generated `PrismaClient` and `Prisma` types from `backend/src/generated/prisma/client.js`

**Interfaces produced:**

```typescript
export function publicSiteVisibilityWhere(): Prisma.SiteWhereInput;
export function publicCategoryVisibilityWhere(): Prisma.CategoryWhereInput;
export function siteOrderBy(sort: SiteSort): Prisma.SiteOrderByWithRelationInput[];
export function createPrismaPublicCatalogRepository(
  options: { prisma: PrismaClient }
): PublicCatalogRepository;
```

- [ ] **Step 1: Write failing guard and sort tests**

Tests assert:

- site guard is exactly `active=true`, `deletedAt=null`, `status="published"`;
- category guard is exactly `active=true`;
- returned guard objects can be mutated by callers without mutating the canonical constants;
- all sort modes match section 5;
- unsupported sort cannot be represented by `SiteSort`.

Run:

```powershell
& $PortableNpm exec vitest run tests/public-catalog.visibility.test.ts tests/public-catalog.sort.test.ts
```

Expected RED:

- missing modules.

- [ ] **Step 2: Implement guard and sort modules**

Use `Object.freeze` constants and clone-returning helper functions. Use explicit `Prisma.SiteOrderByWithRelationInput[]`.

- [ ] **Step 3: Implement Prisma repository**

Use explicit `select` only. Apply centralized guards. Use `$transaction` for paginated rows and counts. Register no writes and no `include`.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
& $PortableNpm exec vitest run tests/public-catalog.visibility.test.ts tests/public-catalog.sort.test.ts
```

Expected GREEN:

- guard and sort tests pass.

**PASS criteria:**

- repository compiles after `npm run typecheck`;
- public site queries apply centralized guard;
- list queries use `$transaction`;
- no N+1 category lookup exists;
- no schema/migration/seed files changed.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/src/modules/public-catalog/public-catalog.visibility.ts backend/src/modules/public-catalog/public-catalog.sort.ts backend/src/modules/public-catalog/public-catalog.repository.ts backend/tests/public-catalog.visibility.test.ts backend/tests/public-catalog.sort.test.ts
```

**Out-of-scope:**

- controllers;
- app/server integration;
- adding indexes.

### Task 3: Public Mappers And Projections

**Files:**

- Create: `backend/src/modules/public-catalog/public-catalog.mapper.ts`
- Test: `backend/tests/public-catalog.mapper.test.ts`

**Interfaces consumed:**

- `PublicSiteRecord`, `PublicCategoryRecord`, `PublicSiteSummary`, `PublicSiteDetail`, `PublicGalleryImage`
- `AppError`

**Interfaces produced:**

```typescript
export function mapSiteSummary(record: PublicSiteRecord): PublicSiteSummary;
export function mapSiteDetail(record: PublicSiteRecord): PublicSiteDetail;
export function mapCategory(record: PublicCategoryRecord): PublicCategorySummary;
export function mapCategoryDetail(record: PublicCategoryRecord): PublicCategoryDetail;
export function parsePublicGalleryImages(value: unknown): PublicGalleryImage[];
```

- [ ] **Step 1: Write failing mapper tests**

Tests assert:

- summary contains only allowed fields;
- detail adds only `fullDescription` and `publishedAt`;
- serialized mapped site does not contain `id`, `categoryId`, `legacyTitle`, `views`, `active`, `status`, `deletedAt`, `createdAt`, or `updatedAt`;
- valid gallery JSON maps to `PublicGalleryImage[]`;
- invalid gallery JSON throws `AppError` with `INTERNAL_ERROR`.

Run:

```powershell
& $PortableNpm exec vitest run tests/public-catalog.mapper.test.ts
```

Expected RED:

- mapper module missing.

- [ ] **Step 2: Implement mapper**

Use Zod schemas for `galleryImages` validation. Convert `publishedAt: Date | null` to ISO string or `null`.

- [ ] **Step 3: Run focused mapper tests**

Run:

```powershell
& $PortableNpm exec vitest run tests/public-catalog.mapper.test.ts
```

Expected GREEN:

- public projection is stable and internal fields do not serialize.

**PASS criteria:**

- invalid gallery JSON cannot leak raw DB data;
- public response types match section 9;
- no database calls in mapper.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/src/modules/public-catalog/public-catalog.mapper.ts backend/tests/public-catalog.mapper.test.ts
```

**Out-of-scope:**

- query validation;
- Prisma repository changes beyond consumed record types.

### Task 4: Sites Service, Controllers, And Routes

**Files:**

- Create: `backend/src/modules/public-catalog/public-catalog.service.ts`
- Create: `backend/src/modules/public-catalog/public-catalog.controller.ts`
- Create: `backend/src/modules/public-catalog/public-catalog.routes.ts`
- Modify: `backend/src/lib/errors.ts`
- Test: `backend/tests/public-catalog.service.test.ts`
- Test: `backend/tests/public-catalog.routes.test.ts`
- Test: `backend/tests/errors.test.ts`

**Interfaces consumed:**

- `PublicCatalogRepository`
- validators from `public-catalog.schemas.ts`
- mappers from `public-catalog.mapper.ts`

**Interfaces produced:**

```typescript
export interface PublicCatalogService {
  getSiteBySlug(slug: string): Promise<{ data: PublicSiteDetail }>;
  listPopularSites(query: PopularSitesQuery): Promise<{ data: PublicSiteSummary[] }>;
  listSites(query: SiteListQuery): Promise<{ data: PublicSiteSummary[]; meta: PaginationMeta }>;
  getCategoryBySlug(slug: string, query: CategoryDetailQuery): Promise<CategoryDetailResponse>;
  listCategories(query: CategoryListQuery): Promise<{ data: PublicCategorySummary[] }>;
}

export function createPublicCatalogService(
  options: { repository: PublicCatalogRepository }
): PublicCatalogService;

export function createPublicCatalogController(
  options: { service: PublicCatalogService }
): PublicCatalogController;

export function createPublicCatalogRouter(
  options: { service: PublicCatalogService }
): Router;
```

- [ ] **Step 1: Write failing site service tests**

Tests assert:

- `listSites` maps records and returns correct `meta`;
- `listPopularSites` returns data only and does not expose views;
- `getSiteBySlug` maps `null` to `SITE_NOT_FOUND`;
- repository rejection becomes safe `INTERNAL_ERROR` through controller/API behavior.

Run:

```powershell
& $PortableNpm exec vitest run tests/public-catalog.service.test.ts
```

Expected RED:

- service module missing.

- [ ] **Step 2: Extend error codes**

Add `SITE_NOT_FOUND` and `CATEGORY_NOT_FOUND` to `ErrorCode`. Add tests in `errors.test.ts` for the approved response envelopes.

- [ ] **Step 3: Implement sites service methods**

Service maps repository records to public responses and throws `AppError` for not-found. It does not import Express.

- [ ] **Step 4: Write failing route tests**

Use a fake service and Supertest. Tests assert:

- `/api/sites/popular` calls `listPopularSites`, not `getSiteBySlug("popular")`;
- route errors include `requestId`;
- invalid query returns `400 VALIDATION_ERROR`;
- thrown unknown fake service error returns safe `500 INTERNAL_ERROR`.

Run:

```powershell
& $PortableNpm exec vitest run tests/public-catalog.routes.test.ts
```

Expected RED:

- routes/controller missing.

- [ ] **Step 5: Implement controller and routes**

Controllers parse query/params, await service promises, and return JSON. They do not manually double-call `next(error)` after throwing.

- [ ] **Step 6: Run focused site service and route tests**

Run:

```powershell
& $PortableNpm exec vitest run tests/public-catalog.service.test.ts tests/public-catalog.routes.test.ts tests/errors.test.ts
```

Expected GREEN:

- sites service/routes and error code tests pass.

**PASS criteria:**

- `/popular` route precedes `/:slug`;
- no views counter write exists;
- no auth/admin/upload code exists;
- errors use B1 envelope.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/src/modules/public-catalog/public-catalog.service.ts backend/src/modules/public-catalog/public-catalog.controller.ts backend/src/modules/public-catalog/public-catalog.routes.ts backend/src/lib/errors.ts backend/tests/public-catalog.service.test.ts backend/tests/public-catalog.routes.test.ts backend/tests/errors.test.ts
```

**Out-of-scope:**

- production server wiring;
- PostgreSQL integration fixtures.

### Task 5: Categories Service, Controllers, And Routes

**Files:**

- Modify: `backend/src/modules/public-catalog/public-catalog.service.ts`
- Modify: `backend/src/modules/public-catalog/public-catalog.controller.ts`
- Modify: `backend/src/modules/public-catalog/public-catalog.routes.ts`
- Test: `backend/tests/public-catalog.service.test.ts`
- Test: `backend/tests/public-catalog.routes.test.ts`

**Interfaces consumed:**

- category query parsers;
- repository category methods;
- category mappers.

**Interfaces produced:**

- `listCategories(query: CategoryListQuery)`;
- `getCategoryBySlug(slug: string, query: CategoryDetailQuery)`.

- [ ] **Step 1: Write failing category service tests**

Tests assert:

- active category records map to public summaries;
- `includeCounts=true` preserves public-only counts from repository;
- missing category maps to `CATEGORY_NOT_FOUND`;
- `includeSites=false` response excludes `sites` and `meta`;
- `includeSites=true` response includes public site summaries and pagination `meta`.

Run:

```powershell
& $PortableNpm exec vitest run tests/public-catalog.service.test.ts
```

Expected RED:

- category service methods missing.

- [ ] **Step 2: Implement category service methods**

Use repository methods and mappers. Do not expose category IDs.

- [ ] **Step 3: Extend route tests for categories**

Tests assert:

- `GET /api/categories` validates `includeCounts`;
- `GET /api/categories/:slug` validates `includeSites`, `page`, `limit`, and `sort`;
- inactive/missing category maps to `404 CATEGORY_NOT_FOUND`.

- [ ] **Step 4: Implement category controller methods**

Controllers stay thin and only parse input, call service, and return service result.

- [ ] **Step 5: Run focused category tests**

Run:

```powershell
& $PortableNpm exec vitest run tests/public-catalog.service.test.ts tests/public-catalog.routes.test.ts
```

Expected GREEN:

- category service/routes pass.

**PASS criteria:**

- categories are active-only;
- category site counts exclude hidden sites;
- category detail with `includeSites=false` has no pagination meta;
- no schema/migration/seed changes.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/src/modules/public-catalog/public-catalog.service.ts backend/src/modules/public-catalog/public-catalog.controller.ts backend/src/modules/public-catalog/public-catalog.routes.ts backend/tests/public-catalog.service.test.ts backend/tests/public-catalog.routes.test.ts
```

**Out-of-scope:**

- admin category mutation behavior;
- frontend category adapter.

### Task 6: App/Server Dependency Injection And DB Shutdown

**Files:**

- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/server.test.ts`
- Test: `backend/tests/health.test.ts`
- Test: `backend/tests/repository-boundary.test.ts`

**Interfaces consumed:**

- `createPrismaClient(options: CreatePrismaClientOptions): PrismaClient`
- `parseDatabaseEnv(process.env): DatabaseEnv`
- `createPrismaPublicCatalogRepository`
- `createPublicCatalogService`
- `createPublicCatalogRouter`

**Interfaces produced:**

```typescript
export interface StartServerOptions {
  createPrisma?: typeof createPrismaClient;
  databaseEnv: DatabaseEnv;
  env: AppEnv;
  logger?: AppLogger;
  now?: () => Date;
}

export interface StartedServer {
  prisma: PrismaClient;
  server: Server;
}
```

- [ ] **Step 1: Write failing app injection tests**

Tests assert:

- `createApp({ env })` still works for health only;
- `createApp({ env, publicCatalogService: fake })` mounts `/api/sites`;
- `app.ts` import does not read `process.env`;
- health endpoint does not call fake public catalog service.

Run:

```powershell
& $PortableNpm exec vitest run tests/health.test.ts
```

Expected RED:

- public catalog route injection missing.

- [ ] **Step 2: Modify `app.ts`**

Add optional `publicCatalogService` to `CreateAppOptions`. Mount public catalog before `registerTestRoutes`, `notFoundMiddleware`, and `errorHandler`.

- [ ] **Step 3: Write failing server DI/shutdown tests**

Tests assert:

- `main()` is the only path that calls `parseEnv(process.env)` and `parseDatabaseEnv(process.env)`;
- `startServer` accepts injected `databaseEnv`;
- `startServer` creates Prisma client and public catalog service;
- graceful shutdown calls `prisma.$disconnect()` exactly once;
- repeated shutdown signal still closes only once.

- [ ] **Step 4: Modify `server.ts`**

Change `startServer` to accept `StartServerOptions`, create Prisma/repository/service, pass service into `createApp`, and disconnect Prisma on shutdown.

- [ ] **Step 5: Run focused server/app tests**

Run:

```powershell
& $PortableNpm exec vitest run tests/server.test.ts tests/health.test.ts tests/repository-boundary.test.ts
```

Expected GREEN:

- server/app injection tests pass;
- repository boundary still confirms no non-backend changes.

**PASS criteria:**

- `app.ts` does not read `process.env`;
- importing `app.ts` or `server.ts` does not open a port;
- production startup creates PrismaPg client;
- shutdown disconnects Prisma;
- test routes remain excluded from production.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/src/app.ts backend/src/server.ts backend/tests/server.test.ts backend/tests/health.test.ts backend/tests/repository-boundary.test.ts
```

**Out-of-scope:**

- CORS;
- deploy configuration;
- auth middleware.

### Task 7: Unit Test Consolidation

**Files:**

- Modify: all B3 unit test files created in Tasks 1-6

**Interfaces consumed:**

- all B3 module interfaces.

**Interfaces produced:**

- stable unit coverage for validation, sort, visibility, mapper, service, routes, app, and server.

- [ ] **Step 1: Run all B3 unit tests**

Run:

```powershell
& $PortableNpm exec vitest run `
  tests/public-catalog.validation.test.ts `
  tests/public-catalog.sort.test.ts `
  tests/public-catalog.visibility.test.ts `
  tests/public-catalog.mapper.test.ts `
  tests/public-catalog.service.test.ts `
  tests/public-catalog.routes.test.ts `
  tests/server.test.ts `
  tests/health.test.ts `
  tests/errors.test.ts
```

Expected:

- all focused B3 unit tests pass.

- [ ] **Step 2: Check test names and coverage intent**

Ensure test names explicitly mention:

- public visibility;
- hidden draft/archived/inactive/deleted behavior;
- `/popular` route precedence;
- no internal field leakage;
- safe internal errors.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
& $PortableNpm run typecheck
```

Expected:

- TypeScript passes under strict `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

**PASS criteria:**

- all B3 unit tests are deterministic;
- no tests depend on execution order;
- no test prints secrets or DB URLs.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/tests/public-catalog.validation.test.ts backend/tests/public-catalog.sort.test.ts backend/tests/public-catalog.visibility.test.ts backend/tests/public-catalog.mapper.test.ts backend/tests/public-catalog.service.test.ts backend/tests/public-catalog.routes.test.ts backend/tests/server.test.ts backend/tests/health.test.ts backend/tests/errors.test.ts
```

**Out-of-scope:**

- PostgreSQL fixtures;
- performance index work.

### Task 8: PostgreSQL API Integration Tests

**Files:**

- Create: `backend/tests/integration/public-catalog-api.test.ts`
- Modify: `backend/tests/integration/test-database.ts` only if fixture helpers are needed

**Interfaces consumed:**

- `createApp`;
- `createPrismaClient`;
- `createPrismaPublicCatalogRepository`;
- `createPublicCatalogService`;
- `withTestClient`;
- `TEST_DATABASE_URL`.

**Interfaces produced:**

```typescript
export async function cleanPublicCatalogFixtures(): Promise<void>;
export async function createPublicCatalogFixture(input: PublicCatalogFixtureInput): Promise<void>;
```

- [ ] **Step 1: Write failing integration tests**

Tests cover every item in section 14.2. They insert categories/sites directly into `web00_backend_test` or through Prisma connected to `TEST_DATABASE_URL`.

Run:

```powershell
& $PortableNpm exec vitest run tests/integration/public-catalog-api.test.ts
```

Expected RED:

- API routes or fixtures are missing.

- [ ] **Step 2: Implement integration fixtures**

Rules:

- delete only fixture rows created by B3 tests;
- use unique slug prefixes such as `b3-public-*`;
- never delete all seed rows from dev database;
- call `assertTestDatabaseUrl(parseDatabaseEnv(process.env))` before creating clients;
- never read or print database URLs.

- [ ] **Step 3: Run integration tests**

Run:

```powershell
& $PortableNpm exec vitest run tests/integration/public-catalog-api.test.ts
```

Expected GREEN:

- public API behavior passes against PostgreSQL test DB.

- [ ] **Step 4: Run existing B2 integration tests**

Run:

```powershell
& $PortableNpm exec vitest run tests/integration/prisma-migration.test.ts tests/seed.test.ts
```

Expected GREEN:

- B2 migration and seed tests still pass.

**PASS criteria:**

- B3 integration tests use `TEST_DATABASE_URL`;
- B2 seed remains draft;
- hidden records never appear;
- counts exclude hidden records;
- no internal fields leak;
- no schema/migration/seed changes.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/tests/integration/public-catalog-api.test.ts backend/tests/integration/test-database.ts
```

**Out-of-scope:**

- database schema changes;
- data migration;
- published seed conversion.

### Task 9: Full B3 Checkpoint

**Files:**

- No new implementation files.
- Verify all files changed by Tasks 1-8.

**Interfaces consumed:**

- full backend command surface from `backend/package.json`.

**Interfaces produced:**

- verified local B3 implementation ready for an owner-approved commit.

- [ ] **Step 1: Run final checkpoint**

Run:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$env:PATH = "$PortableRoot;$env:PATH"

Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm ci
& $PortableNpm run prisma:validate
& $PortableNpm run prisma:generate
& $PortableNpm run db:migrate:status
& $PortableNpm run seed:verify
& $PortableNpm run typecheck
& $PortableNpm run test:run
& $PortableNpm run build
& $PortableNpm run check
& $PortableNpm audit --omit=dev --audit-level=high
& $PortableNpm audit --audit-level=high

Set-Location D:\WEB00_BACKEND
git diff --check
git status --short
git diff --name-only -- . ":(exclude)backend/**" ":(exclude)docs/WEB00_BACKEND_B3_IMPLEMENTATION_PLAN.md"
git ls-files --others --exclude-standard -- . ":(exclude)backend/**" ":(exclude)docs/WEB00_BACKEND_B3_IMPLEMENTATION_PLAN.md"
```

Expected:

- `npm ci` completes;
- Prisma validate/generate pass;
- migration status is clean;
- seed verify reports 7 categories and 15 sites;
- typecheck passes;
- full test suite passes with the existing 60 tests plus B3 tests;
- build passes;
- `npm run check` passes;
- high-threshold audits exit `0`;
- `git diff --check` passes;
- changes are limited to backend B3 implementation files and the B3 plan if the plan remains uncommitted;
- `.env`, generated Prisma Client, `dist`, `node_modules`, `coverage`, and dumps are not staged.

- [ ] **Step 2: Verify route ordering marker**

Run:

```powershell
Select-String -Path backend\src\modules\public-catalog\public-catalog.routes.ts -Pattern 'popular|:slug'
```

Expected:

- `/popular` appears before `/:slug`.

- [ ] **Step 3: Verify forbidden scope**

Run:

```powershell
git diff --name-only -- docs assets .github
git diff -- backend/prisma/schema.prisma
git diff -- backend/prisma/migrations
git diff -- backend/prisma/seed-data/web00-catalog.json
```

Expected:

- no docs changes except the approved B3 plan;
- no frontend/workflow changes;
- no schema, migration, or seed snapshot changes.

**PASS criteria:**

- all commands pass;
- B3 implementation is ready for a separate owner-approved commit;
- commit, push, PR, merge, and deploy remain absent until separately requested.

**Rollback:**

```powershell
git restore --staged -- backend docs/WEB00_BACKEND_B3_IMPLEMENTATION_PLAN.md
git restore -- backend
```

Use rollback only before a B3 implementation commit. Do not revert owner work outside B3 scope.

**Out-of-scope:**

- committing without owner approval;
- push/PR/deploy.

## 16. Final Verification Checkpoint

Future B3 completion requires:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$env:PATH = "$PortableRoot;$env:PATH"

Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm ci
& $PortableNpm run prisma:validate
& $PortableNpm run prisma:generate
& $PortableNpm run db:migrate:status
& $PortableNpm run seed:verify
& $PortableNpm run typecheck
& $PortableNpm run test:run
& $PortableNpm run build
& $PortableNpm run check
& $PortableNpm audit --omit=dev --audit-level=high
& $PortableNpm audit --audit-level=high

Set-Location D:\WEB00_BACKEND
git diff --check
git status --short
git diff --cached --name-only
```

Expected:

- schema valid;
- Prisma Client generated successfully into ignored `backend/src/generated/prisma`;
- migration status clean;
- snapshot verification reports `categories=7 sites=15`;
- typecheck passes;
- full test suite passes with at least 60 existing B1/B2 tests plus all B3 tests;
- build passes;
- `npm run check` passes;
- high-threshold audits exit `0`;
- moderate Prisma tooling advisories may remain under the accepted B2 security decision until production deploy review;
- `git diff --check` passes;
- staged content excludes `.env`, generated Prisma Client, `dist`, `node_modules`, `coverage`, dumps, frontend files, and workflows;
- no commit, push, PR, merge, or deploy occurs without separate owner permission.

## 17. Acceptance Criteria

B3 is accepted only when:

- branch is `feat/web00-backend-b3`;
- public endpoints exist exactly at:
  - `GET /api/sites`;
  - `GET /api/sites/popular`;
  - `GET /api/sites/:slug`;
  - `GET /api/categories`;
  - `GET /api/categories/:slug`;
- `/api/sites/popular` is registered before `/api/sites/:slug`;
- public site visibility guard is centralized and immutable;
- controllers and services do not duplicate visibility predicates;
- draft, archived, inactive, and deleted sites never appear publicly;
- inactive categories never appear publicly;
- B2 seed remains draft and unchanged;
- response projections exclude internal UUIDs and internal fields;
- gallery JSON is validated through Zod before response serialization;
- page size maximum is `20`;
- unknown query fields return `400 VALIDATION_ERROR`;
- site/category not-found behavior uses `SITE_NOT_FOUND` and `CATEGORY_NOT_FOUND`;
- errors include `requestId`;
- raw Prisma errors, SQL, stack, DB URLs, and secrets are not returned;
- Prisma queries use explicit `select`;
- no N+1 category queries exist;
- paginated list count and rows use `$transaction`;
- category counts include public-visible sites only;
- tests use `TEST_DATABASE_URL`, not `DATABASE_URL`;
- existing 60 B1/B2 tests remain PASS;
- B3 tests cover required unit and integration/API cases;
- no dependencies are added;
- no schema, migration, seed, frontend, workflow, auth, admin, upload, CORS, Redis, or deploy scope is mixed into B3;
- final checkpoint passes;
- commit/push/deploy are absent unless separately approved.

## 18. Rollback Boundary

B3 rollback before commit may remove:

- `backend/src/modules/public-catalog/**`;
- B3 changes in `backend/src/app.ts`;
- B3 changes in `backend/src/server.ts`;
- B3 changes in `backend/src/lib/errors.ts`;
- B3 test files under `backend/tests/public-catalog*.test.ts`;
- `backend/tests/integration/public-catalog-api.test.ts`;
- narrow B3 edits in existing tests;
- `docs/WEB00_BACKEND_B3_IMPLEMENTATION_PLAN.md` only if the owner rejects the plan before plan commit.

B3 rollback must not remove or change:

- B0/B1/B2 docs;
- B2 commit files unrelated to B3;
- Prisma schema;
- migrations;
- migration lock;
- seed snapshot;
- seed scripts;
- package files;
- frontend files;
- workflows;
- `.env`;
- local PostgreSQL databases.

No reset, rebase, force push, deploy rollback, or database destructive operation is part of B3 rollback.

## 19. Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Public API accidentally exposes draft seed records | Centralized `PUBLIC_SITE_VISIBILITY_WHERE`; unit tests and integration fixtures for draft/archived/inactive/deleted records |
| `/api/sites/popular` is captured by `/:slug` | Route order test and final `Select-String` route order marker |
| Internal UUIDs or fields leak | Mapper-only projection with serialized response tests |
| Invalid `galleryImages` leaks raw DB JSON | Zod mapper validation and safe `INTERNAL_ERROR` |
| N+1 category queries | Prisma relation `select` for category summary; integration tests exercise list/detail endpoints |
| Category counts include hidden sites | Filtered relation count or `$transaction` grouped fallback using the same visibility guard |
| B3 tests corrupt dev seed data | Tests use `TEST_DATABASE_URL` only and assert test DB guard before writing fixtures |
| DB failure leaks Prisma details | Fake throwing service/API tests and existing B1 error middleware contract |
| Search performance degrades later | Max limit `20`, existing indexes retained, future `pg_trgm` documented as a later measured task |
| Moderate Prisma tooling advisories remain | Use accepted B2 high-threshold audit gate; review again before production deploy |
| Scope creep into auth/admin/frontend/deploy | Acceptance criteria and final git scope checks block mixed changes |

## 20. Implementation Blockers

B3 implementation must not start or must stop if any blocker appears:

- branch is not `feat/web00-backend-b3`;
- HEAD is not based on `5684d9cab01469e7fd727cd2aaefc656468e289b`;
- working tree contains unrelated changes outside backend and this B3 plan;
- `backend/.env` is missing or not ignored;
- PostgreSQL 17.10 on `127.0.0.1:5433` is unavailable for integration tests;
- `TEST_DATABASE_URL` does not point to the isolated test database;
- Prisma migration status is not clean;
- snapshot verification does not report exactly 7 categories and 15 sites;
- implementation requires schema, migration, seed, dependency, frontend, workflow, auth, admin, upload, CORS, Redis, or deploy changes;
- package install/update appears necessary;
- any high or critical vulnerability appears in high-threshold audit;
- test fixtures cannot be isolated to `TEST_DATABASE_URL`;
- public visibility cannot be centralized without changing B2 schema;
- owner has not separately authorized commit, push, PR, merge, or deploy.
