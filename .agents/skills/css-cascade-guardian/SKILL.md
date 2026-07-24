---
name: css-cascade-guardian
description: Use when auditing or changing WEB00 Pro CSS layers, selector ownership, cascade order, responsive patches, or legacy CSS cleanup. Do not use for broad rewrites, asset changes, backend work, or unverified deletion of transitional CSS.
---

# CSS Cascade Guardian

WEB00 Pro has transitional CSS layers. Treat them as live-risk until selector evidence proves otherwise.

## Instructions

1. Audit actual HTML hooks before judging CSS as dead or live.
2. Preserve the known CSS layer order unless the owner approves a targeted migration.
3. Treat `styles.css`, `home-premium.css`, and `web00-tabs-standard.css` as transitional or partial-live risk areas.
4. Do not remove selectors, files, or CSS links without exact usage evidence and visual QA.
5. Make CSS changes narrowly by page, component, or layer.
6. For responsive fixes, verify mobile, tablet, desktop, and touch desktop-site guard viewports.
7. Do not edit JavaScript, backend, or assets as part of CSS work unless explicitly approved.

## Output

Return:

- selectors or files inspected;
- ownership/cascade evidence;
- changed files if any;
- checks run;
- risks left;
- status: `FAIL`, `PARTIAL`, or `PASS`.
