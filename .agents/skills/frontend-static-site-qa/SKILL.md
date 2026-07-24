---
name: frontend-static-site-qa
description: Use for WEB00 Pro static-site QA of HTML, CSS links, manifest, service worker, local HTTP availability, and frontend-only release readiness. Do not use for backend/API changes, JavaScript edits, dependency installs, or deploys.
---

# Frontend Static Site QA

WEB00 Pro is a static frontend/localStorage preview. Keep QA local and non-destructive.

## Instructions

1. Confirm which pages or files are in scope.
2. Prefer local static-server checks when browser behavior matters.
3. Verify core pages return HTTP 200 where practical.
4. Check touched HTML, CSS links, `manifest.webmanifest`, and `sw.js` only when relevant.
5. Do not change JavaScript unless explicitly approved.
6. Do not change backend, APIs, auth, payments, analytics, or deployment settings.
7. Do not install dependencies.
8. Report generated QA evidence paths if any are created under an approved `_qa/` scope.

## Output

Return:

- pages checked;
- checks run;
- failures or warnings;
- risks left;
- status: `FAIL`, `PARTIAL`, or `PASS`.
