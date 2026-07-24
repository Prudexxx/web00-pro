# WEB00 Design Finality Audit Report

## 1. Executive summary

- Current design status: local frontend at `2ce3825dde504b2fc6c606ee0a8ffdf8f7173572` is visually coherent on the core marketing flow, but it is not final for public/video-QA acceptance.
- Finality verdict: `DESIGN_NOT_FINAL`.
- P0/P1/P2/P3 counts: P0 `0`, P1 `4`, P2 `6`, P3 `4`.
- Ready for 45-video QA: `NO`.
- Ready for backend/admin phase: `NO`.
- Product code changed during audit: `NO`.

Main positive result: the current local build is no longer a desktop-shrunk mobile site. The home, catalog, pricing, brief, and status pages are broadly aligned with the WEB00 light-premium direction and passed automated viewport checks with no horizontal overflow.

Main blockers: the public GitHub Pages site is stale, old public language remains, public bug-report UI remains exposed, and `cabinet.html` has a visible mobile header/logo contrast issue.

## 2. Source/methodology

| Source | Used for |
|---|---|
| NN/g 10 Usability Heuristics | Clarity, consistency, match with user language, minimalist design, error/support review |
| Chrome DevTools Device Mode | Viewport matrix and device-emulation limitation |
| Playwright Screenshots / Videos / Trace | Screenshot evidence and future video QA planning |
| Web Vitals | LCP/CLS/INP performance-risk framing |
| Lighthouse overview | Performance/accessibility/SEO baseline framing |
| W3C WAI Forms Tutorial | Form labels, instructions, validation and success/error UX |
| WCAG contrast minimum / target size minimum | Contrast and tap target baseline |

Source URLs were reachable during the audit. Device-mode evidence is treated as evidence, not a replacement for owner real-device Samsung/iOS checks.

## 3. Page-by-page visual audit

| Page | Mobile | Tablet | Desktop | Notes |
|---|---|---|---|---|
| `/` | PASS | PASS | PASS | Matryoshka hero is now composed as a mobile landing, not a desktop shrink. |
| `/solutions.html` | PASS | PASS | PASS | Catalog is readable and consistent with light premium. |
| `/pricing.html` | PASS | PASS | PASS | Cards/table are readable; no horizontal overflow. |
| `/brief.html` | PASS | PASS | PARTIAL | Form works visually; desktop context card/stepper can still be more polished. |
| `/status.html?id=WEB00-2026-0001` | PASS | PASS | PASS | Project-status view reads clearly. |
| `/status.html?id=UNKNOWN-123` | PASS | PASS | PASS | Not-found state is readable and actionable. |
| `/cabinet.html` | PARTIAL | PARTIAL | PARTIAL | Mobile header/logo contrast is visibly weak; public bug-report CTA remains. |
| `/install.html` | PARTIAL | PARTIAL | PARTIAL | Functional, but darker/gradient styling drifts from light premium. |
| `/app.html` | PARTIAL | PARTIAL | PARTIAL | Utility surface is readable, but public bug-report item remains. |
| `/contacts.html` | PARTIAL | PARTIAL | PARTIAL | Clear support page, but public error-report entry remains. |
| `/faq.html` | PASS | PASS | PASS | Mobile CTA stack and FAQ content are readable. |
| `/services.html` | PASS | PASS | PASS | No major responsive issue found. |
| `/how-it-works.html` | PASS | PASS | PASS | No major responsive issue found. |
| `/cases.html` | PARTIAL | PARTIAL | PARTIAL | Empty-state concept is fine, but old `шаблоны` wording remains. |
| `/privacy-policy.html` | PARTIAL | PARTIAL | PARTIAL | Contains visible placeholder/legal wording and `шаблоном`. |
| `/consent-personal-data.html` | PASS | PASS | PASS | No major responsive issue found in screenshots. |

Evidence root: `_qa/WEB00_DESIGN_FINALITY_AUDIT/`.

## 4. Flow audit

| Flow | Result | Issues | Severity |
|---|---|---|---|
| Home -> Catalog | PASS | Local navigation and visual state are clear. | P3 |
| Catalog -> Preview / Questionnaire | PARTIAL | Demo viewer was not fully interaction-recorded in this audit; static hooks exist. | P2 |
| Pricing -> Questionnaire | PASS | CTA path is visible and readable. | P3 |
| Questionnaire -> Success -> Status | PARTIAL | Flow code exists; not fully submitted in this audit run. | P2 |
| Status -> My project | PASS | Status/cabinet route is present and readable. | P3 |
| Cabinet -> Support | PARTIAL | Support route exists, but bug-report entry is publicly exposed. | P1 |
| Contacts -> Support / Error report | PARTIAL | Support is clear; public error-report UI conflicts with final public-release guard. | P1 |
| Install/App shell | PARTIAL | Functional shell exists; visual style is not fully aligned with the main premium system. | P2 |

## 5. Mobile audit

| Check | Result | Evidence |
|---|---|---|
| No horizontal scroll | PASS | 128 viewport-page checks, overflow count `0`. |
| Home hero not clipped | PASS | `screenshots/home-360x800.png`, `home-390x844.png`, `home-412x915.png`. |
| CTA readable and touch-friendly | PASS | No tap targets below 24px or 44px detected by the audit script. |
| Header/menu readable | PARTIAL | Most pages pass; `cabinet.html` logo contrast is weak on mobile. |
| Cards/forms readable | PASS | Catalog, pricing, brief and status mobile screenshots are readable. |
| Real phone acceptance | NOT TESTED | Device Mode is not a full substitute for owner Samsung/iOS checks. |

## 6. Premium/business-tech audit

| Criterion | Result | Notes |
|---|---|---|
| Light premium system | PASS | Core pages use white/cream, burgundy accent, serif headers and clean sans UI. |
| Matryoshka hero | PASS local | Local current HEAD renders the new hero asset; live Pages is stale. |
| Cross-page consistency | PARTIAL | Core pages are consistent; app/install/cabinet need shell polish. |
| Trust/credibility | PARTIAL | Main trust blocks are good; legal placeholder wording weakens credibility. |
| No dark-tech drift | PARTIAL | Install page uses a darker header/gradient accent that feels outside the system. |
| No "constructor/toy" feel | PASS | Core commercial pages look product-grade. |

## 7. Accessibility/form audit

| Area | Result | Notes |
|---|---|---|
| Tap target baseline | PASS | Automated check found no targets below 24px or 44px in the sampled states. |
| Form readability | PASS | Brief page labels are visible; placeholder is not the only instruction. |
| Error/help quality | PARTIAL | Support/error-report model is understandable, but public bug-report exposure conflicts with release guard. |
| Contrast | PARTIAL | Cabinet mobile logo/header contrast needs correction. |
| Keyboard/focus | NOT FULLY TESTED | No full keyboard traversal was performed in this audit. |
| Modal accessibility | PARTIAL | Demo modal hooks exist; full modal interaction/video pass remains for QA. |

## 8. Performance/design risk

| Risk | Result | Notes |
|---|---|---|
| Hero asset size | PARTIAL | WebP derivatives are present locally; PNG fallback is ~1.25MB. |
| Live asset delivery | FAIL | GitHub Pages live still returns old HTML and 404 for new matryoshka assets. |
| Layout shift | NOT FULLY TESTED | No Lighthouse/Web Vitals run was performed by design-finality audit. |
| Local HTTP resources | PASS | Local checked pages/assets returned HTTP 200. |
| CDP aborted requests | NOTE | The screenshot runner logged `net::ERR_ABORTED` request ids during rapid navigation; separate HTTP checks did not confirm local 404s. |

## 9. Findings

| ID | Severity | Area | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|
| DFA-001 | P1 | Release/live | GitHub Pages live is stale: homepage lacks `hero-matryoshka`; new WebP/PNG assets return 404 on Pages. | Live check: `/` 200 but `HasHero=False`; raw GitHub assets 200. | Resolve Pages deployment/build queue before public video QA. |
| DFA-002 | P1 | Language gate | Visible old copy remains: `cases.html` uses `шаблоны`; `privacy-policy.html` uses `шаблоном`; i18n includes visible `SEO対応`. | `cases.html:62`, `privacy-policy.html:41`, `assets/js/main.js:663`. | Run a focused public-language cleanup. |
| DFA-003 | P1 | Public release guard | Public bug-report UI remains exposed in app/contacts/cabinet/status dynamic UI. | `app.html:33`, `contacts.html:55`, `contacts.html:142`, `contacts.html:146`, `cabinet.html:107`, `assets/js/main.js:1702/1824/2318`. | Decide internal-only vs remove from public release surfaces. |
| DFA-004 | P1 | Cabinet shell | `cabinet.html` mobile header/logo contrast is weak; brand mark is partly invisible. | `screenshots/cabinet-390x844.png`. | Align cabinet shell with the accepted light-premium header. |
| DFA-005 | P2 | Install/app shell | `install.html` and `app.html` feel more utility/dark/gradient than the main WEB00 premium system. | `screenshots/install-390x844.png`, `screenshots/app-390x844.png`. | Add a small shell polish wave for install/app. |
| DFA-006 | P2 | Legal trust | Privacy policy still says the text is a working template for the first version. | `privacy-policy.html:41`. | Replace placeholder legal wording before production-level QA. |
| DFA-007 | P2 | Flow QA | Demo modal and full submit flow were not video-recorded in this audit. | Static hooks in `assets/js/main.js`; no flow trace generated. | Include in the 45-video QA only after P1 cleanup. |
| DFA-008 | P2 | Brief polish | Brief page is usable but desktop context/stepper can be visually calmer and more premium. | `screenshots/brief-1440x900.png`. | Optional brief visual polish before backend/admin. |
| DFA-009 | P2 | Status/cabinet trust | Status works visually, but frontend-preview cabinet needs careful wording as backend is absent. | `screenshots/status-found-390x844.png`, `cabinet-390x844.png`. | Keep wording honest; avoid auth/backend claims. |
| DFA-010 | P2 | Performance | Large PNG fallback and no Lighthouse/Web Vitals result leave performance finality unresolved. | Local asset `/assets/img/matryoshka-clean-final.png` 1,248,491 bytes. | Run Lighthouse/Web Vitals after Pages updates. |
| DFA-011 | P3 | Spacing | Minor vertical rhythm differences remain between core and support/public pages. | Multi-page screenshots. | Polish after P1/P2 blockers. |
| DFA-012 | P3 | Footer/social/language | Footer/language/social areas are acceptable but could be refined. | Mobile screenshots. | Later design polish only. |
| DFA-013 | P3 | Internationalization | Non-Russian languages are present but were not fully audited visually. | `assets/js/main.js` i18n blocks. | Later i18n QA if multilingual launch stays in scope. |
| DFA-014 | P3 | Real devices | Real iOS/macOS Safari and owner Samsung recheck were not performed in this audit. | Device Mode only. | Treat as mandatory final acceptance gate. |

## 10. Verdict

`DESIGN_NOT_FINAL`

The core frontend has moved into a credible premium direction, and there are no P0 layout failures in local evidence. However, the design cannot be called final while live Pages is stale, public language-gate violations remain, public bug-report surfaces are exposed, and the cabinet shell has a visible mobile header/brand issue.
