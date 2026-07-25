# WEB00 Backend B0 Technical Specification

Дата фиксации: 2026-07-24
Репозиторий: `Prudexxx/web00-pro`
Рабочая ветка на момент фиксации: `main`
Статус документа: утвержденная техническая спецификация B0, без реализации

## 1. Status and scope

B0 фиксирует границы, архитектуру, контракты и критерии приемки первого backend-направления WEB00.

Документ не является реализацией. Он не создает backend, не меняет frontend, не меняет GitHub Pages workflow и не вводит runtime-зависимости в корень репозитория.

В первый backend-релиз входят:

- публичный каталог сайтов;
- категории каталога;
- карточки сайтов;
- изображения каталога;
- authentication для админки;
- роли `admin` и `editor`;
- административная панель внутри backend;
- audit logs для административных действий.

В первый backend-релиз не входят:

- заявки из анкеты;
- статусы заявок;
- сообщения поддержки;
- bug reports;
- клиентский кабинет;
- платежи;
- Redis;
- CRM;
- Telegram, MAX, VK или email-интеграции.

Текущий frontend остается как есть: статические страницы в корне, `assets/js/data.js` как legacy seed source и fallback, без API-интеграции в B0.

## 2. System context

WEB00 Pro сейчас работает как статический frontend:

- root HTML-страницы публикуются через GitHub Pages;
- каталог рендерится в браузере из `assets/js/data.js`;
- интерактив живет в `assets/js/main.js`;
- заявки, статусы, support messages и bug reports работают как frontend-only/localStorage preview;
- сборщик, npm и backend для текущего frontend не требуются.

Текущий каталог содержит 15 активных карточек:

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

Текущие category/filter slugs, которые нужно сохранить при seed:

- `individual`;
- `goods`;
- `construction`;
- `medicine`;
- `services`;
- `realty`;
- `delivery`.

GitHub Pages workflow собирает статический артефакт отдельно от будущего backend. Backend должен разворачиваться независимо на Render.

## 3. Architecture decisions

Утвержденные решения:

- один репозиторий: `Prudexxx/web00-pro`;
- frontend остается в корне репозитория;
- backend в будущей реализации размещается только в `/backend`;
- root `package.json` не создается;
- backend runtime: Node.js `22.23.1`;
- backend language: TypeScript `5.9.x`;
- HTTP framework: Express;
- production hosting backend: Render;
- database: Supabase PostgreSQL;
- ORM: Prisma `7.x`;
- storage: Supabase Storage;
- admin panel размещается внутри backend и отдается Express по `/admin`;
- admin UI и admin API работают на одном origin;
- GitHub Pages не используется для авторизованной админки;
- frontend и backend deploy выполняются независимо;
- frontend API-интеграция выполняется отдельной будущей фазой B8.

Express выбран как стабильный и достаточный слой для WEB00 B0. TypeScript обязателен для контрактов, DTO, ролей и testability. Prisma используется только с PostgreSQL-compatible migrations.

Toolchain version contract:

- `backend/package.json` declares `"type": "module"`;
- `backend/package.json` declares `"engines": { "node": ">=22.23.1 <23" }`;
- Render sets `NODE_VERSION=22.23.1`;
- TypeScript stays on `5.9.x`;
- Prisma ORM stays on `7.x`;
- runtime dependencies include `@prisma/client`, `@prisma/adapter-pg` and `pg`;
- Prisma CLI is a dev dependency;
- Prisma Client is created through the `PrismaPg` adapter;
- plain `new PrismaClient()` without adapter is not allowed.

Future `backend/package.json` contract:

```json
{
  "type": "module",
  "engines": {
    "node": ">=22.23.1 <23"
  }
}
```

Future Render environment contract:

```text
NODE_VERSION=22.23.1
```

Render monorepo contract:

- Render service Root Directory is `backend`;
- Render build, start and pre-deploy commands run relative to `/backend`;
- changes outside `/backend` must not automatically trigger backend deploy;
- production build/runtime has no file access contract outside `/backend` and must not read files outside `/backend`;
- GitHub Pages deploy remains separate and frontend-only.

Redis не вводится в B0. Rate limiting в первой версии реализуется без обязательной внешней Redis-зависимости. Redis-compatible хранилище может быть добавлено в отдельной будущей фазе, если backend будет масштабироваться на несколько instances или если локальный limiter перестанет быть достаточным.

## 4. Repository boundaries

Разрешенная будущая зона backend:

```text
/backend
```

Запрещено для B0/B1:

- создавать backend-файлы в корне;
- создавать root `package.json`;
- менять текущие root HTML/CSS/JS;
- менять `.github/workflows/pages.yml` без отдельной задачи;
- размещать секреты в репозитории;
- использовать `/uploads` как постоянное хранилище;
- публиковать admin UI через GitHub Pages.

Рекомендуемая будущая структура `/backend`:

```text
backend/
  package.json
  tsconfig.json
  vitest.config.ts
  README.md
  .env.example
  prisma.config.ts
  prisma/
    schema.prisma
    migrations/
    seed.ts
    seed-web00-data.ts
    seed-data/
      web00-catalog.json
  src/
    app.ts
    server.ts
    config/
      env.ts
      cors.ts
    db/
      prisma.ts
    lib/
      errors.ts
      logger.ts
      request-id.ts
      slug.ts
      url.ts
    middleware/
      auth.ts
      rate-limit.ts
      require-role.ts
      validate.ts
    modules/
      auth/
      users/
      categories/
      sites/
      uploads/
      audit-logs/
    admin/
      index.html
      assets/
    tests/
      unit/
      integration/
      api/
```

`.env.example` может существовать только как перечень имен переменных без реальных значений.

## 5. Domain model

Основные сущности B0:

### User

Административный пользователь backend.

Поля:

- `id`;
- `email`;
- `passwordHash`;
- `role`;
- `active`;
- `lastLoginAt`;
- `createdAt`;
- `updatedAt`.

Роли:

- `admin`;
- `editor`.

### RefreshSession

Серверная запись refresh-сессии.

Поля:

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
- `updatedAt`.

### Category

Категория каталога.

Поля:

- `id`;
- `slug`;
- `title`;
- `description`;
- `sortOrder`;
- `active`;
- `createdAt`;
- `updatedAt`.

Удаление категории запрещено, если к ней привязан хотя бы один сайт.

### Site

Карточка сайта в каталоге.

Обязательные поля:

- `id`;
- `slug`;
- `title`;
- `categoryId`;
- `status`;
- `sortOrder`;
- `createdAt`;
- `updatedAt`.

Контентные поля:

- `legacyTitle`;
- `shortDescription`;
- `fullDescription`;
- `features`;
- `tags`;
- `demoUrl`;
- `demoLocalUrl`;
- `externalDemoUrl`;
- `originalDemoUrl`;
- `siteUrl`;
- `previewImageUrl`;
- `galleryImages`;
- `previewType`;
- `demoMode`.

Ценовые поля:

- `priceAmountCents`;
- `priceLabel`.

Поля срока:

- `developmentDays`;
- `deliveryLabel`.

Публикационные поля:

- `status`;
- `active`;
- `featured`;
- `views`;
- `publishedAt`;
- `deletedAt`.

Статусы:

- `draft`;
- `published`;
- `archived`.

Demo URL rules:

- `demoUrl` is the canonical URL returned by public API;
- `demoLocalUrl`, `externalDemoUrl` and `originalDemoUrl` are legacy compatibility and migration fields;
- public API is not required to return legacy demo fields;
- admin API may return legacy demo fields as editable content fields;
- all absolute URL fields pass HTTP(S) validation;
- `demoLocalUrl` may contain only an allowed relative local path.

`galleryImages` is an ordered array of objects:

```json
{
  "url": "https://...",
  "storagePath": "catalog/sites/...",
  "alt": "string",
  "sortOrder": 0
}
```

Gallery rules:

- `url` is a validated HTTPS URL;
- `storagePath` is a validated Supabase object path;
- `alt` is safe display text;
- `sortOrder` is a non-negative integer;
- public API returns only this contract and no hidden storage metadata.

Views policy:

- `views` is a PostgreSQL `integer`, Prisma `Int`, default `0`;
- API returns `views` as a JSON number;
- automatic view counting is not part of B1-B8;
- until a separate analytics task exists, `views` remains `0` or is changed only by a trusted admin/system process.

### StorageCleanupJob

Retryable storage cleanup task for Supabase objects that cannot be deleted inside the same transaction as database state.

Fields:

- `id`;
- `storagePath`;
- `reason`;
- `entityType`;
- `entityId`;
- `status`;
- `attempts`;
- `lastError`;
- `runAfter`;
- `createdAt`;
- `updatedAt`;
- `completedAt`.

Rules:

- DB and Supabase Storage are not one transaction;
- permanent delete records the DB change and cleanup job atomically;
- object deletion runs after database commit;
- storage deletion failure does not restore the deleted DB record;
- failed jobs remain retryable;
- endpoints must not report false full storage cleanup success;
- B6 includes cleanup processor and tests;
- B1 does not include background or infinite cleanup processes.

### AuditLog

Запись административного действия.

Поля:

- `id`;
- `actorUserId`;
- `action`;
- `entityType`;
- `entityId`;
- `beforeJson`;
- `afterJson`;
- `requestId`;
- `ipHash`;
- `userAgentHash`;
- `createdAt`.

## 6. Database model

База данных: Supabase PostgreSQL. Миграции должны быть совместимы с PostgreSQL. Primary keys используют UUID. Временные поля используют `timestamptz`. Обязательная зависимость от `citext` extension не допускается.

Supabase database connection contract:

- Render is the persistent backend runtime;
- primary `DATABASE_URL` uses Supavisor Session pooler on port `5432` when direct IPv6 connection is not available;
- direct database connection is allowed only after network availability is verified from Render;
- transaction pooler on port `6543` is not the default connection path;
- `backend/prisma.config.ts` receives migration URL through environment;
- `PrismaPg` receives runtime `DATABASE_URL`;
- connection timeout and pool limits are configured explicitly;
- secret connection URLs never enter git;
- `.env.example` contains variable names only, without values.

### users

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `uuid` | yes | primary key |
| `email` | `text` | yes | normalized lowercase email |
| `password_hash` | `text` | yes | Argon2id preferred |
| `role` | `text` | yes | `admin` or `editor` |
| `active` | `boolean` | yes | default `true` |
| `last_login_at` | `timestamptz` | no | updated on successful login |
| `created_at` | `timestamptz` | yes | server timestamp |
| `updated_at` | `timestamptz` | yes | application-managed timestamp |

Constraints and indexes:

- primary key on `id`;
- Prisma `@unique` on `email`;
- email is normalized to lowercase before write;
- check constraint for `role in ('admin', 'editor')`;
- index on `(active, role)`.

### refresh_sessions

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `uuid` | yes | primary key |
| `user_id` | `uuid` | yes | references `users(id)` |
| `token_hash` | `text` | yes | hash only, never raw token |
| `family_id` | `uuid` | yes | session family for reuse detection |
| `replaced_by_session_id` | `uuid` | no | points to rotated session |
| `revoked_at` | `timestamptz` | no | set on logout/revoke/reuse |
| `expires_at` | `timestamptz` | yes | refresh token expiry |
| `ip_hash` | `text` | no | hashed IP, not raw personal data |
| `user_agent_hash` | `text` | no | hashed user agent |
| `created_at` | `timestamptz` | yes | server timestamp |
| `updated_at` | `timestamptz` | yes | application-managed timestamp |

Constraints and indexes:

- primary key on `id`;
- foreign key `user_id` to `users(id)` with cascade delete;
- unique index on `token_hash`;
- index on `(user_id, expires_at)`;
- index on `(family_id, revoked_at)`.

### categories

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `uuid` | yes | primary key |
| `slug` | `text` | yes | stable URL/API slug |
| `title` | `text` | yes | visible category title |
| `description` | `text` | no | admin/public text |
| `sort_order` | `integer` | yes | default `0` |
| `active` | `boolean` | yes | default `true` |
| `created_at` | `timestamptz` | yes | server timestamp |
| `updated_at` | `timestamptz` | yes | application-managed timestamp |

Constraints and indexes:

- primary key on `id`;
- unique index on `slug`;
- index on `(active, sort_order)`.

### sites

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `uuid` | yes | primary key |
| `slug` | `text` | yes | canonical slug |
| `title` | `text` | yes | visible card title |
| `category_id` | `uuid` | yes | references `categories(id)` |
| `legacy_title` | `text` | no | old WEB00 card title |
| `short_description` | `text` | yes | card/list description |
| `full_description` | `text` | no | detail/admin description |
| `features` | `text[]` | yes | default empty array |
| `tags` | `text[]` | yes | default empty array |
| `demo_url` | `text` | no | validated HTTP(S) URL |
| `demo_local_url` | `text` | no | allowed relative local path only |
| `external_demo_url` | `text` | no | validated HTTP(S) URL |
| `original_demo_url` | `text` | no | validated HTTP(S) URL |
| `site_url` | `text` | no | validated HTTP(S) URL |
| `preview_image_url` | `text` | no | Supabase public URL or approved static fallback |
| `gallery_images` | `jsonb` | yes | array of `{ url, storagePath, alt, sortOrder }`, default empty array |
| `preview_type` | `text` | no | visual grouping |
| `demo_mode` | `text` | no | `none`, `external-iframe`, or future approved value |
| `price_amount_cents` | `integer` | no | nullable numeric price |
| `price_label` | `text` | no | human label |
| `development_days` | `integer` | no | nullable numeric duration |
| `delivery_label` | `text` | no | human label |
| `status` | `text` | yes | `draft`, `published`, `archived` |
| `active` | `boolean` | yes | default `true` |
| `featured` | `boolean` | yes | default `false` |
| `views` | `integer` | yes | default `0`, returned as JSON number |
| `sort_order` | `integer` | yes | default `0` |
| `published_at` | `timestamptz` | no | set on publish |
| `deleted_at` | `timestamptz` | no | soft delete marker |
| `created_at` | `timestamptz` | yes | server timestamp |
| `updated_at` | `timestamptz` | yes | application-managed timestamp |

Constraints and indexes:

- primary key on `id`;
- unique index on `slug`;
- foreign key `category_id` to `categories(id)`;
- check constraint for `status in ('draft', 'published', 'archived')`;
- check constraint for non-negative `views`;
- check constraint for positive `price_amount_cents` when present;
- check constraint for positive `development_days` when present;
- index on `(status, active, deleted_at)`;
- index on `(category_id, status, active, deleted_at)`;
- index on `(featured, views, sort_order, created_at)`;
- GIN index for `tags`;
- GIN index for `features`.

Gallery image JSON objects must use this shape:

```json
{
  "url": "https://...",
  "storagePath": "catalog/sites/...",
  "alt": "string",
  "sortOrder": 0
}
```

`gallery_images` validation checks that `url` is HTTPS, `storagePath` is an allowed Supabase object path and `sortOrder` is a non-negative integer.

### storage_cleanup_jobs

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `uuid` | yes | primary key |
| `storage_path` | `text` | yes | Supabase object path |
| `reason` | `text` | yes | sanitized machine-readable reason |
| `entity_type` | `text` | no | related entity type |
| `entity_id` | `uuid` | no | related entity id |
| `status` | `text` | yes | `pending`, `processing`, `completed`, `failed` |
| `attempts` | `integer` | yes | default `0` |
| `last_error` | `text` | no | sanitized error summary |
| `run_after` | `timestamptz` | yes | earliest retry time |
| `created_at` | `timestamptz` | yes | server timestamp |
| `updated_at` | `timestamptz` | yes | application-managed timestamp |
| `completed_at` | `timestamptz` | no | set when completed |

Constraints and indexes:

- primary key on `id`;
- check constraint for `status in ('pending', 'processing', 'completed', 'failed')`;
- check constraint for non-negative `attempts`;
- index on `(status, run_after)`;
- index on `(entity_type, entity_id)`.

Cleanup behavior:

- database state and Supabase Storage deletion are not treated as one transaction;
- permanent delete writes database deletion and a cleanup job atomically;
- object deletion happens after commit through a B6 cleanup processor;
- cleanup failure leaves a retryable job and does not resurrect deleted DB data.

### audit_logs

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `uuid` | yes | primary key |
| `actor_user_id` | `uuid` | no | admin/editor user id |
| `action` | `text` | yes | machine-readable action |
| `entity_type` | `text` | yes | `site`, `category`, `user`, `upload`, `auth` |
| `entity_id` | `uuid` | no | target entity |
| `before_json` | `jsonb` | no | sanitized before-state |
| `after_json` | `jsonb` | no | sanitized after-state |
| `request_id` | `text` | yes | request correlation |
| `ip_hash` | `text` | no | hashed IP |
| `user_agent_hash` | `text` | no | hashed user agent |
| `created_at` | `timestamptz` | yes | server timestamp |

Indexes:

- primary key on `id`;
- index on `(actor_user_id, created_at)`;
- index on `(entity_type, entity_id)`;
- index on `(action, created_at)`.

Soft delete model:

- `DELETE /api/admin/sites/:id` sets `deleted_at`;
- soft-deleted sites are never returned by public API;
- `PATCH /api/admin/sites/:id/restore` clears `deleted_at`;
- permanent delete requires `admin` role and an already soft-deleted site.

## 7. Authentication and session model

### Password hashing

Preferred password hash algorithm: Argon2id.

bcrypt is allowed only if Argon2id is confirmed incompatible with the selected Render runtime/build image. Password hash parameters must be configured server-side and never exposed to frontend.

### Login

`POST /api/auth/login` validates credentials, rate limits attempts, checks `users.active`, creates a refresh session, returns an access token and sets a refresh cookie.

### Access token

- type: JWT;
- lifetime: 10-15 minutes;
- storage: memory only inside admin UI;
- transport: `Authorization: Bearer <token>`;
- claims: `sub`, `role`, `sessionId`, `iat`, `exp`;
- no secrets or password hash in claims.

### Refresh token

- type: opaque random token;
- not a JWT;
- raw token is never stored in PostgreSQL;
- PostgreSQL stores only `token_hash`;
- transport: refresh cookie;
- cookie attributes: `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`;
- `Secure` is required in production;
- no `Domain` attribute is set;
- cookie is host-only and scoped to the backend/admin origin;
- refresh rotates on every successful refresh;
- reuse detection revokes the affected session family.

### Logout

`POST /api/auth/logout` revokes the current refresh session and clears the refresh cookie. Existing access tokens become unusable when they expire.

### CSRF model

Admin UI and API are same-origin on the backend domain. Mutating admin requests use the in-memory access token in the `Authorization` header. Access tokens are not stored in `localStorage` or `sessionStorage`. Refresh uses an HttpOnly cookie with `SameSite=Strict` and `Path=/api/auth`, and must accept only same-origin requests with strict CORS. If later implementation allows cookie-authenticated mutating endpoints without an Authorization header, a CSRF token must be added before release.

## 8. Authorization matrix

| Capability | Editor | Admin |
|---|---:|---:|
| View admin sites | yes | yes |
| View admin categories | yes | yes |
| Create site | yes | yes |
| Edit site content | yes | yes |
| Upload/replace site images | yes | yes |
| Save site as draft | yes | yes |
| Publish site | no | yes |
| Unpublish site | no | yes |
| Soft-delete site | no | yes |
| Restore site | no | yes |
| Permanent-delete site | no | yes |
| Create category | no | yes |
| Edit category | no | yes |
| Delete category | no | yes |
| Manage users | no | yes |
| View audit logs | no | yes |

Authorization rules:

- every admin endpoint requires a valid access token;
- every destructive action requires `admin`;
- permanent delete requires `admin` and a soft-deleted site;
- editor updates must use an allowlist of mutable content fields;
- server must ignore or reject mass-assigned protected fields such as `id`, `role`, `views`, `publishedAt`, `deletedAt`, `createdAt`, `updatedAt`.

## 9. Public API contract

Public API responses never include password, session, audit, internal role or admin-only fields. Public site queries return only records where `status='published'`, `active=true`, and `deletedAt=null`.

Default response envelope:

```json
{
  "data": {},
  "meta": {}
}
```

### GET /api/health

Auth: none.
Role: public.
Request: no body.
Query: none.

Response `200`:

```json
{
  "data": {
    "status": "ok",
    "service": "web00-backend",
    "time": "2026-07-24T00:00:00.000Z"
  }
}
```

Errors:

- `500 SERVICE_UNAVAILABLE`.

### GET /api/sites

Auth: none.
Role: public.
Request: no body.

Query:

- `page`: integer, default `1`, minimum `1`;
- `limit`: integer, default `12`, maximum `20`;
- `search`: string, optional;
- `category`: category slug, optional;
- `tags`: comma-separated tag slugs, optional;
- `sort`: `sortOrder`, `newest`, `popular`, or `title`.

Response `200`:

```json
{
  "data": [
    {
      "slug": "mebel",
      "title": "Мебельный магазин",
      "category": { "slug": "goods", "title": "Товары" },
      "shortDescription": "string",
      "features": ["string"],
      "tags": ["string"],
      "demoUrl": "https://example.com",
      "siteUrl": null,
      "previewImageUrl": "https://example.com/image.webp",
      "galleryImages": [
        {
          "url": "https://example.com/gallery.webp",
          "storagePath": "catalog/sites/mebel/gallery/image.webp",
          "alt": "Экран сайта",
          "sortOrder": 0
        }
      ],
      "previewType": "goods",
      "demoMode": "external-iframe",
      "priceAmountCents": null,
      "priceLabel": "Стоимость после анкеты",
      "developmentDays": 3,
      "deliveryLabel": "от 3 дней",
      "featured": false
    }
  ],
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 15,
    "totalPages": 2
  }
}
```

Errors:

- `400 VALIDATION_ERROR`;
- `429 RATE_LIMITED`;
- `500 INTERNAL_ERROR`.

### GET /api/sites/popular

Auth: none.
Role: public.
Request: no body.

Query:

- `limit`: integer, default `6`, maximum `20`;
- `category`: category slug, optional.

Sorting:

1. `featured` descending;
2. `views` descending;
3. `sortOrder` ascending;
4. `createdAt` descending as stable fallback.

Automatic view counting is not part of B1-B8. Before a separate analytics task exists, `views` remains `0` or is changed only by a trusted admin/system process. This does not block the first catalog release; popular ordering remains deterministic through `featured`, `sortOrder` and `createdAt`.

Response `200`:

```json
{
  "data": [
    {
      "slug": "mebel",
      "title": "Мебельный магазин",
      "category": { "slug": "goods", "title": "Товары" },
      "shortDescription": "string",
      "previewImageUrl": "https://example.com/image.webp",
      "priceLabel": "Стоимость после анкеты",
      "deliveryLabel": "от 3 дней",
      "featured": true
    }
  ],
  "meta": {
    "limit": 6
  }
}
```

Errors:

- `400 VALIDATION_ERROR`;
- `429 RATE_LIMITED`;
- `500 INTERNAL_ERROR`.

### GET /api/sites/:slug

Auth: none.
Role: public.
Request: path parameter `slug`, no body.

Response `200`:

```json
{
  "data": {
    "slug": "mebel",
    "title": "Мебельный магазин",
    "category": { "slug": "goods", "title": "Товары" },
    "shortDescription": "string",
    "fullDescription": "string",
    "features": ["string"],
    "tags": ["string"],
    "demoUrl": "https://example.com",
    "siteUrl": null,
    "previewImageUrl": "https://example.com/image.webp",
    "galleryImages": [
      {
        "url": "https://example.com/gallery.webp",
        "storagePath": "catalog/sites/mebel/gallery/image.webp",
        "alt": "Экран сайта",
        "sortOrder": 0
      }
    ],
    "previewType": "goods",
    "demoMode": "external-iframe",
    "priceAmountCents": null,
    "priceLabel": "Стоимость после анкеты",
    "developmentDays": 3,
    "deliveryLabel": "от 3 дней",
    "featured": false,
    "publishedAt": "2026-07-24T00:00:00.000Z"
  }
}
```

Public site responses return `demoUrl` as the canonical demo URL. Public responses do not need to return `demoLocalUrl`, `externalDemoUrl` or `originalDemoUrl`.

Errors:

- `400 VALIDATION_ERROR`;
- `404 SITE_NOT_FOUND`;
- `429 RATE_LIMITED`;
- `500 INTERNAL_ERROR`.

### GET /api/categories

Auth: none.
Role: public.
Request: no body.

Query:

- `includeCounts`: boolean, default `false`.

Response `200`:

```json
{
  "data": [
    {
      "slug": "goods",
      "title": "Товары",
      "description": null,
      "sortOrder": 20,
      "siteCount": 2
    }
  ]
}
```

Errors:

- `400 VALIDATION_ERROR`;
- `429 RATE_LIMITED`;
- `500 INTERNAL_ERROR`.

### GET /api/categories/:slug

Auth: none.
Role: public.
Request: path parameter `slug`, no body.

Query:

- `includeSites`: boolean, default `false`;
- `page`: integer, default `1`;
- `limit`: integer, default `12`, maximum `20`.

Response `200`:

```json
{
  "data": {
    "slug": "goods",
    "title": "Товары",
    "description": null,
    "sortOrder": 20,
    "sites": []
  },
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 2
  }
}
```

Errors:

- `400 VALIDATION_ERROR`;
- `404 CATEGORY_NOT_FOUND`;
- `429 RATE_LIMITED`;
- `500 INTERNAL_ERROR`.

## 10. Admin API contract

Admin API uses the same error contract as public API. All admin endpoints require `Authorization: Bearer <accessToken>` unless explicitly stated otherwise.

### POST /api/auth/login

Auth: none.
Role: public.
Request body:

```json
{
  "email": "admin@example.com",
  "password": "string"
}
```

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

Side effect: sets refresh token cookie.
Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `403 USER_DISABLED`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### POST /api/auth/refresh

Auth: refresh cookie.
Role: authenticated user.
Request body: empty.

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

Side effect: rotates refresh token cookie and stores new refresh session hash.
Errors: `401 REFRESH_REQUIRED`, `401 REFRESH_EXPIRED`, `403 REFRESH_REUSE_DETECTED`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### POST /api/auth/logout

Auth: access token or refresh cookie.
Role: authenticated user.
Request body: empty.

Response `204`: no body.
Side effect: revokes refresh session and clears refresh cookie.
Errors: `500 INTERNAL_ERROR`. Logout is idempotent for missing/expired refresh cookie.

### GET /api/auth/me

Auth: access token.
Role: authenticated user.
Request body: empty.

Response `200`:

```json
{
  "data": {
    "id": "uuid",
    "email": "editor@example.com",
    "role": "editor"
  }
}
```

Errors: `401 UNAUTHORIZED`, `403 USER_DISABLED`, `500 INTERNAL_ERROR`.

### GET /api/admin/sites

Auth: access token.
Role: `editor` or `admin`.
Request body: empty.

Query:

- `page`: integer, default `1`;
- `limit`: integer, default `20`, maximum `50`;
- `search`: string, optional;
- `category`: slug or UUID, optional;
- `status`: `draft`, `published`, `archived`, or `all`;
- `deleted`: `include`, `only`, or `exclude`;
- `sort`: `sortOrder`, `newest`, `updated`, `popular`, or `title`.

Response `200`:

```json
{
  "data": [
    {
      "id": "uuid",
      "slug": "mebel",
      "title": "Мебельный магазин",
      "categoryId": "uuid",
      "status": "draft",
      "active": true,
      "featured": false,
      "views": 0,
      "sortOrder": 20,
      "publishedAt": null,
      "deletedAt": null,
      "createdAt": "2026-07-24T00:00:00.000Z",
      "updatedAt": "2026-07-24T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 15
  }
}
```

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### POST /api/admin/sites

Auth: access token.
Role: `editor` or `admin`.
Request body:

```json
{
  "slug": "new-site",
  "title": "Новый сайт",
  "categoryId": "uuid",
  "shortDescription": "string",
  "fullDescription": "string",
  "features": ["string"],
  "tags": ["string"],
  "demoUrl": "https://example.com",
  "demoLocalUrl": null,
  "externalDemoUrl": "https://example.com",
  "originalDemoUrl": "https://example.com",
  "siteUrl": null,
  "previewImageUrl": null,
  "galleryImages": [
    {
      "url": "https://example.com/gallery.webp",
      "storagePath": "catalog/sites/new-site/gallery/image.webp",
      "alt": "Экран сайта",
      "sortOrder": 0
    }
  ],
  "previewType": "services",
  "demoMode": "external-iframe",
  "priceAmountCents": null,
  "priceLabel": "Стоимость после анкеты",
  "developmentDays": null,
  "deliveryLabel": "по оценке задачи",
  "sortOrder": 100
}
```

Response `201`: created site with admin fields.
Rules:

- new site is always saved as `draft`;
- `editor` cannot create a published site by passing `status`;
- protected fields are ignored or rejected by validation;
- `demoUrl` is the canonical public demo URL;
- `demoLocalUrl`, `externalDemoUrl` and `originalDemoUrl` are admin content fields used for compatibility and migration.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CATEGORY_NOT_FOUND`, `409 SITE_SLUG_EXISTS`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### PATCH /api/admin/sites/:id

Auth: access token.
Role: `editor` or `admin`.
Request: path parameter `id`.

Request body: partial site content fields from the create contract. `status`, `publishedAt`, `deletedAt`, `views`, `id`, `createdAt`, `updatedAt` are not accepted here.

Response `200`: updated site with admin fields.
Rules:

- `editor` can edit content only while preserving draft/unpublished state;
- `admin` can edit content here, but publish state changes use dedicated publish endpoints.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SITE_NOT_FOUND`, `409 SITE_SLUG_EXISTS`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### PATCH /api/admin/sites/:id/publish

Auth: access token.
Role: `admin`.
Request body:

```json
{
  "active": true
}
```

Response `200`: site with `status='published'` and non-null `publishedAt`.
Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SITE_NOT_FOUND`, `409 SITE_DELETED`, `409 CATEGORY_INACTIVE`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### PATCH /api/admin/sites/:id/unpublish

Auth: access token.
Role: `admin`.
Request body:

```json
{
  "status": "draft"
}
```

Response `200`: site with `status='draft'` and public visibility removed.
Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SITE_NOT_FOUND`, `409 SITE_DELETED`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### DELETE /api/admin/sites/:id

Auth: access token.
Role: `admin`.
Request body: empty.

Response `200`: site with `deletedAt` set.
Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SITE_NOT_FOUND`, `409 SITE_ALREADY_DELETED`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### PATCH /api/admin/sites/:id/restore

Auth: access token.
Role: `admin`.
Request body: empty.

Response `200`: site with `deletedAt=null`.
Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SITE_NOT_FOUND`, `409 SITE_NOT_DELETED`, `409 CATEGORY_NOT_AVAILABLE`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### DELETE /api/admin/sites/:id/permanent

Auth: access token.
Role: `admin`.
Request body:

```json
{
  "confirm": "permanent-delete"
}
```

Response `204`: no body.
Rules:

- allowed only for already soft-deleted sites;
- associated Supabase Storage objects are not deleted inside the database transaction;
- database permanent delete and `storage_cleanup_jobs` records are committed atomically;
- object deletion is executed after commit by the B6 cleanup processor;
- object deletion failure leaves retryable cleanup jobs and does not restore deleted database rows;
- response reports that storage cleanup is scheduled when jobs remain, not that storage cleanup is fully complete;
- audit log records the deletion with sanitized before-state.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SITE_NOT_FOUND`, `409 SITE_NOT_DELETED`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### GET /api/admin/categories

Auth: access token.
Role: `editor` or `admin`.
Request body: empty.

Query:

- `page`: integer, default `1`;
- `limit`: integer, default `50`, maximum `100`;
- `search`: string, optional;
- `active`: `true`, `false`, or `all`.

Response `200`: category list with `siteCount`.
Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### POST /api/admin/categories

Auth: access token.
Role: `admin`.
Request body:

```json
{
  "slug": "goods",
  "title": "Товары",
  "description": null,
  "sortOrder": 20,
  "active": true
}
```

Response `201`: created category.
Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 CATEGORY_SLUG_EXISTS`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### PATCH /api/admin/categories/:id

Auth: access token.
Role: `admin`.
Request body:

```json
{
  "slug": "goods",
  "title": "Товары",
  "description": "string",
  "sortOrder": 20,
  "active": true
}
```

Response `200`: updated category.
Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CATEGORY_NOT_FOUND`, `409 CATEGORY_SLUG_EXISTS`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### DELETE /api/admin/categories/:id

Auth: access token.
Role: `admin`.
Request body: empty.

Response `204`: no body.
Rules:

- deletion is forbidden while any site references the category;
- automatic site transfer is not implemented in B0.

Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CATEGORY_NOT_FOUND`, `409 CATEGORY_IN_USE`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### POST /api/admin/uploads/images

Auth: access token.
Role: `editor` or `admin`.
Request: `multipart/form-data`.

Fields:

- `file`: required image file;
- `siteId`: optional UUID;
- `purpose`: `preview` or `gallery`.

Response `201`:

```json
{
  "data": {
    "url": "https://storage.example.com/catalog/site/image.webp",
    "storagePath": "catalog/sites/mebel/image.webp",
    "mimeType": "image/webp",
    "sizeBytes": 123456,
    "width": 1200,
    "height": 800
  }
}
```

Rules:

- accepted formats: JPEG, PNG, WebP, AVIF;
- maximum size: 5 MB;
- SVG and executable formats are forbidden;
- backend performs MIME sniffing and file signature validation;
- server generates object name and path;
- local persistent upload directory is not used;
- if database update fails after upload, backend attempts object deletion or records a `storage_cleanup_jobs` task before responding with an error.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `422 INVALID_IMAGE_SIGNATURE`, `429 RATE_LIMITED`, `500 STORAGE_ERROR`, `500 INTERNAL_ERROR`.

### GET /api/admin/users

Auth: access token.
Role: `admin`.
Request body: empty.

Query:

- `page`: integer, default `1`;
- `limit`: integer, default `20`, maximum `50`;
- `role`: `admin`, `editor`, or `all`;
- `active`: `true`, `false`, or `all`.

Response `200`: user list without password hashes.
Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### POST /api/admin/users

Auth: access token.
Role: `admin`.
Request body:

```json
{
  "email": "editor@example.com",
  "password": "string",
  "role": "editor",
  "active": true
}
```

Response `201`: created user without password hash.
Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 USER_EMAIL_EXISTS`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### PATCH /api/admin/users/:id

Auth: access token.
Role: `admin`.
Request body:

```json
{
  "email": "editor@example.com",
  "password": "new password string",
  "role": "editor",
  "active": true
}
```

Response `200`: updated user without password hash.
Rules:

- password is optional;
- backend hashes a new password before storage;
- admin cannot remove the last active admin account.

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 USER_NOT_FOUND`, `409 USER_EMAIL_EXISTS`, `409 LAST_ADMIN_PROTECTED`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

### GET /api/admin/audit-logs

Auth: access token.
Role: `admin`.
Request body: empty.

Query:

- `page`: integer, default `1`;
- `limit`: integer, default `50`, maximum `100`;
- `actorUserId`: UUID, optional;
- `entityType`: string, optional;
- `entityId`: UUID, optional;
- `action`: string, optional;
- `from`: ISO date, optional;
- `to`: ISO date, optional.

Response `200`:

```json
{
  "data": [
    {
      "id": "uuid",
      "actorUserId": "uuid",
      "action": "site.publish",
      "entityType": "site",
      "entityId": "uuid",
      "beforeJson": {},
      "afterJson": {},
      "requestId": "req_abc",
      "createdAt": "2026-07-24T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 1
  }
}
```

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

## 11. Error contract

All errors use this shape:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Safe user-facing message",
    "details": [],
    "requestId": "req_..."
  }
}
```

Rules:

- `code` is stable and machine-readable;
- `message` is safe for UI display;
- `details` contains validation field errors or safe diagnostic metadata only;
- `requestId` is present for every request;
- stack traces, SQL text, raw Prisma errors, token values, cookie values, password hashes, environment values and storage credentials are never returned to clients.

Common error codes:

- `VALIDATION_ERROR`;
- `UNAUTHORIZED`;
- `FORBIDDEN`;
- `RATE_LIMITED`;
- `SITE_NOT_FOUND`;
- `CATEGORY_NOT_FOUND`;
- `CATEGORY_IN_USE`;
- `SITE_SLUG_EXISTS`;
- `CATEGORY_SLUG_EXISTS`;
- `USER_EMAIL_EXISTS`;
- `FILE_TOO_LARGE`;
- `UNSUPPORTED_MEDIA_TYPE`;
- `INVALID_IMAGE_SIGNATURE`;
- `STORAGE_ERROR`;
- `INTERNAL_ERROR`.

## 12. Image storage contract

Storage provider: Supabase Storage.

Buckets:

- public catalog bucket for published catalog images;
- optional private staging area for files before publish if implementation needs review flow.

Upload rules:

- all upload traffic goes through protected backend endpoint;
- admin UI never writes directly to Supabase Storage;
- accepted image formats: JPEG, PNG, WebP, AVIF;
- maximum file size: 5 MB;
- SVG is forbidden;
- executable formats are forbidden;
- MIME sniffing is required;
- file signature validation is required;
- server generates object names and paths;
- original user filename is stored only as sanitized metadata if needed;
- local `/uploads` is not used for persistence;
- uploaded image URLs stored in DB must be HTTPS URLs or storage paths resolved server-side;
- replacing an image writes audit log entry;
- DB failure after storage write requires object deletion attempt or explicit `storage_cleanup_jobs` record before returning failure.

Recommended object path pattern:

```text
catalog/sites/{siteSlug}/{purpose}/{uuid}.{extension}
```

Gallery image object contract:

```json
{
  "url": "https://...",
  "storagePath": "catalog/sites/...",
  "alt": "string",
  "sortOrder": 0
}
```

`galleryImages` is always an array of these objects. `url` and `storagePath` are validated, and `sortOrder` must be a non-negative integer.

Storage cleanup contract:

- DB and Supabase Storage are not a shared transaction;
- permanent delete first commits the DB change and cleanup job atomically;
- object deletion runs after commit;
- deletion errors leave retryable jobs;
- API responses must distinguish "cleanup scheduled" from "storage cleanup completed".

## 13. Legacy data migration

Primary legacy source file: `assets/js/data.js`.

Production seed source inside backend: `backend/prisma/seed-data/web00-catalog.json`.

Migration rules:

- import exactly the current 15 catalog cards as initial seed data;
- import exactly the current 7 categories from current filter values;
- use current `id` as canonical initial `slug`;
- do not generate new slugs from Russian `title` for existing cards;
- use current `filter` values as category slugs;
- preserve `legacyTitle`;
- preserve `title`;
- preserve `category` as category display title;
- map `description` to `shortDescription`;
- map `features` to `features`;
- map `priceFrom` to `priceLabel`;
- map `deliveryTime` to `deliveryLabel`;
- map `previewImage` to initial static fallback image reference or uploaded storage URL after approved upload migration;
- map `galleryImages` to `galleryImages`;
- map `previewType`, `demoMode`, `demoUrl`, `demoLocalUrl`, `externalDemoUrl`, `originalDemoUrl`;
- initial status can be `published` only after images and public leakage tests pass;
- `assets/js/data.js` remains in the repository as legacy seed source and frontend fallback.

Snapshot rules:

- B2 creates `backend/prisma/seed-data/web00-catalog.json`;
- the JSON snapshot contains 15 cards and 7 categories;
- the snapshot stores `sourceRepository`;
- the snapshot stores `sourceCommit`;
- the snapshot stores `sourceFile`;
- the snapshot stores `sourceSha256`;
- the snapshot stores `generatedAt`;
- production/Render seed reads only `backend/prisma/seed-data/web00-catalog.json`;
- production/Render seed does not read `../assets/js/data.js` or any other file outside `/backend`;
- a separate local verification command compares the snapshot with `assets/js/data.js`;
- snapshot/source mismatch fails local verification;
- frontend `assets/js/data.js` is not changed by migration.

Seed idempotency:

- categories are upserted by `slug`;
- sites are upserted by `slug`;
- seed stores a source fingerprint per seeded record or compares seed-owned fields;
- repeated seed does not silently overwrite administrator-edited content;
- seed reports conflicts for records changed after import;
- local snapshot verification validates source image references before a record is considered ready for publish;
- runtime seed validates snapshot structure but does not read files outside `/backend`.

Russian title slug policy:

- existing records keep current English-like IDs as slugs;
- new admin-created slugs must be explicitly supplied or generated by an approved deterministic transliteration function;
- slug uniqueness is enforced by database constraint.

## 14. Security requirements

Required controls:

- Zod validation for request params, query and body;
- Prisma query builder/prepared queries;
- Prisma 7.x runtime with `@prisma/client`, `@prisma/adapter-pg`, `pg` and `PrismaPg`;
- Prisma CLI is a dev dependency;
- plain `new PrismaClient()` without adapter is forbidden;
- Helmet for HTTP security headers;
- strict CORS allowlist;
- rate limiting for login, refresh and admin API;
- request ID middleware;
- structured logs;
- server-side allowlists against mass assignment;
- HTTP(S) URL validation for `demoUrl`, `externalDemoUrl`, `originalDemoUrl`, `siteUrl`, `previewImageUrl` and gallery `url`;
- allowed relative path validation for `demoLocalUrl`;
- storage path validation for gallery `storagePath`;
- output escaping in admin UI;
- public query guard that prevents draft/deleted leakage;
- upload rollback behavior on DB/storage mismatch;
- secret values only through environment variables;
- `.env` never committed;
- `.env.example` contains variable names only;
- audit logs for create, update, publish, unpublish, soft-delete, restore, permanent-delete, category changes, user changes and upload changes;
- password hashes never logged;
- refresh token raw values never logged;
- access tokens never logged;
- CORS credentials enabled only for the backend/admin origin that needs refresh cookie;
- public endpoints do not expose internal IDs unless explicitly safe.

Admin UI security:

- access token stored in memory only;
- refresh cookie is HttpOnly, `SameSite=Strict`, `Path=/api/auth`, host-only, and Secure in production;
- no `localStorage` or `sessionStorage` token persistence;
- all mutating API calls send Authorization header;
- admin route `/admin` is served by backend, not GitHub Pages;
- failed authorization returns safe error contract.

## 15. Observability

Backend must include:

- request ID for every request;
- structured JSON logs;
- request method, path, status, latency and request ID;
- authenticated user id and role for admin requests when available;
- safe audit log entries for admin mutations;
- storage cleanup job status and retry counters;
- startup log with service name and environment label, without secrets;
- health endpoint at `/api/health`;
- Prisma/database connection error logging without SQL secrets;
- storage error logging without signed URLs or credentials.

Recommended log levels:

- `info`: startup, shutdown, successful admin mutations;
- `warn`: validation spikes, rate limits, failed login attempts, forbidden access;
- `error`: unhandled exceptions, database errors, storage rollback failures.

## 16. Testing strategy

Required tests:

- unit tests for Zod schemas;
- unit tests for toolchain/env contract where practical;
- unit tests for slug validation/generation;
- unit tests for error formatter;
- unit tests for role permission matrix;
- unit tests for URL validation;
- unit tests for allowed relative `demoLocalUrl` validation;
- unit tests for gallery image object validation;
- integration tests with PostgreSQL;
- integration tests that Prisma Client uses `PrismaPg` adapter;
- Prisma migration test;
- seed idempotency test;
- seed conflict detection test;
- local seed snapshot verification comparing `backend/prisma/seed-data/web00-catalog.json` with `assets/js/data.js`;
- test that production seed reads only the snapshot inside `/backend`;
- case-insensitive duplicate email tests through lowercase normalization and `@unique`;
- Supertest API tests for public endpoints;
- Supertest API tests for admin endpoints;
- authentication login tests;
- refresh rotation tests;
- refresh reuse detection tests;
- logout revoke tests;
- public data leakage tests for draft, inactive and deleted sites;
- upload negative tests for size, MIME and signature;
- storage cleanup job creation and retry tests;
- category-in-use test returning `409 CATEGORY_IN_USE`;
- soft-delete test;
- restore test;
- permanent-delete admin-only test;
- pagination/filter/sort tests;
- popular ordering test;
- views policy test confirming automatic view counting is not part of B1-B8;
- health smoke test;
- frontend regression boundary check confirming no frontend files changed for backend phases before B8.

Minimum release gate:

- all backend tests pass;
- public API does not return draft, inactive or deleted sites;
- editor cannot publish or delete;
- permanent delete is admin-only;
- category with linked sites cannot be deleted;
- unsupported uploads fail safely;
- no secret values appear in logs or API responses;
- GitHub Pages frontend remains unaffected.

## 17. Delivery phases

### B1 scaffold

Scope:

- create isolated `/backend` project;
- Node.js `22.23.1`, TypeScript `5.9.x`, Express;
- ESM package contract;
- Prisma `7.x` toolchain placeholders without schema implementation beyond B1 needs;
- env validation;
- request ID;
- structured logger;
- error contract;
- health endpoint.

Files/modules:

- `backend/package.json`;
- `backend/tsconfig.json`;
- `backend/prisma.config.ts`;
- `backend/src/app.ts`;
- `backend/src/server.ts`;
- `backend/src/config/env.ts`;
- `backend/src/lib/errors.ts`;
- `backend/src/lib/logger.ts`;
- `backend/tests`.

Acceptance criteria:

- no root `package.json`;
- `backend/package.json` has `"type": "module"`;
- `backend/package.json` has `"engines": { "node": ">=22.23.1 <23" }`;
- Render `NODE_VERSION=22.23.1` is documented for future service config;
- `/api/health` returns `200`;
- invalid route returns error contract;
- frontend files unchanged;
- no deploy;
- no background or infinite cleanup processes are introduced in B1.

Tests:

- health smoke;
- error contract;
- env validation;
- package/toolchain contract check.

Explicit out-of-scope:

- database schema;
- auth;
- admin UI;
- storage cleanup processor;
- frontend adapter;
- deployment.

Rollback boundary:

- remove `/backend` scaffold files created in B1.

### B2 database and seed

Scope:

- Prisma setup;
- Supabase PostgreSQL connection config;
- `PrismaPg` adapter setup with `@prisma/client`, `@prisma/adapter-pg` and `pg`;
- users, refresh sessions, categories, sites, storage cleanup jobs and audit logs schema;
- `backend/prisma/seed-data/web00-catalog.json` snapshot;
- seed from snapshot inside `/backend`;
- local snapshot verification against `assets/js/data.js`;
- seed idempotency and conflict reporting.

Files/modules:

- `backend/prisma/schema.prisma`;
- `backend/prisma.config.ts`;
- `backend/prisma/migrations`;
- `backend/prisma/seed.ts`;
- `backend/prisma/seed-web00-data.ts`;
- `backend/prisma/seed-data/web00-catalog.json`;
- `backend/src/db/prisma.ts`;
- `backend/tests/integration`.

Acceptance criteria:

- migrations apply to PostgreSQL;
- migration URL comes from environment through `prisma.config.ts`;
- runtime `DATABASE_URL` is consumed by `PrismaPg`;
- connection timeout and pool limits are explicit;
- 7 categories seeded;
- 15 sites seeded;
- production seed reads only `backend/prisma/seed-data/web00-catalog.json`;
- production seed does not read `../assets/js/data.js`;
- local verification fails on snapshot/source mismatch;
- repeated seed does not silently overwrite admin changes;
- local image references validated during snapshot verification.

Tests:

- migration test;
- PrismaPg adapter integration test;
- seed idempotency;
- seed conflict detection;
- snapshot/source mismatch test;
- category/site constraints.

Explicit out-of-scope:

- public API;
- auth UI;
- image uploads to Supabase Storage.

Rollback boundary:

- revert B2 migration and seed files;
- drop local/test database schema created for B2.

### B3 public catalog API

Scope:

- `/api/sites`;
- `/api/sites/popular`;
- `/api/sites/:slug`;
- `/api/categories`;
- `/api/categories/:slug`;
- pagination/search/category/tags/sort;
- public projection without internal fields.

Files/modules:

- `backend/src/modules/sites`;
- `backend/src/modules/categories`;
- `backend/src/routes/public.ts`;
- `backend/tests/api/public`.

Acceptance criteria:

- only `published`, `active=true`, `deletedAt=null` records are returned;
- `limit` maximum is 20;
- popular ordering follows approved order;
- missing slug returns safe `404`.

Tests:

- public endpoint Supertest suite;
- leakage tests;
- pagination/filter/sort tests;
- popular ordering tests.

Explicit out-of-scope:

- frontend integration;
- admin CRUD;
- auth.

Rollback boundary:

- revert public route/module files from B3.

### B4 authentication

Scope:

- login;
- refresh;
- logout;
- me;
- access JWT;
- refresh sessions;
- refresh rotation;
- reuse detection;
- password hashing.

Files/modules:

- `backend/src/modules/auth`;
- `backend/src/middleware/auth.ts`;
- `backend/src/routes/auth.ts`;
- `backend/tests/api/auth`.

Acceptance criteria:

- access token lifetime is 10-15 minutes;
- access token uses Authorization header;
- access token is not stored in `localStorage` or `sessionStorage`;
- refresh token is opaque and stored as hash;
- refresh cookie is `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`, host-only, and Secure in production;
- logout revokes refresh session.

Tests:

- login success/failure;
- refresh rotation;
- reuse detection;
- logout revoke;
- disabled user rejection;
- rate limit behavior.

Explicit out-of-scope:

- admin CRUD;
- admin UI screens beyond auth shell needs.

Rollback boundary:

- revert auth module/routes/middleware and related migrations if isolated from B2 baseline.

### B5 admin CRUD

Scope:

- admin sites CRUD;
- publish/unpublish;
- soft-delete/restore/permanent-delete;
- admin categories CRUD;
- category-in-use protection;
- admin users API;
- audit log writes.

Files/modules:

- `backend/src/modules/sites`;
- `backend/src/modules/categories`;
- `backend/src/modules/users`;
- `backend/src/modules/audit-logs`;
- `backend/src/routes/admin.ts`;
- `backend/tests/api/admin`.

Acceptance criteria:

- editor can create/edit draft content;
- editor cannot publish or delete;
- admin can publish/unpublish;
- admin-only destructive actions enforced;
- deleting linked category returns `409 CATEGORY_IN_USE`;
- audit log written for admin mutations.

Tests:

- role permission matrix;
- CRUD tests;
- category-in-use tests;
- soft-delete/restore/permanent-delete tests;
- audit log tests.

Explicit out-of-scope:

- image binary upload;
- frontend adapter;
- public lead/status/support APIs.

Rollback boundary:

- revert B5 admin modules/routes and related tests.

### B6 image storage

Scope:

- Supabase Storage image upload;
- file validation;
- generated object path;
- preview/gallery metadata;
- cleanup job model;
- cleanup processor;
- rollback/cleanup scheduling on DB/storage mismatch.

Files/modules:

- `backend/src/modules/uploads`;
- `backend/src/modules/sites/image-service.ts`;
- `backend/src/modules/storage-cleanup`;
- `backend/tests/api/uploads`;
- `backend/tests/integration/storage`;
- `backend/tests/integration/storage-cleanup`.

Acceptance criteria:

- JPEG, PNG, WebP and AVIF accepted under 5 MB;
- SVG rejected;
- executable formats rejected;
- MIME sniffing and signature checks enforced;
- server generates storage path;
- local `/uploads` is not used;
- cleanup jobs are created for post-commit object deletion;
- failed cleanup remains retryable and does not restore deleted DB records;
- endpoints do not claim full storage cleanup while jobs remain pending.

Tests:

- upload success;
- unsupported format;
- wrong signature;
- file too large;
- rollback behavior;
- cleanup job creation;
- cleanup retry processor;
- editor/admin upload permission.

Explicit out-of-scope:

- client project material uploads;
- antivirus workflow;
- alternate storage providers.

Rollback boundary:

- revert upload module and Supabase bucket config changes from B6.

### B7 admin UI

Scope:

- Express-served `/admin`;
- login screen;
- site list/detail editor;
- category management for admin;
- image upload UI;
- user management for admin;
- audit log viewer for admin.

Files/modules:

- `backend/src/admin`;
- `backend/src/modules/admin-ui`;
- `backend/tests/api/admin-ui`;
- optional frontend assets inside `backend/src/admin/assets`.

Acceptance criteria:

- admin UI served by backend origin;
- access token kept in memory only;
- refresh handled by HttpOnly cookie;
- editor UI hides publish/delete/user/audit controls;
- server still enforces permissions.

Tests:

- admin UI smoke;
- route protection;
- role-rendering checks;
- no token localStorage usage check.

Explicit out-of-scope:

- GitHub Pages admin;
- customer cabinet;
- frontend root integration.

Rollback boundary:

- revert `backend/src/admin` and admin UI serving route.

### B8 frontend adapter

Scope:

- introduce controlled frontend API adapter;
- keep `assets/js/data.js` fallback;
- catalog/categories can read from API when configured;
- no auth/admin in GitHub Pages.

Files/modules:

- `assets/js/main.js`;
- `assets/js/data.js`;
- optional small frontend adapter file if explicitly approved in B8;
- related docs/tests.

Acceptance criteria:

- current static behavior remains available if API is unavailable;
- public catalog works from backend API when enabled;
- no secrets in frontend;
- no admin token in frontend;
- no localStorage behavior removed for out-of-scope lead/status/support flows.

Tests:

- frontend regression boundary;
- API unavailable fallback;
- catalog API success path;
- no draft/deleted leakage in rendered catalog.

Explicit out-of-scope:

- leads/status/support API integration;
- admin UI on GitHub Pages;
- payment integration.

Rollback boundary:

- revert B8 frontend adapter changes only.

### B9 hardening and release preparation

Scope:

- final security pass;
- CORS verification;
- rate limit verification;
- production env checklist;
- Render/Supabase smoke preparation;
- Render Root Directory and monorepo trigger verification;
- Supabase Session pooler/runtime connection verification;
- seed snapshot verification;
- storage cleanup queue verification;
- release readiness report.

Files/modules:

- backend config;
- backend tests;
- deployment documentation;
- release checklist;
- Render environment checklist.

Acceptance criteria:

- tests pass;
- Render Root Directory is `backend`;
- Render `NODE_VERSION=22.23.1` is configured;
- backend deploy trigger ignores changes outside `/backend`;
- production build/runtime does not read files outside `/backend`;
- Supavisor Session pooler or verified direct connection is documented;
- transaction pooler port `6543` is not the default;
- environment variable checklist complete;
- no secrets in repo;
- no deploy without owner approval;
- GitHub Pages frontend still works independently;
- backend release smoke plan approved.

Tests:

- full backend test suite;
- health smoke;
- auth smoke;
- public catalog smoke;
- admin permission smoke;
- upload negative smoke;
- cleanup job smoke;
- seed snapshot verification smoke;
- Render monorepo config review.

Explicit out-of-scope:

- actual deploy unless owner gives explicit deploy task;
- frontend redesign;
- payment/CRM/Telegram integrations.

Rollback boundary:

- revert hardening config changes from B9;
- disable Render service if a separate approved deploy task later creates one.

## 18. Acceptance criteria

B0 document acceptance:

- this document exists at `docs/WEB00_BACKEND_B0_TECHNICAL_SPEC.md`;
- no backend code exists as part of B0 document task;
- no `/backend` folder is created by this document task;
- no frontend file is changed by this document task;
- no workflow file is changed by this document task;
- no dependencies are installed by this document task;
- Node.js, TypeScript, Prisma, ESM and PrismaPg adapter contracts are fixed;
- Render monorepo Root Directory and env contract are fixed;
- scope is limited to catalog/categories/images/auth/admin/audit logs;
- requests, responses, auth, role and errors are defined for every approved endpoint;
- admin/editor permissions are unambiguous;
- destructive actions are admin-only;
- category deletion behavior is fixed as `409 CATEGORY_IN_USE`;
- public API excludes draft, inactive and deleted records;
- image storage uses Supabase Storage and forbids local persistent uploads;
- legacy seed keeps current IDs as canonical slugs;
- production seed reads only the JSON snapshot inside `/backend`;
- storage cleanup jobs are modeled for non-transactional Supabase object deletion;
- each future delivery phase has scope, files/modules, acceptance criteria, tests, explicit out-of-scope and rollback boundary.

Implementation acceptance for the first backend release:

- B1 through B9 gates pass;
- all required tests pass;
- Render backend and GitHub Pages frontend remain independently deployable;
- Render backend uses Root Directory `backend`;
- no root package manifest is introduced;
- no secret values are committed;
- owner approves any deploy separately.

## 19. Explicit non-goals

The following are not part of the first backend release:

- lead submission API;
- lead status API;
- project timeline API;
- support message API;
- bug report API;
- client cabinet;
- public user registration;
- payments;
- Redis;
- CRM;
- Telegram integration;
- MAX integration;
- VK integration;
- email delivery integration;
- local persistent upload directory;
- GitHub Pages admin panel;
- root application package;
- frontend redesign;
- workflow rewrite;
- mobile app store distribution.

## 20. Remaining non-blocking questions

These questions do not block B1 scaffold work, but must be answered before public release:

- Final production backend origin: `api.web00.pro`, `admin.web00.pro`, or a Render subdomain during preview.
- Password hash implementation: Argon2id preferred; bcrypt allowed only after Render compatibility check.
- Initial admin user creation method: one-time seed command or Render console task.
- Supabase bucket names and retention policy.
- Whether `editor` can edit already published site content as draft changes requiring admin publish, or only edit unpublished drafts.
- Exact trusted admin/system workflow for changing `views` before a separate analytics task exists.
