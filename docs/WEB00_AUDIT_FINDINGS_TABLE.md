# WEB00 Audit Findings Table

Дата: 2026-07-03  
Формат severity: P0 критично, P1 высокий риск, P2 средний риск, P3 косметика/долг.

## Сводка

| Severity | Count |
|---|---:|
| P0 | 4 |
| P1 | 12 |
| P2 | 12 |
| P3 | 6 |

## Таблица находок

| ID | Severity | Область | Находка | Доказательство | Риск | Рекомендация |
|---|---:|---|---|---|---|---|
| F-001 | P0 | Git | Обычный git может блокироваться из-за dubious ownership | `D:/Backend/Сайт`, ошибка `fatal: detected dubious ownership` | Нельзя безопасно коммитить/пушить без явной настройки | Исправить local safe.directory/ownership и проверить author |
| F-002 | P0 | Git | Рабочее дерево грязное | `M index.html`, `M assets/css/home-1to1-test.css`, `M assets/js/main.js`, untracked assets | Риск потерять/случайно закоммитить эксперимент | Разделить production changes и мусор, затем commit checkpoint |
| F-003 | P0 | Backend readiness | Backend отсутствует, заявки живут в localStorage | `assets/js/data.js` содержит `createLead/getLeadStatus` mock flow | Нельзя считать продукт production-ready | Сначала описать API contract, потом интегрировать |
| F-004 | P0 | Product pricing | Цены и пакеты не совпадают с новой постановкой | `DATA.PRICING`: Start/Business/Pro 39/69/99k | Коммерческая витрина может продавать не ту модель | Утвердить pricing map и обновлять data/UI едино |
| F-005 | P1 | CSS | Старый тёмный `styles.css` живой и подключён везде | `styles.css` содержит `#050812`, `--violet`, `--blue`, `--glow*` | Тёмные/неоновые остатки могут всплывать | Разделить base/reset и legacy dark layer |
| F-006 | P1 | CSS | Главная рисуется тестовым слоем | `index.html` подключает `home-1to1-test.css` | Production зависит от файла с test-названием | Переименовать/интегрировать как normal home CSS |
| F-007 | P1 | CSS | `home-premium.css` почти dead layer для текущей главной | Главная использует `mock-*`, основной CSS в `home-1to1-test.css` | Лишний каскад и непредсказуемые переопределения | Удалить/отключить после проверки общих хуков |
| F-008 | P1 | Design system | Нет единого `tokens.css` | Токены объявлены в нескольких CSS | Разные цвета/радиусы/шрифты между страницами | Вынести shared tokens |
| F-009 | P1 | Header/Footer | Header/footer вручную дублируются по HTML | Все root HTML содержат свой shell | Любая правка требует массового ручного изменения | Завести шаблон/генератор или строгий компонентный фрагмент |
| F-010 | P1 | Responsive | Нет единой сетки breakpoint | Много `max-width`/`min-width` в каждом CSS | Разъезды mobile/tablet/desktop | Утвердить 4-5 breakpoint tokens |
| F-011 | P1 | Home hero | Устройство в hero собрано из исторических слоёв | `mock-device`, pseudo-elements, untracked preview assets | Визуальные баги с овалом/подставкой/overflow | Сделать один чистый device component |
| F-012 | P1 | Demo viewer | Mobile iframe показывает demo как mobile-сайт | `openDemoModal`, iframe viewer | Пользователь ждёт desktop preview внутри demo | Добавить desktop preview mode или явный switch |
| F-013 | P1 | Forms | Нет серверной валидации/хранения | localStorage only | Потеря заявок, нельзя запускать реальные продажи | Backend API + validation + persistence |
| F-014 | P1 | SEO | SEO не централизовано | HTML руками, root/landing/demo разные | Страницы могут иметь неполные meta/canonical/OG | SEO audit и shared head contract |
| F-015 | P1 | Landings | `landings/*` живут на старом `styles.css` | подключают только `../assets/css/styles.css` | При переходе пользователь попадает в старую визуальную систему | Решить: удалить, перенести в demos или привести к premium |
| F-016 | P1 | Assets | Untracked production-like hero assets | `assets/img/previews/web00-home-*.png/svg` | Потеря при commit или мусор в repo | Классифицировать и staged только нужное |
| F-017 | P2 | Typography | Разные шрифты между слоями | Inter/Manrope/Playfair в разных CSS | Разная визуальная плотность | Один font contract |
| F-018 | P2 | CSS | `web00-tabs-standard.css` используется как общий patch layer | Подключён на многих страницах | Название не отражает назначение | Переименовать после стабилизации |
| F-019 | P2 | JS | `main.js` монолитный | Все page init/modal/status/catalog в одном файле | Сложно безопасно менять одну страницу | Добавить page guards/modules |
| F-020 | P2 | A11Y | Нужно проверить focus trap/keyboard modals | custom modals in `main.js` | Пользователь может застрять в modal/iframe | A11Y pass |
| F-021 | P2 | UX | Скрытие scrollbars на главной | `home-1to1-test.css` scrollbar rules | Desktop UX может быть странным | Вернуть native scrollbar или проверить |
| F-022 | P2 | Catalog | Dynamic cards завязаны на хуки | `data-solution-id`, `data-card-action` | Легко сломать card click/demo/brief | Зафиксировать contract в документации |
| F-023 | P2 | Status | Cabinet пока preview/localStorage | `status.html` + `DATA.getLeadStatus` | Пользователь может принять за реальный кабинет | Чёткая preview wording и backend roadmap |
| F-024 | P2 | Legal | Consent/privacy не связаны с серверной обработкой | frontend only | Юридическая логика неполная | Backend privacy workflow |
| F-025 | P2 | Performance | Много CSS слоёв на каждой странице | `styles.css` + page CSS + patch CSS | Лишний вес и cascade cost | CSS cleanup |
| F-026 | P2 | Data | Демо/галереи частично строятся динамическими путями | `solution-gallery/${name}.png` | Простые grep дают false orphan; риск битых путей | Добавить asset manifest/test |
| F-027 | P2 | Language | Языковой переключатель не является полной i18n-системой | home language switcher only | Ожидания мультиязычности не закрыты | Делать i18n отдельно, не патчами |
| F-028 | P2 | Sitemap | Нужна сверка sitemap с реальными страницами | `sitemap.xml` есть | Индексация может быть неполной | Сверить root/public/demo/landing |
| F-029 | P3 | Naming | `home-1to1-test.html` лежит в корне | untracked test HTML | Путает источник правды | Перенести в `_experiments` или удалить после решения |
| F-030 | P3 | Naming | `home-1to1-test.css` production-linked с test name | CSS filename | Непрофессиональная структура | Переименовать в `home.css`/`home-mockup.css` |
| F-031 | P3 | Cosmetics | Иконки/labels Performance/SEO на русском не унифицированы | home trust blocks | Мелкая языковая неоднородность | Словарь UI labels |
| F-032 | P3 | Cosmetics | Footer signature чувствителен на mobile | Много предыдущих правок footer | Может перетягивать внимание | Один footer spec |
| F-033 | P3 | Docs | Нет единого frontend contract | Правки делались итеративно | Повторный regressions risk | Добавить design/frontend spec |
| F-034 | P3 | QA | Скриншоты/QA артефакты вне repo могут разрастаться | `_qa`, `Сайт_qa`, attachments | Мусор на диске | Политика хранения evidence |

