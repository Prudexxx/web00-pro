---
name: owner-report
description: Use at the end of WEB00 Pro audit, implementation, QA, or release-readiness tasks to produce the required owner-facing summary. Do not use to hide incomplete checks, omit risks, or claim deploy/commit actions that did not happen.
---

# Owner Report

Report plainly and with enough evidence for the owner to decide the next step.

## Instructions

1. Separate created files from modified files.
2. List checks actually run, not intended checks.
3. State risks left, including missing real mobile owner recheck when relevant.
4. State whether commit, push, or deploy occurred.
5. Use `FAIL`, `PARTIAL`, or `PASS` as the final status.
6. If no checks were run, say so directly.
7. Do not overstate acceptance when owner approval or real-device verification remains.

## Output

Return:

- files created;
- files modified;
- checks run;
- risks left;
- next recommended task;
- commit/push/deploy executed: `NO` or exact completed action;
- status: `FAIL`, `PARTIAL`, or `PASS`.
