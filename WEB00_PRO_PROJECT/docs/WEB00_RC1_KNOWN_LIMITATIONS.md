# WEB00 RC1 Known Limitations

## Backend

Backend is not implemented. Forms, support messages, error reports, status and cabinet data are frontend-preview/localStorage behavior.

## Auth

No real authorization, account login, roles, sessions, password reset, 2FA or MFA exist yet. Cabinet is a frontend shell, not a real authenticated account.

## Payments

No real payment processing exists. Pricing CTAs route to the launch questionnaire only.

## PWA

PWA shell exists with manifest, icons, service worker, install page and app shell. Push notifications and offline business workflows are not implemented.

## Uploads

Real file upload is not implemented. Error report file input validates image type/size on the frontend, but does not upload file content. Only the file name is kept as metadata.

## CSS debt

The CSS architecture is improved but not final:

- `styles.css` remains a transitional dependency.
- `legacy.css` remains a quarantine layer.
- `home-premium.css` remains a mixed/fallback layer.
- `web00-tabs-standard.css` remains a patch layer.
- Header/footer markup is still duplicated manually across pages.

## Browser/device testing

Wave 8 did not run full browser/device QA. Local static HTTP smoke was run, but no QAMax, no Lighthouse, no Playwright, no real-device iOS/macOS Safari matrix.

## QAMax

QAMax was not run by prompt restriction. It should be run after the RC commit boundary and before backend work is treated as accepted.

## SEO/final deploy

Final SEO, analytics, production deployment, DNS, server headers, sitemap/robots review and search preview checks are not complete in RC1.
