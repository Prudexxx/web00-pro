# WEB00 Design Video QA Readiness Checklist

## Must be true before 45-video archive

- Hero accepted on live public URL.
- Mobile accepted by owner real-device check.
- No P1 visual blockers.
- No old public language.
- Forms readable.
- No horizontal scroll.
- Matryoshka hero live or intentionally excluded.
- Public bug-report UI removed or explicitly accepted for the recorded scope.

## Checklist table

| Check | Result | Evidence |
|---|---|---|
| Local HEAD matches origin/main | PASS | `2ce3825dde504b2fc6c606ee0a8ffdf8f7173572` local and remote. |
| Local pages HTTP 200 | PASS | 16 pages and key assets returned 200 on local server. |
| Live Pages current | FAIL | Live homepage lacks `hero-matryoshka`; live matryoshka assets return 404. |
| Home mobile hero | PASS local | `_qa/WEB00_DESIGN_FINALITY_AUDIT/screenshots/home-390x844.png`. |
| Home desktop hero | PASS local | `_qa/WEB00_DESIGN_FINALITY_AUDIT/screenshots/home-1440x900.png`. |
| Catalog mobile | PASS local | `_qa/WEB00_DESIGN_FINALITY_AUDIT/screenshots/solutions-390x844.png`. |
| Pricing mobile | PASS local | `_qa/WEB00_DESIGN_FINALITY_AUDIT/screenshots/pricing-390x844.png`. |
| Brief mobile | PASS local | `_qa/WEB00_DESIGN_FINALITY_AUDIT/screenshots/brief-390x844.png`. |
| Status found mobile | PASS local | `_qa/WEB00_DESIGN_FINALITY_AUDIT/screenshots/status-found-390x844.png`. |
| Cabinet mobile | FAIL/PARTIAL | `_qa/WEB00_DESIGN_FINALITY_AUDIT/screenshots/cabinet-390x844.png` shows weak logo/header contrast. |
| Install mobile | PARTIAL | `_qa/WEB00_DESIGN_FINALITY_AUDIT/screenshots/install-390x844.png` shows dark/gradient style drift. |
| App mobile | PARTIAL | `_qa/WEB00_DESIGN_FINALITY_AUDIT/screenshots/app-390x844.png` exposes public error-report item. |
| Contacts mobile | PARTIAL | `_qa/WEB00_DESIGN_FINALITY_AUDIT/screenshots/contacts-390x844.png` exposes public error-report action. |
| Public language gate | FAIL | `cases.html:62`, `privacy-policy.html:41`, `assets/js/main.js:663`. |
| Public bug-report guard | FAIL | `app.html:33`, `contacts.html:55/142/146`, `cabinet.html:107`, `assets/js/main.js:1702/1824/2318`. |
| Horizontal scroll | PASS local | Audit matrix: 128 checks, overflow count 0. |
| Tap targets | PASS local | Audit matrix: no targets below 24px/44px in sampled states. |
| Console errors | PASS local | Audit matrix: console error count 0. |
| Real Android owner check | NOT TESTED | Required before final acceptance. |
| iOS/macOS Safari real hardware | NOT TESTED | No Apple hardware check in this audit. |

## Readiness result

Ready for 45-video archive: `NO`.

Reason: video QA would currently record a stale public Pages site and known P1 public UI/language issues.
