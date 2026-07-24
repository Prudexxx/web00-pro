---
name: web00-no-public-bug-report-guard
description: Use to audit or gate WEB00 Pro public UI for forbidden bug-report buttons, CTAs, forms, links, and wording. Do not use to remove existing UI unless an implementation task explicitly approves frontend changes.
---

# WEB00 No Public Bug-Report Guard

Final public release must not expose a public bug-report button, CTA, form, or link.

## Instructions

1. Search safe public frontend files for bug-report UI markers and visible wording.
2. Treat `data-open-bug`, `Сообщить об ошибке`, `Bug report`, public error-report forms, and equivalent CTA wording as release blockers unless explicitly accepted for an internal-only surface.
3. Do not inspect secret-like files.
4. Do not edit HTML/CSS/JS unless the current task explicitly authorizes implementation.
5. If cleanup is approved, require focused visual QA after removal.

## Output

Return:

- matches found with paths;
- public/internal classification if known;
- required cleanup or owner decision;
- status: `FAIL`, `PARTIAL`, or `PASS`.
