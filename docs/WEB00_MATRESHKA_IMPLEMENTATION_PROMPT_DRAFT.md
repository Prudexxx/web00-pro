# WEB00 Matreshka Implementation Prompt Draft

Draft title:

WEB00 MATRESHKA IMPLEMENTATION — CREATE DERIVED ASSET

Important:

- This is a draft for a future task.
- Do not execute this prompt while creating the audit docs.

## Working directory

`D:\Backend\Сайт`

## Goal

Create a production-ready derived hero showcase image from:

`assets/img/матрешка_0.png`

The derived output should show the accepted WEB00 desktop homepage inside the laptop screen and the accepted WEB00 mobile homepage inside the phone screen.

Target output:

`assets/img/matreshka-web00-showcase.png`

## Hard rules

1. Do not modify `assets/img/матрешка_0.png`.
2. Do not delete any source assets.
3. Do not commit.
4. Do not push.
5. Do not deploy.
6. Do not connect backend.
7. Do not run QAMax unless explicitly approved.
8. Do not install dependencies without owner approval.
9. Use an ASCII filename for the derived production asset.
10. Update the hero reference only after visual comparison confirms the derived image is acceptable.

## Inputs

- Source mockup:
  `assets/img/матрешка_0.png`
- Desktop WEB00 source page:
  local or live `index.html`
- Mobile WEB00 source page:
  local or live `index.html`

## Suggested screenshot capture

Desktop:

- Viewport: `1440x900`
- Browser: Chromium
- Capture: home first viewport/top frame
- Target: laptop screen

Mobile:

- Viewport: `390x844`
- Browser: Chromium mobile emulation
- Capture: home first viewport/top frame
- Target: phone screen

Fallback mobile viewport:

- `360x800`

## Approximate screen mapping

Laptop screen polygon:

- top-left: `(526, 62)`
- top-right: `(1312, 150)`
- bottom-right: `(1237, 724)`
- bottom-left: `(469, 579)`

Phone screen polygon:

- top-left: `(169, 205)`
- top-right: `(366, 205)`
- bottom-right: `(366, 756)`
- bottom-left: `(169, 756)`

These coordinates are approximate. Refine by visual overlay before saving the final asset.

## Implementation steps

1. Verify current git state.
2. Verify source image exists:
   `assets/img/матрешка_0.png`
3. Start local static server if needed.
4. Capture desktop screenshot of `index.html` at `1440x900`.
5. Capture mobile screenshot of `index.html` at `390x844`.
6. Crop screenshots to the useful top frame:
   - desktop: header + hero + trust strip / first content hint;
   - mobile: header + hero + actions + trust strip.
7. Perspective-transform desktop screenshot into laptop screen polygon.
8. Transform/crop mobile screenshot into phone screen polygon.
9. Preserve laptop/phone bezels, shadows, notch and premium contours.
10. Treat the source checkerboard background carefully:
    - if it visually conflicts with the WEB00 page, clean it to a light premium background;
    - do not damage device shadows.
11. Save derived output:
    `assets/img/matreshka-web00-showcase.png`
12. Create before/after screenshots:
    - current hero desktop;
    - candidate hero desktop;
    - current hero mobile;
    - candidate hero mobile.
13. Only after visual comparison, update the home hero reference to the derived image if approved by owner.

## Hero integration guidance

Current hero references:

- `index.html:59` `.mock-device`
- `index.html:60` `.mock-laptop`
- `index.html:73` `.mock-phone`
- `assets/css/home.css:2402` desktop clean screen background
- `assets/css/home.css:2439` mobile clean screen background

Recommended integration:

- Prefer replacing the visual inside `.mock-device` with a single constrained image wrapper.
- Keep Wave 10.1 mobile responsive guards intact.
- Do not change navigation, copy, CTA routing or backend/PWA behavior.

## Checks

Run after implementation:

```powershell
node --check assets/js/main.js
node --check assets/js/data.js
node --check sw.js
git -c safe.directory="D:/Backend/Сайт" diff --check
```

Responsive smoke:

- Desktop `1440x900`
- Desktop `1366x768`
- Tablet `768x1024`
- Mobile `390x844`
- Mobile `360x800`

Check:

- no horizontal scroll;
- hero image does not crop critical device parts;
- laptop and phone proportions look natural;
- source PNG remains untouched;
- derived asset has ASCII filename;
- mobile still shows readable layout;
- desktop hero still fits the first screen;
- no console errors;
- no failed resources.

## Evidence

Create evidence only if requested:

- before/after desktop screenshot;
- before/after mobile screenshot;
- derived asset size note;
- visual comparison notes.

## Commit/push/deploy

Do not commit, push or deploy without explicit owner approval.

Expected final report:

1. Source preserved: YES/NO
2. Derived asset created: YES/NO
3. Derived asset path
4. Desktop screenshot used
5. Mobile screenshot used
6. Hero updated: YES/NO
7. JS checks
8. Responsive smoke
9. Product files changed
10. Ready for owner visual review: YES/NO
