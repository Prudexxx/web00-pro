# WEB00 Design Finality Decision

## 1. Decision

`DESIGN_NOT_FINAL`

The current local frontend is significantly improved and the core product pages look like a credible WEB00 light-premium product. It is not final yet because P1 release/design gates remain:

- GitHub Pages live is stale and does not serve the current Matryoshka hero.
- Old public language remains in visible/renderable copy.
- Public bug-report UI remains exposed.
- Cabinet mobile header/logo contrast is visibly broken.

## 2. Conditions for acceptance

Design can move to `DESIGN_FINAL_READY` only when:

1. Live GitHub Pages serves the same commit and hero assets as local `origin/main`.
2. Public language gate is clean:
   - no visible `шаблон/Шаблон/шаблоны/Шаблоны`;
   - no visible `бриф/Бриф`;
   - no visible UI `API`;
   - no visible `SEO-ready`, `Performance`, `Accessibility`, or raw `SEO` wording.
3. Public bug-report entry points are removed or formally accepted as internal-only.
4. Cabinet/app/install shell is visually aligned enough not to look like a separate product.
5. Real owner mobile recheck passes after the above.

## 3. Owner visual checkpoints

- Home mobile 390x844 and 412x915.
- Home desktop 1440x900.
- Catalog mobile 390x844.
- Pricing mobile and desktop.
- Brief form mobile and desktop.
- Status found and not-found states.
- Cabinet mobile.
- Contacts and app shell mobile.
- Install page mobile.

## 4. Required before video QA

- Resolve GitHub Pages stale deployment.
- Re-run a public language gate.
- Remove/internalize public bug-report UI.
- Fix cabinet header/logo contrast.
- Confirm live pages return 200 for all video-QA URLs.
- Confirm no horizontal scroll on at least 360, 390, 412, 768, 1024, 1440.

## 5. Required before backend/admin

- Same P1 cleanup as above.
- Keep cabinet/status wording honest: frontend/localStorage preview until backend exists.
- Preserve form/status flow without adding backend promises.
- Run video QA archive after design P1 cleanup.

## 6. Explicit non-goals

- No backend/admin/auth/payment implementation in design finality cleanup.
- No new Matryoshka image generation unless owner requests it.
- No pricing/data model changes.
- No large redesign of accepted core pages.
- No QAMax during the design-finality audit itself.
