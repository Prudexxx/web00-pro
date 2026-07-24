# WEB00 Desktop Bugbase Batch 3 Report

## 1. Summary

Batch 3 completed as a targeted product-consistency pass for the homepage showcase.

- Removed old public 12k/15k pricing from popular homepage cards.
- Replaced those card labels with tariff membership labels: Start / Business / Pro.
- Replaced the public medical showcase hook with the neutral `medicina` demo and preview asset.
- Removed old 12k/15k `priceFrom` values from rendered catalog data.
- Increased footer signature contrast without making it a primary visual element.

No backend, deploy, push, commit, GitHub workflow, PWA, manifest, service worker, or Matryoshka asset changes were made.

## 2. Bugs addressed

| ID | Status | Files | Notes |
|---|---|---|---|
| WEB00-PC-007 | PASS | `index.html`, `assets/js/main.js`, `assets/js/data.js` | Old `от 12 000 ₽` / `от 15 000 ₽` labels removed from popular cards and catalog-rendered data. |
| WEB00-PC-008 | PASS | `index.html` | Homepage medical card now uses neutral `medicina` preview/demo instead of the narcology demo hook. |
| WEB00-PC-009 | PASS | `assets/css/home.css` | Footer signature color/opacity increased to a calmer readable level. |

## 3. Popular cards / pricing consistency

Homepage popular cards now show:

- `Мебельный магазин` -> `Тариф Start`
- `Медицинский центр` -> `Тариф Business`
- `Дома и бани из сруба` -> `Тариф Pro`

Catalog data entries that previously exposed `от 12 000 ₽` / `от 15 000 ₽` through `priceFrom` now use:

- `В составе тарифа`

The primary tariff prices remain unchanged:

- Start: `от 39 000 ₽`
- Business: `от 69 000 ₽`
- Pro: `от 99 000 ₽`

## 4. Medical showcase neutralization

The homepage medical card keeps neutral public wording:

- `Медицинский центр`
- `Страница доверия для клиники: услуги, преимущества, запись и понятный контакт.`

The public homepage card now uses:

- preview image: `assets/img/previews/medicina-home.png`
- demo id: `medicina`
- brief link: `brief.html?solution=medicina`

The heavier `narko-medicine` catalog/demo entry was not deleted or redesigned in this batch.

## 5. Footer signature

The footer signature now uses stronger but still calm contrast:

- desktop/base color: `rgba(109, 102, 96, 0.68)`
- opacity: `0.9`
- mobile override: `rgba(109, 102, 96, 0.62)` / opacity `0.86`

## 6. Checks

### JS syntax

- `node --check assets/js/main.js` PASS
- `node --check assets/js/data.js` PASS
- `node --check sw.js` PASS

### Static search

Command:

```text
rg -n '12 000|15 000|шаблон|бриф|SEO|Performance|Accessibility|Bug report' index.html assets/js assets/css
```

Result:

- only allowed technical/comment match: `assets/css/tokens.css:88: /* Accessibility */`

### Local HTTP

- `/` PASS 200
- `/solutions.html` PASS 200
- `/pricing.html` PASS 200

### Browser smoke

Evidence:

- `_qa/WEB00_DESKTOP_BUGBASE_BATCH3/screenshots/home-1440-popular-cards-after.png`
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH3/screenshots/home-1440-footer-after.png`
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH3/screenshots/home-390-popular-cards-after.png`
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH3/raw/browser-results.json`

Automated browser summary:

- HTTP all OK: YES
- console/page errors: 0
- horizontal scroll: 0
- old 12k/15k prices absent: YES
- popular labels OK: YES
- medical card neutral: YES
- tariff prices 39/69/99 still present: YES

## 7. Remaining risks

- `assets/js/data.js` still contains `от 7 000 ₽` for the custom site entry. It was not part of WEB00-PC-007 and was not changed in this batch.
- The `narko-medicine` catalog/demo entry still exists internally. The homepage public showcase no longer points to it.
- `assets/css/home.css` already contained previous uncommitted typography Batch 2 changes before this batch.

## 8. Ready for owner recheck

YES.

Recommended owner checks:

- homepage popular cards on desktop 1440;
- homepage footer signature on desktop;
- homepage popular cards on mobile 390.
