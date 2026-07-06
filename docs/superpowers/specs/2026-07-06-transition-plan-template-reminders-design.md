# Leave Transition Plan — Structured Template + Reminders & HR Escalation

**Date:** 2026-07-06
**Status:** Approved for implementation
**Author:** Engineering (with Ammar)

## 1. Summary

Two integrated changes to the leave module:

1. **Structured transition-plan template.** Replace the single free-text `transitionPlan`
   box with a **form-only** structured template: an auto-derived header plus a repeatable
   task table (Task Details, Project/Dept, Assigned To, Accepted Y/N, Deadline, Completed
   Y/N + variance, Relevant Links/Comments). The applicant fills the whole thing; there is
   **no separate assignee login/acceptance workflow** in v1. The plan has an explicit
   **Submit** action, and the team lead is notified and may **disapprove** it.

2. **Reminders → deadline → HR escalation.** Enhance the existing daily cron so it keys off
   "plan not submitted" rather than "text blank," states a **deadline of 3 days before the
   leave's first day**, and — if the plan is still unsubmitted at that deadline — emails
   **HR an escalation**. **No auto-cancellation** (policy B): HR decides and cancels via the
   existing flow.

### Reuses (do not rebuild)
- Daily Vercel cron in `vercel.json` → `/api/leave/transition-plan-reminders` (runs
  `0 4 * * *`, ~09:00 Asia/Karachi).
- `sendTransitionPlanReminderNotification` and the `TRANSITION_PLAN_REMINDER` audit event
  (`lib/email.ts`, `lib/leave-audit.ts`).
- Existing HR cancel path: `restoreUnstartedLeaveBalance` (`lib/leave-balance.ts`),
  `removeLeaveCalendarEvent` (`lib/google-calendar.ts`), `sendLeaveCancellationNotification`
  (`lib/email.ts`), `leaveHasStarted` (`lib/leave-utils.ts`).
- The leave create/edit forms and the `PUT /api/leave/requests` edit route
  (`app/(evaluator)/leave/page.tsx`, `app/api/leave/requests/route.ts`).

## 2. Data model

Add to `LeaveRequest` (`prisma/schema.prisma`). The existing `transitionPlan` String column
is retained as-is (still required at the DB level, may be an empty string) and repurposed as
an optional free-text "general notes" field — no nullability change.

```prisma
enum LeaveTransitionPlanLeadStatus {
  PENDING
  APPROVED
  DISAPPROVED
}

model LeaveRequest {
  // ... existing fields ...
  transitionPlanTasks          Json?                          // array of task rows (see §3)
  transitionPlanSubmittedAt    DateTime?                      // the "done" signal
  transitionPlanLeadStatus     LeaveTransitionPlanLeadStatus  @default(PENDING)
  transitionPlanLeadReviewedAt DateTime?
  transitionPlanLeadReviewedById String?
  transitionPlanDisapprovalReason String?
  hrRepresentative             String?                        // header field, optional free text
}
```

Add `LeaveAuditEventType` values: `TRANSITION_PLAN_SUBMITTED`, `TRANSITION_PLAN_DISAPPROVED`,
`TRANSITION_PLAN_ESCALATION` (Postgres `ALTER TYPE ... ADD VALUE`). Reminders keep using
`TRANSITION_PLAN_REMINDER`.

A leave counts as **submitted** ⟺ `transitionPlanSubmittedAt != null`.

## 3. Task row shape & validation

Stored as a JSON array on `transitionPlanTasks`; validated with Zod in a shared
`lib/leave-transition-plan.ts`:

```ts
type TransitionTask = {
  taskDetails: string          // required (non-empty row)
  projectDept: string          // optional
  assignedTo: string           // optional, free text (v1)
  accepted: boolean | null     // Task Accepted by Assignee (Y/N)
  deadline: string | null      // ISO date, optional
  completed: boolean | null    // Task Completed (Y/N)
  variance: string             // explanation if completed=false / variance
  links: string                // Relevant Links / Comments
}
```

Bounds (prevent JSON bloat): ≤ 50 rows; `taskDetails` ≤ 2 000 chars; other text fields
≤ 2 000. Empty rows (no `taskDetails`) are dropped on save. **Submit requires ≥ 1 row with
non-empty `taskDetails`.**

## 4. Applicant experience

- The leave create/edit form's "Transition Plan" textarea is replaced by:
  - **Header** (read-only, auto): Leave Applicant (employee), Duration (from dates), Team
    Lead (the employee's team lead — reuse the leave module's existing lead resolution;
    fall back to the `TEAM_LEAD` evaluator mapping), Approved-by-Lead status; optional
    editable HR Representative.
  - **Task table**: add/remove rows with the §3 columns.
- Plan remains **optional at leave creation**; the applicant can submit the leave first and
  fill/submit the plan later via edit.
- A **"Submit transition plan"** action sets `transitionPlanSubmittedAt`, resets
  `transitionPlanLeadStatus` to `PENDING`, and emails the team lead (§5). Editing after
  submit is allowed; re-submitting re-notifies the lead.

## 5. Team lead experience

- On submit → `sendTransitionPlanSubmittedNotification(requestId)` emails the derived team
  lead: "\<name\> submitted their transition plan for \<dates\> — review," with a link to
  the leave view. Audit: `TRANSITION_PLAN_SUBMITTED`.
- On the leave view (`app/(evaluator)/leave/page.tsx`, lead/approver context) the lead sees
  the read-only task table and can **Disapprove (with reason)** →
  `POST /api/leave/requests/[id]/transition-plan/review` sets
  `transitionPlanLeadStatus = DISAPPROVED` + reason, emails the applicant to revise
  (`sendTransitionPlanDisapprovedNotification`), audit `TRANSITION_PLAN_DISAPPROVED`.
  Approve sets `APPROVED`. **Neither gates "done"** — approval is advisory (per decision).
- This is **separate** from the lead's existing *leave* approval; it does not change leave
  status.

## 6. Reminders → deadline → HR escalation

Enhance `runTransitionPlanReminders` in `app/api/leave/transition-plan-reminders/route.ts`
and add pure date logic to `lib/leave-transition-plan.ts` (unit-testable):

- **Candidate leaves:** `status ∈ {PENDING, LEAD_APPROVED, HR_APPROVED, APPROVED}`,
  `startDate >= today`, `transitionPlanSubmittedAt == null`.
- **Applicant reminder:** for candidates with `daysUntilStart <= REMINDER_WINDOW` (default
  **5**), send the daily reminder email stating the deadline ("submit by \<deadline date\>,
  3 days before your leave"). One send per daily run (cron is daily).
- **Deadline = `startDate − 3 days`.** When `daysUntilStart <= 3` (at/after the deadline) and
  still unsubmitted → **HR escalation** once per request: `sendTransitionPlanEscalation` to
  HR recipients, audit `TRANSITION_PLAN_ESCALATION`. Dedupe by checking whether a
  `TRANSITION_PLAN_ESCALATION` audit event already exists for the request (so HR is not
  emailed daily). Applicant reminders continue until start or submission.
- **No auto-cancel.** HR reviews and cancels through the existing DELETE/cancel flow.
- Keep `daysBeforeStart`/`dryRun` params and the cron-secret/admin auth already in the route.

## 7. HR experience

- Escalation email lists the affected employee + leave dates + a link.
- The admin leave view (`app/(hr)/admin/leave/page.tsx`) flags leaves whose plan is missing
  or `DISAPPROVED`; HR cancels there via the existing flow (restores balance if the leave
  hasn't started, removes the calendar invite, notifies all parties).

## 8. Non-goals (v1)

- No assignee login/acceptance workflow; assignees are free-text and the applicant records
  Accepted/Completed themselves.
- No auto-cancellation (policy B).
- Lead approval is not required for a plan to count as submitted.
- "Assigned To" is free text (not a user picker) and Project/Dept is not linked to the
  Projects module.

## 9. Edge cases

- **Short-notice leave** (submitted with `daysUntilStart < 3`): already past the deadline →
  reminder + immediate HR escalation on the next daily run; still no auto-cancel.
- **Disapprove → revise**: applicant edits and re-submits; status returns to `PENDING`, lead
  re-notified.
- **Plan submitted then leave cancelled/rejected**: reminders/escalation skip non-active
  statuses (existing guard).
- **Legacy leaves** with old free-text `transitionPlan` and no tasks: treated as *not*
  submitted unless `transitionPlanSubmittedAt` is set; a data backfill may mark historical
  completed leaves as submitted to avoid noise (one-time, in the migration or a script).
- **No team lead mapped**: submit still succeeds; lead email is skipped and audited SKIPPED.

## 10. Testing

- **Unit** (`lib/leave-transition-plan.ts`): task validation/normalization (drop empty rows,
  bounds, ≥1 task to submit); deadline math and the reminder-vs-escalate decision given
  `startDate`, `today`, submitted state, and prior-escalation flag.
- **Integration**: submit endpoint (sets timestamp, emails lead, PENDING); review endpoint
  (approve/disapprove, authz = the evaluatee's team lead); reminder route (retargets to
  unsubmitted, escalates once, dryRun).
- Run with `node --import tsx --test` and `npx tsc --noEmit`.

## 11. Deploy notes

- Migration adds columns + the enum values + new audit event types; applies automatically on
  the next Vercel deploy (`build` = `prisma migrate deploy && next build`). The shared Neon
  prod DB is what local `.env` points at — do not run `migrate deploy` manually.
- No new cron needed; the existing daily cron drives reminders and escalation.
