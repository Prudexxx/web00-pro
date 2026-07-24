# WEB00 Wave 0 Staging Plan

Дата: 2026-07-03  
Назначение: безопасный план staging после Wave 0.  
Важно: этот документ не выполняет staging. `git add` не запускался.

## Stage Group A — Docs

Можно stage после беглого owner review:

```text
docs/WEB00_FULL_PROJECT_AUDIT.md
docs/WEB00_AUDIT_FINDINGS_TABLE.md
docs/WEB00_REMEDIATION_ROADMAP.md
docs/WEB00_BACKEND_READINESS_AUDIT.md
docs/WEB00_QAMAX_FUTURE_PLAN.md
docs/WEB00_FRONTEND_CANON.md
docs/WEB00_CSS_CLEANUP_PLAN.md
docs/WEB00_PRICING_ALIGNMENT_NOTES.md
docs/WEB00_SHARED_SHELL_PLAN.md
docs/WEB00_SYSTEM_BLUEPRINT_V2.md
docs/WEB00_SCREEN_FLOW_MAP.md
docs/WEB00_COMPONENT_INVENTORY.md
docs/WEB00_IMPLEMENTATION_WAVES.md
docs/WEB00_OPEN_QUESTIONS.md
docs/WEB00_WAVE0_STABILIZATION_REPORT.md
docs/WEB00_WAVE0_STAGING_PLAN.md
```

Также можно stage как master-product-doc, если owner подтверждает:

```text
WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md
```

## Stage Group B — Production Source

Потенциально можно stage, но только после отдельного просмотра diff и визуального подтверждения:

```text
index.html
assets/css/home-1to1-test.css
assets/js/main.js
```

Причина осторожности:

- эти файлы modified до Wave 0;
- они являются production source;
- текущая Wave 0 не анализировала их diff как готовый релиз;
- нельзя смешивать docs/config commit с непроверенным frontend source без решения владельца.

## Stage Group C — Assets

Кандидаты production assets, требующие owner decision:

```text
assets/img/previews/web00-hero-devices-generated.png
assets/img/previews/web00-hero-devices-premium.svg
assets/img/previews/web00-home-desktop-clean.svg
assets/img/previews/web00-home-desktop-device.png
assets/img/previews/web00-home-mobile-clean.svg
assets/img/previews/web00-home-mobile-device.png
```

Правило staging:

1. Проверить, какие файлы реально используются CSS/HTML/JS.
2. Stage только используемые.
3. Не stage весь `assets/img/previews/` целиком.

Foundation asset/config:

```text
assets/css/tokens.css
.gitignore
```

Можно stage вместе с Wave 0 docs, так как:

- `tokens.css` не подключён к страницам;
- `.gitignore` получил только safe ignore rules.

## Stage Group D — Ignore / Evidence

Не должно попасть в commit:

```text
.codex-remote-attachments/
_qa/
_review_artifacts/
test-results/
web00_premium_mockups_final/
*.zip
*.webm
*.mp4
*.mov
*.log
```

Не stage автоматически:

```text
Макеты/
home-1to1-test.html
```

Причина:

- `Макеты/` может быть официальным visual source, но owner должен решить tracked/local.
- `home-1to1-test.html` выглядит как root dev-test artifact.

## Owner Decisions Required

1. `Макеты/`:
   - tracked official design source?
   - local-only visual evidence?
   - external storage?

2. `web00-home-*` preview assets:
   - какие из них нужны production?
   - какие являются промежуточными генерациями?

3. `home-1to1-test.html`:
   - оставить?
   - переместить позже?
   - добавить в ignore позже?

4. Modified production source:
   - принять текущие изменения `index.html`;
   - принять текущие изменения `assets/css/home-1to1-test.css`;
   - принять текущие изменения `assets/js/main.js`;
   - или сначала сделать отдельный diff review.

5. Commit strategy:
   - отдельный docs/config commit;
   - отдельный frontend-source commit;
   - отдельный assets commit.

## Recommended Staging Order

### Step 1 — Documentation checkpoint

Stage:

```text
.gitignore
WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md
assets/css/tokens.css
docs/*.md
```

Only after owner confirms the roadmap should be tracked.

### Step 2 — Source review checkpoint

Review then stage:

```text
index.html
assets/css/home-1to1-test.css
assets/js/main.js
```

### Step 3 — Asset checkpoint

Review then stage selected:

```text
assets/img/previews/web00-home-desktop-clean.svg
assets/img/previews/web00-home-mobile-clean.svg
...
```

Do not stage generated alternatives that are not referenced.

## Current Recommendation

Ready for commit now: **NO**

Safe partial next move:

1. owner reviews this Wave 0 report;
2. decide `Макеты/` and preview assets;
3. run separate source diff review;
4. then create a docs/config checkpoint commit before Wave 1.

