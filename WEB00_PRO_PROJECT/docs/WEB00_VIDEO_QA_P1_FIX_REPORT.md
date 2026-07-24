# WEB00 Video QA P1 Fix Report

## 1. Executive summary

- P1 fix wave completed: YES.
- Base commit under local test: c2e625fb268a4e4d83aa90186fd1d6dd9d287c00.
- Scope stayed local: no commit, no push, no deploy, no backend.
- Remaining local P1 count: 0.
- Ready for targeted video recheck: YES.
- Ready for full 45-video rerun: YES, after owner approval.

## 2. Fixed findings

| Finding | Source issue | Result | Files |
|---|---|---|---|
| F-002 / F-005 / F-008 | `solutions.html` catalog/demo viewer reported JS runtime errors | FIXED | `assets/js/main.js`, `solutions.html` |
| Home tablet overflow | `index.html` at 1024x768 had body horizontal overflow | FIXED | `assets/css/home.css` |
| F-001 | Mobile nav was reported visible on first load | FALSE_POSITIVE_QA_RULE | no product code needed |
| F-003 / F-006 / F-009 | External demo `.mp4`/external iframe resource instability | EXTERNAL_P2_CONTAINED | `assets/js/main.js` |
| F-004 / F-007 / F-010 | `app.html` does not use standard public header | ACCEPTED_COMPACT_APP_SHELL | no product code needed |

## 3. Implementation notes

### Demo viewer

- Added defensive guards around demo modal, bug modal, and file-drop helpers to prevent null-node runtime errors.
- Demo modal close now clears the demo content and removes iframe source before closing.
- Static modal overlays no longer compete with visible close buttons for `[data-close-modal]`.
- External demos are no longer executed in an embedded iframe during WEB00 QA. The modal shows a controlled preview/fallback and keeps the full demo available through "Open separately".

This avoids leaking third-party runtime errors into the WEB00 page console while preserving the user route to the real external demo.

### Home tablet overflow

- Added tablet guards for the home mock page shell and wrappers.
- 1024x768 recheck: `scrollWidth=1024`, `bodyScrollWidth=1024`, `horizontalScroll=false`.

### Mobile nav

- 390x844 recheck:
  - initial nav visible: `false`;
  - burger visible: `true`;
  - after click nav visible/open: `true`;
  - after second click nav visible/open: `false`;
  - horizontal scroll: `false`.

The original P1 is classified as a QA selector/state false positive.

### App shell

- `app.html` is a compact quick-access app shell, not a full public marketing page.
- 390x844 recheck: no horizontal scroll, no console errors, compact shell accepted.

## 4. Targeted browser check

Runner: Codex in-app browser.

Evidence:

- `_qa/WEB00_VIDEO_QA_P1_FIX/raw/browser-check-results.json`
- `_qa/WEB00_VIDEO_QA_P1_FIX/screenshots/index-1024x768-after.png`
- `_qa/WEB00_VIDEO_QA_P1_FIX/screenshots/index-768x1024-after.png`
- `_qa/WEB00_VIDEO_QA_P1_FIX/screenshots/index-1440x900-after.png`
- `_qa/WEB00_VIDEO_QA_P1_FIX/screenshots/index-390x844-nav-closed.png`
- `_qa/WEB00_VIDEO_QA_P1_FIX/screenshots/index-390x844-nav-open.png`
- `_qa/WEB00_VIDEO_QA_P1_FIX/screenshots/solutions-390x844-demo-open.png`
- `_qa/WEB00_VIDEO_QA_P1_FIX/screenshots/solutions-390x844-demo-closed.png`
- `_qa/WEB00_VIDEO_QA_P1_FIX/screenshots/app-390x844-shell.png`

| Check | Result |
|---|---|
| Local HTTP smoke, 9 pages | PASS |
| Home 1024x768 horizontal scroll | PASS |
| Home 768x1024 horizontal scroll | PASS |
| Home 1440x900 horizontal scroll | PASS |
| Mobile nav open/close | PASS |
| Solutions demo open/close/reopen | PASS |
| Solutions demo console errors | PASS |
| App shell compact check | PASS |

## 5. Static checks

| Check | Result |
|---|---|
| `node --check assets/js/main.js` | PASS |
| `node --check assets/js/data.js` | PASS |
| `node --check sw.js` | PASS |
| `git diff --check` | PASS, CRLF warnings only |
| Static language gate | CLEAN, technical exception only |

Static language gate remaining match:

| File | Term | Classification |
|---|---|---|
| `assets/css/tokens.css` | `Accessibility` in comment | TECHNICAL_EXCEPTION |

## 6. Risks left

- External demos now open separately for full interaction. This is intentional to keep third-party scripts from polluting WEB00 QA results.
- The fallback card is functional and stable, but it is still a compact containment treatment rather than a full embedded external website.
- Full 45-video QA was not rerun in this wave by instruction.
- GitHub Pages/live deployment state was not touched.

## 7. Verdict

LOCAL_P1_FIX_COMPLETE.

Ready for targeted video recheck: YES.

Ready for full 45-video rerun: YES, after owner approval.
