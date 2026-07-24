# WEB00 Matryoshka Hero Mobile Composition V2 Report

## 1. What changed

- Updated only `assets/css/home.css`.
- Added a mobile-only `@media (max-width: 767px)` composition layer.
- Reduced mobile hero vertical density.
- Made mobile H1 calmer and constrained to an intentional measure.
- Centered CTA group with `max-width: 320px` instead of full-viewport bars.
- Reduced CTA height from 48px to 45px on mobile.
- Reduced mobile matryoshka visual width to `min(78vw, 340px)`.
- Added an extra narrow guard for viewports below 375px.

No HTML, images, JS, product text, tariffs, backend, manifest, service worker, commit, push, or deploy were changed.

## 2. Owner issue

After Mobile Polish V1, the owner screenshot showed:

- H1 visually too heavy.
- CTA buttons looked like wide blocks.
- Matryoshka image dominated the first screen.
- Mobile hero still felt like a compressed desktop composition.

## 3. Evidence

Screenshots:

`_qa/WEB00_MATRYOSHKA_HERO_MOBILE_COMPOSITION_V2/screenshots/`

- `index-360x800.png`
- `index-390x844.png`
- `index-412x915.png`
- `index-768x1024.png`
- `index-1440x900.png`

## 4. Viewport matrix

| Viewport | Result | Notes |
|---|---|---|
| 360x800 | PASS | CTA max-width 312px, image 274px wide, no overflow. |
| 390x844 | PASS | CTA max-width 320px, image 304px wide, mobile composition calmer. |
| 412x915 | PASS | CTA max-width 320px, image 321px wide, layout centered. |
| 768x1024 | PASS | Tablet remains unchanged/readable. |
| 1440x900 | PASS | Desktop hero remains unchanged visually. |

## 5. Overflow measurements

Measured with Chrome DevTools Protocol:

| Viewport | innerWidth | scrollWidth | Result |
|---|---:|---:|---|
| 360x800 | 360 | 360 | PASS |
| 390x844 | 390 | 390 | PASS |
| 412x915 | 412 | 412 | PASS |
| 768x1024 | 768 | 768 | PASS |
| 1440x900 | 1440 | 1440 | PASS |

## 6. Element measurements

| Viewport | H1 overflow | CTA overflow | CTA size | Image size |
|---|---|---|---:|---:|
| 360x800 | NO | NO | 312x45 | 274x205 |
| 390x844 | NO | NO | 320x45 | 304x228 |
| 412x915 | NO | NO | 320x45 | 321x241 |
| 768x1024 | NO | NO | 145x33 | 538x403 |
| 1440x900 | NO | NO | 145x33 | 420x315 |

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
  - `/faq.html`: 200

## 8. Verdict

Composition V2 completed: YES

Ready for owner mobile recheck: YES
