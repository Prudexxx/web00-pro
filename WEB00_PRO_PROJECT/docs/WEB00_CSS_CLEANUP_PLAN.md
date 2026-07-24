# WEB00 CSS Cleanup Plan

Дата: 2026-07-03  
Режим: план стабилизации, без текущего переписывания CSS.

## 1. Текущая CSS-карта

| Файл | Текущая роль | Класс |
|---|---|---|
| `assets/css/styles.css` | старая база + shell + legacy dark styles | legacy/live |
| `assets/css/home-premium.css` | старый premium home layer, частично живой для shell/footer | legacy/partial-live |
| `assets/css/home-1to1-test.css` | фактический renderer текущей главной `mock-*` | production candidate, плохо назван |
| `assets/css/catalog-premium.css` | каталог | production page-specific |
| `assets/css/pricing-premium.css` | тарифы | production page-specific |
| `assets/css/brief-premium.css` | анкета | production page-specific |
| `assets/css/status-premium.css` | статус/кабинет | production page-specific |
| `assets/css/public-premium.css` | services/how-it-works/cases/faq/contacts/legal | production shared public |
| `assets/css/web00-tabs-standard.css` | late shared mobile/table/tablet patch layer | production patch, misleading name |
| `assets/css/tokens.css` | новые shared tokens light premium WEB00 | prepared, not wired |

## 2. Что делать с `styles.css`

Проблема:

- живой подключённый файл;
- содержит `#050812`, `--violet`, `--blue`, `--glow*`;
- содержит старую dark/neon систему;
- одновременно содержит общие shell-правила.

План:

1. Не удалять резко.
2. Разделить в следующей волне:
   - `base.css` / `reset.css`
   - `shell.css`
   - `legacy-dark.css`
3. На premium pages оставить только base/shell.
4. Dark legacy подключать только там, где он реально нужен, если такие страницы останутся.

## 3. Что делать с `home-1to1-test.css`

Проблема:

- файл с `test` в названии подключён production-главной;
- он фактически рисует текущую главную;
- содержит много накопленных hero/device правок.

План:

1. После визуального freeze переименовать в `home.css` или `home-mockup.css`.
2. Обновить подключение в `index.html`.
3. Удалить/перенести `home-1to1-test.html` как experiment artifact.
4. Отделить device shell от page layout:
   - `home.css`
   - `device-preview.css` или компонентный блок внутри home.

## 4. Что делать с `home-premium.css`

Проблема:

- текущая разметка `index.html` использует `mock-*`;
- `home-premium.css` не является главным renderer для этой версии;
- частично живёт через shared classes вроде `menu-toggle` / `footer-credit`.

План:

1. Проверить все селекторы, реально совпадающие с текущей главной.
2. Перенести shared shell/footer bits в общий CSS.
3. После этого отключить `home-premium.css` от `index.html`.
4. Если внутри есть полезные решения, перенести точечно в production home CSS.

## 5. Что оставить page-specific

Оставить как page-specific:

- `catalog-premium.css`
- `pricing-premium.css`
- `brief-premium.css`
- `status-premium.css`
- `public-premium.css`

Но они должны использовать общий token contract:

- colors;
- fonts;
- button radii;
- card borders;
- footer/header rules;
- breakpoints.

## 6. Что делать с `web00-tabs-standard.css`

Проблема:

- имя говорит про tabs, но файл используется как общий visual/mobile patch.

План:

1. Не удалять сейчас.
2. В следующей волне классифицировать правила:
   - pricing table;
   - mobile buttons;
   - footer;
   - shell.
3. Разнести в нормальные файлы или переименовать в `web00-shared-polish.css`.

## 7. Как внедрять `tokens.css`

Порядок подключения в будущем:

1. `tokens.css`
2. `base/shell.css`
3. page-specific CSS
4. temporary patch CSS, если ещё нужен

Первые кандидаты для подключения:

1. `pricing.html`
2. `brief.html`
3. `status.html`
4. `solutions.html`
5. `index.html` последней, потому что главная самая чувствительная.

## 8. Запреты на следующую волну

- не возвращать dark-tech/neon как основной стиль;
- не смешивать old dark tokens с new premium tokens без явной причины;
- не менять визуал всех страниц одной глобальной правкой без smoke;
- не удалять legacy-файлы до доказательства, что они не используются.

## 9. Exit Criteria

CSS cleanup можно считать успешным, если:

- все premium pages подключают общий `tokens.css`;
- `styles.css` больше не задаёт dark body для premium pages;
- `home-1to1-test.css` больше не имеет test-названия в production;
- `home-premium.css` либо отключён, либо имеет ясную роль;
- footer/header styles не дублируются хаотично;
- mobile/desktop breakpoints приведены к одному контракту.

