# WEB00 Wave 3 Legacy Quarantine Map

## 1. Legacy CSS files

- `assets/css/styles.css`
  - Transitional global layer.
  - Still contains base, shell, components, page-specific, modals/forms/status and dark/neon legacy.
- `assets/css/legacy.css`
  - New quarantine map.
  - Not linked from production light premium pages.
  - Contains explicit `.web00-legacy-*` primitives only.
- `assets/css/home-premium.css`
  - Mixed legacy/fallback homepage layer.
  - Still linked before `home.css` on `index.html`.
- `assets/css/web00-tabs-standard.css`
  - Late shared patch-layer for non-home pages.
  - Still linked after page-specific CSS to preserve current mobile/public tab visual standard.

## 2. What must die later

- Dark root variables in `styles.css`:
  - `--bg: #050812`
  - `--bg-2: #07111f`
  - `--blue`
  - `--violet`
  - `--violet-2`
  - `--glow-red`
  - `--glow-violet`
- Old dark body radial backgrounds and dark gradients.
- Neon/violet gradient accents that are not part of the light premium system.
- Manrope dark-shell typography block in `styles.css`.
- Mixed sprint/FE-patch blocks in `styles.css` that should live in page CSS or common layers.
- `home-premium.css` after its still-useful shell/footer/menu leftovers are either moved or proven dead.
- `web00-tabs-standard.css` after its rules are merged into proper page/common layers.

## 3. What must survive

- `tokens.css` light premium design tokens.
- `base.css` reset and base defaults.
- `shell.css` shared low-specificity shell defaults.
- `components.css` shared low-specificity component primitives.
- `home.css` production homepage layer.
- Page-specific premium layers:
  - `catalog-premium.css`
  - `pricing-premium.css`
  - `brief-premium.css`
  - `status-premium.css`
  - `public-premium.css`
- Modal/form behavior styles until they are safely extracted from `styles.css`.
- Body lock and mobile menu support until moved and visually verified.

## 4. Safe next deletions later

Only after a dedicated visual smoke / regression pass:

1. Remove dead `premium-*` homepage selectors from `home-premium.css` if `index.html` still uses only `mock-*`.
2. Move modal/form primitives out of `styles.css` into `components.css`.
3. Move shell/mobile nav/footer active-state rules out of `styles.css` into `shell.css`.
4. Move status/contact/service page rules into their page-specific CSS.
5. Remove dark/neon root variables from `styles.css` after no active selector depends on them.
6. Remove `styles.css` from one low-risk page first, then expand page-by-page.
