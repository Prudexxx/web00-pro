# WEB00 Screen Flow Map

Дата: 2026-07-03  
Назначение: карта экранов, переходов и пользовательских сценариев WEB00 Pro 2.0.

## 1. Главный Flow

```text
Home → Catalog → Template detail → Demo → Brief → Success → Status → Cabinet/PWA later
```

Альтернативные входы:

```text
Pricing → Brief → Success → Status
FAQ/Contacts → Question modal / Brief
Status direct link → Project status
```

## 2. Главная

Страница: `index.html`

Переходы:

| Действие | Куда ведёт | Цель |
|---|---|---|
| Смотреть каталог | `solutions.html` / later `catalog.html` | показать готовые сайты |
| Подобрать сайт | каталог/подбор later | помочь выбрать |
| Выбрать тариф | `pricing.html` | сравнить условия |
| Заполнить анкету | `brief.html` | начать запуск |
| Смотреть демо | demo modal / catalog demo | доказать качество |

Не должно быть:

- регистрации до ценности;
- QR в hero;
- backend-терминов;
- длинной простыни без выбора.

## 3. Каталог

Страница: `solutions.html` сейчас, possible `catalog.html` later.

Состояния:

1. Все решения
2. Отфильтрованный список
3. Карточка сайта
4. Detail modal
5. Demo modal
6. Compare later
7. Подбор later

Переходы:

| Действие | Куда ведёт |
|---|---|
| Фильтр | обновляет grid |
| Клик по карточке | template detail modal |
| Смотреть демо | preview modal |
| Запустить | `brief.html?solution=<id>` |
| Сравнить | compare drawer later |
| Не знаете, что выбрать? | подбор / brief with help context |

## 4. Карточка сайта

Screen type: modal/detail or future page.

Содержит:

- preview;
- название;
- кому подходит;
- цена;
- срок;
- что входит;
- паспорт качества;
- демо;
- запустить.

Переходы:

- `Смотреть демо` -> Demo
- `Запустить этот сайт` -> `brief.html?solution=<id>`
- close -> catalog grid

## 5. Предпросмотр сайта

Screen type: modal with iframe.

Содержит:

- title;
- `Открыть отдельно`;
- `Запустить`;
- iframe/live preview;
- close.

Переходы:

- `Открыть отдельно` -> external demo in new/current tab policy
- `Запустить` -> `brief.html?solution=<id>`
- close -> previous context

Mobile rule:

- preview must not feel broken inside phone;
- desktop preview mode should be considered.

## 6. Анкета

Страница: `brief.html`

Шаги:

1. Выбор сайта и тарифа
2. О бизнесе
3. Материалы
4. Проверка и отправка

Переходы:

```text
brief.html?solution=<id> → step 1 prefilled
brief.html?tariff=<tariff> → step 1 prefilled
brief.html?service=<service> → service context
```

После submit:

```text
Success screen → status.html?id=<projectId>
```

Ошибки:

- empty required fields -> validation message
- no consent -> blocked submit
- invalid context -> continue without context, show neutral summary

## 7. Success / Project Number

Screen type: success state inside brief flow.

Содержит:

- номер проекта;
- что будет дальше;
- CTA `Проверить статус`;
- optional PWA/QR later.

Переход:

- `Проверить статус` -> `status.html?id=<projectId>`

## 8. Статус проекта

Страница: `status.html`

Состояния:

| State | Условие | Что показывать |
|---|---|---|
| Missing id | нет `id` | lookup form |
| Found | id найден | dashboard/status |
| Not found | id не найден | recovery/help |

Found state:

- номер проекта;
- статус;
- следующий шаг;
- timeline;
- данные проекта;
- выбранный сайт/тариф;
- история;
- связь.

Переходы:

- загрузить материалы later;
- задать вопрос;
- установить на телефон later;
- вернуться в каталог.

## 9. Кабинет

Будущие страницы: `cabinet.html`, `app.html`.

Переходы:

```text
Status → Cabinet
Install/PWA → App shell → Cabinet
Notification → Cabinet/Status
```

Разделы:

- Проект
- Материалы
- Сообщения
- Уведомления
- Паспорт качества
- Поддержка
- Безопасность

## 10. PWA

Будущие страницы:

- `install.html`
- `app.html`

Flow:

```text
Status/Success/Contacts → QR/install block → install.html → app.html/cabinet.html
```

Правила:

- PWA before APK;
- QR не в hero;
- PWA для быстрого статуса, не для нового продукта отдельно.

## 11. Forward Navigation

Рекомендуемый forward path:

```text
Home
→ Catalog
→ Pricing
→ How it works
→ Cases
→ FAQ
→ Contacts
→ Brief
→ Status
```

На каждом шаге:

- header stable;
- active state correct;
- footer stable;
- no horizontal scroll;
- CTA ведёт в core loop.

## 12. Reverse Navigation

Reverse path:

```text
Status
→ Brief
→ Contacts
→ FAQ
→ Cases
→ How it works
→ Pricing
→ Catalog
→ Home
```

Цель проверки:

- back/forward browser state не ломает формы/модалки;
- status id сохраняется в URL;
- catalog filters не обязаны сохраняться, но не должны ломать страницу.

