# AI Agent Acceptance Gates

Use these gates to keep WEB00 Pro changes controlled and evidence-based.

## 1. Audit Gate

Before implementation:

- confirm task scope and allowed paths;
- identify whether HTML/CSS/JS/assets/backend are in scope;
- avoid secret-like files;
- collect evidence from safe files only;
- report blockers before editing.

Status: `PASS` if scope is clear and safe; `PARTIAL` if assumptions remain; `FAIL` if scope conflicts with policy.

## 2. Implementation Gate

During implementation:

- edit only approved files;
- keep changes small and reversible;
- do not change backend unless explicitly approved;
- do not change JavaScript unless explicitly approved;
- do not replace assets unless explicitly approved;
- preserve static-site behavior.

Status: `PASS` if changes match scope; `PARTIAL` if limited verification is missing; `FAIL` if out-of-scope changes occurred.

## 3. Visual QA Gate

For visual/frontend changes:

- inspect affected pages in browser or screenshots;
- verify header, navigation, footer, CTA hierarchy, forms, modals, and visible text;
- check for overlap, clipped text, accidental dark/legacy styling, and broken premium visual quality;
- keep real mobile owner recheck as required for final acceptance.

Status: `PASS` only with evidence; `PARTIAL` if automated checks pass but real device review is missing; `FAIL` for visible blockers.

## 4. Responsive Gate

For layout changes, check at minimum:

- mobile `360x800`;
- mobile `390x844`;
- tablet `768x1024`;
- touch desktop-site guard around `980x844`;
- desktop `1440x900`.

Required outcomes:

- no page-level horizontal scroll;
- readable mobile menu;
- cards, forms, modals, pricing, status/cabinet, and footer remain inside viewport;
- no console or failed-resource errors from affected pages.

## 5. JS And Static Validation Gate

For static-site changes:

- validate touched HTML links/scripts/styles where practical;
- validate JSON files such as `manifest.webmanifest` when touched;
- run `node --check` only for touched JavaScript or service worker files;
- do not edit JavaScript without approval.

Status: `PASS` if touched files validate; `PARTIAL` if tooling is unavailable; `FAIL` if syntax or resource errors remain.

## 6. Security Gate

Before final report:

- confirm no secret files were read;
- confirm no backend/API/payment/auth behavior changed unless approved;
- confirm no paid API was used by default;
- confirm no public bug-report CTA was introduced;
- confirm no commit/push/deploy/delete/rename occurred without approval.

## 7. Owner Report Gate

Every change report must include:

- files created;
- files modified;
- checks run;
- risks left;
- next recommended task;
- commit/push/deploy executed: `NO` unless explicitly approved and actually completed;
- final status: `FAIL`, `PARTIAL`, or `PASS`.

## Final Status Format

- `PASS`: scope completed, checks pass, no blocking risks.
- `PARTIAL`: useful work completed, but owner review, real mobile check, or another non-blocking gate remains.
- `FAIL`: scope not completed, a blocker remains, or policy/safety requirements were not met.
