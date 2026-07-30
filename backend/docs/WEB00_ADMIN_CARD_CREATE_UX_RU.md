# WEB00 Admin Card Create UX

## Цель

Создание и редактирование карточки сайта должно быть одним понятным и
надёжным процессом. Администратор вводит человеческие данные, а админка сама
переводит их в backend contract: slug, копейки, demo URL mapping и технические
поля.

## Основной Режим Формы

### 1. Основное

- Название сайта
- Категория
- Короткое описание
- Полное описание

Адрес карточки создаётся автоматически из названия. Обычный пользователь не
должен думать о slug.

### 2. Демо

- Есть демо?
  - Без демо
  - Внешнее демо
- Ссылка на демо показывается только если выбрано `Внешнее демо`.

В обычном режиме есть только одна ссылка на демо. Внутреннее распределение по
`demoUrl`, `externalDemoUrl` и `originalDemoUrl` делает админка.

### 3. Каталог

- Особенности
- Теги

### 4. Коммерция

- Цена, ₽
- Подпись цены
- Срок разработки, дней
- Текст срока

Цена вводится в рублях. Backend по-прежнему получает `priceAmountCents`.

### 5. Изображения

- Preview
- Gallery

Upload может оставаться отдельным экраном, если текущая архитектура требует
отдельного image manager после создания карточки.

### 6. Расширенные Настройки

Секция свернута по умолчанию и нужна только для технической правки:

- Адрес карточки / slug
- `previewType`
- `sortOrder`
- `legacyTitle`
- `siteUrl`
- `demoUrl`
- `demoLocalUrl`
- `externalDemoUrl`
- `originalDemoUrl`

Текст рядом с адресом карточки: `Создаётся автоматически. Менять обычно не
нужно.` Рядом доступна команда `Сгенерировать заново`.

## Save Recovery

Форма автосохраняет только текущие поля карточки в локальный draft с ключом
`web00_admin_site_form_draft_v1`. Access tokens, cookies, auth state and other
secrets must never be stored.

If unsaved data is found after reload or accidental navigation, the admin UI
shows:

`Найдены несохранённые данные. Восстановить?`

Available actions:

- `Восстановить`
- `Удалить черновик`

After a successful server save, the local draft for the form is removed. After a
failed save or expired auth, the local draft remains.

## Network Failure Model

After a network failure or request timeout the form stays on screen. The UI does
not perform a blind repeated POST. It verifies by slug:

`GET /api/admin/sites?search=<slug>&deleted=without`

If the exact slug is found, the save is treated as successful and the saved
record is opened. If the slug is not found, the UI says:

`Сервер не ответил. Запись не найдена. Можно повторить.`

## Backend Readiness

Admin boot and save flow check backend readiness through `/api/ready` or
`/api/health`. During cold start the UI says:

`Backend просыпается, подождите...`

The Render plan is not changed. Optional keep-warm pings are allowed only while
the authenticated admin tab is visible and online; they must stop on logout or
tab close and must not run from a service worker.
