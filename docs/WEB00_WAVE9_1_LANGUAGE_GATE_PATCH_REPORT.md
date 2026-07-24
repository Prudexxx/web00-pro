# WEB00 Wave 9.1 Language Gate Patch Report

## 1. Summary

Patch type: product-copy language gate patch.

Goal: remove public/live wording with forbidden terms:

- `шаблон`
- `API`

Touched pages and data/rendering sources:

- `index.html`
- `solutions.html`
- `pricing.html`
- `brief.html`
- `assets/js/main.js`
- `assets/js/data.js`

No backend, deploy, commit, push, QAMax, PWA, manifest, service worker, tariff structure, or catalog structure changes were made.

## 2. Replacements

| File | Before | After | Reason |
|---|---|---|---|
| `index.html` | `готовый шаблон` | `готовый сайт` | Public meta description language gate |
| `index.html` | `Готовый шаблон` | `Готовый сайт` | Public pricing card copy |
| `solutions.html` | `выберите шаблон` | `выберите готовый сайт` | Public meta description language gate |
| `pricing.html` | `Шаблон` | `Готовый сайт` | Public comparison table copy |
| `brief.html` | `Тариф и шаблон` | `Тариф и сайт` | Public stepper copy |
| `assets/js/main.js` | `Выберите шаблон` | `Выберите готовый сайт` | JS-rendered homepage language |
| `assets/js/main.js` | `Выбрать шаблон` | `Выбрать готовый сайт` | JS-rendered CTA language |
| `assets/js/main.js` | `Популярные шаблоны` | `Популярные готовые сайты` | JS-rendered homepage section title |
| `assets/js/main.js` | `Готовый шаблон` | `Готовый сайт` | JS-rendered pricing copy |
| `assets/js/main.js` | `по готовому шаблону` | `по готовому сайту` | JS-rendered tariff details |
| `assets/js/main.js` | `готовый шаблон нужно адаптировать` | `готовое решение нужно адаптировать` | JS-rendered detail text |
| `assets/js/main.js` | `Подробности шаблона` | `Подробности сайта` | Modal accessibility/public label |
| `assets/js/main.js` | `Шаблон готов к адаптации` | `Сайт готов к адаптации` | Modal summary badge |
| `assets/js/main.js` | `Состав и запуск шаблона` | `Состав и запуск сайта` | Modal accessibility/public label |
| `assets/js/main.js` | `О шаблоне` | `О сайте` | Demo/detail panel title |
| `assets/js/data.js` | `Готовый шаблон` | `Готовый сайт` | Tariff data rendered in UI |
| `assets/js/data.js` | `готовый шаблон под конкретную нишу` | `готовый сайт под конкретную нишу` | FAQ data rendered in UI |

## 3. Remaining matches

| Term | File | Public/Technical | Decision |
|---|---|---|---|
| `шаблон` / `Шаблон` / `шаблоны` / `Шаблоны` | checked product files | none | CLEAN |
| `API` | checked product files | none | CLEAN |
| `api` lowercase | `brief.html`, `assets/css/brief-premium.css` | Technical URL in `fonts.googleapis.com` | TECHNICAL_EXCEPTION; not visible/public copy and not the forbidden uppercase product term |

## 4. Checks

JS syntax:

- `node --check assets/js/main.js`: PASS
- `node --check assets/js/data.js`: PASS
- `node --check sw.js`: PASS

Static language gate:

- `rg -n "шаблон|Шаблон|шаблоны|Шаблоны|API" index.html solutions.html pricing.html brief.html assets/js/main.js assets/js/data.js assets/css`: CLEAN

Local HTTP smoke:

| Page | Status |
|---|---:|
| `/` | 200 |
| `/solutions.html` | 200 |
| `/pricing.html` | 200 |
| `/brief.html` | 200 |
| `/status.html?id=WEB00-2026-0001` | 200 |
| `/cabinet.html` | 200 |
| `/contacts.html` | 200 |

Rendered/public visible text gate:

- `index.html`: CLEAN
- `solutions.html`: CLEAN
- `pricing.html`: CLEAN
- `brief.html`: CLEAN

Diff checks:

- `git -c safe.directory="D:/Backend/Сайт" diff --stat`: PASS
- `git -c safe.directory="D:/Backend/Сайт" diff --check`: PASS, only CRLF normalization warnings

## 5. Verdict

Language gate clean: YES.

Ready for patch commit: YES.

Ready for patch push after approval: YES.
