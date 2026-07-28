# WEB00 Admin UI Design Spec

Status: frozen for owner review

Spec branch: `feat/web00-backend-admin-ui`

Source branch: `feat/web00-backend-production`

Source HEAD: `79721a2d77e3f9900558b7c31fac741ccc9baf14`

Release branch preserved: `release/web00-production-live`

Release HEAD preserved: `347a95070397e95db3e1e52a41d88a2a2be43f41`

Open release PR preserved: PR #2, `release/web00-production-live -> main`

## 1. Purpose

This document freezes the WEB00 Admin UI design before implementation. It is a documentation-only artifact. It does not add UI files, does not change backend runtime behavior, does not change package metadata, does not install dependencies, does not deploy, and does not change PR #2.

The Admin UI is a private backend-served operator interface for the existing WEB00 backend admin API. It is designed for authenticated editors and admins who manage catalog sites, images, categories, user lifecycle state, roles, and audit visibility.

The frozen outcome is a single implementation target:

- Serve the private Admin UI from the backend at `/admin`.
- Use current backend API contracts exactly as they exist on `feat/web00-backend-production`.
- Keep the access token in browser module memory only.
- Use the existing HttpOnly refresh cookie for bootstrap and refresh.
- Protect the UI with strict security headers and a restrictive CSP.
- Keep public GitHub Pages and the current release PR untouched until owner-approved integration.

## 2. Source Materials

This spec is grounded in the following read-only research artifacts:

- `D:\WEB00_EVIDENCE\WEB00\admin-ui-research\WEB00_ADMIN_UI_SPEC_TRACEABILITY.md`
- `D:\WEB00_EVIDENCE\WEB00\admin-ui-research\WEB00_ADMIN_UI_CURRENT_API_MAP.md`
- `D:\WEB00_EVIDENCE\WEB00\admin-ui-research\WEB00_ADMIN_UI_ARCHITECTURE_OPTIONS.md`
- `D:\WEB00_EVIDENCE\WEB00\admin-ui-research\WEB00_ADMIN_UI_BUILD_AND_SERVING_PLAN.md`
- `D:\WEB00_EVIDENCE\WEB00\admin-ui-research\WEB00_ADMIN_UI_AUTH_AND_SECURITY_MODEL.md`
- `D:\WEB00_EVIDENCE\WEB00\admin-ui-research\WEB00_ADMIN_UI_SCREEN_ROLE_MATRIX.md`
- `D:\WEB00_EVIDENCE\WEB00\admin-ui-research\WEB00_ADMIN_UI_TEST_ACCEPTANCE_PLAN.md`
- `D:\WEB00_EVIDENCE\WEB00\admin-ui-research\WEB00_ADMIN_UI_IMPLEMENTATION_WAVES.md`
- `D:\WEB00_EVIDENCE\WEB00\admin-ui-research\WEB00_ADMIN_UI_RESEARCH_INDEX.json`

Direct source verification for this freeze read the current app, auth, admin routes, RBAC policy, image parser, image processor, error envelope, and package scripts on source HEAD `79721a2d77e3f9900558b7c31fac741ccc9baf14`.

## 3. Current State

The backend already exposes the private API required by the approved Admin UI screens. No missing backend capability blocks the UI design.

Current facts:

- `/admin` is not served yet.
- `backend/src/admin` does not exist yet.
- `backend/src/modules/admin-ui` does not exist yet.
- `backend/dist/admin` does not exist yet.
- `backend/scripts/copy-admin-assets.mjs` does not exist yet.
- The backend build currently runs `npm run prisma:generate && tsc -p tsconfig.build.json`.
- TypeScript compilation does not copy static admin assets.
- `helmet` is not installed yet.
- Existing `/api/auth` and `/api/admin` routes are authoritative for the UI.
- Existing release PR #2 remains open from `release/web00-production-live` to `main`.

## 4. Branch and Release Boundaries

The Admin UI implementation branch must be created from:

`feat/web00-backend-production` at `79721a2d77e3f9900558b7c31fac741ccc9baf14`

The branch name is:

`feat/web00-backend-admin-ui`

The release branch remains untouched during Admin UI implementation:

`release/web00-production-live` at `347a95070397e95db3e1e52a41d88a2a2be43f41`

PR #2 remains the release PR:

`release/web00-production-live -> main`

Admin UI work must not be committed directly to `main`, `release/web00-production-live`, or `feat/web00-backend-production`. After local completion and owner review, the planned integration path is:

`feat/web00-backend-production -> feat/web00-backend-admin-ui -> owner approval -> merge into feat/web00-backend-production -> one owner-approved Render deploy -> production acceptance -> merge feat/web00-backend-production into release/web00-production-live -> refresh PR #2`

No independent Admin UI PR to `main` is part of this frozen plan.

## 5. Approved Architecture

The selected architecture is a vanilla static Admin UI served by Express:

- HTML, CSS, and browser-native JavaScript modules.
- No React.
- No Vue.
- No Vite.
- No CDN runtime dependency.
- No inline script.
- No inline style.
- No inline event handler attributes.
- No GitHub Pages admin surface.
- No direct Supabase browser SDK.
- No new API domain.
- No schema or migration change for this UI.

This choice fits the current backend because the admin API is already complete for the approved screens, the deployment target starts `node dist/server.js`, and a small self-hosted UI minimizes dependency, routing, and CSP risk.

The older note that assigned this UI effort to the B7 phase is superseded. Current B7 remains the image pipeline. This work is named Admin UI completion.

## 6. Planned Repository Structure

The future implementation may add the following structure after owner approval:

```text
backend/
  scripts/
    copy-admin-assets.mjs
  src/
    admin/
      index.html
      assets/
        admin.css
        main.js
        api-client.js
        auth-store.js
        dom.js
        screens/
          audit.js
          categories.js
          image-manager.js
          login.js
          shell.js
          site-editor.js
          sites-list.js
          users.js
    modules/
      admin-ui/
        admin-ui.routes.ts
        admin-ui-security.ts
        admin-ui-static.ts
```

This structure is descriptive, not created by this freeze commit.

The implementation may adjust file names while preserving these boundaries:

- Static browser files live under `backend/src/admin`.
- Express serving/security code lives under `backend/src/modules/admin-ui`.
- Build output is copied to `backend/dist/admin`.
- No public frontend files are modified for the private Admin UI.

## 7. Build Contract

The future production build must copy admin assets after TypeScript compilation and before `npm start`.

Frozen build flow:

```text
npm run prisma:generate
tsc -p tsconfig.build.json
node scripts/copy-admin-assets.mjs
verify backend/dist/admin/index.html
verify required backend/dist/admin/assets files
```

The package build script may become equivalent to:

```text
npm run prisma:generate && tsc -p tsconfig.build.json && node scripts/copy-admin-assets.mjs
```

Copy script requirements:

- Source: `backend/src/admin`.
- Destination: `backend/dist/admin`.
- Use Node standard library only.
- Resolve paths from `import.meta.url`, not `process.cwd()`.
- Verify that the resolved destination is inside `backend/dist`.
- Fail the build if `index.html` or required assets are missing.
- Preserve deterministic filenames.
- Do not include source maps containing local paths in production assets.
- Do not embed environment values into static files.
- Do not read secret files.

The future implementation may add `helmet@8.3.0` only with owner approval because it changes package metadata and the lockfile.

## 8. Serving Contract

The Admin UI is served by the backend at:

- `GET /admin`
- `GET /admin/`
- `GET /admin/assets/*`

Serving rules:

- Mount the Admin UI route before the global not-found middleware.
- Keep `/admin` outside `/api`.
- Do not add a catch-all route outside `/admin`.
- Do not add a public SPA wildcard.
- Resolve the static root from `import.meta.url`.
- From `backend/src/modules/admin-ui`, resolve `../../admin`; in compiled code this maps to `backend/dist/admin`.
- Do not rely on `process.cwd()` for runtime serving.
- Serve `/admin` and `/admin/` as the same private entry document.
- Serve assets only from `/admin/assets/*`.
- Deny dotfiles.
- Disable directory browsing.
- Disable static index discovery for asset directories.
- Return controlled 404 responses for missing admin assets.
- Do not leak filesystem paths, stack traces, or internal module names in admin serving errors.
- Set `Cache-Control: no-store` on admin HTML and admin assets.
- Keep API routes unchanged.

Mount order target:

```text
request id
JSON parser
request logger
health/readiness/public API
auth API
admin API
admin UI serving route
test routes when enabled
not found
error handler
```

If implementation chooses to mount the Admin UI before API routes, acceptance must prove that no `/api/*` route behavior changes. The safer default is to mount `/admin` after API route registration and before not-found.

## 9. Security Header Contract

The Admin UI must use Helmet with `useDefaults: false` once dependency changes are approved.

Required CSP:

```text
default-src 'none';
script-src 'self';
script-src-attr 'none';
style-src 'self';
connect-src 'self';
img-src 'self' data: blob: configured Storage public origin;
object-src 'none';
base-uri 'none';
form-action 'self';
frame-ancestors 'none'
```

Additional header requirements:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy` disables camera, microphone, geolocation, payment, USB, serial, accelerometer, gyroscope, magnetometer, and interest-cohort style tracking surfaces where supported.
- HSTS is enabled only in production behind HTTPS.
- `upgrade-insecure-requests` is used only in production so local HTTP development remains testable.
- No secret value is emitted in headers.
- The configured Storage public origin is the only non-self image origin.
- No report endpoint is added unless owner-approved.

The UI implementation must satisfy CSP without nonces by using only self-hosted external JavaScript and CSS.

## 10. Auth Flow

The Admin UI uses the existing auth routes:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

State machine:

```text
BOOTSTRAPPING
AUTHENTICATED
UNAUTHENTICATED
REFRESHING
LOGGING_OUT
```

Initial load flow:

1. Enter `BOOTSTRAPPING`.
2. Call `POST /api/auth/refresh` with `credentials: "same-origin"`.
3. Store the returned access token in module memory only.
4. Call `GET /api/auth/me` with `Authorization: Bearer <access token>`.
5. Enter `AUTHENTICATED` when both calls succeed.
6. Enter `UNAUTHENTICATED` when refresh fails.

Login flow:

1. Submit credentials to `POST /api/auth/login`.
2. Use `credentials: "same-origin"` so the refresh cookie is set by the backend.
3. Store the returned access token in module memory only.
4. Call `GET /api/auth/me`.
5. Render the authenticated shell for the returned role.

Logout flow:

1. Enter `LOGGING_OUT`.
2. Clear the in-memory access token immediately.
3. Call `POST /api/auth/logout` with `credentials: "same-origin"`.
4. Return to `UNAUTHENTICATED` even if the server response fails.
5. Abort in-flight screen requests.
6. Remove authenticated data from DOM state.

## 11. Token Storage Rules

The access token may live only in JavaScript module memory.

Forbidden token storage:

- `localStorage`
- `sessionStorage`
- IndexedDB
- Cache Storage
- URL query strings
- URL hash fragments
- DOM attributes
- hidden form fields
- JS-readable cookies
- logs
- analytics events
- error messages

The refresh token remains server-managed through the existing HttpOnly cookie. The UI must not attempt to read it.

## 12. Refresh Policy and API Client

All admin API requests use same-origin relative paths.

Authenticated JSON requests:

- Add `Authorization: Bearer <access token>`.
- Use `Accept: application/json`.
- Use `Content-Type: application/json` only when a JSON request body is present.
- Use `credentials: "same-origin"` only where cookie behavior is needed, including auth refresh and logout.

Refresh policy:

- On an auth-expired response, use a single shared refresh promise.
- Queue simultaneous refresh attempts behind that one promise.
- Replay a failed JSON request at most once after refresh succeeds.
- Never replay multipart uploads automatically.
- Do not refresh on `FORBIDDEN`; show an authorization message.
- If refresh fails, clear auth state and render login.
- Abort stale screen requests with `AbortController`.
- Do not keep background polling alive after logout.

Multipart upload requests:

- Use `FormData`.
- Let the browser set multipart `Content-Type` and boundary.
- Do not set multipart `Content-Type` manually.
- Do not silently retry failed uploads.
- Generate a new client file id only for an explicit user attempt.

## 13. Current API Map

The UI must call only current backend routes.

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

Superseded planning items are not implementation targets:

- Older lifecycle method shapes are superseded by the current `POST` lifecycle routes.
- Older generic upload routing is superseded by the current site-scoped image routes.
- Older HTTP user provisioning and credential mutation concepts are superseded by the current CLI plus lifecycle-only user model.

## 14. Roles and Permissions

Server-side RBAC is authoritative. UI visibility is convenience only and is never an authorization boundary.

Editor capabilities:

- View sites.
- Create draft sites.
- Edit permitted draft fields.
- Manage preview and gallery images for permitted drafts.
- View categories.

Admin capabilities:

- All editor capabilities.
- Edit any permitted site fields exposed by current schemas.
- Publish sites.
- Unpublish sites.
- Soft delete sites.
- Restore sites.
- Permanently delete sites.
- Create, update, and delete categories.
- View users.
- Change user role.
- Disable users.
- Enable users.
- View audit logs.

Current permission names:

```text
site.read
site.createDraft
site.updateDraft
site.updateAny
site.publish
site.unpublish
site.softDelete
site.restore
site.permanentDelete
category.read
category.create
category.update
category.delete
audit.read
user.read
user.changeRole
user.disable
user.enable
```

The Admin UI must derive visible navigation and actions from the authenticated user's role and permissions returned by the current auth/admin model.

## 15. Approved Screens

The approved screen set is:

- Login.
- Authenticated shell and navigation.
- Sites list.
- Site create and edit.
- Site lifecycle actions.
- Preview and gallery image manager.
- Categories.
- Users lifecycle management.
- Audit logs.
- Responsive and accessibility states across the above screens.

No marketing page, public registration page, public contact form, public bug-report surface, CRM screen, lead pipeline, payment interface, or public content editor beyond the approved catalog fields is part of this Admin UI.

## 16. Screen Details

Login:

- Shows only the private sign-in form.
- Uses Russian-language UI labels.
- Submits to existing login endpoint.
- Shows validation, invalid credentials, disabled user, rate limit, network, and unknown error states.
- Does not include public registration.
- Does not include credential recovery.
- Does not expose token or cookie details.

Shell:

- Provides stable navigation for sites, categories, users, audit logs, and logout.
- Hides admin-only items for editors.
- Keeps role and current user context visible without exposing internal claims.
- Supports keyboard navigation and focus restoration.
- Uses a single live region for session and action feedback.

Sites list:

- Supports search, status, category, active, featured, deleted, sort, direction, page, and limit according to current query schemas.
- Displays title, slug, category, status, active/deleted state, featured state for admins, updated time, and key actions.
- Uses table layout on wider screens and card-style records on narrow screens without horizontal page scroll.
- Shows empty, loading, error, and filtered-empty states.

Site create and edit:

- Uses current site schema fields only.
- Required fields: `categoryId`, `shortDescription`, `slug` on create, and `title`.
- Optional editable fields include delivery labels, demo URLs, demo mode, development days, external demo URL, feature list, full description, legacy title, original demo URL, preview type, price amount, price label, site URL, sort order, and tags.
- Admin-only editable fields include `featured` and `slug` on update.
- Editors cannot edit admin-only fields in the UI.
- Empty nullable text inputs serialize to `null` where current schemas do so.
- Arrays are edited as explicit list controls, trimmed, capped, and serialized as arrays.
- URLs are validated before submit and remain server-validated.
- Slugs are normalized to lowercase and match the current slug pattern before submit.

Lifecycle:

- Publish calls `POST /api/admin/sites/:id/publish`.
- Unpublish calls `POST /api/admin/sites/:id/unpublish`.
- Soft delete calls `DELETE /api/admin/sites/:id`.
- Restore calls `POST /api/admin/sites/:id/restore`.
- Permanent delete calls `DELETE /api/admin/sites/:id/permanent`.
- Every lifecycle action requires a confirmation dialog.
- Permanent delete requires a typed phrase in the UI before the request is sent. The typed phrase is UI-only and no extra body is sent unless the backend contract changes in a later approved task.

Image manager:

- Preview image replacement uses the single preview route.
- Preview image deletion uses the preview delete route.
- Gallery single upload uses the gallery single route.
- Gallery batch upload uses the gallery batch route.
- Gallery reorder uses the gallery patch route.
- Gallery delete uses the asset delete route.
- The UI shows partial batch results and does not claim full success when individual files fail.

Categories:

- Supports list, create, update, delete, active filter, search, pagination, and optional counts according to current schemas.
- Editors see category data read-only.
- Admins see create, update, and delete controls.
- Category delete requires confirmation and handles in-use errors without losing form state.

Users:

- Supports list, user detail, role change, disable, and enable.
- Does not create users through HTTP.
- Does not mutate user credentials through HTTP.
- Role changes, disable, and enable actions require confirmation.
- Self-protection errors such as self role change, self disable, and last active admin are displayed as controlled errors.

Audit logs:

- Supports action, entity type, entity id, actor user id, date range, sort, page, and limit according to current schemas.
- Displays audit data as read-only.
- Does not expose raw database objects.
- Supports request id copy for errors.

## 17. Safe DOM Contract

API and database content must be rendered safely.

Forbidden APIs and patterns for untrusted content:

- `innerHTML`
- `outerHTML`
- `insertAdjacentHTML`
- `eval`
- `Function`
- `document.write`
- string-built event handlers
- assigning untrusted strings to URL-bearing attributes without validation

Allowed patterns:

- `textContent`
- form `value`
- `createElement`
- `append`
- `replaceChildren`
- `addEventListener`
- fixed attributes from allowlisted names
- URL objects with protocol validation

External links:

- Parse with `new URL`.
- Allow only `http:` and `https:`.
- Use `target="_blank"` only with `rel="noopener noreferrer"`.
- Do not build API paths from untrusted fragments.

## 18. Image UI Contract

Accepted source formats:

- JPEG
- PNG
- WebP
- AVIF

Rejected by server and reflected clearly in the UI:

- SVG
- GIF
- animated images
- unsupported or mismatched MIME types
- corrupt images
- oversized images
- images exceeding pixel limits

Current constraints:

- Per source file: no more than 5 MiB.
- Batch: no more than 10 files.
- Batch raw total: no more than 30 MiB.
- Decoded pixels: no more than 40,000,000.
- Source width or height: no more than 20,000.
- Resulting height: no more than 12,000.
- Gallery final count: no more than 20.
- Alt text: no more than 160 characters.

Single upload form fields:

```text
image
clientFileId
alt
```

Batch upload form fields:

```text
images
metadata
```

Batch metadata is a JSON array aligned to the selected files and contains client file ids and optional alt text.

Client file id rules:

- Generate one UUID per explicit upload attempt.
- Reuse the id only for the server idempotency behavior of that same explicit attempt.
- Generate a new id when the user intentionally retries.
- Do not silently replay uploads after auth refresh.

No browser code may call Supabase directly. All image writes and cleanup remain backend-owned.

## 19. Error Handling

The backend error envelope is:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-safe message.",
    "details": [],
    "requestId": "request-id"
  }
}
```

The UI must handle:

- Field validation errors.
- Form-level validation errors.
- Conflict errors such as slug or upload id conflict.
- Forbidden role or permission errors.
- Session expiration.
- Rate limiting.
- Network failure.
- Image validation and processing errors.
- Storage unavailable or deferred cleanup errors.
- Unknown controlled errors.

The UI must never display:

- stack traces
- SQL
- Prisma internals
- provider internals
- tokens
- keys
- local filesystem paths
- raw object dumps

Every error view includes a request id copy action when the backend provides one.

## 20. Destructive Confirmations

Confirmation is required for:

- Publish.
- Unpublish.
- Soft delete.
- Restore.
- Permanent delete.
- Category delete.
- Role change.
- User disable.
- User enable.
- Preview image delete.
- Gallery image delete.

Permanent delete requires typed confirmation based on the current visible site identity before sending the delete request. The confirmation must make the irreversible effect clear in Russian-language UI copy.

## 21. Responsive and Accessibility Contract

The Admin UI must be efficient for repeated operational use.

Accessibility:

- Semantic buttons and form controls.
- Explicit labels for inputs.
- Error text associated with invalid fields.
- Visible focus states.
- Keyboard reachable navigation and actions.
- Modal focus containment only while a modal is open.
- Escape closes non-submitted modals.
- Focus returns to the invoking control after modal close.
- `aria-live` feedback for async success and failure.
- Loading states do not trap focus.
- Disabled controls include a reason in adjacent accessible text or tooltip.

Responsive behavior:

- Desktop: dense tables and split editor panels are allowed.
- Tablet: navigation remains reachable and actions remain visible.
- Mobile: tables convert to stacked records, dialogs fit the viewport, and controls maintain touch targets.
- No horizontal page scroll at the page level.
- Form controls and action labels must not overlap.
- Long slugs, URLs, email addresses, and request ids wrap or truncate with copy affordances.

Language:

- Operator-facing UI copy is Russian-language.
- API codes may remain English in debug-adjacent secondary text when useful.
- Technical implementation details are not explained in visible UI copy.

## 22. Data Validation Contract

The UI mirrors client-side constraints only for ergonomics. The server remains authoritative.

Sites:

- `slug`: lowercase letters and digits separated by single hyphens, 1 to 120 characters.
- `title`: 1 to 160 characters.
- `shortDescription`: 1 to 500 characters.
- `fullDescription`: up to 5000 characters or null.
- `legacyTitle`: up to 160 characters or null.
- `deliveryLabel`, `priceLabel`: up to 80 characters or null.
- `demoMode`, `previewType`: up to 40 characters or null.
- URL fields: valid URL or null, max 2048 characters.
- `developmentDays`: positive integer or null.
- `priceAmountCents`: positive integer or null.
- `sortOrder`: integer at least 0.
- `features`: max 30 items, each 1 to 160 characters.
- `tags`: max 30 items, each 1 to 80 characters.

Categories:

- `slug`: lowercase letters and digits separated by single hyphens, 1 to 120 characters.
- `title`: 1 to 120 characters.
- `description`: up to 1000 characters or null.
- `sortOrder`: integer at least 0.
- `active`: boolean.

Users:

- List filters match current query schema.
- Role can only be `admin` or `editor`.

Audit:

- Date filters use ISO datetime values.
- Entity type is one of `auth`, `category`, `site`, `upload`, or `user`.

## 23. Test Strategy

Unit tests:

- In-memory token store.
- Auth state transitions.
- Single-flight refresh.
- One replay maximum for JSON requests.
- No automatic multipart replay.
- Role-based navigation rendering.
- Safe DOM rendering helpers.
- Form serialization and null handling.
- Error envelope parsing.
- Destructive confirmation state.

Express and Supertest:

- `GET /admin`.
- `GET /admin/`.
- `GET /admin/assets/*`.
- Missing admin asset 404.
- Dotfile denial.
- No directory index.
- Admin CSP header.
- Admin no-store cache header.
- Security headers.
- API routes unchanged.
- Not-found order unchanged for unrelated routes.
- Build output path works from `dist`.

Contract tests:

- UI route constants match current backend routes.
- Site list query keys match schema.
- Site create/update payloads match schema.
- Lifecycle uses current `POST` routes.
- Image routes are site-scoped.
- Single upload fields are `image`, `clientFileId`, and `alt`.
- Batch upload fields are `images` and `metadata`.
- Category payloads match schema.
- User screen excludes HTTP provisioning and credential mutation.
- Audit query keys match schema.

Browser tests:

- Login.
- Refresh bootstrap.
- Session expiration recovery.
- Logout.
- Editor navigation and hidden admin-only actions.
- Admin navigation and actions.
- Sites list filters and pagination.
- Site create and edit.
- Lifecycle confirmation paths.
- Preview replacement and delete.
- Gallery single upload, batch upload, reorder, and delete.
- Categories read-only editor view.
- Categories admin mutation view.
- Users admin view and lifecycle actions.
- Audit log filters.
- Desktop viewport.
- Tablet viewport.
- Mobile viewport.
- Keyboard flow.
- Console errors count is zero.
- Failed resource count is zero.

Production acceptance after owner approval:

- One Render deploy from approved branch state.
- One temporary lifecycle exercise only.
- Cleanup of temporary data.
- Baseline public behavior verified after cleanup.
- Owner real mobile recheck before final acceptance.

## 24. Implementation Waves

Wave 1: serving, static asset copy, and security headers.

Acceptance: `/admin`, `/admin/`, and `/admin/assets/*` work from source and compiled output; CSP and cache headers pass; `/api` behavior is unchanged.

Wave 2: auth client and shell.

Acceptance: login, refresh bootstrap, memory-only token store, single-flight refresh, logout, and role navigation pass unit and browser tests.

Wave 3: sites list and editor.

Acceptance: site list, filters, pagination, create, update, schema-aligned serialization, and editor/admin field split pass local tests.

Wave 4: lifecycle and image manager.

Acceptance: publish, unpublish, soft delete, restore, permanent delete confirmations, preview upload/delete, gallery upload/reorder/delete, batch partial results, and no silent upload replay pass.

Wave 5: categories, users, and audit logs.

Acceptance: category read/mutation flows, user lifecycle flows, audit filters, and authorization display behavior pass.

Wave 6: responsive, accessibility, security, and local acceptance.

Acceptance: desktop/tablet/mobile browser checks pass; keyboard and focus behavior pass; console and failed resources are clean; security header tests pass.

Wave 7: owner-approved integration and production acceptance.

Acceptance: merge to backend production only after owner approval, one Render deploy, temporary lifecycle cleanup, real mobile owner recheck, then release branch refresh and PR #2 update.

## 25. Rollback Plan

Local rollback before deployment:

- Revert the Admin UI merge from `feat/web00-backend-production`.
- Keep `release/web00-production-live` unchanged.
- Keep PR #2 unchanged.

Production rollback after owner-approved deploy:

- Deploy the previous known-good backend production commit.
- Admin UI serving, assets, and security route are isolated enough to revert without schema rollback.
- No database migration rollback is expected because this design does not require schema changes.
- Public GitHub Pages remains unaffected because the Admin UI is backend-served only.

Rollback communications:

- Record the reverted commit hash.
- Record deployed commit hash before and after rollback.
- Record whether any temporary acceptance data was created and cleaned.
- Record remaining risk before returning to release flow.

## 26. Non-Goals

The following are outside this Admin UI freeze:

- Public website redesign.
- Public GitHub Pages admin.
- CRM.
- Leads.
- Lead statuses.
- Support message inbox.
- Telegram integration.
- VK integration.
- MAX integration.
- Email integration.
- Payments.
- Full CMS for all public pages.
- Public registration.
- Username login.
- MFA.
- HTTP user provisioning.
- HTTP credential mutation.
- Backend schema changes unless a separately approved blocker appears.
- Migration changes.
- Seed changes.
- Runtime API changes not required for the approved screens.
- Direct Supabase browser access.
- Public bug-report buttons, links, forms, or CTAs.

## 27. Traceability Matrix

| Requirement | Research source | Current source or superseding source | UI screen | Test evidence |
| --- | --- | --- | --- | --- |
| Backend-served `/admin` | Build and serving plan | `backend/src/app.ts` mount-before-not-found contract | Shell, login | Supertest `/admin`, `/admin/`, assets, 404 |
| Vanilla static architecture | Architecture options | Selected architecture in research index | All screens | Build and CSP tests |
| Memory-only access token | Auth and security model | Current `/api/auth/refresh` and `/api/auth/me` | Login, shell | Unit auth store, browser bootstrap |
| HttpOnly refresh bootstrap | Auth and security model | Current auth routes | Login, shell | Browser refresh bootstrap |
| Current auth endpoints | Current API map | `backend/src/modules/auth/auth.routes.ts` | Login, logout | Contract tests |
| Current site endpoints | Current API map | `backend/src/modules/admin/sites/site.routes.ts` | Sites, editor, lifecycle | Contract tests |
| Current image endpoints | Current API map | `backend/src/modules/admin/images/site-image.routes.ts` | Image manager | Contract and browser upload tests |
| Current category endpoints | Current API map | `backend/src/modules/admin/categories/category.routes.ts` | Categories | Contract tests |
| Current user lifecycle endpoints | Current API map | `backend/src/modules/admin/users/user.routes.ts` | Users | Contract tests |
| Current audit endpoint | Current API map | `backend/src/modules/admin/audit/audit-log.routes.ts` | Audit | Contract tests |
| Editor/admin role split | Screen role matrix | `backend/src/modules/admin/rbac.policy.ts` | Navigation and actions | Unit role rendering, browser role flows |
| Strict CSP | Auth and security model | Helmet contract | All screens | Supertest headers, browser console |
| Safe DOM rendering | Auth and security model | Safe DOM contract | All data screens | Unit safe DOM tests |
| Image limits | Current API map | Multipart parser and image processor constants | Image manager | Contract and browser upload tests |
| No silent upload replay | Auth and security model | Refresh policy | Image manager | Unit API client tests |
| Russian-language operator UI | Screen role matrix | Frontend acceptance contract | All screens | Browser screenshots and manual review |
| No public bug-report surface | Agent rules and non-goals | Public release guard | All screens | Text/link scan |
| PR #2 preserved | Research index | Branch and release boundary | Release flow | GitHub PR metadata check |

## 28. Risks and Mitigations

Risk: the current build does not copy static admin assets.

Mitigation: Wave 1 adds a deterministic Node copy script and build verification.

Risk: Helmet is not installed yet.

Mitigation: dependency and lockfile changes require owner approval; implementation may either add pinned `helmet@8.3.0` with approval or request an approved variance before coding security headers.

Risk: strict CSP can break UI code if inline scripts, inline styles, or string event handlers are introduced.

Mitigation: freeze no-inline architecture, self-host all assets, and test CSP with browser console checks.

Risk: auth refresh can duplicate mutations.

Mitigation: one replay maximum for JSON requests and no automatic multipart replay.

Risk: image batch uploads can partially succeed.

Mitigation: show per-file result state and avoid all-or-nothing success messaging unless the backend returns full success.

Risk: UI hiding can be mistaken for authorization.

Mitigation: server RBAC remains authoritative; tests cover forbidden responses.

Risk: permanent delete is irreversible.

Mitigation: typed UI confirmation, clear Russian-language copy, and no automatic triggering.

Risk: release PR #2 could be polluted by Admin UI commits too early.

Mitigation: keep work on `feat/web00-backend-admin-ui`; update release branch only after owner-approved deploy and acceptance.

Risk: mobile layout may pass desktop emulation but fail on an owner device.

Mitigation: browser viewport testing is required locally, and owner real mobile recheck remains mandatory for final acceptance.

## 29. Acceptance Gates

Implementation is not complete until all applicable gates pass:

- Branch starts from exact source HEAD.
- Only approved implementation files are changed.
- No public frontend files are modified unless owner-approved.
- No backend API behavior changes unless owner-approved.
- No schema, migration, or seed changes unless owner-approved.
- Package changes are limited to owner-approved security dependency work.
- `/admin` serving tests pass.
- CSP and security header tests pass.
- Auth memory-store tests pass.
- Current API contract tests pass.
- Browser role-flow tests pass.
- Browser responsive tests pass.
- Console error count is zero.
- Failed resource count is zero.
- Public bug-report scan is clean.
- `npm run check` passes before owner review unless an owner-approved narrower gate is recorded.
- No push or deploy occurs without owner approval.
- Owner real mobile check is performed before final production acceptance.

## 30. Self-Review

Result: PASS for design freeze readiness.

Reviewed and confirmed:

- This file is documentation-only.
- This file does not create UI implementation files.
- This file does not modify HTML, CSS, JavaScript, backend routes, package metadata, lockfiles, schemas, migrations, or seeds.
- Source branch and source HEAD are recorded exactly.
- Release branch, release HEAD, and PR #2 boundaries are recorded.
- Architecture is frozen as vanilla backend-served HTML/CSS/ES modules.
- Approved screens are listed.
- Editor/admin role split is listed.
- Build contract is frozen.
- Serving contract is frozen.
- Auth flow is frozen.
- Token storage is memory-only.
- Refresh policy includes single-flight refresh, one JSON replay maximum, and no silent multipart replay.
- CSP directives are listed.
- Helmet dependency handling is explicitly future owner-approved work.
- Image UI routes, fields, and limits are listed.
- Test strategy is listed.
- Implementation waves are listed.
- Rollback path is listed.
- Non-goals are listed.
- Traceability matrix is included.
- No unresolved design contradiction remains.

Final frozen status: PASS for owner review.
