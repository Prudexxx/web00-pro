# WEB00 Backend/Admin Phase 0 Start Plan

## 1. Phase B0 Objective

Create a minimal, secure backend/admin foundation for WEB00 Pro 2.0 without disturbing the accepted local frontend.

Phase B0 should turn the frontend preview into an operational MVP for:

- receiving project questionnaires;
- storing leads;
- showing status records;
- managing project status from admin;
- handling contact/support requests;
- preserving frontend public language and visual behavior.

## 2. Backend MVP Scope

Included in first backend wave:

- API for questionnaire submit;
- API for status lookup;
- API for contacts/support submit;
- admin authentication;
- admin lead list/detail;
- admin status update;
- admin support request list/detail;
- persistent database;
- server-side validation;
- rate limiting and basic abuse protection;
- audit logging for admin actions.

Excluded from first backend wave:

- payments;
- native mobile app;
- RuStore/App Store distribution;
- complex CRM automation;
- public user accounts with full auth cabinet;
- file upload beyond metadata unless security gates are approved;
- notifications until delivery channel and privacy rules are approved.

## 3. Stack Decision Options

### Option A: Node.js Backend

- Runtime: Node.js
- Framework: Fastify or Express
- Database: PostgreSQL or SQLite for local MVP
- Admin: server-rendered admin or protected static admin shell

Pros:

- close to existing frontend tooling;
- quick API prototyping;
- simple deployment paths.

Cons:

- requires disciplined validation/security setup;
- admin auth must be implemented carefully.

### Option B: Python Backend

- Runtime: Python
- Framework: FastAPI
- Database: PostgreSQL or SQLite for local MVP
- Admin: simple protected admin routes

Pros:

- strong validation with Pydantic;
- clear API contracts;
- good docs generation.

Cons:

- separate stack from current frontend scripts;
- deployment decisions needed.

## 4. Recommended Backend Architecture

Recommended Phase B0 architecture:

- API-first backend with a small protected admin;
- PostgreSQL for production target;
- SQLite acceptable for local prototype only;
- strict DTO validation;
- no secret values committed;
- environment config outside repo;
- static frontend remains decoupled;
- admin and public APIs separated by route namespace.

Suggested route groups:

- `POST /api/leads`
- `GET /api/status/:id`
- `POST /api/support-requests`
- `POST /admin/login`
- `GET /admin/leads`
- `GET /admin/leads/:id`
- `PATCH /admin/leads/:id/status`
- `GET /admin/support-requests`
- `PATCH /admin/support-requests/:id`

## 5. Data Model Draft

### Lead

- id
- public_id
- client_name
- contact_phone
- contact_email
- company
- project_type
- selected_solution
- selected_tariff
- message
- consent_accepted
- source_page
- created_at
- updated_at

### ProjectStatus

- id
- lead_id
- public_status
- internal_status
- next_action
- visible_to_client
- updated_at

### StatusEvent

- id
- lead_id
- title
- description
- event_type
- visible_to_client
- created_at

### SupportRequest

- id
- name
- contact
- topic
- message
- source_url
- file_name
- file_size
- status
- created_at

### AdminUser

- id
- email
- password_hash
- role
- active
- created_at

### AuditLog

- id
- actor_admin_id
- action
- entity_type
- entity_id
- before_json
- after_json
- created_at

## 6. Admin Screens

Phase B0 admin screens:

- login;
- dashboard summary;
- leads list;
- lead detail;
- status/timeline editor;
- support requests list;
- support request detail;
- settings/minimal profile;
- audit log view.

## 7. Security Gates

Before backend goes public:

- no secrets in repo;
- CSRF/session or token strategy selected;
- password hashing;
- admin route protection;
- rate limiting;
- server-side validation;
- input escaping/sanitization;
- CORS policy;
- file upload disabled or gated;
- audit log enabled for status/admin changes;
- backup/export policy documented.

## 8. Explicit Non-Goals for First Backend Wave

- No payments.
- No native app.
- No RuStore work.
- No real public client authorization claims until auth exists.
- No unrestricted file uploads.
- No admin bulk destructive actions.
- No manual deploy as part of Phase B0 planning.

## 9. Phase B0 Start Verdict

`Backend/Admin Phase 0 is ready to start after owner approval.`

