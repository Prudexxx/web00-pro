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

Секция `Изображения — необязательно` доступна прямо в форме создания:

- Preview файл
- Alt для preview
- Gallery файлы
- Alt для gallery

Лимиты: JPG, PNG, WEBP, AVIF; 5 MB на файл; gallery batch до 10 файлов и до
30 MB; gallery максимум 20 изображений.

Если файлы выбраны до сохранения, основной flow остаётся одним действием:

`Сохранить карточку` -> create site -> upload preview -> upload gallery.

Файлы не входят в JSON payload карточки. Они читаются отдельно из File inputs и
отправляются multipart-запросами только после успешного create.

После успешного создания черновика форма больше не остаётся в режиме create.
Пользователь видит следующий шаг:

- `Перейти к изображениям`
- `К списку`

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
`web00_admin_site_form_draft_v1`. Draft включает fields, mode, siteId,
updatedAt и stable `clientRequestId` create-операции. Access tokens, cookies,
auth state, passwords, JWT, Authorization headers and other secrets must never
be stored.

Dirty draft writes happen both on the normal 1-second debounce and immediately
on `visibilitychange` to hidden, `pagehide`, browser offline, and internal
cancel/back while dirty.

If unsaved data is found after reload or accidental navigation, the admin UI
shows:

`Найдены несохранённые данные. Восстановить?`

Available actions:

- `Восстановить`
- `Удалить черновик`

After a successful server save, the local draft for the form is removed. After a
failed save or expired auth, the local draft remains.

File/Blob data and local file paths are never stored. After full reload, text can
be restored but files must be reselected. The UI says:

`Текст восстановлен. Изображения выберите повторно.`

## Network Failure Model

Create uses one stable `X-Request-Id` for the logical operation. After a
`NETWORK_ERROR` or `REQUEST_TIMEOUT`, the form stays on screen and the UI:

1. preserves form data and selected in-memory files;
2. checks backend readiness;
3. retries create exactly once with the same `X-Request-Id`;
4. if needed, verifies by exact slug:

`GET /api/admin/sites?search=<slug>&deleted=without`

If the exact slug is found, the save is treated as successful and the saved
record is opened. If the slug is not found, the UI says:

`Сервер не ответил. Запись не найдена. Можно повторить.`

Retries are not performed for validation errors, auth failures, forbidden
responses, duplicate slug, reused idempotency key, or ordinary backend 500.

## Partial Image Failure

Site create and image upload are a recoverable saga, not one database/storage
transaction. If site create succeeds but preview/gallery upload fails, the UI
does not call the card save failed. It says:

`Карточка сохранена. Часть изображений не загрузилась.`

It keeps the saved site ID, counts successful/failed images, shows requestId
when available, and provides:

- `Повторить загрузку изображений`
- `Открыть изображения`
- `К списку`

Retry uploads only failed/not-completed images and never repeats create POST.

## Backend Readiness

Admin boot and save flow check backend readiness through `/api/ready`.
Readiness runs before auth bootstrap. During cold start the UI says:

`Backend просыпается, подождите...`

The Render plan is not changed. Optional keep-warm pings are allowed only while
the authenticated admin tab is visible and online; they must stop on logout or
tab close and must not run from a service worker.

All admin requests have finite client-side timeouts: JSON GET 25 seconds, JSON
mutation 45 seconds, readiness attempt 15 seconds, readiness total 90 seconds,
multipart upload 120 seconds.

## Publish Safety

Публикация остаётся lifecycle-действием из списка сайтов. Если backend требует
preview перед публикацией, UI показывает человеческий текст:

`Перед публикацией добавьте preview-изображение.`
