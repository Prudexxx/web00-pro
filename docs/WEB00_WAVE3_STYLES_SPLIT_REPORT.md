# WEB00 Wave 3 Styles Split Report

## 1. Executive summary

- Усилены common layers `base.css`, `shell.css`, `components.css` безопасными общими правилами.
- Создан `assets/css/legacy.css` как quarantine-карта для старых dark/neon primitives.
- В начало `assets/css/styles.css` добавлен transitional-comment.
- `styles.css` не убран из основных страниц: он всё ещё содержит критичные transitional зависимости для shell, modals, forms, body locks, mobile menu, footer и старых page-specific блоков.
- HTML CSS order оставлен в допустимом Wave 3 порядке: `tokens -> base -> styles -> shell -> components -> page-specific`.

Итог: визуал не переписывался, JS не менялся, dark/neon не переносился в новые light premium common layers.

## 2. Styles.css inventory

| Group | Examples | Action |
|---|---|---|
| base/reset | `*`, `html`, `body`, `html.is-modal-open`, `body.is-menu-open`, `body.is-modal-open` | partially moved to `base.css`; kept in `styles.css` because current pages still rely on exact legacy cascade |
| shell | `.container`, `.site-header`, `.header__inner`, `.nav`, `.menu-toggle`, `.footer`, `.footer-credit` | partially moved to `shell.css`; kept in `styles.css` because mobile nav, active underline and previous FE-patches still depend on it |
| components | `.btn`, `.btn--primary`, `.btn--secondary`, `.card-actions`, `.modal`, `.alert`, `.form-message` | partially moved to `components.css`; kept in `styles.css` because modal and form variants are still mixed with page behavior |
| page-specific | `.status-*`, `.status-lookup`, service/process/contact/status sections, modal variants | kept in `styles.css`; must be split into page files in later waves |
| dark/neon legacy | `#050812`, `#07111f`, `--violet`, `--blue`, `--glow-*`, dark radial gradients, Manrope dark shell block | documented in `legacy.css`; active copies kept in `styles.css` because removal is unsafe without deeper page-by-page QA |
| unknown risky | old sprint patches, FE-patch global blocks, mixed selectors under `body[data-page]` | kept |

## 3. Files changed

| File | Change |
|---|---|
| `assets/css/base.css` | Added body lock defaults, smooth scroll, `min-width`, `[hidden]`, `visually-hidden` / `sr-only` primitives. |
| `assets/css/shell.css` | Added `aria-current` active nav support, `header__cta` primitive, safer mobile open nav defaults. |
| `assets/css/components.css` | Added disabled buttons, focused inputs, modal surface primitives, alert/form-message primitives. |
| `assets/css/styles.css` | Added transitional global layer comment at file start. |
| `assets/css/legacy.css` | Created dark/neon quarantine map. Not linked from light premium production pages. |
| `docs/WEB00_WAVE3_STYLES_SPLIT_REPORT.md` | Created this report. |
| `docs/WEB00_WAVE3_LEGACY_QUARANTINE_MAP.md` | Created legacy quarantine map. |

## 4. CSS order by page

| Page | CSS order | styles.css still used? |
|---|---|---|
| `index.html` | `tokens -> base -> styles -> shell -> components -> home-premium -> home.css` | YES |
| `services.html` | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` | YES |
| `solutions.html` | `tokens -> base -> styles -> shell -> components -> catalog-premium -> web00-tabs-standard` | YES |
| `how-it-works.html` | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` | YES |
| `pricing.html` | `tokens -> base -> styles -> shell -> components -> pricing-premium -> web00-tabs-standard` | YES |
| `faq.html` | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` | YES |
| `contacts.html` | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` | YES |
| `brief.html` | `tokens -> base -> styles -> shell -> components -> brief-premium -> web00-tabs-standard` | YES |
| `status.html` | `tokens -> base -> styles -> shell -> components -> status-premium -> web00-tabs-standard` | YES |
| `cases.html` | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` | YES |
| `privacy-policy.html` | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` | YES |
| `consent-personal-data.html` | `tokens -> base -> styles -> shell -> components -> public-premium -> web00-tabs-standard` | YES |

## 5. Legacy status

- `styles.css`: retained as transitional dependency.
- `legacy.css`: created, not linked; stores dark/neon quarantine primitives under explicit legacy classes.
- `home-premium.css`: still connected on `index.html` as a temporary mixed/fallback layer.
- `web00-tabs-standard.css`: still a late patch-layer for non-home public tabs.
- Missing input doc: `docs/WEB00_WAVE2_SHELL_UNIFICATION_NOTES.md` was requested by the prompt but does not exist in the current repo.

## 6. Visual smoke result

Страницы:

- `index.html`
- `solutions.html`
- `pricing.html`
- `brief.html`
- `status.html?id=WEB00-2026-0001`

Result: PASS

Issues:

| Page | Issue | Severity |
|---|---|---|
| All checked pages | Pages opened in a local browser smoke, loaded successfully, and browser error logs were empty. | None |

Smoke method: local static server + in-app browser direct navigation. No QAMax, no Lighthouse, no Playwright, no video, no saved screenshots.

## 7. Remaining risks

- `styles.css` ещё нужен и содержит active legacy/dark/neon/page-specific code.
- `home-premium.css` ещё подключён на главной.
- `web00-tabs-standard.css` ещё patch-layer.
- Header/footer duplicated manually in HTML.
- Page CSS still fragmented.
- Some dark/neon declarations are still active in `styles.css`, but later light page CSS currently overrides visible output.

## 8. Recommendation

Следующая волна:

- Если текущий short smoke достаточно принят: Wave 4 — Home/Catalog/Pricing Light Premium Alignment.
- Если потребуется ещё уменьшать legacy-risk до визуальной волны: Wave 3.1 — Targeted CSS Regression Fix / Styles.css dependency audit.
