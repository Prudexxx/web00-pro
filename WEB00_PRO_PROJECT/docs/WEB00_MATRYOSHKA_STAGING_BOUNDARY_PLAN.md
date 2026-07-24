# WEB00 Matryoshka Staging Boundary Plan

## 1. Executive summary

Purpose: define a safe staging boundary for the final Matryoshka hero asset work.

Current repository state:

- Branch: `main`
- Runtime/product modified files: 4 image assets
- New source asset: `assets/img/matryoshka-source-final.webp`
- Multiple untracked docs/evidence/release artifacts exist and must not be mixed into one product commit without owner approval.

Recommended verdict:

`READY_FOR_OWNER_STAGING_DECISION`

Recommended product commit scope:

1. Stage production hero image assets.
2. Optionally stage `assets/img/matryoshka-source-final.webp` only if the owner wants the source/master image tracked.
3. Stage only Matryoshka-specific acceptance/staging docs if the owner wants the audit trail in Git.
4. Do not stage `_review/`, `_release/`, prompt packs, local `SKILL.md`, unrelated closeout docs, or journal docs.

No staging, commit, push, deploy, product-code edit, or file deletion was performed during this task.

## 2. Current Git state snapshot

Latest commits:

```text
1f8a97c fix: polish WEB00 homepage final copy and cards
c47d5af fix: polish WEB00 desktop home bugbase batch 1
f594d86 ci: deploy WEB00 via GitHub Pages Actions
d2e8091 fix: close WEB00 video QA P1 blockers
c2e625f fix: close WEB00 design P1 gates
2ce3825 feat: integrate responsive matryoshka hero
7f23272 feat: add responsive matryoshka hero
2f13097 chore: add codex foundation guardrails
3c50c8c fix: close Wave 10.1 mobile responsive guards
840adbf fix: clean WEB00 public language gate
```

Modified files from `git diff --name-only`:

```text
assets/img/matryoshka-clean-final.png
assets/img/matryoshka-hero-1200.webp
assets/img/matryoshka-hero-1600.webp
assets/img/matryoshka-hero-720.webp
```

Binary diff stat:

```text
assets/img/matryoshka-clean-final.png | Bin 1248491 -> 1058073 bytes
assets/img/matryoshka-hero-1200.webp  | Bin 91266 -> 109678 bytes
assets/img/matryoshka-hero-1600.webp  | Bin 137442 -> 122590 bytes
assets/img/matryoshka-hero-720.webp   | Bin 41452 -> 57354 bytes
4 files changed, 0 insertions(+), 0 deletions(-)
```

## 3. Product asset staging candidates

| File | Git state | Runtime referenced | Role | Decision |
|---|---|---:|---|---|
| `assets/img/matryoshka-clean-final.png` | modified | YES, `index.html` fallback image | PNG fallback for hero picture | `STAGE_AFTER_OWNER_APPROVAL` |
| `assets/img/matryoshka-hero-720.webp` | modified | YES, `index.html` srcset | mobile/small responsive WebP | `STAGE_AFTER_OWNER_APPROVAL` |
| `assets/img/matryoshka-hero-1200.webp` | modified | YES, `index.html` srcset | desktop responsive WebP | `STAGE_AFTER_OWNER_APPROVAL` |
| `assets/img/matryoshka-hero-1600.webp` | modified | YES, `index.html` srcset | large responsive WebP | `STAGE_AFTER_OWNER_APPROVAL` |
| `assets/img/matryoshka-source-final.webp` | untracked | NO | source/master asset used to derive production images | `OWNER_DECISION` |

Runtime references found in `index.html`:

```text
assets/img/matryoshka-hero-720.webp
assets/img/matryoshka-hero-1200.webp
assets/img/matryoshka-hero-1600.webp
assets/img/matryoshka-clean-final.png
```

Source asset decision:

- If Git should preserve the final master/source file, stage `assets/img/matryoshka-source-final.webp`.
- If the repository should contain only runtime assets, keep `assets/img/matryoshka-source-final.webp` local/untracked.
- Do not stage old source variants such as `assets/img/matryoshka.png` or `assets/img/МАТРЕШКА.png`.

## 4. Matryoshka docs/reports

| File | Git state | Role | Decision |
|---|---|---|---|
| `docs/WEB00_MATRYOSHKA_VISUAL_ACCEPTANCE_SMOKE.md` | untracked | latest visual acceptance smoke report | `STAGE_OPTIONAL_WITH_MATRYOSHKA_DOCS` |
| `docs/WEB00_MATRYOSHKA_STAGING_BOUNDARY_PLAN.md` | new in this task | staging boundary plan | `STAGE_OPTIONAL_WITH_MATRYOSHKA_DOCS` |
| `docs/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY_REPORT.md` | untracked | asset generation/apply report | `STAGE_OPTIONAL_IF_TRACKING_PROVENANCE` |
| `docs/WEB00_MATRYOSHKA_DIRTY_WORKTREE_OWNERSHIP_GATE.md` | untracked | dirty-tree ownership audit | `HOLD_OR_STAGE_ONLY_WITH_AUDIT_DOCS` |
| `docs/WEB00_MATRYOSHKA_ASSET_RECONCILIATION_REPORT.md` | untracked | earlier asset reconciliation | `HOLD_AS_EVIDENCE` |
| `docs/WEB00_MATRYOSHKA_REGEN_V2_REPORT.md` | untracked | earlier regeneration report | `HOLD_AS_EVIDENCE` |
| `docs/WEB00_MATRESHKA_IMPLEMENTATION_PROMPT_DRAFT.md` | untracked | older spelling/draft | `DO_NOT_STAGE_IN_PRODUCT_COMMIT` |
| `docs/WEB00_MATRESHKA_IMPLEMENTATION_V1_REPORT.md` | untracked | older implementation report | `DO_NOT_STAGE_IN_PRODUCT_COMMIT` |
| `docs/WEB00_MATRESHKA_MOCKUP_AUDIT.md` | untracked | older mockup audit | `DO_NOT_STAGE_IN_PRODUCT_COMMIT` |

## 5. Review/release evidence

| Path | Files | Approx bytes | Decision |
|---|---:|---:|---|
| `_review/MATRYOSHKA_VISUAL_ACCEPTANCE/` | 5 | 1,062,005 | `DO_NOT_STAGE_IN_PRODUCT_COMMIT` |
| `_release/` | 151 | 42,997,144 | `DO_NOT_STAGE_IN_PRODUCT_COMMIT` |
| `WEB00_VISUAL_ACCEPTANCE_PROMPT_PACK/` | 3 | 10,074 | `LOCAL_ONLY_DO_NOT_STAGE` |

Notes:

- `_review/` contains evidence screenshots/live HTML from QA. Keep locally unless the owner explicitly wants evidence stored in Git.
- `_release/` is a release artifact package area. It is not part of this Matryoshka product asset commit.
- Prompt packs are operational inputs, not product source.

## 6. Unrelated docs/local artifacts

These files are untracked and should not be staged with the Matryoshka asset commit:

```text
docs/WEB00_BACKEND_ADMIN_PHASE_0_START_PLAN.md
docs/WEB00_DESIGN_FINALITY_AUDIT_REPORT.md
docs/WEB00_DESIGN_FINALITY_DECISION.md
docs/WEB00_DESIGN_FINALITY_EXECUTION_PROMPT_DRAFT.md
docs/WEB00_DESIGN_POLISH_OPPORTUNITY_MAP.md
docs/WEB00_DESIGN_VIDEO_QA_READINESS_CHECKLIST.md
docs/WEB00_FRONTEND_LOCAL_FINAL_CERTIFICATE.md
docs/WEB00_FRONTEND_LOCAL_FINAL_CLOSEOUT.md
docs/WEB00_FRONTEND_PUBLIC_RC1_CERTIFICATE.md
docs/WEB00_FRONTEND_TO_BACKEND_HANDOFF.md
docs/WEB00_LIVE_RC1_CLOSEOUT_REPORT.md
docs/WEB00_NEXT_PHASE_BACKEND_ADMIN_ROADMAP.md
docs/WEB00_OWNER_ACCEPTANCE_PACK.md
docs/WEB00_RC1_RELEASE_NOTES.md
docs/WEB00_SUPERCODEX_MEMORY_JOURNAL.md
```

Decision:

`DO_NOT_STAGE_IN_MATRYOSHKA_COMMIT`

Reason:

These are closeout, backend planning, release, design audit, or large local journal documents. They need separate owner approval and separate commit boundaries.

## 7. Suspicious / do-not-stage items

| Path | Reason | Decision |
|---|---|---|
| `SKILL.md` | untracked root-level file, not part of approved Matryoshka asset scope | `DO_NOT_STAGE_UNLESS_OWNER_APPROVES_PURPOSE` |
| `assets/img/matryoshka.png` | old/manual local source candidate, not current production reference | `DO_NOT_STAGE` |
| `assets/img/МАТРЕШКА.png` | old/manual local source candidate, not current production reference | `DO_NOT_STAGE` |
| `WEB00_VISUAL_ACCEPTANCE_PROMPT_PACK/` | local prompt pack | `DO_NOT_STAGE` |
| `_qa/` and `_review/` evidence | QA/evidence artifacts | `DO_NOT_STAGE` |
| `_release/` | release artifacts | `DO_NOT_STAGE` |

## 8. Recommended staging options

### Option A: Runtime-only product asset commit

Use when the owner wants the live site to receive the updated Matryoshka assets, but not the source/master file or audit docs.

Future command only after owner approval:

```powershell
git -c safe.directory="D:/Backend/Сайт" add -- `
  assets/img/matryoshka-clean-final.png `
  assets/img/matryoshka-hero-720.webp `
  assets/img/matryoshka-hero-1200.webp `
  assets/img/matryoshka-hero-1600.webp
```

### Option B: Product assets plus source provenance

Use when the owner wants the final source image tracked too.

Future command only after owner approval:

```powershell
git -c safe.directory="D:/Backend/Сайт" add -- `
  assets/img/matryoshka-clean-final.png `
  assets/img/matryoshka-hero-720.webp `
  assets/img/matryoshka-hero-1200.webp `
  assets/img/matryoshka-hero-1600.webp `
  assets/img/matryoshka-source-final.webp
```

### Option C: Product assets plus minimal docs

Use when the owner wants a clean audit trail attached to the same commit.

Future command only after owner approval:

```powershell
git -c safe.directory="D:/Backend/Сайт" add -- `
  assets/img/matryoshka-clean-final.png `
  assets/img/matryoshka-hero-720.webp `
  assets/img/matryoshka-hero-1200.webp `
  assets/img/matryoshka-hero-1600.webp `
  assets/img/matryoshka-source-final.webp `
  docs/WEB00_MATRYOSHKA_VISUAL_ACCEPTANCE_SMOKE.md `
  docs/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY_REPORT.md `
  docs/WEB00_MATRYOSHKA_STAGING_BOUNDARY_PLAN.md
```

Recommended option:

`Option C`, if the owner wants traceability for why these binary assets changed.

If the owner wants the smallest possible product commit:

`Option A`.

## 9. Staged-list verification commands for future commit

Run only after an owner-approved `git add`:

```powershell
git -c safe.directory="D:/Backend/Сайт" diff --cached --name-only
git -c safe.directory="D:/Backend/Сайт" diff --cached --stat
```

Expected staged files for Option C:

```text
assets/img/matryoshka-clean-final.png
assets/img/matryoshka-hero-720.webp
assets/img/matryoshka-hero-1200.webp
assets/img/matryoshka-hero-1600.webp
assets/img/matryoshka-source-final.webp
docs/WEB00_MATRYOSHKA_VISUAL_ACCEPTANCE_SMOKE.md
docs/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY_REPORT.md
docs/WEB00_MATRYOSHKA_STAGING_BOUNDARY_PLAN.md
```

If any staged file appears outside the selected option, stop before commit.

## 10. Do-not-stage guard

Before any Matryoshka commit, confirm none of these are staged:

```text
SKILL.md
WEB00_VISUAL_ACCEPTANCE_PROMPT_PACK/
_qa/
_review/
_release/
assets/img/matryoshka.png
assets/img/МАТРЕШКА.png
docs/WEB00_SUPERCODEX_MEMORY_JOURNAL.md
docs/WEB00_BACKEND_ADMIN_PHASE_0_START_PLAN.md
docs/WEB00_FRONTEND_LOCAL_FINAL_CLOSEOUT.md
docs/WEB00_FRONTEND_LOCAL_FINAL_CERTIFICATE.md
docs/WEB00_FRONTEND_TO_BACKEND_HANDOFF.md
```

## 11. Pre-commit checks for future owner-approved commit

Run before a future commit:

```powershell
node --check assets/js/main.js
node --check assets/js/data.js
git -c safe.directory="D:/Backend/Сайт" diff --check
git -c safe.directory="D:/Backend/Сайт" diff --cached --name-only
```

Optional static asset reference check:

```powershell
rg -n "matryoshka-clean-final|matryoshka-hero-720|matryoshka-hero-1200|matryoshka-hero-1600|matryoshka-source-final" index.html docs assets/css assets/js
```

## 12. Final recommendation

Recommended next owner action:

`OWNER_STAGING_APPROVAL_REQUIRED`

Recommended commit message if owner approves Option C:

```text
fix: update final matryoshka hero assets
```

Current task did not execute this commit. It only prepared the boundary plan.
