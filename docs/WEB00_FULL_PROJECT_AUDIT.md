# WEB00 Full Project Audit

Дата аудита: 2026-07-03  
Рабочая папка: `D:\Backend\Сайт`  
Режим: чтение и документация, без исправления продукта, без commit/push/deploy.

## 1. Executive Summary

WEB00 сейчас является статическим frontend-preview проектом на HTML/CSS/JavaScript. Основная публичная воронка уже собрана: главная, каталог, тарифы, анкета, статус, FAQ, контакты, кейсы и юридические страницы. Проект визуально движется в сторону светлого premium-стиля, но кодовая база остаётся смешанной: старая тёмная база, несколько premium-слоёв, тестовый 1:1 слой главной и ручные дубли шапки/футера живут одновременно.

Строгий вердикт:

- Product Candidate: **NO**
- Frontend Candidate: **NO / partial**
- GitHub Pages Preview Ready: **NO для текущего локального состояния**
- Backend Ready: **NO**
- QAMax Ready: **NO, сначала нужен cleanup P0/P1**

Главная причина: проект функционально полезен как preview, но ещё не стабилизирован как чистый frontend foundation для подключения backend. Есть грязное git-состояние, тестовый production-слой `home-1to1-test.css`, старая тёмная база `styles.css`, несогласованные токены, дубли шапки/футера, несостыковки тарифной модели и локальные untracked/modified файлы.

## 2. Git / Repository State

Репозиторий есть, но обычный `git status` ранее упирался в `dubious ownership` для `D:/Backend/Сайт`. Для чтения использовался безопасный read-only вариант:

```powershell
git -c safe.directory="D:/Backend/Сайт" status --short
```

Последнее зафиксированное состояние:

```text
 M assets/css/home-1to1-test.css
 M assets/js/main.js
 M index.html
?? .codex-remote-attachments/
?? assets/img/previews/web00-hero-devices-generated.png
?? assets/img/previews/web00-hero-devices-premium.svg
?? assets/img/previews/web00-home-desktop-clean.svg
?? assets/img/previews/web00-home-desktop-device.png
?? assets/img/previews/web00-home-mobile-clean.svg
?? assets/img/previews/web00-home-mobile-device.png
?? home-1to1-test.html
?? Макеты/
```

Ветка: `main`  
Remote: `origin https://github.com/kattta222-cmd/web00-pro.git`

Последние известные коммиты:

```text
57808ab fix: polish WEB00 mobile frontend
5d2c085 chore: finalize WEB00 frontend product polish
b38f5d5 fix: rebuild WEB00 status dashboard
c808e3b fix: align WEB00 home pricing and brief density
1bed57f fix: stabilize WEB00 header footer nav and mobile controls
```

Риск: до исправления ownership/local author и очистки статуса коммитить нельзя.

## 3. File Inventory

### Root HTML

| Файл | Назначение | Состояние |
|---|---|---|
| `index.html` | Главная WEB00 | Активная, подключает 3 CSS-слоя |
| `solutions.html` | Каталог готовых сайтов | Активная |
| `pricing.html` | Тарифы | Активная |
| `brief.html` | Анкета на запуск сайта | Активная |
| `status.html` | Статус заявки / кабинет проекта | Активная |
| `services.html` | Услуги | Активная публичная |
| `how-it-works.html` | Как проходит запуск | Активная публичная |
| `faq.html` | FAQ | Активная публичная |
| `contacts.html` | Контакты | Активная публичная |
| `cases.html` | Кейсы | Активная публичная |
| `privacy-policy.html` | Политика конфиденциальности | Активная legal |
| `consent-personal-data.html` | Согласие на обработку данных | Активная legal |
| `home-1to1-test.html` | Тестовый макет 1:1 | Untracked/dev artifact, не должен попасть в production без решения |

### Landings

`landings/cleaning.html`, `landings/drova.html`, `landings/krovlya.html`, `landings/massage.html`, `landings/mebel.html`, `landings/odezhda.html`, `landings/telegram-bot.html`, `landings/uslugi.html`.

Все эти страницы выглядят как старый слой/дочерние лендинги: подключают только `../assets/css/styles.css`, без JS, без нового page-specific premium CSS.

### Demos

`demos/cleaning/index.html`, `demos/delivery/index.html`, `demos/krovlya/index.html`, `demos/massage/index.html`, `demos/odezhda/index.html`, `demos/telegram-bot/index.html`, `demos/uslugi/index.html`.

Все используют `../demo.css`. `demos/telegram-bot/index.html` имеет `dark-demo site-frame`, остальные в основном `site-frame`.

### Assets

CSS:

- `assets/css/styles.css`
- `assets/css/home-premium.css`
- `assets/css/home-1to1-test.css`
- `assets/css/catalog-premium.css`
- `assets/css/pricing-premium.css`
- `assets/css/brief-premium.css`
- `assets/css/status-premium.css`
- `assets/css/public-premium.css`
- `assets/css/web00-tabs-standard.css`

JS:

- `assets/js/data.js`
- `assets/js/main.js`

Images:

- `assets/img/favicon.svg`
- `assets/img/previews/*`
- `assets/img/solution-gallery/*`

Potential orphan/dev assets:

- `assets/img/previews/web00-hero-devices-generated.png`
- `assets/img/previews/web00-hero-devices-premium.svg`
- `assets/img/previews/web00-home-desktop-clean.svg`
- `assets/img/previews/web00-home-desktop-device.png`
- `assets/img/previews/web00-home-mobile-clean.svg`
- `assets/img/previews/web00-home-mobile-device.png`

Некоторые из этих файлов могут быть рабочими для текущего hero главной, но они untracked и должны быть явно классифицированы: production asset или мусор.

## 4. CSS Architecture

### Подключения ключевых страниц

`index.html`:

1. `assets/css/styles.css`
2. `assets/css/home-premium.css`
3. `assets/css/home-1to1-test.css?v=clean-device-shell-1`

`solutions.html`:

1. `assets/css/styles.css`
2. `assets/css/catalog-premium.css?v=catalog-system-2`
3. `assets/css/web00-tabs-standard.css`

`pricing.html`:

1. `assets/css/styles.css`
2. `assets/css/pricing-premium.css?v=pricing-typography-unify-1`
3. `assets/css/web00-tabs-standard.css`

`brief.html`:

1. `assets/css/styles.css`
2. `assets/css/brief-premium.css`
3. `assets/css/web00-tabs-standard.css`

`status.html`:

1. `assets/css/styles.css`
2. `assets/css/status-premium.css`
3. `assets/css/web00-tabs-standard.css`

Public/legal pages:

1. `assets/css/styles.css`
2. `assets/css/public-premium.css`
3. `assets/css/web00-tabs-standard.css`

### Тёмная база

`assets/css/styles.css` содержит старую тёмную систему:

- `:root` в начале файла с `--bg: #050812`
- `--blue`, `--violet`, `--glow-red`, `--glow-violet`
- `body` с radial-gradient / тёмной базой
- поздние повторные `:root` и `body` с `Manrope`

Это **живой подключённый файл**, потому он не мёртвый. Даже если premium-страницы перебивают часть правил, риск каскада остаётся.

### Светлый premium layer

Светлая premium-система размазана по отдельным файлам:

- главная: `home-1to1-test.css`
- каталог: `catalog-premium.css`
- тарифы: `pricing-premium.css`
- анкета: `brief-premium.css`
- статус: `status-premium.css`
- публичные страницы: `public-premium.css`
- дополнительный мобильный/табличный слой: `web00-tabs-standard.css`

Единого `tokens.css` нет. CSS-переменные объявлены в нескольких файлах и частично конфликтуют по смыслу.

### Главная и dead layer

Главная разметка использует `mock-*` классы. Их фактически рисует `assets/css/home-1to1-test.css`.  
`assets/css/home-premium.css` на текущей главной частично живой только для общих хуков вроде menu/footer, но как основная home-система он является подключённым legacy/dead layer.

## 5. Design System / Tokens

Есть несколько параллельных систем:

- old dark tokens в `styles.css`
- mock home tokens в `home-1to1-test.css`
- page-local tokens в `catalog/pricing/brief/status/public`

Вывод: дизайн-система не централизована. Любая новая страница рискует попасть в другую визуальную вселенную, если подключить не тот слой или не перебить `styles.css`.

## 6. Typography

Подключения:

- `public-premium.css`: Google import `Inter` + `Playfair Display`
- `brief-premium.css`: Google import `Manrope` + `Playfair Display`
- `styles.css`: использует `Inter` и позднее `Manrope`
- `home-1to1-test.css`: задаёт serif/sans через переменные, фактически близко к premium mockup

Риск: разные страницы могут иметь разные базовые sans-serif и разные размеры/line-height. Для frontend product final candidate нужен один typography contract.

## 7. Breakpoints / Responsive

Проект использует смешанный подход:

- `max-width` desktop-first в большинстве premium CSS
- отдельные `min-width` для wide/desktop refinements
- много page-specific точек: `1180`, `1120`, `1080`, `980`, `900`, `899`, `860`, `820`, `760`, `680`, `640`, `540`, `520`, `480`, `420`, `340`
- landscape-правила около `max-width: 940`

Единой responsive-сетки нет. Это объясняет, почему мобильная версия, режим "версия для ПК" на телефоне, планшет и desktop могут вести себя по-разному.

## 8. Layout / Containers

Контейнеры задаются отдельно:

- `styles.css`: `--container: 1320px`
- `home-1to1-test.css`: desktop mock ширина около `1161px`
- page CSS используют свои max-width / padding

Grid/flex активно используются, но без общего layout token. Основные риски:

- разные gutters между страницами
- разные карточные радиусы
- разные высоты секций
- несколько независимых footer layouts

## 9. Shared Components

Шапка и футер **дублируются вручную в каждом HTML**, include/шаблонизатора нет.

Burger:

- разметка: `data-menu-toggle`, `data-nav`
- управление: `assets/js/main.js`, функция `initShell()`
- логика: toggle класса/атрибутов, закрытие по клику nav-link

Риск: любое изменение шапки/футера нужно повторять во всех HTML. Это уже привело к серии ручных правок.

## 10. JavaScript Architecture

Точки входа:

- `assets/js/data.js` - данные каталога, тарифов, FAQ, lead/status mock storage
- `assets/js/main.js` - весь интерактив

Ключевые функции:

- `initShell()` - header/mobile menu
- catalog render/filter/card actions
- `openSolutionModal(solution)` - карточка решения
- `openDemoModal(solution)` - demo viewer / iframe
- `openLeadModal()` / `renderLeadForm()` / `submitLeadForm()`
- `initBriefPage()` - отдельная анкета
- `renderStatusPage()` / status lookup
- FAQ accordion/filter
- home language switcher

Архитектура монолитная: один `main.js` обслуживает все страницы. Это рабоче для preview, но при backend-интеграции лучше разделить хотя бы на domain modules или оставить строгие page guards.

## 11. Data Model

`assets/js/data.js` содержит:

- `SOLUTIONS`
- `SERVICES`
- `PRICING`
- `FAQ_ITEMS`
- `LEAD_STATUSES`
- `createLead`
- `getLeadStatus`
- `createBugReport`

Leads сохраняются в `localStorage`, реального backend/API нет.

## 12. Home Page Content Blocks

Текущая главная построена вокруг `mock-*` классов:

1. `mock-header`
2. `mock-hero`
3. `mock-device` / laptop+phone visual
4. `mock-trust`
5. `mock-steps`
6. `mock-templates`
7. `mock-proof`
8. `mock-quality`
9. `mock-pricing`
10. `mock-final`
11. `mock-footer`

Главная сейчас отдельная от остального проекта по CSS-архитектуре.

## 13. Hero Device Audit

Hero visual реализован не реальным изображением одного устройства, а смесью:

- HTML-разметка `mock-device`, `mock-laptop`, `mock-phone`
- CSS shell / background images в `home-1to1-test.css`
- pseudo-elements для тени/подставки/серого овала
- untracked изображения в `assets/img/previews/`

Проблема с "подставкой/серым овалом" находится именно в CSS-псевдоэлементах hero device shell, а не в бизнес-логике.

## 14. Catalog / Solutions

Каталог динамический: карточки не hard-coded, а рендерятся из `DATA.SOLUTIONS`.  
Это плюс для backend-ready направления. Нужно сохранить data-driven подход.

Риски:

- карточная верстка и filters завязаны на классы/атрибуты
- demo URL / gallery берутся из data
- любые изменения карточек должны сохранять `data-solution-id`, `data-open-demo`, `data-open-lead`, `data-card-action`

## 15. Pricing

Текущие тарифы задаются в `assets/js/data.js` как Start / Business / Pro:

- Start: `39 000`
- Business: `69 000`
- Pro: `99 000`

По новой продуктовой постановке ожидаются пакеты:

- Мини-сайт - от 7 000
- Лендинг - от 12 000
- Каталог/витрина - от 15 000
- Telegram-бот - от 3 000
- Поддержка - от 500/мес

Это P1 продуктовый конфликт: текущая pricing-модель не соответствует новой целевой коммерческой сетке.

## 16. Forms / Lead Flow

Текущий поток:

1. CTA ведёт на `brief.html` или открывает fallback modal
2. анкета валидируется на frontend
3. `DATA.createLead(data)` сохраняет запись в `localStorage`
4. success ведёт на `status.html?id=...`
5. `status.html` читает `DATA.getLeadStatus(id)`

Это корректно для frontend-preview, но не backend-ready. Нужны API contract, серверная валидация, persistence, anti-spam, privacy handling.

## 17. Demo Viewer / iframe

Demo viewer находится в `main.js`, открывает модалку и загружает demo/external URL в iframe.  
Есть риск на мобильных: сайт внутри iframe может открываться как mobile-версия, а пользователь ожидает desktop preview. Это продуктово решаемо через viewport wrapper или отдельный desktop preview mode, но сейчас это не backend-задача.

## 18. SEO / Metadata

Есть `robots.txt`, `sitemap.xml`, `humans.txt`, README.  
Точный статус canonical/OG/Twitter/meta по всем страницам требует отдельного SEO-чека. По текущему коду видно, что SEO не централизовано и не гарантировано для всех root/landing/demo страниц.

## 19. Accessibility / UX Risks

Основные риски:

- много custom modal/accordion/form controls в одном JS
- требуется проверка focus trap в модалках
- требуется проверка keyboard navigation
- требуется проверка visible focus states
- iframe demo на mobile может нарушать удобство
- скрытие scrollbars на главной может ухудшать UX

## 20. Security / Privacy Risks

Frontend-preview хранит заявки в `localStorage`. Это допустимо только как mock.  
Перед backend нужны:

- server-side validation
- sanitization
- CSRF/CORS policy
- rate limiting
- privacy policy alignment
- реальная обработка consent
- no secrets in frontend

## 21. Final Verdict

WEB00 в текущем виде - рабочий frontend-preview, но не чистый production frontend foundation. Перед backend-интеграцией нужно закрыть P0/P1: git hygiene, ownership, CSS architecture cleanup, pricing model, frontend mock storage boundaries, dead/test layers, shared header/footer strategy и backend contract.

