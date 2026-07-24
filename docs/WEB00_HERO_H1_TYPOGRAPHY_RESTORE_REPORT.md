# WEB00 Hero H1 Typography Restore Report

## 1. Executive summary

- Problem: the previous proportion-fix changed the accepted H1 typography while solving the 3-line break.
- What was reverted: H1 `font-size`, `line-height`, and `letter-spacing` were restored to the HEAD/accepted values.
- What stayed: the external H1 remains visually 3 lines:
  - `Готовый сайт`
  - `для бизнеса`
  - `запуск без хаоса`
- Visual result: desktop 1440x900 PASS; mobile 390x844 PASS.
- Ready for owner review: YES.

## 2. Root cause

The previous proportion-fix changed typography values to rebalance the hero after the H1 became 3 lines. Owner feedback clarified that the intended change was not a typography redesign. The correct fix is to preserve the original accepted H1 typography and only force the line break structure to match the matryoshka.

## 3. CSS restore

| Selector | Wrong change removed | Restored behavior | Reason |
|---|---|---|---|
| `.mock-hero h1` | Reduced base width/font-size and altered line-height/letter-spacing. | Restored HEAD values: `width: 480px`, `font-size: 2.12rem`, `line-height: 1.02`, `letter-spacing: -0.045em`. | Keep accepted H1 visual weight. |
| `@media (min-width: 1500px) .mock-hero h1` | Reduced large-desktop width/font-size and added custom line-height/letter-spacing. | Restored HEAD values: `width: 700px`, `font-size: 3.18rem`; removed extra overrides. | Preserve accepted large-desktop typography. |
| `@media (max-width: 767px) body[data-page="home"] .mock-hero h1` | Reduced mobile `font-size`, changed `line-height`, and softened `letter-spacing`. | Restored HEAD typography values: `font-size: clamp(1.62rem, 7.1vw, 2.02rem)`, `line-height: 1.04`, `letter-spacing: -0.025em`. | Preserve accepted mobile headline style. |
| `.mock-hero h1 .hero-title-line` | Not present in HEAD. | Kept `display: block`. | Minimal mechanical helper for the required 3-line H1. |

The mobile `17ch` width guard remains because it preserves the required third line without changing typography.

## 4. H1 structure

```text
Готовый сайт
для бизнеса
запуск без хаоса
```

## 5. Files changed

| File | Change |
|---|---|
| `assets/css/home.css` | Reverted proportion-fix typography changes while keeping the 3-line helper. |
| `docs/WEB00_HERO_H1_TYPOGRAPHY_RESTORE_REPORT.md` | Restore report. |

`index.html` remains modified from the earlier 3-line H1 alignment task; it was not edited in this restore batch.

## 6. Visual smoke

| Viewport | Result | Notes |
|---|---|---|
| 1440x900 | PASS | H1 remains 3 lines; typography visually matches the accepted heavier style; CTA, matryoshka, and trust strip remain stable. |
| 390x844 | PASS | H1 remains 3 lines; CTA is not clipped; matryoshka is unchanged and loaded; no horizontal scroll. |

Horizontal scroll measurements:

| Viewport | scrollWidth | innerWidth | Result |
|---|---:|---:|---|
| 1440x900 | 1430 | 1440 | PASS |
| 390x844 | 380 | 390 | PASS |

## 7. Evidence

- `_review/HERO_H1_TYPOGRAPHY_RESTORE/home-1440x900.png`
- `_review/HERO_H1_TYPOGRAPHY_RESTORE/home-390x844.png`
- `_review/HERO_H1_TYPOGRAPHY_RESTORE/browser-results.json`
- `_review/HERO_H1_TYPOGRAPHY_RESTORE/smoke.js`

## 8. Do not stage list

- `_review/`
- `_release/`
- `SKILL.md`
- `WEB00_VISUAL_ACCEPTANCE_PROMPT_PACK/`
- `assets/img/matryoshka-source-final.webp`
- rejected image-fix reports/evidence
- unrelated local-only docs

## 9. Recommendation

OWNER REVIEW
