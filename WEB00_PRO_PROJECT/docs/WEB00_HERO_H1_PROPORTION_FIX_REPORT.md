# WEB00 Hero H1 Proportion Fix Report

## 1. Executive summary

- Problem: after aligning the outer hero H1 to the accepted matryoshka wording, the 3-line headline became visually heavier than the right-side device visual.
- Fix applied: tuned only hero H1 typography in `assets/css/home.css`.
- Files changed:
  - `assets/css/home.css`
  - `docs/WEB00_HERO_H1_PROPORTION_FIX_REPORT.md`
- Visual result: 1440x900 PASS, 390x844 PASS.
- Ready for owner review: YES.

## 2. Root cause

The external H1 was changed from a 2-line composition to a 3-line composition without recalibrating typography. The previous desktop headline size and width were balanced around fewer lines, so the left text column became visually heavier than the matryoshka/device visual.

## 3. CSS changes

| Selector | Before problem | Change | Reason |
|---|---|---|---|
| `.mock-hero h1` | Base headline was too heavy for the new 3-line structure. | Reduced width from `480px` to `440px`, font-size from `2.12rem` to `1.96rem`, line-height to `1`, and softened letter-spacing. | Restores desktop balance without changing copy or layout structure. |
| `@media (min-width: 1500px) .mock-hero h1` | Very-wide desktop rule still scaled the 3-line headline like the former 2-line composition. | Reduced width from `700px` to `640px`, font-size from `3.18rem` to `2.78rem`, and tightened line-height. | Prevents oversized H1 on large displays. |
| `@media (max-width: 767px) body[data-page="home"] .mock-hero h1` | Mobile was readable, but the new 3-line title still carried slightly too much visual weight. | Reduced clamp max from `2.02rem` to `1.94rem`, softened letter-spacing, kept 3 lines intact. | Keeps mobile readable without letting the headline dominate the first screen. |

## 4. Visual smoke

| Viewport | Result | Notes |
|---|---|---|
| 1440x900 | PASS | H1 remains 3 lines, hero balance improved, CTA visible, matryoshka loaded, trust strip stable, no console errors. |
| 390x844 | PASS | H1 remains 3 lines, text readable, CTA not clipped, matryoshka loaded, no horizontal scroll, no console errors. |

Horizontal scroll measurements:

| Viewport | scrollWidth | innerWidth | Result |
|---|---:|---:|---|
| 1440x900 | 1430 | 1440 | PASS |
| 390x844 | 380 | 390 | PASS |

## 5. Evidence

- `_review/HERO_H1_PROPORTION_FIX/home-1440x900.png`
- `_review/HERO_H1_PROPORTION_FIX/home-390x844.png`
- `_review/HERO_H1_PROPORTION_FIX/browser-results.json`

## 6. Files changed

| File | Change |
|---|---|
| `assets/css/home.css` | Hero H1 proportion tuning for base, large desktop, and mobile rules. |
| `docs/WEB00_HERO_H1_PROPORTION_FIX_REPORT.md` | Batch report. |

## 7. Risks

- Final visual acceptance is still subjective and should be confirmed by owner review.
- Real mobile device recheck remains useful even though browser-emulated 390x844 passed.
- `index.html` still contains the 3-line H1 from the previous alignment task; this batch intentionally did not alter the text or markup.

## 8. Recommendation

OWNER REVIEW
