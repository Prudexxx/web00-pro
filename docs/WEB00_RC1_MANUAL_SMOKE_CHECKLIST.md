# WEB00 RC1 Manual Smoke Checklist

## Desktop

- Open `index.html`.
- Open `solutions.html`.
- Open `pricing.html`.
- Open `brief.html`.
- Open `status.html?id=WEB00-2026-0001`.
- Open `cabinet.html`.
- Open `install.html`.
- Open `app.html`.
- Open `contacts.html`.
- Open `faq.html`.
- Confirm header/footer are stable.
- Confirm no obvious horizontal scroll.
- Confirm primary CTAs are visible.

## Tablet

- Check portrait and landscape.
- Confirm navigation remains usable.
- Confirm cards do not overlap.
- Confirm pricing and comparison sections remain readable.
- Confirm brief/status/cabinet layouts are not broken.

## Mobile

- Check 360px, 390px, 412px widths.
- Confirm burger menu opens/closes.
- Confirm footer wraps cleanly.
- Confirm cards stack correctly.
- Confirm forms are readable and tappable.
- Confirm no horizontal scroll.

## Core flows

- Home CTA to launch questionnaire.
- Catalog card to detail/demo/launch questionnaire.
- Pricing card to launch questionnaire.
- Questionnaire submit to success.
- Success link to status page.
- Status found/missing/not-found states.
- Cabinet shell opens without backend/auth promise.

## Forms

- Brief/questionnaire required fields.
- Support message form.
- Error report form.
- Status lookup.
- FAQ accordion/filter.
- Contacts status lookup.

## PWA install shell

- `manifest.webmanifest` loads.
- `sw.js` registers.
- `install.html` explains install flow without APK promise.
- `app.html` opens as a lightweight shell.
- Icons display correctly.

## Support/error report

- Contacts page shows support center.
- Support message success shows `WEB00-MSG-*`.
- Error report success shows `WEB00-ERR-*`.
- File input accepts only image formats.
- File content is not stored locally.
- Honeypot and formStartTime fields exist.

## Acceptance table

| Area | Expected | Result |
|---|---|---|
| Pages | Required pages open | To verify |
| Header/footer | Stable and premium | To verify |
| CTA flow | Routes to questionnaire/status | To verify |
| Forms | Validate and show safe success | To verify |
| PWA | Manifest/SW/icons available | To verify |
| Support/error | Humanized and frontend-safe | To verify |
| Console | No visible errors | To verify |
| Horizontal scroll | None on normal viewports | To verify |
