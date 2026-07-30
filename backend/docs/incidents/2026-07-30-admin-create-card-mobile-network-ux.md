# Incident: admin create card mobile network UX

Date: 2026-07-30

## Summary

Creating a site card from a phone exposed reliability and usability gaps in the
admin form. The first save attempt returned the UI/network error
`Unable to reach the server`. A search by slug showed that the record was not
created. A second, minimal attempt created a draft successfully.

## Product Problem

The failure was not only a network incident. The form did not provide save
recovery, did not verify whether a network-failed save had actually created a
record, and exposed backend-shaped fields to a human admin.

Technical fields currently exposed to the normal create/edit flow include:

- `slug`
- `priceAmountCents`
- multiple URL fields
- `previewType`
- `demoMode`

The workaround of saving a minimal card first and editing it later is not an
acceptable permanent workflow. A card should be created through one reliable
form without forcing the user to understand backend field names or split the
card into multiple fragile saves.

## Owner Expectation

- One reliable create/edit form.
- Human labels and human units.
- No data loss after a failed save, reload, mobile back, 4G/VPN instability, or
  auth expiry.
- No duplicate blind submit after a network failure.
- Automatic verification by slug after a failed network save.
- Backend complexity hidden behind advanced settings.

## Safety Notes

- No passwords are included.
- No tokens or cookies are included.
- No IP addresses are included.
- No private request payload is included.
- The existing live test draft `magazin-odezhdy-test-20260730` is referenced
  only as production context and must not be deleted or published by this task.
