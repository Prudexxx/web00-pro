# WEB00 Backend B6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add safe operational user administration for WEB00: local CLI bootstrap, local CLI admin/editor creation, local CLI password reset, admin-only user read/lifecycle HTTP API, session revocation, and immediate access-token invalidation after security-sensitive user changes.

**Architecture:** B6 uses Variant A. User creation and password setting stay outside HTTP and run only through interactive local CLI commands. HTTP admin user routes are read/lifecycle-only, reuse B5 admin authentication/cache/RBAC patterns, and operate on the existing `User`, `RefreshSession`, and `AuditLog` schema without migrations.

**Tech Stack:** Node.js 22.23.1 portable runtime, TypeScript NodeNext ESM, Express, Prisma 7.8.0, PostgreSQL 17, Zod, Argon2id password service from B4, Vitest, and Supertest.

**Global Constraints:**
- B6 implementation must start from branch `feat/web00-backend-b6` at commit `08455931985e8f9c985f20b9c7144b7633068b2b`.
- B6 does not add runtime dependencies or devDependencies.
- B6 may modify `backend/package.json` scripts only for `admin:bootstrap`, `user:create`, and `user:set-password`.
- Production CLI scripts must run compiled JavaScript from `dist/cli/*.command.js`; they must not use `tsx`, `ts-node`, `npx`, or `npm exec`.
- `tsx` is currently a devDependency and is allowed for tests/build-time tooling only, not production CLI runtime.
- `backend/package-lock.json` must remain unchanged.
- Prisma schema, migrations, seed code, and seed snapshot must remain unchanged.
- No HTTP user creation, HTTP password set, HTTP password reset, public registration, email activation, temporary passwords, forgot-password, self-service password change, MFA, OAuth/OIDC, user deletion, audit deletion, session-list API, selective session revoke API, invite links, admin UI, frontend integration, CORS changes, Redis, Render deploy, push, PR, or merge.
- Passwords, password hashes, tokens, cookies, session hashes, database URLs, raw Prisma errors, SQL, stacks, and terminal secret input must never be printed, logged, returned, or stored in audit JSON.
- All integration tests that write to PostgreSQL must use `TEST_DATABASE_URL` and must call `assertTestDatabaseUrl(...)` before creating a Prisma client.
- Existing four moderate Prisma-tooling advisories are accepted for B6; any high or critical audit finding blocks.

---

## 1. Goal

B6 builds the first safe user-management slice after B4 authentication and B5 admin catalog APIs.

It must provide:

- secure interactive CLI foundation;
- `npm run admin:bootstrap` for the first admin only;
- `npm run user:create` for subsequent local admin/editor creation;
- `npm run user:set-password` for operational password reset;
- admin-only HTTP user list/detail/role/disable/enable endpoints;
- central B5 RBAC extension for user permissions;
- last-active-admin protection;
- atomic refresh-session revocation after role, disable, and password reset;
- immediate old access-token rejection after session revoke, password reset, role change, disable, logout, expired session, missing session, or mismatched session;
- safe user audit events;
- preservation of all B1-B5 behavior and at least the existing 185 tests.

## 2. Preconditions

- [ ] Work on `feat/web00-backend-b6`.
- [ ] Confirm `git rev-parse HEAD` is `08455931985e8f9c985f20b9c7144b7633068b2b`.
- [ ] Confirm `git status --short` is clean before implementation starts.
- [ ] Confirm `git diff --cached --name-only` is empty before implementation starts.
- [ ] Confirm local PostgreSQL test environment remains available on the approved B2 isolated test database.
- [ ] Use the portable Node runtime at `D:\WEB00_TOOLS\node-v22.23.1-win-x64`.
- [ ] Do not create a commit as part of the implementation tasks. Commit/push/PR/deploy require separate owner instruction.

B6 uses the current schema. If implementation discovers that a required invariant needs a new column, index, constraint, relation, trigger, migration, or new dependency, stop the B6 implementation and report the exact missing item instead of inventing a workaround.

## 3. Selected CLI model

B6 uses selected Variant A:

- first admin: `npm run admin:bootstrap`;
- later users: `npm run user:create`;
- password reset: `npm run user:set-password`;
- HTTP user creation: forbidden;
- HTTP password set/reset/change: forbidden;
- HTTP temporary passwords and activation links: forbidden.

Admin HTTP API only manages:

- `GET /api/admin/users`;
- `GET /api/admin/users/:id`;
- `PATCH /api/admin/users/:id/role`;
- `POST /api/admin/users/:id/disable`;
- `POST /api/admin/users/:id/enable`.

Local shell access is the privileged operational boundary for CLI commands. CLI audit entries therefore use `actorUserId=null` and `source="cli"`; they do not impersonate a WEB00 admin user.

## 4. Scope

In scope:

- CLI terminal abstraction and password prompt;
- password policy validation;
- first-admin bootstrap;
- subsequent CLI user creation;
- CLI password reset;
- user read/lifecycle Admin API;
- RBAC extension for user permissions;
- atomic user mutation + session revoke + audit;
- auth hardening that checks access-token session context against the database;
- tests for CLI, user API, last-active-admin concurrency, audit safety, and auth hardening;
- script additions only in `backend/package.json`.

B6 may modify B4 auth code only for immediate access-token invalidation and associated tests. B6 may modify B5 admin route/RBAC code only to add the users module and user permissions.

## 5. Explicit out-of-scope

Do not implement:

- HTTP user creation;
- HTTP password set/reset/change;
- public registration;
- email activation;
- temporary passwords;
- forgot-password flow;
- self-service password change;
- MFA;
- OAuth/OIDC;
- user deletion;
- audit deletion;
- session-list API;
- selective session revoke API;
- invite links;
- image upload;
- Supabase Storage;
- admin UI;
- frontend integration;
- CORS changes;
- Redis;
- Render deploy;
- schema or migration changes;
- dependency changes;
- package overrides;
- npm audit fix;
- push, PR, merge, or deploy.

Users are never physically deleted in B6 so audit attribution remains stable.

## 6. Existing schema compatibility

B6 must use the existing Prisma schema.

Existing `User` fields:

- `id: String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`;
- `email: String @unique @db.Text`;
- `passwordHash: String @map("password_hash") @db.Text`;
- `role: String @default("editor") @db.Text`;
- `active: Boolean @default(true)`;
- `lastLoginAt: DateTime? @map("last_login_at") @db.Timestamptz(6)`;
- `createdAt`;
- `updatedAt`;
- `refreshSessions`;
- `auditLogs`;
- index `@@index([active, role], map: "idx_users_active_role")`.

Existing `RefreshSession` fields:

- `id`;
- `userId`;
- `tokenHash`;
- `familyId`;
- `replacedBySessionId`;
- `revokedAt`;
- `expiresAt`;
- `ipHash`;
- `userAgentHash`;
- `createdAt`;
- `updatedAt`;
- relation to `User`;
- indexes on `(userId, expiresAt)` and `(familyId, revokedAt)`.

Existing `AuditLog` fields:

- `id`;
- `actorUserId` nullable;
- `action`;
- `entityType`;
- `entityId` nullable;
- `beforeJson`;
- `afterJson`;
- `requestId`;
- `ipHash`;
- `userAgentHash`;
- `createdAt`;
- optional relation to `User` with `onDelete: SetNull`.

Compatibility decision:

- B6 can represent user bootstrap, create, password reset, role change, disable, enable, refresh-session revocation, safe CLI actor model, and safe audit entries without schema changes.
- B6 does not add a `createdBy`, `passwordChangedAt`, `roleVersion`, `disabledAt`, `lastActiveAdminLock`, or `source` column. `source="cli"` is stored only inside safe audit JSON.
- Immediate access-token invalidation uses the existing `RefreshSession.id` carried as JWT `sessionId`, plus `revokedAt`, `expiresAt`, `userId`, and current `User.role`/`User.active`.

## 7. Password policy

CLI password contract:

- type: string;
- minimum length: 15 Unicode code points;
- maximum length: 1024 Unicode code points;
- the same value must also pass the existing B4 login parser unchanged;
- B4 currently parses login passwords with `z.string().min(1).max(1024)`, so B6 must respect the real B4 JavaScript string length/code-unit upper bound in addition to the B6 code-point limit;
- do not assume Unicode code-point count equals JavaScript `string.length`;
- spaces are allowed;
- printing ASCII and Unicode are allowed;
- do not trim or normalize password whitespace;
- do not apply a new Unicode normalization step only on the CLI side;
- CLI and login must hash/verify the same byte sequence for the same user-entered password;
- if NFC or any other normalization is ever required, it must be introduced as a shared migration-compatible auth policy, not as unilateral B6 CLI behavior;
- prompt twice;
- both values must match exactly;
- do not require uppercase, lowercase, number, or symbol composition;
- do not read the password from argv;
- do not read the password from environment variables;
- do not read the password from normal echoing stdin;
- do not print the password;
- do not log the password;
- do not print or log `passwordHash`;
- keep password references in the smallest possible local command scope.

Compatibility tests must cover:

- 15 ASCII characters;
- spaces inside a password;
- leading and trailing spaces preserved;
- emoji and astral Unicode;
- combining characters;
- exactly the current B4 maximum accepted by the login parser;
- a value below the B6 code-point maximum but above the B4 code-unit maximum;
- every CLI-accepted password also passes the B4 login schema unchanged;
- every CLI-rejected password performs no user create or password update.

Hashing:

- use the existing B4 `createArgon2PasswordHasher()`;
- use existing Argon2id options: `memoryCost=19456`, `timeCost=2`, `parallelism=1`, `hashLength=32`;
- hash before opening a DB transaction;
- never run Argon2 inside a transaction.

Breached-password checks:

- B6 does not add a breached-password blocklist.
- B6 does not fake a full breach check with a tiny embedded list.
- B6 password length and no-composition rules follow part of NIST guidance.
- B6 does not claim full NIST SP 800-63B compliance.
- Full screening against commonly used, expected, and compromised password blocklists is not implemented.
- The missing blocklist is a documented security gap and a production security certification blocker.
- The gap does not block the current B6 engineering phase.
- A real blocklist requires a separately approved data source, license review, offline/online architecture, update cadence, and failure policy.
- A tiny embedded list must never be described as a breached-password check.

Plaintext memory handling:

- JavaScript strings are immutable and cannot be guaranteed to be overwritten.
- B6 does not claim cryptographic memory erasure or guaranteed string zeroization.
- `promptSecret` may return a string; command code stores that string only in local command scope.
- after hashing, command code stops passing plaintext across service/repository boundaries.
- repository inputs contain `passwordHash`, never plaintext password.
- password strings are not stored in service instance fields.
- password values are excluded from errors, logs, audit, and output.
- any password `Buffer` objects created by implementation must be overwritten with `fill(0)` in `finally`.
- temporary Buffer copies are not returned from services.

Memory-safety tests must cover:

- `CliUserService` instances do not retain plaintext password fields;
- repository input contains `passwordHash` but not plaintext password;
- output, error, and audit payloads do not contain plaintext;
- implementation-created Buffers are cleared in `finally` for success and failure.

Planned interface:

```typescript
export interface PasswordPolicy {
  validate(password: string): PasswordPolicyResult;
}

export type PasswordPolicyResult =
  | { ok: true }
  | {
      code:
        | "PASSWORD_TOO_SHORT"
        | "PASSWORD_TOO_LONG"
        | "PASSWORD_NOT_LOGIN_COMPATIBLE";
      message: string;
    };
```

## 8. Secure terminal input

CLI commands require:

- `process.stdin.isTTY === true`;
- `process.stdout.isTTY === true`.

Non-interactive execution:

- exits safely;
- does not prompt for password;
- performs no DB mutation;
- returns a non-zero exit code;
- prints only a safe machine-readable code and short safe message.

Reusable terminal interface:

```typescript
export interface InteractiveTerminal {
  promptVisible(label: string): Promise<string>;
  promptSecret(label: string): Promise<string>;
  confirmExact(label: string, expected: string): Promise<boolean>;
  writeSafe(message: string): void;
  close(): Promise<void>;
}
```

Implementation requirements:

- `promptVisible` uses `node:readline/promises` for email, role, and confirmation prompts.
- `promptSecret` disables echo using TTY raw mode.
- before entering `promptSecret`, any visible readline interface is closed or paused so it no longer reads from stdin.
- stdin has exactly one owner at any time: visible readline or raw secret reader, never both.
- raw Ctrl+C is detected from input byte `0x03` / U+0003; do not rely only on a process `SIGINT` event while inside the raw secret loop.
- byte `0x03` creates a controlled CLI cancellation error and does not print the secret or secret length.
- `promptSecret` supports Backspace, Enter, and Ctrl+C.
- It may print a neutral placeholder only if it does not reveal the secret length; preferred behavior is no placeholder.
- it records initial terminal state before changing it: `wasRaw`, `wasPaused`, and baseline listener counts for temporary listeners.
- it restores raw mode to the exact prior state, including `true` back to `true` and `false` back to `false`.
- it removes temporary `data`, `error`, and `end` listeners in `finally`.
- it restores stdin pause/resume state.
- it terminates the prompt line with a safe newline after success, error, Ctrl+C, or EOF.
- it restores terminal state on validation failure, Ctrl+C byte `0x03`, EOF, and ordinary errors.
- `SIGINT` handler is used only outside the raw secret loop or as a fallback.
- `SIGTERM` handler performs best-effort cleanup.
- B6 does not promise cleanup after `SIGKILL`, OS crash, or power loss.
- It does not leave stdin paused or raw after completion.
- `terminal.close()` is idempotent.
- Business services never import `node:process`, `node:readline/promises`, `stdin`, or `stdout`.

Terminal tests must cover:

- raw Ctrl+C as byte `0x03`;
- `0x03` does not require a `SIGINT` event;
- exactly one stdin consumer;
- visible readline does not intercept secret bytes;
- previous raw mode `true` is restored to `true`;
- previous raw mode `false` is restored to `false`;
- temporary listener count returns to baseline;
- EOF restores terminal state;
- `close()` can be called twice safely;
- Ctrl+C does not print the secret or its length.

Safe CLI output:

```typescript
export interface CliOutput {
  code: string;
  message: string;
  requestId?: string;
  user?: {
    id: string;
    email: string;
    role: "admin" | "editor";
    active: boolean;
  };
}
```

## 9. First-admin bootstrap

Command:

```powershell
npm run admin:bootstrap
```

Purpose:

- create the first admin only;
- do not create an HTTP endpoint.

Flow:

1. parse safe app/auth/database configuration without printing values;
2. require interactive TTY;
3. prompt visible normalized email;
4. prompt password;
5. prompt password confirmation;
6. validate password;
7. hash password outside a transaction;
8. require exact confirmation, recommended phrase `BOOTSTRAP ADMIN`;
9. run race-safe DB transaction;
10. print safe success summary only.

Bootstrap guard:

- allowed only when there is no `User` with `role="admin"`;
- active and inactive admins both block repeat bootstrap;
- existing editor users do not block first admin bootstrap;
- duplicate email blocks;
- concurrent bootstrap commands allow exactly one admin creation.

Transaction:

- create `User` with `role="admin"`, `active=true`, normalized unique email, `passwordHash`, `lastLoginAt=null`;
- create `AuditLog` with `action="user.bootstrap_admin"`, `entityType="user"`, `entityId=createdUser.id`, `actorUserId=null`, `beforeJson=DbNull`, `afterJson=safe projection plus source="cli"`, `requestId="cli:<uuid>"`;
- user and audit are atomic;
- audit failure rolls back user creation.

Safe success output:

- code;
- user id;
- normalized email;
- role;
- active state;
- requestId.

Never output password, password hash, database URL, SQL, stack, raw Prisma error, token, cookie, or session hash.

## 10. Subsequent user creation

Command:

```powershell
npm run user:create
```

Flow:

1. require interactive TTY;
2. verify at least one active admin exists;
3. prompt email;
4. prompt role with default `editor`;
5. prompt password twice;
6. validate password;
7. hash outside a transaction;
8. require confirmation;
9. atomic create + audit.

Role rules:

- allowed roles are `editor` and `admin`;
- default role is `editor`;
- `admin` requires exact confirmation phrase `CREATE ADMIN`.

Create rules:

- email is trimmed and lowercased;
- email must be unique;
- `active=true`;
- `lastLoginAt=null`;
- no refresh sessions are created;
- no automatic login occurs.

Audit:

- action `user.create_cli`;
- `entityType="user"`;
- `actorUserId=null`;
- safe before/after;
- `source="cli"`;
- `requestId="cli:<uuid>"`.

If no active admin exists, return safe CLI error and do not create a user.

## 11. CLI password reset

Command:

```powershell
npm run user:set-password
```

Purpose:

- operational password reset/set;
- password never crosses HTTP.

Flow:

1. require interactive TTY;
2. prompt target email;
3. find user;
4. prompt new password twice;
5. validate password;
6. hash outside a transaction;
7. require exact confirmation;
8. atomic password update + refresh-session revoke + audit.

Rules:

- disabled users can have passwords reset;
- password reset does not enable a disabled user;
- `lastLoginAt` is unchanged;
- target must log in again;
- all active refresh sessions for the user are revoked;
- audit failure rolls back password update and session revocation.

Audit:

- action `user.password_set_cli`;
- `entityType="user"`;
- `actorUserId=null`;
- `beforeJson` contains only safe facts such as `{ "passwordChanged": false }`;
- `afterJson` contains `{ "passwordChanged": true, "sessionsRevoked": number, "source": "cli" }`;
- no password, hash, token, cookie, session hash, raw session rows, DB URL, or terminal input.

## 12. Admin User API

Routes:

```text
GET   /api/admin/users
GET   /api/admin/users/:id
PATCH /api/admin/users/:id/role
POST  /api/admin/users/:id/disable
POST  /api/admin/users/:id/enable
```

Do not implement:

```text
POST   /api/admin/users
DELETE /api/admin/users
PATCH  /api/admin/users/:id/password
POST   /api/admin/users/:id/password
POST   /api/admin/users/:id/reset-password
GET    /api/admin/users/:id/sessions
POST   /api/admin/users/:id/sessions/revoke
```

Every Admin User API endpoint:

- uses B4 Bearer authentication;
- runs after B5 `adminCacheControl`;
- uses admin-only RBAC permissions;
- applies permission middleware before validation, lookup, service, or repository;
- uses strict Zod validation;
- validates UUID params;
- returns no-store;
- mutation responses also set `Pragma: no-cache`;
- returns explicit DTOs, not raw Prisma models;
- never returns `passwordHash`, refresh-session rows, `tokenHash`, session family, audit internals, IP/User-Agent hashes, tokens, cookies, or database metadata.

## 13. RBAC extension

Extend the central B5 permission union from `B5Permission` to a B6-compatible permission type. The exact exported name can remain `B5Permission` for low churn only if tests prove it now includes B6 user grants; preferred name is `AdminPermission`.

New user permissions:

- `user.read`;
- `user.changeRole`;
- `user.disable`;
- `user.enable`.

Admin grants:

- all B5 site/category/audit permissions;
- all B6 user permissions.

Editor grants:

- existing B5 editor grants only: `site.read`, `site.createDraft`, `site.updateDraft`, `category.read`;
- no user permissions.

Unknown role or unknown permission remains denied.

Route permission middleware must run before validation, user lookup, service, and repository. An editor must receive `403 FORBIDDEN` for user endpoints without learning whether the target user exists.

## 14. User lifecycle rules

Safe user item:

```typescript
export interface SafeAdminUser {
  active: boolean;
  createdAt: string;
  email: string;
  id: string;
  lastLoginAt: string | null;
  role: "admin" | "editor";
  updatedAt: string;
}
```

List query:

```typescript
export interface AdminUserListQuery {
  active?: boolean;
  direction: "asc" | "desc";
  limit: number;
  page: number;
  role?: "admin" | "editor";
  search?: string;
  sort: "createdAt" | "updatedAt" | "email" | "role" | "lastLoginAt";
}
```

`GET /api/admin/users`:

- `page` default 1, min 1;
- `limit` default 50, min 1, max 100;
- `search` optional, trim, max 100;
- `role` optional `admin | editor`;
- `active` optional boolean;
- `sort` one of `createdAt`, `updatedAt`, `email`, `role`, `lastLoginAt`;
- `direction` one of `asc`, `desc`;
- stable `id` tie-breaker;
- search is email contains, case-insensitive;
- rows and count are read in one transaction;
- use Prisma `select`;
- no unrestricted `include`;
- no N+1.

`GET /api/admin/users/:id`:

- returns the same safe fields;
- missing user returns `404 USER_NOT_FOUND`.

`PATCH /api/admin/users/:id/role`:

- strict body `{ "role": "admin" | "editor" }`;
- admin only;
- self-role change returns `403 SELF_ROLE_CHANGE_FORBIDDEN`;
- missing target returns `404 USER_NOT_FOUND`;
- same role returns `409 USER_ROLE_UNCHANGED`;
- disabled target role change is allowed and the user remains disabled;
- demoting the last active admin returns `409 LAST_ACTIVE_ADMIN`;
- role change revokes all active refresh sessions;
- role change + session revoke + audit are atomic.

`POST /api/admin/users/:id/disable`:

- admin only;
- self-disable returns `403 SELF_DISABLE_FORBIDDEN`;
- missing target returns `404 USER_NOT_FOUND`;
- already disabled returns `409 USER_ALREADY_DISABLED`;
- disabling the last active admin returns `409 LAST_ACTIVE_ADMIN`;
- sets `active=false`;
- revokes all active refresh sessions;
- mutation + revoke + audit are atomic;
- old access tokens become invalid immediately because auth checks DB session state.

`POST /api/admin/users/:id/enable`:

- admin only;
- missing target returns `404 USER_NOT_FOUND`;
- already active returns `409 USER_ALREADY_ACTIVE`;
- sets `active=true`;
- creates no refresh session;
- issues no token;
- user must perform normal login;
- mutation + audit are atomic.

## 15. Last-active-admin protection

B6 must prevent a state with no active admin.

Operations that can reduce active admin count:

- active admin to editor role change;
- disabling an active admin.

Rules:

- self-demotion is forbidden before count checks;
- self-disable is forbidden before count checks;
- if the target is an active admin, transaction checks active admin count;
- operation is allowed only when active admin count is greater than 1;
- two concurrent operations against the final two active admins cannot both pass;
- use the shared `runSerializableWithRetry` helper described below;
- audit is created only for an actually successful mutation.

Required serializable retry helper:

```typescript
export const MAX_SERIALIZABLE_ATTEMPTS = 5;

export async function runSerializableWithRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T>;
```

Exact retry rules:

- every attempt starts exactly one new Prisma transaction;
- every transaction uses `isolationLevel: Prisma.TransactionIsolationLevel.Serializable`;
- maximum attempts is exactly `5`;
- retry only Prisma error code `P2034`;
- do not retry unique conflicts;
- do not retry validation errors;
- do not retry `AppError`;
- do not retry non-`P2034` Prisma errors;
- no unbounded loops;
- no recursive retries;
- password hashing, prompts, logger calls, and output are outside the retry loop;
- every retry repeats only the short database transaction.

Bootstrap retry behavior:

- after `P2034`, retry rechecks whether any admin exists;
- if another command already created an admin, return `BOOTSTRAP_ALREADY_COMPLETED`;
- at most one bootstrap transaction commits a user and audit row.

Last-active-admin retry behavior:

- after `P2034`, retry rereads the target and active admin count;
- if only one active admin remains, return `LAST_ACTIVE_ADMIN`;
- after five `P2034` attempts, return `409 CONCURRENT_MODIFICATION`;
- do not expose raw `P2034`, Prisma message, SQL, or stack.

Required deterministic tests:

- retry count is exactly five;
- `P2034` retries;
- non-`P2034` errors do not retry;
- success on attempt two creates exactly one domain mutation and one audit row;
- retry exhaustion creates no partial mutation or audit row;
- concurrent bootstrap has exactly one success;
- concurrent demotion/disable cannot remove both final active admins.

Recommended repository helper:

```typescript
export interface LastActiveAdminPolicy {
  assertCanRemoveActiveAdmin(tx: Prisma.TransactionClient, targetUserId: string): Promise<void>;
}
```

## 16. Session revocation and access-token invalidation

Current B4 access-token authentication verifies JWT and loads active user by `sub`. B6 intentionally hardens this flow.

B6 authentication session-context check:

1. verify JWT signature and registered claims;
2. load current user and refresh session by JWT `sub` and `sessionId`;
3. verify session belongs to user;
4. verify `RefreshSession.revokedAt === null`;
5. verify `RefreshSession.expiresAt > now`;
6. verify `User.active === true`;
7. verify DB `User.role` equals JWT role;
8. only then return `AuthenticatedPrincipal`.

Safe outcomes:

- inactive user: existing `USER_DISABLED`;
- missing session: `401 UNAUTHORIZED`;
- revoked session: `401 UNAUTHORIZED`;
- expired session: `401 UNAUTHORIZED`;
- session/user mismatch: `401 UNAUTHORIZED`;
- stale role claim: `401 UNAUTHORIZED`.

On role change, disable, and password reset:

- revoke all active refresh sessions for the target user in the same transaction as the user mutation and audit;
- old access tokens tied to those sessions stop working immediately;
- logout becomes immediate for access tokens because revoked refresh session is checked during access-token authentication.

Login regression contract:

- access JWT `sessionId` equals the committed `RefreshSession.id`;
- login token works after the login transaction commits;
- failed login transaction returns no usable access token.

Refresh regression contract:

- refreshed access JWT contains successor `RefreshSession.id`;
- successor session is active and belongs to the same user;
- refreshed access token passes session-context verification;
- predecessor access token tied to the revoked predecessor session is rejected immediately;
- refresh rotation semantics and absolute refresh expiry remain unchanged.

Logout regression contract:

- logout revokes the current family/session as B4 already does;
- access token for the logged-out `sessionId` is rejected immediately.

Role, disable, and password-set regression contract:

- sessions are revoked in the same transaction as the sensitive mutation;
- old access tokens are rejected immediately;
- `enable` does not revive old refresh sessions or old access tokens;
- re-enabled users must perform a new login.

Route boundary:

- health and public catalog routes do not require access-token session DB checks.

Do not change JWT claims, cookie name, cookie attributes, refresh rotation semantics, or access-token storage rules.

Planned repository interface:

```typescript
export interface UserSessionContextRepository {
  findSessionContext(input: {
    sessionId: string;
    userId: string;
  }): Promise<UserSessionContext | null>;
}

export interface UserSessionContext {
  session: {
    expiresAt: Date;
    id: string;
    revokedAt: Date | null;
    userId: string;
  };
  user: {
    active: boolean;
    email: string;
    id: string;
    role: "admin" | "editor";
  };
}
```

## 17. Audit contract

Required B6 actions:

- `user.bootstrap_admin`;
- `user.create_cli`;
- `user.password_set_cli`;
- `user.role_change`;
- `user.disable`;
- `user.enable`.

API mutations:

- `actorUserId` is the authenticated admin id.

CLI mutations:

- `actorUserId=null`;
- `source="cli"` appears in safe audit JSON;
- no fake WEB00 actor is written.

Audit rules:

- audit row is created in the same transaction as domain mutation;
- audit failure rolls back the domain mutation;
- before/after JSON use allowlisted safe projections;
- `sessionsRevoked` is a number only;
- no password, password hash, raw session rows, token hash, token, cookie, raw terminal input, DB URL, SQL, Prisma stack, `ipHash`, or `userAgentHash` in safe API output.

Safe user audit projection:

```typescript
export interface SafeUserAuditProjection {
  active: boolean;
  email: string;
  id: string;
  role: "admin" | "editor";
}
```

## 18. Error contract

Add the minimal safe error codes needed by implementation:

- `USER_NOT_FOUND`;
- `USER_EMAIL_CONFLICT`;
- `USER_ROLE_UNCHANGED`;
- `USER_ALREADY_DISABLED`;
- `USER_ALREADY_ACTIVE`;
- `SELF_ROLE_CHANGE_FORBIDDEN`;
- `SELF_DISABLE_FORBIDDEN`;
- `LAST_ACTIVE_ADMIN`;
- `BOOTSTRAP_ALREADY_COMPLETED`;
- `INTERACTIVE_TTY_REQUIRED`;
- `PASSWORD_CONFIRMATION_MISMATCH`;
- `CLI_CONFIRMATION_REQUIRED`;
- `CONCURRENT_MODIFICATION`.

HTTP errors:

- use the existing JSON envelope;
- include `requestId`;
- use safe messages;
- do not expose raw Prisma errors, SQL, stack, password, hash, token, cookie, session hash, or DB URL.

CLI errors:

- include a machine-readable safe code;
- include a short safe message;
- exit non-zero;
- never print raw Prisma errors or stacks.

Recommended messages:

```text
USER_NOT_FOUND: User was not found.
USER_EMAIL_CONFLICT: Email is already in use.
USER_ROLE_UNCHANGED: User already has this role.
USER_ALREADY_DISABLED: User is already disabled.
USER_ALREADY_ACTIVE: User is already active.
SELF_ROLE_CHANGE_FORBIDDEN: You cannot change your own role.
SELF_DISABLE_FORBIDDEN: You cannot disable your own user.
LAST_ACTIVE_ADMIN: At least one active admin must remain.
BOOTSTRAP_ALREADY_COMPLETED: Admin bootstrap has already been completed.
INTERACTIVE_TTY_REQUIRED: Interactive terminal is required.
PASSWORD_CONFIRMATION_MISMATCH: Password confirmation does not match.
CLI_CONFIRMATION_REQUIRED: Required confirmation was not provided.
CONCURRENT_MODIFICATION: The operation conflicted with another update. Try again.
```

CLI variant for `CONCURRENT_MODIFICATION`:

```text
CONCURRENT_MODIFICATION: The operation conflicted with another update. Run the command again.
```

## 19. File map and interfaces

Create:

```text
backend/src/cli/cli.types.ts
backend/src/cli/cli-errors.ts
backend/src/cli/cli-output.ts
backend/src/cli/interactive-terminal.ts
backend/src/cli/password-prompt.ts
backend/src/cli/cli-user.repository.ts
backend/src/cli/cli-user.service.ts
backend/src/cli/admin-bootstrap.command.ts
backend/src/cli/user-create.command.ts
backend/src/cli/user-set-password.command.ts

backend/src/modules/admin/users/user.types.ts
backend/src/modules/admin/users/user.schemas.ts
backend/src/modules/admin/users/user.mapper.ts
backend/src/modules/admin/users/user.repository.ts
backend/src/modules/admin/users/user.service.ts
backend/src/modules/admin/users/user.controller.ts
backend/src/modules/admin/users/user.routes.ts

backend/tests/cli.password-policy.test.ts
backend/tests/cli.interactive-terminal.test.ts
backend/tests/cli.admin-bootstrap.test.ts
backend/tests/cli.user-create.test.ts
backend/tests/cli.user-set-password.test.ts
backend/tests/cli.production-scripts.test.ts
backend/tests/admin.user.validation.test.ts
backend/tests/admin.user.mapper.test.ts
backend/tests/admin.user.service.test.ts
backend/tests/auth.session-context.test.ts
backend/tests/integration/admin-users-api.test.ts
backend/tests/integration/cli-user-commands.test.ts
backend/tests/integration/auth-session-invalidation.test.ts
```

Modify:

```text
backend/package.json
backend/src/lib/errors.ts
backend/src/modules/admin/rbac.types.ts
backend/src/modules/admin/rbac.policy.ts
backend/src/modules/admin/admin.routes.ts
backend/src/server.ts
backend/src/modules/auth/auth.types.ts
backend/src/modules/auth/auth.repository.ts
backend/src/modules/auth/auth.service.ts
backend/src/modules/auth/auth.middleware.ts
backend/tests/auth.service.test.ts
backend/tests/auth.middleware.test.ts
backend/tests/integration/auth-api.test.ts
backend/tests/integration/admin-api.test.ts
```

Do not modify:

```text
backend/package-lock.json
backend/prisma/schema.prisma
backend/prisma/migrations/**
backend/prisma/seed.ts
backend/prisma/seed-web00-data.ts
backend/prisma/seed-data/web00-catalog.json
backend/src/modules/public-catalog/**
docs/**
assets/**
.github/**
frontend/root files
```

Required interfaces:

```typescript
export interface CliRuntime {
  clock: () => Date;
  createPrisma: (databaseUrl: string) => PrismaClient;
  randomUUID: () => string;
  terminal: InteractiveTerminal;
}

export interface UserMutationContext {
  actorUserId: string | null;
  requestId: string;
  source: "api" | "cli";
  now: Date;
}

export interface CliUserRepository {
  bootstrapFirstAdmin(input: BootstrapFirstAdminRepositoryInput): Promise<SafeAdminUser>;
  createUser(input: CreateCliUserRepositoryInput): Promise<SafeAdminUser>;
  setPassword(input: SetUserPasswordRepositoryInput): Promise<SetUserPasswordResult>;
}

export interface CliUserService {
  bootstrapFirstAdmin(input: BootstrapFirstAdminInput): Promise<CliOutput>;
  createUser(input: CreateCliUserInput): Promise<CliOutput>;
  setPassword(input: SetUserPasswordInput): Promise<CliOutput>;
}

export interface AdminBootstrapService {
  run(): Promise<number>;
}

export interface UserCreationService {
  run(): Promise<number>;
}

export interface UserPasswordResetService {
  run(): Promise<number>;
}

export interface AdminUserRepository {
  getUser(id: string): Promise<AdminUserRecord | null>;
  listUsers(query: AdminUserListQuery): Promise<{ rows: AdminUserRecord[]; total: number }>;
  changeRole(input: ChangeUserRoleRepositoryInput): Promise<UserMutationResult>;
  disable(input: DisableUserRepositoryInput): Promise<UserMutationResult>;
  enable(input: EnableUserRepositoryInput): Promise<UserMutationResult>;
}

export interface AdminUserService {
  getUser(id: string): Promise<SafeAdminUser>;
  listUsers(query: AdminUserListQuery): Promise<AdminUserListResponse>;
  changeRole(id: string, role: "admin" | "editor", context: UserMutationContext): Promise<SafeAdminUser>;
  disable(id: string, context: UserMutationContext): Promise<SafeAdminUser>;
  enable(id: string, context: UserMutationContext): Promise<SafeAdminUser>;
}
```

Repository modules do not accept process streams or raw Express requests. Services do not print output directly. Clock and UUID generator are injectable. Password hashing uses the existing B4 `PasswordHasher`.

## 20. App/server/script integration

`backend/package.json` script additions only:

```json
{
  "admin:bootstrap": "node dist/cli/admin-bootstrap.command.js",
  "user:create": "node dist/cli/user-create.command.js",
  "user:set-password": "node dist/cli/user-set-password.command.js"
}
```

Production CLI launcher contract:

- existing `backend/tsconfig.build.json` uses `rootDir="src"` and `outDir="dist"`;
- future `backend/src/cli/admin-bootstrap.command.ts` emits to `backend/dist/cli/admin-bootstrap.command.js`;
- future `backend/src/cli/user-create.command.ts` emits to `backend/dist/cli/user-create.command.js`;
- future `backend/src/cli/user-set-password.command.ts` emits to `backend/dist/cli/user-set-password.command.js`;
- production CLI runs only after an approved `npm run build`;
- production CLI does not require `tsx`, TypeScript compiler, `ts-node`, `npx`, or `npm exec`;
- command entrypoints exit with a safe `COMPILED_ENTRY_MISSING`-style CLI error if the compiled entry file is absent;
- package-lock remains unchanged;
- no dependency is added.

Future production launcher tests:

- `npm run build` creates all three compiled CLI entry files under `dist/cli`;
- package scripts point exactly to the existing compiled files;
- scripts do not contain `--import tsx`, `npx`, `npm exec`, or `ts-node`;
- executing already-built command files does not require devDependencies;
- importing command entry files does not start the HTTP server.

Admin API wiring:

- add `AdminUserService` to `AdminRouterOptions`;
- mount `createAdminUserRouter` inside the aggregate `/api/admin` router after cache-control and admin auth;
- maintain B5 site/category/audit routes;
- keep `adminCacheControl()` first in aggregate admin router;
- keep B4 Bearer auth as the only admin authentication mechanism.

Server wiring:

- create one Prisma client;
- reuse the same Prisma client for public catalog, auth, B5 admin modules, and B6 user modules;
- instantiate CLI commands independently through their command entry files;
- command files parse env and create/disconnect Prisma without starting HTTP server.

No frontend, assets, `.github`, deploy, CORS, or admin UI integration is part of B6.

## 21. Testing strategy

Unit tests:

- CLI requires TTY;
- non-interactive CLI exits non-zero without DB mutation;
- password is not echoed;
- password confirmation mismatch;
- password minimum and maximum Unicode code points;
- password compatibility with the existing B4 login parser;
- password rejected when code-point count is within B6 limits but B4 code-unit limit is exceeded;
- spaces accepted in password;
- leading and trailing password spaces preserved;
- emoji, astral Unicode, and combining-character passwords covered;
- no uppercase/lowercase/number/symbol composition requirement;
- raw mode restored after success;
- raw mode restored after validation failure;
- raw mode restored after Ctrl+C;
- raw Ctrl+C byte `0x03` works without a `SIGINT` event;
- visible readline and raw secret reader never consume stdin simultaneously;
- temporary listener count returns to baseline;
- EOF restores terminal state;
- idempotent terminal close;
- safe CLI output contains no password, hash, token, cookie, session hash, DB URL, SQL, or stack;
- password plaintext is absent from service instance fields and repository inputs;
- implementation-created password Buffers are filled with zero in success and failure paths;
- production scripts use compiled `dist/cli/*.command.js` and never use dev-only TS launchers;
- admin role requires exact `CREATE ADMIN` confirmation;
- bootstrap success;
- active admin blocks bootstrap;
- inactive admin blocks bootstrap;
- editors do not block bootstrap;
- duplicate email maps to `USER_EMAIL_CONFLICT`;
- concurrent bootstrap exactly one success;
- audit failure rolls back bootstrap;
- user create default editor;
- user create explicit admin confirmation;
- user create requires at least one active admin;
- user create password never appears in audit/output;
- password reset missing user;
- password reset disabled user remains disabled;
- password reset revokes sessions;
- password reset audit atomicity;
- password reset leaves `lastLoginAt` unchanged;
- HTTP user validation strict query/body;
- safe user mapper omits `passwordHash` and sessions;
- editor has no user permissions;
- permission denial before user lookup;
- self-role change denied;
- self-disable denied;
- last active admin protected;
- concurrent last-admin mutations;
- role change revokes sessions;
- disable revokes sessions;
- enable creates no session;
- API audit atomicity;
- auth accepts valid active session;
- auth rejects revoked session access token;
- auth rejects expired refresh session access token;
- auth rejects session/user mismatch;
- auth rejects stale role claim;
- auth rejects disabled user;
- login access JWT `sessionId` matches the committed `RefreshSession.id`;
- failed login does not return a usable token;
- refreshed access JWT uses the successor `RefreshSession.id`;
- predecessor access token is invalid after refresh rotation;
- role change invalidates old access token;
- password reset invalidates old access token;
- logout invalidates access token immediately;
- re-enabled user must perform a new login;
- health and public catalog routes do not require a session DB check;
- normal B4 login/refresh/logout/me remains passing with the approved hardening.

Integration test safety:

- all DB integration tests use `TEST_DATABASE_URL`;
- every integration file calls `assertTestDatabaseUrl(...)` before Prisma client creation;
- fixture prefixes include `b6-bootstrap-`, `b6-user-`, `b6-admin-`, `b6-editor-`, `b6-cli-`, and `b6-audit-`;
- cleanup targets only own fixture users, sessions, audit rows, and related data;
- no table-wide delete;
- no seed mutation;
- no database URL output;
- CLI integration tests use injected fake terminal;
- automated logs contain no real secrets;
- Vitest remains `fileParallelism=false` for integration safety if already configured that way.

## 22. Ordered implementation tasks

### Task 1: CLI Terminal Abstraction And Password Policy

**Files:**
- Create `backend/src/cli/cli.types.ts`.
- Create `backend/src/cli/cli-errors.ts`.
- Create `backend/src/cli/cli-output.ts`.
- Create `backend/src/cli/interactive-terminal.ts`.
- Create `backend/src/cli/password-prompt.ts`.
- Create `backend/tests/cli.password-policy.test.ts`.
- Create `backend/tests/cli.interactive-terminal.test.ts`.

**Interfaces:**
- Consumes: existing Node built-ins only.
- Produces: `InteractiveTerminal`, `PasswordPolicy`, `CliOutput`, `CliRuntime`, safe CLI error helpers.

- [ ] Write failing tests for password code-point limits, B4 login parser compatibility, B4 code-unit upper-bound mismatch, spaces, leading/trailing space preservation, emoji/astral Unicode, combining characters, confirmation mismatch, no composition rules, no echo, raw Ctrl+C byte `0x03`, one stdin consumer, visible readline not reading secret bytes, listener cleanup, EOF cleanup, idempotent close, raw-mode restore on success/failure/Ctrl+C/EOF, and non-TTY rejection.
- [ ] Run `npm exec vitest run tests/cli.password-policy.test.ts tests/cli.interactive-terminal.test.ts`.
- [ ] Expected RED: modules under `src/cli` do not exist.
- [ ] Implement `InteractiveTerminal` and password policy with injectable streams for tests.
- [ ] Ensure `promptSecret` closes or pauses visible readline before raw reading, records `wasRaw`/`wasPaused`, treats `0x03` as cancellation, removes temporary listeners, restores pause/raw state in `finally`, and does not rely only on `SIGINT`.
- [ ] Ensure CLI password validation calls the existing B4 login password parser or a shared helper that proves the same parser constraints without changing B4 normalization.
- [ ] Ensure safe output never includes captured secret values.
- [ ] Run `npm exec vitest run tests/cli.password-policy.test.ts tests/cli.interactive-terminal.test.ts`.
- [ ] PASS criteria: all CLI terminal/policy tests pass, every CLI-accepted password is B4-login-compatible, impossible terminal-cleanup promises are absent, and no backend DB code is introduced.
- [ ] Rollback boundary: remove `backend/src/cli/*` files created in Task 1 and the two CLI tests.
- [ ] Out-of-scope: Prisma, user creation, password hashing, package scripts.

### Task 2: CLI User Repository And Atomic Audit Primitives

**Files:**
- Create `backend/src/cli/cli-user.repository.ts`.
- Create `backend/src/cli/cli-user.service.ts`.
- Create `backend/tests/cli.admin-bootstrap.test.ts`.
- Create `backend/tests/cli.user-create.test.ts`.
- Create `backend/tests/cli.user-set-password.test.ts`.

**Interfaces:**
- Consumes: `InteractiveTerminal`, `PasswordPolicy`, `PasswordHasher`, Prisma client.
- Produces: `CliUserRepository`, `CliUserService`, safe user audit helper, session-revoke helper.

- [ ] Write failing tests for duplicate email, audit rollback, safe audit JSON, active-session revoke count, no password/hash in output, no plaintext password in repository input, no password stored in service instance fields, and Buffer cleanup in success/failure paths.
- [ ] Run `npm exec vitest run tests/cli.admin-bootstrap.test.ts tests/cli.user-create.test.ts tests/cli.user-set-password.test.ts`.
- [ ] Expected RED: repository/service modules do not exist.
- [ ] Implement repository methods with explicit Prisma `select` and safe audit builders.
- [ ] Implement `revokeActiveUserSessions(tx, userId, now)` returning a count from `updateMany`.
- [ ] Use `Prisma.DbNull` for intentionally empty before/after JSON.
- [ ] Map unique email conflicts to `USER_EMAIL_CONFLICT`.
- [ ] Run the focused CLI service tests.
- [ ] PASS criteria: atomic audit rollback tests pass and no CLI command entry file exists yet.
- [ ] Rollback boundary: remove CLI repository/service and related tests.
- [ ] Out-of-scope: command scripts, HTTP routes, auth hardening.

### Task 3: First-Admin Bootstrap Command

**Files:**
- Create `backend/src/cli/admin-bootstrap.command.ts`.
- Modify `backend/package.json`.
- Extend `backend/tests/cli.admin-bootstrap.test.ts`.
- Create or extend `backend/tests/integration/cli-user-commands.test.ts`.

**Interfaces:**
- Consumes: `CliUserService.bootstrapFirstAdmin`, `InteractiveTerminal`, `PasswordHasher`.
- Produces: `npm run admin:bootstrap`.

- [ ] Write failing tests for active admin blocks, inactive admin blocks, editors do not block, duplicate email, non-TTY no mutation, concurrent bootstrap exactly one success, P2034 retry behavior, retry exhaustion, safe output, and compiled entry absence producing a safe CLI error.
- [ ] Run `npm exec vitest run tests/cli.admin-bootstrap.test.ts tests/integration/cli-user-commands.test.ts`.
- [ ] Expected RED: command entry and script are missing.
- [ ] Add package script `admin:bootstrap` exactly as `node dist/cli/admin-bootstrap.command.js`.
- [ ] Implement command env parsing, TTY check, prompts, hash outside transaction, exact confirmation, transaction, safe output, and disconnect.
- [ ] Use `runSerializableWithRetry` for race-safe bootstrap; retry only `P2034`, maximum five attempts.
- [ ] Run focused tests.
- [ ] PASS criteria: exactly one concurrent bootstrap can create an admin, repeat bootstrap is blocked by active or inactive admin, and production script points to `dist/cli/admin-bootstrap.command.js` without dev-only launchers.
- [ ] Rollback boundary: remove command file, script entry, and bootstrap-specific tests.
- [ ] Out-of-scope: HTTP user API, later user creation, password reset.

### Task 4: Subsequent User-Create Command

**Files:**
- Create `backend/src/cli/user-create.command.ts`.
- Modify `backend/package.json`.
- Extend `backend/tests/cli.user-create.test.ts`.
- Extend `backend/tests/integration/cli-user-commands.test.ts`.

**Interfaces:**
- Consumes: `CliUserService.createUser`, `InteractiveTerminal`, `PasswordHasher`.
- Produces: `npm run user:create`.

- [ ] Write failing tests for no active admin blocking, default editor, explicit admin confirmation, duplicate email, safe output, no sessions created, no automatic login, and compiled entry absence producing a safe CLI error.
- [ ] Run `npm exec vitest run tests/cli.user-create.test.ts tests/integration/cli-user-commands.test.ts`.
- [ ] Expected RED: command and script are missing.
- [ ] Add package script `user:create` exactly as `node dist/cli/user-create.command.js`.
- [ ] Implement visible email/role prompts, password prompts, validation, hash outside transaction, exact confirmation, atomic create + audit.
- [ ] Run focused tests.
- [ ] PASS criteria: editor default works, admin requires `CREATE ADMIN`, no sessions are created, audit uses `actorUserId=null`, and production script points to `dist/cli/user-create.command.js` without dev-only launchers.
- [ ] Rollback boundary: remove user-create command, script entry, and user-create-specific tests.
- [ ] Out-of-scope: HTTP user creation, activation links, temporary passwords.

### Task 5: CLI Password-Set Command

**Files:**
- Create `backend/src/cli/user-set-password.command.ts`.
- Modify `backend/package.json`.
- Extend `backend/tests/cli.user-set-password.test.ts`.
- Extend `backend/tests/integration/cli-user-commands.test.ts`.

**Interfaces:**
- Consumes: `CliUserService.setPassword`, `InteractiveTerminal`, `PasswordHasher`.
- Produces: `npm run user:set-password`.

- [ ] Write failing tests for missing user, disabled user stays disabled, sessions revoked, `lastLoginAt` unchanged, audit atomicity, no password/hash in audit/output, old access token invalidation after reset, and compiled entry absence producing a safe CLI error.
- [ ] Run `npm exec vitest run tests/cli.user-set-password.test.ts tests/integration/cli-user-commands.test.ts`.
- [ ] Expected RED: command and script are missing.
- [ ] Add package script `user:set-password` exactly as `node dist/cli/user-set-password.command.js`.
- [ ] Implement target email prompt, password prompt/confirmation, validation, hash outside transaction, confirmation, atomic password update + revoke + audit.
- [ ] Run focused tests.
- [ ] PASS criteria: password reset revokes all active sessions, invalidates old access tokens, does not enable disabled users, and production script points to `dist/cli/user-set-password.command.js` without dev-only launchers.
- [ ] Rollback boundary: remove password-set command, script entry, and password-set-specific tests.
- [ ] Out-of-scope: HTTP password endpoints and self-service password changes.

### Task 6: B6 RBAC Permissions And Admin User Read API

**Files:**
- Create `backend/src/modules/admin/users/user.types.ts`.
- Create `backend/src/modules/admin/users/user.schemas.ts`.
- Create `backend/src/modules/admin/users/user.mapper.ts`.
- Create `backend/src/modules/admin/users/user.repository.ts`.
- Create `backend/src/modules/admin/users/user.service.ts`.
- Create `backend/src/modules/admin/users/user.controller.ts`.
- Create `backend/src/modules/admin/users/user.routes.ts`.
- Modify `backend/src/modules/admin/rbac.types.ts`.
- Modify `backend/src/modules/admin/rbac.policy.ts`.
- Modify `backend/src/modules/admin/admin.routes.ts`.
- Modify `backend/src/server.ts`.
- Create `backend/tests/admin.user.validation.test.ts`.
- Create `backend/tests/admin.user.mapper.test.ts`.
- Create `backend/tests/admin.user.service.test.ts`.
- Create `backend/tests/integration/admin-users-api.test.ts`.

**Interfaces:**
- Consumes: B5 admin auth/cache/RBAC middleware and existing Prisma client.
- Produces: Admin User read/list API and B6 user permissions.

- [ ] Write failing tests for `user.read`, editor denial before lookup, strict list query validation, safe mapper, list rows+count, detail missing `USER_NOT_FOUND`, and no `passwordHash`/sessions in response.
- [ ] Run `npm exec vitest run tests/admin.user.validation.test.ts tests/admin.user.mapper.test.ts tests/admin.user.service.test.ts tests/integration/admin-users-api.test.ts`.
- [ ] Expected RED: users module and user permissions do not exist.
- [ ] Add user permissions to central policy; admin gets all; editor gets none.
- [ ] Implement user schemas, mapper, repository, service, controller, routes.
- [ ] Wire routes into aggregate admin router and server using existing Prisma client.
- [ ] Run focused tests.
- [ ] PASS criteria: `GET /api/admin/users` and `GET /api/admin/users/:id` are admin-only, safe, no-store, and do not leak target existence to editor.
- [ ] Rollback boundary: remove users module and tests; revert RBAC/admin route/server modifications.
- [ ] Out-of-scope: user mutations, CLI commands, auth hardening.

### Task 7: Role, Disable, Enable Lifecycle With Last-Admin Protection

**Files:**
- Modify `backend/src/modules/admin/users/user.schemas.ts`.
- Modify `backend/src/modules/admin/users/user.repository.ts`.
- Modify `backend/src/modules/admin/users/user.service.ts`.
- Modify `backend/src/modules/admin/users/user.controller.ts`.
- Modify `backend/src/modules/admin/users/user.routes.ts`.
- Modify `backend/src/lib/errors.ts`.
- Extend `backend/tests/admin.user.validation.test.ts`.
- Extend `backend/tests/admin.user.service.test.ts`.
- Extend `backend/tests/integration/admin-users-api.test.ts`.

**Interfaces:**
- Consumes: Admin User read module and RBAC user permissions.
- Produces: role change, disable, enable endpoints with session revocation and safe audit.

- [ ] Write failing tests for strict role body, same-role conflict, self-role change, self-disable, already disabled, already active, last active admin, concurrent last-admin operations, exact five-attempt `P2034` retry, non-`P2034` no-retry behavior, `CONCURRENT_MODIFICATION` on retry exhaustion, role change revokes sessions, disable revokes sessions, enable creates no session, and audit atomicity.
- [ ] Run focused admin user tests.
- [ ] Expected RED: mutation endpoints and error codes are missing.
- [ ] Add B6 error codes to `errors.ts`, including `CONCURRENT_MODIFICATION`.
- [ ] Implement repository transactions through `runSerializableWithRetry`, `Serializable` isolation, `MAX_SERIALIZABLE_ATTEMPTS=5`, and retry only for Prisma `P2034`.
- [ ] Implement safe audit entries `user.role_change`, `user.disable`, and `user.enable`.
- [ ] Implement routes with permission middleware before validation and lookup.
- [ ] Run focused tests.
- [ ] PASS criteria: user lifecycle endpoints are admin-only, atomic, race-safe, preserve at least one active admin, never leak raw Prisma retry details, and return safe `CONCURRENT_MODIFICATION` when five `P2034` attempts are exhausted.
- [ ] Rollback boundary: revert mutation files/tests and B6 error-code additions.
- [ ] Out-of-scope: user deletion, session-list API, password endpoints.

### Task 8: Immediate Access-Token Session Invalidation

**Files:**
- Modify `backend/src/modules/auth/auth.types.ts`.
- Modify `backend/src/modules/auth/auth.repository.ts`.
- Modify `backend/src/modules/auth/auth.service.ts`.
- Modify `backend/src/modules/auth/auth.middleware.ts` only if required by type changes.
- Create `backend/tests/auth.session-context.test.ts`.
- Extend `backend/tests/auth.service.test.ts`.
- Extend `backend/tests/auth.middleware.test.ts`.
- Extend `backend/tests/integration/auth-api.test.ts`.
- Create `backend/tests/integration/auth-session-invalidation.test.ts`.

**Interfaces:**
- Consumes: existing access token service and refresh-session schema.
- Produces: DB-backed `authenticateAccessToken` session-context validation.

- [ ] Write failing tests for login token valid after committed session, failed login no usable token, refreshed token valid with successor session id, predecessor token invalid after refresh, revoked session, expired session, missing session, session/user mismatch, stale role claim, disabled user, logout invalidates access token immediately, role change invalidates old access token, password reset invalidates old access token, re-enabled user requiring new login, and health/public catalog avoiding session DB checks.
- [ ] Run `npm exec vitest run tests/auth.session-context.test.ts tests/auth.service.test.ts tests/auth.middleware.test.ts tests/integration/auth-api.test.ts tests/integration/auth-session-invalidation.test.ts`.
- [ ] Expected RED: access-token auth does not load or verify refresh session context.
- [ ] Add `findSessionContext` to auth repository.
- [ ] Update `authenticateAccessToken` to verify current user, session ownership, `revokedAt`, `expiresAt`, active user, and role equality.
- [ ] Preserve JWT claims and cookie format.
- [ ] Run focused auth tests.
- [ ] PASS criteria: login JWT session id equals committed `RefreshSession.id`, refreshed JWT session id equals successor session id, predecessor tokens fail immediately after refresh, revoked/expired/missing/mismatched/stale tokens fail with safe auth errors, and normal login/refresh/logout/me still pass with approved hardening.
- [ ] Rollback boundary: revert auth type/repository/service/middleware changes and new auth hardening tests.
- [ ] Out-of-scope: JWT claim changes, refresh cookie changes, selective session revoke API.

### Task 9: App, Server, Scripts, And Regression Integration

**Files:**
- Modify `backend/package.json`.
- Modify `backend/src/server.ts`.
- Modify `backend/src/modules/admin/admin.routes.ts`.
- Create `backend/tests/cli.production-scripts.test.ts`.
- Extend `backend/tests/server.test.ts`.
- Extend `backend/tests/integration/admin-api.test.ts`.

**Interfaces:**
- Consumes: CLI command files, Admin User routes, auth hardening.
- Produces: complete B6 wiring without dependency or lockfile changes.

- [ ] Write failing tests that server wiring includes Admin User service/router, build emits `dist/cli/admin-bootstrap.command.js`, `dist/cli/user-create.command.js`, and `dist/cli/user-set-password.command.js`, package scripts point exactly to those compiled files, scripts do not contain `--import tsx`, `npx`, `npm exec`, or `ts-node`, and command entry imports do not start the HTTP server.
- [ ] Run `npm exec vitest run tests/cli.production-scripts.test.ts tests/server.test.ts tests/integration/admin-api.test.ts`.
- [ ] Expected RED: scripts and final server wiring are incomplete.
- [ ] Complete script entries as `node dist/cli/admin-bootstrap.command.js`, `node dist/cli/user-create.command.js`, and `node dist/cli/user-set-password.command.js`, then complete server/admin-router wiring.
- [ ] Verify `backend/package-lock.json` is unchanged.
- [ ] Verify `npm run build` creates the three compiled CLI entry files.
- [ ] Run focused tests.
- [ ] PASS criteria: scripts use only compiled `dist/cli` JavaScript, production CLI does not require dev-only TypeScript launchers, server wiring composes all B3-B6 modules with one Prisma client, and B5 endpoints still pass.
- [ ] Rollback boundary: revert package script and wiring changes.
- [ ] Out-of-scope: dependency install, package-lock changes, deploy.

### Task 10: Unit And PostgreSQL Integration Tests

**Files:**
- Modify or create only B6 test files listed in the file map.
- Modify `backend/tests/setup.ts` only if a failing B6 test proves env restoration needs a new B6-specific variable.

**Interfaces:**
- Consumes: all B6 modules.
- Produces: B6 regression coverage.

- [ ] Run all B6 focused tests:

```powershell
npm exec vitest run `
  tests/cli.password-policy.test.ts `
  tests/cli.interactive-terminal.test.ts `
  tests/cli.admin-bootstrap.test.ts `
  tests/cli.user-create.test.ts `
  tests/cli.user-set-password.test.ts `
  tests/cli.production-scripts.test.ts `
  tests/admin.user.validation.test.ts `
  tests/admin.user.mapper.test.ts `
  tests/admin.user.service.test.ts `
  tests/auth.session-context.test.ts `
  tests/integration/admin-users-api.test.ts `
  tests/integration/cli-user-commands.test.ts `
  tests/integration/auth-session-invalidation.test.ts
```

- [ ] Expected RED only before earlier task implementation; after Task 9 all tests must pass.
- [ ] Verify each integration test uses `TEST_DATABASE_URL`, `assertTestDatabaseUrl(...)`, fixture prefixes, and targeted cleanup.
- [ ] Verify no test outputs password, hash, token, cookie, session hash, or DB URL.
- [ ] PASS criteria: all B6 focused tests pass and existing B1-B5 tests remain runnable.
- [ ] Rollback boundary: remove B6 test files and any B6-specific setup changes.
- [ ] Out-of-scope: snapshot edits, schema edits, package changes.

### Task 11: Full B6 Checkpoint

**Files:**
- No new implementation files.
- Use only verification commands and Git inspection.

**Interfaces:**
- Consumes: complete B6 implementation.
- Produces: release-readiness evidence for owner review.

- [ ] Set portable runtime path in the current process only:

```powershell
$PortableRoot = "D:\WEB00_TOOLS\node-v22.23.1-win-x64"
$PortableNpm = Join-Path $PortableRoot "npm.cmd"
$env:PATH = "$PortableRoot;$env:PATH"
```

- [ ] Run `npm ci`.
- [ ] Run `npm run prisma:validate`.
- [ ] Run `npm run prisma:generate`.
- [ ] Run `npm run db:migrate:status`.
- [ ] Run `npm run seed:verify`.
- [ ] Run all B6 focused tests.
- [ ] Run `npm run test:run`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Verify `Test-Path dist/cli/admin-bootstrap.command.js`, `Test-Path dist/cli/user-create.command.js`, and `Test-Path dist/cli/user-set-password.command.js` all return `True`.
- [ ] Run `npm run check`.
- [ ] Run `npm audit --omit=dev --audit-level=high`.
- [ ] Run `npm audit --audit-level=high`.
- [ ] From repo root run `git diff --check`.
- [ ] From repo root run `git status --short`.
- [ ] From repo root run forbidden scope checks for package lock, schema, migrations, seed, public catalog, docs, assets, and `.github`.
- [ ] PASS criteria: at least 185 tests plus B6 tests pass; typecheck/build/check pass; migration status clean; snapshot `categories=7 sites=15`; high/critical audit findings are zero; package-lock/schema/migrations/seed/public catalog/frontend/assets/workflows are unchanged.
- [ ] Rollback boundary: revert B6 implementation files only.
- [ ] Out-of-scope: commit, push, PR, deploy.

## 23. Final verification checkpoint

Use portable Node 22.23.1:

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
& $PortableNpm run test:run
& $PortableNpm run typecheck
& $PortableNpm run build
Test-Path dist/cli/admin-bootstrap.command.js
Test-Path dist/cli/user-create.command.js
Test-Path dist/cli/user-set-password.command.js
& $PortableNpm run check
& $PortableNpm audit --omit=dev --audit-level=high
& $PortableNpm audit --audit-level=high
Set-Location D:\WEB00_BACKEND
git diff --check
git status --short
git diff --name-only -- backend/package-lock.json
git diff --name-only -- backend/prisma
git diff --name-only -- backend/prisma/seed.ts backend/prisma/seed-web00-data.ts backend/prisma/seed-data/web00-catalog.json
git diff --name-only -- backend/src/modules/public-catalog
git diff --name-only -- docs
git diff --name-only -- assets
git diff --name-only -- .github
```

Expected:

- dependencies unchanged;
- `package-lock.json` unchanged;
- `npm run build` creates `dist/cli/admin-bootstrap.command.js`, `dist/cli/user-create.command.js`, and `dist/cli/user-set-password.command.js`;
- schema/migrations/seed unchanged;
- public catalog unchanged;
- B5 sites/categories/audit behavior unchanged;
- B4 login/refresh/logout/me behavior preserved except approved immediate session invalidation;
- `.env`, generated Prisma client, `dist`, `node_modules`, and `coverage` absent from Git scope;
- staged area empty;
- no commit, push, PR, merge, or deploy.

## 24. Acceptance criteria

B6 is acceptable when:

- `admin:bootstrap` exists and can create exactly one first admin;
- `admin:bootstrap` script is exactly `node dist/cli/admin-bootstrap.command.js`;
- bootstrap is blocked by an active or inactive existing admin;
- editor users do not block first admin bootstrap;
- `user:create` creates editor by default and requires exact confirmation for admin;
- `user:create` script is exactly `node dist/cli/user-create.command.js`;
- `user:set-password` resets password locally, revokes sessions, and leaves disabled users disabled;
- `user:set-password` script is exactly `node dist/cli/user-set-password.command.js`;
- production CLI scripts do not require `tsx`, TypeScript compiler, `ts-node`, `npx`, or `npm exec`;
- no password crosses HTTP;
- every CLI-accepted password passes the existing B4 login parser unchanged;
- B6 does not change one side of password normalization;
- password blocklist: `NOT IMPLEMENTED`;
- password blocklist risk: documented;
- password blocklist status: production certification blocker, not a blocker for the current B6 engineering phase;
- B6 documents the missing full breached-password blocklist as not implemented and as a production certification blocker;
- B6 does not claim full NIST SP 800-63B compliance;
- B6 does not claim JavaScript string zeroization;
- implementation-created password Buffers are cleared in `finally`;
- Admin User API implements exactly the five approved endpoints;
- Admin User API never creates users, sets passwords, deletes users, lists sessions, or revokes selected sessions;
- editor has no user permissions;
- permission middleware runs before validation and lookup;
- self-disable and self-demotion are forbidden;
- last active admin is race-safe;
- serializable retry uses `MAX_SERIALIZABLE_ATTEMPTS=5` and retries only Prisma `P2034`;
- retry exhaustion returns safe `CONCURRENT_MODIFICATION`;
- role change and disable revoke all active sessions;
- enable creates no session;
- login access JWT session id matches committed `RefreshSession.id`;
- refresh access JWT session id matches successor `RefreshSession.id`;
- predecessor access token stops working immediately after refresh rotation;
- old access tokens stop working immediately after logout, password reset, role change, disable, explicit session revocation, stale role claim, or expired session;
- audit entries are atomic and safe;
- CLI audit uses `actorUserId=null` and `source="cli"`;
- no schema, migration, seed, dependency, package-lock, public catalog, frontend, assets, workflow, push, PR, merge, or deploy changes occur.

## 25. Rollback boundary

Rollback B6 by reverting only:

- `backend/src/cli/**`;
- `backend/src/modules/admin/users/**`;
- B6 additions in `backend/src/lib/errors.ts`;
- B6 additions in `backend/src/modules/admin/rbac.types.ts`;
- B6 additions in `backend/src/modules/admin/rbac.policy.ts`;
- B6 user-router wiring in `backend/src/modules/admin/admin.routes.ts`;
- B6 server wiring in `backend/src/server.ts`;
- B6 auth session-context hardening in `backend/src/modules/auth/auth.types.ts`, `auth.repository.ts`, `auth.service.ts`, and `auth.middleware.ts` if changed;
- B6 script additions in `backend/package.json`;
- B6 tests.

Rollback must not touch:

- `backend/package-lock.json`;
- `backend/prisma/schema.prisma`;
- migrations;
- seed files;
- generated Prisma client;
- B1-B5 unrelated modules;
- docs outside this B6 plan;
- frontend/assets/.github.

## 26. Risks, mitigations and blockers

| Risk | Mitigation |
| --- | --- |
| Password leaks through CLI output or tests | Inject terminal, never echo secret input, assert safe output does not contain password/hash/token/cookie/session hash/DB URL |
| Terminal raw mode remains enabled after failure | `try/finally`, raw `0x03` Ctrl+C handling, stdin single-consumer ownership, listener cleanup, EOF cleanup, idempotent close, SIGINT fallback, SIGTERM best-effort cleanup, and no impossible SIGKILL/power-loss promise |
| CLI accepts password login rejects | Validate both B6 code-point limits and existing B4 login parser/code-unit limit; test Unicode edge cases and avoid one-sided normalization |
| Plan overstates NIST compliance | State that B6 follows only parts of NIST guidance, does not implement full blocklist screening, and treats blocklist absence as production certification blocker |
| Plan overstates memory cleanup | State that JavaScript string zeroization is not guaranteed; limit references and zero implementation-created Buffers in `finally` |
| B6 creates a backdoor HTTP password flow | File map and acceptance criteria forbid password endpoints and HTTP user creation |
| Production CLI accidentally depends on dev tooling | Package scripts use `node dist/cli/*.command.js`; tests block `--import tsx`, `ts-node`, `npx`, and `npm exec`; build must emit all CLI entries |
| Last active admin race | `runSerializableWithRetry`, `Serializable` isolation, `MAX_SERIALIZABLE_ATTEMPTS=5`, retry only `P2034`, safe `CONCURRENT_MODIFICATION` on exhaustion |
| Access token remains valid after session revoke | Auth checks DB `RefreshSession` by JWT `sessionId` on every access-token authentication |
| Refresh successor session id regression | Tests require refreshed JWT to use successor `RefreshSession.id` and predecessor token to fail immediately |
| Role claim becomes stale after role change | Auth compares JWT role to DB user role and rejects mismatches |
| Audit loses attribution for CLI commands | CLI audit uses honest `actorUserId=null` plus `source="cli"` safe JSON |
| Password hash inside a transaction increases lock time | Hash outside transaction before user mutation |
| New dependency sneaks in | Package file checks and `package-lock.json` diff check block dependency changes |
| B0 legacy HTTP user password endpoints confuse scope | B6 selected Variant A supersedes that older shape for this phase; HTTP creation/password flows remain out of scope |
| Full breached-password screening is absent | Document as accepted B6/B9 risk until owner approves a data source and dependency strategy |

Blockers:

- Any need for a new Prisma field, relation, index, constraint, trigger, or migration blocks B6 implementation.
- Any need for a new dependency blocks B6 implementation.
- Any high or critical audit finding blocks B6 implementation.
- Any required password or database secret in command arguments, environment variables, files, logs, or chat output blocks B6 implementation.

Plan self-review markers:

- CLI-only user creation and password reset are explicit.
- HTTP password flow is excluded.
- Bootstrap repeat is blocked by active and inactive admins.
- Subsequent admin creation requires exact confirmation.
- Password does not travel through argv, env, logs, or output.
- Production scripts do not use `tsx`, `ts-node`, `npx`, or `npm exec`.
- Exact compiled CLI paths are `dist/cli/admin-bootstrap.command.js`, `dist/cli/user-create.command.js`, and `dist/cli/user-set-password.command.js`.
- Terminal restoration is a tested requirement.
- Raw Ctrl+C is handled as byte `0x03`.
- Visible readline and raw secret reader never consume stdin simultaneously.
- Terminal cleanup is not promised for `SIGKILL`, OS crash, or power loss.
- Every CLI-accepted password passes the existing B4 login parser unchanged.
- Unicode code-point/code-unit mismatch is covered by tests.
- B6 does not add one-sided password normalization.
- NIST blocklist gap is documented as not implemented and as a production certification blocker.
- Full NIST SP 800-63B compliance is not claimed.
- JavaScript string zeroization is not claimed.
- Implementation-created password Buffers are cleared in `finally`.
- CLI audit actor model uses `actorUserId=null`.
- Admin API cannot create users.
- User deletion is excluded.
- Self-disable and self-demotion are forbidden.
- Last-active-admin protection is race-safe.
- Serializable retry uses `MAX_SERIALIZABLE_ATTEMPTS=5` and retries only Prisma `P2034`.
- Retry exhaustion returns safe `CONCURRENT_MODIFICATION`.
- Role, disable, and password reset revoke sessions.
- Old access tokens become invalid immediately.
- Login access JWT uses the committed `RefreshSession.id`.
- Refresh access JWT uses the successor `RefreshSession.id`.
- Predecessor access token is invalid after refresh rotation.
- Enable creates no session.
- Audit is atomic.
- Schema and dependencies remain unchanged.
- Frontend and deploy are out of scope.
- Every ordered task includes files, interfaces, focused RED, expected RED reason, minimal GREEN, focused commands, PASS criteria, rollback boundary, and out-of-scope.
