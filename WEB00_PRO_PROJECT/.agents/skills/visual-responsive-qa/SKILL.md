---
name: visual-responsive-qa
description: Use for WEB00 Pro visual and responsive QA across desktop, tablet, mobile, and touch desktop-site viewports. Do not use to redesign pages, replace assets, deploy, or claim final mobile acceptance without owner real-device recheck.
---

# Visual Responsive QA

Focus on frontend quality, premium visual polish, mobile/responsive behavior, and release readiness.

## Instructions

1. Identify affected pages and viewports.
2. Check at minimum `360x800`, `390x844`, `768x1024`, `980x844` touch desktop-site guard, and `1440x900` when layout changes are involved.
3. Look for horizontal scroll, overlapping UI, clipped text, unreadable menus, broken cards, modal overflow, footer issues, and console/resource errors.
4. Treat automated browser emulation as evidence, not final real-device acceptance.
5. Keep real Android/iOS owner recheck required for final public acceptance.
6. Do not change HTML/CSS/JS/assets unless the task explicitly authorizes implementation.

## Output

Return:

- pages and viewports checked;
- visual findings by severity;
- screenshots/evidence paths if available;
- real-device status;
- status: `FAIL`, `PARTIAL`, or `PASS`.
