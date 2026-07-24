# WEB00 Matryoshka Hero Mobile Polish V1 Report

## 1. What changed

- Updated only the mobile hero CSS in `assets/css/home.css`.
- Reduced mobile H1 size and forced earlier line wrapping.
- Converted the hero CTA group to one full-width column on mobile.
- Kept CTA min-height at 48px for touch-friendly interaction.
- Reduced the mobile matryoshka visual width to avoid a desktop-shrink feeling and keep the laptop inside the viewport.
- Added mobile max-width for the hero paragraph to prevent edge crowding.

No image files, HTML, JS, backend, manifest, service worker, tariffs, or product copy were changed in this polish pass.

## 2. Mobile before issue

Owner review showed:

- H1 too large on 390px.
- CTA row clipped visually on the right.
- Hero image too wide.
- Laptop pushed to the right.
- Mobile hero looked like a compressed desktop block.

## 3. Mobile after screenshots

Evidence folder:

`_qa/WEB00_MATRYOSHKA_HERO_MOBILE_POLISH_V1/screenshots/`

Screenshots:

- `index-360x800.png`
- `index-390x844.png`
- `index-412x915.png`
- `index-768x1024.png`
- `index-1440x900.png`

## 4. Viewport matrix

| Viewport | Result | Notes |
|---|---|---|
| 360x800 | PASS | H1 wraps inside viewport, CTAs full width, image readable. |
| 390x844 | PASS | H1/CTA/image no longer clipped. |
| 412x915 | PASS | Layout remains stable; image centered. |
| 768x1024 | PASS | Tablet layout unchanged and readable. |
| 1440x900 | PASS | Desktop hero remains acceptable. |

## 5. Horizontal overflow result

Measured with Chrome DevTools Protocol:

| Viewport | innerWidth | scrollWidth | Result |
|---|---:|---:|---|
| 360x800 | 360 | 360 | PASS |
| 390x844 | 390 | 390 | PASS |
| 412x915 | 412 | 412 | PASS |
| 768x1024 | 768 | 768 | PASS |
| 1440x900 | 1440 | 1440 | PASS |

## 6. CTA / image measurements

| Viewport | CTA size | Image rendered size | Result |
|---|---:|---:|---|
| 360x800 | 328x48 each | 310x232 | PASS |
| 390x844 | 358x48 each | 335x252 | PASS |
| 412x915 | 380x48 each | 354x266 | PASS |
| 768x1024 | 145x33 each | 538x403 | PASS |
| 1440x900 | 145x33 each | 420x315 | PASS |

## 7. Desktop regression result

Desktop 1440x900 was rechecked after mobile-only CSS changes.

Result: PASS.

The matryoshka image remains visible, centered in the right hero column, and no horizontal overflow was measured.

## 8. Checks

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
  - `/faq.html`: 200

## 9. Verdict

Mobile polish completed: YES

Ready for owner mobile recheck: YES
