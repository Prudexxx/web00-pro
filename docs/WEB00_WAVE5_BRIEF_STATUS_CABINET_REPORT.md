# WEB00 Wave 5 Brief / Status / Cabinet Report

## 1. Executive summary

- `brief.html` закреплён как страница `Анкета на запуск сайта`.
- Анкета показывает четыре понятных шага: выбор, о бизнесе, материалы, проверка.
- Success state после отправки показывает номер проекта, статус `Анкета получена` и ссылку на `status.html?id=...`.
- `status.html` переведён на язык статуса проекта: номер проекта, следующий шаг, timeline, данные проекта, история и поддержка.
- Создан `cabinet.html` как frontend-only shell будущего раздела `Мой проект`.
- Backend, auth, API, PWA, платежи и реальные загрузки файлов не подключались.

## 2. Brief page

| Area | Change |
|---|---|
| Title | Публичное название: `Анкета на запуск сайта`. |
| Intro | Подзаголовок объясняет, что пользователь отвечает на вопросы, а WEB00 готовит сайт под бизнес. |
| Back link | При `?solution=...` ведёт назад в каталог, при `?tariff=...` — к тарифам. |
| Stepper | `1 Выбор`, `2 О бизнесе`, `3 Материалы`, `4 Проверка`. |
| Form | Добавлен блок выбранного сайта/тарифа/стоимости/срока; поля сгруппированы по смыслу. |
| Success | Показывает номер проекта, статус `Анкета получена`, следующий шаг и CTA `Проверить статус`. |

## 3. Status page

| Area | Change |
|---|---|
| Title/meta | `Статус проекта - WEB00 Pro`. |
| Missing id | Показывает lookup `Статус проекта` и поле `Номер проекта`. |
| Found state | Показывает статус проекта, текущий проект, следующий шаг, паспорт проекта, события и поддержку. |
| Not found | `Проект не найден`, recovery CTA и поддержка. |
| Cabinet link | В found-state добавлена ссылка `Открыть Мой проект` на `cabinet.html?id=...`. |
| Timeline | Этапы: анкета получена, проверяем материалы, сайт настраивается, проверка качества, согласование, готов к запуску, сайт запущен, поддержка после запуска. |

## 4. Cabinet shell

| Area | Change |
|---|---|
| Page | Создан `cabinet.html`. |
| H1 | `Мой проект`. |
| Purpose | Предварительный интерфейс будущего раздела проекта без обещаний реальной авторизации. |
| Project card | Название сайта, тариф, статус, дата запуска, менеджер, поддержка. |
| Progress | 5 этапов от анкеты до публикации. |
| Actions | Загрузить логотип, загрузить материалы, проверить демо, подтвердить запуск. |
| Support | Техническая поддержка, обновления, исправления, консультации. |
| Safety | Вход с подтверждением, безопасный доступ, будущие настройки безопасности. |

## 5. UX language cleanup

| Before | After | Where |
|---|---|---|
| Номер заявки | Номер проекта | success/status lookup/not-found |
| Статус заявки | Статус проекта | `status.html`, `main.js` |
| Заявка не найдена | Проект не найден | not-found state |
| Проверить статус заявки | Проверить статус | brief success |
| Выбранный шаблон | Выбранный сайт | brief summary |
| Форма заявки | Форма для обращений | brief/status generated UI |
| Контекст заявки | Контекст проекта | brief summary |

## 6. Mock vs real backend

Что сейчас mock/frontend-preview:

- localStorage storage mechanics;
- project status data;
- cabinet data;
- upload buttons;
- notifications;
- project messages/history.

Что позже backend:

- auth;
- real project data;
- files;
- messages;
- notifications;
- security settings.

## 7. Accessibility/form notes

- Поля имеют видимые `label`.
- Обязательные поля отмечены.
- Ошибки показываются рядом с полями.
- Stepper имеет `aria-label`.
- Success state содержит читаемый номер проекта и ссылку на статус.
- Lookup/not-found states используют понятные CTA и не зависят только от цвета.

## 8. Smoke result

Страницы:

- `brief.html`
- `status.html?id=WEB00-2026-0001`
- `cabinet.html`

Result: PASS

Проверено локально через static server + browser smoke:

- H1 корректные;
- console errors: 0;
- horizontal scroll: нет;
- публичных `Бриф/бриф`: нет;
- публичных backend/API/auth/localStorage/2FA/MFA: нет;
- brief submit → success → status works;
- status missing id works;
- status not-found works.

## 9. Next recommendation

Wave 6 — PWA / Install / Mobile Access.
