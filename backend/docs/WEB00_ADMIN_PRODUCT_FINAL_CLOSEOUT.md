# WEB00 Admin Product-Final Closeout

## 1. Final UX Model

Admin create/edit is now built around a human workflow instead of backend field
names.

Primary create/edit sections:

- `Основное`: title, category, short description, full description.
- `Демо`: `Есть демо?` select and one `Ссылка на демо`.
- `Каталог`: features and tags.
- `Коммерция`: `Цена, ₽`, price label, development days, delivery label.
- `Расширенные настройки`: collapsed by default for address/slug and technical
  fields.

The form autogenerates `Адрес карточки` from `Название сайта`. Manual address
editing is available only inside advanced settings. Price is entered in rubles,
while the backend still receives cents.

After a successful create, the UI shows a next-step screen with
`Перейти к изображениям` and `К списку`, so the user does not accidentally
repeat the create POST.

## 2. Reliability Mechanisms

Autosave/recovery:

- The form writes a local draft while the user edits.
- The draft stores form fields only.
- Secret-like field names are filtered.
- Successful server save clears the draft.
- Failed save, network failure, auth expiry, reload, or back navigation keeps
  recovery available.

Save state machine:

- submit is guarded by a busy flag;
- save button is disabled while mutation is active;
- UI state moves through validation, readiness, saving, saved, or failure
  states;
- validation errors stay next to fields.

Verify-by-slug:

- A create request that fails with network/timeout is not blindly repeated.
- The UI checks `GET /api/admin/sites?search=<slug>&deleted=without`.
- Only an exact slug match is treated as a successful save.
- If no exact match is found, the form remains available for manual retry.

Double-submit protection:

- Double click/second submit while saving is ignored.
- Successful create replaces the form with next-step actions to avoid a second
  POST with the same payload.

Readiness/cold start:

- Admin boot and save flow use `/api/ready`.
- Cold start copy is visible: `Backend просыпается, подождите...`.
- Keep-warm pings are limited to authenticated visible online admin tabs.
- Keep-warm stops on logout/destroy and does not run from a service worker.

Safe errors/requestId:

- Unknown server errors expose controlled UI text and requestId.
- requestId can be copied for diagnostics.
- Raw Prisma/SQL details are not surfaced to the admin UI.

## 3. Backend Hardening

demoMode:

- Only `none`, `external-iframe`, empty-to-null, or null are accepted.
- Invalid demo modes return field validation before service mutation.

URL http/https:

- Admin URL fields must be syntactically valid URLs.
- Only `http:` and `https:` protocols are accepted.
- `javascript:` URLs are rejected before service mutation.

int32 limits:

- Integer-backed fields are bounded before they can reach PostgreSQL integer
  overflow.
- Price entered in rubles is converted client-side to cents and bounded.

Slug conflict:

- Duplicate slug returns a controlled conflict.
- UI shows a field-level `Адрес карточки уже занят` hint with a timestamped
  suggestion.

No raw Prisma/SQL:

- Duplicate key and unknown database failures are mapped to safe API errors.
- Observability tests verify that raw database details and private site payload
  fields are not leaked.

## 4. Render Free Known Constraints

Render Free cold start cannot be fully removed without changing the tariff.

This PR does not change:

- Render plan;
- Render environment variables;
- Render start command;
- production deploy settings.

The intended product behavior is that the admin UI survives cold start and
mobile network instability: it waits for readiness, preserves form data, and
does not create duplicates after ambiguous network failures.

## 5. Owner QAmax Checklist

Desktop admin login:

- Log in from desktop browser.
- Confirm admin shell loads after readiness.
- Confirm no secret values are shown in UI.

Mobile Samsung Internet:

- Open admin on Samsung Internet.
- Confirm form sections fit without horizontal overflow.
- Confirm sticky save actions remain reachable.
- Confirm advanced settings are collapsed by default.

Create card one save:

- Create a new test draft with a Russian title.
- Confirm `Адрес карточки` is generated automatically.
- Enter price in rubles.
- Use `Внешнее демо` with one demo URL.
- Save once.
- Confirm next-step actions appear.

Refresh/back recovery:

- Start a draft, enter data, reload or go back.
- Confirm recovery banner appears.
- Restore and confirm fields return.
- Save and confirm recovery clears.

Invalid URL:

- Enter a `javascript:` URL in demo or advanced URL field.
- Confirm field validation blocks save.
- Confirm no server 500 is shown.

Duplicate address:

- Open advanced settings and force an existing address.
- Save.
- Confirm inline address conflict appears with a human suggestion.

Price validation:

- Try zero, negative, too many decimals, and an overly large price.
- Confirm each error stays next to `Цена, ₽`.

Image upload:

- After create, click `Перейти к изображениям`.
- Add preview.
- Add gallery image.
- Trigger an upload validation error and confirm the image screen is not
  cleared.

Publish:

- Try to publish without preview and confirm the human preview-required text.
- Add preview and publish only the owner-approved test card.
- Confirm public catalog shows the expected card after deploy/approval.

Public catalog check:

- Open public catalog after deploy.
- Confirm only intended published cards appear.
- Confirm deleted or draft cards are not shown.

Unpublish:

- Unpublish the owner-approved test card.
- Confirm it returns to draft and disappears from public catalog after refresh.

Delete/restore/permanent delete:

- Use only the owner-approved test card.
- Soft delete.
- Filter `Только удалённые`.
- Restore.
- Permanent delete only after separate owner confirmation.
