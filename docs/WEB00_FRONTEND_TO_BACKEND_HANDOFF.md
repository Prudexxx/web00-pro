# WEB00 Frontend to Backend Handoff

## 1. Current Frontend Provides

The local frontend provides a complete static product preview for WEB00 Pro 2.0:

- responsive marketing/public pages;
- homepage and catalog entry points;
- ready-site catalog cards and demo viewer;
- pricing selection;
- project questionnaire UI;
- local success/status flow;
- project cabinet/status preview;
- contacts/support/error-report frontend UI;
- install/app frontend shell;
- public legal pages;
- localStorage-oriented preview behavior where backend is not yet available.

## 2. Forms That Need Backend

The following frontend forms need backend persistence and validation:

- project questionnaire on `brief.html`;
- pricing-to-questionnaire context submission;
- catalog solution-to-questionnaire context submission;
- contacts/support form on `contacts.html`;
- status lookup form;
- future admin update forms.

Backend must provide:

- server-side validation;
- spam/rate limiting;
- persistent lead storage;
- status record creation;
- user-safe error messages;
- audit log for admin actions;
- email/Telegram/notification hooks only after explicit approval.

## 3. Status and Cabinet Contracts

Frontend currently expects status/cabinet data shaped around:

- project/lead id;
- client/project summary;
- selected solution or pricing context;
- current status label;
- timeline/history events;
- next action;
- support/contact block;
- frontend-preview/localStorage fallback.

Backend should formalize this as:

- `Lead`
- `ProjectStatus`
- `StatusEvent`
- `ProjectSelection`
- `ClientContact`
- `AdminNote` where internal-only notes are never rendered publicly unless intentionally exposed.

Do not introduce claims of real authorization, real manager assignment, real payment, or real backend state in public UI unless that backend behavior exists.

## 4. Support and Error Report Contracts

Support/error-report frontend should be connected as a secondary support workflow, not as a public bug-report CTA.

Required backend fields:

- contact name;
- contact method;
- topic/type;
- message;
- page/source URL;
- optional file metadata;
- consent flag where required;
- created timestamp;
- processing status;
- admin response/status.

File upload must initially store metadata safely and only accept files after backend security gates are in place.

## 5. Upload and File Future

Future upload handling should include:

- size limits;
- MIME/type allowlist;
- antivirus/malware scan strategy;
- private storage, not public web root;
- signed download links for admin;
- retention policy;
- no base64 blob storage in frontend/localStorage.

## 6. Admin Panel Needs

Admin MVP should provide:

- lead list;
- lead detail;
- status update controls;
- timeline/event editor;
- contact/support request list;
- response/status controls;
- basic filtering/search;
- role-protected access;
- audit log;
- export only after permission review.

## 7. Frontend Stability Rules

Do not change these frontend areas without product reason:

- public language gate terms;
- responsive Matryoshka hero composition;
- no public bug-report CTA emphasis;
- footer signature;
- mobile navigation behavior;
- pricing route/query semantics;
- questionnaire route/query semantics;
- status id URL contract;
- static shell layer order and design tokens.

## 8. Handoff Verdict

`Backend/Admin handoff is ready from the local frontend side.`

