# WEB00 Matryoshka H1 Alignment Fix Report

## 1. Executive summary

- Problem: outer WEB00 hero H1 is intended as two semantic lines, while the laptop screen inside the matryoshka asset showed the nested H1 as three visual lines.
- Fix applied: patched the laptop-screen H1 area inside the matryoshka image so the nested laptop H1 reads as:
  - `Готовый сайт для бизнеса`
  - `запуск без хаоса`
- Visual result: nested laptop H1 is now visually aligned to two lines without overlapping the nested phone/device composition.
- Ready for owner review: YES.

## 2. Files changed

| File | Changed? | Reason |
|---|---:|---|
| `assets/img/matryoshka-clean-final.png` | YES | Runtime PNG fallback updated with two-line laptop H1. |
| `assets/img/matryoshka-hero-720.webp` | YES | Responsive WebP regenerated from updated runtime master. |
| `assets/img/matryoshka-hero-1200.webp` | YES | Responsive WebP regenerated from updated runtime master. |
| `assets/img/matryoshka-hero-1600.webp` | YES | Responsive WebP regenerated from updated runtime master without upscaling beyond source size. |
| `assets/img/matryoshka-source-final.webp` | YES | Source/master candidate updated for consistency; file remains untracked/local unless owner approves staging. |
| `docs/WEB00_MATRYOSHKA_H1_ALIGNMENT_FIX_REPORT.md` | YES | This report. |
| `_review/MATRYOSHKA_H1_ALIGNMENT_FIX/` | YES | Evidence screenshots, browser smoke result, and candidate previews. |
| `index.html` | NO | Existing `srcset` filenames stayed unchanged. |
| `assets/css/*` | NO | No layout/CSS changes were needed. |
| `assets/js/*` | NO | No JS changes were needed. |

Generated asset sizes:

| File | Dimensions | Size |
|---|---:|---:|
| `assets/img/matryoshka-clean-final.png` | 1448x1086 | 1,012,926 bytes |
| `assets/img/matryoshka-hero-720.webp` | 720x540 | 46,376 bytes |
| `assets/img/matryoshka-hero-1200.webp` | 1200x900 | 88,594 bytes |
| `assets/img/matryoshka-hero-1600.webp` | 1448x1086 | 95,642 bytes |
| `assets/img/matryoshka-source-final.webp` | 1448x1086 | 135,690 bytes |

## 3. H1 alignment check

| Location | Expected | Actual | Result |
|---|---|---|---|
| Outer local hero | 2 semantic lines | `Готовый сайт для бизнеса` / `запуск без хаоса` | PASS |
| Nested laptop screen | 2 visual lines | `Готовый сайт для бизнеса` / `запуск без хаоса` | PASS |

Note: on narrow mobile viewport the outer H1 can visually wrap because of the phone width, but the semantic H1 remains the approved two-line copy.

## 4. Visual smoke

| Viewport | Result | Notes |
|---|---|---|
| 1440x900 | PASS | Local page HTTP 200; hero image loaded; nested laptop H1 is two lines; no horizontal overflow; console/page errors 0. |
| 390x844 | PASS | Local page HTTP 200; hero image loaded; CTA readable; no horizontal overflow; console/page errors 0. |

Browser metrics:

| Viewport | innerWidth | scrollWidth | Hero image loaded | Console errors |
|---|---:|---:|---|---:|
| 1440x900 | 1440 | 1430 | YES | 0 |
| 390x844 | 390 | 380 | YES | 0 |

## 5. Evidence

Evidence folder:

```text
_review/MATRYOSHKA_H1_ALIGNMENT_FIX/
```

Key files:

- `_review/MATRYOSHKA_H1_ALIGNMENT_FIX/source-laptop-coordinate-crop.png`
- `_review/MATRYOSHKA_H1_ALIGNMENT_FIX/candidate-h1-two-line.png`
- `_review/MATRYOSHKA_H1_ALIGNMENT_FIX/candidate-h1-two-line-v2.png`
- `_review/MATRYOSHKA_H1_ALIGNMENT_FIX/patched-master-preview.png`
- `_review/MATRYOSHKA_H1_ALIGNMENT_FIX/home-1440-after.png`
- `_review/MATRYOSHKA_H1_ALIGNMENT_FIX/home-390-after.png`
- `_review/MATRYOSHKA_H1_ALIGNMENT_FIX/browser-results.json`

## 6. Risks

- Image sharpness: PASS in local smoke; generated WebP files are smaller than before and remain visually acceptable in the hero.
- Crop/overlap: PASS; the two-line nested H1 no longer overlaps the nested phone/device group.
- Text legibility: PASS for hero-scale display; nested screen text is intentionally smaller to keep the first line on one line inside the laptop screen.
- Source/master ambiguity: `matryoshka-source-final.webp` is RGB and untracked, while runtime production assets use alpha-capable PNG/WebP. Runtime assets were regenerated from the patched transparent PNG master; the source candidate was also patched for provenance consistency.
- Owner visual review is still required before commit/push because this is a visual asset retouch.

## 7. Recommendation

OWNER REVIEW.

If owner accepts the visual result, next step is a separate commit checkpoint for:

- `assets/img/matryoshka-clean-final.png`
- `assets/img/matryoshka-hero-720.webp`
- `assets/img/matryoshka-hero-1200.webp`
- `assets/img/matryoshka-hero-1600.webp`
- `assets/img/matryoshka-source-final.webp`, only if owner wants source/master tracked
- `docs/WEB00_MATRYOSHKA_H1_ALIGNMENT_FIX_REPORT.md`

No commit, push, deploy, backend, QAMax, Lighthouse, or product HTML/CSS/JS changes were performed.

