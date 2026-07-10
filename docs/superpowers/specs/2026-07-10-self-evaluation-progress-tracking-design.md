# Self-Evaluation Progress Tracking Design

**Date:** 2026-07-10
**Module:** Self-Evaluation (admin console) — `SelfEvaluation`, `EvaluationPeriod`

## Goal

Give HR visibility, in the admin Self-Evaluation section, into who has completed their self-evaluation for a period and who has not — with the ability to read a submitted response and nudge people who are still pending.

## Background (verified against current code)

- The admin Self-Evaluation page (`app/(hr)/admin/self-evaluation/page.tsx`) has two tabs: **Questions** (question bank CRUD) and **Send to employees** (pick a period → select eligible people → create `SelfEvaluation` rows + email). After sending, the only feedback is "N self-evaluation(s) exist" — there is no view of who has actually completed theirs.
- `SelfEvaluation` (schema) already carries everything needed: `status` (`SelfEvaluationStatus` = `DRAFT | SUBMITTED`), `startedAt`, `submittedAt`, unique on `(periodId, employeeId)`, related `employee`. **No schema change is required.**
- `startedAt` is set on the first draft save (`app/api/self-evaluation/[periodId]/route.ts`: `startedAt: current.startedAt || new Date()`), so three progress states are real and distinguishable:
  - **Not started** — `DRAFT`, `startedAt` null (row created by trigger, never opened)
  - **In progress** — `DRAFT`, `startedAt` set (saved at least once, not submitted)
  - **Submitted** — `SUBMITTED`
- A read-only answers renderer already exists: `components/self-evaluation/SelfEvaluationAnswerView.tsx` (takes a `SelfEvaluationAnswer[]` snapshot). It will be reused for the inline "View" modal.
- The self-eval invite email exists: `sendSelfEvaluationInvite({ to, employeeName, periodName })` in `lib/email.ts`. It will be reused for reminders (its body — "Please complete your self-evaluation" — reads correctly as a nudge).
- The existing `POST /api/admin/reminders` route only covers **peer** evaluations (the `Evaluation` model), not self-evaluations. Self-eval reminders do not exist yet.
- Admin self-eval routes are gated by `isAdminRole` (HR only). The new routes match that.

## Resolved decisions

- **Placement:** a third tab, **Progress**, on the existing admin Self-Evaluation page (not folded into Send, not a dashboard widget).
- **Detail level:** summary counts + a per-person status list, with each submitted row openable to read that person's answers inline.
- **Reminders:** include a **Remind pending** action that emails everyone still pending (all `DRAFT` rows for the period).
- **Scope of the list:** only employees who were actually sent a self-evaluation (i.e. have a `SelfEvaluation` row for the period). Eligible-but-not-yet-sent people remain the concern of the Send tab.
- **No schema changes.**

## Components

### 1 — Pure status helper: `lib/self-evaluation-progress.ts`
DB/Prisma-free so it can be unit-tested in isolation.
- `type SelfEvaluationProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED'`
- `deriveProgressStatus(row: { status: 'DRAFT' | 'SUBMITTED'; startedAt: Date | null }): SelfEvaluationProgressStatus`
  - `SUBMITTED` → `SUBMITTED`; else `startedAt` set → `IN_PROGRESS`; else `NOT_STARTED`.
- `interface SelfEvaluationProgressSummary { sent: number; submitted: number; inProgress: number; notStarted: number }`
- `summarizeProgress(items: { progressStatus: SelfEvaluationProgressStatus }[]): SelfEvaluationProgressSummary`
- `SELF_EVAL_PROGRESS_LABELS` and a sort order (pending-first) for reuse by the UI.

### 2 — API routes (all `isAdminRole`)
**`GET /api/admin/self-evaluation/progress?periodId=`**
- Loads the period and its `SelfEvaluation` rows joined with `employee { id, name, department, position, role }`.
- Maps each row to `{ employeeId, name, position, department, role, progressStatus, submittedAt }` via `deriveProgressStatus`.
- Returns `{ period: { id, name }, summary, items }` where `summary = summarizeProgress(items)`. Items sorted pending-first (Not started, In progress, then Submitted), then by name, so HR sees who to chase at the top.
- 404 if the period does not exist.

**`GET /api/admin/self-evaluation/response?periodId=&employeeId=`**
- Fetches the one `SelfEvaluation` (unique `periodId_employeeId`) with `employee { name }`.
- If `status !== 'SUBMITTED'` → `{ status: 'NONE' }`. Otherwise `{ status: 'SUBMITTED', submittedAt, answers, employeeName }`.
- Lazy-loaded per "View" click so the progress list payload stays small.

**`POST /api/admin/self-evaluation/remind`** — body `{ periodId }`
- Finds all `SelfEvaluation` rows for the period with `status: 'DRAFT'`, joined to `employee { name, email }`.
- Emails each one that has an email via `sendSelfEvaluationInvite({ to, employeeName, periodName })`; counts failures without aborting the loop.
- Returns `{ reminded, skippedNoEmail, pending }`. No period flag is written (no schema change); the UI reports counts via toast and reloads progress.

### 3 — UI: `components/self-evaluation/SelfEvaluationProgressPanel.tsx`
Extracted into its own file so the admin page (already ~490 lines) stays lean. Receives the already-loaded `periods` list as a prop; keeps its own selected-period state defaulting to the active period.
- **Period selector** (same pattern as the Send tab).
- **Summary strip:** `N sent · ✅ submitted · ✍ in progress · ⚪ not started`, plus a progress bar (submitted / sent).
- **Filter chips:** All / Submitted / In progress / Not started (client-side filter over the loaded items).
- **Per-person list:** name, `position · department`, a status badge, and for submitted rows a relative "submitted 2d ago" and a **View** button.
- **View modal:** on click, lazy-fetches the response endpoint and renders `SelfEvaluationAnswerView` inside a `Modal`.
- **Remind pending** button: shows the pending count, disabled at 0; on click confirms, POSTs to the remind route, toasts `reminded/skipped`, and reloads progress.
- Empty state when the period has no self-evaluations sent.

Wired into `app/(hr)/admin/self-evaluation/page.tsx` as a third `TabsTrigger`/`TabsContent` (`value="progress"`), passing the page's `periods` down.

## Data flow

Open Progress tab → `GET progress` for the selected period → render summary + list. Click **View** on a submitted row → `GET response` → show answers in a modal. Click **Remind pending** → `POST remind` → emails all `DRAFT` recipients → toast → reload progress. Changing the period reloads progress for that period.

## Testing

- Unit tests (`node --import tsx --test`) for `lib/self-evaluation-progress.ts`:
  - `deriveProgressStatus` across all three states (submitted; draft+startedAt; draft+null).
  - `summarizeProgress` counts across a mixed list, including an all-submitted and an empty list.
- `npx tsc --noEmit` clean.
- Read-only verification against the live DB: for a real period, print the summary counts and a few rows to confirm the states resolve sensibly.

## Non-goals

- No schema changes; no new persisted "reminder sent" flag for self-evaluations.
- No per-person reminder selection — Remind pending nudges all pending at once.
- No reminders to eligible people who were never sent a self-evaluation (that is the Send tab's job).
- No editing or re-opening of submitted responses from the progress view (read-only).
- No CSV/export of progress (possible later).

## Build order (phases)

1. `lib/self-evaluation-progress.ts` helper + unit tests.
2. `GET /api/admin/self-evaluation/progress` endpoint.
3. `GET /api/admin/self-evaluation/response` endpoint.
4. `POST /api/admin/self-evaluation/remind` endpoint (reuses `sendSelfEvaluationInvite`).
5. `SelfEvaluationProgressPanel` component + View modal + Remind action.
6. Wire the Progress tab into the admin Self-Evaluation page.
