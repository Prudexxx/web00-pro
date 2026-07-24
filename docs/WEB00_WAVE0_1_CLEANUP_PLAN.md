# WEB00 Wave 0.1 Cleanup Plan

Дата: 2026-07-03  
Рабочая папка: `D:\Backend\Сайт`  
Режим: safe cleanup по whitelist, без commit/push/deploy, без изменения frontend-кода.

## 1. Цель

Убрать очевидные временные и служебные артефакты, которые не являются production source, не являются docs и не являются утверждёнными макетами. Cleanup нужен, чтобы подготовить проект к Wave 1 и снизить риск случайного staging мусора.

Удаление разрешено только для SAFE DELETE LIST:

- `.codex-remote-attachments/`
- `_review_artifacts/`
- `_qa/`
- `test-results/`
- временные `*.webm`, `*.mp4`, `*.mov`, `*.log`, если они не в `docs/`, не в `Макеты/` и не в утверждённых макетах.

## 2. Найденные Cleanup Candidates

| Path | Type | Size | Safe to delete | Reason |
|---|---|---:|---|---|
| `.codex-remote-attachments/` | dev/evidence attachment cache | 1.77 MB | YES | служебные вложения Codex, не production |
| `_review_artifacts/` | review-artifacts | 115.84 MB | YES | review/video/archive evidence, не production |
| `_qa/` | qa-evidence | 52.05 MB | YES | QA screenshots/reports, не production source |
| `test-results/` | test artifacts | 0.00 MB | YES | временный test output |
| `_review_artifacts/**/*.webm` | temp review videos | 28.70 MB внутри `_review_artifacts` | YES | удаляется вместе с `_review_artifacts/` |

## 3. Delete Whitelist

Будет удалено точечно:

```text
.codex-remote-attachments/
_review_artifacts/
_qa/
test-results/
```

Дополнительные `*.webm`, `*.mp4`, `*.mov`, `*.log` вне этих папок не найдены в безопасном контуре. Поэтому отдельное файловое удаление не планируется.

## 4. Keep List

Найдено, но не удаляется:

| Path | Why keep |
|---|---|
| `Макеты/` | официальный/потенциальный visual source, owner decision |
| `docs/` | product documentation |
| `assets/` | production assets/source |
| `assets/img/previews/` | может содержать production hero/preview assets |
| `web00_premium_mockups_final/` | явно запрещено удалять в этой задаче |
| `demos/` | demo candidates, может использоваться preview viewer |
| `landings/` | legacy/demo candidates, не whitelist |
| `home-1to1-test.html` | спорный root test file, но удалять запрещено |
| `WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md` | master roadmap |

## 5. Owner Decision List

Требуют решения владельца:

1. `Макеты/` — хранить в git или оставить локально?
2. `web00_premium_mockups_final/` — оставить локально, перенести во внешнее хранилище или позже удалить отдельной командой?
3. `home-1to1-test.html` — оставить, перенести в experiments или удалить позже?
4. `assets/img/previews/web00-home-*` — какие preview/device assets production, какие промежуточные?
5. Modified production files — принимать ли текущие `index.html`, `assets/css/home-1to1-test.css`, `assets/js/main.js`?

## 6. Risk

Риски cleanup:

- если QA evidence понадобится позже, после удаления `_qa/` и `_review_artifacts/` его не будет локально;
- удаление делается только по whitelist, production source не затрагивается;
- `web00_premium_mockups_final/` и `Макеты/` сохраняются, поэтому visual source не теряется;
- `assets/`, `docs/`, `demos/`, `landings/` не затрагиваются.

Вывод: план безопасен в рамках заданного whitelist.

