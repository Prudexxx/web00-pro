# WEB00 Design Finality Execution Prompt Draft

This is a draft for a future task. Do not execute it automatically.

## Task title

WEB00 DESIGN FINALITY PATCH — P1 cleanup before video QA

## Goal

Close the P1 design-finality blockers found in `docs/WEB00_DESIGN_FINALITY_AUDIT_REPORT.md` without redesigning the accepted core WEB00 pages.

## Allowed scope

- Fix GitHub Pages delivery only through approved release/deployment actions, not product redesign.
- Clean public language-gate copy in:
  - `cases.html`
  - `privacy-policy.html`
  - `assets/js/main.js` i18n public strings
- Remove or internalize public bug-report UI in:
  - `app.html`
  - `contacts.html`
  - `cabinet.html`
  - dynamic UI in `assets/js/main.js`
- Fix cabinet mobile header/logo contrast.
- Optional small shell alignment for `install.html` and `app.html`.

## Hard rules

- Do not change prices.
- Do not change backend/admin/auth/payment.
- Do not change Matryoshka imagery unless owner explicitly requests it.
- Do not run QAMax unless separately approved.
- Do not deploy manually unless separately approved.
- Keep changes focused and evidence-backed.

## Acceptance checks

1. Local pages return 200.
2. Live Pages serves current Matryoshka hero/assets.
3. Static and rendered language gate is clean.
4. Public bug-report surfaces are removed or owner-approved as internal-only.
5. Cabinet header/logo contrast is fixed on 360/390/412.
6. No horizontal scroll on:
   - 360x800
   - 390x844
   - 412x915
   - 768x1024
   - 1024x768
   - 1440x900
7. No product flow regressions:
   - Home -> Catalog
   - Catalog -> Demo / Questionnaire
   - Pricing -> Questionnaire
   - Questionnaire -> Status
   - Status -> Cabinet
   - Contacts -> Support

## Evidence to create

- `_qa/WEB00_DESIGN_FINALITY_PATCH/`
- Screenshots for:
  - home 390/1440
  - cabinet 390
  - contacts 390
  - app 390
  - cases 390
  - privacy 390
- `docs/WEB00_DESIGN_FINALITY_PATCH_REPORT.md`

## Expected result

Target decision after patch:

- `DESIGN_CONDITIONAL` minimum if only P1 blockers are closed.
- `DESIGN_FINAL_READY` only after owner real-device acceptance and live Pages verification.
