# WEB00 Matreshka Implementation V1 Report

## 1. Summary

Создан производный asset для hero/showcase:

- output: `assets/img/matreshka-web00-showcase.png`
- source: `assets/img/матрешка_0.png`
- source file was preserved and not overwritten.

Работа выполнена как asset-only patch: HTML, CSS, JS, PWA, manifest, service worker и существующие preview assets не менялись.

## 2. Source and output

| File | Dimensions | Notes |
|---|---:|---|
| `assets/img/матрешка_0.png` | 1402x1122 | Original source mockup, preserved |
| `assets/img/matreshka-web00-showcase.png` | 1402x1122 | Derived WEB00 showcase asset |

Source SHA-256 at final check:

`D400771F8D2C750DF560548E6F69FB97CDA2CF8A052225659942D44937A178...`

Output SHA-256 at final check:

`B48B8284BB12A3536175CDA3E00210F5C9FEA5002FEB9194F70E39F9CB0DA4...`

## 3. Screenshots used

| Screenshot | Dimensions | Purpose |
|---|---:|---|
| `_qa/WEB00_MATRESHKA_IMPLEMENTATION_V1/web00-desktop-1440x900.png` | 1440x900 | Laptop screen source |
| `_qa/WEB00_MATRESHKA_IMPLEMENTATION_V1/web00-mobile-390x844.png` | 390x844 | Raw required mobile evidence |
| `_qa/WEB00_MATRESHKA_IMPLEMENTATION_V1/web00-mobile-390x844-fit.png` | 390x844 | Phone screen source used for final composite |

The raw 390px mobile capture showed the live mobile H1 clipped at the right edge. For the final derived hero asset, an additional 390px fit capture was generated so the phone screen looks clean in the device mockup. Product code was not changed.

## 4. Screen placement

Initial task geometry was used as the basis and then tightened/adjusted for clean screen fill:

| Device | Final polygon |
|---|---|
| Laptop | `(526,64)`, `(1308,151)`, `(1234,716)`, `(473,579)` |
| Phone | `(169,206)`, `(367,206)`, `(367,758)`, `(169,758)` |

Perspective compositing was done with Pillow. Dark device parts from the original source were restored over the inserted screens to preserve bezels, camera holes, keyboard and shadows.

## 5. Evidence files

Evidence folder:

`_qa/WEB00_MATRESHKA_IMPLEMENTATION_V1/`

Files:

- `source-copy.png`
- `web00-desktop-1440x900.png`
- `web00-mobile-390x844.png`
- `web00-mobile-390x844-fit.png`
- `matreshka-before-after.png`
- `matreshka-web00-showcase-preview.png`
- `masks-debug.png`

## 6. Quality checks

| Check | Result |
|---|---|
| Source original untouched | PASS |
| Output dimensions match source | PASS |
| Laptop screen filled | PASS |
| Phone screen filled | PASS |
| No visible spill outside screens | PASS by visual inspection |
| Device frames/shadows preserved | PASS |
| Product HTML/CSS/JS unchanged | PASS |

## 7. Known limitations

- The source mockup has a baked background/checker tone; the derived asset lightly normalizes very bright neutral background pixels while preserving the device/shadow structure.
- The raw 390px site capture still shows a mobile text clipping issue. This report does not fix product CSS because the task scope was asset-only.
- The final phone insertion uses the additional fit capture to avoid shipping an obviously clipped hero image.

## 8. Verdict

Derived asset created: YES.

Recommended for hero replacement: PARTIAL.

The generated image is usable as a cleaner WEB00 device showcase asset, but before product replacement it should be reviewed by the owner because it intentionally uses a fit mobile capture rather than the raw clipped mobile capture.
