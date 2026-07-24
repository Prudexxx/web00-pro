# WEB00 Hero H1 Align To Matryoshka Report

## 1. Executive summary

- Task completed: YES.
- Runtime matryoshka assets reverted to HEAD accepted versions: YES.
- External home hero H1 now matches the accepted matryoshka direction:
  - `Готовый сайт`
  - `для бизнеса`
  - `запуск без хаоса`
- Product images were not edited after revert.
- JS was not changed.
- Commit, push, deploy, backend: not executed.

## 2. Files changed

| File | Change |
|---|---|
| `index.html` | Home hero H1 changed from two-line `data-i18n-html` text to explicit three-line markup. |
| `assets/css/home.css` | Added `.hero-title-line` block rendering and widened mobile H1 max-width to keep the third line intact. |
| `docs/WEB00_HERO_H1_ALIGN_TO_MATRYOSHKA_REPORT.md` | This report. |

## 3. Runtime image boundary

The following tracked runtime assets had local modifications from the rejected image-fix attempt and were restored to HEAD:

| Asset | Result |
|---|---|
| `assets/img/matryoshka-clean-final.png` | Restored |
| `assets/img/matryoshka-hero-720.webp` | Restored |
| `assets/img/matryoshka-hero-1200.webp` | Restored |
| `assets/img/matryoshka-hero-1600.webp` | Restored |

Untracked owner/source artifacts were not deleted or modified.

## 4. H1 implementation

The previous H1 was controlled by `data-i18n-html="hero.title"`, and `assets/js/main.js` still contains the old translation value. Because this task forbids JS changes, the home H1 was made static in `index.html` and the `data-i18n-html` hook was removed from that H1 only.

Final H1 markup renders as:

```text
Готовый сайт
для бизнеса
запуск без хаоса
```

CSS changes are limited to the hero title line helper and the mobile H1 width guard.

## 5. Checks

| Check | Result | Notes |
|---|---|---|
| `node --check assets/js/main.js` | PASS | No syntax errors. |
| `node --check assets/js/data.js` | PASS | No syntax errors. |
| Local HTTP `/` | PASS | `http://127.0.0.1:4174/` returned 200. |
| Desktop 1440x900 smoke | PASS | H1 three lines, hero image loaded, no console errors. |
| Mobile 390x844 smoke | PASS | H1 three lines, CTA not clipped, image loaded, no console errors. |
| Desktop horizontal scroll | PASS | `scrollWidth 1430 <= innerWidth 1440`. |
| Mobile horizontal scroll | PASS | `scrollWidth 380 <= innerWidth 390`. |

Temporary visual evidence:

- `C:\Users\ACERAS~1\AppData\Local\Temp\WEB00_HERO_H1_ALIGN_TO_MATRYOSHKA\desktop-1440x900.png`
- `C:\Users\ACERAS~1\AppData\Local\Temp\WEB00_HERO_H1_ALIGN_TO_MATRYOSHKA\mobile-390x844.png`

## 6. Remaining risks

- `assets/js/main.js` still contains legacy `hero.title` translation strings, but the home H1 no longer uses `data-i18n-html`. If multilingual home hero switching becomes required again, update i18n deliberately in a separate JS-approved task.
- Real owner device recheck is still the final visual acceptance layer.

## 7. Verdict

HERO_H1_ALIGNED_TO_MATRYOSHKA: PASS

Ready for owner review: YES.
