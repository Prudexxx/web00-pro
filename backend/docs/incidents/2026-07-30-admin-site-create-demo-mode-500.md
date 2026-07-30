# Incident: admin site create demo mode 500

Date: 2026-07-30

Production timestamp: exact time was not provided in the handoff.

## Summary

An admin attempt to create a new site card through `POST /api/admin/sites`
returned `HTTP 500`.

## Evidence

- requestId: `req_5b5870c0-2b87-473f-abdb-ef860a7cb8a`
- route: `POST /api/admin/sites`
- HTTP status: `500`
- create stage: `SITE_INSERT_STARTED`
- error class: `DriverAdapterError`
- prismaCode: `null`
- transactionCallbackCompleted: `false`
- created site row: absent
- created audit row: absent

## Confirmed Product Root Cause

The admin backend/UI contract allowed `demoMode` values that were rejected by
the database constraint `sites_demo_mode_check`.

The database allows only:

- `NULL`
- `none`
- `external-iframe`

Before the hotfix, arbitrary `demoMode` strings could pass request validation
and reach `tx.site.create`. PostgreSQL then rejected the insert, and the
request surfaced as a safe but unhelpful `INTERNAL_ERROR`.

## Pavel Payload Status

The exact `demoMode` value and full payload submitted by Pavel are unknown.
No payload is included or inferred in this incident note.

## Safety Notes

- No secrets are included.
- No credentials are included.
- No request payload is included.
- The database constraint remains the final defensive layer.
