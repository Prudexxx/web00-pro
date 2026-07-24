# WEB00 Component Inventory

Дата: 2026-07-03  
Назначение: единый список компонентов WEB00 Pro 2.0.

## 1. Header

Назначение: глобальная навигация и primary CTA.  
Где используется: все public/core страницы.  
Состояния: desktop, mobile closed, mobile open, active page, focus.  
Данные: nav items, CTA URL, active page.  
Accessibility: `aria-expanded`, `aria-controls`, visible focus, keyboard close.

## 2. Footer

Назначение: legal/meta/navigation bottom.  
Где используется: все public/core страницы.  
Состояния: desktop, mobile, language trigger.  
Данные: legal links, contacts link, public signature.  
Accessibility: links readable, language trigger button, no hidden critical info.

## 3. CatalogCard

Назначение: показать готовый сайт в каталоге.  
Где используется: `solutions.html`, home preview.  
Состояния: default, hover, focused, selected for compare, no demo, loading image.  
Данные: id, title, description, category, price, launch time, tags, preview, demoUrl.  
Accessibility: whole-card click must not trap buttons; buttons need labels.

## 4. FilterPanel

Назначение: фильтрация каталога.  
Где используется: catalog.  
Состояния: active filter, inactive, mobile stacked, empty result.  
Данные: category list, selected filters.  
Accessibility: buttons with pressed/current state.

## 5. CompareDrawer

Назначение: сравнение 2-3 сайтов.  
Где используется: future catalog.  
Состояния: empty, 1 selected, 2 selected, 3 selected, open drawer, mobile full-screen.  
Данные: selected solution ids, comparison fields.  
Accessibility: keyboard open/close, focus trap if modal drawer.

## 6. SitePreviewModal

Назначение: живой предпросмотр сайта внутри WEB00.  
Где используется: catalog/detail/home demo.  
Состояния: iframe loading, loaded, failed, external fallback, desktop/mobile preview mode.  
Данные: solution title, demoUrl, externalDemoUrl.  
Accessibility: modal label, ESC close, focus trap, fallback link.

## 7. PricingCard

Назначение: показать тариф Start/Business/Pro.  
Где используется: `pricing.html`, home pricing preview.  
Состояния: default, recommended, selected, focus.  
Данные: title, price, note, tag, features.  
Accessibility: CTA text unique, no color-only recommended state.

## 8. PricingTable

Назначение: сравнить тарифы.  
Где используется: pricing.  
Состояния: desktop table, mobile horizontal scroll, compact summary.  
Данные: rows/features/tariff columns.  
Accessibility: semantic table preferred, readable column headers.

## 9. BriefStepper

Назначение: провести пользователя по анкете.  
Где используется: `brief.html`.  
Состояния: step active, completed, error, disabled next.  
Данные: current step, validation state.  
Accessibility: step labels, error summaries, keyboard movement.

## 10. SummaryPanel

Назначение: показать выбранный сайт/тариф/стоимость/срок.  
Где используется: brief, detail, pricing context.  
Состояния: no context, solution context, tariff context, calculator context.  
Данные: solution, tariff, estimate, launch time.  
Accessibility: summary should not be only visual; text readable on mobile.

## 11. UploadBox

Назначение: загрузка логотипа/фото/материалов.  
Где используется: future brief/cabinet.  
Состояния: empty, dragover, uploading, uploaded, error, disabled.  
Данные: file name, size, type, upload id.  
Accessibility: native input fallback, file type instructions.

## 12. SuccessProjectNumber

Назначение: подтверждение отправки анкеты.  
Где используется: brief success.  
Состояния: success, copy id, status link.  
Данные: project id, createdAt, next step.  
Accessibility: project id selectable/copyable.

## 13. StatusTimeline

Назначение: показать этап проекта.  
Где используется: `status.html`, future cabinet.  
Состояния: current, completed, future, blocked, needs user action.  
Данные: status code, label, date, description.  
Accessibility: ordered list, current step announced.

## 14. CabinetProjectCard

Назначение: краткая карточка проекта в кабинете.  
Где используется: future cabinet/app.  
Состояния: active, waiting, launched, support.  
Данные: project id, title, status, selected solution, tariff.  
Accessibility: clear link/action.

## 15. NotificationCard

Назначение: показать уведомление/событие.  
Где используется: future status/cabinet/PWA.  
Состояния: unread, read, urgent, info.  
Данные: title, body, date, action URL.  
Accessibility: not color-only priority.

## 16. InstallQRBlock

Назначение: предложить установить PWA/открыть статус на телефоне.  
Где используется: success/status/contacts/install.  
Состояния: QR visible, copy link, installed, unsupported.  
Данные: install URL, QR image/data.  
Accessibility: URL text fallback.

## 17. ErrorReportForm

Назначение: сообщить об ошибке без превращения в публичный CTA.  
Где используется: footer/help/status/cabinet later.  
Состояния: hidden entry, form open, success, validation error.  
Данные: page URL, message, contact optional.  
Accessibility: clear labels.

## 18. ContactCard

Назначение: контактный канал или help block.  
Где используется: contacts, status, FAQ.  
Состояния: Telegram/VK/MAX/phone/email, unavailable.  
Данные: label, href, description.  
Accessibility: link purpose clear.

## 19. Toast

Назначение: короткая обратная связь.  
Где используется: forms, copy project id, errors.  
Состояния: success, error, info, warning.  
Данные: message, timeout.  
Accessibility: `aria-live`.

## 20. Modal

Назначение: общий слой поверх страницы.  
Где используется: detail, demo, lead/contact, language.  
Состояния: open, closing, scrollable, mobile full-screen.  
Данные: title, content, actions.  
Accessibility: `role="dialog"`, label, ESC close, focus trap.

## 21. FormField

Назначение: единый input/select/textarea/radio/checkbox.  
Где используется: brief, contacts, status lookup, future cabinet.  
Состояния: default, focus, filled, error, disabled, required.  
Данные: name, value, validation, help text.  
Accessibility: label, describedby, error message.

## 22. Button

Назначение: единый action element.  
Где используется: везде.  
Состояния: primary, secondary, ghost, danger-hidden, disabled, loading, focus.  
Данные: label, href/action, icon optional.  
Accessibility: visible text, touch target, no icon-only without label.

## 23. Badge

Назначение: короткая метка статуса/категории.  
Где используется: cards, pricing, status, quality.  
Состояния: neutral, accent, success, warning, muted.  
Данные: label, type.  
Accessibility: not color-only.

## 24. QualityPassport

Назначение: доказать проверку качества человеческими словами.  
Где используется: home, detail, status/cabinet.  
Состояния: compact, full, loading, unavailable.  
Публичные labels:

- Быстро загружается
- Готов к продвижению
- Удобен на телефоне
- Проверен перед запуском
- Поддержка после запуска

Внутренние данные:

- performance score;
- SEO checks;
- accessibility checks;
- mobile-ready;
- launch time.

