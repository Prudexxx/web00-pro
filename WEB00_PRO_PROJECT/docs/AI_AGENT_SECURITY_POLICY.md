# AI Agent Security Policy

This policy defines the safe operating boundary for AI agents working on WEB00 Pro.

## Forbidden Actions

Agents must not perform these actions without explicit owner approval:

- commit, push, deploy, publish, or release;
- delete, rename, move, or mass-format existing files;
- install dependencies or configure external services;
- modify backend/API/auth/payment behavior;
- change JavaScript behavior;
- replace images, icons, design assets, or generated media;
- create public bug-report buttons, CTAs, forms, or links;
- read secret-like files or credential material.

## Secrets Policy

Forbidden to read or print:

- `.env`, `.env.*`;
- files or folders containing `secret`, `token`, `credential`, `private-key`, `apikey`, or similar names;
- private keys, passwords, cookies, session dumps, credential exports, or local browser profiles.

If a task appears to require secrets, stop and ask the owner for a safe alternative. Never infer, expose, copy, or transform secrets.

## Network And API Policy

- No paid API usage by default.
- No external API calls for product behavior unless explicitly approved.
- Browsing or network checks must be limited to QA/research needs and reported.
- Do not send repo content, screenshots, secrets, or private data to third-party services without approval.

## Commit, Push, And Deploy Policy

- No commit, push, deploy, release, or Pages update without explicit owner approval.
- Before any approved commit, report the exact staged files.
- Do not stage `_qa/`, `_review/`, prompt packs, local screenshots, logs, archives, or generated evidence unless the owner explicitly requests it.

## Backend And API Policy

WEB00 Pro is currently a static frontend/localStorage preview. Agents must not:

- connect real backend services directly from DOM handlers;
- add API keys or secrets to frontend files;
- mix mock localStorage behavior with real API behavior without an approved adapter and feature flag;
- promise real auth, account, payment, or project-status behavior before backend implementation is approved.

## Public Bug-Report Policy

Final public release must not expose a public bug-report button, CTA, form, or link. Any existing bug-report UI should be treated as technical debt and removed only in an approved frontend task with visual QA.

## Owner Approval Matrix

| Action | Default | Approval Required |
|---|---|---|
| Read safe docs/config/frontend files | Allowed | No |
| Read secret-like files | Forbidden | Do not do it |
| Create/edit AI foundation docs and skills | Allowed only when scoped | Yes if outside explicit task |
| HTML/CSS frontend edits | Hold | Yes |
| JavaScript edits | Hold | Yes |
| Backend/API edits | Hold | Yes |
| Image/asset changes | Hold | Yes |
| QA smoke using local static server | Allowed when scoped | No, if read-only output only |
| Dependency install | Forbidden | Yes |
| Commit/push/deploy/delete/rename | Forbidden | Yes |
