# WEB00 Wave 4 Light Premium Alignment Report

## 1. Executive summary

- Выровнены ключевые коммерческие страницы: `index.html`, `solutions.html`, `pricing.html`.
- Главная стала понятнее: каталог готовых сайтов, анкета и запуск вынесены в первый сценарий.
- Каталог усилен как curated showcase: подзаголовок и счётчик говорят о готовых сайтах, не о шаблонах.
- Тарифы приведены к Start / Business / Pro с ценами 39 000 / 69 000 / 99 000 ₽ и понятным CTA.
- Публичные формулировки `Performance`, `Accessibility`, `SEO-база`, `SEO-ready` убраны из видимых коммерческих экранов.

Ready: YES with known risks.

## 2. Pages updated

| Page | Changes |
|---|---|
| `index.html` | Hero CTA заменены на `Смотреть каталог` и `Подобрать сайт`; подзаголовок говорит про готовый сайт и анкету; trust strip и quality passport переведены на понятный русский язык; final CTA заменён на `Заполнить анкету`. |
| `solutions.html` | Подзаголовок переписан под путь `готовый сайт → демо → анкета`; счётчик заменён с `шаблонов` на `сайтов`. |
| `pricing.html` | Meta/hero/таблица/скрытый calculator copy очищены от `SEO-база` и `Получить расчёт`; CTA приведены к `Выбрать тариф`. |

Additional text-only support:

| File | Changes |
|---|---|
| `assets/js/data.js` | `SEO-база` в Start заменена на `Готов к продвижению`; FAQ price answer приведён к тарифам Start / Business / Pro. |
| `assets/js/main.js` | Text-only update for generated pricing/catalog CTA: `Выбрать тариф`, `Запустить`; old `Performance 90+` / `SEO-ready` translation values removed from public i18n strings. No business logic changed. |

## 3. Copy language cleanup

| Before | After | Where |
|---|---|---|
| `Выберите шаблон` | `Смотреть каталог` | `index.html` hero CTA |
| `Смотреть демо` as secondary hero CTA | `Подобрать сайт` | `index.html` hero CTA |
| `Performance 90+` | `Быстро загружается` | `index.html`, `assets/js/main.js` |
| `SEO-ready` | `Готов к продвижению` | `index.html`, `assets/js/main.js` |
| `Accessibility` | `Удобен на телефоне` | `index.html` quality passport |
| `Проверить` | `Заполнить анкету` | `index.html` process step |
| `Популярные шаблоны` | `Популярные готовые сайты` | `index.html` |
| `Паспорт качества (QA)` | `Паспорт качества` | `index.html` |
| `Найдено шаблонов` | `Найдено сайтов` | `solutions.html` |
| `SEO-база` | `Готов к продвижению` / `Готов к продвижению` table row | `pricing.html`, `assets/js/data.js` |
| `Получить расчёт` | `Заполнить анкету` | `pricing.html` hidden calculator actions |
| `Выбрать` | `Выбрать тариф` | generated pricing cards |

Static search notes:

- `localStorage` remains in `assets/js/main.js` and `assets/js/data.js` as implementation code, not visible UI copy.
- `Accessibility` remains only as a developer comment in `assets/css/tokens.css`.
- Catalog solution prices like `7 000`, `12 000`, `15 000` remain in `DATA.SOLUTIONS`; they are catalog card prices, not the main pricing block.

## 4. Pricing alignment

| Item | Expected | Actual after wave |
|---|---|---|
| Start | 39 000 ₽ | `от 39 000 ₽` |
| Business | 69 000 ₽ | `от 69 000 ₽` |
| Pro | 99 000 ₽ | `от 99 000 ₽` |
| Low-tier prices in main pricing block | none | none |
| Comparison table jargon | no `SEO-база` | `Готов к продвижению` |

## 5. CTA alignment

| Location | CTA |
|---|---|
| Header | `Выбрать сайт` |
| Home hero primary | `Смотреть каталог` |
| Home hero secondary | `Подобрать сайт` |
| Home cards | `Смотреть демо`, `Запустить` |
| Home pricing preview | `Выбрать тариф` |
| Home final | `Заполнить анкету` |
| Catalog cards | `Смотреть демо`, `Запустить` |
| Pricing hero | `Выбрать тариф`, `Посмотреть каталог` |
| Pricing cards | `Подробнее`, `Выбрать тариф` |

## 6. Responsive smoke

| Viewport | Result | Notes |
|---|---|---|
| 1440x900 | PASS | `index.html`, `solutions.html`, `pricing.html` loaded with no browser error logs. |
| 1024x768 | PASS | `index.html`, `solutions.html`, `pricing.html` loaded with no browser error logs. |
| 390x844 | PASS | `index.html`, `solutions.html`, `pricing.html` loaded with no browser error logs. |

Smoke method: local static server + in-app browser direct navigation. No QAMax, no Lighthouse, no Playwright, no video.

## 7. Risks remaining

- `styles.css` is still transitional.
- `home-premium.css` is still connected on `index.html`.
- `web00-tabs-standard.css` is still a patch layer.
- Header/footer are still duplicated manually.
- `localStorage` remains in source JS as frontend-preview storage implementation.
- `DATA.SOLUTIONS` still contains lower catalog prices; main Start / Business / Pro pricing is aligned.
- Some i18n dictionary keys keep technical internal names, but visible values were cleaned.
- Backend is not connected.
- Cabinet/PWA later.

## 8. Next recommendation

Wave 5 — Brief / Status / Cabinet Frontend Shell.

