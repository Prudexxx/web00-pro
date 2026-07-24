# WEB00 RC1 Commit Boundary Plan

## 1. Commit principle

No commit without owner approval.

The current working tree contains tracked modifications and untracked files from multiple waves. The commit boundary must be explicit: stage only product source, approved docs, approved assets, PWA files, and ignore rules. Do not stage prompt packs, review artifacts, screenshots, temporary reports, or test output.

## 2. Stage Group A — Product docs

Recommended candidates:

- `README.md` if changed and owner approves
- `.gitignore`
- `WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md`
- `docs/WEB00_SYSTEM_BLUEPRINT_V2.md`
- `docs/WEB00_COMPONENT_INVENTORY.md`
- `docs/WEB00_IMPLEMENTATION_WAVES.md`
- `docs/WEB00_SHELL_CONTRACT.md`
- `docs/WEB00_WAVE0_*.md`
- `docs/WEB00_WAVE1_*.md`
- `docs/WEB00_WAVE2_*.md`
- `docs/WEB00_WAVE3_*.md`
- `docs/WEB00_WAVE4_*.md`
- `docs/WEB00_WAVE5_*.md`
- `docs/WEB00_WAVE6_*.md`
- `docs/WEB00_WAVE7_SUPPORT_ERROR_REPORT_REPORT.md`
- `docs/WEB00_FRONTEND_RC1_REPORT.md`
- `docs/WEB00_RC1_COMMIT_BOUNDARY_PLAN.md`
- `docs/WEB00_RC1_KNOWN_LIMITATIONS.md`
- `docs/WEB00_RC1_MANUAL_SMOKE_CHECKLIST.md`

## 3. Stage Group B — Frontend source

Recommended candidates:

- `index.html`
- `solutions.html`
- `pricing.html`
- `brief.html`
- `status.html`
- `cabinet.html`
- `install.html`
- `app.html`
- `contacts.html`
- `faq.html`
- `services.html`
- `how-it-works.html`
- `cases.html`
- `privacy-policy.html`
- `consent-personal-data.html`
- `assets/js/main.js`
- `assets/js/data.js`
- `assets/css/tokens.css`
- `assets/css/base.css`
- `assets/css/shell.css`
- `assets/css/components.css`
- `assets/css/styles.css`
- `assets/css/legacy.css`
- `assets/css/home.css`
- `assets/css/home-premium.css`
- `assets/css/catalog-premium.css`
- `assets/css/pricing-premium.css`
- `assets/css/brief-premium.css`
- `assets/css/status-premium.css`
- `assets/css/public-premium.css`
- `assets/css/web00-tabs-standard.css`

## 4. Stage Group C — Assets / icons / previews

Recommended candidates:

- `assets/icons/web00-icon-source.svg`
- `assets/icons/web00-icon-192.png`
- `assets/icons/web00-icon-512.png`
- `assets/icons/web00-maskable-512.png`
- `assets/img/favicon.svg`
- `favicon.ico`
- `assets/img/previews/web00-home-desktop-clean.svg`
- `assets/img/previews/web00-home-desktop-device.png`
- `assets/img/previews/web00-home-mobile-clean.svg`
- `assets/img/previews/web00-home-mobile-device.png`
- Existing catalog/demo images already used by production pages.

## 5. Stage Group D — PWA

Recommended candidates:

- `manifest.webmanifest`
- `sw.js`
- `install.html`
- `app.html`
- `assets/icons/web00-icon-source.svg`
- `assets/icons/web00-icon-192.png`
- `assets/icons/web00-icon-512.png`
- `assets/icons/web00-maskable-512.png`

## 6. Excluded / ignored

Do not stage:

- `Макеты/`
- `_qa/`
- `Сайт_qa/`
- `_review/`
- `test-results/`
- `WEB00_WAVE*_PROMPT_PACK*/`
- screenshots
- videos
- archives
- traces
- temporary scripts
- `.env`
- `node_modules/`
- generated local smoke evidence unless owner explicitly requests it.

## 7. Recommended commit split

- commit 1: docs + ignore + roadmap
- commit 2: frontend architecture + CSS layers
- commit 3: product pages + UX copy
- commit 4: brief/status/cabinet
- commit 5: PWA/support shell

If owner wants a single checkpoint commit, stage the same groups in one commit only after reviewing `git diff --cached --name-only`.

## 8. Commands for owner approval later

Do not execute these until owner explicitly approves.

```powershell
git status --short
node --check assets/js/main.js
node --check assets/js/data.js
node --check sw.js
git diff --check
```

Example staged groups, to be adjusted after owner approval:

```powershell
git add -- .gitignore
git add -- docs
git add -- index.html solutions.html pricing.html brief.html status.html cabinet.html install.html app.html contacts.html faq.html services.html how-it-works.html cases.html privacy-policy.html consent-personal-data.html
git add -- assets/css assets/js assets/icons assets/img/previews manifest.webmanifest sw.js favicon.ico
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: prepare WEB00 frontend RC1"
```
