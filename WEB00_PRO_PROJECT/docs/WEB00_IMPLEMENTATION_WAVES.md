# WEB00 Implementation Waves

Дата: 2026-07-03  
Назначение: порядок реализации WEB00 Pro 2.0 без хаотичных правок.

## Wave 0 — Stabilize Current Project

Цель: очистить состояние проекта перед новой разработкой.

Файлы:

- git state;
- `.gitignore`;
- untracked assets;
- docs.

Что менять:

- классифицировать modified/untracked;
- решить, что production asset, а что evidence/mockup;
- настроить safe.directory владельцем.

Что не менять:

- backend;
- визуал страниц;
- pricing copy без решения.

DoD:

- понятный `git status`;
- нет случайных attachments/screenshots in staged;
- roadmap/docs сохранены.

Риски:

- потерять текущие экспериментальные hero assets;
- случайно закоммитить `Макеты/` или `.codex-remote-attachments/`.

## Wave 1 — Light Premium Tokens / Shell

Цель: закрепить единый light premium foundation.

Файлы:

- `assets/css/tokens.css`;
- future base/shell CSS;
- header/footer docs.

Что менять:

- подключить tokens на 1-2 низкорисковые страницы;
- выровнять buttons/footer/header contract;
- начать разделение `styles.css`.

Что не менять:

- hero главной;
- каталог карточек;
- backend.

DoD:

- light tokens работают;
- dark/neon не управляет premium pages;
- shell не расходится.

Риски:

- глобальная CSS-правка может сломать mobile.

## Wave 2 — Homepage Rebuild

Цель: привести главную к финальному product-level mockup.

Файлы:

- `index.html`;
- home CSS;
- hero device assets.

Что менять:

- убрать test naming из production;
- собрать один hero visual;
- сохранить mobile-approved раскладку;
- humanize trust labels.

Что не менять:

- pricing model;
- backend;
- каталог logic.

DoD:

- главная соответствует light premium canon;
- нет двойного scroll;
- hero visual не вылезает;
- CTA ведёт в core loop.

Риски:

- regression в mobile desktop-mode;
- conflict `home-premium.css` vs `home-1to1-test.css`.

## Wave 3 — Catalog Rebuild

Цель: сделать каталог настоящим curated showcase.

Файлы:

- `solutions.html`;
- `catalog-premium.css`;
- `assets/js/main.js` только если нужен data-driven markup;
- `assets/js/data.js` только для данных.

Что менять:

- filters;
- card layout;
- detail modal;
- compare-ready structure.

Что не менять:

- не hard-code cards;
- не ломать `DATA.SOLUTIONS`;
- не добавлять backend.

DoD:

- filters работают;
- demo работает;
- launch ведёт в `brief.html?solution=...`;
- cards выглядят из premium system.

Риски:

- сломать card click/action conflict;
- сломать demo modal.

## Wave 4 — Demo + Compare + Подбор

Цель: усилить выбор сайта.

Файлы:

- catalog/detail/demo JS;
- compare component CSS;
- future recommendation logic.

Что менять:

- demo preview policy;
- fallback open separately;
- compare 2-3 sites;
- "не знаете, что выбрать?" flow.

Что не менять:

- backend;
- реальные рекомендации AI без модели.

DoD:

- demo не уводит пользователя без возврата;
- compare понятен на mobile;
- подбор ведёт к brief/catalog.

Риски:

- modal complexity;
- iframe mobile UX.

## Wave 5 — Brief Stepper

Цель: превратить анкету в стабильный 4-step launch flow.

Файлы:

- `brief.html`;
- `brief-premium.css`;
- `main.js` brief logic;
- later upload adapter.

Что менять:

- stepper;
- autosave draft;
- summary panel;
- validation copy;
- success screen.

Что не менять:

- real upload/backend до API contract.

DoD:

- `solution/tariff/service` context сохраняется;
- submit создаёт проект;
- success ведёт в status;
- mobile readable.

Риски:

- потерять selected context;
- сделать форму слишком тяжёлой.

## Wave 6 — Status / Cabinet Shell

Цель: подготовить кабинет проекта без fake backend.

Файлы:

- `status.html`;
- `status-premium.css`;
- status functions in `main.js`;
- future `cabinet.html`.

Что менять:

- timeline;
- next action;
- project passport;
- materials placeholder;
- history.

Что не менять:

- auth/payment/backend claims.

DoD:

- missing/found/not-found states работают;
- wording честный;
- future cabinet structure ясна.

Риски:

- overpromise real account;
- XSS in rendered localStorage fields.

## Wave 7 — Pricing / FAQ / Contacts

Цель: закрыть возражения и коммерческие условия.

Файлы:

- `pricing.html`;
- `faq.html`;
- `contacts.html`;
- corresponding CSS/data.

Что менять:

- pricing copy;
- FAQ price clarity;
- contact/help CTAs;
- status lookup UX.

Что не менять:

- main tariff canon без решения.

DoD:

- Start/Business/Pro ясны;
- low-tier не конфликтует;
- contact actions не ломают core loop.

Риски:

- смешать premium и low-tier цены.

## Wave 8 — PWA / Install

Цель: быстрый мобильный доступ к статусу.

Файлы:

- `manifest.webmanifest`;
- service worker later;
- `install.html`;
- `app.html`;
- QR component.

Что менять:

- PWA install route;
- app shell;
- offline fallback later.

Что не менять:

- APK/RuStore.

DoD:

- install page понятна;
- QR после заявки/status/contact;
- no hero QR.

Риски:

- premature app promises;
- service worker cache bugs.

## Wave 9 — Backend Contract

Цель: подготовить API без переписывания UI.

Файлы:

- API spec docs;
- `LeadService`/adapter later;
- data contract.

Что менять:

- отделить localStorage adapter;
- описать endpoints;
- error model.

Что не менять:

- UI визуал без необходимости.

DoD:

- можно заменить localStorage на API;
- payload schemas есть;
- consent/security учтены.

Риски:

- завязать UI напрямую на backend.

## Wave 10 — Backend / Admin Later

Цель: реальная система управления.

Состав:

- leads;
- statuses;
- materials;
- admin roles;
- audit log;
- notifications;
- anti-spam.

DoD:

- real persistence;
- admin MFA;
- logs;
- no secrets frontend.

Риски:

- security debt;
- privacy mistakes.

## Wave 11 — QAMax

Цель: финальная проверка после clean frontend/backend.

Что проверять:

- all pages;
- core flow;
- mobile/tablet/desktop;
- browser matrix;
- performance;
- accessibility;
- SEO;
- security smoke.

DoD:

- no P0/P1;
- known limitations documented;
- deploy candidate ready.

Риски:

- запускать слишком рано и получить шум вместо полезного QA.

