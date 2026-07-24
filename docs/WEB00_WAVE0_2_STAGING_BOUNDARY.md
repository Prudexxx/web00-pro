# WEB00 Wave 0.2 Staging Boundary

Дата: 2026-07-03  
Рабочая папка: `D:\Backend\Сайт`  
Режим: staging boundary / layer decision, без commit/push/deploy, без изменения production HTML/CSS/JS.

## 1. Executive Summary

Первый commit формировать **пока нельзя** как один общий коммит: dirty state содержит одновременно docs/config, production-source changes и untracked assets.

Что считается production:

- root HTML/CSS/JS проекта;
- `assets/css/tokens.css` как future foundation;
- preview assets, которые реально referenced из `home-1to1-test.css`;
- sitemap/robots/README/humans;
- demos/landings только после отдельной классификации, но сейчас не удалять.

Что считается docs:

- `docs/`;
- `WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md`.

Что считается evidence/local-only:

- `Макеты/`;
- `web00_premium_mockups_final/`;
- review/QA folders уже удалены в Wave 0.1.

Что удалено в этой Wave:

- `home-1to1-test.html` — untracked dev artifact, production references не найдены.

## 2. Current Git State

### status --short

```text
 M .gitignore
 M assets/css/home-1to1-test.css
 M assets/js/main.js
 M index.html
?? WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md
?? assets/css/tokens.css
?? assets/img/previews/web00-hero-devices-generated.png
?? assets/img/previews/web00-hero-devices-premium.svg
?? assets/img/previews/web00-home-desktop-clean.svg
?? assets/img/previews/web00-home-desktop-device.png
?? assets/img/previews/web00-home-mobile-clean.svg
?? assets/img/previews/web00-home-mobile-device.png
?? docs/
```

### diff --name-only

```text
.gitignore
assets/css/home-1to1-test.css
assets/js/main.js
index.html
```

### diff --stat

```text
.gitignore                    |   6 +
assets/css/home-1to1-test.css | 380 +++++++++++++++++++++++++++++++++++++++++-
assets/js/main.js             | 126 +++++++-------
index.html                    |  16 +-
4 files changed, 455 insertions(+), 73 deletions(-)
```

## 3. Production Staging Candidates

| Path | Decision | Reason | Stage later? |
|---|---|---|---|
| `docs/` | TRACK | product blueprint, audit, roadmap docs | YES, docs commit |
| `WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md` | TRACK | master source of truth | YES, if owner confirms root doc |
| `assets/css/tokens.css` | TRACK | future light premium foundation, not wired yet | YES |
| `.gitignore` | TRACK | safe ignore boundary for local evidence | YES |
| `index.html` | REVIEW THEN TRACK | production page modified before Wave 0.2 | YES after diff review |
| `assets/js/main.js` | REVIEW THEN TRACK | production JS modified before Wave 0.2 | YES after diff review |
| `assets/css/home-1to1-test.css` | HOLD | production-linked but test-named; should be renamed/integrated in Wave 1 | HOLD or review separately |
| `assets/img/previews/web00-home-desktop-clean.svg` | TRACK if current hero accepted | referenced by `home-1to1-test.css` | YES if hero accepted |
| `assets/img/previews/web00-home-mobile-clean.svg` | TRACK if current hero accepted | referenced by `home-1to1-test.css` | YES if hero accepted |
| `assets/img/previews/web00-home-desktop-device.png` | TRACK if fallback/old layer still needed | referenced by `home-1to1-test.css` | YES if needed |
| `assets/img/previews/web00-home-mobile-device.png` | TRACK if fallback/old layer still needed | referenced by `home-1to1-test.css` | YES if needed |
| `assets/img/previews/web00-hero-devices-generated.png` | HOLD | no production HTML/CSS/JS reference found | NO until owner decides |
| `assets/img/previews/web00-hero-devices-premium.svg` | HOLD | no production HTML/CSS/JS reference found | NO until owner decides |

## 4. Evidence / Local-only Candidates

| Path | Decision | Reason |
|---|---|---|
| `Макеты/` | LOCAL ONLY / IGNORE | official visual evidence, but not production source |
| `web00_premium_mockups_final/` | LOCAL ONLY / IGNORE | large mockup pack / archive evidence |
| `_review_artifacts/` | REMOVED in Wave 0.1 | review evidence, not production |
| `_qa/` | REMOVED in Wave 0.1 | QA evidence, not production |
| `test-results/` | REMOVED in Wave 0.1 | test output |
| `.codex-remote-attachments/` | REMOVED in Wave 0.1 | Codex attachment cache |

## 5. Delete Candidates

### `home-1to1-test.html`

Checks:

- `rg "home-1to1-test.html" .` found only docs references.
- `rg "home-1to1-test.html" -g "*.html" -g "*.js" -g "*.css" .` found no production references.
- File was untracked.

Decision:

```text
DELETE as dev artifact.
```

Action:

```text
home-1to1-test.html deleted in Wave 0.2.
```

Important:

`assets/css/home-1to1-test.css` was **not** deleted. It is still linked by `index.html` and remains production-linked until Wave 1 cleanup.

## 6. CSS Layer Decision

Current layers:

- `styles.css` — global legacy/base shell, contains old dark/neon tokens and shared rules.
- `home-premium.css` — old home premium layer, partially live for shared shell/footer bits.
- `home-1to1-test.css` — actual current homepage renderer for `mock-*`, but bad production name.
- `catalog-premium.css` — catalog page layer.
- `pricing-premium.css` — pricing page layer.
- `brief-premium.css` — brief/questionnaire page layer.
- `status-premium.css` — status/cabinet page layer.
- `public-premium.css` — public/legal pages shared layer.
- `web00-tabs-standard.css` — shared/mobile/table patch layer with misleading name.
- `tokens.css` — new light premium token contract, not wired yet.

Decision:

1. `home-1to1-test.css` must not remain as final production-name.
2. `tokens.css` should become the first layer in Wave 1.
3. `styles.css` needs dark legacy quarantine later.
4. page CSS files should become normal page layers.
5. `home-premium.css` should be removed or merged after exact selector verification.
6. `web00-tabs-standard.css` should be renamed/split later.

## 7. Owner Decisions Closed By This Wave

Closed:

- `Макеты/` не коммитим сейчас; добавлено в local evidence ignore.
- `web00_premium_mockups_final/` не коммитим сейчас; local evidence ignore зафиксирован.
- `home-1to1-test.html` удалён как unreferenced dev artifact.
- preview assets отслеживать только если используются в hero/device.
- docs и roadmap отслеживать как product documentation candidates.

Still open:

- принимать ли modified `index.html`, `main.js`, `home-1to1-test.css`;
- какие referenced preview assets stage вместе с home;
- когда переименовывать `home-1to1-test.css`;
- делать ли первым commit docs/config или сразу source+assets.

## 8. Ready For Wave 1?

Verdict: **NO**

Осталось перед Wave 1:

1. Review modified production files:
   - `index.html`
   - `assets/js/main.js`
   - `assets/css/home-1to1-test.css`
2. Decide preview assets:
   - track referenced clean/device files;
   - hold unused hero generated/premium files.
3. Сделать staging boundary commit later.
4. После этого начинать Wave 1: tokens/shell cleanup.

