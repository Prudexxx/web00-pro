# WEB00 Next Phase Backend / Admin Roadmap

## Objective

Turn WEB00 Pro 2.0 Frontend Public RC1 into an operational product with real submissions, project tracking, support handling, uploads, and an admin panel.

## Backend scope

- Save launch questionnaire submissions.
- Save and manage project/status records.
- Save support messages.
- Save error reports.
- Support controlled uploads.
- Provide admin dashboard.
- Provide status updates.
- Prepare future notification and CRM integration.

## Stack options

### Option A: Supabase

Pros:

- Fast MVP.
- PostgreSQL included.
- Auth and storage available.
- Good admin/data tooling.

Cons:

- Vendor dependency.
- Need RLS discipline.

### Option B: Node + PostgreSQL

Pros:

- Full control.
- Clear upgrade path.
- Easier custom business logic.

Cons:

- More setup and operations work.

### Option C: Firebase

Pros:

- Fast realtime/status flows.
- Auth/storage available.

Cons:

- NoSQL data modeling tradeoffs.
- Vendor lock-in.

### Option D: Serverless functions

Pros:

- Small deployment footprint.
- Good for form capture MVP.

Cons:

- Admin/status management still needs persistence and tooling.

## Data model draft

### `projects`

- `id`
- `public_id`
- `status`
- `selected_solution`
- `selected_tariff`
- `price_estimate`
- `launch_estimate`
- `owner_name`
- `contact`
- `created_at`
- `updated_at`

### `submissions`

- `id`
- `project_id`
- `industry`
- `business_name`
- `offer_description`
- `style_preferences`
- `examples`
- `domain_needed`
- `lead_capture_needed`
- `blog_needed`
- `comment`
- `created_at`

### `support_messages`

- `id`
- `project_id`
- `name`
- `contact`
- `topic`
- `message`
- `status`
- `created_at`

### `error_reports`

- `id`
- `project_id`
- `page_url`
- `description`
- `browser_info`
- `file_name`
- `status`
- `created_at`

### `status_events`

- `id`
- `project_id`
- `status_from`
- `status_to`
- `comment`
- `created_by`
- `created_at`

### `uploaded_files`

- `id`
- `project_id`
- `kind`
- `file_name`
- `mime_type`
- `size_bytes`
- `storage_path`
- `created_at`

## Admin panel draft

- Login
- Projects list
- Project detail
- Submission detail
- Status editor
- Support inbox
- Error reports inbox
- File review
- Export/download
- Audit log

## Security baseline

- Admin authentication.
- Least privilege access model.
- Rate limiting on public submissions.
- Honeypot and timing checks for public forms.
- Upload validation by MIME, extension, and size.
- Malware scanning if upload scope grows.
- Server-side validation for all fields.
- Audit log for admin actions.
- Backup/export procedure.
- Privacy-aware data retention policy.

## Backend MVP waves

### B0 — backend decision

Choose stack, hosting, database, storage, auth approach.

### B1 — project submissions

Persist launch questionnaire submissions and return project ID.

### B2 — status API

Read project status by public ID with safe public fields only.

### B3 — admin auth

Protected admin login and session handling.

### B4 — admin projects

List/search/filter projects and open project detail.

### B5 — status management

Admin can update project stage, notes, and history.

### B6 — support/error reports

Persist and manage support messages and error reports.

### B7 — uploads

Controlled file uploads for logos, photos, screenshots, and project materials.

### B8 — hardening

Rate limits, audit log, backup/export, privacy review, final monitoring.

## Non-goals for first backend wave

- Payments.
- Heavy CRM.
- Native mobile app.
- Marketplace.
- Multi-tenant billing.
- Complex automation builder.

## Recommended first implementation

Start with B0/B1/B2: choose backend stack, persist questionnaire submissions, and make status page read real project data by public ID. This gives WEB00 its first real operational loop without overbuilding.
