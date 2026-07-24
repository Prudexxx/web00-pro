# WEB00 Wave 0.1 Cleanup Report

Дата: 2026-07-03  
Рабочая папка: `D:\Backend\Сайт`  
Режим: safe cleanup по whitelist, без commit/push/deploy, без изменения frontend-кода.

## 1. Что удалено

| Path | Reason |
|---|---|
| `.codex-remote-attachments/` | служебные вложения Codex, не production |
| `_review_artifacts/` | review/evidence artifacts, видео и архивы, не production |
| `_qa/` | QA screenshots/reports, не production source |
| `test-results/` | временные test artifacts, не production source |

Оценочно освобождено:

- `.codex-remote-attachments/`: 1.77 MB
- `_review_artifacts/`: 115.84 MB
- `_qa/`: 52.05 MB
- `test-results/`: ~0 MB

Итого ориентировочно: **169.66 MB**.

## 2. Что НЕ удалено

Сохранено по запрету задачи:

- `Макеты/`
- `docs/`
- `assets/`
- `assets/css/`
- `assets/js/`
- `assets/img/`
- `assets/img/previews/`
- `web00_premium_mockups_final/`
- `demos/`
- `landings/`
- `home-1to1-test.html`
- `WEB00 PRO 2.0 — STRATEGIC ROADMAP (MASTER FILE).md`
- все root HTML
- `robots.txt`
- `sitemap.xml`
- `README.md`

Проверка после удаления:

```text
.codex-remote-attachments    False
_review_artifacts            False
_qa                          False
test-results                 False
web00_premium_mockups_final   True
Макеты                        True
docs                          True
assets                        True
demos                         True
landings                      True
home-1to1-test.html           True
```

## 3. `.gitignore` Changes

На момент Wave 0.1 `.gitignore` уже содержит нужные безопасные правила:

```gitignore
.codex-remote-attachments/
_review_artifacts/
_qa/
test-results/
*.zip
*.webm
*.mp4
*.mov
*.log
```

В этой cleanup-операции дополнительных изменений `.gitignore` не потребовалось.

Важно: `Макеты/`, `docs/`, `assets/`, `web00_premium_mockups_final/`, `demos/`, `landings/` не добавлялись в ignore в этой Wave 0.1.  
Примечание: `web00_premium_mockups_final/` уже был в `.gitignore` до cleanup report, но папка не удалялась.

## 4. Git Status After Cleanup

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
?? home-1to1-test.html
?? Макеты/
```

## 5. Ready For Next Step

Ready for staging boundary review: **YES**  
Ready for Wave 1: **NO**

Почему Wave 1 ещё нет:

- production source всё ещё modified:
  - `index.html`
  - `assets/css/home-1to1-test.css`
  - `assets/js/main.js`
- untracked production-like assets требуют решения владельца;
- `Макеты/` требует решения: tracked или local only;
- `home-1to1-test.html` требует решения.

Следующий безопасный шаг:

1. Просмотреть diff modified production files.
2. Решить, какие preview assets являются production.
3. Решить судьбу `Макеты/`.
4. Затем сделать staging boundary review перед commit.

