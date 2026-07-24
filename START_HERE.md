# WEB00 Pro - передача проекта

Этот пакет содержит актуальное рабочее состояние WEB00 Pro на момент экспорта 24.07.2026.

## С чего начать

1. Распакуйте архив полностью.
2. Откройте папку `WEB00_PRO_PROJECT`.
3. Прочитайте `AGENTS.md`, `README.md` и `WEB00 PRO 2.0 - STRATEGIC ROADMAP (MASTER FILE).md`.
4. Затем прочитайте:
   - `docs/WEB00_CROSS_PAGE_DESIGN_SYSTEM_UNIFICATION_REPORT.md`
   - `docs/WEB00_FRONTEND_TO_BACKEND_HANDOFF.md`
   - `docs/WEB00_SYSTEM_BLUEPRINT_V2.md`
   - `docs/WEB00_COMPONENT_INVENTORY.md`
5. Проверьте состояние: `git status -sb`.
6. Запустите локально: `python -m http.server 4173`.
7. Откройте: `http://127.0.0.1:4173/`.

## Важное состояние

- Ветка: `main`.
- Базовый HEAD экспорта: `391ba7948f031b37590f155503bdb696fbbd2323`.
- Remote: `https://github.com/kattta222-cmd/web00-pro.git`.
- Рабочее дерево НЕ чистое: текущие незакоммиченные изменения намеренно включены.
- Подробности лежат рядом в `PROJECT_STATE.txt`, `UNTRACKED_FILES.txt` и `UNCOMMITTED_PRODUCT_CHANGES.patch`.
- Проект статический: HTML/CSS/JS, backend пока не подключён.

## Что включено

- весь текущий product source;
- HTML, CSS, JS, PWA-файлы и изображения;
- `landings/` и `demos/`;
- вся документация и roadmap;
- дизайн-макеты и визуальные референсы;
- `.github/workflows/`;
- `.agents/` и `AGENTS.md`;
- полная `.git`-история и remote-настройка;
- локальные prompt packs как историческая справка.

## Что намеренно не включено

- `_qa/` - около 1,2 ГБ raw evidence и Chrome-профилей;
- `_review/` - около 146 МБ, включая browser profile data;
- `_release/` - старая дублирующая release-копия;
- локальная изменённая `.codex/`-конфигурация и backup исключены; в проект положена только tracked baseline-версия `.codex/config.toml` из HEAD;
- browser cookies, Login Data, секретоподобные файлы;
- видео, логи и вложенные ZIP-архивы.

Эти исключения не нужны для продолжения разработки и предотвращают передачу локальных browser/session данных.

## Проверки

После распаковки можно выполнить:

```powershell
node --check assets/js/main.js
node --check assets/js/data.js
node --check sw.js
python -m http.server 4173
```

Публичный сайт: https://kattta222-cmd.github.io/web00-pro/

