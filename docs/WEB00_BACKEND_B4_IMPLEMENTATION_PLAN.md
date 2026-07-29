# WEB00 Backend B4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add the WEB00 backend authentication foundation for login, refresh, logout, and current-user lookup without changing the existing Prisma schema, seed data, public catalog API, frontend, workflows, or deployment.

**Architecture:** B4 adds one isolated `auth` module under `backend/src/modules/auth/` and keeps the B1-B3 application boundary intact. Environment parsing, dependency construction, Prisma client creation, and route wiring stay in `server.ts`; `app.ts` remains an importable Express app that receives prebuilt services through options and never reads `process.env`.

**Tech Stack:** Node.js `22.23.1`, TypeScript `5.9.x`, Express 5, Zod, Vitest, Supertest, Prisma `7.8.0`, PostgreSQL 17.10, `jose@6.2.3`, `argon2@0.45.1`, `cookie@2.0.1`, and `express-rate-limit@8.6.0`.

## Global Constraints

- Work from `D:\WEB00_BACKEND` on branch `feat/web00-backend-b4`.
- B4 starts from commit `7fffc90c23b7c573eb4179a2370f381c84db10f3`.
- This planning task creates only `docs/WEB00_BACKEND_B4_IMPLEMENTATION_PLAN.md`.
- Future B4 implementation may change only approved backend files listed in this plan.
- Do not change Prisma schema, migrations, migration lock, seed scripts, `backend/prisma/seed-data/web00-catalog.json`, frontend files, assets, GitHub workflows, docs other than approved B4 planning or closeout documents, or root package files.
- Do not create users, refresh sessions, audit rows, or database data outside isolated B4 tests that use `TEST_DATABASE_URL`.
- Do not add public registration, forgot/reset password, email delivery, MFA, OAuth/OIDC, admin CRUD, admin UI, permissions for B5 admin endpoints, frontend token storage, CORS for GitHub Pages, Redis, Render deploy, or production admin bootstrap in B4.
- All backend TypeScript relative imports continue to use emitted `.js` extensions under NodeNext ESM.
- `app.ts` must not read `process.env`; production environment parsing remains in `server.ts`.
- `server.ts` creates the Prisma client once, creates auth services once, and keeps graceful shutdown with `prisma.$disconnect()`.
- `backend/vitest.config.ts` keeps `fileParallelism: false` because the PostgreSQL test database is shared across integration test files.
- Use portable Node only for future implementation commands:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$OriginalPath = $env:PATH
$env:PATH = "$PortableRoot;$OriginalPath"
```

---

## 1. Goal

B4 implements the authentication foundation required before admin APIs:

- `POST /api/auth/login`;
- `POST /api/auth/refresh`;
- `POST /api/auth/logout`;
- `GET /api/auth/me`;
- password hashing and verification with Argon2id;
- JWT access tokens with `jose`;
- opaque refresh tokens stored only as SHA-256 hashes;
- refresh-session rotation with reuse detection;
- authentication middleware for future admin phases;
- strict refresh cookie serialization and parsing;
- production Origin checks for browser auth POST routes;
- login and refresh rate limiting;
- safe auth audit events and safe warning logs;
- PostgreSQL integration tests that preserve all 109 B1-B3 tests.

B4 is successful only when authentication behavior is implemented, verified against `TEST_DATABASE_URL`, and committed in a later owner-approved implementation task. This plan task does not implement code and does not create a commit.

## 2. Preconditions

Future B4 implementation starts only when all preconditions are true:

- current branch is `feat/web00-backend-b4`;
- base commit is `7fffc90c23b7c573eb4179a2370f381c84db10f3`;
- working tree is clean or contains only the already approved B4 plan file before implementation begins;
- staged area is empty;
- `backend/.env` exists locally, is ignored by Git, and is not printed;
- root `package.json` is absent;
- PostgreSQL 17.10 on `127.0.0.1:5433` is available;
- B2 migration is applied to `web00_backend_dev` and `web00_backend_test`;
- `TEST_DATABASE_URL` points to the isolated local test database and never equals `DATABASE_URL` or `SHADOW_DATABASE_URL`;
- B3 public catalog implementation commit `7fffc90c23b7c573eb4179a2370f381c84db10f3` is present;
- all 109 B1-B3 tests pass before the first B4 code change.

Read-only start gate:

```powershell
Set-Location D:\WEB00_BACKEND
git branch --show-current
git rev-parse HEAD
git status --short
git diff --cached --name-only
git check-ignore -q backend/.env

Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm run check
& $PortableNpm run db:migrate:status
& $PortableNpm run seed:verify
& $PortableNpm audit --omit=dev --audit-level=high
& $PortableNpm audit --audit-level=high
```

Expected:

- branch `feat/web00-backend-b4`;
- HEAD `7fffc90c23b7c573eb4179a2370f381c84db10f3`;
- working tree clean except an approved uncommitted B4 plan during the planning phase;
- staged area empty;
- B1-B3 check passes with at least 109 tests;
- migration status clean;
- seed snapshot verification reports `categories=7 sites=15`;
- high and critical vulnerabilities are absent.

If any precondition fails, future implementation is blocked before dependency installation or code changes.

## 3. Scope

B4 includes:

- exact auth dependency installation into `backend/package.json` and `backend/package-lock.json`;
- auth environment parsing and safe `.env.example` placeholders;
- Argon2id password hashing and generic credential verification;
- access JWT signing and verification with `jose` and HS256 only;
- refresh token generation, hashing, cookie serialization, cookie parsing, rotation, and reuse detection;
- auth repository methods over existing `User`, `RefreshSession`, and `AuditLog` models;
- auth service methods for login, refresh, logout, and me;
- auth controllers and routes;
- authentication middleware and typed request principal;
- production Origin guard for browser auth POST endpoints;
- login and refresh rate limiters through `express-rate-limit`;
- safe auth audit DB events and safe warning logs for failed login attempts;
- unit tests for primitives and policy;
- Supertest/PostgreSQL integration tests through `TEST_DATABASE_URL`;
- final checkpoint preserving B1-B3 tests and B3 public catalog behavior.

## 4. Explicit out-of-scope

B4 excludes:

- public registration;
- forgot password or reset password;
- email delivery;
- MFA;
- OAuth/OIDC;
- user-management CRUD;
- admin sites/categories API;
- admin UI;
- authorization policy for B5 admin endpoints beyond reusable authentication middleware and role-bearing principal types;
- frontend token storage;
- CORS for GitHub Pages;
- Redis or external rate-limit store;
- Render deploy;
- Prisma schema changes;
- migration SQL changes;
- seed or snapshot changes;
- production admin bootstrap;
- creation of real production users or sessions;
- dependency overrides;
- `npm audit fix`;
- push, PR, merge, or deploy.

## 5. Dependency contract

Future B4 implementation adds exactly these runtime dependencies:

```json
{
  "dependencies": {
    "argon2": "0.45.1",
    "cookie": "2.0.1",
    "express-rate-limit": "8.6.0",
    "jose": "6.2.3"
  }
}
```

Rules:

- the packages are added to `dependencies`, not `devDependencies`;
- versions are exact, with no caret, tilde, tag, range, alias, or override;
- install command is:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm install --save-exact jose@6.2.3 argon2@0.45.1 cookie@2.0.1 express-rate-limit@8.6.0
```

- no `jsonwebtoken`;
- no `bcrypt`;
- no `cookie-parser`;
- no `express-session`;
- no additional auth packages;
- no new dev dependency unless a separate owner task approves it;
- `package-lock.json` is updated only by portable npm;
- `argon2` install is verified on portable Node `22.23.1`;
- if `argon2` cannot install or load a compatible prebuilt binary on the WEB00 runtime, B4 implementation stops with `BLOCKED`;
- `npm audit fix`, `npm audit fix --force`, package overrides, and manual installation of transitive packages are forbidden.

Argon2 verification command:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNode -e "import('argon2').then((argon2) => console.log(typeof argon2.hash, typeof argon2.verify))"
```

Expected output:

```text
function function
```

Security gate:

- existing 4 moderate Prisma tooling advisories are accepted for B4 implementation;
- any high or critical finding is a blocker;
- any vulnerability in `jose`, `argon2`, `cookie`, or `express-rate-limit` at high or critical severity is a blocker;
- a moderate finding in new B4 packages requires owner risk acceptance before commit.

## 6. Authentication architecture

The auth module is split by responsibility:

- schemas validate HTTP input and normalize email;
- password service owns Argon2id hashing, verification, dummy hash verification, and password size limits;
- credential service owns normalized email lookup, generic credential verification, dummy verification for missing/inactive users, and one `INVALID_CREDENTIALS` outcome;
- access token service owns JWT signing and verification;
- refresh token service owns raw token generation and SHA-256 hashing;
- refresh session service owns rotation, reuse detection, and family revocation transactions;
- cookie helper owns `cookie` package serialization and parsing;
- cache-control helper owns auth response no-store headers;
- Origin helper owns production Origin enforcement;
- rate-limit helper owns Express limiter instances and safe keys;
- repository owns Prisma reads and atomic Prisma write use cases;
- audit helper owns safe DB audit events and safe warning logs;
- auth service owns login, refresh, logout, and me orchestration after credential/JWT/refresh primitives exist;
- controllers adapt HTTP to service methods;
- routes mount middleware in the required order;
- auth middleware verifies Bearer access tokens and attaches a typed principal.

Request lifecycle for `POST /api/auth/login`:

1. request ID middleware;
2. JSON parser with existing `100kb` limit;
3. request logger;
4. auth route;
5. login body parser for normalized email and password-size guard;
6. production Origin guard;
7. login rate limiter keyed by IP prefix and normalized email hash;
8. auth no-store middleware sets `Cache-Control: no-store` and `Pragma: no-cache`;
9. controller calls `authService.login`;
10. credential verifier checks user/password outside a database transaction;
11. auth service generates session IDs, refresh token material, fingerprints, and access JWT outside a database transaction;
12. auth service calls `commitLoginSuccess` for the short atomic Prisma transaction;
13. controller sets refresh cookie and returns JSON only after the commit succeeds;
14. final 404 and error handler remain after auth routes.

Request lifecycle for `POST /api/auth/refresh`:

1. request ID middleware;
2. JSON parser;
3. request logger;
4. auth route;
5. production Origin guard;
6. refresh IP limiter;
7. auth no-store middleware sets `Cache-Control: no-store` and `Pragma: no-cache`;
8. controller calls `authService.refresh`;
9. service parses refresh cookie, hashes raw token, rotates session in a transaction, replaces cookie, and returns JSON;
10. reuse detection revokes the whole family with an audit event in one transaction and clears cookie.

Request lifecycle for `POST /api/auth/logout`:

1. request ID middleware;
2. JSON parser;
3. request logger;
4. auth route;
5. production Origin guard;
6. auth no-store middleware sets `Cache-Control: no-store`;
7. controller calls idempotent logout;
8. service clears cookie and revokes the current family with an audit event when a valid refresh cookie or bearer token identifies it;
9. response is `204` with no body.

Request lifecycle for `GET /api/auth/me`:

1. request ID middleware;
2. request logger;
3. auth no-store middleware sets `Cache-Control: no-store`;
4. auth middleware verifies Authorization Bearer access token;
5. middleware loads active user by `sub`;
6. controller returns only public auth user fields.

`app.ts` integration:

- `CreateAppOptions` gains optional `authRoutes?: Router`;
- route mounting happens before `registerTestRoutes`, `notFoundMiddleware`, and `errorHandler`;
- public catalog service remains optional and unchanged;
- health remains public and DB-free.

`server.ts` integration:

- `main()` parses `AppEnv`, `DatabaseEnv`, and `AuthEnv` from `process.env`;
- `startServer` receives typed env values and injectable factories for tests;
- production creates one Prisma client;
- production creates public catalog service once;
- production creates auth service once;
- Prisma client is never created inside request handlers;
- graceful shutdown keeps one `prisma.$disconnect()` call.

## 7. Environment and secret contract

Future B4 extends environment parsing without changing `app.ts`.

Add typed auth environment:

```typescript
export interface AuthEnv {
  ACCESS_TOKEN_TTL_SECONDS: number;
  AUTH_FINGERPRINT_SECRET_BASE64: string;
  AUTH_ORIGIN?: string;
  JWT_ACCESS_SECRET_BASE64: string;
  JWT_AUDIENCE: "web00-admin";
  JWT_ISSUER: "web00-backend";
  REFRESH_TOKEN_TTL_SECONDS: number;
  TRUST_PROXY_HOPS: number;
}

export interface AuthSecrets {
  accessTokenKey: Uint8Array;
  fingerprintKey: Uint8Array;
}
```

Add safe placeholders to future `backend/.env.example`:

```text
JWT_ACCESS_SECRET_BASE64="base64-random-32-bytes-min"
JWT_ISSUER="web00-backend"
JWT_AUDIENCE="web00-admin"
ACCESS_TOKEN_TTL_SECONDS="900"
REFRESH_TOKEN_TTL_SECONDS="604800"
AUTH_ORIGIN="https://backend.example.test"
AUTH_FINGERPRINT_SECRET_BASE64="base64-random-32-bytes-min"
TRUST_PROXY_HOPS="0"
```

Rules:

- `JWT_ACCESS_SECRET_BASE64` decodes to at least 32 random bytes;
- `AUTH_FINGERPRINT_SECRET_BASE64` is separate and decodes to at least 32 random bytes;
- the two decoded keys must not be equal;
- `JWT_ISSUER` is exactly `web00-backend`;
- `JWT_AUDIENCE` is exactly `web00-admin`;
- access token TTL is `900` seconds;
- refresh absolute TTL is `604800` seconds;
- refresh rotation never extends the absolute family expiry;
- `AUTH_ORIGIN` is required in production and optional in development/test;
- `TRUST_PROXY_HOPS` is an integer from `0` to `3`;
- `TRUST_PROXY_HOPS` is never boolean `true`;
- `app.set("trust proxy", true)` is forbidden;
- if `TRUST_PROXY_HOPS > 0`, `app.set("trust proxy", TRUST_PROXY_HOPS)` is configured by app construction through typed options;
- secrets are never logged, returned, committed, or included in thrown error messages;
- auth env errors name only variable names and safe rule labels.

`tests/setup.ts` must preserve and restore these new mutable environment keys:

- `JWT_ACCESS_SECRET_BASE64`;
- `JWT_ISSUER`;
- `JWT_AUDIENCE`;
- `ACCESS_TOKEN_TTL_SECONDS`;
- `REFRESH_TOKEN_TTL_SECONDS`;
- `AUTH_ORIGIN`;
- `AUTH_FINGERPRINT_SECRET_BASE64`;
- `TRUST_PROXY_HOPS`.

## 8. Password contract

B4 uses Argon2id for production password hashing:

```typescript
export const productionArgon2Options = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32
});
```

Rules:

- random salt is generated by the `argon2` library;
- plaintext password is never stored;
- plaintext password is never logged;
- password hash is never returned in API responses;
- login request password is a string with minimum length `1`;
- login request password maximum input size is `1024` characters to bound CPU and memory work;
- tests may use an injected test hasher with lower cost, but production hasher parameters remain unchanged and covered by unit tests;
- unknown email, wrong password, and inactive user during login return the same `401 INVALID_CREDENTIALS`;
- login must not reveal whether the user exists or is active;
- unknown and inactive users still run `verify(dummyHash, password)` so timing does not trivially reveal existence;
- `lastLoginAt` updates only after successful login;
- failed login writes a safe structured warning with `requestId` and hashed normalized email, not a DB audit row per attempt.

Dummy hash contract:

- B4 stores a constant dummy Argon2id hash generated with the same production parameters;
- dummy hash value is not a secret, but it is not logged;
- if dummy verification throws, the service maps it to safe `401 INVALID_CREDENTIALS` for login and logs only a safe error event internally.

## 9. Access-token contract

Use `jose` only:

- sign with `new SignJWT(...)`;
- verify with `jwtVerify(...)`;
- algorithm whitelist is exactly `HS256`;
- access token TTL is `900` seconds;
- access token is returned only in JSON responses;
- access token is not stored in a cookie;
- access token is not stored in PostgreSQL;
- access token is not logged.

Claims:

```typescript
export interface AccessTokenClaims {
  aud: "web00-admin";
  exp: number;
  iat: number;
  iss: "web00-backend";
  jti: string;
  role: "admin" | "editor";
  sessionId: string;
  sub: string;
}
```

Rules:

- `sub` is the user UUID;
- `role` is `admin` or `editor`;
- `sessionId` is the refresh session UUID;
- `jti` is a random UUID;
- `iat` and `exp` are numeric seconds;
- verification checks signature, protected header algorithm, issuer, audience, and expiration;
- malformed, expired, wrong-algorithm, wrong-issuer, wrong-audience, or invalid-signature tokens return `401 UNAUTHORIZED`;
- token verification loads the user by `sub`;
- missing user or inactive user returns `403 USER_DISABLED`;
- `passwordHash`, refresh sessions, last login timestamp, and audit fields are never included in token response user objects.

Authenticated principal:

```typescript
export interface AuthenticatedPrincipal {
  id: string;
  email: string;
  role: "admin" | "editor";
  sessionId: string;
  tokenId: string;
}
```

## 10. Refresh-session contract

Raw refresh token:

- generated with `crypto.randomBytes(48)`;
- encoded with `base64url`;
- not a JWT;
- contains no user, session, role, or expiry data;
- returned only through the refresh cookie;
- never stored in PostgreSQL;
- never logged.

Database storage:

- `tokenHash = SHA-256(rawRefreshToken)` encoded as lowercase hex;
- only the hash is saved in `refresh_sessions.token_hash`;
- `tokenHash` uniqueness relies on existing Prisma schema and database unique index;
- session links to `userId`;
- `familyId` is generated at login and retained during every rotation;
- `expiresAt` is the absolute expiry of the session family;
- rotation never extends `expiresAt`;
- `ipHash` and `userAgentHash` are optional HMAC telemetry fields.

Login execution order:

Outside any PostgreSQL transaction:

1. validate input;
2. normalize email;
3. find user by normalized email through the credential verifier;
4. run Argon2 verify or dummy verify;
5. reject missing, wrong-password, and inactive users as `INVALID_CREDENTIALS`;
6. generate `sessionId`;
7. generate `familyId`;
8. generate raw refresh token;
9. compute `tokenHash`;
10. compute absolute `expiresAt`;
11. compute safe `ipHash` and `userAgentHash` fingerprints;
12. sign access JWT for the preselected `sessionId`.

Inside one short Prisma transaction through `commitLoginSuccess`:

1. create `RefreshSession`;
2. update `User.lastLoginAt`;
3. create safe `auth.login.success` `AuditLog`.

After successful commit:

1. set refresh cookie;
2. return the pre-signed access JWT;
3. return safe user projection.

Rules:

- HTTP response is not sent before successful DB commit;
- if the DB transaction rolls back, the access token and raw refresh token are not returned;
- Argon2 verification is forbidden inside Prisma transactions;
- `jose` signing is forbidden inside Prisma transactions;
- logger calls are forbidden inside Prisma transactions;
- HTTP response and cookie serialization logic are forbidden inside Prisma transactions;
- the login transaction contains only the required Prisma DB operations.

Refresh transaction:

1. parse refresh cookie through `cookie`;
2. compute token hash;
3. find refresh session by token hash with user;
4. unknown token returns `401 REFRESH_INVALID`;
5. expired token returns `401 REFRESH_EXPIRED` and clears cookie;
6. inactive or missing user returns `403 USER_DISABLED`, revokes the family, clears cookie, and writes `auth.user_disabled`;
7. revoked or replaced token triggers reuse detection;
8. generate successor session ID and raw token before the transaction;
9. transaction creates successor session with the same `familyId` and same absolute `expiresAt`;
10. conditional update of the old session succeeds only when `revokedAt = null`, `replacedBySessionId = null`, and `expiresAt > now`;
11. old session receives `revokedAt` and `replacedBySessionId`;
12. if conditional update count is not `1`, throw a reuse marker so the successor insert is rolled back;
13. return a new access token and replace the cookie after the rotation transaction commits.

Concurrent refresh rule:

- two parallel refresh requests with the same raw token cannot both succeed;
- one creates a successor and returns `200`;
- the second observes a failed conditional update or a replaced session;
- the second is treated as reuse/replay;
- the losing transaction rolls back any temporary successor;
- reuse handling revokes all active sessions in the family.

Reuse detection:

- revoked or replaced token use returns `403 REFRESH_REUSE_DETECTED`;
- all active sessions for the `familyId` receive `revokedAt`;
- refresh cookie is cleared;
- safe `auth.refresh.reuse_detected` audit event is created in the same transaction that revokes the family;
- response does not identify which session was active;
- token hash and raw token are not logged or returned.

Logout:

- idempotent;
- always clears refresh cookie;
- valid refresh cookie revokes the current session family with `auth.logout` audit when actor/session is known;
- bearer access token may provide `sessionId` to revoke the family with `auth.logout` audit when refresh cookie is missing;
- missing, malformed, unknown, or expired tokens do not become `500`;
- response is `204` with no body;
- access JWT is not stored server-side and expires naturally.

## 11. Cookie and origin contract

Cookie names:

- development and test: `web00_refresh`;
- production: `__Secure-web00_refresh`.

Cookie attributes:

- `HttpOnly=true`;
- `Secure=true` in production;
- `SameSite=Strict`;
- `Path=/api/auth`;
- `Domain` is never set;
- `Max-Age` equals remaining absolute session lifetime in seconds;
- `Expires` matches the same absolute expiry;
- clear cookie uses the same name, path, SameSite, and Secure settings;
- production `__Secure-` cookie is forbidden unless `Secure=true`.

Implementation rules:

- parse and serialize through `cookie@2.0.1`;
- do not manually split `Cookie` header on semicolons;
- do not use `cookie-parser`;
- cookie value is never logged.

Origin rules for browser auth POST endpoints:

- `POST /api/auth/login`, `POST /api/auth/refresh`, and `POST /api/auth/logout` run the Origin guard;
- in production, `Origin` is required and must exactly equal `AUTH_ORIGIN`;
- wrong or missing production Origin returns `403 ORIGIN_NOT_ALLOWED`;
- in development and test, missing Origin is allowed for Supertest and local API tooling;
- if development/test Origin is present and `AUTH_ORIGIN` is configured, mismatch returns `403 ORIGIN_NOT_ALLOWED`;
- `SameSite=Strict` remains mandatory;
- CSRF token is not required in B4 because admin/API are same-origin, refresh cookie is Strict, and Origin is checked;
- if architecture becomes cross-site later, CSRF model must be reviewed before production deploy.

## 12. Rate-limit contract

Use `express-rate-limit@8.6.0`.

Shared rules:

- `standardHeaders = "draft-8"`;
- `legacyHeaders = false`;
- rate-limit responses use the existing error envelope;
- response code is `429 RATE_LIMITED`;
- limiter errors include `requestId`;
- no raw email, password, token, cookie, IP, or user-agent is logged in limiter keys or responses;
- memory store is allowed only for one backend instance;
- memory counters reset on restart and this is documented;
- Redis or external store is a B9 decision;
- do not reuse one memory store across login and refresh limiter instances;
- `TRUST_PROXY_HOPS` is parsed as an integer and never as boolean `true`.

Login limiter:

- 5 unsuccessful attempts per 15 minutes;
- successful login does not spend quota;
- use `skipSuccessfulRequests: true`;
- key format:

```typescript
`${ipKeyGenerator(request.ip ?? "", 56)}:${sha256Hex(normalizedEmail)}`
```

- `ipKeyGenerator` is imported from `express-rate-limit`;
- IPv6 prefix length is `56`;
- normalized email is `trim().toLowerCase()`;
- plaintext email is not stored in the key;
- a lightweight login-key middleware parses only the email field before the limiter and stores `response.locals.authLoginEmailHash`.

Refresh limiter:

- 30 requests per 15 minutes per IP;
- separate limiter instance;
- separate memory store;
- key format uses `ipKeyGenerator(request.ip ?? "", 56)`;
- refresh limiter does not inspect token values.

## 13. API contract

### `POST /api/auth/login`

Request:

```json
{
  "email": "admin@example.com",
  "password": "string"
}
```

Validation:

- body must be an object;
- unknown fields are rejected;
- email is trimmed and lowercased;
- email must be a valid email string;
- password must be a string with length from `1` to `1024`.

Response `200`:

```json
{
  "data": {
    "accessToken": "jwt",
    "user": {
      "id": "uuid",
      "email": "admin@example.com",
      "role": "admin"
    }
  }
}
```

Headers on every successful and error response for this endpoint:

- `Cache-Control: no-store`;
- `Pragma: no-cache`.

Side effects:

- sets refresh cookie;
- creates refresh session;
- updates `lastLoginAt`;
- writes safe `auth.login.success` audit event.

Errors:

- `400 VALIDATION_ERROR`;
- `401 INVALID_CREDENTIALS`;
- `403 ORIGIN_NOT_ALLOWED`;
- `429 RATE_LIMITED`;
- `500 INTERNAL_ERROR`.

Inactive user during login returns `401 INVALID_CREDENTIALS` to avoid enumeration.

### `POST /api/auth/refresh`

Request:

- empty JSON body or no body;
- refresh cookie required.

Response `200`:

```json
{
  "data": {
    "accessToken": "jwt",
    "user": {
      "id": "uuid",
      "email": "editor@example.com",
      "role": "editor"
    }
  }
}
```

Headers on every successful and error response for this endpoint:

- `Cache-Control: no-store`;
- `Pragma: no-cache`.

Side effects:

- rotates refresh session;
- revokes old session;
- sets replacement refresh cookie;
- preserves `familyId`;
- preserves absolute `expiresAt`.

Errors:

- `401 REFRESH_REQUIRED`;
- `401 REFRESH_INVALID`;
- `401 REFRESH_EXPIRED`;
- `403 REFRESH_REUSE_DETECTED`;
- `403 USER_DISABLED`;
- `403 ORIGIN_NOT_ALLOWED`;
- `429 RATE_LIMITED`;
- `500 INTERNAL_ERROR`.

### `POST /api/auth/logout`

Request:

- empty JSON body or no body;
- refresh cookie optional;
- Authorization Bearer optional.

Response:

- `204 No Content`;
- no body.

Headers:

- `Cache-Control: no-store`.

Side effects:

- clears refresh cookie;
- revokes current family when identified.

Errors:

- `403 ORIGIN_NOT_ALLOWED`;
- `500 INTERNAL_ERROR`.

Logout is idempotent for missing, expired, unknown, or malformed tokens.

### `GET /api/auth/me`

Request:

- `Authorization: Bearer <accessToken>` required.

Response `200`:

```json
{
  "data": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

Headers on every successful and error response for this endpoint:

- `Cache-Control: no-store`.

Do not return:

- `passwordHash`;
- refresh sessions;
- `lastLoginAt`;
- `active`;
- `createdAt`;
- `updatedAt`;
- audit fields.

Errors:

- `401 UNAUTHORIZED`;
- `403 USER_DISABLED`;
- `500 INTERNAL_ERROR`.

## 14. Error and audit contract

Add error codes:

- `INVALID_CREDENTIALS`;
- `UNAUTHORIZED`;
- `USER_DISABLED`;
- `REFRESH_REQUIRED`;
- `REFRESH_INVALID`;
- `REFRESH_EXPIRED`;
- `REFRESH_REUSE_DETECTED`;
- `ORIGIN_NOT_ALLOWED`;
- `RATE_LIMITED`.

All errors use the existing envelope:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized.",
    "requestId": "req_..."
  }
}
```

Safe messages:

- `INVALID_CREDENTIALS`: `Invalid email or password.`;
- `UNAUTHORIZED`: `Unauthorized.`;
- `USER_DISABLED`: `User is disabled.`;
- `REFRESH_REQUIRED`: `Refresh token required.`;
- `REFRESH_INVALID`: `Refresh token invalid.`;
- `REFRESH_EXPIRED`: `Refresh token expired.`;
- `REFRESH_REUSE_DETECTED`: `Refresh token reuse detected.`;
- `ORIGIN_NOT_ALLOWED`: `Origin not allowed.`;
- `RATE_LIMITED`: `Too many requests.`;

Never return:

- Argon2 errors;
- `jose` errors;
- Prisma errors;
- SQL;
- stack traces;
- token claims;
- raw token;
- token hash;
- cookie value;
- password;
- password hash;
- database URL;
- secret names with values.

Allowed DB audit events:

- `auth.login.success`;
- `auth.logout`;
- `auth.refresh.reuse_detected`;
- `auth.user_disabled`.

DB audit rules:

- `entityType` is `auth`;
- `actorUserId` is set when a user is known;
- `requestId` is always set;
- `ipHash` and `userAgentHash` may be set through fingerprint HMAC;
- `beforeJson` and `afterJson` contain only safe booleans, reason codes, and session family metadata that does not identify raw token values;
- failed login attempts do not create unbounded DB audit rows.

Failed login warning log:

```typescript
logger.log({
  emailHash,
  environment: env.NODE_ENV,
  event: "auth.login.failed",
  level: "warn",
  requestId,
  service: env.SERVICE_NAME,
  time: now().toISOString()
});
```

This requires extending `AppLogEntry` to include safe auth security entries. Tests must assert that warning logs do not contain raw email, password, token, cookie, or database URL.

Fingerprint telemetry:

- `ipHash = HMAC-SHA256(AUTH_FINGERPRINT_SECRET_BASE64, normalized IP text)`;
- `userAgentHash = HMAC-SHA256(AUTH_FINGERPRINT_SECRET_BASE64, user-agent text)`;
- hashes are used only for safe audit and incident context;
- raw IP and raw User-Agent are not saved in PostgreSQL;
- hashes are not required for refresh success;
- hashes are not included in API responses.

## 15. File map and interfaces

Future B4 implementation may create:

- `backend/src/modules/auth/auth.types.ts`: shared auth types, roles, principal, token claims, result shapes.
- `backend/src/modules/auth/auth.schemas.ts`: Zod request schemas and normalized input parsers.
- `backend/src/modules/auth/auth.repository.ts`: Prisma reads/writes and transaction helpers over `User`, `RefreshSession`, and `AuditLog`.
- `backend/src/modules/auth/auth-credentials.service.ts`: normalized email lookup, generic credential verification, dummy Argon2 path for missing/inactive users, and one invalid-credentials outcome.
- `backend/src/modules/auth/auth.service.ts`: login, refresh, logout, me use cases and safe error mapping.
- `backend/src/modules/auth/auth.controller.ts`: Express request/response adapters.
- `backend/src/modules/auth/auth.routes.ts`: route factory and middleware ordering.
- `backend/src/modules/auth/password.service.ts`: Argon2id hasher, verifier, dummy hash path, and production/test hasher interfaces.
- `backend/src/modules/auth/access-token.service.ts`: `jose` HS256 sign/verify.
- `backend/src/modules/auth/refresh-token.service.ts`: raw token generation and SHA-256 token hashing.
- `backend/src/modules/auth/refresh-session.service.ts`: rotation, family revocation, and reuse-detection orchestration.
- `backend/src/modules/auth/auth-cookie.ts`: cookie serialization, parsing, clear-cookie helpers.
- `backend/src/modules/auth/auth-cache-control.ts`: auth no-store middleware/helper for token-bearing and principal responses.
- `backend/src/modules/auth/auth-origin.ts`: Origin policy helper and middleware.
- `backend/src/modules/auth/auth-rate-limit.ts`: login and refresh limiter factories.
- `backend/src/modules/auth/auth.middleware.ts`: Bearer parsing, access verification, active-user lookup, and principal attachment.
- `backend/src/modules/auth/auth-audit.ts`: safe audit row and warning-log helper.
- `backend/src/config/auth-env.ts`: auth env parsing, base64 secret decoding, TTL and trust proxy validation.
- `backend/tests/auth-env.test.ts`: auth env parser tests.
- `backend/tests/auth.password.test.ts`: Argon2 and dummy path tests.
- `backend/tests/auth.credentials.test.ts`: credential verifier tests with fake repository and fake password hasher.
- `backend/tests/auth.access-token.test.ts`: JWT sign/verify tests.
- `backend/tests/auth.refresh-token.test.ts`: raw refresh token and hash tests.
- `backend/tests/auth.cookie.test.ts`: cookie attributes and parsing tests.
- `backend/tests/auth.cache-control.test.ts`: no-store and no-cache auth response header tests.
- `backend/tests/auth.origin.test.ts`: production/development/test Origin policy tests.
- `backend/tests/auth.rate-limit.test.ts`: key-generation and limiter response tests.
- `backend/tests/auth.audit.test.ts`: safe audit and log tests.
- `backend/tests/auth.service.test.ts`: service unit tests with fake repository.
- `backend/tests/auth.middleware.test.ts`: Bearer and principal middleware tests.
- `backend/tests/integration/auth-api.test.ts`: PostgreSQL-backed Supertest auth API tests.

Future B4 implementation may modify:

- `backend/package.json`: add exact B4 dependencies and keep existing scripts.
- `backend/package-lock.json`: npm-generated lockfile update only.
- `backend/.env.example`: add safe auth placeholders.
- `backend/src/app.ts`: accept and mount auth routes or auth service; configure numeric trust proxy if provided.
- `backend/src/server.ts`: parse `AuthEnv`, construct auth dependencies once, wire auth routes, keep Prisma disconnect.
- `backend/src/lib/errors.ts`: add B4 auth error codes and safe mappings.
- `backend/src/lib/logger.ts`: add safe auth/security log entry union.
- `backend/tests/setup.ts`: preserve and restore auth env variables.
- `backend/tests/errors.test.ts`: cover B4 error envelope codes.
- `backend/tests/health.test.ts`: prove health remains public and DB-free when auth is present.
- `backend/tests/server.test.ts`: cover auth dependency construction and shutdown preservation.
- `backend/tests/repository-boundary.test.ts`: only if final B4 boundary needs a new forbidden-path assertion.

Future B4 must not modify:

- `backend/prisma/schema.prisma`;
- `backend/prisma/migrations/**`;
- `backend/prisma/seed.ts`;
- `backend/prisma/seed-web00-data.ts`;
- `backend/prisma/seed-data/web00-catalog.json`;
- `backend/src/modules/public-catalog/**` except import-safe app/server integration tests if unavoidable;
- `docs/**` except approved B4 plan or closeout documents;
- `assets/**`;
- `.github/**`;
- frontend root files.

Core interfaces:

```typescript
export type AuthRole = "admin" | "editor";

export interface AuthUserRecord {
  active: boolean;
  email: string;
  id: string;
  passwordHash: string;
  role: AuthRole;
}

export interface SafeAuthUser {
  email: string;
  id: string;
  role: AuthRole;
}

export interface AuthenticatedPrincipal extends SafeAuthUser {
  sessionId: string;
  tokenId: string;
}

export interface AuthRequest extends Request {
  auth?: AuthenticatedPrincipal;
}
```

Repository interface:

```typescript
export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findActiveUserById(userId: string): Promise<SafeAuthUser | null>;
  findRefreshSessionByTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null>;
  commitLoginSuccess(input: CommitLoginSuccessInput): Promise<RefreshSessionRecord>;
  rotateRefreshSession(input: RotateRefreshSessionInput): Promise<RotateRefreshSessionResult>;
  revokeRefreshFamilyWithAudit(input: RevokeRefreshFamilyWithAuditInput): Promise<void>;
}
```

Repository rules:

- `commitLoginSuccess` performs exactly one short Prisma transaction containing `RefreshSession` create, `User.lastLoginAt` update, and `auth.login.success` audit insert.
- `createLoginSession` and `updateLastLoginAt` are not public repository methods because they allow AuthService to split required login writes across separate transactions.
- `rotateRefreshSession` performs the refresh successor create and old-session conditional revoke atomically.
- `revokeRefreshFamilyWithAudit` performs active-family session revocation and mandatory audit insertion in one Prisma transaction for reuse detection, disabled-user revocation, and logout when actor/session is known.
- failed-login warning stays logger-only and never creates a DB audit row.

Password interface:

```typescript
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  verifyDummy(password: string): Promise<void>;
}
```

Credential verifier interface:

```typescript
export interface CredentialVerifier {
  verify(input: VerifyCredentialsInput): Promise<VerifiedCredentials>;
}
```

Credential verifier rules:

- looks up user by normalized email;
- calls real Argon2 verification for active users;
- calls dummy Argon2 verification for missing and inactive users;
- returns the same `INVALID_CREDENTIALS` outcome for missing, wrong-password, and inactive login;
- owns no JWT, refresh-session, cookie, Express, or HTTP response responsibilities.

Access token interface:

```typescript
export interface AccessTokenService {
  sign(input: SignAccessTokenInput): Promise<string>;
  verify(token: string): Promise<VerifiedAccessToken>;
}
```

Refresh token interface:

```typescript
export interface RefreshTokenService {
  generateRawToken(): string;
  hashRawToken(rawToken: string): string;
}
```

Auth service interface:

```typescript
export interface AuthService {
  login(input: LoginInput): Promise<LoginResult>;
  refresh(input: RefreshInput): Promise<RefreshResult>;
  logout(input: LogoutInput): Promise<void>;
  getMe(principal: AuthenticatedPrincipal): Promise<MeResult>;
  authenticateAccessToken(token: string): Promise<AuthenticatedPrincipal>;
}
```

Dependency injection:

```typescript
export interface AuthServiceDependencies {
  accessTokens: AccessTokenService;
  audit: AuthAuditService;
  clock: () => Date;
  credentials: CredentialVerifier;
  logger: AppLogger;
  randomUUID: () => string;
  refreshTokens: RefreshTokenService;
  repository: AuthRepository;
}
```

`CreateAppOptions` future shape:

```typescript
export interface CreateAppOptions {
  authRoutes?: Router;
  env: AppEnv;
  logger?: AppLogger;
  publicCatalogService?: PublicCatalogService;
  registerTestRoutes?: (app: Express) => void;
  now?: () => Date;
  trustProxyHops?: number;
}
```

Rules:

- `env` remains required;
- `app.ts` never reads `process.env`;
- `authRoutes` is created outside `app.ts`;
- tests may inject fake auth routes or services;
- production server passes auth routes;
- error handler remains last.

## 16. Test strategy

Unit tests:

- email normalization;
- login request strict validation;
- password maximum size;
- Argon2 production option constants;
- Argon2 hash and verify;
- dummy-hash path for missing and inactive users;
- access JWT sign and verify;
- wrong algorithm returns `UNAUTHORIZED`;
- wrong issuer returns `UNAUTHORIZED`;
- wrong audience returns `UNAUTHORIZED`;
- expired token returns `UNAUTHORIZED`;
- refresh token randomness;
- refresh token base64url shape;
- token hash SHA-256 lowercase hex;
- cookie attributes for development/test;
- cookie attributes for production;
- cookie clearing attributes;
- auth no-store middleware;
- login success and error `Cache-Control: no-store` plus `Pragma: no-cache`;
- refresh success and error `Cache-Control: no-store` plus `Pragma: no-cache`;
- me success/error and logout `Cache-Control: no-store`;
- production `__Secure-` name requires `Secure`;
- cookie parsing through `cookie`, not manual splitting;
- Origin policy in production;
- Origin policy in development/test;
- login rate-limit key contains IPv6-safe IP key plus email hash;
- login rate-limit key never contains raw email;
- refresh limiter uses a separate instance;
- fingerprint HMAC;
- safe error mapping for `argon2`, `jose`, Prisma, and unknown errors;
- safe auth warning log without raw email/password/token/cookie.

Integration/API tests against `TEST_DATABASE_URL`:

- login success;
- wrong password;
- unknown email;
- inactive user;
- generic login error for unknown/wrong/inactive;
- lastLoginAt update only on success;
- raw refresh token not stored;
- `tokenHash` stored as SHA-256;
- access claims include `sub`, `role`, `sessionId`, `jti`, `iss`, `aud`, `iat`, and `exp`;
- access token is returned in JSON only;
- refresh cookie attributes;
- refresh success;
- old refresh session revoked;
- successor preserves `familyId`;
- absolute expiry is not extended;
- concurrent refresh allows exactly one success;
- reuse revokes family;
- expired refresh returns `REFRESH_EXPIRED`;
- unknown refresh returns `REFRESH_INVALID`;
- missing refresh returns `REFRESH_REQUIRED`;
- logout current family;
- logout idempotent;
- me success;
- me invalid token;
- me expired token;
- me disabled user;
- login limiter returns `429 RATE_LIMITED`;
- refresh limiter returns `429 RATE_LIMITED`;
- wrong production Origin returns `ORIGIN_NOT_ALLOWED`;
- responses and logs contain no password, token, token hash, cookie, database URL, or raw Prisma error;
- existing 109 B1-B3 tests remain PASS.

Test safety:

- auth integration tests call `assertTestDatabaseUrl(parseDatabaseEnv(process.env))` before creating a Prisma client;
- auth integration tests never use `DATABASE_URL`;
- fixtures use a unique email prefix such as `b4-auth-`;
- cleanup deletes only `b4-auth-` users and their cascade refresh sessions;
- audit cleanup targets only B4 fixture request IDs or safe `auth.*` rows created by those fixture users;
- no test deletes all users, sessions, categories, sites, or audit logs;
- no test prints environment values or database URLs;
- test password hashes may use an injected low-cost hasher only through `PasswordHasher`, while production options are tested separately;
- `clock` and `randomUUID` are injectable;
- no flaky sleeps;
- `fileParallelism=false` remains enabled.

## 17. Ordered implementation tasks

### Task 1: Dependency And Environment Contract

**Files:**

- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `backend/.env.example`
- Create: `backend/src/config/auth-env.ts`
- Modify: `backend/tests/setup.ts`
- Create: `backend/tests/auth-env.test.ts`
- Modify: `backend/tests/prisma-toolchain.test.ts` only if package-contract assertions live there

**Interfaces consumed:**

- Existing `AppEnv` from `backend/src/config/env.ts`
- Existing portable npm workflow

**Interfaces produced:**

```typescript
export interface AuthEnv {
  ACCESS_TOKEN_TTL_SECONDS: number;
  AUTH_FINGERPRINT_SECRET_BASE64: string;
  AUTH_ORIGIN?: string;
  JWT_ACCESS_SECRET_BASE64: string;
  JWT_AUDIENCE: "web00-admin";
  JWT_ISSUER: "web00-backend";
  REFRESH_TOKEN_TTL_SECONDS: number;
  TRUST_PROXY_HOPS: number;
}

export function parseAuthEnv(input: NodeJS.ProcessEnv, nodeEnv: NodeEnvironment): AuthEnv;
export function decodeAuthSecrets(env: AuthEnv): AuthSecrets;
```

**TDD RED/GREEN:**

- [ ] Write failing tests that require the four exact auth dependencies in `dependencies` with exact versions.
- [ ] Write failing tests that reject `jsonwebtoken`, `bcrypt`, `cookie-parser`, `express-session`, overrides, and unexpected auth packages.
- [ ] Write failing tests for every auth env variable, including minimum 32-byte base64 decoding, distinct secrets, exact issuer/audience, TTL values, production `AUTH_ORIGIN`, and integer `TRUST_PROXY_HOPS`.
- [ ] Write failing tests that thrown auth env errors do not include raw secret values.
- [ ] Run focused tests:

```powershell
Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm exec vitest run tests/auth-env.test.ts tests/prisma-toolchain.test.ts
```

- [ ] Install exact dependencies with portable npm.
- [ ] Verify `argon2` loads through portable Node.
- [ ] Add auth placeholders to `.env.example`.
- [ ] Implement `auth-env.ts`.
- [ ] Extend `tests/setup.ts` env restoration.
- [ ] Re-run focused tests and `& $PortableNpm run typecheck`.

**PASS Criteria:**

- exact dependency contract is present;
- package-lock is npm-generated;
- `argon2` loads on portable Node;
- auth env parser rejects unsafe values and never leaks secrets;
- `tests/setup.ts` restores auth env variables.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/package.json backend/package-lock.json backend/.env.example backend/tests/setup.ts backend/tests/prisma-toolchain.test.ts
Remove-Item -Force backend/src/config/auth-env.ts backend/tests/auth-env.test.ts
```

**Out-Of-Scope:** auth routes, password hashing, JWTs, refresh sessions, database writes.

### Task 2: Password Hashing And Generic Credential Verification

**Files:**

- Create: `backend/src/modules/auth/auth.types.ts`
- Create: `backend/src/modules/auth/auth.schemas.ts`
- Create: `backend/src/modules/auth/password.service.ts`
- Create: `backend/src/modules/auth/auth-credentials.service.ts`
- Create: `backend/tests/auth.password.test.ts`
- Create: `backend/tests/auth.credentials.test.ts`

**Interfaces consumed:**

- `AuthEnv` from Task 1

**Interfaces produced:**

```typescript
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  verifyDummy(password: string): Promise<void>;
}

export function createArgon2PasswordHasher(): PasswordHasher;
export function parseLoginBody(input: unknown): LoginBody;
export function normalizeEmail(email: string): string;
export interface CredentialVerifier {
  verify(input: VerifyCredentialsInput): Promise<VerifiedCredentials>;
}
```

**TDD RED/GREEN:**

- [ ] Write failing schema tests for normalized email, unknown fields, password string requirement, and password max length `1024`.
- [ ] Write failing password tests for Argon2id options.
- [ ] Write failing tests proving correct password verifies and wrong password fails.
- [ ] Write failing credential-service tests proving unknown email, wrong password, and inactive user all return `INVALID_CREDENTIALS`.
- [ ] Write failing credential-service tests proving dummy verification is called for missing and inactive users.
- [ ] Write failing credential-service tests proving JWT, refresh-session, cookie, and HTTP concerns are absent from this file.
- [ ] Run:

```powershell
& $PortableNpm exec vitest run tests/auth.password.test.ts tests/auth.credentials.test.ts
```

- [ ] Implement login schema parser and password service.
- [ ] Implement `auth-credentials.service.ts` with fake repository and fake test hasher.
- [ ] Re-run focused tests.

**PASS Criteria:**

- production Argon2id constants match B4 contract;
- login enumeration is closed;
- plaintext password is not logged or returned;
- credential verification has no JWT, refresh-session, cookie, or HTTP responsibilities;
- `lastLoginAt` is not updated by the credential verifier.

**Rollback:**

```powershell
git restore --staged -- backend
Remove-Item -Recurse -Force backend/src/modules/auth
Remove-Item -Force backend/tests/auth.password.test.ts backend/tests/auth.credentials.test.ts
```

**Out-Of-Scope:** JWT signing, refresh cookies, rate limiting, DB integration.

### Task 3: Access JWT Service And Auth Middleware

**Files:**

- Create: `backend/src/modules/auth/access-token.service.ts`
- Create: `backend/src/modules/auth/auth.middleware.ts`
- Modify: `backend/src/modules/auth/auth.types.ts`
- Create: `backend/tests/auth.access-token.test.ts`
- Create: `backend/tests/auth.middleware.test.ts`

**Interfaces consumed:**

- `AuthEnv` and decoded access key from Task 1
- `AuthRepository.findActiveUserById`
- `AccessTokenService` works independently from `AuthService`, which is created later in Task 6

**Interfaces produced:**

```typescript
export interface AccessTokenService {
  sign(input: SignAccessTokenInput): Promise<string>;
  verify(token: string): Promise<VerifiedAccessToken>;
}

export function createAccessTokenService(options: CreateAccessTokenServiceOptions): AccessTokenService;
export function createAuthMiddleware(options: AuthMiddlewareOptions): RequestHandler;
```

**TDD RED/GREEN:**

- [ ] Write failing tests for HS256 sign and verify with expected claims.
- [ ] Write failing tests for wrong algorithm, issuer, audience, expiration, malformed token, and missing bearer header.
- [ ] Write failing middleware tests proving active user is loaded and attached as `request.auth`.
- [ ] Write failing middleware tests proving missing or disabled user returns `USER_DISABLED`.
- [ ] Run:

```powershell
& $PortableNpm exec vitest run tests/auth.access-token.test.ts tests/auth.middleware.test.ts
```

- [ ] Implement `jose` signing and verification.
- [ ] Implement Bearer parser and middleware.
- [ ] Re-run focused tests.

**PASS Criteria:**

- only HS256 is accepted;
- access token is not put in a cookie;
- invalid access token maps to safe `UNAUTHORIZED`;
- disabled user maps to `USER_DISABLED`;
- no password hash or sessions enter principal.

**Rollback:**

```powershell
git restore --staged -- backend
Remove-Item -Force backend/src/modules/auth/access-token.service.ts backend/src/modules/auth/auth.middleware.ts backend/tests/auth.access-token.test.ts backend/tests/auth.middleware.test.ts
git restore -- backend/src/modules/auth/auth.types.ts
```

**Out-Of-Scope:** refresh rotation, cookies, Origin, rate limiting.

### Task 4: Refresh Token And Cookie Primitives

**Files:**

- Create: `backend/src/modules/auth/refresh-token.service.ts`
- Create: `backend/src/modules/auth/auth-cookie.ts`
- Modify: `backend/src/modules/auth/auth.types.ts`
- Create: `backend/tests/auth.refresh-token.test.ts`
- Create: `backend/tests/auth.cookie.test.ts`

**Interfaces consumed:**

- `AuthEnv` from Task 1

**Interfaces produced:**

```typescript
export interface RefreshTokenService {
  generateRawToken(): string;
  hashRawToken(rawToken: string): string;
}

export interface AuthCookieService {
  clearRefreshCookie(input: ClearRefreshCookieInput): string;
  parseRefreshCookie(header: string | undefined): string | null;
  serializeRefreshCookie(input: SerializeRefreshCookieInput): string;
}
```

**TDD RED/GREEN:**

- [ ] Write failing tests that raw refresh token is base64url and generated from 48 random bytes.
- [ ] Write failing tests that token hash is SHA-256 lowercase hex.
- [ ] Write failing tests for development/test cookie name `web00_refresh`.
- [ ] Write failing tests for production cookie name `__Secure-web00_refresh`.
- [ ] Write failing tests for HttpOnly, Secure, SameSite Strict, Path `/api/auth`, Max-Age, Expires, and no Domain.
- [ ] Write failing tests that clear cookie mirrors name/path/samesite/secure.
- [ ] Write failing static test that `auth-cookie.ts` imports `cookie` and does not manually split semicolons.
- [ ] Run:

```powershell
& $PortableNpm exec vitest run tests/auth.refresh-token.test.ts tests/auth.cookie.test.ts
```

- [ ] Implement refresh token and cookie helpers.
- [ ] Re-run focused tests.

**PASS Criteria:**

- raw refresh token is never stored by helper APIs;
- cookie attributes match B4 contract;
- production secure-cookie invariant is enforced.

**Rollback:**

```powershell
git restore --staged -- backend
Remove-Item -Force backend/src/modules/auth/refresh-token.service.ts backend/src/modules/auth/auth-cookie.ts backend/tests/auth.refresh-token.test.ts backend/tests/auth.cookie.test.ts
git restore -- backend/src/modules/auth/auth.types.ts
```

**Out-Of-Scope:** repository transactions, controllers, rate limiting.

### Task 5: Refresh-Session Rotation And Reuse Transaction

**Files:**

- Create: `backend/src/modules/auth/auth.repository.ts`
- Create: `backend/src/modules/auth/refresh-session.service.ts`
- Create: `backend/src/modules/auth/auth-audit.ts`
- Modify: `backend/src/modules/auth/auth.types.ts`
- Create: `backend/tests/auth.audit.test.ts`
- Create: `backend/tests/integration/auth-api.test.ts` with focused transaction tests first

**Interfaces consumed:**

- generated Prisma client from B2
- `RefreshTokenService` from Task 4
- existing `User`, `RefreshSession`, and `AuditLog` models

**Interfaces produced:**

```typescript
export interface RefreshSessionService {
  commitLoginSuccess(input: CommitLoginSuccessInput): Promise<RefreshSessionRecord>;
  rotate(input: RotateRefreshInput): Promise<RotateRefreshResult>;
  revokeRefreshFamilyWithAudit(input: RevokeRefreshFamilyWithAuditInput): Promise<void>;
}
```

**TDD RED/GREEN:**

- [ ] Write failing repository tests proving `commitLoginSuccess` creates refresh session, updates `lastLoginAt`, and inserts `auth.login.success` audit in one transaction.
- [ ] Write failing repository tests proving audit insert failure rolls back refresh session and `lastLoginAt`.
- [ ] Write failing repository tests proving session creation failure does not update `lastLoginAt`.
- [ ] Write failing repository tests proving user update failure does not keep a refresh session.
- [ ] Write failing integration tests for refresh success, old session revoked, replacement link set, same `familyId`, and unchanged absolute expiry.
- [ ] Write failing integration test for concurrent refresh where exactly one request succeeds.
- [ ] Write failing integration test for reuse detection revoking all active family sessions.
- [ ] Write failing audit tests proving `revokeRefreshFamilyWithAudit` writes safe `auth.refresh.reuse_detected`, `auth.user_disabled`, and known-actor `auth.logout` events in the same transaction as family revocation.
- [ ] Run:

```powershell
& $PortableNpm exec vitest run tests/auth.audit.test.ts tests/integration/auth-api.test.ts
```

- [ ] Implement repository methods and transaction logic.
- [ ] Implement refresh-session service.
- [ ] Re-run focused tests.

**PASS Criteria:**

- no raw refresh token stored;
- `tokenHash` is unique and hashed;
- login success writes are atomic through `commitLoginSuccess`;
- rotation conditional update allows one success;
- losing concurrent transaction rolls back successor;
- reuse and family revocations write required safe audit events atomically;
- no schema or migration change is needed.

**Rollback:**

```powershell
git restore --staged -- backend
Remove-Item -Force backend/src/modules/auth/auth.repository.ts backend/src/modules/auth/refresh-session.service.ts backend/src/modules/auth/auth-audit.ts backend/tests/auth.audit.test.ts backend/tests/integration/auth-api.test.ts
git restore -- backend/src/modules/auth/auth.types.ts
```

**Out-Of-Scope:** HTTP controllers, Origin, rate limiting.

### Task 6: Login, Refresh, Logout, Me Service And Controllers

**Files:**

- Create: `backend/src/modules/auth/auth.service.ts`
- Create: `backend/src/modules/auth/auth.controller.ts`
- Create: `backend/src/modules/auth/auth.routes.ts`
- Create: `backend/src/modules/auth/auth-cache-control.ts`
- Modify: `backend/src/modules/auth/auth.schemas.ts`
- Modify: `backend/src/modules/auth/auth.types.ts`
- Modify: `backend/src/lib/errors.ts`
- Modify: `backend/tests/errors.test.ts`
- Modify: `backend/tests/auth.service.test.ts`
- Create: `backend/tests/auth.cache-control.test.ts`
- Modify: `backend/tests/integration/auth-api.test.ts`

**Interfaces consumed:**

- `CredentialVerifier` from Task 2
- access token, refresh token, cookie, repository, refresh-session, and audit services from Tasks 3-5
- `PasswordHasher` only through `CredentialVerifier`, not directly in `AuthService`

**Interfaces produced:**

```typescript
export function createAuthController(options: { service: AuthService; cookies: AuthCookieService }): AuthController;
export function setAuthNoStoreHeaders(response: Response, options?: { pragma?: boolean }): void;
export function authNoStore(options?: { pragma?: boolean }): RequestHandler;
export function createAuthRouter(options: AuthRouterOptions): Router;
```

**TDD RED/GREEN:**

- [ ] Write failing service tests proving `AuthService` receives and calls `CredentialVerifier`.
- [ ] Write failing service tests for login success, wrong password, unknown email, inactive user, lastLoginAt update, and safe response user.
- [ ] Write failing service tests proving JWT signing failure occurs before `commitLoginSuccess` and creates no refresh session.
- [ ] Write failing integration tests proving audit insert failure rolls back refresh session and `lastLoginAt`.
- [ ] Write failing integration tests proving session creation failure does not update `lastLoginAt`.
- [ ] Write failing integration tests proving user update failure does not keep a refresh session.
- [ ] Write failing integration tests proving successful login performs refresh session create, `lastLoginAt` update, and login audit atomically.
- [ ] Write failing service tests for refresh success, missing token, unknown token, expired token, reuse, and disabled user.
- [ ] Write failing service tests for logout idempotency and family revoke.
- [ ] Write failing service tests for me success and disabled user.
- [ ] Add error-code envelope tests.
- [ ] Write failing cache-control tests for login success/error no-store/no-cache, refresh success/error no-store/no-cache, me success/error no-store, logout no-store, and no token/cookie/secret values in headers.
- [ ] Write failing Supertest tests for the four auth endpoints with fake services.
- [ ] Run:

```powershell
& $PortableNpm exec vitest run tests/auth.service.test.ts tests/auth.cache-control.test.ts tests/errors.test.ts tests/integration/auth-api.test.ts
```

- [ ] Implement error codes.
- [ ] Implement `auth-cache-control.ts`.
- [ ] Implement service methods.
- [ ] Implement controllers and route factory.
- [ ] Mount auth no-store middleware before controllers while preserving Express error propagation.
- [ ] Re-run focused tests.

**PASS Criteria:**

- all four endpoints satisfy B4 API contract;
- access token appears only in JSON responses;
- login and refresh success/error responses set `Cache-Control: no-store` and `Pragma: no-cache`;
- me success/error and logout responses set `Cache-Control: no-store`;
- refresh token appears only in cookie header;
- logout is idempotent;
- safe error envelope is preserved.

**Rollback:**

```powershell
git restore --staged -- backend
Remove-Item -Force backend/src/modules/auth/auth.service.ts backend/src/modules/auth/auth.controller.ts backend/src/modules/auth/auth.routes.ts backend/src/modules/auth/auth-cache-control.ts backend/tests/auth.cache-control.test.ts
git restore -- backend/src/modules/auth/auth.schemas.ts backend/src/modules/auth/auth.types.ts backend/src/lib/errors.ts backend/tests/errors.test.ts backend/tests/auth.service.test.ts backend/tests/integration/auth-api.test.ts
```

**Out-Of-Scope:** app/server wiring, production Origin guard, rate limiter.

### Task 7: Origin Guard And Auth Rate Limiting

**Files:**

- Create: `backend/src/modules/auth/auth-origin.ts`
- Create: `backend/src/modules/auth/auth-rate-limit.ts`
- Modify: `backend/src/modules/auth/auth.routes.ts`
- Create: `backend/tests/auth.origin.test.ts`
- Create: `backend/tests/auth.rate-limit.test.ts`
- Modify: `backend/tests/integration/auth-api.test.ts`

**Interfaces consumed:**

- `AuthEnv.AUTH_ORIGIN`
- existing error envelope
- login schema normalized email helper

**Interfaces produced:**

```typescript
export function createOriginGuard(options: OriginGuardOptions): RequestHandler;
export function createLoginRateLimiter(options: LoginRateLimiterOptions): RequestHandler;
export function createRefreshRateLimiter(options: RefreshRateLimiterOptions): RequestHandler;
export function createLoginRateLimitKey(input: LoginRateLimitKeyInput): string;
```

**TDD RED/GREEN:**

- [ ] Write failing Origin tests for production missing Origin, wrong Origin, exact match, and dev/test policy.
- [ ] Write failing key tests proving login key uses `ipKeyGenerator(request.ip, 56)` plus SHA-256 email hash.
- [ ] Write failing tests proving login key does not include raw email.
- [ ] Write failing tests proving refresh limiter uses a separate instance/store.
- [ ] Write failing integration tests for login `429 RATE_LIMITED`, refresh `429 RATE_LIMITED`, and wrong production Origin.
- [ ] Run:

```powershell
& $PortableNpm exec vitest run tests/auth.origin.test.ts tests/auth.rate-limit.test.ts tests/integration/auth-api.test.ts
```

- [ ] Implement Origin guard.
- [ ] Implement limiter factories.
- [ ] Wire middleware order in auth routes: body parser already global, login-key middleware, Origin guard, limiter, controller.
- [ ] Re-run focused tests.

**PASS Criteria:**

- production Origin is enforced for browser auth POST endpoints;
- login limiter counts unsuccessful attempts only;
- limiter response is `RATE_LIMITED`;
- IPv6 key handling uses prefix length `56`;
- no raw email in keys.

**Rollback:**

```powershell
git restore --staged -- backend
Remove-Item -Force backend/src/modules/auth/auth-origin.ts backend/src/modules/auth/auth-rate-limit.ts backend/tests/auth.origin.test.ts backend/tests/auth.rate-limit.test.ts
git restore -- backend/src/modules/auth/auth.routes.ts backend/tests/integration/auth-api.test.ts
```

**Out-Of-Scope:** Redis, CORS, frontend storage.

### Task 8: App And Server Integration With Auth Audit

**Files:**

- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/lib/logger.ts`
- Modify: `backend/tests/health.test.ts`
- Modify: `backend/tests/server.test.ts`
- Modify: `backend/tests/repository-boundary.test.ts` only if a boundary assertion needs the B4 file set
- Modify: `backend/tests/integration/auth-api.test.ts`

**Interfaces consumed:**

- `createAuthRouter`
- `parseAuthEnv`
- auth dependency factories
- existing public catalog wiring

**Interfaces produced:**

- production auth routes mounted under `/api/auth`;
- safe auth security log entry type;
- numeric trust proxy configuration.

**TDD RED/GREEN:**

- [ ] Write failing health test proving health remains public and does not call auth dependencies.
- [ ] Write failing app test proving injected auth routes mount before final 404/error handler.
- [ ] Write failing app/server test proving `app.ts` does not read `process.env`.
- [ ] Write failing server test proving `startServer` receives `AuthEnv`, creates auth service once, creates Prisma once, and still disconnects Prisma once.
- [ ] Write failing test proving `trustProxyHops` config rejects boolean `true` and applies numeric hops.
- [ ] Run:

```powershell
& $PortableNpm exec vitest run tests/health.test.ts tests/server.test.ts tests/repository-boundary.test.ts tests/integration/auth-api.test.ts
```

- [ ] Modify `CreateAppOptions`.
- [ ] Mount auth routes before test routes, not-found, and error handler.
- [ ] Extend logger entry union for safe auth warning logs.
- [ ] Modify `server.ts` to create auth dependencies once.
- [ ] Re-run focused tests.

**PASS Criteria:**

- `app.ts` remains environment-free;
- health remains DB-free and auth-free;
- public catalog continues to work;
- Prisma client is still one production instance;
- shutdown still calls `prisma.$disconnect()`;
- auth routes are before final 404/error middleware;
- production test routes remain excluded.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/src/app.ts backend/src/server.ts backend/src/lib/logger.ts backend/tests/health.test.ts backend/tests/server.test.ts backend/tests/repository-boundary.test.ts backend/tests/integration/auth-api.test.ts
```

**Out-Of-Scope:** admin routes, frontend, deployment.

### Task 9: Unit And PostgreSQL API Integration Tests

**Files:**

- Modify: all B4 unit test files
- Modify: `backend/tests/integration/auth-api.test.ts`
- Modify: `backend/tests/integration/test-database.ts` only if shared fixture helpers are needed
- Modify: B1-B3 test files only for narrow DI-safe updates already justified by Tasks 6-8

**Interfaces consumed:**

- all B4 services and route factories

**Interfaces produced:**

- stable B4 auth test suite preserving B1-B3 tests.

**TDD RED/GREEN:**

- [ ] Run every B4 unit test file individually.
- [ ] Run auth API integration tests against `TEST_DATABASE_URL`.
- [ ] Run existing B2 database tests:

```powershell
& $PortableNpm exec vitest run tests/integration/prisma-migration.test.ts tests/seed.test.ts
```

- [ ] Run existing B3 public catalog integration tests:

```powershell
& $PortableNpm exec vitest run tests/integration/public-catalog-api.test.ts
```

- [ ] Run full suite:

```powershell
& $PortableNpm run test:run
```

Expected:

- all B4 tests pass;
- all existing 109 B1-B3 tests pass;
- full suite contains at least 109 tests plus B4 tests.

**PASS Criteria:**

- auth integration uses `TEST_DATABASE_URL`;
- no integration test uses `DATABASE_URL`;
- fixtures are isolated by prefix;
- no test prints secrets or database URLs;
- no global state leaks between tests;
- no flaky sleeps.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend/tests
```

Use rollback only before a B4 implementation commit and only for B4-owned changes.

**Out-Of-Scope:** committing, push, PR, deploy.

### Task 10: Full B4 Checkpoint

**Files:**

- No new files beyond Tasks 1-9.

**Interfaces consumed:**

- completed B4 implementation.

**TDD RED/GREEN:**

- [ ] Run the complete final checkpoint from section 18.
- [ ] Verify `git diff --check` passes.
- [ ] Verify `git status --short` shows only approved backend B4 files.
- [ ] Verify no schema/migration/seed/snapshot changes.
- [ ] Verify `.env`, generated Prisma Client, `dist`, `node_modules`, `coverage`, and database dumps are not staged.
- [ ] Verify `package.json` and `package-lock.json` changed only for exact B4 dependencies.
- [ ] Stop before commit unless the owner separately approves a B4 implementation commit.

**PASS Criteria:**

- final checkpoint passes;
- high/critical vulnerabilities are absent;
- B1-B3 tests remain PASS;
- B4 tests pass;
- implementation has not been pushed, deployed, merged, or exposed through a PR unless separately approved.

**Rollback:**

```powershell
git restore --staged -- backend
git restore -- backend
```

This rollback is only for uncommitted local B4 implementation work. It must not be used to revert owner changes outside B4 scope.

**Out-Of-Scope:** push/PR/deploy without separate owner approval.

## 18. Final verification checkpoint

Future B4 completion requires:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNode = Join-Path $PortableRoot "node.exe"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$OriginalPath = $env:PATH
$env:PATH = "$PortableRoot;$OriginalPath"

Set-Location D:\WEB00_BACKEND\backend
& $PortableNpm ci
& $PortableNode --version
& $PortableNpm --version
& $PortableNode -e "import('argon2').then((argon2) => console.log(typeof argon2.hash, typeof argon2.verify))"
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
git diff --name-only -- docs
git diff --name-only -- assets
git diff --name-only -- .github
git diff -- backend/prisma/schema.prisma
git diff -- backend/prisma/migrations
git diff -- backend/prisma/seed-data/web00-catalog.json
git diff -- backend/package.json backend/package-lock.json
git diff --cached --name-only
```

Expected:

- Node is `v22.23.1`;
- npm is `10.9.8`;
- `argon2` loads and exposes hash/verify functions;
- Prisma schema validates;
- Prisma Client generation succeeds locally and remains ignored;
- migration status clean;
- seed verify reports `categories=7 sites=15`;
- typecheck passes;
- full test suite passes with all 109 B1-B3 tests plus B4 tests;
- build passes;
- `npm run check` passes;
- high-threshold audits exit `0`;
- existing 4 moderate Prisma tooling advisories remain accepted;
- any new high/critical vulnerability blocks;
- `git diff --check` passes;
- changes are only approved backend B4 files and the approved B4 plan if still uncommitted;
- schema, migrations, migration lock, seed scripts, and snapshot are unchanged;
- `.env`, generated Prisma Client, `dist`, `node_modules`, `coverage`, database dumps, frontend files, assets, docs outside approved B4 documents, and workflows are not staged;
- commit, push, PR, merge, and deploy are absent unless separately approved.

## 19. Acceptance criteria

B4 is accepted only when:

- branch is `feat/web00-backend-b4`;
- implementation starts from `7fffc90c23b7c573eb4179a2370f381c84db10f3`;
- only approved backend files change during implementation;
- `docs/WEB00_BACKEND_B4_IMPLEMENTATION_PLAN.md` is the only file created by this planning task;
- exact dependencies are `jose@6.2.3`, `argon2@0.45.1`, `cookie@2.0.1`, and `express-rate-limit@8.6.0`;
- no forbidden auth packages are added;
- no dependency overrides exist;
- `argon2` loads on portable Node;
- package API contract tests cover direct B4 packages before implementation commit;
- automatic package upgrade, downgrade, `npm audit fix`, and overrides are forbidden;
- `JWT_ACCESS_SECRET_BASE64` and `AUTH_FINGERPRINT_SECRET_BASE64` decode to distinct 32-byte-or-larger keys;
- access token is JWT HS256 with approved claims;
- access token is returned in JSON only and never in a cookie;
- raw refresh token is opaque, random, base64url, not JWT, and never stored in DB;
- refresh token hash is SHA-256;
- refresh rotation preserves family absolute expiry;
- concurrent refresh has one success and one reuse/replay outcome;
- reuse revokes all active sessions in the family;
- refresh cookie is HttpOnly, Strict, host-only, path `/api/auth`, and Secure in production;
- cookie parsing/serialization uses `cookie`;
- production Origin is enforced for login, refresh, and logout;
- login enumeration is closed for unknown, wrong, and inactive users;
- password verification uses dummy hash for unknown and inactive users;
- `auth-credentials.service.ts` owns credential verification and `AuthService` consumes `CredentialVerifier`;
- `auth.service.ts` is created only in the task that introduces full AuthService orchestration;
- login DB writes are committed through one atomic `commitLoginSuccess` repository method;
- family revocation and required audit event are committed through one atomic `revokeRefreshFamilyWithAudit` repository method;
- Argon2 verification, `jose` signing, logger calls, cookie serialization, and HTTP response logic run outside Prisma transactions;
- login and refresh success/error responses set `Cache-Control: no-store` and `Pragma: no-cache`;
- me success/error and logout responses set `Cache-Control: no-store`;
- rate-limit key uses IPv6-safe `ipKeyGenerator(request.ip, 56)` and hashed normalized email;
- login limiter does not count successful login;
- refresh limiter is separate;
- no registration/reset/MFA/OAuth/admin UI/admin CRUD/frontend/CORS/Redis/deploy scope appears;
- `app.ts` does not read `process.env`;
- `server.ts` creates Prisma/auth dependencies once and preserves disconnect;
- health endpoint remains public and DB-free;
- all errors use the existing envelope and include `requestId`;
- no Argon2, jose, Prisma, SQL, stack, password, token, cookie, hash, database URL, or secret value leaks in responses or logs;
- DB audit events are safe and limited to approved auth actions;
- auth integration tests use `TEST_DATABASE_URL`;
- existing 109 B1-B3 tests remain PASS;
- B4 tests pass;
- typecheck/build/check pass;
- audit high/critical gate passes;
- schema/migrations/seed/snapshot are unchanged;
- push, PR, merge, and deploy are absent unless separately approved.

## 20. Risks, mitigations and blockers

| Risk | Mitigation |
|---|---|
| Login leaks user existence or active status | Return `INVALID_CREDENTIALS` for unknown, wrong, and inactive login; run dummy Argon2 verification |
| Argon2 package fails on Windows or Render runtime | Verify `argon2@0.45.1` through portable Node; stop with `BLOCKED` if it cannot load |
| B4 exact package versions are newly released | Keep exact pins `jose@6.2.3`, `argon2@0.45.1`, `cookie@2.0.1`, and `express-rate-limit@8.6.0`; require portable Node install/load test for `argon2`; require package API contract tests; block high/critical audit findings; require a separate owner risk decision for any new moderate vulnerability in a direct B4 package; forbid automatic upgrade, downgrade, `npm audit fix`, and overrides |
| Access token ends up in cookie or server storage | Tests assert access token appears only in JSON and is not persisted |
| Raw refresh token leaks into database or logs | Repository stores only SHA-256 hash; tests scan DB rows, responses, and memory logs |
| Refresh rotation allows two successes | Conditional update inside transaction and integration concurrency test |
| Reuse detection reveals session internals | Return only `REFRESH_REUSE_DETECTED`; audit safe family event without raw token |
| Absolute refresh expiry extends during rotation | Successor uses old `expiresAt`; tests compare exact expiry |
| Cookie attributes drift | Cookie unit tests for name/path/secure/strict/host-only/clear behavior |
| Production Origin check breaks Supertest | Development/test policy allows missing Origin; production tests explicitly set env and Origin |
| Rate-limit key stores raw email or mishandles IPv6 | Unit test `createLoginRateLimitKey`; use `ipKeyGenerator(request.ip, 56)` and SHA-256 email hash |
| Memory rate-limit store is mistaken for multi-instance production hardening | Document single-instance limit; Redis/external store deferred to B9 decision |
| Auth tests corrupt shared test DB | `TEST_DATABASE_URL` guard, B4 fixture prefix, no table-wide deletes, `fileParallelism=false` |
| Schema change appears necessary | Stop with `BLOCKED`; B4 must use existing B2 `users`, `refresh_sessions`, and `audit_logs` models |
| New dependencies introduce high/critical vulnerability | High-threshold audit gate blocks before commit |
| Secrets appear in output | Env parsers and tests report variable names only; commands never print `.env` |
| Scope drifts into B5 admin or B7 UI | Explicit out-of-scope list and final file-scope checks |

Implementation blockers:

- branch is not `feat/web00-backend-b4`;
- HEAD is not based on `7fffc90c23b7c573eb4179a2370f381c84db10f3`;
- working tree has unrelated changes before B4 implementation;
- portable Node `v22.23.1` is unavailable;
- `argon2@0.45.1` cannot install or load;
- approved dependencies require overrides or extra packages;
- `TEST_DATABASE_URL` is missing, unsafe, or unavailable;
- integration tests would need `DATABASE_URL`, Supabase, Docker PostgreSQL on `5432`, or production data;
- rotation/reuse cannot be made deterministic without schema changes;
- production Origin model requires cross-site CORS or CSRF scope;
- high or critical audit finding appears;
- implementation requires modifying schema, migrations, seed, frontend, workflows, assets, or docs outside approved B4 documents;
- owner has not separately authorized commit, push, PR, merge, or deploy.
