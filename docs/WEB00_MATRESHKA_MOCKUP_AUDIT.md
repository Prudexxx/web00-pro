# WEB00 Matreshka Mockup Audit

## 1. Executive summary

Source file: `assets/img/матрешка_0.png`.

Viability: YES, the image is viable as a source mockup for a WEB00 hero showcase, but it must be treated as a source asset, not edited in place.

Recommended approach: create a derived baked PNG:

`assets/img/matreshka-web00-showcase.png`

Blockers: no hard blocker found. The main constraint is that the checkerboard-looking background is baked into the RGB image, not real transparency. If the final hero needs a clean premium background, the implementation step should either clean/mask the background or place the derived image on a matching light surface.

Recommended next task: `MATRESHKA IMPLEMENTATION — CREATE DERIVED ASSET`.

## 2. Source asset inspection

Inspection method: system `.NET/System.Drawing` was used. Pillow is not installed in the current environment, and no dependencies were installed.

| Property | Result |
|---|---|
| Source file | `assets/img/матрешка_0.png` |
| Exists | YES |
| File size | 1,170,832 bytes |
| Dimensions | 1402 x 1122 px |
| Format | PNG |
| Pixel format / color mode | `Format24bppRgb` |
| Alpha channel | NO |
| Transparent pixels | 0 |
| Partial alpha pixels | 0 |
| Opaque pixels | 1,573,044 |
| Real transparent background | NO |
| Checkerboard baked into image | YES |
| Laptop screen area blank enough | YES |
| Phone screen area blank enough | YES |

Background samples show fully opaque light gray/white checker-like RGB pixels. The image visually resembles a transparent PNG preview, but technically the checkerboard is baked into the raster.

Approximate sampled regions:

| Region | Box | Notes |
|---|---|---|
| Top-left background | `(0, 0, 240, 160)` | 100% light/checker-like pixels, alpha 255 |
| Right background | `(1320, 200, 1402, 700)` | Mostly light/checker-like, with device edge/shadow pixels |
| Phone screen estimate | `(170, 205, 365, 755)` | ~97% very light pixels, suitable for overlay |
| Laptop screen estimate | `(510, 80, 1260, 690)` | ~91% very light pixels because bezel/notch edges are included |
| Laptop inner white core | `(560, 120, 1210, 640)` | ~98% very light pixels, suitable for overlay calibration |

## 3. Current hero/mockup references

| File | Reference | Notes |
|---|---|---|
| `index.html:47` | `<section class="mock-hero">` | Home hero shell starts here. |
| `index.html:59` | `<div class="mock-device">` | Current device mockup wrapper. |
| `index.html:60` | `<div class="mock-laptop">` | Current laptop frame is HTML/CSS, not an image. |
| `index.html:61` | `<div class="mock-site">` | Desktop screen surface. |
| `index.html:73` | `<div class="mock-phone">` | Current phone frame is HTML/CSS, not an image. |
| `index.html:74` | `<div class="mock-phone__screen">` | Mobile screen surface. |
| `assets/css/home.css:218` | `.mock-device` | Base device wrapper sizing. |
| `assets/css/home.css:224` | `.mock-laptop` | Base laptop CSS frame. |
| `assets/css/home.css:333` | `.mock-phone` | Base phone CSS frame. |
| `assets/css/home.css:2210` | `.mock-device .mock-site` | Earlier desktop preview image layer. |
| `assets/css/home.css:2212` | `../img/previews/web00-home-desktop-device.png` | Existing desktop preview PNG reference. |
| `assets/css/home.css:2222` | `../img/previews/web00-home-mobile-device.png` | Existing mobile preview PNG reference. |
| `assets/css/home.css:2331` | Desktop clean device shell | Current desktop media layer for clean mockup. |
| `assets/css/home.css:2402` | `../img/previews/web00-home-desktop-clean.svg` | Current desktop screen image in the laptop CSS frame. |
| `assets/css/home.css:2439` | `../img/previews/web00-home-mobile-clean.svg` | Current phone screen image in the phone CSS frame. |

Current hero is built from DOM/CSS frames plus screen background images. There is no current reference to `assets/img/матрешка_0.png` in production code.

Potential future change point after owner approval:

- Replace or augment `.mock-device` / `.mock-laptop` / `.mock-phone` hero area with a single derived image asset.
- Keep responsive guards from Wave 10.1 intact.
- Do not replace global shell/header/footer for this task.

## 4. Screen mapping estimate

Coordinates are approximate and must be refined visually in the implementation task.

| Screen | Approx corners | Notes |
|---|---|---|
| Laptop | TL `(526, 62)`, TR `(1312, 150)`, BR `(1237, 724)`, BL `(469, 579)` | Perspective trapezoid. Must use perspective transform, not simple rectangular resize. |
| Phone | TL `(169, 205)`, TR `(366, 205)`, BR `(366, 756)`, BL `(169, 756)` | Near-rectangular portrait area with rounded corners and top notch/pill. Use safe inset mask. |

Laptop overlay notes:

- The laptop screen is angled and slightly skewed.
- The top notch/camera area should remain above the inserted screenshot.
- The inserted desktop screenshot should not cover black bezel edges.

Phone overlay notes:

- The phone screen is mostly vertical and cleaner to map.
- The top dynamic-island/pill must remain visible.
- A rounded mask is needed to keep the screenshot inside the screen.

## 5. Screenshot requirements

| Target | Source viewport | Crop | Notes |
|---|---|---|---|
| Laptop screen | `1440x900` preferred, `1366x768` acceptable | Home top frame / first viewport | Use desktop home state after Wave 10.1. Crop should show header, hero, trust strip, and first content hint. |
| Phone screen | `390x844` preferred, `360x800` fallback | Mobile top frame | Use real mobile layout, not shrunken desktop. Header, hero, actions and trust strip should be readable. |

Aspect ratio guidance:

- Laptop screen polygon is wide landscape. A desktop screenshot should be cropped to a wide top-frame ratio before perspective transform.
- Phone screen is tall portrait. A mobile screenshot should use the top frame and avoid tiny full-page compression.

## 6. Implementation options

| Option | Description | Pros | Cons | Recommendation |
|---|---|---|---|---|
| Option A | Baked derived PNG: generate desktop/mobile screenshots, perspective-transform them into the source mockup screens, export `assets/img/matreshka-web00-showcase.png`. | Stable on GitHub Pages; no runtime transform; predictable; easiest to QA visually; best for RC hero. | Needs regeneration when home visuals change; one more image asset. | Recommended for current RC. |
| Option B | HTML/CSS layered mockup: use base image plus absolutely positioned screenshot layers with transforms. | More dynamic; screenshots can be swapped independently. | Harder alignment; responsive risk; runtime complexity; possible overflow/performance issues. | Not recommended for current RC. |

## 7. Recommended implementation

Recommended implementation: Option A, derived baked PNG.

Rules:

- Keep original `assets/img/матрешка_0.png` untouched.
- Create a derived ASCII-named asset:
  `assets/img/matreshka-web00-showcase.png`
- Use desktop and mobile screenshots from the accepted WEB00 home page.
- Perspective-transform screenshots into the blank device screens.
- Preserve device shadows, bezels and premium look.
- Clean or neutralize the baked checkerboard background if it conflicts with the page background.
- Compare before/after screenshots before updating the hero.
- Only update hero reference after owner visual approval.
- No backend/deploy changes.

## 8. Risks

| Risk | Severity | Notes |
|---|---|---|
| Baked checkerboard background | P1 | Source PNG has no alpha. Final derived asset may need background cleanup or a matching light backdrop. |
| Perspective alignment | P1 | Laptop requires true perspective mapping, not simple rectangular paste. |
| Phone mask/notch | P2 | Phone screenshot must stay behind the top pill/notch and inside rounded corners. |
| Screen glare/brightness mismatch | P2 | White screens and light WEB00 UI can wash out. Add subtle inset shading only if needed. |
| Responsive hero replacement | P1 | Replacing CSS device with a large image can break mobile/tablet if not constrained. |
| Asset size/performance | P2 | Derived PNG should be optimized. Consider WebP later only if browser/support policy allows. |
| Cyrillic source filename | P2 | Keep source, but use ASCII for production derived asset. |

## 9. Next step

Next task:

`MATRESHKA IMPLEMENTATION — CREATE DERIVED ASSET`

Expected output:

- `assets/img/matreshka-web00-showcase.png`
- Before/after screenshots
- Hero reference update only after visual compare
- JS checks
- Responsive smoke
- No commit/push/deploy without owner approval
