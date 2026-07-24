# WEB00 Matryoshka Visual Acceptance Smoke

## 1. Executive summary

- Matryoshka visual result: PASS
- Final decision recommendation: ACCEPT
- Ready for staging review: YES
- Ready for Batch 2/3/4 acceptance: YES, after owner confirms the local screenshots

The current local modified matryoshka production assets render cleanly in the homepage hero across desktop, tablet-width, and mobile-width screenshots. The visual direction matches the WEB00 light premium system: cream background, burgundy accents, serif headline, and a device showcase that supports the hero instead of fighting it.

Important boundary: live GitHub Pages is reachable and contains the hero markup, but live WebP asset sizes still match the previously committed versions. The final modified local assets are not live yet.

## 2. Git state

Status before this report/evidence:

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
?? docs/WEB00_MATRYOSHKA_DIRTY_WORKTREE_OWNERSHIP_GATE.md
?? docs/WEB00_MATRYOSHKA_REGEN_V2_REPORT.md
?? docs/WEB00_MATRYOSHKA_SOURCE_FINAL_APPLY_REPORT.md
?? docs/WEB00_NEXT_PHASE_BACKEND_ADMIN_ROADMAP.md
?? docs/WEB00_OWNER_ACCEPTANCE_PACK.md
?? docs/WEB00_RC1_RELEASE_NOTES.md
?? docs/WEB00_SUPERCODEX_MEMORY_JOURNAL.md
```

Diff stat before this report/evidence:

```text
assets/img/matryoshka-clean-final.png | Bin 1248491 -> 1058073 bytes
assets/img/matryoshka-hero-1200.webp  | Bin 91266 -> 109678 bytes
assets/img/matryoshka-hero-1600.webp  | Bin 137442 -> 122590 bytes
assets/img/matryoshka-hero-720.webp   | Bin 41452 -> 57354 bytes
4 files changed, 0 insertions(+), 0 deletions(-)
```

Diff name-only before this report/evidence:

```text
assets/img/matryoshka-clean-final.png
assets/img/matryoshka-hero-1200.webp
assets/img/matryoshka-hero-1600.webp
assets/img/matryoshka-hero-720.webp
```

## 3. Matryoshka asset references

| Asset | Referenced? | Where | Role |
|---|---|---|---|
| `assets/img/matryoshka-hero-720.webp` | YES | `index.html:63` | Mobile/small responsive WebP source |
| `assets/img/matryoshka-hero-1200.webp` | YES | `index.html:64` | Desktop responsive WebP source |
| `assets/img/matryoshka-hero-1600.webp` | YES | `index.html:65` | Large responsive WebP source |
| `assets/img/matryoshka-clean-final.png` | YES | `index.html:70` | PNG fallback |

Current local asset metadata:

| Asset | Dimensions | Size |
|---|---:|---:|
| `assets/img/matryoshka-clean-final.png` | 1448x1086 | 1,058,073 bytes |
| `assets/img/matryoshka-hero-720.webp` | 720x540 | 57,354 bytes |
| `assets/img/matryoshka-hero-1200.webp` | 1200x900 | 109,678 bytes |
| `assets/img/matryoshka-hero-1600.webp` | 1448x1086 | 122,590 bytes |
| `assets/img/matryoshka-source-final.webp` | 1448x1086 | 289,114 bytes |

## 4. Visual checks

| Viewport | Result | Notes |
|---|---|---|
| 1440x900 | PASS | Hero composition is balanced. Matryoshka is clear, right-aligned, and supports the copy. Text and CTA are readable; no visible overlap or dark/neon drift. |
| 1024x768 | PASS | Layout becomes a large showcase below/near the copy. Image is dominant but not broken, blurred, or clipped. This is acceptable as a tablet-width presentation. |
| 390x844 | PASS | Mobile hero reads as a proper mobile landing: H1 fits, CTA buttons fit, matryoshka is centered and not aggressively cropped. No obvious horizontal overflow in screenshot. |

Visual observations:

- Hero composition: PASS.
- Text readability: PASS.
- CTA visibility: PASS.
- Light premium consistency: PASS.
- No dark/neon drift: PASS.
- No visible horizontal scroll: PASS by screenshot inspection.
- Image clarity: PASS.
- Responsive crop: PASS.
- Loading/fallback: local browser screenshot confirms image renders; fallback not visually exposed.

## 5. Local vs live comparison

- Local differs from live: YES.
- Expected because modified assets are local: YES.
- Visual risk: LOW/MEDIUM.

Live GitHub Pages check:

- Live homepage HTTP: `200`.
- Live homepage contains `hero-matryoshka`: YES.
- Live homepage contains `matryoshka-hero-720.webp`, `matryoshka-hero-1200.webp`, `matryoshka-hero-1600.webp`: YES.
- Live assets return `200`, but content lengths match older committed assets:
  - `matryoshka-hero-720.webp`: 41,452 bytes live vs 57,354 bytes local.
  - `matryoshka-hero-1200.webp`: 91,266 bytes live vs 109,678 bytes local.
  - `matryoshka-hero-1600.webp`: 137,442 bytes live vs 122,590 bytes local.

Conclusion: live validates that the hero integration is deployed, but it does not yet validate the current modified matryoshka asset set.

## 6. Evidence

Screenshots:

- `_review/MATRYOSHKA_VISUAL_ACCEPTANCE/screenshots/local-home-1440x900.png`
- `_review/MATRYOSHKA_VISUAL_ACCEPTANCE/screenshots/local-home-1024x768.png`
- `_review/MATRYOSHKA_VISUAL_ACCEPTANCE/screenshots/local-home-390x844.png`
- `_review/MATRYOSHKA_VISUAL_ACCEPTANCE/screenshots/live-home-1440x900.png`

Additional evidence:

- `_review/MATRYOSHKA_VISUAL_ACCEPTANCE/live-index.html`

Notes:

- Playwright was available through `node_repl`, but bundled Chromium was not installed.
- Screenshots were captured through system Chrome via Playwright.
- A raw browser metrics JSON was attempted but not produced because the Node/browser run timed out after screenshots were written.

## 7. Risks

- Owner visual approval is still required before staging the modified assets.
- Live currently does not serve the modified asset bytes, so live cannot be treated as proof of the current local image.
- The PNG fallback is about 1.01 MB; acceptable for fallback, but still worth keeping an eye on for performance.
- The 1024x768 view makes the image quite dominant; not broken, but owner taste may decide whether this should be toned down later.
- Dirty worktree remains: only the matryoshka production assets are modified product files, with separate untracked local docs/artifacts.

## 8. Recommendation

ACCEPT MATRYOSHKA AND PREPARE STAGING PLAN.

Recommended next step:

Stage only the approved final matryoshka production assets and the acceptance report after owner confirms the screenshots:

- `assets/img/matryoshka-clean-final.png`
- `assets/img/matryoshka-hero-720.webp`
- `assets/img/matryoshka-hero-1200.webp`
- `assets/img/matryoshka-hero-1600.webp`
- `docs/WEB00_MATRYOSHKA_VISUAL_ACCEPTANCE_SMOKE.md`

Do not stage `SKILL.md`, prompt packs, `_release/`, or unrelated untracked docs.
