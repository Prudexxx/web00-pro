# WEB00 Wave 0 Stabilization Report

Дата: 2026-07-03  
Рабочая папка: `D:\Backend\Сайт`  
Режим: стабилизация project-state, без правок frontend-кода, без commit/push/deploy.

## 1. Executive Summary

- Repo readable: **YES**, через `git -c safe.directory="D:/Backend/Сайт" ...`.
- Dubious ownership: **есть риск**, потому команды выполнялись через `safe.directory`. Владельцу стоит настроить safe directory отдельно.
- Git tree clean: **NO**.
- Production source status: есть 3 modified production files до Wave 0:
  - `index.html`
  - `assets/css/home-1to1-test.css`
  - `assets/js/main.js`
- Commit сейчас: **NO**, сначала нужен owner review modified/untracked.
- Wave 1 сейчас: **NO**, пока не зафиксирован clean staging boundary.

Команда для владельца, если обычный git блокируется из-за ownership:

```powershell
git config --global --add safe.directory "D:/Backend/Сайт"
```

## 2. Git State

### Branch

```text
main
```

### Remote

```text
origin  https://github.com/kattta222-cmd/web00-pro.git (fetch)
origin  https://github.com/kattta222-cmd/web00-pro.git (push)
```

### Last commits

```text
57808ab fix: polish WEB00 mobile frontend
5d2c085 chore: finalize WEB00 frontend product polish
b38f5d5 fix: rebuild WEB00 status dashboard
c808e3b fix: align WEB00 home pricing and brief density
1bed57f fix: stabilize WEB00 header footer nav and mobile controls
```

### Status before Wave 0 docs / ignore update

```text
 M assets/css/home-1to1-test.css
 M assets/js/main.js
 M index.html
?? .codex-remote-attachments/
?? WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md
?? assets/css/tokens.css
?? assets/img/previews/web00-hero-devices-generated.png
?? assets/img/previews/web00-hero-devices-premium.svg
?? assets/img/previews/web00-home-desktop-clean.svg
?? assets/img/previews/web00-home-desktop-device.png
?? assets/img/previews/web00-home-mobile-clean.svg
?? assets/img/previews/web00-home-mobile-device.png
?? docs/
?? home-1to1-test.html
?? Макеты/
```

### Diff name-only

```text
assets/css/home-1to1-test.css
assets/js/main.js
index.html
```

### Diff stat

```text
assets/css/home-1to1-test.css | 380 +++++++++++++++++++++++++++++++++++++++++-
assets/js/main.js             | 126 +++++++-------
index.html                    |  16 +-
3 files changed, 449 insertions(+), 73 deletions(-)
```

Примечание: `.gitignore`, `docs/*.md` и `assets/css/tokens.css` появились/обновлены в предыдущих стабилизационных документационных волнах и текущей Wave 0. HTML/CSS/JS продукта в этой Wave 0 не менялись.

## 3. File Classification

| Path | Type | Current status | Keep in repo? | Action |
|---|---|---|---|---|
| `index.html` | production-source | modified | yes | owner review before stage |
| `assets/css/home-1to1-test.css` | production-source / test-named | modified | yes, but rename later | owner review before stage |
| `assets/js/main.js` | production-source | modified | yes | owner review before stage |
| `.gitignore` | project-config | modified by Wave 0 | yes | stage only after owner confirms |
| `docs/` | product-docs | untracked folder | yes | can stage docs group |
| `docs/WEB00_*` | product-docs | untracked | yes | can stage docs group |
| `assets/css/tokens.css` | production-source foundation | untracked | yes | candidate for Wave 1, not wired |
| `WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md` | product-docs / master roadmap | untracked | yes | stage with docs if approved |
| `Макеты/` | design-mockups | untracked | owner decision | do not stage automatically |
| `web00_premium_mockups_final/` | design-mockups / archive pack | ignored existing | probably no | keep out of production commit |
| `_qa/` | qa-evidence | ignored existing | no production | keep local/evidence only |
| `_review_artifacts/` | review-artifacts | ignored existing | no production | keep local/evidence only |
| `test-results/` | qa-evidence | ignored existing | no production | keep local/evidence only |
| `.codex-remote-attachments/` | dev/evidence attachment cache | ignored by Wave 0 | no | do not stage |
| `home-1to1-test.html` | dev-test | untracked | no production unless approved | do not stage automatically |
| `demos/` | production/demo candidates | tracked/exists | yes if used by viewer | keep, review later |
| `landings/` | legacy/demo candidates | tracked/exists | maybe | classify in later cleanup |
| `assets/img/previews/*` | production assets / mixed | partially untracked | owner decision per file | stage only assets referenced by current UI |
| `README.md` | product-docs | clean/tracked | yes | no action |
| `sitemap.xml` | production-source SEO | clean/tracked | yes | no action |
| `robots.txt` | production-source SEO | clean/tracked | yes | no action |

## 4. Production Candidates

Likely production source to preserve:

- root public pages: `index.html`, `solutions.html`, `pricing.html`, `brief.html`, `status.html`, `services.html`, `how-it-works.html`, `cases.html`, `faq.html`, `contacts.html`, legal pages;
- `assets/js/main.js`;
- `assets/js/data.js`;
- page CSS in `assets/css/`;
- `assets/css/tokens.css` as future foundation;
- `assets/img/favicon.svg`, `favicon.ico`;
- referenced `assets/img/previews/*` device/preview files after owner review;
- `assets/img/solution-gallery/*`;
- `demos/` if still used by demo viewer;
- `sitemap.xml`, `robots.txt`, `humans.txt`, `README.md`.

## 5. Evidence / Mockup Candidates

Keep as evidence/mockups, but do not stage into normal production commit without explicit decision:

- `Макеты/` — official mockups / visual source of truth, currently untracked.
- `web00_premium_mockups_final/` — 38 files, about 91.75 MB, already ignored.
- `_qa/` — 285 files, about 52.05 MB, already ignored.
- `_review_artifacts/` — 18 files, about 115.84 MB, already ignored.
- `test-results/` — QA output, already ignored.
- `.codex-remote-attachments/` — 38 files, about 1.77 MB, now ignored.

## 6. Ignore Candidates

Already present before Wave 0:

```gitignore
_review_artifacts/
web00_premium_mockups_final/
_qa/
test-results/
*.zip
*.webm
*.mp4
*.mov
record_review.mjs
record_*.mjs
*_review*.mjs
node_modules/
.env
.env.*
.DS_Store
Thumbs.db
```

Added safely in Wave 0:

```gitignore
.codex-remote-attachments/
*.log
```

Not added automatically:

- `Макеты/` — owner decision needed.
- `assets/img/previews/` — can contain production assets.
- `docs/` — product documentation must remain stageable.

## 7. Dangerous Areas

### `.env`

`not found`.

### `node_modules`

`not found`.

### Secrets / tokens

No obvious live secrets found in source scan. Matches were documentation-only words such as `tokens.css`, `no secrets frontend`, `API keys`.

### Large binaries

Large non-production files found:

| Path | Size |
|---|---:|
| `web00_premium_mockups_final/...FINAL.zip` | 44.04 MB |
| `_review_artifacts/WEB00_frontend_acceptance_review.zip` | 20.81 MB |
| `_review_artifacts/WEB00_full_public_frontend_review.zip` | 18.10 MB |
| `_review_artifacts/WEB00_visual_maturity_public_review.zip` | 10.95 MB |
| `_review_artifacts/*.webm` | up to 9.84 MB |

These are evidence/review artifacts, not production source.

### Conflict-prone test files

- `home-1to1-test.html` in root: untracked dev-test file.
- `home-1to1-test.css`: currently modified production-linked CSS with test naming.

## 8. Safe Next Actions

### Can stage later, after owner confirmation

Docs group:

- `docs/WEB00_FULL_PROJECT_AUDIT.md`
- `docs/WEB00_AUDIT_FINDINGS_TABLE.md`
- `docs/WEB00_REMEDIATION_ROADMAP.md`
- `docs/WEB00_BACKEND_READINESS_AUDIT.md`
- `docs/WEB00_QAMAX_FUTURE_PLAN.md`
- `docs/WEB00_FRONTEND_CANON.md`
- `docs/WEB00_CSS_CLEANUP_PLAN.md`
- `docs/WEB00_PRICING_ALIGNMENT_NOTES.md`
- `docs/WEB00_SHARED_SHELL_PLAN.md`
- `docs/WEB00_SYSTEM_BLUEPRINT_V2.md`
- `docs/WEB00_SCREEN_FLOW_MAP.md`
- `docs/WEB00_COMPONENT_INVENTORY.md`
- `docs/WEB00_IMPLEMENTATION_WAVES.md`
- `docs/WEB00_OPEN_QUESTIONS.md`
- `docs/WEB00_WAVE0_STABILIZATION_REPORT.md`
- `docs/WEB00_WAVE0_STAGING_PLAN.md`

Foundation config:

- `.gitignore`
- `assets/css/tokens.css`
- `WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md`

Production source group only after visual/code review:

- `index.html`
- `assets/css/home-1to1-test.css`
- `assets/js/main.js`
- selected `assets/img/previews/web00-home-*.svg/png` if referenced.

### Must not stage

- `.codex-remote-attachments/`
- `_qa/`
- `_review_artifacts/`
- `test-results/`
- `web00_premium_mockups_final/`
- `*.zip`
- `*.webm`
- `*.mp4`
- `*.mov`
- `*.log`
- `home-1to1-test.html` unless owner explicitly promotes it.

### Ask owner

1. Should `Макеты/` be tracked as official design source or kept local?
2. Which untracked `assets/img/previews/web00-home-*` are production assets?
3. Should `home-1to1-test.html` be deleted later, ignored, or moved to experiments?
4. Are current modified `index.html`, `main.js`, `home-1to1-test.css` accepted as the latest frontend state?

## 9. Recommendation

Ready for commit: **NO**  
Ready for Wave 1: **NO**  
Needs owner decision: **YES**

Reason:

- production source is modified and not reviewed in this Wave;
- untracked production-like preview assets need classification;
- docs/config can be staged later, but source staging must be separate;
- evidence/mockups must remain out of production commit unless explicitly approved.

