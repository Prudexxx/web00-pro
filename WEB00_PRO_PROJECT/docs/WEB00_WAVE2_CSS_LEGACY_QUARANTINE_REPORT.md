# WEB00 Wave 2 CSS Legacy Quarantine Report

## 1. Executive summary

Wave 2 ввела понятные общие CSS-слои без переписывания сайта:

- `assets/css/base.css` — reset и базовые defaults.
- `assets/css/shell.css` — низкоспецифичный shell contract для header/nav/footer.
- `assets/css/components.css` — низкоспецифичные defaults для общих компонентов.
- `assets/css/styles.css` сохранён как legacy/global layer.
- `assets/css/home.css` остаётся production home layer.
- `assets/css/home-1to1-test.css` удалён из рабочей копии после проверки условий.

Проект готов к следующей волне CSS Legacy Cleanup, но `styles.css`, `home-premium.css` и `web00-tabs-standard.css` всё ещё содержат смешанные/legacy обязанности.

## 2. CSS layer order

Целевой порядок для основных страниц:

1. `assets/css/tokens.css`
2. `assets/css/base.css`
3. `assets/css/styles.css`
4. `assets/css/shell.css`
5. `assets/css/components.css`
6. page-specific CSS
7. временные shared/page patches, если они уже существовали и нужны для сохранения визуала

## 3. Connection matrix

| Page | Layer order result | Notes |
|---|---|---|
| `index.html` | PASS | `tokens -> base -> styles -> shell -> components -> home-premium -> home.css` |
| `services.html` | PASS | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` |
| `solutions.html` | PASS | `tokens -> base -> styles -> shell -> components -> catalog-premium -> web00-tabs-standard` |
| `how-it-works.html` | PASS | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` |
| `pricing.html` | PASS | `tokens -> base -> styles -> shell -> components -> pricing-premium -> web00-tabs-standard` |
| `faq.html` | PASS | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` |
| `contacts.html` | PASS | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` |
| `brief.html` | PASS | `tokens -> base -> styles -> shell -> components -> brief-premium -> web00-tabs-standard` |
| `status.html` | PASS | `tokens -> base -> styles -> shell -> components -> status-premium -> web00-tabs-standard` |
| `cases.html` | PASS | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` |
| `privacy-policy.html` | PASS | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` |
| `consent-personal-data.html` | PASS | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` |

`web00-tabs-standard.css` оставлен после page-specific слоёв как временный shared patch, чтобы не менять визуал в Wave 2. Его нужно отдельно разбирать в следующей волне.

## 4. New layer roles

### `assets/css/base.css`

Назначение:

- box sizing;
- html/body defaults;
- media max-width;
- font inheritance для form controls;
- base focus-visible;
- reduced motion fallback;
- безопасные `.page-shell` / `.page-main`.

Файл не содержит page-specific selectors.

### `assets/css/shell.css`

Назначение:

- низкоспецифичные defaults для `.container`;
- `.site-header`;
- `.header__inner`;
- `.logo`;
- `.nav`;
- `.menu-toggle`;
- `.footer`;
- `.footer__inner`;
- `.footer__links`;
- `.footer-credit`;
- `.mock-language-trigger`.

Правила используют `:where(...)`, чтобы не перебивать текущие более специфичные page CSS.

### `assets/css/components.css`

Назначение:

- низкоспецифичные defaults для `.btn`, `.button`, card-like blocks, badges, inputs и modal surfaces;
- touch-size defaults на mobile.

Правила используют `:where(...)`, чтобы не ломать существующие компоненты.

## 5. Home test layer quarantine

| Check | Result |
|---|---|
| Production HTML references `home-1to1-test.css` | PASS - no HTML references |
| `assets/css/home.css` exists | PASS |
| `assets/css/home.css` contains current `mock-*` home renderer | PASS |
| Direct non-doc references to `home-1to1-test.css` | PASS - removed from `home.css` comment before deletion |
| `assets/css/home-1to1-test.css` physically removed | PASS |

После удаления прямые упоминания `home-1to1-test.css` остались только в исторических `docs/*.md`.

## 6. Legacy still intentionally kept

### `assets/css/styles.css`

Оставлен как legacy/global layer. Известные legacy признаки:

- `#050812`;
- `--violet`;
- `--blue`;
- `--glow-*`;
- dark/neon gradients;
- `Manrope` in old dark shell block.

В Wave 2 это не чистилось, чтобы не ломать визуал.

### `assets/css/home-premium.css`

Оставлен подключённым на `index.html` как временный legacy/shell fallback. Текущий production renderer главной — `assets/css/home.css`.

### `assets/css/web00-tabs-standard.css`

Оставлен как временный shared visual standard для non-home страниц. Его роль пересекается с будущими `base/shell/components`, но пока он нужен для сохранения текущей мобильной унификации.

## 7. Checks

Команды:

```text
node --check assets/js/main.js
node --check assets/js/data.js
git -c safe.directory="D:/Backend/Сайт" diff --check
```

Результат:

- `main.js`: PASS.
- `data.js`: PASS.
- `git diff --check`: PASS, только CRLF warnings.

Production reference check:

```text
rg -n "home-1to1-test\.css" -g "*.html" .
```

Результат:

```text
NO_HTML_REFERENCES
```

## 8. Git state at checkpoint

`git status --short` после Wave 2:

```text
 M .gitignore
 D assets/css/home-1to1-test.css
 M assets/js/main.js
 M brief.html
 M cases.html
 M consent-personal-data.html
 M contacts.html
 M faq.html
 M how-it-works.html
 M index.html
 M pricing.html
 M privacy-policy.html
 M services.html
 M solutions.html
 M status.html
?? "WEB00 PRO 2.0 \342\200\224 STRATEGIC ROADMAP (MASTER FILE).md"
?? assets/css/base.css
?? assets/css/components.css
?? assets/css/home.css
?? assets/css/shell.css
?? assets/css/tokens.css
?? assets/img/previews/web00-home-desktop-clean.svg
?? assets/img/previews/web00-home-desktop-device.png
?? assets/img/previews/web00-home-mobile-clean.svg
?? assets/img/previews/web00-home-mobile-device.png
?? docs/
```

Примечание: `.gitignore`, `assets/js/main.js`, `tokens.css`, `home.css`, preview assets и часть docs пришли из предыдущих волн/локального состояния. В Wave 2 JS не менялся.

## 9. Remaining risks

1. `styles.css` всё ещё содержит dark/neon legacy и несколько поколений правил.
2. `home-premium.css` остаётся подключённым на главной, хотя большая часть `premium-*` разметки не используется текущей `mock-*` главной.
3. `web00-tabs-standard.css` всё ещё является late shared patch и должен быть разложен по common/page слоям.
4. Header/footer всё ещё дублируются вручную в HTML.
5. Новые common layers намеренно низкоспецифичные; это foundation, а не финальная чистка визуала.
6. Старые отчёты в `docs/` содержат исторические упоминания `home-1to1-test.css`; это ожидаемо.

## 10. Verdict

Ready for Wave 3 / CSS legacy cleanup: YES.

Wave 2 выполнена без commit/push/deploy, без backend, без QAMax и без JS-правок.
