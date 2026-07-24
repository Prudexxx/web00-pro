# WEB00 Matryoshka Dirty Worktree Ownership Gate

## 1. Executive summary

- Current HEAD: `1f8a97c fix: polish WEB00 homepage final copy and cards`
- Current branch: `main`
- Git dirty: YES
- Matryoshka assets accepted candidate: YES
- Matryoshka assets final accepted: PENDING owner visual review
- Ready for staging review: YES, with ownership groups below
- Ready for Batch 2/3/4 acceptance: NO

The four modified Matryoshka production assets are referenced by the live home hero markup in `index.html`, are readable PNG/WebP files, and match the latest `WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY_REPORT.md` size/dimension evidence. They should be treated as `ACCEPT CANDIDATE`, not suspicious.

This gate does not approve broad staging. The worktree contains prompt packs, a full `_release` archive, a root `SKILL.md`, a large operational memory journal, and many untracked reports. These need grouped staging or owner decisions later.

## 2. Git state

### Branch/status

```text
## main...origin/main
 M assets/img/matryoshka-clean-final.png
 M assets/img/matryoshka-hero-1200.webp
 M assets/img/matryoshka-hero-1600.webp
 M assets/img/matryoshka-hero-720.webp
?? SKILL.md
?? WEB00_VISUAL_ACCEPTANCE_PROMPT_PACK/
?? _release/
?? assets/img/matryoshka-source-final.webp
?? docs/WEB00_BACKEND_ADMIN_PHASE_0_START_PLAN.md
?? docs/WEB00_DESIGN_FINALITY_AUDIT_REPORT.md
?? docs/WEB00_DESIGN_FINALITY_DECISION.md
?? docs/WEB00_DESIGN_FINALITY_EXECUTION_PROMPT_DRAFT.md
?? docs/WEB00_DESIGN_POLISH_OPPORTUNITY_MAP.md
?? docs/WEB00_DESIGN_VIDEO_QA_READINESS_CHECKLIST.md
?? docs/WEB00_FRONTEND_LOCAL_FINAL_CERTIFICATE.md
?? docs/WEB00_FRONTEND_LOCAL_FINAL_CLOSEOUT.md
?? docs/WEB00_FRONTEND_PUBLIC_RC1_CERTIFICATE.md
?? docs/WEB00_FRONTEND_TO_BACKEND_HANDOFF.md
?? docs/WEB00_LIVE_RC1_CLOSEOUT_REPORT.md
?? docs/WEB00_MATRESHKA_IMPLEMENTATION_PROMPT_DRAFT.md
?? docs/WEB00_MATRESHKA_IMPLEMENTATION_V1_REPORT.md
?? docs/WEB00_MATRESHKA_MOCKUP_AUDIT.md
?? docs/WEB00_MATRYOSHKA_ASSET_RECONCILIATION_REPORT.md
?? docs/WEB00_MATRYOSHKA_REGEN_V2_REPORT.md
?? docs/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY_REPORT.md
?? docs/WEB00_NEXT_PHASE_BACKEND_ADMIN_ROADMAP.md
?? docs/WEB00_OWNER_ACCEPTANCE_PACK.md
?? docs/WEB00_RC1_RELEASE_NOTES.md
?? docs/WEB00_SUPERCODEX_MEMORY_JOURNAL.md
```

### Last commits

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

### Diff stat

```text
 assets/img/matryoshka-clean-final.png | Bin 1248491 -> 1058073 bytes
 assets/img/matryoshka-hero-1200.webp  | Bin 91266 -> 109678 bytes
 assets/img/matryoshka-hero-1600.webp  | Bin 137442 -> 122590 bytes
 assets/img/matryoshka-hero-720.webp   | Bin 41452 -> 57354 bytes
 4 files changed, 0 insertions(+), 0 deletions(-)
```

### Diff name-only

```text
assets/img/matryoshka-clean-final.png
assets/img/matryoshka-hero-1200.webp
assets/img/matryoshka-hero-1600.webp
assets/img/matryoshka-hero-720.webp
```

## 3. Modified production assets

| Path | Type | Referenced in product? | Size/info | Decision |
|---|---|---:|---|---|
| `assets/img/matryoshka-clean-final.png` | PNG | YES, fallback image in `index.html:70` | 1448x1086, 1058073 bytes / 1033.3 KiB, readable PNG | ACCEPT CANDIDATE |
| `assets/img/matryoshka-hero-720.webp` | WebP | YES, `srcset` in `index.html:63` | 720x540, 57354 bytes / 56.0 KiB, readable WebP | ACCEPT CANDIDATE |
| `assets/img/matryoshka-hero-1200.webp` | WebP | YES, `srcset` in `index.html:64` | 1200x900, 109678 bytes / 107.1 KiB, readable WebP | ACCEPT CANDIDATE |
| `assets/img/matryoshka-hero-1600.webp` | WebP | YES, `srcset` in `index.html:65` | 1448x1086, 122590 bytes / 119.7 KiB, readable WebP | ACCEPT CANDIDATE |

Supporting evidence:

- `docs/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY_REPORT.md` says source accepted, generated assets pass size gates, local smoke passes, and owner visual recheck is ready.
- `assets/img/matryoshka-source-final.webp` is untracked but reads as WebP 1448x1086, 289114 bytes / 282.3 KiB.
- The `1600` WebP is intentionally not 1600px wide in the latest apply report because the source width is 1448px and no upscaling was done.

## 4. Matryoshka references

Production usage:

```text
index.html:59: <picture class="hero-matryoshka">
index.html:63: assets/img/matryoshka-hero-720.webp 720w,
index.html:64: assets/img/matryoshka-hero-1200.webp 1200w,
index.html:65: assets/img/matryoshka-hero-1600.webp 1600w
index.html:70: src="assets/img/matryoshka-clean-final.png"
```

Production styling:

```text
assets/css/home.css:2772: body[data-page="home"] .hero-matryoshka
assets/css/home.css:2782: body[data-page="home"] .hero-matryoshka img
assets/css/home.css:2803,2829,2881,2889,2952,2968: responsive hero-matryoshka rules
```

Release archive references:

```text
_release/WEB00_FRONTEND_STATIC_FINAL_D2E8091/index.html:59-70
_release/WEB00_FRONTEND_STATIC_FINAL_D2E8091/RELEASE_MANIFEST.md:42-45
```

Documentation references:

- `docs/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY_REPORT.md`
- `docs/WEB00_MATRYOSHKA_HERO_INTEGRATION_V1_REPORT.md`
- `docs/WEB00_MATRYOSHKA_REGEN_V2_REPORT.md`
- `docs/WEB00_MATRYOSHKA_ASSET_RECONCILIATION_REPORT.md`
- `docs/WEB00_SUPERCODEX_MEMORY_JOURNAL.md`

Conclusion: these assets are part of the home hero/product visual, not orphan files.

## 5. Untracked ownership table

| Path | Category | Recommended ownership | Stage later? | Reason |
|---|---|---|---:|---|
| `assets/img/matryoshka-source-final.webp` | product-source | Source/master image for accepted candidate derivatives | YES, with Group A if owner accepts Matryoshka source provenance | It explains and preserves the modified production derivatives |
| `docs/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY_REPORT.md` | product-docs | Matryoshka final apply evidence | YES, with Group B | Directly explains the current modified assets |
| `docs/WEB00_MATRYOSHKA_REGEN_V2_REPORT.md` | product-docs | Matryoshka regeneration evidence | YES, with Group B | Predecessor evidence for accepted candidate |
| `docs/WEB00_MATRYOSHKA_ASSET_RECONCILIATION_REPORT.md` | product-docs | Earlier asset gate evidence | YES, with Group B | Explains why earlier asset was blocked and regenerated |
| `docs/WEB00_MATRESHKA_IMPLEMENTATION_PROMPT_DRAFT.md` | prompt-pack | Historical implementation prompt | NO by default | Prompt material, not product source |
| `docs/WEB00_MATRESHKA_IMPLEMENTATION_V1_REPORT.md` | product-docs | Historical implementation report | HOLD | Useful history but superseded by later Matryoshka reports |
| `docs/WEB00_MATRESHKA_MOCKUP_AUDIT.md` | product-docs | Historical audit | HOLD | Useful history but superseded by later Matryoshka reports |
| `docs/WEB00_FRONTEND_LOCAL_FINAL_CLOSEOUT.md` | release-evidence | Local frontend final evidence | YES, only with release docs group | Closeout evidence for accepted local frontend boundary |
| `docs/WEB00_FRONTEND_LOCAL_FINAL_CERTIFICATE.md` | release-evidence | Local final certificate | YES, only with release docs group | Pairs with local closeout |
| `docs/WEB00_LIVE_RC1_CLOSEOUT_REPORT.md` | release-evidence | Live RC1 evidence | HOLD | May be historical if live/local drift exists |
| `docs/WEB00_FRONTEND_PUBLIC_RC1_CERTIFICATE.md` | release-evidence | Public RC certificate | HOLD | Needs release boundary decision |
| `docs/WEB00_RC1_RELEASE_NOTES.md` | release-evidence | RC notes | HOLD | Needs release boundary decision |
| `docs/WEB00_OWNER_ACCEPTANCE_PACK.md` | release-evidence | Owner acceptance pack | HOLD | Needs owner/release boundary decision |
| `docs/WEB00_DESIGN_FINALITY_AUDIT_REPORT.md` | product-docs | Design finality audit | YES, with design docs group if accepted | Useful audit evidence |
| `docs/WEB00_DESIGN_FINALITY_DECISION.md` | product-docs | Design decision report | YES, with design docs group if accepted | Decision evidence |
| `docs/WEB00_DESIGN_FINALITY_EXECUTION_PROMPT_DRAFT.md` | prompt-pack | Prompt draft | NO by default | Prompt material, not product source |
| `docs/WEB00_DESIGN_POLISH_OPPORTUNITY_MAP.md` | product-docs | Design opportunity map | HOLD | Useful but not required for product source |
| `docs/WEB00_DESIGN_VIDEO_QA_READINESS_CHECKLIST.md` | product-docs | QA readiness checklist | HOLD | Useful but belongs in QA docs group |
| `docs/WEB00_BACKEND_ADMIN_PHASE_0_START_PLAN.md` | product-docs | Backend/admin future plan | NO for this frontend gate | Backend planning is out of current scope |
| `docs/WEB00_FRONTEND_TO_BACKEND_HANDOFF.md` | product-docs | Backend handoff | NO for this frontend gate | Backend planning is out of current scope |
| `docs/WEB00_NEXT_PHASE_BACKEND_ADMIN_ROADMAP.md` | product-docs | Backend roadmap | NO for this frontend gate | Backend planning is out of current scope |
| `docs/WEB00_SUPERCODEX_MEMORY_JOURNAL.md` | local-only | Operational memory export | NO by default | Large local continuity file, not product/release source |
| `WEB00_VISUAL_ACCEPTANCE_PROMPT_PACK/` | prompt-pack | Prompt pack for visual acceptance | NO by default | Contains loader/checklist/prompt files; useful locally, risky in product commit |
| `_release/WEB00_FRONTEND_STATIC_FINAL_D2E8091/` | release-evidence | Expanded release archive | HOLD | 151 files / about 43.0 MB; stage only with explicit release evidence decision |
| `_release/WEB00_FRONTEND_STATIC_FINAL_D2E8091.zip` | release-evidence | Release zip archive | HOLD | About 20.0 MB; likely too heavy for routine source commit |
| `SKILL.md` | suspicious | Local skill definition, not WEB00 product source | NO | Root skill file `frontend-ui-engineering`; likely accidental/service artifact |
| `docs/WEB00_MATRYOSHKA_DIRTY_WORKTREE_OWNERSHIP_GATE.md` | product-docs | This ownership gate report | YES, with Group B if owner wants audit evidence tracked | Created by this task |

## 6. Suspicious files

### `SKILL.md`

Observed header:

```text
name: frontend-ui-engineering
description: Builds production-quality UIs. Use when building or modifying user-facing interfaces.
# Frontend UI Engineering
```

Classification: `suspicious` / `local-only`.

Decision: `LOCAL ONLY / DO NOT STAGE`.

Reason: this is a generic Codex skill-definition file in the project root. It is not referenced as WEB00 production source, release evidence, or owner-facing project documentation. Do not delete it in this gate; ask owner later whether it belongs under `.agents/skills/` or outside the repo.

## 7. Safe staging groups later

Do not run staging now. These are future groups only.

### Group A - accepted product source/assets

- `assets/img/matryoshka-clean-final.png`
- `assets/img/matryoshka-hero-720.webp`
- `assets/img/matryoshka-hero-1200.webp`
- `assets/img/matryoshka-hero-1600.webp`
- `assets/img/matryoshka-source-final.webp`, if owner wants source provenance tracked

### Group B - docs/reports

- `docs/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY_REPORT.md`
- `docs/WEB00_MATRYOSHKA_REGEN_V2_REPORT.md`
- `docs/WEB00_MATRYOSHKA_ASSET_RECONCILIATION_REPORT.md`
- `docs/WEB00_MATRYOSHKA_DIRTY_WORKTREE_OWNERSHIP_GATE.md`
- Selected design/release docs only after source-boundary review

### Group C - release evidence

- `_release/WEB00_FRONTEND_STATIC_FINAL_D2E8091/`
- `_release/WEB00_FRONTEND_STATIC_FINAL_D2E8091.zip`
- `docs/WEB00_FRONTEND_LOCAL_FINAL_CLOSEOUT.md`
- `docs/WEB00_FRONTEND_LOCAL_FINAL_CERTIFICATE.md`
- `docs/WEB00_LIVE_RC1_CLOSEOUT_REPORT.md`
- `docs/WEB00_FRONTEND_PUBLIC_RC1_CERTIFICATE.md`
- `docs/WEB00_RC1_RELEASE_NOTES.md`
- `docs/WEB00_OWNER_ACCEPTANCE_PACK.md`

Stage only if owner wants release evidence inside the repo. Otherwise keep local/archive-only.

### Group D - prompt packs/local-only, do not stage

- `WEB00_VISUAL_ACCEPTANCE_PROMPT_PACK/`
- `docs/WEB00_MATRESHKA_IMPLEMENTATION_PROMPT_DRAFT.md`
- `docs/WEB00_DESIGN_FINALITY_EXECUTION_PROMPT_DRAFT.md`
- `docs/WEB00_SUPERCODEX_MEMORY_JOURNAL.md`

### Group E - suspicious/needs owner decision

- `SKILL.md`

## 8. Risks

- Prompt packs can pollute the public repo with internal operating instructions and should not be staged by default.
- `_release` contains a full expanded release archive and zip; committing it may bloat the repo and duplicate production source.
- Accepting Matryoshka assets without owner visual comparison can lock in a hero image that is technically valid but visually rejected later.
- Not tracking `assets/img/matryoshka-source-final.webp` may lose source provenance for the modified production derivatives.
- There is hidden drift risk between live Pages, root local files, and `_release`; this gate did not perform live visual/browser QA.
- `SKILL.md` in root may be an accidental service artifact; staging it would mix agent tooling with WEB00 product source.
- Backend/admin planning docs are present but out of scope for this frontend ownership gate.

## 9. Recommendation

Recommended next step: `Matryoshka visual acceptance smoke`.

Run a focused, lightweight visual smoke before Batch 2/3/4 acceptance:

1. Compare current local `index.html` hero at mobile and desktop against the accepted Matryoshka evidence.
2. Confirm no horizontal scroll, console errors, or broken hero images.
3. Confirm owner visual acceptance for the Matryoshka hero.
4. Only then proceed to staging boundary review and Batch 2/3/4 acceptance.

Do not start Backend/Admin planning from this dirty tree until the frontend source/release boundary is frozen.

## 10. Checkpoint results

| Check | Result |
|---|---|
| `git status -sb` | PASS, dirty tree confirmed |
| `git diff --stat` | PASS, only four modified binary image assets |
| `git diff --name-only` | PASS, only four modified Matryoshka production assets |
| `git log --oneline -10` | PASS, HEAD `1f8a97c` |
| Matryoshka product references | PASS, referenced by `index.html` hero and `assets/css/home.css` |
| Matryoshka docs references | PASS, latest apply report found |
| `SKILL.md` check | PASS, classified suspicious/local-only |
| `node --check assets/js/main.js` | PASS |
| `node --check assets/js/data.js` | PASS |
| Image header/readability check | PASS for PNG/WebP files |

## 11. Verdict

- Matryoshka assets: `ACCEPT CANDIDATE`
- `SKILL.md`: `SUSPICIOUS / LOCAL ONLY / DO NOT STAGE`
- Git still dirty: YES
- Ready for staging review: YES
- Ready for Batch 2/3/4 acceptance: NO
- Recommended next step: `Matryoshka visual acceptance smoke`

Commit/push/deploy/delete executed: NO.
