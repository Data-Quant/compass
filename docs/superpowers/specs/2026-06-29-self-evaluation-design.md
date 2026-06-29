# Self-Evaluation Module — Design Spec

**Date:** 2026-06-29
**Status:** Approved for implementation
**Author:** Engineering (with Ammar)

## 1. Summary

Add a **self-evaluation** pre-step to the evaluation module. HR/Admin triggers a
self-evaluation for an evaluation period; all eligible (non team-lead / manager /
partner level) employees are emailed and prompted — on their dashboard and in their
evaluations section — to complete a qualitative reflection form. Submitted
self-evaluations surface **read-only** to the employee's team lead as additional
context while the lead completes their own evaluation.

Self-evaluations are **qualitative context only**. They never create scored
`Evaluation` rows and never affect the weighted result (consistent with the existing
`SELF: 0.00` weight in `lib/config.ts:74` and the `SELF`-skipping logic in
`lib/scoring.ts` / `lib/evaluation-completion.ts`).

### Relationship to existing code

- A **prior** self-eval existed as scored `EvaluatorMapping(relationshipType=SELF)`
  rows feeding the rating questionnaire. It was removed (`prisma/remove-self-evals.ts`).
  This design does **not** use `SELF` mappings or `Evaluation` rows at all.
- The legacy `app/api/admin/self-evaluation/route.ts` (enable/disable `SELF` mappings)
  is **superseded**. It will be removed if no live UI references it; otherwise replaced.
- "Pre-Evaluation" (`PreEvaluationLeadPrep` / `PreEvaluationLeadQuestion`) is the
  unrelated **team-lead prep** flow and is left untouched. We do not overload that term
  in code or UI for this feature.

## 2. Data model

Three new Prisma models plus two fields on `EvaluationPeriod`.

```prisma
enum SelfEvaluationQuestionType {
  TEXT        // single long free-text answer
  LIST        // repeatable list of free-text rows (e.g. accomplishments, next-period goals)
  GOAL_TABLE  // rows of { goal, status, comments } (the Goal Progress table)
}

enum SelfEvaluationStatus {
  DRAFT
  SUBMITTED
}

model SelfEvaluationQuestion {
  id         String                     @id @default(cuid())
  section    String                     // e.g. "Key Accomplishments"
  prompt     String                     // the question text shown to the employee
  helpText   String?                    // optional guidance
  type       SelfEvaluationQuestionType @default(TEXT)
  orderIndex Int                        // sort key; NOT unique (avoids reorder collisions), ties broken by createdAt
  isActive   Boolean                    @default(true)
  createdAt  DateTime                   @default(now())
  updatedAt  DateTime                   @updatedAt

  @@index([isActive, orderIndex])
}

model SelfEvaluation {
  id          String               @id @default(cuid())
  periodId    String
  employeeId  String
  status      SelfEvaluationStatus @default(DRAFT)
  answers     Json                 @default("[]") // snapshot array, see §3
  startedAt   DateTime?
  submittedAt DateTime?
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt

  period   EvaluationPeriod @relation(fields: [periodId], references: [id], onDelete: Cascade)
  employee User             @relation("SelfEvaluationEmployee", fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([periodId, employeeId])
  @@index([periodId])
  @@index([employeeId])
  @@index([status])
}

// added to EvaluationPeriod
//   selfEvaluationTriggeredAt    DateTime?
//   selfEvaluationTriggeredById  String?
//   selfEvaluationTriggeredBy    User? @relation("SelfEvaluationTriggeredBy", ...)
//   selfEvaluations              SelfEvaluation[]
```

New `User` relations: `selfEvaluations SelfEvaluation[] @relation("SelfEvaluationEmployee")`
and `selfEvaluationTriggers EvaluationPeriod[] @relation("SelfEvaluationTriggeredBy")`.

Migration: a Prisma migration under `prisma/migrations/` (the repo uses migration SQL
folders) plus a one-time seed of the question bank with the 9 sections from
`Plutus21 Self-Evaluation Form (Make A Copy).md`.

## 3. Answer storage & question snapshotting

`SelfEvaluation.answers` is a JSON array. Each entry **snapshots the question** as it
was at submit time so a submitted form always renders faithfully even if HR later edits
the bank:

```ts
type SelfEvaluationAnswer = {
  questionId: string
  section: string
  prompt: string
  type: 'TEXT' | 'LIST' | 'GOAL_TABLE'
  value:
    | string                                   // TEXT
    | string[]                                 // LIST
    | { goal: string; status: GoalStatus; comments: string }[] // GOAL_TABLE
}

type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXCEEDED'
```

Validation (Zod, shared `lib/self-evaluation.ts`):
- `TEXT` → string
- `LIST` → array of strings (empty rows trimmed out)
- `GOAL_TABLE` → array of `{ goal, status ∈ GoalStatus, comments }`

While `DRAFT`, the form renders the **current active** bank; on each save the partial
answers are persisted. On **Submit**, answers are re-snapshotted from the active bank
and frozen. Editing the bank afterwards never mutates submitted answers.

The form maps the source document 1:1: §1 Accomplishments → `LIST`, §2 Goal Progress →
`GOAL_TABLE`, §7 Goals for Next Period → `LIST`, all other sections → `TEXT`.

## 4. Eligibility

The recipient set is computed when HR opens the trigger dialog, then HR confirms/edits
it (the checkbox selection is the source of truth — no perfect auto-detection required).

**Auto-selected candidate rule:**
- `role === 'EMPLOYEE'`, AND
- does **not** appear as an evaluator with `relationshipType = 'TEAM_LEAD'` in any
  `EvaluatorMapping` (i.e. leads no one), AND
- `position` is not in the manager/partner/principal exclusion set (configurable
  constant in `lib/self-evaluation.ts`, e.g.
  `['Manager', 'Partner', 'Principal', 'Managing Partner']`).

HR can check/uncheck any active user in the dialog before sending. The confirmed list is
what gets `SelfEvaluation` rows and emails.

## 5. API endpoints

All return the standard envelope and enforce auth via `getSession()`; admin routes
require `isAdminRole(user.role)`.

**HR — question bank** (`app/api/admin/self-evaluation/questions/route.ts`)
- `GET` — list all questions (active + inactive), ordered.
- `POST` — create a question `{ section, prompt, helpText?, type, orderIndex }`.
- `PUT` — update `{ id, ... }` (wording/section/help/type/order/isActive).
- `DELETE` — `{ id }` (hard-delete only if never referenced by a submitted snapshot;
  otherwise set `isActive = false`).

**HR — trigger** (`app/api/admin/self-evaluation/trigger/route.ts`)
- `GET ?periodId=` — returns auto-selected eligible candidates + already-triggered
  status for the period (for the preview dialog).
- `POST` — `{ periodId, employeeIds[] }` → idempotently create `DRAFT` `SelfEvaluation`
  rows for the selected employees (skip existing), queue invite emails, stamp
  `period.selfEvaluationTriggeredAt/ById`. Returns `{ created, skipped, emailed }`.

**Employee — own self-eval** (`app/api/self-evaluation/[periodId]/route.ts`)
- `GET` — the caller's `SelfEvaluation` for the period + the active question bank.
- `PUT` — `{ answers, submit?: boolean }` save draft or submit (validates per §3).
  Rejects edits once `SUBMITTED`.

**Employee — pending prompt** (`app/api/self-evaluation/pending/route.ts`)
- `GET` — `{ pending: boolean, periodId?, periodName? }` for the dashboard /
  evaluations prompt (caller has a `DRAFT` for an active period).

**Lead — read-only context** (`app/api/self-evaluation/for-evaluatee/[evaluateeId]/route.ts`)
- `GET ?periodId=` — the evaluatee's **submitted** self-eval, only if the caller is an
  evaluator of that evaluatee for the period. Returns `{ status, submittedAt, answers }`
  or `{ status: 'NONE' }`. Never returns drafts.

## 6. UI surfaces

- **HR question editor** — `app/(hr)/admin/self-evaluation/questions/page.tsx`, mirroring
  the existing `app/(hr)/admin/questions/page.tsx` patterns (Card, Modal, ConfirmDialog,
  Select, Textarea, sonner, framer-motion). Add/edit/reorder/deactivate questions; choose
  type per question.
- **HR trigger** — a "Trigger self-evaluations" action on `app/(hr)/admin/periods/page.tsx`
  (alongside the period, where the pre-evaluation trigger lives), opening the recipient
  preview dialog (checkbox list, counts, confirm). Shows "triggered at / by" once fired.
- **Employee dashboard prompt** — `app/(evaluator)/dashboard/page.tsx`: a prompt card when
  `/api/self-evaluation/pending` returns `pending: true`; hidden once submitted.
- **Employee evaluations prompt** — `app/(evaluator)/evaluations/page.tsx`: same prompt at
  the top, linking to the form.
- **Employee form** — `app/(evaluator)/self-evaluation/[periodId]/page.tsx`: renders the
  bank by type (long-text, add-row list, goal table with a status dropdown), auto-saves as
  draft, Submit finalizes. Fully optional — nothing is blocked.
- **Lead read-only panel** — on `app/(evaluator)/evaluate/[id]/page.tsx`, an "Employee
  self-evaluation" collapsible panel fed by `/api/self-evaluation/for-evaluatee/...`.
  Shows the submitted answers, or "Not submitted yet" — never blocks the lead.

## 7. Email

New `sendSelfEvaluationInvite(employee, period)` in `lib/email.ts`, following the existing
notification patterns (and `EmailQueue` where applicable). One invite per selected
employee on trigger. Re-trigger only emails newly added employees.

## 8. Non-scoring guarantee

The feature creates **no** `Evaluation`, `Report`, `EvaluatorMapping`, or `Weightage`
rows. A regression test asserts that generating a report for an employee yields identical
scores whether or not a `SelfEvaluation` exists for the period.

## 9. Edge cases

- **Re-trigger** is idempotent: existing `SelfEvaluation` rows are skipped; only new
  employees get rows + emails.
- **Bank edited after trigger**: live for `DRAFT` forms; `SUBMITTED` snapshots are frozen.
- **Question deactivated/deleted after submissions**: submitted snapshots still render
  (data lives in `answers`); deactivated questions drop out of new/draft forms.
- **No active period** or **not triggered**: employees see no prompt; the form route 404s
  / redirects.
- **Lead views a still-`DRAFT` self-eval**: panel shows "Not submitted yet".
- **Employee not in the triggered set**: no row, no prompt, form route denies access.

## 10. Testing

- **Unit**: eligibility selector; per-type answer validation/snapshot serialization
  (`lib/self-evaluation.ts`).
- **Integration**: trigger endpoint (creates rows, idempotent, queues emails); submit
  endpoint (validates shapes, freezes snapshot, rejects post-submit edits); lead
  read-only endpoint (authz: only an evaluator of the evaluatee, only submitted).
- **Non-regression**: report scores unchanged in the presence of self-evaluations.
- Run with the repo's `node --import tsx --test` and `tsc --noEmit`.

## 11. Out of scope (v1)

Automated reminder emails (the invite + persistent prompts cover nudging), cross-employee
analytics over narrative answers, and any blocking/gating of lead evaluations. All are
straightforward follow-ups.
