# WEB00 Matryoshka Hero Integration V1 Report

## 1. Summary

- Final owner-provided source asset accepted: `assets/img/МАТРЕШКА.png`.
- ASCII production copy created: `assets/img/matryoshka-clean-final.png`.
- Responsive WebP derivatives created for the home hero.
- `index.html` now uses a responsive `<picture class="hero-matryoshka">` instead of the previous DOM/CSS `.mock-device` mockup.
- `assets/css/home.css` contains the scoped responsive layout rules for the new hero image.

## 2. Source asset inspection

| File | Exists | Dimensions | Mode | Alpha | Notes |
|---|---:|---:|---|---|---|
| `assets/img/МАТРЕШКА.png` | YES | 1448x1086 | RGB | NO | Owner-provided final source kept untouched. |
| `assets/img/matryoshka-clean-final.png` | YES | 1448x1086 | RGBA | YES | ASCII production copy with edge background made transparent for premium hero rendering. |

## 3. Generated derivatives

| File | Dimensions | Size | Target result |
|---|---:|---:|---|
| `assets/img/matryoshka-hero-720.webp` | 720x540 | 41452 bytes | PASS |
| `assets/img/matryoshka-hero-1200.webp` | 1200x900 | 91266 bytes | PASS |
| `assets/img/matryoshka-hero-1600.webp` | 1600x1200 | 137442 bytes | PASS |

## 4. Integration

`index.html` hero visual now uses:

- `assets/img/matryoshka-hero-720.webp`
- `assets/img/matryoshka-hero-1200.webp`
- `assets/img/matryoshka-hero-1600.webp`
- fallback `assets/img/matryoshka-clean-final.png`

Alt text:

`WEB00 на ноутбуке и телефоне`

The old `.mock-device` DOM block was replaced on the home page. Legacy `.mock-device` CSS remains in `assets/css/home.css` but is no longer used by `index.html`.

## 5. Responsive source selection

Measured locally through Chrome DevTools Protocol:

| Viewport | Expected loaded asset | Rendered size | Horizontal scroll |
|---|---|---:|---|
| 360x800 | `matryoshka-hero-720.webp` | 328x246 | NO |
| 390x844 | `matryoshka-hero-720.webp` | 358x269 | NO |
| 768x1024 | `matryoshka-hero-720.webp` | 538x403 | NO |
| 1440x900 | `matryoshka-hero-1200.webp` | 420x315 | NO |

High-DPR devices may select a larger candidate from the same `srcset`.

## 6. Visual QA evidence

Screenshots saved to:

`_qa/WEB00_MATRYOSHKA_HERO_INTEGRATION_V1/screenshots/`

Files:

- `index-360x800.png`
- `index-390x844.png`
- `index-768x1024.png`
- `index-1440x900.png`

Visual smoke result:

- Desktop: PASS
- Tablet: PASS
- Mobile 390x844: PASS
- Mobile 360x800: PASS with minor density risk only; no horizontal scroll measured.

## 7. Checks

- `node --check assets/js/main.js`: PASS
- `node --check assets/js/data.js`: PASS
- `node --check sw.js`: PASS
- Local HTTP smoke:
  - `/`: 200
  - `/solutions.html`: 200
  - `/pricing.html`: 200
  - `/brief.html`: 200
  - `/status.html?id=WEB00-2026-0001`: 200
  - `/cabinet.html`: 200
  - `/contacts.html`: 200
  - `/install.html`: 200
  - `/app.html`: 200
  - `/faq.html`: 200

## 8. Language gate

Manual visual inspection of the accepted source asset did not show forbidden public terms:

- `шаблон`
- `Бриф`
- `API`
- `Performance`
- `SEO-ready`
- `Accessibility`
- `Bug report`

The asset contains current product language such as `Выбрать сайт`, `Готов к продвижению`, and `Скорость 90+`.

## 9. Remaining risks

- `assets/css/home.css` still contains unused legacy `.mock-device`, `.mock-laptop`, and `.mock-phone` rules. They are not used by the current home hero markup.
- The mobile hero remains dense because the accepted source image is wide and detailed. It is readable and does not create horizontal scroll.
- No production deploy was executed manually.

## 10. Verdict

Matryoshka hero integration: PASS

Ready for owner visual recheck: YES
