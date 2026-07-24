# WEB00 Home H1 Final Copy Report

## 1. Summary

Home H1 copy was updated from the dash-separated version to the approved two-line version:

```text
Готовый сайт для бизнеса
запуск без хаоса
```

The Matryoshka image, tariff prices, cards, backend, PWA files, and GitHub workflow were not changed.

## 2. Files changed

| File | Change |
|---|---|
| `index.html` | Home H1 switched from `data-i18n` text to `data-i18n-html` with `<br>`. |
| `assets/js/main.js` | Russian `hero.title` translation updated to the same `<br>` version so language initialization preserves the line break. |

## 3. Checks

| Check | Result |
|---|---|
| `node --check assets/js/main.js` | PASS |
| `node --check assets/js/data.js` | PASS |
| `node --check sw.js` | PASS |
| Static dash/forbidden wording check | PASS |
| Local HTTP `/` | 200 |
| Local HTTP `/index.html` | 200 |
| Local HTTP `/solutions.html` | 200 |
| Local HTTP `/pricing.html` | 200 |
| Desktop hero smoke `1440x900` | PASS |
| Mobile hero smoke `390x844` | PASS |
| Horizontal scroll | NO |
| Console/page errors | 0 |

## 4. Evidence

- `D:\Backend\Сайт\_qa\WEB00_HOME_H1_FINAL_COPY\screenshots\home-1440-hero-h1-final.png`
- `D:\Backend\Сайт\_qa\WEB00_HOME_H1_FINAL_COPY\screenshots\home-390-hero-h1-final.png`
- `D:\Backend\Сайт\_qa\WEB00_HOME_H1_FINAL_COPY\raw\browser-results.json`

## 5. Verdict

PASS. Ready for owner visual recheck.
