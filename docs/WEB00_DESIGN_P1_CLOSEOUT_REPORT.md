# WEB00 Design P1 Closeout Report

## 1. Executive summary

- P1 closed: NO
- Remaining P1 count: 1
- Ready for 45-video QA: NO
- Ready for backend/admin: NO

Local actionable P1 fixes were applied for public bug-report emphasis, cabinet mobile header/logo contrast, and the remaining public language gate blockers. One P1 blocker remains: GitHub Pages is still serving stale content while the Pages run is queued/building.

## 2. P1 findings

| ID | Finding | Status | Files | Notes |
|---|---|---|---|---|
| P1.1 | GitHub Pages stale / deployment does not serve Matryoshka hero | OPEN_EXTERNAL | none | Local and remote `main` are at `2ce3825dde504b2fc6c606ee0a8ffdf8f7173572`, but Pages status is `building`, latest run `28713927037` remains queued, live homepage does not contain `hero-matryoshka`, and new Matryoshka assets return 404. |
| P1.2 | Public language gate | CLOSED_LOCAL | `cases.html`, `privacy-policy.html` | P1.1 replaced visible `шаблоны` / `шаблоном` wording. Current static scan has no public blocker matches; only technical/service exceptions remain. |
| P1.3 | Public bug-report UI too visible | CLOSED_LOCAL | `contacts.html`, `cabinet.html`, `app.html`, `assets/js/main.js`, `assets/css/public-premium.css`, `assets/css/status-premium.css`, `assets/css/components.css` | Large public error CTA was removed/demoted. Remaining problem entry points are secondary support links/buttons with `Описать проблему`, not primary sales CTAs. |
| P1.4 | Cabinet mobile header/logo contrast | CLOSED_LOCAL | `assets/css/status-premium.css` | Cabinet mobile header/logo/menu button now use readable light premium background and ink colors across checked mobile/tablet viewports. |

## 3. Pages deployment state

| Item | Result |
|---|---|
| Local HEAD | `2ce3825dde504b2fc6c606ee0a8ffdf8f7173572` |
| Remote `origin/main` | `2ce3825dde504b2fc6c606ee0a8ffdf8f7173572` |
| GitHub Pages status | `building` |
| GitHub Pages source | `main /` |
| Build type | `legacy` |
| Latest visible Pages run | `28713927037`, queued |
| Live homepage HTTP | 200 |
| Live homepage contains `hero-matryoshka` | NO |
| Live Matryoshka WebP/PNG assets | 404 |
| Deployment classification | `DEPLOYMENT_P1_EXTERNAL` |

## 4. Language gate

| Term | Result | Notes |
|---|---|---|
| `шаблон` / `шаблоны` | CLEAN | P1.1 replaced the remaining visible matches in `cases.html` and `privacy-policy.html`. |
| `бриф` / `Бриф` | CLEAN | No public product matches in checked root HTML/assets scope. |
| `API` | CLEAN | No public product matches in checked root HTML/assets scope. |
| `SEO`, `SEO-ready`, `Performance` | CLEAN | No public product matches in checked root HTML/assets scope. |
| `Accessibility` | TECHNICAL_EXCEPTION | CSS comment in `assets/css/tokens.css`. |
| `Bug report` / `bug report` | CLEAN | No public English bug-report wording found. |
| `data-open-bug` | TECHNICAL/SERVICE_EXCEPTION | Still used as modal plumbing and secondary support actions. |

## 5. Bug-report UI

| Page | Result | Notes |
|---|---|---|
| `contacts.html` | DEMOTED | Hero no longer contains the large error/report CTA. Support problem entry is a quieter secondary card/action. |
| `cabinet.html` | DEMOTED | Support action text changed to `Описать проблему` and styled as a quiet secondary link/button. |
| `app.html` | DEMOTED | Equal-weight app-grid error tile was removed; problem entry moved to a muted text link. |
| `status.html` rendered via `assets/js/main.js` | DEMOTED | Status support action now uses quiet secondary styling and `Описать проблему`. |

## 6. Cabinet mobile contrast

| Viewport | Result | Notes |
|---|---|---|
| 360x800 | PASS | Header/logo/menu readable. |
| 390x844 | PASS | Header/logo/menu readable; screenshot reviewed. |
| 412x915 | PASS | Header/logo/menu readable. |
| 768x1024 | PASS | Header rhythm remains stable. |

## 7. Visual smoke

| Page | Mobile | Tablet | Desktop | Notes |
|---|---|---|---|---|
| `contacts.html` | PASS | PASS | PASS | Bug-report entry is secondary; no horizontal scroll. |
| `status.html?id=WEB00-2026-0001` | PASS | PASS | PASS | Support action is secondary; dashboard remains readable. |
| `cabinet.html` | PASS | PASS | PASS | Mobile contrast fixed; no horizontal scroll. |
| `app.html` | PASS | PASS | PASS | Bug-report entry is a quiet text link; no horizontal scroll. |
| `index.html` | PASS | PASS | PASS | Matryoshka hero local layout not regressed; no horizontal scroll. |

Evidence:

- `_qa/WEB00_DESIGN_P1_CLOSEOUT/screenshots/`
- `_qa/WEB00_DESIGN_P1_CLOSEOUT/pages-status.txt`
- `_qa/WEB00_DESIGN_P1_CLOSEOUT/language-scan.txt`
- `_qa/WEB00_DESIGN_P1_CLOSEOUT/visual-smoke-results.json`

## 8. Checks

- `node --check assets/js/main.js`: PASS
- `node --check assets/js/data.js`: PASS
- `node --check sw.js`: PASS
- Local HTTP smoke: PASS for `/`, `/solutions.html`, `/pricing.html`, `/brief.html`, `/status.html?id=WEB00-2026-0001`, `/cabinet.html`, `/contacts.html`, `/app.html`, `/faq.html`
- Static language gate: CLEAN for public product copy; only technical/service exceptions remain
- Visual smoke: PASS for 25 local browser checks
- Horizontal scroll: PASS, 0 failures across checked pages/viewports
- Console errors: PASS, 0 console error checks
- Failed resources: PASS, 0 request failure checks
- `git diff --check`: PASS with CRLF warnings only

## 9. Remaining risks

- GitHub Pages deployment is still stale/building externally, so live final acceptance is blocked until Pages publishes `2ce3825`.
- Public language gate is locally clean, but live acceptance still depends on GitHub Pages publishing the current commit.
- Real Samsung/owner mobile recheck remains required.
- P2/P3 visual polish is intentionally not addressed in this P1-only wave.
- 45-video QA should not start until Pages and language gate blockers are closed.

## 10. Verdict

P1_PARTIAL_PAGES_EXTERNAL
