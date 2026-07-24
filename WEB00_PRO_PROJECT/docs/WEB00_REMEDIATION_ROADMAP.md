# WEB00 Remediation Roadmap

Дата: 2026-07-03  
Цель: привести WEB00 из frontend-preview к чистой базе для backend-интеграции и будущего QAMax.

## Волна 0. Stop / Stabilize

Цель: не потерять текущие правки и не закоммитить мусор.

1. Исправить git ownership/safe.directory для `D:\Backend\Сайт`.
2. Проверить local `user.name/user.email` и GitHub auth.
3. Разобрать dirty state:
   - `index.html`
   - `assets/css/home-1to1-test.css`
   - `assets/js/main.js`
   - untracked hero assets
   - `home-1to1-test.html`
   - `.codex-remote-attachments/`
   - `Макеты/`
4. Решить, какие untracked assets являются production.
5. Обновить `.gitignore` при необходимости.

Exit criteria:

- git status понятный
- production файлы отделены от evidence/mockups
- нет случайных screenshots/attachments в staged

## Волна 1. Frontend Architecture Cleanup

Цель: убрать смешение старого тёмного и нового светлого слоя.

1. Разделить `assets/css/styles.css`:
   - base/reset/shell/common
   - legacy dark styles
2. Убедиться, что public premium pages не зависят от dark tokens.
3. Переименовать/нормализовать `home-1to1-test.css`, если он остаётся production.
4. Отключить или очистить `home-premium.css`, если он больше не отвечает за главную.
5. Вынести shared tokens:
   - colors
   - typography
   - radii
   - spacing
   - breakpoints
   - buttons
6. Свести footer/header к одному контракту.

Exit criteria:

- нет live-зависимости от dark/neon variables на premium pages
- одна система кнопок
- один footer spec
- одна nav spec

## Волна 2. Product / Content Alignment

Цель: привести коммерческую модель к постановке продукта.

1. Утвердить тарифную сетку:
   - Мини-сайт от 7 000
   - Лендинг от 12 000
   - Каталог/витрина от 15 000
   - Telegram-бот от 3 000
   - Поддержка от 500/мес
2. Обновить `DATA.PRICING` и pricing UI единым способом.
3. Сверить все CTA:
   - order/start -> `brief.html`
   - question/contact -> modal/contact
4. Согласовать wording:
   - анкета
   - заявка
   - демо
   - запуск
   - поддержка
5. Решить судьбу `landings/*` и `demos/*`.

Exit criteria:

- pricing совпадает с бизнес-моделью
- нет противоречивых цен
- нет старого Telegram-bot positioning в каталоге, если не утверждено

## Волна 3. Backend Contract Preparation

Цель: подготовить frontend к backend без переписывания всего.

1. Описать API endpoints:
   - create lead
   - get lead status
   - update lead mock/admin later
   - bug report/contact
2. Описать payload schemas.
3. Выделить adapter layer:
   - localStorage adapter сейчас
   - API adapter потом
4. Зафиксировать error states:
   - offline
   - validation fail
   - server fail
   - duplicate/invalid id
5. Подготовить privacy/consent fields.

Exit criteria:

- можно заменить localStorage на API без переделки UI
- все формы имеют стабильные names/ids
- status page понимает server statuses

## Волна 4. Responsive / Cross-browser Consolidation

Цель: перестать чинить каждую страницу отдельно.

1. Утвердить breakpoint grid:
   - mobile small
   - mobile normal
   - tablet portrait
   - tablet landscape
   - desktop
   - wide
2. Проверить:
   - normal mobile
   - mobile desktop mode
   - landscape
   - 1024 tablet
   - 1160 desktop baseline
   - 1440/1920
3. Унифицировать:
   - headings
   - card paddings
   - button radii
   - footer layout
   - table overflow behavior

Exit criteria:

- нет горизонтального scroll
- страницы выглядят из одной системы
- demo viewer имеет понятный mobile/desktop режим

## Волна 5. SEO / Accessibility / Performance

Цель: финальный frontend hardening.

1. SEO:
   - title/description/canonical/OG/Twitter
   - sitemap/robots
   - favicon/webmanifest если нужно
2. A11Y:
   - keyboard nav
   - focus trap
   - focus visible
   - aria-expanded/aria-controls
   - modal labels
3. Performance:
   - CSS cleanup
   - image sizing/aspect-ratio
   - lazy loading
   - reduce duplicated CSS
4. Security:
   - no secrets
   - safe rendering of user input
   - XSS smoke

Exit criteria:

- node checks pass
- diff check pass
- Lighthouse/Core Web Vitals acceptable
- no console errors
- no failed resources

## Волна 6. Final QAMax

Запускать только после волн 0-5.

Scope:

- all root pages
- landings/demos if they remain public
- full funnel
- mobile/tablet/desktop
- Chromium/Edge/Firefox/WebKit where available
- real device limitations documented

