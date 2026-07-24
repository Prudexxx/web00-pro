# WEB00 Matryoshka Regen V2 Report

## 1. Executive summary

- Source: `assets/img/matryoshka.png`
- Output: `assets/img/matryoshka-clean.png`
- Language fixed: YES, by replacing the visible laptop and phone screen content with clean WEB00 screen sources.
- Recommended for owner review: YES.

The source asset was not modified. Product HTML, CSS, JS, manifest, service worker, favicon and icons were not modified.

## 2. Source / output

| Item | Path | Dimensions | Notes |
|---|---|---:|---|
| Source | `assets/img/matryoshka.png` | 1448x1086 | Owner-provided asset, preserved |
| Output | `assets/img/matryoshka-clean.png` | 1448x1086 | Clean regenerated asset |
| Source copy | `_qa/WEB00_MATRYOSHKA_REGEN_V2/source-matryoshka-copy.png` | 1448x1086 | Evidence copy |

File sizes:

- `assets/img/matryoshka.png`: 1,666,261 bytes
- `assets/img/matryoshka-clean.png`: 1,212,166 bytes

## 3. Screenshots used

| Target | Viewport | Source | Path | Language clean |
|---|---:|---|---|---|
| Laptop | 1440x900 | Local WEB00 homepage, sanitized evidence copy | `_qa/WEB00_MATRYOSHKA_REGEN_V2/web00-desktop-clean-1440x900.png` | YES |
| Laptop raw backup | 1440x900 | Raw local WEB00 homepage capture | `_qa/WEB00_MATRYOSHKA_REGEN_V2/web00-desktop-clean-1440x900-raw.png` | PARTIAL |
| Phone raw evidence | 390x844 | Raw local WEB00 homepage capture | `_qa/WEB00_MATRYOSHKA_REGEN_V2/web00-mobile-clean-390x844.png` | YES |
| Phone final source | 390x844 | Fit capture from local WEB00 homepage | `_qa/WEB00_MATRYOSHKA_REGEN_V2/web00-mobile-clean-390x844-fit.png` | YES |

Notes:

- The raw desktop capture contained stale micro-copy inside the nested hero device preview. The product page itself was not changed; only the evidence screenshot used for the final image was sanitized by replacing that nested preview with a neutral WEB00 device visual without forbidden words.
- The raw 390x844 mobile capture did not contain forbidden terms, but the H1 was visually clipped. The final phone screen uses the fit 390x844 capture to avoid carrying that clipping into the asset.

## 4. Screen mapping

| Screen | Polygon / area | Inset | Notes |
|---|---|---:|---|
| Laptop | `(519,58)`, `(1348,153)`, `(1270,714)`, `(459,605)` | Slight inward screen fit | Replaces full old laptop screen content while preserving frame and keyboard |
| Phone | `(164,196)`, `(374,196)`, `(374,775)`, `(164,775)` | Slight inward screen fit | Replaces full old phone screen content while preserving frame and top hardware |

The compositing was done with Pillow perspective transforms. Old screen content was not restored inside the screen masks. Dark frame pixels were restored only outside the screen areas plus limited notch/camera zones.

## 5. Quality checks

| Check | Result | Notes |
|---|---|---|
| Old wording removed | PASS | No visible `Выбрать шаблон` or `Готов к SEO` remains in the final screen content by manual visual check |
| No forbidden English terms | PASS | No visible `Performance`, `SEO-ready`, `Accessibility`, `Bug report` in final screen content by manual visual check |
| No blank screens | PASS | Laptop and phone screens both contain WEB00 content |
| Laptop screen filled cleanly | PASS | Perspective is credible; old content is covered |
| Phone screen filled cleanly | PASS | Fit capture avoids raw mobile H1 clipping |
| No spill outside frames | PASS | Checked full output and cropped evidence |
| Source untouched | PASS | Source hash unchanged during generation; source copy matches source pixels |
| Visual premium | PASS for owner review | Composition is cleaner than the blocked source, but should still be owner-reviewed before hero integration |

OCR was not used; language gate verification was manual visual inspection plus source evidence review.

## 6. Evidence files

Evidence folder:

`_qa/WEB00_MATRYOSHKA_REGEN_V2/`

Files:

- `source-matryoshka-copy.png`
- `web00-desktop-clean-1440x900.png`
- `web00-desktop-clean-1440x900-raw.png`
- `web00-mobile-clean-390x844.png`
- `web00-mobile-clean-390x844-fit.png`
- `laptop-mask-debug.png`
- `phone-mask-debug.png`
- `matryoshka-clean-preview.png`
- `before-after.png`
- `final-laptop-topright-crop.png`
- `final-phone-crop.png`
- `desktop-hero-device-crop.png`

## 7. Performance notes

Current PNG size:

- `assets/img/matryoshka-clean.png`: 1,212,166 bytes

Before hero integration, create responsive derivatives:

- `assets/img/matryoshka-clean-720.webp`
- `assets/img/matryoshka-clean-1200.webp`
- `assets/img/matryoshka-clean-1600.webp`

Do not use the single full-size PNG as the only production hero source on mobile.

## 8. Verdict

`READY_FOR_OWNER_REVIEW`

## 9. Next step

If accepted:

`MATRYOSHKA RESPONSIVE DERIVATIVES + HERO INTEGRATION V1`

That follow-up should create WebP derivatives and then update the hero reference in a separate, explicitly approved task.
