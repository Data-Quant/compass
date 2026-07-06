# Leave Transition Plan Template + Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text leave transition plan with a structured, form-only task template (with team-lead notify/disapprove), and enhance the existing daily cron to remind by a 3-days-before deadline and escalate still-unsubmitted plans to HR (no auto-cancel).

**Architecture:** Structured tasks stored as JSON on `LeaveRequest` plus lifecycle fields. A shared `lib/leave-transition-plan.ts` owns task validation and the pure reminder-vs-escalate date logic (unit-tested). New email functions mirror `lib/email.ts` patterns. Dedicated API routes handle save/submit/lead-review. The existing `/api/leave/transition-plan-reminders` cron is retargeted from "text blank" to "not submitted" and gains HR escalation.

**Tech Stack:** Next.js App Router, React (client), TypeScript, Prisma + PostgreSQL, Zod, nodemailer, `node:test` + tsx.

## Global Constraints

- **"Submitted" ⟺ `transitionPlanSubmittedAt != null`.** Lead approval is advisory and never gates submitted (per decision B).
- **Deadline = `startDate − 3 days`.** Reminder window default = 5 days before start. No auto-cancellation; at the deadline HR is emailed once.
- Form-only: assignees are free text; no assignee login/acceptance workflow.
- API auth via `getSession()`; admin via `isAdminRole` (HR only). Response shape: `NextResponse.json(data)` / `NextResponse.json({ error }, { status })`.
- Audit via `safeRecordLeaveAuditEvent({ leaveRequestId, channel, eventType, status, recipients, subject, providerMessageId, metadata })` from `lib/leave-audit.ts`.
- Emails: `transporter.sendMail({ from: \`P21 Compass <${FROM_EMAIL}>\`, to, subject, html })`; escape user text with `escapeHtml`; app URL from `process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL`.
- Team-lead resolution: `evaluatorMapping` where `evaluateeId = employeeId, relationshipType = 'TEAM_LEAD'` → evaluator (pattern already at `lib/email.ts:815`).
- Task bounds: ≤ 50 rows; each text field ≤ 2000 chars; drop rows with empty `taskDetails`; submit requires ≥ 1 non-empty task.
- Tests: `node --import tsx --test <file>`; typecheck `npx tsc --noEmit`. Commits conventional, PowerShell-safe (no `&`/quotes/parens), no co-author trailer. Work on `main`; do not push.
- Migration applies automatically on Vercel deploy (`build` = `prisma migrate deploy && next build`); do not run `migrate deploy` against the shared prod DB manually. `prisma generate` is local-only.

---

## Phase 0 — Schema & migration

### Task 1: Add fields, enum, audit types, migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260706120000_leave_transition_plan/migration.sql`

**Interfaces:**
- Produces: `LeaveRequest.transitionPlanTasks/transitionPlanSubmittedAt/transitionPlanLeadStatus/transitionPlanLeadReviewedAt/transitionPlanLeadReviewedById/transitionPlanDisapprovalReason/hrRepresentative`; enum `LeaveTransitionPlanLeadStatus`; `LeaveAuditEventType` += `TRANSITION_PLAN_SUBMITTED, TRANSITION_PLAN_DISAPPROVED, TRANSITION_PLAN_ESCALATION`.

- [ ] **Step 1: Add enum + fields** in `prisma/schema.prisma`. Add near the leave enums:

```prisma
enum LeaveTransitionPlanLeadStatus {
  PENDING
  APPROVED
  DISAPPROVED
}
```

Add the three values to the existing `enum LeaveAuditEventType` (after `CALENDAR_REMOVE`):

```prisma
  TRANSITION_PLAN_SUBMITTED
  TRANSITION_PLAN_DISAPPROVED
  TRANSITION_PLAN_ESCALATION
```

In `model LeaveRequest`, after `transitionPlan  String`:

```prisma
  transitionPlanTasks             Json?
  transitionPlanSubmittedAt       DateTime?
  transitionPlanLeadStatus        LeaveTransitionPlanLeadStatus @default(PENDING)
  transitionPlanLeadReviewedAt    DateTime?
  transitionPlanLeadReviewedById  String?
  transitionPlanDisapprovalReason String?
  hrRepresentative                String?
```

- [ ] **Step 2: Write migration** `prisma/migrations/20260706120000_leave_transition_plan/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "LeaveTransitionPlanLeadStatus" AS ENUM ('PENDING', 'APPROVED', 'DISAPPROVED');

-- AlterEnum (new audit event types)
ALTER TYPE "LeaveAuditEventType" ADD VALUE IF NOT EXISTS 'TRANSITION_PLAN_SUBMITTED';
ALTER TYPE "LeaveAuditEventType" ADD VALUE IF NOT EXISTS 'TRANSITION_PLAN_DISAPPROVED';
ALTER TYPE "LeaveAuditEventType" ADD VALUE IF NOT EXISTS 'TRANSITION_PLAN_ESCALATION';

-- AlterTable
ALTER TABLE "LeaveRequest"
  ADD COLUMN "transitionPlanTasks" JSONB,
  ADD COLUMN "transitionPlanSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "transitionPlanLeadStatus" "LeaveTransitionPlanLeadStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "transitionPlanLeadReviewedAt" TIMESTAMP(3),
  ADD COLUMN "transitionPlanLeadReviewedById" TEXT,
  ADD COLUMN "transitionPlanDisapprovalReason" TEXT,
  ADD COLUMN "hrRepresentative" TEXT;
```

Note: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block; Prisma emits enum-value additions in their own migration statements, which is fine here since each is a standalone statement. If `migrate deploy` complains about transactional enum edits, split the three `ALTER TYPE` lines into a separate earlier migration folder `20260706115900_leave_audit_enum_values`.

- [ ] **Step 3: Apply locally (client types only) + regenerate**

Run: `npx prisma validate && npx prisma generate`
Expected: "schema is valid"; client regenerated with the new fields.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260706120000_leave_transition_plan
git commit -m "feat: leave transition plan structured fields and audit types"
```

---

## Phase 1 — Shared library (validation + date logic)

### Task 2: `lib/leave-transition-plan.ts` (TDD)

**Files:**
- Create: `lib/leave-transition-plan.ts`
- Test: `tests/leave-transition-plan.test.ts`

**Interfaces:**
- Produces:
  - `type TransitionTask = { taskDetails: string; projectDept: string; assignedTo: string; accepted: boolean|null; deadline: string|null; completed: boolean|null; variance: string; links: string }`
  - `validateTransitionTasks(raw: unknown): TransitionTask[]` — throws on shape/bounds; drops empty rows (empty `taskDetails`).
  - `canSubmitTransitionPlan(tasks: TransitionTask[]): boolean` — true iff ≥1 task with non-empty `taskDetails`.
  - `daysUntil(startDate: Date, now?: Date): number` — whole days from `now` (date-only) to `startDate` (date-only).
  - `classifyTransitionReminder(input: { startDate: Date; submitted: boolean; alreadyEscalated: boolean; now?: Date; reminderWindow?: number }): { remind: boolean; escalate: boolean; daysUntilStart: number }`

- [ ] **Step 1: Write failing tests** `tests/leave-transition-plan.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTransitionTasks,
  canSubmitTransitionPlan,
  classifyTransitionReminder,
} from '../lib/leave-transition-plan'

const now = new Date('2026-07-06T09:00:00.000Z')

test('validateTransitionTasks drops empty rows and coerces flags', () => {
  const out = validateTransitionTasks([
    { taskDetails: 'Hand over X', assignedTo: 'Sara', accepted: true, deadline: '2026-07-10', completed: false, variance: '', links: '' },
    { taskDetails: '   ', assignedTo: 'nobody' },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].taskDetails, 'Hand over X')
  assert.equal(out[0].accepted, true)
  assert.equal(out[0].projectDept, '')
})

test('validateTransitionTasks rejects >50 rows', () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ taskDetails: `t${i}` }))
  assert.throws(() => validateTransitionTasks(rows))
})

test('canSubmitTransitionPlan requires at least one real task', () => {
  assert.equal(canSubmitTransitionPlan([]), false)
  assert.equal(canSubmitTransitionPlan(validateTransitionTasks([{ taskDetails: 'x' }])), true)
})

test('classify: reminds inside window, not before', () => {
  const start = new Date('2026-07-10T00:00:00.000Z') // 4 days out
  assert.deepEqual(
    classifyTransitionReminder({ startDate: start, submitted: false, alreadyEscalated: false, now }),
    { remind: true, escalate: false, daysUntilStart: 4 },
  )
  const far = new Date('2026-07-20T00:00:00.000Z') // 14 days out
  assert.equal(classifyTransitionReminder({ startDate: far, submitted: false, alreadyEscalated: false, now }).remind, false)
})

test('classify: escalates at/after deadline (<=3 days) once', () => {
  const start = new Date('2026-07-09T00:00:00.000Z') // 3 days out = deadline
  assert.equal(classifyTransitionReminder({ startDate: start, submitted: false, alreadyEscalated: false, now }).escalate, true)
  assert.equal(classifyTransitionReminder({ startDate: start, submitted: false, alreadyEscalated: true, now }).escalate, false)
})

test('classify: submitted plans never remind or escalate', () => {
  const start = new Date('2026-07-08T00:00:00.000Z')
  assert.deepEqual(
    classifyTransitionReminder({ startDate: start, submitted: true, alreadyEscalated: false, now }),
    { remind: false, escalate: false, daysUntilStart: 2 },
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test tests/leave-transition-plan.test.ts`
Expected: FAIL (`Cannot find module '../lib/leave-transition-plan'`)

- [ ] **Step 3: Implement** `lib/leave-transition-plan.ts`:

```ts
import { z } from 'zod'

export interface TransitionTask {
  taskDetails: string
  projectDept: string
  assignedTo: string
  accepted: boolean | null
  deadline: string | null
  completed: boolean | null
  variance: string
  links: string
}

const MAX_ROWS = 50
const MAX_TEXT = 2000

const rawTaskSchema = z.object({
  taskDetails: z.string().max(MAX_TEXT).optional().default(''),
  projectDept: z.string().max(MAX_TEXT).optional().default(''),
  assignedTo: z.string().max(MAX_TEXT).optional().default(''),
  accepted: z.boolean().nullish(),
  deadline: z.string().max(50).nullish(),
  completed: z.boolean().nullish(),
  variance: z.string().max(MAX_TEXT).optional().default(''),
  links: z.string().max(MAX_TEXT).optional().default(''),
})

export function validateTransitionTasks(raw: unknown): TransitionTask[] {
  const parsed = z.array(rawTaskSchema).max(MAX_ROWS).parse(raw ?? [])
  return parsed
    .filter((t) => (t.taskDetails || '').trim().length > 0)
    .map((t) => ({
      taskDetails: t.taskDetails.trim(),
      projectDept: (t.projectDept || '').trim(),
      assignedTo: (t.assignedTo || '').trim(),
      accepted: t.accepted ?? null,
      deadline: (t.deadline || '').trim() || null,
      completed: t.completed ?? null,
      variance: (t.variance || '').trim(),
      links: (t.links || '').trim(),
    }))
}

export function canSubmitTransitionPlan(tasks: TransitionTask[]): boolean {
  return tasks.some((t) => t.taskDetails.trim().length > 0)
}

function toDateOnly(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function daysUntil(startDate: Date, now: Date = new Date()): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((toDateOnly(startDate).getTime() - toDateOnly(now).getTime()) / msPerDay)
}

const DEADLINE_DAYS = 3
const DEFAULT_WINDOW = 5

export function classifyTransitionReminder(input: {
  startDate: Date
  submitted: boolean
  alreadyEscalated: boolean
  now?: Date
  reminderWindow?: number
}): { remind: boolean; escalate: boolean; daysUntilStart: number } {
  const daysUntilStart = daysUntil(input.startDate, input.now ?? new Date())
  if (input.submitted || daysUntilStart < 0) {
    return { remind: false, escalate: false, daysUntilStart }
  }
  const window = input.reminderWindow ?? DEFAULT_WINDOW
  const remind = daysUntilStart <= window
  const escalate = daysUntilStart <= DEADLINE_DAYS && !input.alreadyEscalated
  return { remind, escalate, daysUntilStart }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx --test tests/leave-transition-plan.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/leave-transition-plan.ts tests/leave-transition-plan.test.ts
git commit -m "feat: transition plan task validation and reminder date logic"
```

---

## Phase 2 — Email notifications

### Task 3: Three new email functions in `lib/email.ts`

**Files:**
- Modify: `lib/email.ts` (append 3 exported functions; reuse `transporter`, `FROM_EMAIL`, `escapeHtml`, `getHrRecipientEmails`, `safeRecordLeaveAuditEvent`, and the `evaluatorMapping TEAM_LEAD` lead lookup)

**Interfaces:**
- Produces:
  - `sendTransitionPlanSubmittedNotification(requestId: string): Promise<{ success: boolean; message?: string }>` — emails the applicant's team lead(s); audit `TRANSITION_PLAN_SUBMITTED`.
  - `sendTransitionPlanDisapprovedNotification(requestId: string, reason: string): Promise<{ success: boolean }>` — emails the applicant; audit `TRANSITION_PLAN_DISAPPROVED`.
  - `sendTransitionPlanEscalation(requestId: string): Promise<{ success: boolean }>` — emails HR (`getHrRecipientEmails`); audit `TRANSITION_PLAN_ESCALATION`.

- [ ] **Step 1: Implement** — append to `lib/email.ts` (mirror `sendTransitionPlanReminderNotification`). Each: load the leave request + employee; build the leave `/leave` link from `NEXT_PUBLIC_APP_URL || APP_URL`; send with `from: P21 Compass <FROM_EMAIL>`; record the audit event with the matching `eventType`. For the submitted notification, resolve lead emails via:

```ts
const leadMappings = await prisma.evaluatorMapping.findMany({
  where: { evaluateeId: leaveRequest.employeeId, relationshipType: 'TEAM_LEAD' },
  select: { evaluatorId: true },
})
const leads = await prisma.user.findMany({
  where: { id: { in: leadMappings.map((m) => m.evaluatorId) }, email: { not: null } },
  select: { name: true, email: true },
})
```
If no lead email, record the audit event `status: 'SKIPPED'` and return `{ success: false, message: 'No team lead email' }`. Escalation recipients = `await getHrRecipientEmails()`; skip+audit if empty.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "feat: transition plan submit disapprove and HR escalation emails"
```

---

## Phase 3 — API: save / submit / lead review

### Task 4: Transition-plan save + submit route

**Files:**
- Create: `app/api/leave/requests/[id]/transition-plan/route.ts`

**Interfaces:**
- Consumes: `validateTransitionTasks`, `canSubmitTransitionPlan` (Task 2); `sendTransitionPlanSubmittedNotification` (Task 3)
- Produces:
  - `GET` → `{ tasks, submittedAt, leadStatus, disapprovalReason, hrRepresentative, generalNotes }`
  - `PUT` `{ tasks, hrRepresentative?, generalNotes? }` → saves draft `{ success }`
  - `POST` `{ tasks?, hrRepresentative?, generalNotes? }` → submit `{ success }` (validates ≥1 task, sets `transitionPlanSubmittedAt`, `transitionPlanLeadStatus='PENDING'`, emails lead)

- [ ] **Step 1: Implement.** Auth: `getSession()`; allow the leave's `employeeId === user.id` **or** `isAdminRole(user.role)`. Load the request by `params.id`; 404 if missing; 403 if not owner/HR. `PUT` persists `transitionPlanTasks: validateTransitionTasks(body.tasks)` (+ optional `hrRepresentative`, and `transitionPlan` general notes). `POST` also requires `canSubmitTransitionPlan(tasks)` (else 400 "Add at least one task before submitting"), sets `transitionPlanSubmittedAt: new Date()`, `transitionPlanLeadStatus: 'PENDING'`, `transitionPlanLeadReviewedAt/ById/DisapprovalReason: null`, then calls `sendTransitionPlanSubmittedNotification(id)` in a try/catch (email failure does not fail the request). Wrap Prisma `update` P2025 → 404. Use `Prisma.InputJsonValue` cast for the JSON field.

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add app/api/leave/requests/[id]/transition-plan/route.ts
git commit -m "feat: transition plan save and submit API"
```

### Task 5: Lead review route

**Files:**
- Create: `app/api/leave/requests/[id]/transition-plan/review/route.ts`

**Interfaces:**
- Consumes: `sendTransitionPlanDisapprovedNotification` (Task 3)
- Produces: `POST` `{ action: 'APPROVE'|'DISAPPROVE', reason? }` → `{ success, leadStatus }`

- [ ] **Step 1: Implement.** Auth: caller must be the employee's team lead (an `evaluatorMapping` with `evaluatorId = user.id, evaluateeId = leave.employeeId, relationshipType = 'TEAM_LEAD'`) **or** `isAdminRole`. Require the plan is submitted (`transitionPlanSubmittedAt != null`, else 400). `APPROVE` → set `transitionPlanLeadStatus='APPROVED'`, `transitionPlanLeadReviewedAt=now`, `transitionPlanLeadReviewedById=user.id`, clear reason. `DISAPPROVE` → require `reason` (400 if missing), set status `DISAPPROVED` + reason + reviewer, then `sendTransitionPlanDisapprovedNotification(id, reason)` in try/catch. Never change leave `status`.

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add app/api/leave/requests/[id]/transition-plan/review/route.ts
git commit -m "feat: team lead transition plan review API"
```

---

## Phase 4 — Reminder cron enhancement

### Task 6: Retarget reminders + add HR escalation

**Files:**
- Modify: `app/api/leave/transition-plan-reminders/route.ts` (`runTransitionPlanReminders`)
- Consumes: `classifyTransitionReminder` (Task 2), `sendTransitionPlanEscalation` (Task 3)

- [ ] **Step 1: Rewrite `runTransitionPlanReminders`.** Query candidates: `status ∈ {PENDING, LEAD_APPROVED, HR_APPROVED, APPROVED}`, `startDate >= today`, `transitionPlanSubmittedAt: null`, selecting `id, startDate`. For each candidate, determine `alreadyEscalated` by checking for an existing `TRANSITION_PLAN_ESCALATION` audit event:

```ts
const escalatedIds = new Set(
  (await prisma.leaveAuditEvent.findMany({
    where: { eventType: 'TRANSITION_PLAN_ESCALATION', leaveRequestId: { in: candidates.map((c) => c.id) } },
    select: { leaveRequestId: true },
  })).map((e) => e.leaveRequestId)
)
```

Then per candidate call `classifyTransitionReminder({ startDate, submitted: false, alreadyEscalated: escalatedIds.has(id), now: today, reminderWindow: daysBeforeStart ?? 5 })`. If `dryRun`, return counts of `{ remind, escalate }`. Otherwise: if `remind` → `sendTransitionPlanReminderNotification(id)`; if `escalate` → `sendTransitionPlanEscalation(id)`. Keep existing auth (`isReminderJobAuthorized`/admin), the query/body param plumbing, and return `{ success, reminded, escalated, failed, errors }`. Keep `daysBeforeStart` meaning the reminder window (default 5).

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add app/api/leave/transition-plan-reminders/route.ts
git commit -m "feat: reminders target unsubmitted plans and escalate to HR at deadline"
```

---

## Phase 5 — Applicant UI (structured table)

### Task 7: Editable + read-only transition plan components

**Files:**
- Create: `components/leave/TransitionPlanTable.tsx` (editable table; add/remove rows; the 7 columns; Y/N as selects; deadline as date input)
- Create: `components/leave/TransitionPlanView.tsx` (read-only render of tasks + lead status)
- Modify: `app/(evaluator)/leave/page.tsx` — replace the "Transition Plan" `Textarea` in the **create** and **edit** forms with `<TransitionPlanTable>` bound to `formData.transitionPlanTasks` / `editFormData.transitionPlanTasks`; keep the free-text box as an optional "General notes" field; add a **Submit transition plan** button (calls `POST /api/leave/requests/[id]/transition-plan`) on existing requests; show `TransitionPlanView` + lead status in the request detail view (around the current line ~2048 "Transition Plan" block).

- [ ] **Step 1:** Build `TransitionPlanTable` (props: `tasks: TransitionTask[]`, `onChange(tasks)`, `disabled?`) mirroring the self-eval `SelfEvaluationForm` row-editing pattern (`@/components/ui/input`, `select`, `button`, lucide `Plus`/`Trash2`). Build `TransitionPlanView` (props: `tasks`, `leadStatus`, `disapprovalReason?`) as a read-only table + a status badge.

- [ ] **Step 2:** Wire both into `app/(evaluator)/leave/page.tsx`: extend `formData`/`editFormData` with `transitionPlanTasks: TransitionTask[]`; send `transitionPlanTasks` on create/edit; add the Submit action + success toast ("Transition plan submitted"). Keep the existing missing-plan banner but base it on `transitionPlanSubmittedAt` (unsubmitted) rather than blank text.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit`
```bash
git add components/leave/TransitionPlanTable.tsx components/leave/TransitionPlanView.tsx app/(evaluator)/leave/page.tsx
git commit -m "feat: structured transition plan table in leave form"
```

---

## Phase 6 — Lead review UI

### Task 8: Lead approve/disapprove on the leave view

**Files:**
- Modify: `app/(evaluator)/leave/page.tsx` (approver/lead context) — reuse `TransitionPlanView`

- [ ] **Step 1:** In the lead/approver view of a request whose plan is submitted, render `TransitionPlanView` and, when the current user is the applicant's team lead, show **Approve** / **Disapprove** buttons. Disapprove opens a reason prompt (existing `Modal`/`Textarea`), then `POST /api/leave/requests/[id]/transition-plan/review` with `{ action, reason }`; toast and refresh. Show current `transitionPlanLeadStatus` (Pending/Approved/Disapproved + reason).

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`
```bash
git add app/(evaluator)/leave/page.tsx
git commit -m "feat: team lead can review and disapprove transition plans"
```

---

## Phase 7 — HR admin flag

### Task 9: Flag missing/disapproved plans in admin leave

**Files:**
- Modify: `app/(hr)/admin/leave/page.tsx`

- [ ] **Step 1:** Where upcoming leaves are listed, add a badge when `transitionPlanSubmittedAt` is null ("Plan missing") or `transitionPlanLeadStatus === 'DISAPPROVED'` ("Plan disapproved"). Ensure the admin leave API returns those fields (extend its `select` if it narrows fields). HR cancels via the existing cancel control already on this page.

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`
```bash
git add app/(hr)/admin/leave/page.tsx
git commit -m "feat: HR admin flags leaves with missing or disapproved transition plans"
```

---

## Phase 8 — Verification

### Task 10: Full typecheck + tests

- [ ] **Step 1: Run**

Run: `node --import tsx --test tests/leave-transition-plan.test.ts` and `npx tsc --noEmit`
Expected: all pass; 0 type errors (clear stale `.next/types` with `rm -rf .next/types` if it references removed routes).

- [ ] **Step 2: Manual dry-run of the cron logic**

Run: `GET /api/leave/transition-plan-reminders?dryRun=true` (as HR) and confirm `{ reminded, escalated }` counts look right against current data.

---

## Self-Review (completed during planning)

- **Spec coverage:** §2 model → Task 1; §3 task shape/validation → Task 2; §4 applicant UI → Task 7; §5 lead notify/disapprove → Tasks 3/5/8; §6 reminders+deadline+escalation → Tasks 2/3/6; §7 HR → Tasks 3/9; §10 testing → Tasks 2/10. Non-goals (§8) respected: no assignee workflow, no auto-cancel, lead approval advisory.
- **Placeholder scan:** none — code steps carry concrete content; UI tasks name exact files, components, endpoints, and the row-edit pattern to mirror.
- **Type consistency:** `TransitionTask`, `validateTransitionTasks`, `canSubmitTransitionPlan`, `classifyTransitionReminder`, and the three email function names match across Tasks 2/3/4/5/6.
- **Note:** UI tasks (7–9) are structural against a large existing page (`app/(evaluator)/leave/page.tsx`); exact insertion points are discovered at execution time, following the existing form/handler patterns.
