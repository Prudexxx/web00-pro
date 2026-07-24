# WEB00 Wave 6 PWA / Install / Mobile Access Report

## 1. Executive summary

- Создана страница `install.html` для понятного сценария “Установить WEB00 на телефон”.
- Создана мобильная оболочка `app.html` с быстрым доступом к проекту, статусу, анкете, каталогу и поддержке.
- Добавлен `manifest.webmanifest` как installable web app foundation.
- Добавлен `sw.js` с минимальным shell/cache foundation.
- Manifest подключён на основных страницах Wave 6.
- Service worker регистрируется безопасно: только `https`, `localhost` или `127.0.0.1`.
- Backend, auth, push notifications, APK, RuStore/Play Market/App Store packaging не подключались.

## 2. Created files

| File | Purpose |
|---|---|
| `install.html` | Страница установки WEB00 на телефон и инструкции для iPhone/iPad, Android и desktop. |
| `app.html` | Frontend-only mobile shell для быстрого доступа к основным разделам. |
| `manifest.webmanifest` | Web app manifest: name, start_url, display, colors, shortcuts. |
| `sw.js` | Минимальный service worker для shell pages и базовых CSS. |
| `docs/WEB00_WAVE6_PWA_INSTALL_REPORT.md` | Отчёт по Wave 6. |

## 3. Install page

`install.html` показывает:

- H1 `Установить WEB00 на телефон`;
- объяснение про быстрый доступ к статусу проекта и кабинету;
- QR placeholder;
- CTA `Открыть на телефоне`;
- CTA `Перейти в мой проект`;
- инструкции для iPhone / iPad, Android и desktop;
- блок “Что можно делать с телефона”;
- честный блок: сейчас это веб-приложение, отдельный APK не нужен на первом этапе.

QR placeholder находится в карточке `.install-qr-card`.

## 4. App shell

`app.html` открывает:

- `cabinet.html` — Мой проект;
- `status.html` — Проверить статус;
- `brief.html` — Анкета на запуск сайта;
- `solutions.html` — Каталог сайтов;
- `contacts.html` — Поддержка.

Это frontend-only оболочка. Реальный вход и уведомления указаны как future, без обещания готовой функции.

## 5. Manifest

| Field | Value |
|---|---|
| `name` | `WEB00` |
| `short_name` | `WEB00` |
| `description` | `Готовые сайты для бизнеса, статус проекта и поддержка.` |
| `start_url` | `app.html` |
| `scope` | `./` |
| `display` | `standalone` |
| `background_color` | `#f7f2ea` |
| `theme_color` | `#8E0F13` |
| `icons` | `assets/img/favicon.svg` |
| `shortcuts` | `Мой проект`, `Статус`, `Каталог` |

Production TODO: добавить PNG icons 192/512 для максимальной совместимости браузеров и платформ.

## 6. Service worker

Кэшируется:

- `index.html`;
- `app.html`;
- `install.html`;
- `status.html`;
- `cabinet.html`;
- `assets/css/tokens.css`;
- `assets/css/base.css`;
- `assets/css/shell.css`;
- `assets/css/components.css`.

Что НЕ кэшируется:

- персональные данные;
- данные проекта;
- будущие API;
- файлы клиента;
- push/background sync сценарии.

Стратегия:

- install: cache basic shell;
- activate: cleanup old cache;
- fetch: network-first for HTML, cache-first for CSS/static shell assets.

## 7. Links added

| Page | Link |
|---|---|
| `index.html` | Footer link `Установить на телефон` → `install.html`. |
| `status.html` / generated status UI | Block `Открывать статус с телефона` → `install.html`. |
| `cabinet.html` | Card `Быстрый доступ` → `install.html`. |
| `contacts.html` | Help block `Хотите открыть WEB00 с телефона?` → `install.html`. |
| `brief.html` | Manifest connected. |
| `solutions.html` | Manifest connected. |

## 8. Mock/future

Future:

- реальные push-уведомления;
- auth;
- защищённый кабинет;
- offline project data;
- app store packaging;
- APK/RuStore only after web app foundation is stable.

## 9. Checks

- JS syntax: PASS.
- Manifest linked: PASS.
- Service worker registration guarded: PASS.
- Manifest JSON valid: PASS.
- Localhost smoke: PASS for HTTP availability of `install.html`, `app.html`, `status.html`, `cabinet.html`.
- Visual/horizontal-scroll smoke: not run in this wave because QAMax, Lighthouse and Playwright are explicitly forbidden.
- QAMax: not run by instruction.

## 10. Risks

- Install prompt differs by browser.
- `file://` cannot install the web app; localhost/HTTPS is required.
- HTTPS is required for real install outside local development.
- PNG icons 192/512 may need production assets.
- The service worker is intentionally minimal and must not cache future private project data.
