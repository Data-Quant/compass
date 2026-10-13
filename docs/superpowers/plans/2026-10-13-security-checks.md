# Security Checks Module — Implementation Plan

Source: `Compass-Security-Checks-Requirements.pdf` (§ numbers below refer to it).
Branch: `feat/security-checks`. Ships dark behind `SECURITY_CHECKS_ENABLED=true`.

## Architecture

- `lib/security-checks/` — pure domain logic (no Prisma imports) + `service/` (Prisma, transactions, audit).
- `app/api/security-checks/**` — thin route handlers: session → guard → zod → service → envelope.
- Cron entry points under `app/api/security-checks/cron/*`, authorised with `isCronAuthorized`.
- UI: employee page `/security-checks` (evaluator layout); console `/security-checks/console/*`
  (Security Admins + Console Admins; access enforced server-side on every endpoint).

## Roles (§2, §13)

| Role | Source |
|---|---|
| Security Admin | `User.role === 'SECURITY'` (granted in existing user management) |
| Console Admin | `SecurityConsoleGrant` row, granted/revoked by a Security Admin (logged) |
| Employee | any active user; sees own tasks only |

Platform HR has **no** implicit access — only through a Console Admin grant.

## Phases (one point at a time)

1. **Foundations** — schema + migration (§12), flag, access rules (§13), pure logic:
   timeline (§4), transitions (§6), roll-up (§6), evidence validation (§8), reminders (§7),
   recurrence (§3/§14), compliance % (§9). Unit tests for all of it.
2. **Campaigns** (§3) — CRUD, validation, activation, mid-cycle instruction edits, clone-as-new-version,
   audience resolution, cycle + task creation.
3. **Employee flow** (§5, §8, §10) — my tasks, drafts, employee subtasks, N/A requests,
   evidence upload/view/download/delete, submit/resubmit.
4. **Review** (§5, §10) — queue, per-subtask verdicts, approve-all, bulk verify, reopen,
   self-review guard, extensions, exemptions, task-level N/A, Console Admin grants.
5. **Scheduler** (§14) — cycle creator, enrollment sync, expiry & close, reminders, weekly digest,
   monthly self-review report, retention (disabled by default).
6. **Dashboards & audit** (§9) — per-campaign + company dashboards, 6-cycle trend, CSV export, audit log view.
7. **UI** — employee page, console pages, navigation.
8. **v1 campaign templates** (§11) — built-in templates an admin instantiates as drafts.

## Assumptions (spec gaps)

- Deadlines are end-of-day Asia/Karachi (same convention as KPI).
- A campaign with no subtasks gets one hidden `TASK` subtask, so answers/evidence/verdicts/roll-up
  share one code path; employees cannot request N/A on it (task-level N/A stays reviewer-granted).
- Questions apply to every subtask except the mandatory declaration subtask (checkbox only).
- Recurrence: fixed anchor → open dates `firstOpen + k × interval`; relative anchor →
  next open = previous scheduled close + interval.
- "Active employee" = payroll profile active and no past exit date (same as KPI scope).
- "Teams" in audience = `TeamTag`.
- Not Applicable and Cancelled are separate enum values; both are final and both are excluded from compliance %.
- Evidence-required subtasks need ≥1 non-deleted file (any round) unless N/A is requested.
- File count limit applies to files uploaded in the current (unsubmitted) round.
- Video link must be an https `drive.google.com` URL; if `SECURITY_CHECKS_DRIVE_FOLDER_ID` is set the
  link must point at that folder.
- In-app notifications = a module notification inbox on the Security Checks page + nav badge.
- Retention values are settings rows; the job ships disabled.
