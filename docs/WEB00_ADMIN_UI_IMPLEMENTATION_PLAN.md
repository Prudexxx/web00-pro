# WEB00 Admin UI Implementation Plan

> For agentic workers: use a task-by-task execution workflow.
> Every implementation task requires RED → minimal implementation
> → focused GREEN → bounded review checkpoint.

Goal:
реализовать backend-served `/admin` строго по утверждённому ТЗ.

Architecture:
Vanilla HTML/CSS/browser ES modules served by Express.
Assets копируются из `src/admin` в `dist/admin`.
Access token хранится только в памяти.
Refresh-cookie остаётся HttpOnly.

Tech stack:

- Node.js 22.23.1;
- TypeScript 5.9.x;
- Express 5;
- Helmet 8.3.0;
- Vitest;
- Supertest;
- browser-native ES modules;
- Node standard-library copy script.

## Global Constraints

- no React/Vue/Vite;
- no CDN;
- no inline scripts/styles/event handlers;
- no localStorage/sessionStorage tokens;
- no direct Supabase browser SDK;
- no schema/migration/seed changes;
- no public frontend changes;
- no GitHub Pages admin;
- no CRM/leads/support/payments/integrations;
- no HTTP user creation;
- no HTTP password changes;
- server RBAC authoritative;
- no silent multipart retry;
- one JSON replay maximum;
- all UI text Russian;
- no secrets in code, logs, DOM or tests.

## Execution Rules

Use a task-by-task workflow. Each task below has a RED test, a focused command that proves the failure, a minimal implementation outline, a focused GREEN command, a review scope gate, and a grouped commit boundary.

Do not start a later task before the current task's focused GREEN command passes and the scope gate is reviewed. Do not push, deploy, update PR #2, write production data, or start Task 17 actions during Tasks 1 through 16.

Run commands from `D:\WEB00_BACKEND\backend` unless a task explicitly names the repository root.

## Exact File Map

Modify:

- `backend/package.json`: add pinned `helmet@8.3.0` and update the `build` script to run the admin asset copy script after TypeScript compilation.
- `backend/package-lock.json`: lock the approved Helmet dependency and keep all unrelated dependency versions unchanged.
- `backend/src/app.ts`: accept an optional Admin UI router and mount it before `notFoundMiddleware`.
- `backend/src/server.ts`: create the Admin UI router with environment and Storage public-origin inputs, then pass it into `createApp`.

Create:

- `backend/scripts/copy-admin-assets.mjs`: deterministic Node standard-library asset copy, stale destination cleanup, path safety, and required-file verification.
- `backend/src/modules/admin-ui/admin-ui.routes.ts`: Express router for `/admin`, `/admin/`, and `/admin/assets/*`.
- `backend/src/modules/admin-ui/admin-ui-security.ts`: Helmet and CSP construction, cache-control, and security header helpers.
- `backend/src/modules/admin-ui/admin-ui-static.ts`: static-root resolution, file response helpers, dotfile denial, and controlled asset 404s.
- `backend/src/admin/index.html`: private Admin UI document with external CSS and module script only.
- `backend/src/admin/assets/admin.css`: responsive operational UI styles, focus states, tables/cards, dialogs, and no inline style dependency.
- `backend/src/admin/assets/main.js`: bootstraps auth, shell, routing, global notifications, and screen registration.
- `backend/src/admin/assets/api-client.js`: same-origin API client, Bearer injection, refresh handling, upload handling, abort support, and safe error parsing.
- `backend/src/admin/assets/auth-store.js`: memory-only auth token and state store with subscription lifecycle.
- `backend/src/admin/assets/dom.js`: safe DOM helpers, URL validation, live-region helpers, confirmation dialog foundation.
- `backend/src/admin/assets/forms.js`: schema-aligned serialization helpers, arrays, null handling, validation mapping.
- `backend/src/admin/assets/screens/login.js`: login view, refresh bootstrap states, Russian copy, keyboard/focus handling.
- `backend/src/admin/assets/screens/shell.js`: role-aware shell, navigation, session controls, screen host.
- `backend/src/admin/assets/screens/sites-list.js`: sites table/card list, filters, pagination, and action visibility.
- `backend/src/admin/assets/screens/site-editor.js`: site create/edit form using current schemas and role-specific fields.
- `backend/src/admin/assets/screens/image-manager.js`: preview and gallery upload/delete/reorder UI.
- `backend/src/admin/assets/screens/categories.js`: editor read-only and admin mutation category screen.
- `backend/src/admin/assets/screens/users.js`: admin-only user list/detail/role/disable/enable screen.
- `backend/src/admin/assets/screens/audit.js`: admin-only audit log list and filters.

Tests:

- `backend/tests/admin-ui.serving.test.ts`: Express routing for `/admin`, assets, missing assets, dotfile denial, and API non-interception.
- `backend/tests/admin-ui.security.test.ts`: Helmet/CSP/cache/security header expectations and secret non-exposure.
- `backend/tests/admin-ui.build.test.ts`: asset copy script stale cleanup, path safety, and required output checks.
- `backend/tests/admin-ui.contract.test.ts`: current API route constants, schemas, and unsupported route guard.
- `backend/tests/admin-ui.auth-client.test.mjs`: browser auth store and API client behavior under Vitest.
- `backend/tests/admin-ui.dom.test.mjs`: safe DOM, URL, confirmation, and live-region utilities.
- `backend/tests/admin-ui.forms.test.mjs`: form serialization, arrays, nulls, limits, and validation mapping.
- `backend/tests/admin-ui.roles.test.mjs`: editor/admin navigation and action visibility.

Each file has one responsibility. Do not add extra implementation files unless a task's review checkpoint records the exact need and owner approves the new file boundary.

## Interfaces

Backend Admin UI router:

```ts
export interface AdminUiRouterOptions {
  env: AppEnv;
  rootDir?: string;
  storagePublicOrigin: string | null;
}

export function createAdminUiRouter(options: AdminUiRouterOptions): Router;
```

Security helpers:

```ts
export interface AdminUiSecurityOptions {
  env: AppEnv;
  storagePublicOrigin: string | null;
}

export function createAdminUiSecurity(options: AdminUiSecurityOptions): RequestHandler[];
export function setAdminUiNoStore(response: Response): void;
```

Static helpers:

```ts
export interface AdminUiStaticOptions {
  rootDir?: string;
}

export function resolveAdminUiRoot(options?: AdminUiStaticOptions): string;
export function createAdminUiAssetHandler(rootDir: string): RequestHandler;
export function createAdminUiIndexHandler(rootDir: string): RequestHandler;
```

Browser auth store:

```js
export const AUTH_STATES = Object.freeze({
  BOOTSTRAPPING: "BOOTSTRAPPING",
  AUTHENTICATED: "AUTHENTICATED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  REFRESHING: "REFRESHING",
  LOGGING_OUT: "LOGGING_OUT"
});

export function createAuthStore();
```

Browser API client:

```js
export function createApiClient({ authStore, fetchImpl = fetch });
export function parseApiError(response, body);
export function isMultipartBody(body);
```

Safe DOM helpers:

```js
export function text(value);
export function el(tagName, options = {}, children = []);
export function clear(node);
export function setSafeUrl(anchor, rawUrl);
export function createLiveRegion(root);
export function createConfirmationDialog(root);
```

Form helpers:

```js
export function serializeSiteForm(form, role, mode);
export function serializeCategoryForm(form);
export function serializeGalleryMetadata(files, altByName);
export function mapValidationDetails(details);
```

Screen modules:

```js
export function renderLoginScreen(context);
export function renderShell(context);
export function renderSitesListScreen(context);
export function renderSiteEditorScreen(context, params);
export function renderImageManagerScreen(context, params);
export function renderCategoriesScreen(context);
export function renderUsersScreen(context);
export function renderAuditScreen(context);
```

## Current API Contracts

Auth:

```text
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
```

Sites:

```text
GET    /api/admin/sites
GET    /api/admin/sites/:id
POST   /api/admin/sites
PATCH  /api/admin/sites/:id
POST   /api/admin/sites/:id/publish
POST   /api/admin/sites/:id/unpublish
DELETE /api/admin/sites/:id
POST   /api/admin/sites/:id/restore
DELETE /api/admin/sites/:id/permanent
```

Images:

```text
PUT    /api/admin/sites/:id/images/preview
DELETE /api/admin/sites/:id/images/preview
POST   /api/admin/sites/:id/images/gallery
POST   /api/admin/sites/:id/images/gallery/batch
PATCH  /api/admin/sites/:id/images/gallery
DELETE /api/admin/sites/:id/images/gallery/:assetId
```

Categories:

```text
GET    /api/admin/categories
GET    /api/admin/categories/:id
POST   /api/admin/categories
PATCH  /api/admin/categories/:id
DELETE /api/admin/categories/:id
```

Users:

```text
GET   /api/admin/users
GET   /api/admin/users/:id
PATCH /api/admin/users/:id/role
POST  /api/admin/users/:id/disable
POST  /api/admin/users/:id/enable
```

Audit:

```text
GET /api/admin/audit-logs
```

## Task 1 — Helmet dependency and build asset copy

Wave: 1.

Exact files:

- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Create: `backend/scripts/copy-admin-assets.mjs`
- Create: `backend/tests/admin-ui.build.test.ts`

Interfaces consumed:

- Current `backend/package.json` build script: `npm run prisma:generate && tsc -p tsconfig.build.json`.
- Static source root: `backend/src/admin`.
- Static destination root: `backend/dist/admin`.

Interfaces produced:

- Script command: `node scripts/copy-admin-assets.mjs`.
- Exported testable script functions:

```js
export function resolveAssetRoots(baseUrl = import.meta.url);
export async function copyAdminAssets(options = {});
```

RED test with concrete test code:

```ts
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("admin UI asset build copy", () => {
  it("cleans stale dist files, copies required assets, and verifies index", async () => {
    const root = path.join(process.cwd(), ".tmp-admin-build-test");
    const source = path.join(root, "src", "admin");
    const destination = path.join(root, "dist", "admin");
    await rm(root, { force: true, recursive: true });
    await mkdir(path.join(source, "assets"), { recursive: true });
    await mkdir(path.join(destination, "assets"), { recursive: true });
    await writeFile(path.join(destination, "assets", "stale.js"), "stale");
    await writeFile(path.join(source, "index.html"), "<!doctype html>");
    await writeFile(path.join(source, "assets", "admin.css"), "body{margin:0}");
    await writeFile(path.join(source, "assets", "main.js"), "export {};");

    const module = await import("../scripts/copy-admin-assets.mjs");
    await module.copyAdminAssets({ destinationDir: destination, sourceDir: source });

    await expect(readFile(path.join(destination, "index.html"), "utf8")).resolves.toContain("<!doctype html>");
    await expect(readFile(path.join(destination, "assets", "admin.css"), "utf8")).resolves.toContain("body");
    await expect(readFile(path.join(destination, "assets", "main.js"), "utf8")).resolves.toContain("export");
    await expect(readFile(path.join(destination, "assets", "stale.js"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects destination roots outside dist", async () => {
    const module = await import("../scripts/copy-admin-assets.mjs");
    await expect(
      module.copyAdminAssets({
        destinationDir: path.join(process.cwd(), "src", "admin-copy"),
        sourceDir: path.join(process.cwd(), "src", "admin")
      })
    ).rejects.toThrow("Admin UI destination must stay inside dist.");
  });

  it("resolves roots from import.meta.url", async () => {
    const module = await import("../scripts/copy-admin-assets.mjs");
    const roots = module.resolveAssetRoots(pathToFileURL(path.join(process.cwd(), "scripts", "copy-admin-assets.mjs")).href);
    expect(roots.sourceDir.endsWith(path.join("src", "admin"))).toBe(true);
    expect(roots.destinationDir.endsWith(path.join("dist", "admin"))).toBe(true);
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.build.test.ts
```

Expected failure:

```text
Failed to load url ../scripts/copy-admin-assets.mjs
```

Minimal implementation with concrete code outline:

```js
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const requiredFiles = ["index.html", "assets/admin.css", "assets/main.js"];

export function resolveAssetRoots(baseUrl = import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(baseUrl));
  const backendRoot = path.resolve(scriptDir, "..");
  return {
    destinationDir: path.join(backendRoot, "dist", "admin"),
    sourceDir: path.join(backendRoot, "src", "admin")
  };
}

export async function copyAdminAssets(options = {}) {
  const roots = { ...resolveAssetRoots(), ...options };
  const distRoot = path.resolve(roots.destinationDir, "..");
  const destination = path.resolve(roots.destinationDir);
  if (!destination.startsWith(distRoot + path.sep)) {
    throw new Error("Admin UI destination must stay inside dist.");
  }
  await stat(roots.sourceDir);
  await rm(destination, { force: true, recursive: true });
  await mkdir(destination, { recursive: true });
  await cp(roots.sourceDir, destination, { recursive: true });
  for (const file of requiredFiles) {
    await stat(path.join(destination, file));
  }
  return { copied: await readdir(destination), destinationDir: destination };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await copyAdminAssets();
}
```

Package changes:

```json
"dependencies": {
  "helmet": "8.3.0"
},
"scripts": {
  "build": "npm run prisma:generate && tsc -p tsconfig.build.json && node scripts/copy-admin-assets.mjs"
}
```

Run `npm install helmet@8.3.0 --package-lock-only` only during this implementation task, because this is the isolated dependency and lockfile change approved by the plan.

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.build.test.ts
```

Expected PASS:

```text
3 passed
```

Scope gate:

- `git diff --name-only` contains only `backend/package.json`, `backend/package-lock.json`, `backend/scripts/copy-admin-assets.mjs`, and `backend/tests/admin-ui.build.test.ts`.
- `npm ls helmet` shows `helmet@8.3.0`.
- No runtime server file has changed in this task.

Commit boundary:

- Include this task in Wave 1 commit: `feat: serve secure WEB00 admin shell`.

## Task 2 — Admin UI static serving and headers

Wave: 1.

Exact files:

- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Create: `backend/src/modules/admin-ui/admin-ui.routes.ts`
- Create: `backend/src/modules/admin-ui/admin-ui-security.ts`
- Create: `backend/src/modules/admin-ui/admin-ui-static.ts`
- Create: `backend/src/admin/index.html`
- Create: `backend/src/admin/assets/admin.css`
- Create: `backend/src/admin/assets/main.js`
- Create: `backend/tests/admin-ui.serving.test.ts`
- Create: `backend/tests/admin-ui.security.test.ts`

Interfaces consumed:

- `createApp(options: CreateAppOptions): Express`.
- `StartServerOptions.storageConfig.publicBaseUrl`.
- Express 5 router/static behavior.
- Helmet 8.3.0.

Interfaces produced:

- `CreateAppOptions.adminUiRoutes?: Router`.
- `createAdminUiRouter(options: AdminUiRouterOptions): Router`.
- `/admin`, `/admin/`, `/admin/assets/*`.

RED test with concrete test code:

```ts
import path from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAdminUiRouter } from "../src/modules/admin-ui/admin-ui.routes.js";

const env = { NODE_ENV: "test", PORT: 0, SERVICE_NAME: "web00-test" } as const;

describe("admin UI serving", () => {
  it("serves /admin and /admin/ with no-store HTML", async () => {
    const app = createApp({
      env,
      adminUiRoutes: createAdminUiRouter({
        env,
        rootDir: path.join(process.cwd(), "src", "admin"),
        storagePublicOrigin: "https://storage.example.test"
      })
    });

    await request(app)
      .get("/admin")
      .expect("Cache-Control", "no-store")
      .expect("Content-Type", /html/)
      .expect(200);
    await request(app)
      .get("/admin/")
      .expect("Cache-Control", "no-store")
      .expect("Content-Type", /html/)
      .expect(200);
  });

  it("serves assets, denies dotfiles, and returns controlled missing asset 404", async () => {
    const app = createApp({
      env,
      adminUiRoutes: createAdminUiRouter({
        env,
        rootDir: path.join(process.cwd(), "src", "admin"),
        storagePublicOrigin: null
      })
    });

    await request(app).get("/admin/assets/main.js").expect("Cache-Control", "no-store").expect(200);
    const dotfile = await request(app).get("/admin/assets/.env").expect(404);
    const missing = await request(app).get("/admin/assets/missing.js").expect(404);
    expect(dotfile.body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(missing.body.error.message).toBe("Route not found.");
  });

  it("does not intercept API routes", async () => {
    const api = express.Router();
    api.get("/probe", (_request, response) => response.json({ data: "api" }));
    const app = createApp({
      env,
      adminRoutes: api,
      adminUiRoutes: createAdminUiRouter({
        env,
        rootDir: path.join(process.cwd(), "src", "admin"),
        storagePublicOrigin: null
      })
    });

    const response = await request(app).get("/api/admin/probe").expect(200);
    expect(response.body).toEqual({ data: "api" });
  });
});
```

Security RED test:

```ts
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAdminUiRouter } from "../src/modules/admin-ui/admin-ui.routes.js";

const env = { NODE_ENV: "production", PORT: 0, SERVICE_NAME: "web00-test" } as const;

describe("admin UI security headers", () => {
  it("sets strict CSP and security headers without leaking secrets", async () => {
    const app = createApp({
      env,
      adminUiRoutes: createAdminUiRouter({
        env,
        rootDir: path.join(process.cwd(), "src", "admin"),
        storagePublicOrigin: "https://storage.example.test"
      })
    });

    const response = await request(app).get("/admin").expect(200);
    const csp = response.headers["content-security-policy"];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("img-src 'self' data: blob: https://storage.example.test");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(JSON.stringify(response.headers)).not.toMatch(/token|cookie|secret|database/i);
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.serving.test.ts tests/admin-ui.security.test.ts
```

Expected failure:

```text
Cannot find module '../src/modules/admin-ui/admin-ui.routes.js'
```

Minimal implementation with concrete code outline:

```ts
// app.ts
export interface CreateAppOptions {
  adminUiRoutes?: Router;
}

if (options.adminUiRoutes) {
  app.use(options.adminUiRoutes);
}
app.use(notFoundMiddleware);
```

```ts
// admin-ui.routes.ts
export function createAdminUiRouter(options: AdminUiRouterOptions): Router {
  const router = Router();
  const rootDir = resolveAdminUiRoot({ rootDir: options.rootDir });
  router.use(createAdminUiSecurity({ env: options.env, storagePublicOrigin: options.storagePublicOrigin }));
  router.get(["/admin", "/admin/"], createAdminUiIndexHandler(rootDir));
  router.use("/admin/assets", createAdminUiAssetHandler(rootDir));
  return router;
}
```

```ts
// admin-ui-security.ts
export function createAdminUiSecurity(options: AdminUiSecurityOptions): RequestHandler[] {
  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          "default-src": ["'none'"],
          "script-src": ["'self'"],
          "script-src-attr": ["'none'"],
          "style-src": ["'self'"],
          "connect-src": ["'self'"],
          "img-src": ["'self'", "data:", "blob:", ...(options.storagePublicOrigin ? [options.storagePublicOrigin] : [])],
          "object-src": ["'none'"],
          "base-uri": ["'none'"],
          "form-action": ["'self'"],
          "frame-ancestors": ["'none'"],
          ...(options.env.NODE_ENV === "production" ? { "upgrade-insecure-requests": [] } : {})
        }
      },
      crossOriginEmbedderPolicy: false,
      frameguard: { action: "deny" },
      hidePoweredBy: true,
      hsts: options.env.NODE_ENV === "production" ? undefined : false,
      noSniff: true,
      referrerPolicy: { policy: "no-referrer" },
      xPoweredBy: false
    }),
    (_request, response, next) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), accelerometer=(), gyroscope=(), magnetometer=()");
      next();
    }
  ];
}
```

```ts
// admin-ui-static.ts
const staticOptions = { dotfiles: "deny" as const, etag: false, index: false, maxAge: 0 };
```

`server.ts` creates the router with `storageConfig.publicBaseUrl` parsed to an origin and passes it to `createApp`.

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.serving.test.ts tests/admin-ui.security.test.ts
```

Expected PASS:

```text
all admin UI serving and security tests pass
```

Scope gate:

- `/api/admin/*` tests still hit API routers.
- `index.html` has external `<link rel="stylesheet" href="/admin/assets/admin.css">` and `<script type="module" src="/admin/assets/main.js"></script>`.
- No inline scripts, styles, or event handlers exist in `backend/src/admin/index.html`.

Commit boundary:

- Include this task in Wave 1 commit: `feat: serve secure WEB00 admin shell`.

## Task 3 — Browser auth store

Wave: 2.

Exact files:

- Create: `backend/src/admin/assets/auth-store.js`
- Create: `backend/tests/admin-ui.auth-client.test.mjs`

Interfaces consumed:

- Browser module runtime.
- Auth states from the design spec.

Interfaces produced:

- `AUTH_STATES`.
- `createAuthStore()`.
- Store methods: `getSnapshot`, `subscribe`, `setBootstrapping`, `setAuthenticated`, `setRefreshing`, `setUnauthenticated`, `setLoggingOut`, `clear`.

RED test with concrete test code:

```js
import { describe, expect, it, vi } from "vitest";
import { AUTH_STATES, createAuthStore } from "../src/admin/assets/auth-store.js";

describe("admin auth store", () => {
  it("keeps the access token in memory and not in browser persistence APIs", () => {
    const originalLocal = globalThis.localStorage;
    const originalSession = globalThis.sessionStorage;
    const localStorage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    const sessionStorage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: sessionStorage });

    const store = createAuthStore();
    store.setAuthenticated({ accessToken: "access-token", user: { email: "a@b.test", role: "admin" } });

    expect(store.getSnapshot()).toEqual({
      accessToken: "access-token",
      state: AUTH_STATES.AUTHENTICATED,
      user: { email: "a@b.test", role: "admin" }
    });
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();

    store.clear();
    expect(store.getSnapshot().accessToken).toBeNull();
    expect(store.getSnapshot().state).toBe(AUTH_STATES.UNAUTHENTICATED);

    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocal });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: originalSession });
  });

  it("subscribes, unsubscribes, and emits state changes", () => {
    const store = createAuthStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setBootstrapping();
    store.setRefreshing();
    unsubscribe();
    store.setLoggingOut();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][0].state).toBe(AUTH_STATES.BOOTSTRAPPING);
    expect(listener.mock.calls[1][0].state).toBe(AUTH_STATES.REFRESHING);
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.auth-client.test.mjs
```

Expected failure:

```text
Cannot find module '../src/admin/assets/auth-store.js'
```

Minimal implementation with concrete code outline:

```js
export const AUTH_STATES = Object.freeze({
  BOOTSTRAPPING: "BOOTSTRAPPING",
  AUTHENTICATED: "AUTHENTICATED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  REFRESHING: "REFRESHING",
  LOGGING_OUT: "LOGGING_OUT"
});

export function createAuthStore() {
  let snapshot = { accessToken: null, state: AUTH_STATES.UNAUTHENTICATED, user: null };
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener({ ...snapshot }));
  return {
    getSnapshot: () => ({ ...snapshot }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setBootstrapping() { snapshot = { ...snapshot, state: AUTH_STATES.BOOTSTRAPPING }; emit(); },
    setRefreshing() { snapshot = { ...snapshot, state: AUTH_STATES.REFRESHING }; emit(); },
    setLoggingOut() { snapshot = { ...snapshot, state: AUTH_STATES.LOGGING_OUT }; emit(); },
    setUnauthenticated() { snapshot = { accessToken: null, state: AUTH_STATES.UNAUTHENTICATED, user: null }; emit(); },
    setAuthenticated({ accessToken, user }) { snapshot = { accessToken, state: AUTH_STATES.AUTHENTICATED, user }; emit(); },
    clear() { snapshot = { accessToken: null, state: AUTH_STATES.UNAUTHENTICATED, user: null }; emit(); }
  };
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.auth-client.test.mjs
```

Expected PASS:

```text
admin auth store tests pass
```

Scope gate:

- `rg -n "localStorage|sessionStorage|indexedDB|caches" src/admin` returns no matches except test files.
- Access token is not written to DOM.

Commit boundary:

- Include this task in Wave 2 commit: `feat: add WEB00 admin authentication shell`.

## Task 4 — API client and single-flight refresh

Wave: 2.

Exact files:

- Create: `backend/src/admin/assets/api-client.js`
- Modify: `backend/tests/admin-ui.auth-client.test.mjs`

Interfaces consumed:

- `createAuthStore()` from `auth-store.js`.
- Current auth endpoints.
- Backend error envelope `{ error: { code, message, details, requestId } }`.

Interfaces produced:

- `createApiClient({ authStore, fetchImpl })`.
- `api.get`, `api.postJson`, `api.patchJson`, `api.deleteJson`, `api.upload`.
- `parseApiError(response, body)`.
- `isMultipartBody(body)`.

RED test with concrete test code:

```js
import { describe, expect, it, vi } from "vitest";
import { createApiClient, parseApiError } from "../src/admin/assets/api-client.js";
import { createAuthStore } from "../src/admin/assets/auth-store.js";

function jsonResponse(status, body) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  }));
}

describe("admin API client", () => {
  it("injects Bearer token and uses same-origin relative URLs", async () => {
    const authStore = createAuthStore();
    authStore.setAuthenticated({ accessToken: "token-a", user: { role: "admin" } });
    const fetchImpl = vi.fn().mockReturnValue(jsonResponse(200, { data: [] }));
    const api = createApiClient({ authStore, fetchImpl });

    await api.get("/api/admin/sites?limit=20");

    expect(fetchImpl).toHaveBeenCalledWith("/api/admin/sites?limit=20", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token-a" })
    }));
  });

  it("uses one shared refresh and replays a JSON request once", async () => {
    const authStore = createAuthStore();
    authStore.setAuthenticated({ accessToken: "old", user: { role: "admin" } });
    const fetchImpl = vi
      .fn()
      .mockReturnValueOnce(jsonResponse(401, { error: { code: "REFRESH_REQUIRED", message: "Refresh required.", requestId: "req1" } }))
      .mockReturnValueOnce(jsonResponse(401, { error: { code: "REFRESH_REQUIRED", message: "Refresh required.", requestId: "req2" } }))
      .mockReturnValueOnce(jsonResponse(200, { data: { accessToken: "new" } }))
      .mockReturnValueOnce(jsonResponse(200, { data: [{ id: "1" }] }))
      .mockReturnValueOnce(jsonResponse(200, { data: [{ id: "2" }] }));
    const api = createApiClient({ authStore, fetchImpl });

    const [left, right] = await Promise.all([
      api.get("/api/admin/sites"),
      api.get("/api/admin/categories")
    ]);

    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
    expect(left.data).toEqual([{ id: "1" }]);
    expect(right.data).toEqual([{ id: "2" }]);
    expect(authStore.getSnapshot().accessToken).toBe("new");
  });

  it("does not replay multipart uploads after auth failure", async () => {
    const authStore = createAuthStore();
    authStore.setAuthenticated({ accessToken: "old", user: { role: "admin" } });
    const formData = new FormData();
    formData.append("clientFileId", "00000000-0000-4000-8000-000000000001");
    const fetchImpl = vi.fn().mockReturnValue(jsonResponse(401, { error: { code: "REFRESH_REQUIRED", message: "Refresh required.", requestId: "req" } }));
    const api = createApiClient({ authStore, fetchImpl });

    await expect(api.upload("/api/admin/sites/00000000-0000-4000-8000-000000000002/images/preview", { body: formData, method: "PUT" })).rejects.toMatchObject({ code: "REFRESH_REQUIRED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("parses safe backend error envelopes", () => {
    const error = parseApiError({ status: 400 }, {
      error: {
        code: "VALIDATION_ERROR",
        details: [{ message: "Required", path: "title" }],
        message: "Invalid request.",
        requestId: "req_validation"
      }
    });
    expect(error).toMatchObject({ code: "VALIDATION_ERROR", requestId: "req_validation", status: 400 });
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.auth-client.test.mjs
```

Expected failure:

```text
Cannot find module '../src/admin/assets/api-client.js'
```

Minimal implementation with concrete code outline:

```js
export function createApiClient({ authStore, fetchImpl = fetch }) {
  let refreshPromise = null;
  async function refresh() {
    refreshPromise ??= fetchImpl("/api/auth/refresh", { credentials: "same-origin", method: "POST" })
      .then(readJson)
      .then((body) => {
        authStore.setAuthenticated({ accessToken: body.data.accessToken, user: authStore.getSnapshot().user });
        return body.data.accessToken;
      })
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  async function requestJson(path, options = {}, replayed = false) {
    assertRelativeApiPath(path);
    const token = authStore.getSnapshot().accessToken;
    const response = await fetchImpl(path, withJsonHeaders(options, token));
    const body = await readJson(response);
    if (isRefreshable(response, body) && !replayed) {
      await refresh();
      return requestJson(path, options, true);
    }
    if (!response.ok) throw parseApiError(response, body);
    return body;
  }
  return {
    get: (path, options) => requestJson(path, { ...options, method: "GET" }),
    postJson: (path, body, options) => requestJson(path, { ...options, body: JSON.stringify(body), method: "POST" }),
    patchJson: (path, body, options) => requestJson(path, { ...options, body: JSON.stringify(body), method: "PATCH" }),
    deleteJson: (path, options) => requestJson(path, { ...options, method: "DELETE" }),
    upload: async (path, options) => {
      assertRelativeApiPath(path);
      const response = await fetchImpl(path, withAuthOnly(options, authStore.getSnapshot().accessToken));
      const body = await readJson(response);
      if (!response.ok) throw parseApiError(response, body);
      return body;
    }
  };
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.auth-client.test.mjs
```

Expected PASS:

```text
admin API client tests pass
```

Scope gate:

- `rg -n "Content-Type.*multipart|multipart.*Content-Type" src/admin` returns no matches.
- `rg -n "https?://" src/admin/assets/api-client.js` returns no matches.
- Abort signal is passed through request options.

Commit boundary:

- Include this task in Wave 2 commit: `feat: add WEB00 admin authentication shell`.

## Task 5 — Login and authenticated shell

Wave: 2.

Exact files:

- Modify: `backend/src/admin/index.html`
- Modify: `backend/src/admin/assets/admin.css`
- Modify: `backend/src/admin/assets/main.js`
- Create: `backend/src/admin/assets/screens/login.js`
- Create: `backend/src/admin/assets/screens/shell.js`
- Modify: `backend/tests/admin-ui.roles.test.mjs`

Interfaces consumed:

- `createAuthStore()`.
- `createApiClient()`.
- `POST /api/auth/refresh`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.
- Role permissions from current RBAC model.

Interfaces produced:

- `renderLoginScreen(context)`.
- `renderShell(context)`.
- `bootstrapAdminApp({ root, fetchImpl })`.

RED test with concrete test code:

```js
import { describe, expect, it, vi } from "vitest";
import { createAuthStore } from "../src/admin/assets/auth-store.js";
import { renderLoginScreen } from "../src/admin/assets/screens/login.js";
import { renderShell } from "../src/admin/assets/screens/shell.js";

describe("admin login and shell", () => {
  it("renders Russian login copy and submits credentials", async () => {
    const root = document.createElement("main");
    const api = { login: vi.fn().mockResolvedValue({ data: { accessToken: "token" } }), me: vi.fn().mockResolvedValue({ data: { email: "admin@example.test", role: "admin" } }) };
    renderLoginScreen({ api, authStore: createAuthStore(), root });

    expect(root.textContent).toContain("Вход");
    root.querySelector("[name=email]").value = "admin@example.test";
    root.querySelector("[name=password]").value = "secret";
    root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(api.login).toHaveBeenCalledWith({ email: "admin@example.test", password: "secret" });
  });

  it("hides admin-only navigation for editors and keeps logout reachable", () => {
    const root = document.createElement("main");
    renderShell({
      authStore: createAuthStore(),
      onNavigate: vi.fn(),
      onLogout: vi.fn(),
      root,
      user: { email: "editor@example.test", role: "editor" }
    });

    expect(root.textContent).toContain("Сайты");
    expect(root.textContent).toContain("Категории");
    expect(root.textContent).toContain("Выйти");
    expect(root.textContent).not.toContain("Пользователи");
    expect(root.textContent).not.toContain("Журнал");
  });

  it("shows admin navigation for admins", () => {
    const root = document.createElement("main");
    renderShell({
      authStore: createAuthStore(),
      onNavigate: vi.fn(),
      onLogout: vi.fn(),
      root,
      user: { email: "admin@example.test", role: "admin" }
    });
    expect(root.textContent).toContain("Пользователи");
    expect(root.textContent).toContain("Журнал");
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.roles.test.mjs
```

Expected failure:

```text
Cannot find module '../src/admin/assets/screens/login.js'
```

Minimal implementation with concrete code outline:

```js
// main.js
import { createApiClient } from "./api-client.js";
import { createAuthStore } from "./auth-store.js";
import { renderLoginScreen } from "./screens/login.js";
import { renderShell } from "./screens/shell.js";

export async function bootstrapAdminApp({ root = document.querySelector("#admin-root"), fetchImpl = fetch } = {}) {
  const authStore = createAuthStore();
  const api = createApiClient({ authStore, fetchImpl });
  authStore.setBootstrapping();
  try {
    const refreshed = await api.refreshSession();
    authStore.setAuthenticated({ accessToken: refreshed.data.accessToken, user: null });
    const me = await api.get("/api/auth/me");
    authStore.setAuthenticated({ accessToken: authStore.getSnapshot().accessToken, user: me.data });
    renderShell({ api, authStore, root, user: me.data });
  } catch {
    authStore.setUnauthenticated();
    renderLoginScreen({ api, authStore, root });
  }
}
```

```js
// login.js
export function renderLoginScreen({ api, authStore, root }) {
  const form = el("form", {}, [
    el("h1", {}, ["Вход"]),
    el("label", {}, ["Email", el("input", { name: "email", type: "email", autocomplete: "username" })]),
    el("label", {}, ["Пароль", el("input", { name: "password", type: "password", autocomplete: "current-password" })]),
    el("button", { type: "submit" }, ["Войти"])
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const login = await api.login({ email: data.email, password: data.password });
    authStore.setAuthenticated({ accessToken: login.data.accessToken, user: null });
    const me = await api.get("/api/auth/me");
    authStore.setAuthenticated({ accessToken: login.data.accessToken, user: me.data });
  });
  root.replaceChildren(form);
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.roles.test.mjs tests/admin-ui.auth-client.test.mjs
```

Expected PASS:

```text
login, shell, and auth client tests pass
```

Scope gate:

- `backend/src/admin/index.html` contains no inline script/style/event attributes.
- Every visible label introduced in this task is Russian except email field name.
- Logout clears state before network completion.

Commit boundary:

- Include this task in Wave 2 commit: `feat: add WEB00 admin authentication shell`.

## Task 6 — Safe DOM and form utilities

Wave: 3.

Exact files:

- Create: `backend/src/admin/assets/dom.js`
- Create: `backend/src/admin/assets/forms.js`
- Create: `backend/tests/admin-ui.dom.test.mjs`
- Create: `backend/tests/admin-ui.forms.test.mjs`

Interfaces consumed:

- Browser DOM.
- Current site/category/image schemas.
- Backend validation details shape `{ message, path }`.

Interfaces produced:

- Safe element/render helpers.
- URL validation helper.
- Array editor serialization helper.
- Null serialization helpers.
- Confirmation dialog foundation.
- `aria-live` notification helper.

RED test with concrete test code:

```js
import { describe, expect, it } from "vitest";
import { el, setSafeUrl, text } from "../src/admin/assets/dom.js";
import { mapValidationDetails, serializeSiteForm } from "../src/admin/assets/forms.js";

describe("safe DOM utilities", () => {
  it("renders untrusted content through text nodes", () => {
    const node = el("p", {}, [text("<img src=x onerror=alert(1)>")]);
    expect(node.innerHTML).toBe("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("rejects unsafe URL protocols", () => {
    const anchor = document.createElement("a");
    expect(() => setSafeUrl(anchor, "javascript:alert(1)")).toThrow("Unsupported URL protocol.");
    setSafeUrl(anchor, "https://web00.example.test");
    expect(anchor.href).toBe("https://web00.example.test/");
    expect(anchor.rel).toBe("noopener noreferrer");
  });
});

describe("admin form utilities", () => {
  it("serializes site fields using current schema limits and null rules", () => {
    const form = document.createElement("form");
    form.innerHTML = `
      <input name="title" value="Site">
      <input name="slug" value="My Site">
      <input name="categoryId" value="00000000-0000-4000-8000-000000000001">
      <textarea name="shortDescription">Short</textarea>
      <textarea name="fullDescription"></textarea>
      <input name="features" value="One">
      <input name="features" value="Two">
      <input name="featured" value="true">
    `;

    expect(serializeSiteForm(form, "editor", "create")).toEqual({
      categoryId: "00000000-0000-4000-8000-000000000001",
      features: ["One", "Two"],
      fullDescription: null,
      shortDescription: "Short",
      slug: "my-site",
      title: "Site"
    });
    expect(serializeSiteForm(form, "admin", "update")).toMatchObject({ featured: true, slug: "my-site" });
  });

  it("maps validation details by field path", () => {
    expect(mapValidationDetails([{ message: "Required", path: "title" }])).toEqual({
      title: ["Required"]
    });
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.dom.test.mjs tests/admin-ui.forms.test.mjs
```

Expected failure:

```text
Cannot find module '../src/admin/assets/dom.js'
```

Minimal implementation with concrete code outline:

```js
export function text(value) {
  return document.createTextNode(String(value ?? ""));
}

export function el(tagName, attributes = {}, children = []) {
  const node = document.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    if (name.startsWith("on")) throw new Error("Event attributes are not allowed.");
    if (name === "className") node.className = value;
    else if (value !== undefined && value !== null) node.setAttribute(name, String(value));
  }
  node.append(...children.map((child) => typeof child === "string" ? text(child) : child));
  return node;
}

export function setSafeUrl(anchor, rawUrl) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported URL protocol.");
  anchor.href = url.href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
}
```

```js
const nullableTextFields = new Set(["deliveryLabel", "demoMode", "fullDescription", "legacyTitle", "previewType", "priceLabel"]);
const arrayFields = new Map([["features", { maxItems: 30, maxLength: 160 }], ["tags", { maxItems: 30, maxLength: 80 }]]);

export function serializeSiteForm(form, role, mode) {
  const data = new FormData(form);
  const output = {};
  // read required fields, normalize slug, convert empty nullable strings to null, collect arrays, and omit admin-only fields for editors
  return output;
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.dom.test.mjs tests/admin-ui.forms.test.mjs
```

Expected PASS:

```text
safe DOM and form tests pass
```

Scope gate:

- `rg -n "innerHTML|outerHTML|insertAdjacentHTML|eval\\(|new Function|document.write" src/admin` returns no matches outside tests.
- Form serializers use the current limits from this plan and do not invent fields.

Commit boundary:

- Include this task in Wave 3 commit: `feat: add WEB00 site administration`.

## Task 7 — Sites list

Wave: 3.

Exact files:

- Create: `backend/src/admin/assets/screens/sites-list.js`
- Modify: `backend/src/admin/assets/admin.css`
- Modify: `backend/tests/admin-ui.contract.test.ts`
- Modify: `backend/tests/admin-ui.roles.test.mjs`

Interfaces consumed:

- `api.get("/api/admin/sites?...")`.
- Site list query keys: `search`, `status`, `category`, `active`, `featured`, `deleted`, `sort`, `direction`, `page`, `limit`.
- Safe DOM helpers.

Interfaces produced:

- `renderSitesListScreen(context)`.
- Query builder for current site list filters.

RED test with concrete test code:

```ts
import { describe, expect, it } from "vitest";
import { buildSiteListQuery, SITE_LIST_QUERY_KEYS } from "../src/admin/assets/screens/sites-list.js";

describe("admin sites list contract", () => {
  it("uses the current site query keys only", () => {
    expect(SITE_LIST_QUERY_KEYS).toEqual([
      "active",
      "category",
      "deleted",
      "direction",
      "featured",
      "limit",
      "page",
      "search",
      "sort",
      "status"
    ]);
  });

  it("builds a current backend query string", () => {
    expect(buildSiteListQuery({
      active: true,
      category: "00000000-0000-4000-8000-000000000001",
      deleted: "without",
      direction: "asc",
      featured: false,
      limit: 20,
      page: 2,
      search: "crm",
      sort: "title",
      status: "draft"
    })).toBe("active=true&category=00000000-0000-4000-8000-000000000001&deleted=without&direction=asc&featured=false&limit=20&page=2&search=crm&sort=title&status=draft");
  });
});
```

Role RED test:

```js
import { describe, expect, it, vi } from "vitest";
import { renderSitesListScreen } from "../src/admin/assets/screens/sites-list.js";

describe("sites list role visibility", () => {
  it("shows editor-safe actions and hides admin-only lifecycle actions", async () => {
    const root = document.createElement("main");
    const api = { get: vi.fn().mockResolvedValue({ data: [{ id: "s1", title: "Site", status: "draft", deletedAt: null, category: { title: "Cat" } }], meta: { page: 1, totalPages: 1 } }) };
    await renderSitesListScreen({ api, root, user: { role: "editor" } });
    expect(root.textContent).toContain("Сайты");
    expect(root.textContent).toContain("Редактировать");
    expect(root.textContent).not.toContain("Опубликовать");
    expect(root.textContent).not.toContain("Удалить навсегда");
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.roles.test.mjs
```

Expected failure:

```text
Cannot find module '../src/admin/assets/screens/sites-list.js'
```

Minimal implementation with concrete code outline:

```js
export const SITE_LIST_QUERY_KEYS = ["active", "category", "deleted", "direction", "featured", "limit", "page", "search", "sort", "status"];

export function buildSiteListQuery(filters) {
  const params = new URLSearchParams();
  for (const key of SITE_LIST_QUERY_KEYS) {
    if (filters[key] !== undefined && filters[key] !== "") params.set(key, String(filters[key]));
  }
  return params.toString();
}

export async function renderSitesListScreen({ api, root, user }) {
  const result = await api.get(`/api/admin/sites?${buildSiteListQuery({ limit: 20, page: 1 })}`);
  const rows = result.data.map((site) => renderSiteRow(site, user));
  root.replaceChildren(el("section", {}, [el("h1", {}, ["Сайты"]), ...rows]));
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.roles.test.mjs
```

Expected PASS:

```text
sites list contract and role tests pass
```

Scope gate:

- No user, category, audit, or image mutation code is introduced.
- Query keys match `backend/src/modules/admin/sites/site.schemas.ts`.
- Editor does not see publish, unpublish, soft delete, restore, permanent delete, or featured controls.

Commit boundary:

- Include this task in Wave 3 commit: `feat: add WEB00 site administration`.

## Task 8 — Site create/edit

Wave: 3.

Exact files:

- Create: `backend/src/admin/assets/screens/site-editor.js`
- Modify: `backend/src/admin/assets/forms.js`
- Modify: `backend/src/admin/assets/admin.css`
- Modify: `backend/tests/admin-ui.forms.test.mjs`
- Modify: `backend/tests/admin-ui.roles.test.mjs`

Interfaces consumed:

- `POST /api/admin/sites`.
- `PATCH /api/admin/sites/:id`.
- `GET /api/admin/sites/:id`.
- `GET /api/admin/categories`.
- Site Zod schema field limits.

Interfaces produced:

- `renderSiteEditorScreen(context, params)`.
- `SITE_MUTABLE_FIELDS`.
- `ADMIN_ONLY_SITE_UPDATE_FIELDS`.

RED test with concrete test code:

```js
import { describe, expect, it, vi } from "vitest";
import { ADMIN_ONLY_SITE_UPDATE_FIELDS, SITE_MUTABLE_FIELDS, renderSiteEditorScreen } from "../src/admin/assets/screens/site-editor.js";

describe("site editor", () => {
  it("uses current schema fields and admin-only update fields", () => {
    expect(SITE_MUTABLE_FIELDS).toEqual([
      "categoryId",
      "deliveryLabel",
      "demoLocalUrl",
      "demoMode",
      "demoUrl",
      "developmentDays",
      "externalDemoUrl",
      "features",
      "fullDescription",
      "legacyTitle",
      "originalDemoUrl",
      "previewType",
      "priceAmountCents",
      "priceLabel",
      "shortDescription",
      "siteUrl",
      "sortOrder",
      "tags",
      "title"
    ]);
    expect(ADMIN_ONLY_SITE_UPDATE_FIELDS).toEqual(["featured", "slug"]);
  });

  it("omits protected admin-only fields for editors", async () => {
    const root = document.createElement("main");
    const api = {
      get: vi.fn().mockResolvedValue({ data: { categoryId: "00000000-0000-4000-8000-000000000001", shortDescription: "Short", slug: "site", title: "Site" } })
    };
    await renderSiteEditorScreen({ api, root, user: { role: "editor" } }, { id: "s1" });
    expect(root.querySelector("[name=featured]")).toBeNull();
    expect(root.querySelector("[name=slug]")).toBeNull();
    expect(root.textContent).toContain("Название");
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.forms.test.mjs tests/admin-ui.roles.test.mjs
```

Expected failure:

```text
Cannot find module '../src/admin/assets/screens/site-editor.js'
```

Minimal implementation with concrete code outline:

```js
export const SITE_MUTABLE_FIELDS = [
  "categoryId", "deliveryLabel", "demoLocalUrl", "demoMode", "demoUrl",
  "developmentDays", "externalDemoUrl", "features", "fullDescription",
  "legacyTitle", "originalDemoUrl", "previewType", "priceAmountCents",
  "priceLabel", "shortDescription", "siteUrl", "sortOrder", "tags", "title"
];
export const ADMIN_ONLY_SITE_UPDATE_FIELDS = ["featured", "slug"];

export async function renderSiteEditorScreen({ api, root, user }, params = {}) {
  const [site, categories] = await Promise.all([
    params.id ? api.get(`/api/admin/sites/${params.id}`) : Promise.resolve({ data: null }),
    api.get("/api/admin/categories?limit=100")
  ]);
  const form = buildSiteForm({ categories: categories.data, mode: params.id ? "update" : "create", site: site.data, user });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = serializeSiteForm(form, user.role, params.id ? "update" : "create");
    if (params.id) await api.patchJson(`/api/admin/sites/${params.id}`, payload);
    else await api.postJson("/api/admin/sites", payload);
  });
  root.replaceChildren(form);
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.forms.test.mjs tests/admin-ui.roles.test.mjs
```

Expected PASS:

```text
site editor form and role tests pass
```

Scope gate:

- Fields match `backend/src/modules/admin/sites/site.schemas.ts`.
- Editor update does not submit `featured` or `slug`.
- Create requires `slug`; update allows admin `slug`.

Commit boundary:

- Include this task in Wave 3 commit: `feat: add WEB00 site administration`.

## Task 9 — Site lifecycle

Wave: 4.

Exact files:

- Modify: `backend/src/admin/assets/screens/sites-list.js`
- Modify: `backend/src/admin/assets/screens/site-editor.js`
- Modify: `backend/src/admin/assets/dom.js`
- Modify: `backend/tests/admin-ui.contract.test.ts`
- Modify: `backend/tests/admin-ui.roles.test.mjs`

Interfaces consumed:

- Current lifecycle routes from site router.
- Confirmation dialog foundation from `dom.js`.

Interfaces produced:

- `SITE_LIFECYCLE_ACTIONS`.
- `runSiteLifecycleAction({ api, action, site })`.

RED test with concrete test code:

```ts
import { describe, expect, it, vi } from "vitest";
import { SITE_LIFECYCLE_ACTIONS, runSiteLifecycleAction } from "../src/admin/assets/screens/sites-list.js";

describe("site lifecycle actions", () => {
  it("uses current backend method and path contracts", () => {
    expect(SITE_LIFECYCLE_ACTIONS).toEqual({
      permanentDelete: { method: "DELETE", path: "/api/admin/sites/:id/permanent" },
      publish: { method: "POST", path: "/api/admin/sites/:id/publish" },
      restore: { method: "POST", path: "/api/admin/sites/:id/restore" },
      softDelete: { method: "DELETE", path: "/api/admin/sites/:id" },
      unpublish: { method: "POST", path: "/api/admin/sites/:id/unpublish" }
    });
  });

  it("runs lifecycle action and refreshes after success", async () => {
    const api = { deleteJson: vi.fn().mockResolvedValue({ data: null }), postJson: vi.fn(), get: vi.fn() };
    await runSiteLifecycleAction({ api, action: "permanentDelete", site: { id: "00000000-0000-4000-8000-000000000001", slug: "site" } });
    expect(api.deleteJson).toHaveBeenCalledWith("/api/admin/sites/00000000-0000-4000-8000-000000000001/permanent");
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.roles.test.mjs
```

Expected failure:

```text
SITE_LIFECYCLE_ACTIONS is not exported
```

Minimal implementation with concrete code outline:

```js
export const SITE_LIFECYCLE_ACTIONS = Object.freeze({
  publish: { method: "POST", path: "/api/admin/sites/:id/publish" },
  unpublish: { method: "POST", path: "/api/admin/sites/:id/unpublish" },
  softDelete: { method: "DELETE", path: "/api/admin/sites/:id" },
  restore: { method: "POST", path: "/api/admin/sites/:id/restore" },
  permanentDelete: { method: "DELETE", path: "/api/admin/sites/:id/permanent" }
});

export async function runSiteLifecycleAction({ api, action, site }) {
  const contract = SITE_LIFECYCLE_ACTIONS[action];
  const path = contract.path.replace(":id", site.id);
  if (contract.method === "DELETE") return api.deleteJson(path);
  return api.postJson(path, {});
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.roles.test.mjs
```

Expected PASS:

```text
site lifecycle contract tests pass
```

Scope gate:

- Every lifecycle action is behind confirmation.
- Permanent delete uses typed visible site identity before sending the request.
- No lifecycle action appears for editors.

Commit boundary:

- Include this task in Wave 4 commit: `feat: add WEB00 site lifecycle and images`.

## Task 10 — Preview and gallery manager

Wave: 4.

Exact files:

- Create: `backend/src/admin/assets/screens/image-manager.js`
- Modify: `backend/src/admin/assets/api-client.js`
- Modify: `backend/src/admin/assets/forms.js`
- Modify: `backend/src/admin/assets/admin.css`
- Modify: `backend/tests/admin-ui.contract.test.ts`
- Modify: `backend/tests/admin-ui.forms.test.mjs`
- Modify: `backend/tests/admin-ui.auth-client.test.mjs`

Interfaces consumed:

- Preview routes.
- Gallery routes.
- Multipart fields and limits.
- API client upload method with no automatic replay.

Interfaces produced:

- `IMAGE_ROUTES`.
- `createSingleImageFormData({ file, clientFileId, alt })`.
- `createBatchImageFormData({ files, metadata })`.
- `renderImageManagerScreen(context, params)`.

RED test with concrete test code:

```js
import { describe, expect, it, vi } from "vitest";
import { IMAGE_ROUTES, createBatchImageFormData, createSingleImageFormData } from "../src/admin/assets/screens/image-manager.js";

describe("image manager contract", () => {
  it("uses current image routes only", () => {
    expect(IMAGE_ROUTES).toEqual({
      deleteGallery: "/api/admin/sites/:id/images/gallery/:assetId",
      deletePreview: "/api/admin/sites/:id/images/preview",
      galleryBatch: "/api/admin/sites/:id/images/gallery/batch",
      gallerySingle: "/api/admin/sites/:id/images/gallery",
      preview: "/api/admin/sites/:id/images/preview",
      reorderGallery: "/api/admin/sites/:id/images/gallery"
    });
  });

  it("creates single upload FormData with current fields", () => {
    const file = new File(["a"], "preview.png", { type: "image/png" });
    const data = createSingleImageFormData({ alt: "Alt", clientFileId: "00000000-0000-4000-8000-000000000001", file });
    expect(data.get("image")).toBe(file);
    expect(data.get("clientFileId")).toBe("00000000-0000-4000-8000-000000000001");
    expect(data.get("alt")).toBe("Alt");
  });

  it("creates batch FormData with images and metadata", () => {
    const file = new File(["a"], "gallery.webp", { type: "image/webp" });
    const data = createBatchImageFormData({
      files: [file],
      metadata: [{ alt: "Alt", clientFileId: "00000000-0000-4000-8000-000000000001" }]
    });
    expect(data.getAll("images")).toEqual([file]);
    expect(JSON.parse(data.get("metadata"))).toEqual([{ alt: "Alt", clientFileId: "00000000-0000-4000-8000-000000000001" }]);
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.forms.test.mjs tests/admin-ui.auth-client.test.mjs
```

Expected failure:

```text
Cannot find module '../src/admin/assets/screens/image-manager.js'
```

Minimal implementation with concrete code outline:

```js
export const IMAGE_ROUTES = Object.freeze({
  preview: "/api/admin/sites/:id/images/preview",
  deletePreview: "/api/admin/sites/:id/images/preview",
  gallerySingle: "/api/admin/sites/:id/images/gallery",
  galleryBatch: "/api/admin/sites/:id/images/gallery/batch",
  reorderGallery: "/api/admin/sites/:id/images/gallery",
  deleteGallery: "/api/admin/sites/:id/images/gallery/:assetId"
});

export function createSingleImageFormData({ file, clientFileId, alt }) {
  const data = new FormData();
  data.append("image", file);
  data.append("clientFileId", clientFileId);
  if (alt) data.append("alt", alt);
  return data;
}

export function createBatchImageFormData({ files, metadata }) {
  const data = new FormData();
  data.append("metadata", JSON.stringify(metadata));
  for (const file of files) data.append("images", file);
  return data;
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.forms.test.mjs tests/admin-ui.auth-client.test.mjs
```

Expected PASS:

```text
image manager contract and form tests pass
```

Scope gate:

- No manual multipart `Content-Type`.
- UUID is generated once per explicit user attempt.
- Gallery final count shows max 20.
- Source file guidance shows 5 MiB per file, 10 files per batch, and 30 MiB raw batch total.
- Partial batch results render per file.

Commit boundary:

- Include this task in Wave 4 commit: `feat: add WEB00 site lifecycle and images`.

## Task 11 — Categories

Wave: 5.

Exact files:

- Create: `backend/src/admin/assets/screens/categories.js`
- Modify: `backend/src/admin/assets/forms.js`
- Modify: `backend/src/admin/assets/admin.css`
- Modify: `backend/tests/admin-ui.contract.test.ts`
- Modify: `backend/tests/admin-ui.forms.test.mjs`
- Modify: `backend/tests/admin-ui.roles.test.mjs`

Interfaces consumed:

- `GET /api/admin/categories`.
- `GET /api/admin/categories/:id`.
- `POST /api/admin/categories`.
- `PATCH /api/admin/categories/:id`.
- `DELETE /api/admin/categories/:id`.
- Category schemas.

Interfaces produced:

- `CATEGORY_QUERY_KEYS`.
- `CATEGORY_MUTATION_FIELDS`.
- `renderCategoriesScreen(context)`.

RED test with concrete test code:

```js
import { describe, expect, it, vi } from "vitest";
import { CATEGORY_MUTATION_FIELDS, CATEGORY_QUERY_KEYS, renderCategoriesScreen } from "../src/admin/assets/screens/categories.js";

describe("categories screen", () => {
  it("uses current category schemas", () => {
    expect(CATEGORY_QUERY_KEYS).toEqual(["active", "includeCounts", "limit", "page", "search"]);
    expect(CATEGORY_MUTATION_FIELDS).toEqual(["active", "description", "sortOrder", "title", "slug"]);
  });

  it("renders editor categories as read-only", async () => {
    const root = document.createElement("main");
    const api = { get: vi.fn().mockResolvedValue({ data: [{ id: "c1", title: "Category", slug: "category" }], meta: { page: 1, totalPages: 1 } }) };
    await renderCategoriesScreen({ api, root, user: { role: "editor" } });
    expect(root.textContent).toContain("Категории");
    expect(root.textContent).not.toContain("Создать");
    expect(root.textContent).not.toContain("Удалить");
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.forms.test.mjs tests/admin-ui.roles.test.mjs
```

Expected failure:

```text
Cannot find module '../src/admin/assets/screens/categories.js'
```

Minimal implementation with concrete code outline:

```js
export const CATEGORY_QUERY_KEYS = ["active", "includeCounts", "limit", "page", "search"];
export const CATEGORY_MUTATION_FIELDS = ["active", "description", "sortOrder", "title", "slug"];

export async function renderCategoriesScreen({ api, root, user }) {
  const response = await api.get("/api/admin/categories?includeCounts=true&limit=50&page=1");
  const controls = user.role === "admin" ? renderCategoryAdminControls({ api }) : [];
  root.replaceChildren(el("section", {}, [el("h1", {}, ["Категории"]), ...controls, renderCategoryList(response.data, user)]));
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.forms.test.mjs tests/admin-ui.roles.test.mjs
```

Expected PASS:

```text
category screen tests pass
```

Scope gate:

- Editors cannot see category create, update, or delete controls.
- Category delete handles `CATEGORY_IN_USE` as a controlled form-level error.
- No site lifecycle or user logic is added in this task.

Commit boundary:

- Include this task in Wave 5 commit: `feat: add WEB00 categories users and audit`.

## Task 12 — Users

Wave: 5.

Exact files:

- Create: `backend/src/admin/assets/screens/users.js`
- Modify: `backend/src/admin/assets/admin.css`
- Modify: `backend/tests/admin-ui.contract.test.ts`
- Modify: `backend/tests/admin-ui.roles.test.mjs`

Interfaces consumed:

- `GET /api/admin/users`.
- `GET /api/admin/users/:id`.
- `PATCH /api/admin/users/:id/role`.
- `POST /api/admin/users/:id/disable`.
- `POST /api/admin/users/:id/enable`.
- User schemas.

Interfaces produced:

- `USER_QUERY_KEYS`.
- `USER_ACTIONS`.
- `renderUsersScreen(context)`.

RED test with concrete test code:

```js
import { describe, expect, it, vi } from "vitest";
import { USER_ACTIONS, USER_QUERY_KEYS, renderUsersScreen } from "../src/admin/assets/screens/users.js";

describe("users screen", () => {
  it("uses lifecycle-only user API contracts", () => {
    expect(USER_QUERY_KEYS).toEqual(["active", "direction", "limit", "page", "role", "search", "sort"]);
    expect(USER_ACTIONS).toEqual({
      detail: { method: "GET", path: "/api/admin/users/:id" },
      disable: { method: "POST", path: "/api/admin/users/:id/disable" },
      enable: { method: "POST", path: "/api/admin/users/:id/enable" },
      list: { method: "GET", path: "/api/admin/users" },
      role: { method: "PATCH", path: "/api/admin/users/:id/role" }
    });
  });

  it("renders only for admins", async () => {
    const root = document.createElement("main");
    await renderUsersScreen({ api: { get: vi.fn() }, root, user: { role: "editor" } });
    expect(root.textContent).toContain("Недостаточно прав");
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.roles.test.mjs
```

Expected failure:

```text
Cannot find module '../src/admin/assets/screens/users.js'
```

Minimal implementation with concrete code outline:

```js
export const USER_QUERY_KEYS = ["active", "direction", "limit", "page", "role", "search", "sort"];
export const USER_ACTIONS = Object.freeze({
  list: { method: "GET", path: "/api/admin/users" },
  detail: { method: "GET", path: "/api/admin/users/:id" },
  role: { method: "PATCH", path: "/api/admin/users/:id/role" },
  disable: { method: "POST", path: "/api/admin/users/:id/disable" },
  enable: { method: "POST", path: "/api/admin/users/:id/enable" }
});

export async function renderUsersScreen({ api, root, user }) {
  if (user.role !== "admin") {
    root.replaceChildren(el("section", {}, [el("h1", {}, ["Недостаточно прав"])]));
    return;
  }
  const response = await api.get("/api/admin/users?limit=50&page=1");
  root.replaceChildren(renderUserList(response.data));
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.roles.test.mjs
```

Expected PASS:

```text
users lifecycle-only tests pass
```

Scope gate:

- No create, credential, delete, or session-control UI is introduced.
- Role change body is exactly `{ role: "admin" | "editor" }`.
- Self-protection errors render as controlled errors.

Commit boundary:

- Include this task in Wave 5 commit: `feat: add WEB00 categories users and audit`.

## Task 13 — Audit logs

Wave: 5.

Exact files:

- Create: `backend/src/admin/assets/screens/audit.js`
- Modify: `backend/src/admin/assets/admin.css`
- Modify: `backend/tests/admin-ui.contract.test.ts`
- Modify: `backend/tests/admin-ui.roles.test.mjs`

Interfaces consumed:

- `GET /api/admin/audit-logs`.
- Audit query schema.
- Safe DOM helpers.

Interfaces produced:

- `AUDIT_QUERY_KEYS`.
- `renderAuditScreen(context)`.

RED test with concrete test code:

```js
import { describe, expect, it, vi } from "vitest";
import { AUDIT_QUERY_KEYS, renderAuditScreen } from "../src/admin/assets/screens/audit.js";

describe("audit logs screen", () => {
  it("uses current audit query keys", () => {
    expect(AUDIT_QUERY_KEYS).toEqual([
      "action",
      "actorUserId",
      "entityId",
      "entityType",
      "from",
      "limit",
      "page",
      "sort",
      "to"
    ]);
  });

  it("renders audit logs as read-only for admins", async () => {
    const root = document.createElement("main");
    const api = { get: vi.fn().mockResolvedValue({ data: [{ action: "site.publish", entityType: "site", requestId: "req_1" }], meta: { page: 1, totalPages: 1 } }) };
    await renderAuditScreen({ api, root, user: { role: "admin" } });
    expect(root.textContent).toContain("Журнал");
    expect(root.textContent).toContain("site.publish");
    expect(root.querySelector("form[data-mutation]")).toBeNull();
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.roles.test.mjs
```

Expected failure:

```text
Cannot find module '../src/admin/assets/screens/audit.js'
```

Minimal implementation with concrete code outline:

```js
export const AUDIT_QUERY_KEYS = ["action", "actorUserId", "entityId", "entityType", "from", "limit", "page", "sort", "to"];

export async function renderAuditScreen({ api, root, user }) {
  if (user.role !== "admin") {
    root.replaceChildren(el("section", {}, [el("h1", {}, ["Недостаточно прав"])]));
    return;
  }
  const response = await api.get("/api/admin/audit-logs?limit=50&page=1&sort=newest");
  root.replaceChildren(renderAuditTable(response.data));
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.roles.test.mjs
```

Expected PASS:

```text
audit screen tests pass
```

Scope gate:

- Audit data is read-only.
- Entity type options are `auth`, `category`, `site`, `upload`, and `user`.
- Date filters serialize as ISO datetimes.

Commit boundary:

- Include this task in Wave 5 commit: `feat: add WEB00 categories users and audit`.

## Task 14 — Responsive and accessibility

Wave: 6.

Exact files:

- Modify: `backend/src/admin/assets/admin.css`
- Modify: `backend/src/admin/assets/dom.js`
- Modify: all screen modules as needed for labels, focus, Escape, and live-region integration.
- Modify: `backend/tests/admin-ui.dom.test.mjs`
- Modify: `backend/tests/admin-ui.roles.test.mjs`

Interfaces consumed:

- All screen render functions.
- Confirmation dialog foundation.
- Live-region helper.

Interfaces produced:

- Mobile table-to-card CSS contract.
- Modal focus behavior.
- Escape close behavior.
- Focus restoration behavior.
- Long value wrapping/copy affordances.

RED test with concrete test code:

```js
import { describe, expect, it, vi } from "vitest";
import { createConfirmationDialog, createLiveRegion } from "../src/admin/assets/dom.js";

describe("admin accessibility utilities", () => {
  it("announces messages through aria-live", () => {
    const root = document.createElement("div");
    const live = createLiveRegion(root);
    live.announce("Сохранено");
    expect(root.querySelector("[aria-live=polite]").textContent).toBe("Сохранено");
  });

  it("restores focus after closing a confirmation dialog with Escape", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    const dialog = createConfirmationDialog(root);
    dialog.open({ confirmText: "Удалить", message: "Подтвердите действие", returnFocusTo: button });
    expect(document.activeElement.closest("[role=dialog]")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.activeElement).toBe(button);
    root.remove();
    button.remove();
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.dom.test.mjs tests/admin-ui.roles.test.mjs
```

Expected failure:

```text
createConfirmationDialog is not exported
```

Minimal implementation with concrete code outline:

```js
export function createLiveRegion(root) {
  const node = el("div", { "aria-live": "polite", className: "admin-live-region" });
  root.prepend(node);
  return { announce(message) { node.textContent = message; } };
}

export function createConfirmationDialog(root) {
  let returnFocusTo = null;
  function close() {
    root.querySelector("[role=dialog]")?.remove();
    returnFocusTo?.focus();
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  return {
    open({ confirmText, message, returnFocusTo: focusTarget }) {
      returnFocusTo = focusTarget;
      const dialog = el("section", { role: "dialog", "aria-modal": "true" }, [el("p", {}, [message]), el("button", {}, [confirmText])]);
      root.append(dialog);
      dialog.querySelector("button").focus();
    },
    close
  };
}
```

CSS outline:

```css
@media (max-width: 720px) {
  .admin-table {
    display: block;
  }
  .admin-table tr {
    display: grid;
    gap: 8px;
  }
  .admin-shell {
    grid-template-columns: 1fr;
  }
}

.admin-breakable {
  overflow-wrap: anywhere;
}

:focus-visible {
  outline: 3px solid #0b6bcb;
  outline-offset: 2px;
}
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.dom.test.mjs tests/admin-ui.roles.test.mjs
```

Expected PASS:

```text
responsive and accessibility utility tests pass
```

Scope gate:

- Desktop, tablet, and mobile browser checks are scheduled for Task 16.
- No page-level horizontal scrolling by CSS inspection and browser check.
- Dialogs restore focus and Escape closes non-submitted modals.
- Long URLs, emails, slugs, and request ids use wrapping or copy affordances.

Commit boundary:

- Include this task in Wave 6 commit: `fix: harden WEB00 admin UI acceptance`.

## Task 15 — Security and contract audit

Wave: 6.

Exact files:

- Modify: `backend/tests/admin-ui.contract.test.ts`
- Modify: `backend/tests/admin-ui.security.test.ts`

Interfaces consumed:

- Entire `backend/src/admin` static source tree.
- Current route constants exported by screen modules.
- Global constraints from this plan.

Interfaces produced:

- Automated source scans for unsafe DOM APIs, token persistence, inline handlers, direct browser storage SDK usage, unsupported routes, and public bug-report UI text.

RED test with concrete test code:

```ts
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function readAdminFiles(dir = path.join(process.cwd(), "src", "admin")): Promise<Array<{ file: string; text: string }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{ file: string; text: string }> = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await readAdminFiles(full));
    if (entry.isFile() && /\.(html|css|js)$/.test(entry.name)) {
      files.push({ file: full, text: await readFile(full, "utf8") });
    }
  }
  return files;
}

describe("admin UI security source audit", () => {
  it("does not use unsafe DOM APIs or token persistence APIs", async () => {
    const files = await readAdminFiles();
    const forbidden = /\b(innerHTML|outerHTML|insertAdjacentHTML|eval|Function|document\.write|localStorage|sessionStorage|indexedDB|caches)\b/;
    const hits = files.flatMap(({ file, text }) => forbidden.test(text) ? [file] : []);
    expect(hits).toEqual([]);
  });

  it("does not use inline handlers or direct browser storage SDK imports", async () => {
    const files = await readAdminFiles();
    const text = files.map((file) => file.text).join("\n");
    expect(text).not.toMatch(/\son[a-z]+=/i);
    expect(text).not.toMatch(/@supabase\/supabase-js/);
  });

  it("uses only approved admin API route roots", async () => {
    const files = await readAdminFiles();
    const text = files.map((file) => file.text).join("\n");
    const routes = [...text.matchAll(/["'`]\/api\/admin\/[^"'`]+["'`]/g)].map((match) => match[0].slice(1, -1));
    const allowed = [
      "/api/admin/sites",
      "/api/admin/sites/:id",
      "/api/admin/sites/:id/publish",
      "/api/admin/sites/:id/unpublish",
      "/api/admin/sites/:id/restore",
      "/api/admin/sites/:id/permanent",
      "/api/admin/sites/:id/images/preview",
      "/api/admin/sites/:id/images/gallery",
      "/api/admin/sites/:id/images/gallery/batch",
      "/api/admin/sites/:id/images/gallery/:assetId",
      "/api/admin/categories",
      "/api/admin/categories/:id",
      "/api/admin/users",
      "/api/admin/users/:id",
      "/api/admin/users/:id/role",
      "/api/admin/users/:id/disable",
      "/api/admin/users/:id/enable",
      "/api/admin/audit-logs"
    ];
    expect(routes.every((route) => allowed.includes(route))).toBe(true);
  });

  it("does not expose public bug-report UI text", async () => {
    const files = await readAdminFiles();
    const text = files.map((file) => file.text).join("\n").toLowerCase();
    expect(text).not.toMatch(/bug report|report a bug|сообщить об ошибке|баг-репорт/);
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.security.test.ts
```

Expected failure:

```text
expected unsafe source audit tests to find the current missing or incomplete audit helpers
```

Minimal implementation with concrete code outline:

- Move route string definitions into exported constants in each screen module.
- Remove any unsafe DOM API added during earlier tasks.
- Replace any unsafe rendering with `textContent`, `text()`, or `el()`.
- Keep direct storage access out of browser modules.
- Keep bug-report public wording out of Admin UI copy.

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm test -- --run tests/admin-ui.contract.test.ts tests/admin-ui.security.test.ts
```

Expected PASS:

```text
security and contract audit tests pass
```

Scope gate:

- Automated scans cover `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `Function`, `document.write`, inline handlers, `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, direct Supabase browser SDK imports, unsupported routes, and public bug-report UI text.
- The scan itself does not read env or secret files.

Commit boundary:

- Include this task in Wave 6 commit: `fix: harden WEB00 admin UI acceptance`.

## Task 16 — Full local acceptance

Wave: 6.

Exact files:

- Modify: Admin UI tests only if acceptance exposes a local issue.
- No new product files unless a failed acceptance gate proves a defect in existing Admin UI implementation files.

Interfaces consumed:

- All Admin UI tasks.
- Existing backend `npm run check`.
- Browser test harness chosen by the implementer.

Interfaces produced:

- Final local acceptance evidence for owner review.

RED test with concrete test code:

```ts
import { describe, expect, it } from "vitest";

describe("admin UI final local acceptance inventory", () => {
  it("lists the required final commands for the owner evidence packet", () => {
    expect([
      "npm run check",
      "npm test -- --run tests/admin-ui.build.test.ts tests/admin-ui.serving.test.ts tests/admin-ui.security.test.ts tests/admin-ui.contract.test.ts tests/admin-ui.auth-client.test.mjs tests/admin-ui.dom.test.mjs tests/admin-ui.forms.test.mjs tests/admin-ui.roles.test.mjs",
      "browser desktop admin UI smoke",
      "browser tablet admin UI smoke",
      "browser mobile admin UI smoke",
      "git diff --check"
    ]).toHaveLength(6);
  });
});
```

Exact command:

```powershell
cd D:\WEB00_BACKEND\backend
npm run check
npm test -- --run tests/admin-ui.build.test.ts tests/admin-ui.serving.test.ts tests/admin-ui.security.test.ts tests/admin-ui.contract.test.ts tests/admin-ui.auth-client.test.mjs tests/admin-ui.dom.test.mjs tests/admin-ui.forms.test.mjs tests/admin-ui.roles.test.mjs
```

Expected failure before all implementation tasks are complete:

```text
one or more Admin UI tests fail or build cannot verify admin assets
```

Minimal implementation with concrete code outline:

- Fix only failing acceptance defects inside the files listed in the exact file map.
- Do not add new API, schema, migration, seed, public frontend, deploy, or production changes.
- Record browser acceptance evidence for desktop, tablet, and mobile:

```text
desktop: /admin login, editor flow, admin flow, console errors 0, failed resources 0
tablet: /admin navigation, table-to-card, dialogs, console errors 0, failed resources 0
mobile: /admin login, navigation, forms, dialogs, no horizontal page scroll, console errors 0, failed resources 0
```

Focused GREEN command:

```powershell
cd D:\WEB00_BACKEND\backend
npm run check
npm test -- --run tests/admin-ui.build.test.ts tests/admin-ui.serving.test.ts tests/admin-ui.security.test.ts tests/admin-ui.contract.test.ts tests/admin-ui.auth-client.test.mjs tests/admin-ui.dom.test.mjs tests/admin-ui.forms.test.mjs tests/admin-ui.roles.test.mjs
cd D:\WEB00_BACKEND
git diff --check
git diff --name-only
```

Expected PASS:

```text
npm run check exits 0
all Admin UI focused tests exit 0
desktop/tablet/mobile browser smoke reports console errors 0 and failed resources 0
git diff --check exits 0
diff contains no public frontend, schema, migration, or seed files
```

Scope gate:

- No production writes during this task.
- No push or deploy.
- No PR #2 update.
- Owner real mobile recheck remains required later.

Commit boundary:

- Include this task in Wave 6 commit: `fix: harden WEB00 admin UI acceptance`.

## Task 17 — Integration and production release plan

Wave: 7.

This task is a future plan only. Do not execute it during implementation Tasks 1 through 16.

Exact files:

- No files changed by this planning task unless owner requests release notes after local acceptance.

Interfaces consumed:

- Locally accepted `feat/web00-backend-admin-ui`.
- `feat/web00-backend-production`.
- `release/web00-production-live`.
- PR #2.
- Owner approval.

Interfaces produced:

- Owner-approved integration sequence.

RED test with concrete test code:

```text
Manual gate:
Confirm owner approval message explicitly authorizes integration, one Render deploy, one temporary production lifecycle, cleanup, baseline restoration, owner real mobile check, release branch refresh, and PR #2 update.
```

Exact command:

```powershell
cd D:\WEB00_BACKEND
git status --short
git branch --show-current
git rev-parse HEAD
```

Expected failure without owner approval:

```text
BLOCKED: owner approval for integration and production acceptance is absent.
```

Minimal implementation with concrete release outline after approval:

```text
1. Verify local Admin UI branch is clean and accepted.
2. Merge Admin UI branch into feat/web00-backend-production.
3. Run npm run check from backend.
4. Deploy exactly one approved Render backend revision.
5. Execute one temporary production lifecycle.
6. Clean temporary data.
7. Restore baseline public behavior.
8. Perform owner real mobile check.
9. Merge backend production into release/web00-production-live.
10. Refresh PR #2.
```

Focused GREEN command after owner approval:

```powershell
cd D:\WEB00_BACKEND\backend
npm run check
```

Expected PASS after owner-approved release work:

```text
local check passes, production lifecycle evidence is recorded, temporary data is cleaned, PR #2 reflects the accepted release branch
```

Scope gate:

- This task remains blocked until explicit owner approval.
- Do not update PR #2 before production acceptance.
- Do not merge to `main` separately.

Commit boundary:

- No commit is created by this plan task.

## Test Trigger Matrix

| Change type | Focused tests | Full npm check required? | Browser smoke required? | Production probe allowed? |
| --- | --- | --- | --- | --- |
| Package or build script | `tests/admin-ui.build.test.ts` | Yes, once in Wave 1 before commit | No | No |
| Admin UI serving route | `tests/admin-ui.serving.test.ts` | Yes, once in Wave 1 before commit | No | No |
| Security headers or CSP | `tests/admin-ui.security.test.ts` | Yes, once in Wave 1 and Wave 6 | Yes, Wave 6 only | No |
| Auth store | `tests/admin-ui.auth-client.test.mjs` | Yes, once in Wave 2 before commit | No | No |
| API client refresh/replay | `tests/admin-ui.auth-client.test.mjs` | Yes, once in Wave 2 before commit | No | No |
| Safe DOM or forms | `tests/admin-ui.dom.test.mjs`, `tests/admin-ui.forms.test.mjs` | Yes, once in Wave 3 and Wave 6 | Wave 6 only | No |
| Sites list or editor | `tests/admin-ui.contract.test.ts`, `tests/admin-ui.forms.test.mjs`, `tests/admin-ui.roles.test.mjs` | Yes, once in Wave 3 before commit | Wave 6 only | No |
| Lifecycle or images | `tests/admin-ui.contract.test.ts`, `tests/admin-ui.forms.test.mjs`, `tests/admin-ui.auth-client.test.mjs` | Yes, once in Wave 4 before commit | Wave 6 only | No |
| Categories, users, audit | `tests/admin-ui.contract.test.ts`, `tests/admin-ui.roles.test.mjs` | Yes, once in Wave 5 before commit | Wave 6 only | No |
| Responsive/accessibility | `tests/admin-ui.dom.test.mjs`, `tests/admin-ui.roles.test.mjs` | Yes, Wave 6 | Yes, desktop/tablet/mobile in Wave 6 | No |
| Security source audit | `tests/admin-ui.contract.test.ts`, `tests/admin-ui.security.test.ts` | Yes, Wave 6 | Yes, Wave 6 | No |
| Final local acceptance | all Admin UI tests and `npm run check` | Yes | Yes, desktop/tablet/mobile | No |
| Release integration | `npm run check` after merge | Yes | Yes, after deploy | Yes, Wave 7 only after owner approval |

Rules:

- Focused tests run once per task.
- `npm run check` runs once per Wave before the grouped Wave commit.
- Full browser gate runs only in Wave 6.
- Production lifecycle runs only in Wave 7 after owner approval.
- No production writes during Tasks 1 through 16.

## Commit Strategy

Owner preference:

- Do not commit after every small edit.
- Use grouped commits by Wave.
- Do not push until local complete review.
- Do not deploy until owner approval.

Recommended grouped commit boundaries:

Wave 1:

```text
feat: serve secure WEB00 admin shell
```

Wave 2:

```text
feat: add WEB00 admin authentication shell
```

Wave 3:

```text
feat: add WEB00 site administration
```

Wave 4:

```text
feat: add WEB00 site lifecycle and images
```

Wave 5:

```text
feat: add WEB00 categories users and audit
```

Wave 6:

```text
fix: harden WEB00 admin UI acceptance
```

This document creates no implementation commits. The current docs-only planning commit is separate from the future implementation commits.

## Rollback Plan

| Wave | Rollback boundary |
| --- | --- |
| Wave 1 | Revert `feat: serve secure WEB00 admin shell`; removes Helmet/package change, build copy script, Admin UI static serving, and header wiring. |
| Wave 2 | Revert `feat: add WEB00 admin authentication shell`; removes auth store, API client, login, shell, and role navigation. |
| Wave 3 | Revert `feat: add WEB00 site administration`; removes safe DOM/form utilities, sites list, and site editor. |
| Wave 4 | Revert `feat: add WEB00 site lifecycle and images`; removes lifecycle and image manager UI. |
| Wave 5 | Revert `feat: add WEB00 categories users and audit`; removes categories, users, and audit screens. |
| Wave 6 | Revert `fix: harden WEB00 admin UI acceptance`; restores the previous locally accepted Admin UI state before final hardening. |
| Wave 7 | Redeploy previous known-good backend commit after owner-approved deploy if production acceptance fails. |

General rollback:

- Admin UI branch can be discarded before integration.
- Production branch remains unchanged until owner approval.
- Release branch and PR #2 remain unchanged until owner-approved release refresh.
- No database rollback is expected.
- After deploy, use the previous known-good backend commit.
- Public GitHub Pages is unaffected because the Admin UI is backend-served only.

## Self-Review

Result: PASS for plan readiness.

Coverage review:

- Design purpose and branch boundaries are covered by execution rules and Task 17.
- Architecture and build contract are covered by Tasks 1 and 2.
- Serving and security header contracts are covered by Task 2.
- Auth flow, token storage, and refresh policy are covered by Tasks 3, 4, and 5.
- Safe DOM and error rendering foundations are covered by Tasks 4, 6, and 15.
- Approved screens are covered by Tasks 5, 7, 8, 9, 10, 11, 12, and 13.
- Image UI routes, fields, and limits are covered by Task 10.
- Responsive and accessibility requirements are covered by Task 14 and the Wave 6 browser gate.
- Security source scans and public bug-report text guard are covered by Task 15.
- Full local acceptance is covered by Task 16.
- Integration, production acceptance, release branch refresh, and PR #2 update are deferred to Task 17.

Consistency review:

- All planned file names match the exact file map.
- Interfaces produced in earlier tasks are consumed by later tasks with the same names.
- Current API methods and route shapes are used throughout.
- The old image-pipeline phase label is not used as the UI phase name.
- No invented product screens or product features are included.
- Package and lockfile changes are isolated to Task 1 and Wave 1.
- Production actions are explicitly deferred.

Text hygiene review:

- No fill-in markers are intentionally left.
- No unresolved design contradiction remains.
- Every task includes exact files, consumed interfaces, produced interfaces, concrete RED test code, exact command, expected failure, minimal implementation outline, focused GREEN command, expected PASS, scope gate, and commit boundary.

Final planning status: PASS for owner review.
