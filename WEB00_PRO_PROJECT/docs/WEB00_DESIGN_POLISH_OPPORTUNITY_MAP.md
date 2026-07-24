# WEB00 Design Polish Opportunity Map

## P0/P1 required before video QA

| ID | Area | Current issue | Proposed improvement | Risk | Effort | Priority |
|---|---|---|---|---|---|---|
| DFA-001 | Live delivery | GitHub Pages serves old HTML and 404 for new matryoshka assets. | Clear Pages build/deployment state; verify live HTML/assets match `2ce3825...`. | Video QA would archive the wrong site. | Medium | P1 |
| DFA-002 | Public language | `шаблоны/шаблоном` and `SEO` remain in public/renderable copy. | Replace with `готовые сайты`, `рабочим текстом`, `готов к продвижению` or equivalent. | Product language gate fails. | Low | P1 |
| DFA-003 | Public bug-report UI | Public surfaces still expose bug-report buttons/forms. | Remove from public UI or move behind internal-only/debug surface. | Final public release guard fails. | Medium | P1 |
| DFA-004 | Cabinet header | Cabinet mobile logo/header contrast is broken. | Reuse accepted light shell/header styling. | Brand looks broken on owner mobile screenshots. | Low | P1 |

## P2 recommended before backend

| ID | Area | Current issue | Proposed improvement | Risk | Effort | Priority |
|---|---|---|---|---|---|---|
| DFA-005 | Install/app shell | Install/app screens are functional but visually drift from core premium pages. | Align header, buttons, color and card rhythm with main shell. | Video QA looks inconsistent. | Medium | P2 |
| DFA-006 | Legal copy | Privacy policy contains first-version/template wording. | Replace with production-safe legal placeholder wording or owner-approved legal text. | Weakens credibility. | Low | P2 |
| DFA-007 | Demo/submit flow | Full interaction trace was not recorded in this audit. | Include demo modal, brief submit, status/cabinet in video QA checklist. | Hidden flow issues may remain. | Medium | P2 |
| DFA-008 | Brief page | Brief desktop is usable but could be more polished. | Improve summary/context block and stepper rhythm without redesign. | Lower perceived quality in form flow. | Medium | P2 |
| DFA-009 | Status/cabinet wording | Project cabinet is frontend/localStorage preview. | Keep wording honest; avoid backend/auth/payment promises. | Backend expectations may be wrong. | Low | P2 |
| DFA-010 | Performance | Large PNG fallback and no Lighthouse result. | Run Lighthouse/Web Vitals after live Pages updates; keep WebP first. | LCP unknown. | Low | P2 |

## P3 later

| ID | Area | Current issue | Proposed improvement | Risk | Effort | Priority |
|---|---|---|---|---|---|---|
| DFA-011 | Spacing | Minor rhythm differences across public/support pages. | Tune spacing after final shell cleanup. | Cosmetic. | Low | P3 |
| DFA-012 | Footer/language/social | Acceptable but can be more refined. | Later footer/language selector polish. | Cosmetic. | Low | P3 |
| DFA-013 | i18n | Multilingual states not fully visually audited. | Separate language QA if multilingual launch remains. | Later scope drift. | Medium | P3 |
| DFA-014 | Real device | Device Mode only; real owner Samsung/iOS checks pending. | Owner real-device acceptance pass. | Automated evidence is incomplete. | Low | P3 |

## Do not touch

- Do not redesign the accepted Matryoshka hero from scratch.
- Do not change prices or tariff structure during design polish.
- Do not add backend/auth/payment/admin claims.
- Do not reintroduce dark/neon visual language.
- Do not use `шаблон/бриф/API/SEO-ready/Performance/Accessibility` in public UI.
- Do not expose a public bug-report CTA in final public release without explicit owner acceptance.

## Suggested waves

1. **Wave D1: Public release blockers**
   - Fix Pages deployment status.
   - Clean language gate.
   - Remove or internalize public bug-report UI.
   - Fix cabinet header/logo contrast.

2. **Wave D2: Support/app shell polish**
   - Align `install.html`, `app.html`, `contacts.html`, and `cabinet.html` with the accepted light premium shell.

3. **Wave D3: Flow video readiness**
   - Record demo viewer, brief submit, status found/not-found, cabinet/support flows.
   - Run Lighthouse/Web Vitals only after live Pages serves the current build.

4. **Wave D4: Later polish**
   - Footer/language/social refinement.
   - Multilingual QA.
   - Minor spacing/rhythm pass.
