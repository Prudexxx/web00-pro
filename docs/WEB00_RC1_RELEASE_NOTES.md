# WEB00 RC1 Release Notes

## Summary

WEB00 Pro 2.0 Frontend Public RC1 is live and accepted as the frontend release-candidate boundary.

Live URL:

https://kattta222-cmd.github.io/web00-pro/

Commit:

`840adbfea17fa38fb608638136dc11975ac4d1a1`

## Included

- Light premium WEB00 visual foundation
- Shared tokens/base/shell/components CSS layers
- Public website pages
- Catalog and pricing flows
- Launch questionnaire UI
- Status/cabinet frontend preview
- Support/error-report frontend entry points
- PWA/install shell
- Manifest/icons/service worker
- Language gate patch
- QAMax RC1 evidence

## Pages

- `index.html`
- `solutions.html`
- `pricing.html`
- `brief.html`
- `status.html`
- `cabinet.html`
- `install.html`
- `app.html`
- `contacts.html`
- `faq.html`
- `services.html`
- `how-it-works.html`
- `cases.html`
- `privacy-policy.html`
- `consent-personal-data.html`

## Main flows

- Home to catalog
- Catalog to launch questionnaire
- Pricing to launch questionnaire
- Launch questionnaire frontend flow
- Status/cabinet frontend preview
- Contacts/support/error-report frontend flow
- App/install entry point

## PWA / install

- `manifest.webmanifest`
- `sw.js`
- PNG icons and maskable icon
- `install.html`
- `app.html`

This is a web-app install shell, not a native mobile app release.

## Support / error report

Frontend support/error-report entry points exist. Real persistence, moderation, routing, and admin handling require backend implementation.

## Quality checks

- QAMax RC1: `RC1_ACCEPTED`
- P0 blockers: 0
- P1 issues: 0
- Live pages checked: 9
- Live language gate: clean
- GitHub Pages build: built from accepted commit

## Known limitations

- Backend is not connected.
- Admin panel is not implemented.
- Authentication is not implemented.
- Payments are not implemented.
- Real upload storage is not implemented.
- Real support/status storage is not implemented.
- Push notifications are not implemented.
- Final legal/analytics/custom domain remain future decisions.

## Next phase

Start Backend/Admin MVP using the accepted frontend RC1 as the public contract.
