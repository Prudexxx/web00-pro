# WEB00 Wave 6.1 PWA Install Readiness Report

## 1. Executive summary
- Added production PNG PWA icons for 192x192, 512x512 and a separate 512x512 maskable icon.
- Updated `manifest.webmanifest` with installability fields, PNG icons, shortcuts and `prefer_related_applications: false`.
- Updated `install.html` so regular users can understand iPhone, Android and desktop install paths without technical PWA wording.
- Updated `app.html` with a clear install entry and frontend-only note.
- Updated `sw.js` cache version and added static icon assets to the safe shell cache.
- Remaining limitations: production HTTPS install prompt, real iOS/Android device install behavior and QR generation still need later verification.

## 2. Created icon assets

| File | Size | Purpose | Valid |
|---|---:|---|---|
| `assets/icons/web00-icon-source.svg` | vector | Source mark | YES |
| `assets/icons/web00-icon-192.png` | 192x192 | Manifest regular icon | YES |
| `assets/icons/web00-icon-512.png` | 512x512 | Manifest regular icon | YES |
| `assets/icons/web00-maskable-512.png` | 512x512 | Manifest maskable icon | YES |

## 3. Manifest audit

| Field | Expected | Actual | Result |
|---|---|---|---|
| `name` | `WEB00` | `WEB00` | PASS |
| `short_name` | `WEB00` | `WEB00` | PASS |
| `description` | business/status/support description | `Готовые сайты для бизнеса, статус проекта и поддержка.` | PASS |
| `start_url` | `app.html` | `app.html` | PASS |
| `scope` | `./` | `./` | PASS |
| `display` | `standalone` | `standalone` | PASS |
| `background_color` | `#f7f2ea` | `#f7f2ea` | PASS |
| `theme_color` | `#8E0F13` | `#8E0F13` | PASS |
| `prefer_related_applications` | `false` | `false` | PASS |
| `icons` | 192/512/maskable PNG | 3 PNG icons | PASS |
| `shortcuts` | cabinet/status/catalog/brief | cabinet/status/catalog/brief | PASS |

## 4. Maskable icon
- File: `assets/icons/web00-maskable-512.png`
- Purpose: `maskable`
- Safe-zone notes: the visual mark is centered with extra padding on a warm light background, so launchers can crop it without cutting the WEB00 mark.
- Limitations: final launcher crop still needs real Android device/browser verification.

## 5. Service worker audit

What is cached:
- `index.html`
- `app.html`
- `install.html`
- `status.html`
- `cabinet.html`
- shell CSS layers
- PWA icon PNG files

What is not cached:
- personal data;
- API;
- uploads;
- project data;
- localStorage data.

The service worker remains network-first for HTML/navigation and cache-first fallback for static shell assets. Cache version was updated to `web00-shell-v2`.

## 6. Install page updates
- iPhone/iPad: clear browser/share/add-to-home-screen steps.
- Android: clear install button and browser-menu fallback steps.
- Desktop: Chrome/Edge install path plus QR fallback.
- QR placeholder: kept as placeholder, no fake QR generation.
- Honest APK wording: `Это веб-приложение. Отдельный APK не нужен на первом этапе.`

## 7. App shell updates
- Links: `Мой проект`, `Статус проекта`, `Анкета на запуск сайта`, `Каталог сайтов`, `Поддержка`, `Установить на телефон`.
- Frontend-only note: `Вход и уведомления будут подключены позже. Сейчас это безопасная веб-оболочка.`

## 8. Checks
- JS: `node --check assets/js/main.js`, `assets/js/data.js`, `sw.js` PASS.
- Manifest JSON: PASS.
- Icon dimensions: `192x192`, `512x512`, `512x512 maskable` PASS.
- Local smoke: HTTP 200 for `install.html`, `app.html`, `status.html`, `cabinet.html`, `index.html`.
- Service worker syntax: PASS.
- Diff check: PASS, only Git CRLF warnings.
- Visual/horizontal-scroll note: no Playwright/QAMax/Lighthouse was run by instruction; browser-level horizontal-scroll verification should be part of a later visual smoke pass.

## 9. Remaining future work
- HTTPS production install test;
- Android Chrome install prompt;
- iOS Add to Home Screen test;
- real QR code generation if needed;
- push notifications later;
- auth later;
- app store packaging later only if business need.
