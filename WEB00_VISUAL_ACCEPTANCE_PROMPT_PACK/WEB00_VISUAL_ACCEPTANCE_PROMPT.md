# WEB00 Visual Acceptance Pack — Live/Desktop/Tablet/Mobile Visual Gate

**Назначение:** полный prompt для Codex.
**Использование:** распаковать в `D:\Backend\Сайт\WEB00_VISUAL_ACCEPTANCE_PROMPT_PACK`, затем вставить loader из `CODEX_LOADER.txt`.

## [ЦЕЛЬ]

Провести визуальную приёмку WEB00 Pro 2.0 Frontend Public RC1.

Цель:
- проверить live-сайт не только по коду/HTTP, а визуально через screenshots;
- проверить desktop/tablet/mobile;
- проверить, что верстка не “поехала”;
- проверить, что нет горизонтального скролла;
- проверить, что старые публичные слова не видны;
- сохранить evidence в `_qa/WEB00_VISUAL_ACCEPTANCE_PACK/`;
- НЕ менять product code;
- НЕ делать commit/push/deploy/backend.

Live URL:
`https://kattta222-cmd.github.io/web00-pro/`

Current accepted live commit:
`840adbfea17fa38fb608638136dc11975ac4d1a1`

## [КОНТЕКСТ]

Проект уже прошёл:
- Frontend RC1;
- QAMax RC1;
- language gate patch;
- GitHub Pages live build;
- Wave 10 closeout docs.

Но нужно отдельно подтвердить визуально:
- глазами по скриншотам;
- desktop/tablet/mobile;
- ключевые страницы;
- mobile menu;
- карточки/формы/hero/footer.

Важно:
Chrome DevTools Device Mode — это приближение мобильного опыта, не замена реальному устройству. Если есть возможность проверить реальный телефон — отметить отдельно.

## [ПЛАН]

1. Проверить git state и live commit.
2. Создать `_qa/WEB00_VISUAL_ACCEPTANCE_PACK/`.
3. Проверить live HTTP 200.
4. Сделать screenshots по viewports.
5. Проверить layout checklist.
6. Проверить visible language gate.
7. Создать visual acceptance report.
8. Ничего не менять в product files.

## [ПРАВКИ]

Продуктовый код НЕ менять.

Разрешено создавать/изменять только:

`_qa/WEB00_VISUAL_ACCEPTANCE_PACK/`

Внутри:
- `WEB00_VISUAL_ACCEPTANCE_REPORT.md`
- `screenshots/desktop/`
- `screenshots/tablet/`
- `screenshots/mobile/`
- `raw/`
- `visual-findings.json`, если удобно
- `console-results.json`, если удобно

Если browser automation недоступен:
- не устанавливать зависимости;
- сделать manual screenshot instructions;
- вернуть `VISUAL_CONDITIONAL`, не `VISUAL_ACCEPTED`.

## [ПРОВЕРКИ]

### 1. Git / live state

Выполнить:

```powershell
git -c safe.directory="D:/Backend/Сайт" status -sb
git -c safe.directory="D:/Backend/Сайт" log --oneline -3
git -c safe.directory="D:/Backend/Сайт" ls-remote origin refs/heads/main
```

Ожидание:
- remote main = `840adbfea17fa38fb608638136dc11975ac4d1a1`;
- product code clean;
- допускаются только untracked closeout docs Wave 10, если они ещё не committed.

### 2. Pages

Base:
`https://kattta222-cmd.github.io/web00-pro/`

Проверить страницы:
- `/`
- `/solutions.html`
- `/pricing.html`
- `/brief.html`
- `/status.html?id=WEB00-2026-0001`
- `/cabinet.html`
- `/install.html`
- `/app.html`
- `/contacts.html`
- `/faq.html`

Все должны вернуть HTTP 200.

### 3. Viewports

Сделать screenshots:

Desktop:
- 1440x900

Tablet:
- 768x1024

Mobile:
- 390x844

Для каждой страницы и viewport:
- сохранить screenshot;
- проверить console errors;
- проверить `document.documentElement.scrollWidth <= window.innerWidth + 1`;
- проверить body horizontal scroll;
- проверить header/footer.

### 4. Visual checklist per page

Для каждой страницы проверить:

- header видим и не ломается;
- logo/brand не обрезан;
- navigation/menu не налезает;
- hero не развален;
- карточки не вылезают за экран;
- формы не сжаты;
- labels/readable text видны;
- CTA видимы;
- footer не сломан;
- нет горизонтального скролла;
- текст не обрезан в ключевых блоках;
- mobile menu работает, если есть;
- tablet не выглядит как сломанный desktop;
- page visually consistent with light premium style.

### 5. Page-specific checks

`/`:
- hero readable;
- primary CTA to catalog visible;
- install link not primary.

`/solutions.html`:
- catalog cards readable;
- cards grid adapts;
- no old “шаблон” wording.

`/pricing.html`:
- tariffs Start/Business/Pro visible;
- 39/69/99 visible;
- pricing cards not cramped.

`/brief.html`:
- form steps readable;
- labels visible;
- submit/success area not broken;
- no public “API”.

`/status.html?id=WEB00-2026-0001`:
- status card readable;
- progress/status blocks not broken;
- link to cabinet visible.

`/cabinet.html`:
- “Мой проект” shell readable;
- support/error blocks visible;
- no false auth promise.

`/install.html`:
- iPhone/Android/Desktop instructions readable;
- no APK promise.

`/app.html`:
- mobile app cards readable;
- compact layout works.

`/contacts.html`:
- support form readable;
- error report section not aggressive;
- file field visible if expected.

`/faq.html`:
- FAQ cards readable;
- accordion/links not broken.

### 6. Visible language gate

Forbidden visible/public terms:
- шаблон
- Шаблон
- шаблоны
- Шаблоны
- Бриф
- бриф
- API
- Performance
- SEO-ready
- Accessibility
- Bug report

Technical exception:
- lowercase `api` inside `fonts.googleapis.com` / `googleapis` is not a UI blocker.

### 7. Report

Создать:

`_qa/WEB00_VISUAL_ACCEPTANCE_PACK/WEB00_VISUAL_ACCEPTANCE_REPORT.md`

Структура:

```md
# WEB00 Visual Acceptance Report

## 1. Verdict
- VISUAL_ACCEPTED / VISUAL_CONDITIONAL / VISUAL_BLOCKED

## 2. Scope
Pages and viewports.

## 3. Summary matrix

| Page | Desktop | Tablet | Mobile | Notes |
|---|---|---|---|---|

## 4. Layout findings

| ID | Severity | Page | Viewport | Finding | Screenshot | Required action |
|---|---|---|---|---|---|---|

## 5. Horizontal scroll

| Page | Desktop | Tablet | Mobile |
|---|---|---|---|

## 6. Console errors

| Page | Viewport | Errors |
|---|---|---|

## 7. Language gate

| Term | Result | Notes |
|---|---|---|

## 8. Screenshots index

List screenshot paths.

## 9. Final decision

Use:
- VISUAL_ACCEPTED if no P0/P1 visual blockers.
- VISUAL_CONDITIONAL if only P2/P3 notes or automation limitations.
- VISUAL_BLOCKED if layout visibly broken, key flow unreadable, horizontal scroll, menu unusable, or old public wording visible.
```

## [ЗАПРЕТЫ]

- Не менять HTML/CSS/JS/assets/docs.
- Не делать commit.
- Не делать push.
- Не делать deploy.
- Не подключать backend.
- Не запускать QAMax заново.
- Не делать Lighthouse.
- Не делать npm install.
- Не скачивать зависимости.
- Не делать git add/reset/clean/rebase/force.
- Не удалять prompt packs/evidence.
- Не исправлять найденные баги в этой волне.

## [DoD]

Visual gate готов, если:

1. Проверены 10 страниц.
2. Проверены 3 viewport.
3. Скриншоты сохранены или честно указано automation/manual limitation.
4. Horizontal scroll проверен.
5. Console errors проверены.
6. Visible language gate проверен.
7. Report создан.
8. Verdict дан:
   - VISUAL_ACCEPTED
   - VISUAL_CONDITIONAL
   - VISUAL_BLOCKED
9. Product code не менялся.
10. Commit/push/deploy/backend не выполнялись.

## [ФИНАЛЬНЫЙ ОТЧЁТ]

В конце коротко:

1. Visual verdict.
2. Pages checked.
3. Viewports checked.
4. Screenshots saved: YES/NO.
5. Desktop: PASS/PARTIAL/FAIL.
6. Tablet: PASS/PARTIAL/FAIL.
7. Mobile: PASS/PARTIAL/FAIL.
8. Horizontal scroll found: YES/NO.
9. Console errors found: YES/NO.
10. Old public wording found: YES/NO.
11. P0/P1 visual blockers.
12. Evidence folder.
13. Product code changed: YES/NO.
14. Recommended next step.
