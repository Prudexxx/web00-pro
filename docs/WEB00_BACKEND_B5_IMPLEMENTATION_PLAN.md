# WEB00 Backend B5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** implement Scope A only: central RBAC, protected Admin API for sites and categories, mandatory atomic audit rows for admin mutations, and a read-only admin audit-log API.

**Architecture:** preserve the current B1-B4 Express module style, use the existing Prisma schema, keep public catalog and auth behavior stable, mount admin routes under `/api/admin`, and enforce permissions through one deny-by-default RBAC layer before controllers reach repositories.

**Tech Stack:** Node.js 22.23.1 portable runtime, TypeScript with NodeNext ESM, Express 5, Zod 4, Prisma 7.8.0, PostgreSQL 17, Vitest, Supertest, and the existing B1-B4 scripts.

## 1. B5 Status And Start Gate

B5 implementation must start from the B4 authentication foundation commit:

```text
branch before B5 planning: feat/web00-backend-b4
base commit: 952f5683e8d69a859d55c36bc4042a9b268fea2d
base commit message: feat: add WEB00 authentication foundation
planning branch: feat/web00-backend-b5
```

Before implementation begins, run:

```powershell
Set-Location D:\WEB00_BACKEND
git branch --show-current
git rev-parse HEAD
git status --short
git diff --cached --name-only
```

Expected before writing implementation code:

- current branch is `feat/web00-backend-b5`;
- `HEAD` is either the B4 base commit or a later owner-approved docs-only B5 plan commit;
- staged area is empty;
- working tree is clean except for an owner-approved uncommitted B5 plan before that plan is committed;
- implementation does not run on `feat/web00-backend-b4`, `feat/web00-backend-b3`, `feat/web00-backend-b2`, `feat/web00-backend-b1`, `docs/web00-backend-b0`, or `main`.

If the B5 plan file remains uncommitted, implementation must stop until the owner explicitly approves a docs-only commit of `docs/WEB00_BACKEND_B5_IMPLEMENTATION_PLAN.md`.

No push, pull request, merge, rebase, reset, deployment, package installation outside B5 implementation scope, database bootstrap, or production secret handling is part of this planning task.

## 2. Authoritative Inputs

Implementation must read and preserve the contracts from:

- `docs/WEB00_BACKEND_B0_TECHNICAL_SPEC.md`;
- `docs/WEB00_BACKEND_B1_IMPLEMENTATION_PLAN.md`;
- `docs/WEB00_BACKEND_B2_IMPLEMENTATION_PLAN.md`;
- `docs/WEB00_BACKEND_B3_IMPLEMENTATION_PLAN.md`;
- `docs/WEB00_BACKEND_B4_IMPLEMENTATION_PLAN.md`;
- `backend/prisma/schema.prisma`;
- `backend/src/app.ts`;
- `backend/src/server.ts`;
- `backend/src/lib/errors.ts`;
- `backend/src/middleware/error-handler.ts`;
- `backend/src/modules/auth/**`;
- `backend/src/modules/public-catalog/**`;
- `backend/tests/**`;
- `backend/package.json`.

Existing B1-B4 guarantees to preserve:

- `createApp` does not read `process.env`;
- `server.ts` remains the only production entry that parses environment;
- JSON body limit stays `100kb`;
- error responses stay inside the approved JSON envelope with `requestId`;
- public catalog routes remain read-only, slug-based, and visible only for `status="published"`, `active=true`, and `deletedAt=null`;
- B4 access-token authentication verifies Bearer JWT claims and active user state;
- refresh cookie, login, refresh, logout, and `/api/auth/me` behavior remain unchanged;
- B2 seed remains 7 categories and 15 draft sites;
- Prisma package set remains synchronized on `7.8.0`;
- high and critical audit findings remain blocked.

## 3. Selected Scope A

Scope A includes exactly:

- central RBAC policy for roles `admin` and `editor`;
- permission middleware for protected admin routes;
- admin read endpoints for sites and categories;
- admin and editor draft-site mutation paths according to role permissions;
- admin-only site lifecycle actions;
- admin-only category mutations;
- mandatory audit rows for every B5 mutation;
- admin-only read endpoint for audit logs;
- integration and unit tests proving permissions, route order, audit atomicity, validation, error mapping, and public API non-regression.

B5 must not add user management, first-admin bootstrap, registration, password change, password reset, refresh-session management, upload/storage APIs, admin UI, frontend integration, CORS changes, Redis, MFA, OAuth, email, payments, leads, support, bug-report features, view counters, schema changes, migrations, seed changes, dependency changes, push, pull request, merge, or deploy.

## 4. Existing Schema Compatibility

The current B2 schema is sufficient for Scope A:

- `User` has `id`, `email`, `role`, `active`, and relation `auditLogs`;
- `Category` has the fields needed for admin category read and mutation;
- `Site` has draft/published/archived state, active flag, soft-delete timestamp, publication timestamp, featured flag, sort order, pricing, demo, gallery, tags, and category relation;
- `AuditLog` supports `actorUserId`, `action`, `entityType`, `entityId`, `beforeJson`, `afterJson`, `requestId`, `ipHash`, `userAgentHash`, and relation to `User`;
- `StorageCleanupJob` remains unused in B5.

No schema, migration, migration lock, seed snapshot, or generated Prisma Client file changes are allowed for B5.

Ownership is not implemented because the schema has no site owner or creator field. Editor permissions therefore apply to all non-deleted draft sites, not to owned resources.

If implementation discovers that any B5 requirement requires a schema change, migration change, seed change, dependency change, or production secret change, stop with `BLOCKED` and do not implement a workaround.

## 5. File Map

Planning file created by this task:

| Path | Purpose |
| --- | --- |
| `docs/WEB00_BACKEND_B5_IMPLEMENTATION_PLAN.md` | Approved B5 implementation plan |

Future B5 implementation may create or modify only backend files in this map:

| Path | Action | Purpose |
| --- | --- | --- |
| `backend/src/lib/errors.ts` | Modify | Add B5 error codes |
| `backend/src/app.ts` | Modify | Accept and mount `adminRoutes` under `/api/admin` |
| `backend/src/server.ts` | Modify | Wire admin repositories, services, auth middleware, and routes |
| `backend/src/modules/admin/admin.types.ts` | Create | Shared admin request, pagination, role-projection, and mutation context types |
| `backend/src/modules/admin/admin-cache-control.ts` | Create | `Cache-Control: no-store` and mutation `Pragma: no-cache` middleware |
| `backend/src/modules/admin/admin-auth.middleware.ts` | Create | B4 Bearer auth adapter for admin route chain |
| `backend/src/modules/admin/rbac.types.ts` | Create | Permission and policy types |
| `backend/src/modules/admin/rbac.policy.ts` | Create | Deny-by-default role permission matrix |
| `backend/src/modules/admin/rbac.middleware.ts` | Create | Per-route permission middleware |
| `backend/src/modules/admin/admin.routes.ts` | Create | Aggregate admin router |
| `backend/src/modules/admin/sites/site.types.ts` | Create | Admin site DTOs, query types, inputs, lifecycle types |
| `backend/src/modules/admin/sites/site.schemas.ts` | Create | Strict Zod schemas for site queries, params, create, update, and lifecycle |
| `backend/src/modules/admin/sites/site.mapper.ts` | Create | Role-aware site response projection |
| `backend/src/modules/admin/sites/site.repository.ts` | Create | Prisma site/category/audit transaction operations |
| `backend/src/modules/admin/sites/site.service.ts` | Create | Site business rules and lifecycle state machine |
| `backend/src/modules/admin/sites/site.controller.ts` | Create | Express handlers for site endpoints |
| `backend/src/modules/admin/sites/site.routes.ts` | Create | Site route definitions and permission binding |
| `backend/src/modules/admin/categories/category.types.ts` | Create | Admin category DTOs, query types, inputs |
| `backend/src/modules/admin/categories/category.schemas.ts` | Create | Strict Zod schemas for category endpoints |
| `backend/src/modules/admin/categories/category.mapper.ts` | Create | Role-aware category response projection |
| `backend/src/modules/admin/categories/category.repository.ts` | Create | Prisma category/site-count/audit transaction operations |
| `backend/src/modules/admin/categories/category.service.ts` | Create | Category rules including in-use delete block |
| `backend/src/modules/admin/categories/category.controller.ts` | Create | Express handlers for category endpoints |
| `backend/src/modules/admin/categories/category.routes.ts` | Create | Category route definitions and permission binding |
| `backend/src/modules/admin/audit/audit-log.types.ts` | Create | Audit query and DTO types |
| `backend/src/modules/admin/audit/audit-log.schemas.ts` | Create | Strict Zod schemas for audit read query |
| `backend/src/modules/admin/audit/audit-log.mapper.ts` | Create | Safe audit response projection |
| `backend/src/modules/admin/audit/audit-log.repository.ts` | Create | Prisma audit read operations |
| `backend/src/modules/admin/audit/audit-log.service.ts` | Create | Audit read authorization boundary and filtering |
| `backend/src/modules/admin/audit/audit-log.controller.ts` | Create | Express handler for audit read endpoint |
| `backend/src/modules/admin/audit/audit-log.routes.ts` | Create | Audit route definition and permission binding |
| `backend/tests/admin.rbac.test.ts` | Create | RBAC unit tests |
| `backend/tests/admin.cache-control.test.ts` | Create | Admin cache header tests |
| `backend/tests/admin.site.validation.test.ts` | Create | Site validation unit tests |
| `backend/tests/admin.site.service.test.ts` | Create | Site service and lifecycle unit tests |
| `backend/tests/admin.site.mapper.test.ts` | Create | Site role projection tests |
| `backend/tests/admin.category.validation.test.ts` | Create | Category validation unit tests |
| `backend/tests/admin.category.service.test.ts` | Create | Category service tests |
| `backend/tests/admin.category.mapper.test.ts` | Create | Category role projection tests |
| `backend/tests/admin.audit-log.validation.test.ts` | Create | Audit query validation unit tests |
| `backend/tests/admin.audit-log.mapper.test.ts` | Create | Safe audit projection tests |
| `backend/tests/integration/admin-sites-api.test.ts` | Create | Admin sites API integration tests |
| `backend/tests/integration/admin-categories-api.test.ts` | Create | Admin categories API integration tests |
| `backend/tests/integration/admin-audit-api.test.ts` | Create | Admin audit API integration tests |
| `backend/tests/integration/admin-api-permissions.test.ts` | Create | Cross-route permission and route-order tests |

Files forbidden in B5 implementation:

- `backend/prisma/schema.prisma`;
- `backend/prisma/migrations/**`;
- `backend/prisma/seed-data/web00-catalog.json`;
- `backend/package.json`;
- `backend/package-lock.json`;
- `backend/.env`;
- `backend/dist/**`;
- `backend/node_modules/**`;
- `backend/coverage/**`;
- `backend/src/generated/prisma/**`;
- `docs/**` other than this plan before implementation;
- `assets/**`;
- `.github/**`;
- frontend files.

## 6. RBAC Permission Model

Define the complete B5 permission union:

```typescript
export type B5Permission =
  | "site.read"
  | "site.createDraft"
  | "site.updateDraft"
  | "site.updateAny"
  | "site.publish"
  | "site.unpublish"
  | "site.softDelete"
  | "site.restore"
  | "site.permanentDelete"
  | "category.read"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "audit.read";
```

Role grants:

| Role | Permissions |
| --- | --- |
| `editor` | `site.read`, `site.createDraft`, `site.updateDraft`, `category.read` |
| `admin` | every B5 permission |

Rules:

- RBAC is deny-by-default;
- unknown role strings are denied with `403 FORBIDDEN`;
- unknown permissions are denied with `403 FORBIDDEN`;
- controllers and services must not contain scattered role checks such as `principal.role === "admin"`;
- route-level permission middleware runs before validation and before repository access;
- service-level policy helpers may receive already-authenticated principal and permission context, but all role-to-permission mapping lives in `rbac.policy.ts`;
- tests must prove that adding a route without permission middleware is caught by route-level integration coverage or service-level guard tests.

Policy interface:

```typescript
import type { AuthRole } from "../auth/auth.types.js";

export interface PermissionPolicy {
  has(role: string, permission: B5Permission): boolean;
  list(role: string): readonly B5Permission[];
}

export function createPermissionPolicy(): PermissionPolicy;
export function hasPermission(role: string, permission: B5Permission): boolean;
export function permissionsForRole(role: AuthRole): readonly B5Permission[];
```

Permission middleware contract:

```typescript
import type { RequestHandler } from "express";

export interface PermissionMiddlewareOptions {
  permission: B5Permission;
  policy?: PermissionPolicy;
}

export function createPermissionMiddleware(
  options: PermissionMiddlewareOptions
): RequestHandler;
```

The middleware reads `request.auth` from the B4 authenticated principal. If the principal is missing, it returns `401 UNAUTHORIZED`. If the principal exists but lacks the permission, it returns `403 FORBIDDEN`.

## 7. Admin Auth Chain

Every `/api/admin/**` route must use this order:

1. admin cache-control middleware;
2. B4 Bearer authentication;
3. active-user verification through existing B4 auth service;
4. per-route permission middleware;
5. request validation;
6. controller;
7. service;
8. repository.

Admin auth adapter contract:

```typescript
import type { RequestHandler } from "express";
import type { AuthService } from "../auth/auth.types.js";

export interface AdminAuthMiddlewareOptions {
  service: Pick<AuthService, "authenticateAccessToken">;
}

export function createAdminAuthMiddleware(
  options: AdminAuthMiddlewareOptions
): RequestHandler;
```

Implementation:

- uses existing `parseBearerToken`;
- calls `options.service.authenticateAccessToken(token)`;
- stores the result in `(request as AuthRequest).auth`;
- maps missing or malformed Bearer header to existing `401 UNAUTHORIZED`;
- maps inactive users to existing `403 USER_DISABLED`;
- never accepts refresh cookies as admin authentication;
- never reads `process.env`;
- never performs repository calls after permission denial.

Route-order tests must prove that an editor calling an admin-only route receives `403 FORBIDDEN` before param existence is checked, so forbidden callers do not learn whether a site, category, or audit row exists.

## 8. Admin API Surface

Site endpoints:

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/admin/sites` | `site.read` | Admin sees all; editor sees non-deleted projection |
| `GET` | `/api/admin/sites/:id` | `site.read` | UUID param |
| `POST` | `/api/admin/sites` | `site.createDraft` | Always creates `status="draft"` |
| `PATCH` | `/api/admin/sites/:id` | `site.updateDraft` | Route uses one permission; service requires `site.updateAny` through central policy for non-draft updates and featured updates |
| `POST` | `/api/admin/sites/:id/publish` | `site.publish` | Admin only |
| `POST` | `/api/admin/sites/:id/unpublish` | `site.unpublish` | Admin only |
| `DELETE` | `/api/admin/sites/:id` | `site.softDelete` | Admin only soft delete |
| `POST` | `/api/admin/sites/:id/restore` | `site.restore` | Admin only restore to draft |
| `DELETE` | `/api/admin/sites/:id/permanent` | `site.permanentDelete` | Admin only hard delete |

Category endpoints:

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/admin/categories` | `category.read` | Admin and editor read |
| `GET` | `/api/admin/categories/:id` | `category.read` | UUID param |
| `POST` | `/api/admin/categories` | `category.create` | Admin only |
| `PATCH` | `/api/admin/categories/:id` | `category.update` | Admin only |
| `DELETE` | `/api/admin/categories/:id` | `category.delete` | Admin only |

Audit endpoint:

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/admin/audit-logs` | `audit.read` | Admin only, read-only |

All admin endpoints:

- return `Cache-Control: no-store`;
- mutations also return `Pragma: no-cache`;
- accept and return JSON only;
- use UUID route params;
- validate request bodies as plain objects;
- reject unknown body and query fields;
- never pass `request.body` directly to Prisma;
- include `requestId` on errors through the existing error envelope;
- never expose passwords, refresh tokens, JWTs, cookies, database URLs, raw headers, or stack traces.

## 9. Admin Site Read Contract

Admin site list query:

| Query | Type | Default | Validation |
| --- | --- | --- | --- |
| `page` | integer | `1` | min `1` |
| `limit` | integer | `20` | min `1`, max `100` |
| `sort` | enum | `updatedAt` | `updatedAt`, `createdAt`, `title`, `sortOrder` |
| `direction` | enum | `desc` | `asc`, `desc` |
| `status` | enum | none | `draft`, `published`, `archived` |
| `active` | boolean | none | `true`, `false` |
| `deleted` | enum | `without` | `without`, `only`, `with`; `only` and `with` return data only for admin |
| `category` | UUID string | none | `Category.id` only; slug filtering is not part of B5 admin API |
| `search` | string | none | trim, min `1`, max `100`; searches title and short description |
| `featured` | boolean | none | `true`, `false` |

Response meta:

```typescript
export interface AdminPaginationMeta {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}
```

Admin site response includes:

- `id`;
- `slug`;
- `title`;
- `categoryId`;
- `category` summary with `id`, `slug`, and `title`;
- `legacyTitle`;
- `shortDescription`;
- `fullDescription`;
- `features`;
- `tags`;
- `demoUrl`;
- `siteUrl`;
- `previewImageUrl`;
- `galleryImages`;
- `previewType`;
- `demoMode`;
- `demoLocalUrl`;
- `externalDemoUrl`;
- `originalDemoUrl`;
- `priceAmountCents`;
- `priceLabel`;
- `developmentDays`;
- `deliveryLabel`;
- `status`;
- `active`;
- `featured`;
- `views`;
- `sortOrder`;
- `publishedAt`;
- `deletedAt`;
- `createdAt`;
- `updatedAt`.

Editor site response includes only non-privileged fields:

- `id`;
- `slug`;
- `title`;
- `categoryId`;
- `category` summary with `id`, `slug`, and `title`;
- `legacyTitle`;
- `shortDescription`;
- `fullDescription`;
- `features`;
- `tags`;
- `demoUrl`;
- `siteUrl`;
- `previewImageUrl`;
- `galleryImages`;
- `previewType`;
- `demoMode`;
- `demoLocalUrl`;
- `externalDemoUrl`;
- `originalDemoUrl`;
- `priceAmountCents`;
- `priceLabel`;
- `developmentDays`;
- `deliveryLabel`;
- `status`;
- `featured`;
- `sortOrder`;
- `publishedAt`;
- `createdAt`;
- `updatedAt`.

Editor responses must omit:

- `active`;
- `deletedAt`;
- `views`;
- audit fields;
- actor identifiers;
- security fields.

Rationale:

- admin API uses UUID route params;
- editor must receive `Site.id` for detail and `PATCH /api/admin/sites/:id`;
- editor must receive `categoryId` and `category.id` for site create and patch inputs;
- hiding UUIDs does not replace RBAC;
- permission and state checks remain mandatory on every request;
- knowing a UUID must not allow editor to run admin-only mutations.

Visibility:

- admin list/detail may include deleted rows according to `deleted` query;
- editor list/detail excludes `deletedAt != null` rows;
- editor detail for deleted rows returns `404 SITE_NOT_FOUND`;
- missing site returns `404 SITE_NOT_FOUND`.

## 10. Admin Site Mutation Contract

Create draft input fields:

- `slug`;
- `title`;
- `categoryId`;
- `legacyTitle`;
- `shortDescription`;
- `fullDescription`;
- `features`;
- `tags`;
- `demoUrl`;
- `siteUrl`;
- `previewImageUrl`;
- `galleryImages`;
- `previewType`;
- `demoMode`;
- `demoLocalUrl`;
- `externalDemoUrl`;
- `originalDemoUrl`;
- `priceAmountCents`;
- `priceLabel`;
- `developmentDays`;
- `deliveryLabel`;
- `sortOrder`.

Create draft rules:

- always writes `status="draft"`;
- always writes `active=true`;
- always writes `publishedAt=null`;
- always writes `deletedAt=null`;
- always writes `featured=false`;
- always writes `views=0`;
- requires `slug`, `title`, `categoryId`, and `shortDescription`;
- requires category to exist and be `active=true`;
- rejects inactive category with `409 CATEGORY_INACTIVE`;
- rejects duplicate site slug with `409 SLUG_CONFLICT`;
- rejects `featured` from both editor and admin create bodies with `400 VALIDATION_ERROR`;
- does not accept lifecycle fields from clients;
- never passes raw request body to Prisma.

Patch input allow-list for editor:

- `title`;
- `categoryId`;
- `legacyTitle`;
- `shortDescription`;
- `fullDescription`;
- `features`;
- `tags`;
- `demoUrl`;
- `siteUrl`;
- `previewImageUrl`;
- `galleryImages`;
- `previewType`;
- `demoMode`;
- `demoLocalUrl`;
- `externalDemoUrl`;
- `originalDemoUrl`;
- `priceAmountCents`;
- `priceLabel`;
- `developmentDays`;
- `deliveryLabel`;
- `sortOrder`.

Patch input allow-list for admin:

- every editor patch field;
- `slug`;
- `featured`.

Fields forbidden in generic `PATCH /api/admin/sites/:id` for every role:

- `id`;
- `status`;
- `active`;
- `views`;
- `publishedAt`;
- `deletedAt`;
- `createdAt`;
- `updatedAt`;
- audit fields;
- actor fields.

Generic patch rules:

- empty body returns `400 VALIDATION_ERROR`;
- unknown fields return `400 VALIDATION_ERROR`;
- duplicate slug returns `409 SLUG_CONFLICT`;
- inactive category assignment returns `409 CATEGORY_INACTIVE`;
- missing site returns `404 SITE_NOT_FOUND`;
- editor may update only non-deleted draft sites;
- editor patching published or archived sites returns `403 FORBIDDEN`;
- admin may update any non-deleted site, including draft, published, and archived;
- admin may not change lifecycle fields through generic patch;
- deleted site patch returns `410 SITE_ALREADY_DELETED`.

Patch permission semantics:

- route-level middleware for `PATCH /api/admin/sites/:id` checks exactly `site.updateDraft`;
- editor has `site.updateDraft`;
- admin has all permissions, including `site.updateDraft`;
- service-level authorization uses only the central `PermissionPolicy`;
- draft update requires `site.updateDraft`;
- published or archived update requires `site.updateAny`;
- featured update requires `site.updateAny`;
- editor schema does not contain `featured`;
- admin schema may contain `featured`;
- direct checks such as `principal.role === "admin"` are forbidden outside `rbac.policy.ts` and mapper projection code.

Service helper contract:

```typescript
export function assertCanUpdateSite(
  principal: AuthenticatedPrincipal,
  site: SiteLifecycleRecord,
  patch: UpdateAdminSiteInput,
  policy?: PermissionPolicy
): void;
```

The helper throws `403 FORBIDDEN` through `AppError` when central policy denies the required permission.

## 11. Site Lifecycle State Machine

Canonical site states:

| Stored fields | Meaning |
| --- | --- |
| `status="draft"`, `active=true`, `deletedAt=null`, `publishedAt=null` | Draft |
| `status="published"`, `active=true`, `deletedAt=null`, `publishedAt!=null` | Publicly visible if category is active |
| `status="archived"`, `active=true`, `deletedAt=null` | Hidden archived record |
| `deletedAt!=null` | Soft-deleted record, hidden from public and editor reads |

Actions:

| Endpoint | Required source | Result |
| --- | --- | --- |
| `POST /api/admin/sites/:id/publish` | draft and non-deleted | `status="published"`, `active=true`, `publishedAt=now` |
| `POST /api/admin/sites/:id/unpublish` | published and non-deleted | `status="draft"`, `publishedAt=null` |
| `DELETE /api/admin/sites/:id` | non-deleted | `deletedAt=now`, `active=false`, `status="draft"`, `publishedAt=null` |
| `POST /api/admin/sites/:id/restore` | soft-deleted | `deletedAt=null`, `active=true`, `status="draft"`, `publishedAt=null` |
| `DELETE /api/admin/sites/:id/permanent` | soft-deleted | hard delete site row |

Archived behavior:

- B5 does not add an archive endpoint;
- archived sites are readable by admin and hidden publicly;
- archived sites are not editable by editor;
- admin may generic-patch non-lifecycle content of archived sites;
- archived sites cannot be published directly in B5;
- direct archived-to-draft or archived-to-published transition is outside B5;
- if an archived site is soft-deleted and then restored, restore returns it to draft through the dedicated restore endpoint.

Soft-delete rules:

- soft-delete is atomic with its audit row;
- a previously published site immediately stops being public;
- audit `beforeJson` preserves the previous published state;
- audit `afterJson` shows draft, inactive, deleted state;
- restore always returns draft state and never republishes automatically.

Publish rules:

- publish requires the linked category to exist and be `active=true`;
- publishing a site linked to an inactive category returns `409 CATEGORY_INACTIVE`;
- publish never changes category state.

Lifecycle error mapping:

| Case | HTTP | Code | Message |
| --- | --- | --- | --- |
| Missing site | `404` | `SITE_NOT_FOUND` | `Site not found.` |
| Publish non-draft site | `409` | `SITE_NOT_DRAFT` | `Site must be a draft before publishing.` |
| Unpublish non-published site | `409` | `SITE_NOT_PUBLISHED` | `Site must be published before unpublishing.` |
| Mutate soft-deleted site through non-restore path | `410` | `SITE_ALREADY_DELETED` | `Site is deleted.` |
| Restore or permanent-delete non-deleted site | `409` | `SITE_NOT_DELETED` | `Site is not deleted.` |
| Unsupported lifecycle transition | `409` | `INVALID_STATE_TRANSITION` | `Site state transition is not allowed.` |

## 12. Admin Category Contract

Admin category list query:

| Query | Type | Default | Validation |
| --- | --- | --- | --- |
| `page` | integer | `1` | min `1` |
| `limit` | integer | `50` | min `1`, max `100` |
| `active` | boolean | none | `true`, `false`; admin only can use `false` |
| `search` | string | none | trim, min `1`, max `100`; searches slug, title, description |
| `includeCounts` | boolean | `false` | includes all linked site count for admin, non-deleted count for editor |

Category create input:

- `slug`;
- `title`;
- `description`;
- `sortOrder`;
- `active`.

Category patch input:

- `slug`;
- `title`;
- `description`;
- `sortOrder`;
- `active`.

Rules:

- create requires `slug` and `title`;
- duplicate slug returns `409 SLUG_CONFLICT`;
- unknown fields return `400 VALIDATION_ERROR`;
- empty patch returns `400 VALIDATION_ERROR`;
- editor can read active categories only;
- editor cannot create, update, or delete categories;
- admin can read active and inactive categories;
- category delete is hard delete only when no `Site` row of any state references the category;
- category delete checks all sites, including draft, published, archived, inactive, and soft-deleted rows;
- category delete with linked sites returns `409 CATEGORY_IN_USE`;
- category delete writes an audit row with final safe snapshot;
- cascading site deletion is forbidden.

Admin category response includes:

- `id`;
- `slug`;
- `title`;
- `description`;
- `sortOrder`;
- `active`;
- `siteCount` when requested;
- `createdAt`;
- `updatedAt`.

Editor category response includes:

- `id`;
- `slug`;
- `title`;
- `description`;
- `sortOrder`;
- `siteCount` when requested.

Editor category responses omit `active`, `createdAt`, and `updatedAt`.

## 13. Audit Write Contract

Every B5 mutation writes one audit row in the same Prisma transaction as the domain change.

Required mutation actions:

| Domain | Action |
| --- | --- |
| site create draft | `site.create_draft` |
| site update | `site.update` |
| site publish | `site.publish` |
| site unpublish | `site.unpublish` |
| site soft delete | `site.soft_delete` |
| site restore | `site.restore` |
| site permanent delete | `site.permanent_delete` |
| category create | `category.create` |
| category update | `category.update` |
| category delete | `category.delete` |

Audit row fields:

- `actorUserId` is the authenticated principal id;
- `action` is one of the B5 mutation actions above;
- `entityType` is `site` or `category`;
- `entityId` is the affected row id, or the deleted row id for permanent delete;
- `beforeJson` is a safe snapshot or changed-field subset before mutation;
- `afterJson` is a safe snapshot or changed-field subset after mutation;
- `requestId` is the current response-local request id;
- `ipHash` and `userAgentHash` may be null in B5 unless existing B4 safe fingerprint helpers are reused without storing raw input;
- `createdAt` is database-generated.

Audit payload safety:

- do not store raw request body;
- do not store passwords, access tokens, refresh tokens, cookies, authorization headers, database URLs, or environment values;
- for update actions, include only allow-listed changed fields;
- for lifecycle actions, include previous and next lifecycle fields;
- for permanent delete, include final safe snapshot in `beforeJson` and `Prisma.DbNull` in `afterJson`;
- if the audit insert fails, the domain mutation must roll back.

Repository transaction pattern:

```typescript
return prisma.$transaction(async (tx) => {
  const before = await readExistingRowForMutation(tx, input.id);
  const after = await applyDomainMutation(tx, input);
  await tx.auditLog.create({ data: createSafeAuditData({ before, after, input }) });
  return after;
});
```

The final implementation must use concrete typed functions, not placeholder helpers.

## 14. Audit Read Contract

Endpoint:

```text
GET /api/admin/audit-logs
```

Permission:

```text
audit.read
```

Only admin has `audit.read`. Editor receives `403 FORBIDDEN` before query validation and before repository access.

Query:

| Query | Type | Default | Validation |
| --- | --- | --- | --- |
| `page` | integer | `1` | min `1` |
| `limit` | integer | `50` | min `1`, max `100` |
| `action` | string | none | max `80`, exact action string |
| `entityType` | enum | none | `site`, `category`, `auth`, `user`, `upload` |
| `entityId` | UUID | none | exact UUID |
| `actorUserId` | UUID | none | exact UUID |
| `from` | ISO datetime | none | inclusive lower bound on `createdAt` |
| `to` | ISO datetime | none | inclusive upper bound on `createdAt` |
| `sort` | enum | `newest` | `newest`, `oldest` |

Response:

```typescript
export interface AdminAuditLogResponse {
  data: AdminAuditLogEntry[];
  meta: AdminPaginationMeta;
}

export interface AdminAuditLogEntry {
  id: string;
  actor: null | {
    email: string;
    id: string;
    role: "admin" | "editor";
  };
  action: string;
  entityType: "site" | "category" | "auth" | "user" | "upload";
  entityId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  requestId: string;
  createdAt: string;
}
```

Audit read response must not expose:

- `ipHash`;
- `userAgentHash`;
- raw request headers;
- cookies;
- tokens;
- password hashes;
- database URLs;
- stack traces.

## 15. Error Contract

Add B5 codes to `ErrorCode` in `backend/src/lib/errors.ts`:

```typescript
  | "FORBIDDEN"
  | "SITE_NOT_DRAFT"
  | "SITE_NOT_PUBLISHED"
  | "SITE_ALREADY_DELETED"
  | "SITE_NOT_DELETED"
  | "CATEGORY_INACTIVE"
  | "CATEGORY_IN_USE"
  | "SLUG_CONFLICT"
  | "INVALID_STATE_TRANSITION"
```

Mapping:

| Code | HTTP | Message |
| --- | --- | --- |
| `FORBIDDEN` | `403` | `Forbidden.` |
| `SITE_NOT_FOUND` | `404` | `Site not found.` |
| `CATEGORY_NOT_FOUND` | `404` | `Category not found.` |
| `SITE_NOT_DRAFT` | `409` | `Site must be a draft before publishing.` |
| `SITE_NOT_PUBLISHED` | `409` | `Site must be published before unpublishing.` |
| `SITE_ALREADY_DELETED` | `410` | `Site is deleted.` |
| `SITE_NOT_DELETED` | `409` | `Site is not deleted.` |
| `CATEGORY_INACTIVE` | `409` | `Category is inactive.` |
| `CATEGORY_IN_USE` | `409` | `Category is in use.` |
| `SLUG_CONFLICT` | `409` | `Slug already exists.` |
| `INVALID_STATE_TRANSITION` | `409` | `State transition is not allowed.` |

Keep existing B1-B4 parser and auth errors unchanged:

- `INVALID_JSON = 400`;
- `PAYLOAD_TOO_LARGE = 413`;
- `VALIDATION_ERROR = 400`;
- `UNAUTHORIZED = 401`;
- `USER_DISABLED = 403`;
- `RATE_LIMITED = 429`;
- `INTERNAL_ERROR = 500`.

Unknown errors remain `500 INTERNAL_ERROR`, and raw message or stack is never returned.

## 16. Validation Contract

All admin validators must use Zod strict object schemas.

Shared primitives:

```typescript
export const uuidParamSchema = z.object({
  id: z.uuid()
}).strict();

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
```

Site scalar constraints:

- `title`: trimmed string, min `1`, max `160`;
- `shortDescription`: trimmed string, min `1`, max `500`;
- `fullDescription`: trimmed string, max `5000`, nullable;
- `features`: string array, max `30` items, each trimmed max `160`;
- `tags`: string array, max `30` items, each trimmed max `80`;
- URLs: valid URL string or null, max `2048`;
- `galleryImages`: array of safe objects already compatible with B3 public gallery mapper, max `20`;
- `previewType`: string max `40` or null;
- `demoMode`: string max `40` or null;
- `priceAmountCents`: positive integer or null;
- `priceLabel`: string max `80` or null;
- `developmentDays`: positive integer or null;
- `deliveryLabel`: string max `80` or null;
- `featured`: boolean, only for the admin generic patch schema and never for create-draft schema;
- `sortOrder`: integer, min `0`.

Category scalar constraints:

- `slug`: same slug schema;
- `title`: trimmed string, min `1`, max `120`;
- `description`: trimmed string, max `1000`, nullable;
- `sortOrder`: integer, min `0`;
- `active`: boolean.

Validation failure:

- throw `AppError` with `VALIDATION_ERROR` and safe details;
- include only field path, safe message, and optional detail code;
- do not echo raw request body;
- do not run repository calls after validation failure.

## 17. Cache And Response Headers

Admin cache middleware:

```typescript
import type { RequestHandler } from "express";

export function adminCacheControl(): RequestHandler;
```

Rules:

- aggregate admin router installs `adminCacheControl()` before authentication;
- all `/api/admin` responses set `Cache-Control: no-store`;
- `POST`, `PATCH`, and `DELETE` responses also set `Pragma: no-cache`;
- headers are set before `next()`;
- middleware does not complete the response;
- middleware does not read token, body, or env;
- authentication, authorization, validation, repository, and internal errors inherit these headers;
- public B3 cache behavior remains unchanged.

Tests:

- every admin success route returns `Cache-Control: no-store`;
- every admin mutation success route returns `Pragma: no-cache`;
- admin error responses also return `Cache-Control: no-store`;
- unauthenticated admin request returns `Cache-Control: no-store`;
- invalid Bearer response returns `Cache-Control: no-store`;
- forbidden editor response returns `Cache-Control: no-store`;
- validation error returns `Cache-Control: no-store`;
- not-found response returns `Cache-Control: no-store`;
- conflict and gone responses return `Cache-Control: no-store`;
- rate-limit response returns `Cache-Control: no-store` if an admin rate limit exists in a future task;
- repository or internal error returns `Cache-Control: no-store`;
- mutation `401`, `403`, `400`, `404`, `409`, `410`, `429`, and `500` responses return `Pragma: no-cache`;
- no public catalog response header is changed by B5.

## 18. Module Architecture And Interfaces

Shared admin request types:

```typescript
import type { Request } from "express";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";

export interface AdminRequest extends Request {
  auth: AuthenticatedPrincipal;
}

export interface AdminMutationContext {
  actor: AuthenticatedPrincipal;
  requestId: string;
  now: Date;
}
```

Admin router options:

```typescript
import type { Router } from "express";
import type { AuthService } from "../auth/auth.types.js";

export interface AdminRouterOptions {
  authService: Pick<AuthService, "authenticateAccessToken">;
  auditLogService: AdminAuditLogService;
  categoryService: AdminCategoryService;
  siteService: AdminSiteService;
}

export function createAdminRouter(options: AdminRouterOptions): Router;
```

Site service interface:

```typescript
export interface AdminSiteService {
  createDraft(input: CreateAdminSiteInput, context: AdminMutationContext): Promise<AdminSiteDetail>;
  deleteSite(id: string, context: AdminMutationContext): Promise<AdminSiteDetail>;
  getSite(id: string, principal: AuthenticatedPrincipal): Promise<AdminSiteDetail>;
  listSites(query: AdminSiteListQuery, principal: AuthenticatedPrincipal): Promise<AdminSiteListResponse>;
  permanentlyDeleteSite(id: string, context: AdminMutationContext): Promise<void>;
  publishSite(id: string, context: AdminMutationContext): Promise<AdminSiteDetail>;
  restoreSite(id: string, context: AdminMutationContext): Promise<AdminSiteDetail>;
  unpublishSite(id: string, context: AdminMutationContext): Promise<AdminSiteDetail>;
  updateSite(id: string, input: UpdateAdminSiteInput, context: AdminMutationContext): Promise<AdminSiteDetail>;
}
```

Category service interface:

```typescript
export interface AdminCategoryService {
  createCategory(input: CreateAdminCategoryInput, context: AdminMutationContext): Promise<AdminCategoryDetail>;
  deleteCategory(id: string, context: AdminMutationContext): Promise<void>;
  getCategory(id: string, principal: AuthenticatedPrincipal): Promise<AdminCategoryDetail>;
  listCategories(query: AdminCategoryListQuery, principal: AuthenticatedPrincipal): Promise<AdminCategoryListResponse>;
  updateCategory(id: string, input: UpdateAdminCategoryInput, context: AdminMutationContext): Promise<AdminCategoryDetail>;
}
```

Audit-log service interface:

```typescript
export interface AdminAuditLogService {
  listAuditLogs(query: AdminAuditLogQuery): Promise<AdminAuditLogResponse>;
}
```

Repository implementations use `PrismaClient` from `backend/src/generated/prisma/client.js` and relative `.js` imports in TypeScript source.

## 19. Application And Server Integration

Update `CreateAppOptions`:

```typescript
export interface CreateAppOptions {
  adminRoutes?: Router;
  authRoutes?: Router;
  env: AppEnv;
  logger?: AppLogger;
  publicCatalogService?: PublicCatalogService;
  registerTestRoutes?: (app: Express) => void;
  now?: () => Date;
  trustProxyHops?: number;
}
```

`createApp` mount order:

1. request id middleware;
2. JSON parser;
3. request logger;
4. `/api/health`;
5. public catalog routes under `/api`;
6. auth routes under `/api/auth`;
7. admin routes under `/api/admin`;
8. test routes, test-only;
9. not found;
10. error handler.

`server.ts` must:

- continue parsing env only in `main`;
- create one Prisma client;
- reuse the same Prisma client for public catalog, auth, admin sites, admin categories, and audit logs;
- create B4 auth service once;
- pass `authService` into `createAdminRouter`;
- pass `trustProxyHops` unchanged;
- keep graceful shutdown disconnecting Prisma once;
- not add dependencies;
- not read or print `.env` values.

## 20. Test Design

Minimum B5 test additions:

- RBAC unit tests for every role/permission pair;
- deny unknown role and unknown permission;
- middleware returns `401 UNAUTHORIZED` when principal is missing;
- middleware returns `403 FORBIDDEN` for missing permission;
- forbidden route does not call validation, controller, service, or repository;
- admin route order with Bearer auth first and permission second;
- site validation tests for strict unknown fields and lifecycle field rejection;
- category validation tests for strict unknown fields and empty patch;
- audit query validation tests;
- mapper tests proving editor projections expose identifiers required for allowed operations and omit privileged fields;
- mapper tests proving editor site projections include `id`, `categoryId`, and `category.id`;
- mapper tests proving editor category projections include `id`;
- site validation tests proving `featured` is rejected in create bodies for editor and admin;
- site service tests for draft create, `featured=false` on every new draft, editor draft update, admin update, lifecycle transitions, conflicts, inactive category block, duplicate slug conflict, and deleted-state errors;
- service tests proving update authorization goes through `assertCanUpdateSite` and central `PermissionPolicy`;
- category service tests for in-use delete block across every site state;
- repository or integration tests proving mutation plus audit are atomic;
- integration test proving editor creates a draft using `categoryId` returned by category API;
- integration tests proving UUID knowledge does not let editor run admin-only mutations;
- integration test proving site create writes `site.create_draft` and never `site.create`;
- integration test proving soft-delete of a published site resets `status` to draft and clears `publishedAt`;
- public catalog regression test proving a soft-deleted published site is no longer returned;
- cache tests proving unauthenticated, invalid Bearer, forbidden, validation, repository, and internal admin errors receive no-store;
- integration tests for all 15 admin endpoints;
- integration tests for admin-only audit read;
- public catalog regression tests from B3 still pass;
- auth API regression tests from B4 still pass;
- repository boundary test still passes.

Expected total after B5:

- existing B4 baseline is 156 tests;
- B5 must add enough tests to cover all route, RBAC, validation, audit, and lifecycle contracts;
- final `npm run check` must pass with at least 156 tests plus B5 tests.

## 21. Database And Fixture Safety

B5 tests use only `TEST_DATABASE_URL`.

Fixture rules:

- create dedicated fixture users with deterministic emails under a B5 prefix;
- create admin and editor users directly in the test database;
- issue B4-compatible access tokens through existing auth helpers or service contracts;
- create B5 fixture categories and sites with deterministic slugs under a B5 prefix;
- create audit rows only for B5 fixture actors or B5 fixture request IDs;
- cleanup targets only B5 fixture slugs, emails, request IDs, sessions, and audit rows;
- cleanup never deletes all users, sessions, categories, sites, or audit logs;
- tests do not require production or staging database URLs;
- tests do not print database URLs.

No B5 test may modify B2 seed snapshot files or depend on seeded sites being published.

## 22. Performance And Query Rules

Admin list endpoints:

- use indexed filters when possible: status, active, deletedAt, categoryId, sortOrder, createdAt, updatedAt;
- paginate with `skip` and `take` matching existing public catalog style;
- limit is capped at `100`;
- avoid N+1 queries by selecting category summaries in the same Prisma query;
- use a count plus rows transaction for paginated list responses;
- audit log list uses indexed actor, entity, action, and createdAt filters;
- category `includeCounts` uses grouped counts rather than per-category counts;
- no Redis, background jobs, queues, materialized views, or search indexes are added in B5.

## 23. Ordered Implementation Tasks

### Task 1: Branch, Gate, And File-Scope Guard

Files:

- read only: repository state and B0-B4 docs;
- no implementation files created until gate passes.

Steps:

- [ ] Verify branch is `feat/web00-backend-b5`.
- [ ] Verify `HEAD` is the owner-approved B5 starting point.
- [ ] Verify staged area is empty.
- [ ] Verify working tree is clean before implementation starts.
- [ ] Verify `backend/.env` exists only as ignored local infrastructure if needed, without printing it.
- [ ] Verify no schema, migration, seed, package, frontend, docs, assets, or workflow changes are present.

RED tests: no code tests in this task.

GREEN implementation: no code implementation in this task.

PASS criteria:

- git gate matches expected state;
- implementation begins only after an owner-approved B5 plan commit or clean plan state;
- no files are changed by the gate.

Rollback boundary:

- stop with `BLOCKED` rather than changing branch history or repository files.

Out of scope:

- commit, push, pull request, deploy, DB writes.

### Task 2: B5 Error Codes And RBAC Policy

Files:

- modify `backend/src/lib/errors.ts`;
- create `backend/src/modules/admin/rbac.types.ts`;
- create `backend/src/modules/admin/rbac.policy.ts`;
- create `backend/src/modules/admin/rbac.middleware.ts`;
- create `backend/tests/admin.rbac.test.ts`.

Steps:

- [ ] Add B5 error codes without changing existing B1-B4 codes.
- [ ] Define `B5Permission`.
- [ ] Define editor and admin grants exactly as Scope A.
- [ ] Implement deny-by-default `hasPermission`.
- [ ] Implement permission middleware that reads `request.auth`.
- [ ] Return `401 UNAUTHORIZED` for missing principal.
- [ ] Return `403 FORBIDDEN` for denied permission.
- [ ] Add tests for every permission in the matrix.
- [ ] Add tests for unknown role and unknown permission denial.
- [ ] Add grep-based test or assertion that role checks are centralized outside route/controller/service files.

RED tests:

- RBAC policy denies currently missing grants;
- middleware does not exist;
- B5 error codes do not compile.

GREEN implementation:

- minimal RBAC module and error-code additions.

PASS criteria:

- RBAC tests pass;
- existing errors tests pass;
- no admin route or service contains direct role comparison outside RBAC policy and role-aware mapper decisions.

Rollback boundary:

- remove new admin RBAC files and B5 error-code additions.

Out of scope:

- admin API routes, Prisma writes, schema changes.

### Task 3: Admin Cache And Auth Middleware

Files:

- create `backend/src/modules/admin/admin.types.ts`;
- create `backend/src/modules/admin/admin-cache-control.ts`;
- create `backend/src/modules/admin/admin-auth.middleware.ts`;
- create `backend/tests/admin.cache-control.test.ts`;
- create or extend integration permission test scaffolding.

Steps:

- [ ] Define `AdminRequest` and `AdminMutationContext`.
- [ ] Implement `adminCacheControl`.
- [ ] Implement B4 Bearer auth adapter for admin routes.
- [ ] Verify admin aggregate router installs cache-control before authentication.
- [ ] Verify missing Bearer header maps to `401 UNAUTHORIZED`.
- [ ] Verify inactive user maps to `403 USER_DISABLED`.
- [ ] Verify no refresh cookie authenticates admin routes.
- [ ] Verify cache headers are present on success and error responses.
- [ ] Verify mutation auth, permission, validation, and internal errors include `Pragma: no-cache`.

RED tests:

- admin auth middleware is missing;
- admin cache header helper is missing.

GREEN implementation:

- middleware-only code, no admin domain operations.

PASS criteria:

- middleware tests pass;
- auth regression tests still pass.

Rollback boundary:

- remove admin auth/cache files.

Out of scope:

- route business logic, database mutation, dependency changes.

### Task 4: Admin Site Validation, Types, And Mappers

Files:

- create `backend/src/modules/admin/sites/site.types.ts`;
- create `backend/src/modules/admin/sites/site.schemas.ts`;
- create `backend/src/modules/admin/sites/site.mapper.ts`;
- create `backend/tests/admin.site.validation.test.ts`;
- create `backend/tests/admin.site.mapper.test.ts`.

Steps:

- [ ] Define site query, create, patch, lifecycle, response, and repository record types.
- [ ] Implement strict UUID param schema.
- [ ] Implement strict list query schema.
- [ ] Implement create draft schema.
- [ ] Implement editor and admin patch schemas.
- [ ] Reject `featured` in create draft schema for every role.
- [ ] Reject lifecycle fields in generic patch.
- [ ] Reject unknown fields and empty patch.
- [ ] Implement role-aware mappers.
- [ ] Test editor site projection includes `id`, `categoryId`, and `category.id`.
- [ ] Test editor site projection omits `active`, `deletedAt`, `views`, audit fields, and security fields.
- [ ] Test admin projection includes approved admin fields.

RED tests:

- validation and mapper files are missing;
- editor identifier projection and privileged-field omission currently cannot be enforced.

GREEN implementation:

- pure validation and mapping with no Prisma calls.

PASS criteria:

- unit tests prove strict validation and projections.

Rollback boundary:

- remove site validation/types/mapper files and tests.

Out of scope:

- repositories, controllers, routes, schema changes.

### Task 5: Admin Site Repository And Service

Files:

- create `backend/src/modules/admin/sites/site.repository.ts`;
- create `backend/src/modules/admin/sites/site.service.ts`;
- create `backend/tests/admin.site.service.test.ts`;
- create integration support for B5 site fixtures.

Steps:

- [ ] Implement repository selects using the existing `Site`, `Category`, and `AuditLog` models.
- [ ] Implement list and detail reads with role-aware visibility.
- [ ] Implement create draft transaction with audit.
- [ ] Implement patch transaction with audit.
- [ ] Implement publish transaction with audit.
- [ ] Implement unpublish transaction with audit.
- [ ] Implement soft delete transaction with audit.
- [ ] Implement restore transaction with audit.
- [ ] Implement permanent delete transaction with audit.
- [ ] Verify audit insert failure rolls back each domain mutation path.
- [ ] Verify inactive category assignment returns `CATEGORY_INACTIVE`.
- [ ] Verify duplicate slug returns `SLUG_CONFLICT`.
- [ ] Verify editor create with `featured` returns `400 VALIDATION_ERROR`.
- [ ] Verify admin create with `featured` returns `400 VALIDATION_ERROR`.
- [ ] Verify editor-created and admin-created drafts have `featured=false`.
- [ ] Verify raw request body is never passed to Prisma.
- [ ] Verify `POST /api/admin/sites` creates exactly one `site.create_draft` audit row and no `site.create` row.
- [ ] Verify editor can update only non-deleted draft sites.
- [ ] Verify editor draft update passes.
- [ ] Verify admin draft update passes.
- [ ] Verify admin published update passes.
- [ ] Verify admin archived update passes.
- [ ] Verify editor published and archived updates return `403 FORBIDDEN`.
- [ ] Verify editor `featured` field returns `400 VALIDATION_ERROR`.
- [ ] Verify `assertCanUpdateSite` uses central `PermissionPolicy`.
- [ ] Verify admin cannot lifecycle-update through generic patch.
- [ ] Verify soft-delete of a published site sets `status="draft"`, `active=false`, `deletedAt=now`, and `publishedAt=null`.
- [ ] Verify public B3 site detail no longer returns the soft-deleted site.
- [ ] Verify restore returns draft and never published.
- [ ] Verify concurrent soft-delete creates exactly one successful audit row.
- [ ] Verify failed audit insert rolls back all four soft-delete lifecycle field changes.

RED tests:

- service methods are absent;
- lifecycle errors are absent;
- audit atomicity is absent for B5 mutations.

GREEN implementation:

- service enforces state machine and delegates atomic writes to repository transaction methods.

PASS criteria:

- all site service tests pass;
- all site mutation paths create exactly one audit row;
- no schema, migration, seed, package, or dependency files change.

Rollback boundary:

- remove site repository/service files and tests.

Out of scope:

- category API routes, audit read route, upload/storage, frontend.

### Task 6: Admin Category Validation, Types, And Mappers

Files:

- create `backend/src/modules/admin/categories/category.types.ts`;
- create `backend/src/modules/admin/categories/category.schemas.ts`;
- create `backend/src/modules/admin/categories/category.mapper.ts`;
- create `backend/tests/admin.category.validation.test.ts`;
- create `backend/tests/admin.category.mapper.test.ts`.

Steps:

- [ ] Define category query, create, patch, response, and repository record types.
- [ ] Implement strict UUID param schema.
- [ ] Implement strict list query schema.
- [ ] Implement create schema.
- [ ] Implement patch schema.
- [ ] Reject unknown fields and empty patch.
- [ ] Implement role-aware mappers.
- [ ] Test editor category projection includes `id`.
- [ ] Test editor category projection omits `active`, `createdAt`, and `updatedAt`.
- [ ] Test admin projection includes approved admin fields.

RED tests:

- category validation and mapper files are missing.

GREEN implementation:

- pure validation and mapping with no Prisma writes.

PASS criteria:

- category validation and mapper unit tests pass.

Rollback boundary:

- remove category validation/types/mapper files and tests.

Out of scope:

- category repository writes, schema changes.

### Task 7: Admin Category Repository And Service

Files:

- create `backend/src/modules/admin/categories/category.repository.ts`;
- create `backend/src/modules/admin/categories/category.service.ts`;
- create `backend/tests/admin.category.service.test.ts`;
- create integration support for category fixtures.

Steps:

- [ ] Implement category list and detail with role-aware visibility.
- [ ] Implement create transaction with audit.
- [ ] Implement patch transaction with audit.
- [ ] Implement delete transaction with linked-site count guard and audit.
- [ ] Count linked sites across all states before category delete.
- [ ] Return `CATEGORY_IN_USE` when any site references the category.
- [ ] Verify duplicate category slug returns `SLUG_CONFLICT`.
- [ ] Verify editor category mutations are unreachable through permissions.
- [ ] Verify audit insert failure rolls back create, update, and delete.

RED tests:

- category service methods are absent;
- in-use delete guard is absent;
- category mutation audit rows are absent.

GREEN implementation:

- service and repository over existing `Category`, `Site`, and `AuditLog`.

PASS criteria:

- all category service tests pass;
- no cascade site deletion occurs;
- no schema, migration, seed, package, or dependency files change.

Rollback boundary:

- remove category repository/service files and tests.

Out of scope:

- user management, site ownership, uploads.

### Task 8: Admin Audit Read Module

Files:

- create `backend/src/modules/admin/audit/audit-log.types.ts`;
- create `backend/src/modules/admin/audit/audit-log.schemas.ts`;
- create `backend/src/modules/admin/audit/audit-log.mapper.ts`;
- create `backend/src/modules/admin/audit/audit-log.repository.ts`;
- create `backend/src/modules/admin/audit/audit-log.service.ts`;
- create `backend/src/modules/admin/audit/audit-log.controller.ts`;
- create `backend/src/modules/admin/audit/audit-log.routes.ts`;
- create `backend/tests/admin.audit-log.validation.test.ts`;
- create `backend/tests/admin.audit-log.mapper.test.ts`;
- create `backend/tests/integration/admin-audit-api.test.ts`.

Steps:

- [ ] Implement strict audit query schema.
- [ ] Implement audit-log select with optional actor summary.
- [ ] Implement safe audit mapper.
- [ ] Implement paginated list with filters.
- [ ] Allow filtering by `site.create_draft` action.
- [ ] Add route with `audit.read` permission.
- [ ] Prove editor receives `403 FORBIDDEN` before repository access.
- [ ] Prove response omits `ipHash` and `userAgentHash`.
- [ ] Prove invalid query returns `400 VALIDATION_ERROR`.

RED tests:

- audit read module is absent;
- editor can not yet be denied by route because route does not exist.

GREEN implementation:

- read-only audit API with admin-only permission.

PASS criteria:

- audit read tests pass;
- no audit mutation endpoint exists.

Rollback boundary:

- remove audit module files and tests.

Out of scope:

- audit export, audit deletion, log retention, storage cleanup jobs.

### Task 9: Admin Controllers, Routes, And App Wiring

Files:

- create `backend/src/modules/admin/admin.routes.ts`;
- create `backend/src/modules/admin/sites/site.controller.ts`;
- create `backend/src/modules/admin/sites/site.routes.ts`;
- create `backend/src/modules/admin/categories/category.controller.ts`;
- create `backend/src/modules/admin/categories/category.routes.ts`;
- modify `backend/src/app.ts`;
- modify `backend/src/server.ts`;
- create `backend/tests/integration/admin-sites-api.test.ts`;
- create `backend/tests/integration/admin-categories-api.test.ts`;
- create `backend/tests/integration/admin-api-permissions.test.ts`.

Steps:

- [ ] Add `adminRoutes?: Router` to `CreateAppOptions`.
- [ ] Mount admin routes under `/api/admin` after auth routes and before test routes.
- [ ] Wire admin services and repositories in `server.ts` using the existing Prisma client.
- [ ] Register all 15 admin endpoints.
- [ ] Install `adminCacheControl()` as the first middleware inside the aggregate admin router.
- [ ] Attach route-specific permission middleware before validators.
- [ ] Attach validators before controllers.
- [ ] Return `201` for create operations.
- [ ] Return `200` for read, patch, publish, unpublish, soft delete, and restore.
- [ ] Return `204` for permanent site delete and category delete.
- [ ] Prove all site endpoints work with admin fixture.
- [ ] Prove allowed editor site and category reads work with editor fixture.
- [ ] Prove editor site list returns `id` and `categoryId`.
- [ ] Prove editor category list returns `id`.
- [ ] Prove editor can create a draft using `categoryId` from the category API.
- [ ] Prove editor forbidden endpoints return `403` and do not call repository.
- [ ] Prove permission middleware interface remains single-permission and route table has no ambiguous update permission.
- [ ] Prove unauthenticated and invalid Bearer admin errors receive no-store.
- [ ] Prove mutation `401`, `403`, `400`, `404`, `409`, `410`, `429`, and `500` responses receive `Pragma: no-cache`.
- [ ] Prove public catalog routes still behave as before.

RED tests:

- admin routes are absent;
- app does not mount `/api/admin`;
- server does not wire admin services.

GREEN implementation:

- route/controller/app/server integration only after services exist.

PASS criteria:

- all integration tests for sites, categories, audit, and permissions pass;
- existing health, public catalog, auth, server, and repository-boundary tests pass.

Rollback boundary:

- remove admin routes/controllers and undo `app.ts` and `server.ts` wiring.

Out of scope:

- frontend admin UI, CORS changes, deploy.

### Task 10: Final Regression, Security Gate, And Scope Check

Files:

- no new functional files after Task 9 unless a failing test points to an approved B5 file in the file map.

Commands:

```powershell
Set-Location D:\WEB00_BACKEND
git diff --check
git status --short
git diff --cached --name-only

$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$env:PATH = "$PortableRoot;$env:PATH"

Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run check
& $PortableNpm run db:migrate:status
& $PortableNpm run seed:verify
& $PortableNpm audit --omit=dev --audit-level=high
& $PortableNpm audit --audit-level=high

Set-Location D:\WEB00_BACKEND
git diff --name-only -- backend\prisma\schema.prisma
git diff --name-only -- backend\prisma\migrations
git diff --name-only -- backend\prisma\seed-data\web00-catalog.json
git diff --name-only -- backend\package.json
git diff --name-only -- backend\package-lock.json
git diff --name-only -- docs
git diff --name-only -- assets
git diff --name-only -- .github
git status --short
```

PASS criteria:

- `git diff --check` passes;
- `npm run check` passes;
- test count is at least the B4 baseline plus B5 tests;
- `db:migrate:status` is clean;
- `seed:verify` reports 7 categories and 15 sites;
- high-threshold production audit exits `0`;
- high-threshold full audit exits `0`;
- schema diff is empty;
- migration diff is empty;
- seed snapshot diff is empty;
- package file diffs are empty;
- docs, assets, and `.github` diffs are empty during implementation;
- `backend/.env`, `backend/dist`, `backend/node_modules`, `backend/coverage`, and `backend/src/generated/prisma` are not staged;
- no push, pull request, merge, or deploy occurred.

Rollback boundary:

- if forbidden files are staged, run `git restore --staged -- backend`;
- if forbidden files are modified, stop with `BLOCKED` and report exact paths without reverting user work.

Out of scope:

- commit, push, pull request, merge, deploy unless the owner sends a separate explicit instruction after verification.

## 24. Final Verification Checklist

Before any owner-approved B5 implementation commit:

- [ ] branch is `feat/web00-backend-b5`;
- [ ] staged area contains only approved B5 backend implementation files;
- [ ] `backend/.env` is not staged;
- [ ] `backend/dist/**` is not staged;
- [ ] `backend/node_modules/**` is not staged;
- [ ] `backend/coverage/**` is not staged;
- [ ] `backend/src/generated/prisma/**` is not staged;
- [ ] `docs/**` is not staged for the implementation commit;
- [ ] `assets/**` is not staged;
- [ ] `.github/**` is not staged;
- [ ] `backend/prisma/schema.prisma` is unchanged;
- [ ] `backend/prisma/migrations/**` is unchanged;
- [ ] `backend/prisma/seed-data/web00-catalog.json` is unchanged;
- [ ] `backend/package.json` is unchanged;
- [ ] `backend/package-lock.json` is unchanged;
- [ ] all 15 admin endpoints exist;
- [ ] editor permissions equal `site.read`, `site.createDraft`, `site.updateDraft`, `category.read`;
- [ ] admin permissions include every B5 permission;
- [ ] unknown role is denied;
- [ ] editor site DTO includes `id`, `categoryId`, and `category.id`;
- [ ] editor category DTO includes `id`;
- [ ] editor cannot infer resource existence for admin-only endpoints;
- [ ] create-draft schema rejects `featured`;
- [ ] every new draft has `featured=false`;
- [ ] `PATCH /api/admin/sites/:id` route-level permission is exactly `site.updateDraft`;
- [ ] non-draft and featured updates require `site.updateAny` through central policy;
- [ ] admin cache-control middleware runs before authentication;
- [ ] admin auth and permission errors receive `Cache-Control: no-store`;
- [ ] generic site patch cannot change lifecycle fields;
- [ ] soft-delete sets `status="draft"` and `publishedAt=null`;
- [ ] `CATEGORY_INACTIVE` maps to HTTP `409`;
- [ ] site creation audit action is `site.create_draft`;
- [ ] category delete blocks when any linked site exists;
- [ ] every B5 mutation writes exactly one audit row in the same transaction;
- [ ] audit read endpoint is admin-only and read-only;
- [ ] no user management or first-admin bootstrap exists;
- [ ] no upload/storage API exists;
- [ ] no frontend integration exists;
- [ ] `git diff --check` passes;
- [ ] `npm run check` passes;
- [ ] `npm run db:migrate:status` is clean;
- [ ] `npm run seed:verify` passes;
- [ ] both high-threshold audit commands exit `0`;
- [ ] no push, pull request, merge, or deploy happened.

## 25. Acceptance Criteria

B5 is acceptable when:

- central RBAC is deny-by-default;
- permission matrix exactly matches Scope A;
- `/api/admin/sites` implements the 9 planned endpoints;
- `/api/admin/categories` implements the 5 planned endpoints;
- `/api/admin/audit-logs` implements the read-only audit endpoint;
- every admin route requires B4 Bearer authentication;
- active-user verification occurs before permission checks;
- admin cache-control middleware runs before authentication;
- permission checks occur before validation and repository access;
- forbidden editor calls return `403 FORBIDDEN` without leaking existence;
- editor site responses include identifiers needed for allowed detail and patch operations;
- editor category responses include identifiers needed for site category assignment;
- site create always creates draft records with `featured=false`;
- create-draft request schema rejects `featured` for every role;
- editor can update only non-deleted draft sites and only allow-listed fields;
- admin can patch non-lifecycle fields on non-deleted sites;
- non-draft and featured site updates require `site.updateAny` through central policy;
- lifecycle changes happen only through dedicated endpoints;
- soft-delete resets `status` to draft and clears `publishedAt`;
- archived behavior follows Section 11;
- `CATEGORY_INACTIVE` returns `409`;
- category delete is blocked by any linked site in any state;
- every mutation has one atomic audit row;
- site creation audit action is `site.create_draft`;
- audit data is safe and does not expose secrets;
- audit read omits hash fields and raw request context;
- validation is strict and safe;
- cache headers are applied to admin responses;
- public catalog behavior remains unchanged;
- auth behavior remains unchanged;
- B2 schema, migration, seed, and packages remain unchanged;
- no dependency is added or updated;
- all checks in Section 23 pass;
- no push, pull request, merge, or deploy occurs without separate explicit owner approval.

## 26. Risks, Mitigations, And Plan-Only Completion Check

| Risk | Mitigation |
| --- | --- |
| RBAC logic becomes scattered | Keep permission matrix only in `rbac.policy.ts`; route middleware consumes permissions; tests scan admin files for direct role comparisons outside approved policy and mapper projection boundaries |
| Editor learns whether protected resources exist | Run permission middleware before validation and repository access; integration tests use missing and existing UUIDs and expect identical `403 FORBIDDEN` for forbidden endpoints |
| Generic patch changes lifecycle fields | Strict patch schemas reject lifecycle fields; service ignores no client lifecycle fields; lifecycle actions have dedicated endpoints |
| Audit row is missing after mutation | Repository mutation methods use Prisma transactions that include audit insert; tests force audit failure and expect domain rollback |
| Audit stores unsafe data | Audit builders use allow-listed snapshots and changed-field subsets; tests assert no token, cookie, password hash, DB URL, raw headers, `ipHash`, or `userAgentHash` leaks through read API |
| Category delete cascades or removes linked site data | Service counts all linked sites before delete; FK remains restrict; integration tests cover draft, published, archived, inactive, and soft-deleted linked sites |
| Existing public catalog leaks draft or deleted content | B3 public visibility helpers remain unchanged; public catalog regression tests run in final check |
| B5 accidentally changes schema or seed | Final git diff checks block `schema.prisma`, migrations, and seed snapshot changes |
| B5 accidentally changes dependencies | Final git diff checks block package file changes; no install/update commands are part of B5 |
| Archived state creates unclear transitions | B5 documents read/admin-edit/no direct publish behavior; restore from soft delete returns draft; new archive flow remains outside B5 |
| Tests damage shared data | Fixture prefixes and targeted cleanup limit test data; cleanup never deletes all rows in core tables |
| Security audit regresses | High-threshold production and full audit commands gate final completion |

This planning task is complete only when:

- `docs/WEB00_BACKEND_B5_IMPLEMENTATION_PLAN.md` exists;
- no backend file has changed;
- no dependency file has changed;
- no schema, migration, or seed file has changed;
- no database write has been performed;
- no B5 implementation has started;
- before the owner-approved docs-only commit, `git status --short` shows exactly `?? docs/WEB00_BACKEND_B5_IMPLEMENTATION_PLAN.md`;
- after the owner-approved docs-only commit, working tree is clean and the latest commit contains only `docs/WEB00_BACKEND_B5_IMPLEMENTATION_PLAN.md`;
- no push, pull request, merge, or deploy has been performed;
- `git diff --check` passes;
- the document contains no unresolved placeholder markers;
- the B5 scope remains Scope A only.
