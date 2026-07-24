# WEB00 Wave 0.3 - Source Acceptance Gate

Дата: 2026-07-03
Рабочая папка: `D:\Backend\Сайт`
Режим: source acceptance / cleanup gate, без commit/push/deploy/reset/clean/QAMax.

## 1. Executive summary

Wave 0.3 классифицирует текущий dirty-state перед Wave 1.

- HTML/CSS/JS в этой волне не редактировались.
- Удалены только два неподключенных preview-ассета:
  - `assets/img/previews/web00-hero-devices-generated.png`
  - `assets/img/previews/web00-hero-devices-premium.svg`
- Четыре новых preview-ассета, которые реально используются текущей главной, оставлены.
- `node --check assets/js/main.js` - PASS.
- `node --check assets/js/data.js` - PASS.
- `git diff --check` - PASS, только CRLF warnings.

Итог: текущая source-база классифицирована и готова к Wave 1 как рабочая база, но перед commit нужен отдельный staging по группам ниже.

## 2. Git state before

### `git status --short`

```text
 M .gitignore
 M assets/css/home-1to1-test.css
 M assets/js/main.js
 M index.html
?? "WEB00 PRO 2.0 \342\200\224 STRATEGIC ROADMAP (MASTER FILE).md"
?? assets/css/tokens.css
?? assets/img/previews/web00-home-desktop-clean.svg
?? assets/img/previews/web00-home-desktop-device.png
?? assets/img/previews/web00-home-mobile-clean.svg
?? assets/img/previews/web00-home-mobile-device.png
?? docs/
```

### `git diff --stat`

```text
 .gitignore                    |   6 +
 assets/css/home-1to1-test.css | 380 +++++++++++++++++++++++++++++++++++++++++-
 assets/js/main.js             | 126 +++++++-------
 index.html                    |  16 +-
 4 files changed, 455 insertions(+), 73 deletions(-)
```

### `git diff --name-only`

```text
.gitignore
assets/css/home-1to1-test.css
assets/js/main.js
index.html
```

## 3. Modified source review

| File | Diff summary | Review | Decision |
|---|---:|---|---|
| `index.html` | 8 additions / 8 deletions | Homepage device copy and cache-bust query changed from old psychology-preview copy to WEB00 Pro device copy. No broad structure rewrite seen. | ACCEPT AS CURRENT BASE |
| `assets/js/main.js` | 63 additions / 63 deletions | Translation dictionary values for the hero device were aligned across supported languages from old psychology wording to WEB00/catalog/pricing/cases wording. Syntax check passed. | ACCEPT AS CURRENT BASE |
| `assets/css/home-1to1-test.css` | 378 additions / 2 deletions | Active homepage visual layer. Adds scrollbar suppression, device-shell/image preview styling, footer/device polish, and references current WEB00 preview assets. The filename remains technical debt, but the file is live and should be treated as current visual base until Wave 1 renaming/consolidation. | ACCEPT AS CURRENT BASE |
| `.gitignore` | 6 additions | Ignores local attachments/evidence/logs and local design sources such as `/Макеты/`. No product files are ignored. | ACCEPT AS CURRENT BASE |

## 4. Asset cleanup table

| Asset | Production refs in `.html/.css/.js` | State | Decision |
|---|---:|---|---|
| `assets/img/previews/web00-hero-devices-generated.png` | 0 | Removed in Wave 0.3 | DELETE ACCEPTED |
| `assets/img/previews/web00-hero-devices-premium.svg` | 0 | Removed in Wave 0.3 | DELETE ACCEPTED |
| `assets/img/previews/web00-home-desktop-clean.svg` | `assets/css/home-1to1-test.css:2396` | Present, untracked | KEEP / STAGE WITH HOMEPAGE |
| `assets/img/previews/web00-home-desktop-device.png` | `assets/css/home-1to1-test.css:2206` | Present, untracked | KEEP / STAGE WITH HOMEPAGE |
| `assets/img/previews/web00-home-mobile-clean.svg` | `assets/css/home-1to1-test.css:2433` | Present, untracked | KEEP / STAGE WITH HOMEPAGE |
| `assets/img/previews/web00-home-mobile-device.png` | `assets/css/home-1to1-test.css:2216` | Present, untracked | KEEP / STAGE WITH HOMEPAGE |

Notes:

- Removed assets were referenced only by documentation files, not by production `.html/.css/.js`.
- Retained assets are directly referenced by the live homepage CSS layer.

## 5. Staging recommendation groups

### Group A - Current homepage/product source base

Stage together only after owner approval:

```text
index.html
assets/js/main.js
assets/css/home-1to1-test.css
assets/img/previews/web00-home-desktop-clean.svg
assets/img/previews/web00-home-desktop-device.png
assets/img/previews/web00-home-mobile-clean.svg
assets/img/previews/web00-home-mobile-device.png
```

Rationale: these files are coupled by the current homepage device preview implementation.

### Group B - Repository hygiene

```text
.gitignore
```

Rationale: prevents local evidence/mockup folders and logs from leaking into commits.

### Group C - Documentation / planning

```text
docs/
WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md
```

Rationale: useful for Wave 1 planning, but should be staged separately from product source.

### Group D - Hold / architecture review

```text
assets/css/tokens.css
```

Rationale: token foundation exists as untracked work, but it is not yet connected in the source graph. Review in Wave 1 before staging.

## 6. Wave 1 readiness checks / verdict

| Check | Result |
|---|---|
| `node --check assets/js/main.js` | PASS |
| `node --check assets/js/data.js` | PASS |
| `git diff --check` | PASS, CRLF warnings only |
| Unused preview assets removed | PASS |
| HTML/CSS/JS unchanged during Wave 0.3 | PASS |
| Dirty-state classified | PASS |

Verdict: Ready for Wave 1 - YES.

Caveat: this does not mean ready for commit automatically. Commit should happen only after explicit staging approval by groups A/B/C/D.

## 7. Next wave recommendation

Recommended Wave 1 scope:

1. Consolidate homepage CSS naming: decide whether `home-1to1-test.css` remains as production layer or gets renamed to a production filename.
2. Decide how `assets/css/tokens.css` should be introduced, or keep it out until the shared token system is planned.
3. Stage Group A and retained preview assets together if current homepage visual is accepted.
4. Stage Group B separately.
5. Keep docs/planning in a separate commit or review package.

