# Holiday Calendar Invites and Transition-Plan Deadline Design

**Date:** 2026-08-11
**Modules:** Public holidays (`lib/holidays.ts`, `app/api/payroll/public-holidays/`), Leave transition plans (`lib/leave-transition-plan.ts`, `app/api/leave/transition-plan-reminders/`), Google Calendar (`lib/google-calendar.ts`)

## Goal

Two independent changes to how the portal notifies people about time off:

1. **Public holidays get calendar invites.** Today a holiday produces only an email, and only in the monthly digest — so a holiday entered in January for June is invisible until 1 June. Create a real all-day calendar invite for every holiday, sent when HR saves it.
2. **Long leaves get a transition-plan deadline with teeth.** For leaves longer than 2 working days, notify the applicant 7 days before the leave starts, and auto-cancel the request if no transition plan is attached within 2 days of that notice.

## Background (verified against current code, 2026-08-11)

### Holidays

- `PayrollPublicHoliday` (`prisma/schema.prisma:1241`) holds `holidayDate`, `name`, `teamTags`, unique on `[holidayDate, name]`.
- `lib/holidays.ts` owns team resolution: `teamsObserving`, `holidayAppliesTo`, `groupHolidaysByTeam`. An **empty `teamTags` means company-wide** (`isUntaggedHoliday`), preserved for holidays created before tagging existed.
- `sendMonthlyPublicHolidayDigest` (`lib/email.ts:1655`) emails one digest per team for the current month, CC'd to HR + Partners + Execution via `getHolidayCcEmails()`. Driven by the cron at `vercel.json` → `/api/payroll/public-holidays/reminders`, `30 5 1 * *`.
- `app/api/payroll/public-holidays/route.ts` exposes POST / PATCH / DELETE for HR.
- **There is no calendar integration for holidays at all.** This is the genuine gap.
- A working Google Calendar integration exists for leave (`lib/google-calendar.ts:571`): OAuth refresh-token flow, a single company calendar (`GOOGLE_CALENDAR_ID`, default `primary`), idempotent event lookup via `extendedProperties.private`, `sendUpdates: 'all'`, and duplicate cleanup. Its transport helpers (`getCalendarConfig`, `getAccessToken`, `googleCalendarRequest`, `buildEventsUrl`, find-by-extended-property) are private to that module.

### Leave transition plans

- A reminder system already exists and is live. Cron `vercel.json` → `/api/leave/transition-plan-reminders`, `0 4 * * *`.
- `classifyTransitionReminder` (`lib/leave-transition-plan.ts:76`) reminds the applicant daily from **5 days** before start when `transitionPlanSubmittedAt` is null, and escalates to HR **once** at **3 days**.
- It applies to leaves of **any length** and **never cancels anything**.
- Escalation is gated on a `LeaveAuditEvent` row with `eventType = TRANSITION_PLAN_ESCALATION` **and `status = SUCCESS`** (`app/api/leave/transition-plan-reminders/route.ts:56`) — a failed send is retried next run rather than silently swallowed.
- Cancellation machinery exists and is used by both HR disapproval (`app/api/leave/approve/route.ts:104`) and self-cancel (`app/api/leave/requests/route.ts:851`): `restoreUnstartedLeaveBalance` in a transaction, status → `CANCELLED`, `removeLeaveCalendarEvent`, `sendLeaveCancellationNotification`.
- `restoreUnstartedLeaveBalance` (`lib/leave-balance.ts:18`) restores days **only** when the leave has not started; days for a started leave are treated as availed.
- `sendLeaveCancellationNotification` (`lib/email.ts:790`) already reaches the employee, HR, the `LEAVE_FALLBACK_RECIPIENTS` list, team leads (via `EvaluatorMapping` `TEAM_LEAD`) and cover people.
- `calculateLeaveDuration` (`lib/leave-utils.ts:52`) returns **working days** (weekends excluded), or `0.5` for a half-day.
- `LeaveAuditChannel` has only `EMAIL` and `CALENDAR`. `rejectedBy` stores a **user id**.

## Resolved decisions

| Decision | Choice |
|---|---|
| Holiday invite timing | On save, plus a monthly reconciliation sweep |
| Holiday invite delivery | Attendee invites on the company calendar, same mechanism as leave |
| Leaves ≤ 2 days | Existing behaviour untouched — 5-day reminders, 3-day HR escalation, never cancelled |
| Leave booked with under 7 days' notice | Notify on the next run, compress the deadline (clamped to the day before the leave) |
| Cancellation safeguards | Final warning the day before, then cancel and notify employee, lead, HR and cover people |

---

## Part 1 — Holiday calendar invites

### Shared transport extraction

Holidays need the same four transport helpers leave already has. Extract them into **`lib/google-calendar-client.ts`**:

- `getCalendarConfig()`, `getAccessToken(config)`, `googleCalendarRequest(...)`, `buildEventsUrl(...)`
- `findEventIdsByPrivateProperty(config, accessToken, key, value)` — generalised from `findLeaveEventIds`
- `GOOGLE_CALENDAR_ENV_WARNING`

`lib/google-calendar.ts` then imports these instead of defining them. This is a pure move: **no behaviour change to leave**, verified by the existing `tests/google-calendar.test.ts` continuing to pass unchanged.

### New module `lib/holiday-calendar.ts`

Mirrors the shape of the leave module so the two read alike.

**`buildHolidayEventPayload({ holiday, attendeeEmails })`** — pure, unit-testable, the counterpart of `buildLeaveEventPayload`:

- All-day event: `start.date` = holiday date (UTC date-only), `end.date` = the following day (Google's all-day end is exclusive).
- `summary`: `Public Holiday — {name}`
- `description`: the holiday name and the observing teams, using `TEAM_LABELS` from `lib/handbook/teams.ts`.
- `extendedProperties.private.holidayId` — the idempotency key.
- `guestsCanSeeOtherGuests: false` and `guestsCanInviteOthers: false`, so a 60-person invite does not expose a guest list or invite RSVP chatter.

**`syncHolidayCalendarEvent(holidayId)`** — resolve attendees, look up existing events by `privateExtendedProperty=holidayId={id}`, PATCH the first or POST a new one with `sendUpdates: 'all'`, delete any duplicates. Same self-healing structure as `syncLeaveCalendarEvent`.

**`removeHolidayCalendarEvent(holidayId)`** — delete all matching events with `sendUpdates: 'all'` so attendees receive the cancellation.

### Attendee resolution

Derived from `lib/holidays.ts`, so the invite audience and the email audience cannot drift:

1. `teamsObserving(holiday, ALL_TEAMS)` → observing teams (empty `teamTags` still resolves to every team).
2. Users carrying those team tags with a non-null email.
3. Plus `getHolidayCcEmails()` — HR, Partners, Execution — the same list the digest CCs.

Deduplicated and lowercased, matching how `collectLeaveAttendeeEmails` builds its set.

### Triggers

**On save** — `app/api/payroll/public-holidays/route.ts`:

- POST → `syncHolidayCalendarEvent` after create
- PATCH → `syncHolidayCalendarEvent` after update (a changed date moves the event; changed `teamTags` re-computes attendees, and removed attendees get a cancellation from Google)
- DELETE → `removeHolidayCalendarEvent` **before** the row is deleted. Removal only needs the `holidayId`, so ordering is not a correctness requirement — but removing first means a Google failure leaves the holiday row intact and the next sweep can still reconcile it, whereas deleting first would strand the event with nothing left to find it by

Each wrapped in catch-and-log, exactly as the leave routes treat calendar failures. **A Google outage must never fail HR's save.**

**Monthly sweep** — `/api/payroll/public-holidays/reminders` gains a reconciliation pass over every holiday from today through +12 months, running before the digest send. No new cron entry. Idempotent via the `holidayId` extended property, and it honours the existing `dryRun` flag so HR can preview.

The sweep reconciles in **both directions**. Iterating holiday rows alone would never repair a failed DELETE: the row is gone, so nothing points at the stranded event. So the sweep also lists calendar events in the horizon carrying a `holidayId` private property and cancels any whose holiday no longer exists. Without this, one failed deletion leaves a phantom public holiday on every attendee's calendar permanently.

### Deliberately not built

An audit table for holiday calendar syncs. `LeaveAuditEvent` is FK'd to `leaveRequest` and cannot be reused, and the monthly sweep already self-heals — a new table would record precisely what the sweep makes irrelevant. Failures log through the existing `warnCalendarSkip` pattern.

The digest email is unchanged.

---

## Part 2 — Transition-plan deadline and auto-cancellation

### Scope

A leave qualifies for the new ladder when `calculateLeaveDuration(startDate, endDate, isHalfDay) > 2` — more than 2 **working** days, i.e. 3 or more. Half-days return `0.5` and never qualify.

Leaves of 2 days or less keep today's behaviour exactly: 5-day daily reminders, one HR escalation at 3 days, never auto-cancelled.

### The ladder

| When | Leave > 2 working days | Leave ≤ 2 days |
|---|---|---|
| 7 days before start (or the first cron run after submission, whichever is later) | **Notice** — attach your plan by *{deadline}* or this request is cancelled | — |
| Day before deadline | **Final warning** to employee, cc lead + HR | — |
| Deadline passed, still unsubmitted | **Auto-cancel** | — |
| 5 days before start | *(already resolved)* | Daily reminder *(unchanged)* |
| 3 days before start | *(already resolved)* | HR escalation, once *(unchanged)* |

"Submitted" means `transitionPlanSubmittedAt` is set — the same signal the current reminder uses, not the optional free-text `transitionPlan` notes. Lead approval of the plan (`transitionPlanLeadStatus`) is **out of scope**: a submitted-then-disapproved plan does not restart the clock.

### Deadline derivation

The deadline is computed from the notice that actually went out, never from an assumed date:

```
noticeDate = createdAt of the TRANSITION_PLAN_NOTICE audit row with status SUCCESS
deadline   = min(noticeDate + 2 days, startDate − 1 day)
```

Three load-bearing consequences:

- **No notice, no cancellation.** A failed send writes a `FAILED` row, so no deadline exists and the request survives to be retried on the next run. Same fail-safe direction as the existing HR escalation gate.
- **Late bookings compress.** Booked 4 days out: notice on the next run, deadline clamped to the day before the leave. Booked 1 day out: the clamp lands *before* the notice date, producing a zero or negative window — **no auto-cancel**, falling back to reminders and HR escalation only.
- **Nothing in flight is cancelled without notice.** Because the clock starts at a notice row, leave already approved when this ships gets its notice on the next run and a full window from there. No migration or backfill is needed for this property to hold.

When the window is a single day (`deadline − 1 <= noticeDate`), the final warning would collide with the notice; in that case no separate final warning is sent and the notice itself carries the warning language.

### Cancellation mechanics

Reuses the existing path rather than introducing a second one:

1. Transaction: `restoreUnstartedLeaveBalance(tx, leaveRequest)` when the status was `APPROVED` (no balance was deducted for `PENDING` / `LEAD_APPROVED` / `HR_APPROVED`), then update status → `CANCELLED` with `rejectionReason` set to the automated reason and `rejectedBy` left **null** — it is a user-id column and there is no acting user.
2. `removeLeaveCalendarEvent(requestId)`, catch-and-log.
3. `sendLeaveCancellationNotification(requestId, 'P21 Compass (automatic)', reason)` — its recipient set already covers employee, HR, fallback list, team leads and cover people.
4. Write a `TRANSITION_PLAN_AUTO_CANCELLED` audit row on channel `SYSTEM`.

The `leaveHasStarted` guard is retained as a backstop even though the `startDate − 1` clamp should make it unreachable.

**Reinstatement** is re-applying. The balance is restored, so nothing blocks a fresh request. No new reinstatement flow.

### Idempotency

Every rung is gated on a `SUCCESS` audit row for its event type, mirroring how `alreadyEscalated` works today. A re-run of the cron — manual or retried — cannot double-notify or double-cancel.

### Code layout

Pure decision logic joins `classifyTransitionReminder` in **`lib/leave-transition-plan.ts`**, which keeps its current behaviour and is now reached only for short leaves:

- `qualifiesForTransitionPlanDeadline({ startDate, endDate, isHalfDay })` → boolean
- `transitionPlanDeadline({ noticeDate, startDate })` → `Date | null` (null when the window is zero or negative)
- `classifyTransitionPlanAction({ startDate, submitted, noticeSentAt, finalWarningSentAt, now })` → `{ action: 'none' | 'notice' | 'final_warning' | 'cancel', deadline: Date | null }`

`app/api/leave/transition-plan-reminders/route.ts` branches on duration: qualifying leaves run the new ladder, the rest run the existing `classifyTransitionReminder` path. The cron entry and its `0 4 * * *` schedule are unchanged. `dryRun` is extended to report which requests **would** be cancelled — this is the verification tool for the live rollout.

Two new emails in `lib/email.ts`: `sendTransitionPlanDeadlineNotice(requestId, deadline)` and `sendTransitionPlanFinalWarning(requestId, deadline)`, both following the structure of `sendTransitionPlanReminderNotification` (guard on active status and unsubmitted plan, `safeRecordLeaveAuditEvent` on success and failure).

### Schema changes

Additive only, no data migration:

```prisma
enum LeaveAuditEventType {
  ...
  TRANSITION_PLAN_NOTICE
  TRANSITION_PLAN_FINAL_WARNING
  TRANSITION_PLAN_AUTO_CANCELLED
}

enum LeaveAuditChannel {
  EMAIL
  CALENDAR
  SYSTEM
}
```

---

## Testing

Following the repo's existing pattern — pure functions unit-tested with `node:test`, no database in tests.

**`tests/leave-transition-plan.test.ts`** (extend): table-driven cases for `qualifiesForTransitionPlanDeadline` (2 vs 3 working days, weekend-spanning ranges, half-days), `transitionPlanDeadline` (normal 7-day window, compressed late booking, zero-width and negative windows), and `classifyTransitionPlanAction` across the full ladder with a fixed `now` — including that a submitted plan silences every rung and that an already-cancelled request produces `none`.

**`tests/holidays.test.ts`** (extend) or a new `tests/holiday-calendar.test.ts`: `buildHolidayEventPayload` — exclusive all-day end date, the `holidayId` extended property, guest-visibility flags, and attendee resolution for a tagged holiday versus an untagged company-wide one.

**`tests/google-calendar.test.ts`**: must pass unchanged, which is what proves the transport extraction was behaviour-neutral.

## Rollout

1. Ship with the leave ladder verified via `dryRun` against live data for one cycle before letting it cancel anything — the dry run reports the exact request ids it would cancel.
2. Holiday invites are safe to enable immediately: the monthly sweep is idempotent, and the first run backfills every holiday in the next 12 months.
3. `GOOGLE_CALENDAR_*` env vars are already configured for leave; holidays need no new configuration.

## Out of scope

- Requiring a transition plan at submission time for short-notice leaves (considered, rejected — changes the request UX beyond what was asked).
- Any change to lead review / approval of transition plans.
- Reinstating an auto-cancelled leave in place.
- An audit table for holiday calendar syncs.
