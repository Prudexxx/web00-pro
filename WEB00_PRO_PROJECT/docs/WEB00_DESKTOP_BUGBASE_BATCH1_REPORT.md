# WEB00 Desktop Bugbase Batch 1 Report

## 1. Summary

Desktop-polish batch completed for the home page. The work stayed scoped to the home shell: scroll behavior, brand readability, pricing card polish, main-to-footer transition, and footer rhythm.

No backend, PWA, manifest, service worker, workflow, image, commit, push, or deploy work was performed.

## 2. Bugs addressed

| ID | Status | Files | Notes |
|---|---|---|---|
| WEB00-PC-001 | PASS | `assets/css/home.css` | Home page now uses a stable visible vertical scrollbar and overrides smooth page scrolling with `scroll-behavior: auto` on the home layer. No modal/body lock was active during smoke. |
| WEB00-PC-002 | PASS | `index.html`, `assets/css/home.css` | Closing CTA was converted into a calmer premium transition before the footer: “Готовы выбрать сайт и запустить проект?”. |
| WEB00-PC-003 | PASS | `assets/css/home.css` | Logo numerals now use the sans numeric stack with tabular/zero features and tighter numeric styling, making `WEB00` read as zeros instead of `oo`. |
| WEB00-PC-004 | PASS | `index.html`, `assets/css/home.css` | Footer links are grouped into `mock-footer__nav`; “Установить на телефон” is now part of the footer nav, and the signature remains under the separator. |
| WEB00-PC-005 | PASS | `assets/css/home.css` | Pricing cards were upgraded with stronger structure, card depth, list bullets, full-width CTAs, and a restrained Business emphasis without changing prices. |

## 3. Scroll diagnosis

Search covered `scroll-snap`, `scroll-behavior`, `overflow`, modal/body lock, fixed positioning, viewport-height locks, and wheel handlers across HTML/CSS/JS.

Findings:
- No active `scroll-snap-type` was found for the home page.
- Shared layers still contain `scroll-behavior: smooth`, but the home page now overrides it with `scroll-behavior: auto` in `assets/css/home.css`.
- Previous home CSS hid the page scrollbar with zero-width scrollbar styling, which made desktop scrolling feel less natural. The home layer now keeps a stable visible scrollbar.
- JS modal lock classes remain in `assets/js/main.js`, but browser smoke showed `activeModalOpen: false` on home.

Evidence:
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/raw/browser-results.json`
- desktop 1440 smoke: no console errors, no page errors, no request failures, no horizontal overflow.

## 4. Logo fix

The header/footer logo markup remains unchanged, but the CSS now makes the `00` numerals visually numeric:
- numeric sans stack for the `span`;
- heavier weight;
- tabular numeric feature hints;
- less aggressive negative letter spacing.

Verified on:
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/screenshots/home-1440-top.png`
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/screenshots/home-1440-footer.png`
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/screenshots/home-390-top.png`

## 5. Pricing polish

Home pricing cards now use:
- taller premium cards;
- consistent internal grid;
- subtle surface gradient and shadow;
- visible bullet markers;
- full-width CTAs;
- Business as a restrained recommended visual emphasis.

Prices stayed unchanged:
- Start: `от 39 000 ₽`
- Business: `от 69 000 ₽`
- Pro: `от 99 000 ₽`

Evidence:
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/screenshots/home-1440-pricing.png`
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/screenshots/home-390-footer.png`

## 6. Footer / closeout polish

The footer was restructured into a clearer two-column rhythm:
- left: logo and language trigger;
- right: footer nav, including install link;
- separator line;
- quiet public signature under the line:
  `WEB00 Pro — premium website platform · Designed & Engineered by Vitaliy Glebov · © 2026`

The closing CTA section now creates a cleaner transition into the footer instead of an abrupt ending.

## 7. Checks

Final checks:
- `node --check assets/js/main.js` - PASS
- `node --check assets/js/data.js` - PASS
- `node --check sw.js` - PASS
- `git diff --check` - PASS
- HTTP smoke - PASS:
  - `/` - 200
  - `/pricing.html` - 200
  - `/contacts.html` - 200
  - `/cabinet.html` - 200

Browser smoke evidence already captured:
- HTTP 200 for `/`, `/pricing.html`, `/contacts.html`, `/cabinet.html`;
- viewports checked: 1366x768, 1440x900, 1920x1080, 390x844;
- console errors: 0;
- page errors: 0;
- request failures: 0;
- horizontal overflow: 0.

Screenshots:
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/screenshots/home-1440-top.png`
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/screenshots/home-1440-pricing.png`
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/screenshots/home-1440-footer.png`
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/screenshots/home-390-footer.png`
- `_qa/WEB00_DESKTOP_BUGBASE_BATCH1/screenshots/home-390-top.png`

## 8. Remaining risks

- Real owner mouse-wheel feel should still be rechecked manually because perceived scroll “stickiness” depends on physical input and browser/device behavior.
- Shared legacy CSS still contains smooth scrolling and modal locks for other pages; this batch only fixed the home page as requested.
- `docs/WEB00_BUGBASE.md` was not updated because it does not exist in the repository.

## 9. Ready for owner recheck

YES. The batch is ready for owner desktop recheck on the home page and a quick mobile regression glance.
