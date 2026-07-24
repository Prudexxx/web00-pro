# WEB00 Pro Agent Rules

WEB00 Pro is a premium business-tech static website. Current priority is frontend quality, visual QA, mobile/responsive polish, and controlled release readiness.

## Operating Rules

- Audit and plan before implementation. For QA, security, and review tasks, use read-only evidence-first mode.
- Do not commit, push, deploy, delete, rename, or install dependencies without explicit owner approval.
- Do not use paid APIs by default.
- Do not read `.env`, `.env.*`, secrets, credentials, tokens, private keys, or similarly named files.
- Keep work frontend-first: HTML/CSS quality, visual polish, responsive behavior, PWA/static-site safety, and release readiness.
- Do not change backend or API behavior unless explicitly approved.
- Do not change JavaScript unless explicitly approved.
- Do not replace images or assets unless explicitly approved.
- Do not add or preserve a public bug-report button/CTA for final public release.
- Treat real mobile owner recheck as required for final acceptance.

## Reporting Rule

After any future change, report:

- changed files;
- checks run;
- risks left;
- final status: `FAIL`, `PARTIAL`, or `PASS`.
