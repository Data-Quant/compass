# Self-Evaluation Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an HR-triggered, qualitative self-evaluation pre-step whose submissions surface read-only to team leads, never affecting scores.

**Architecture:** Three new Prisma models (`SelfEvaluationQuestion` bank, `SelfEvaluation` per employee/period, plus trigger fields on `EvaluationPeriod`). A shared `lib/self-evaluation.ts` owns types/validation/eligibility/snapshotting. API routes mirror existing `app/api/admin/questions/route.ts` conventions and reuse `getResolvedEvaluationAssignmentForPair` for lead authz. UI mirrors existing admin/evaluator pages. No `Evaluation`/`Report` rows are ever written.

**Tech Stack:** Next.js App Router, React (client components), TypeScript, Prisma + PostgreSQL, Zod, nodemailer, `node:test` + tsx.

## Global Constraints

- Self-evaluations create **no** `Evaluation`, `Report`, `EvaluatorMapping`, or `Weightage` rows. Scoring is unaffected (`SELF: 0.00` in `lib/config.ts:74`).
- All API routes: auth via `getSession()` from `@/lib/auth`; admin routes also require `isAdminRole(user.role)` (HR only) from `@/lib/permissions`.
- Response shape: `NextResponse.json(data)` on success, `NextResponse.json({ error }, { status })` on failure (match existing routes).
- Question types: `TEXT | LIST | GOAL_TABLE`. Goal status: `NOT_STARTED | IN_PROGRESS | COMPLETED | EXCEEDED`.
- Answers are stored as a **snapshot array** on `SelfEvaluation.answers` (see Task 2 types). Submitted snapshots are frozen.
- Eligibility exclusion positions constant: `['Manager', 'Partner', 'Principal', 'Managing Partner']`.
- Tests run with `node --import tsx --test <file>`; typecheck with `npx tsc --noEmit`.
- Commit messages: conventional (`feat:`/`test:`/`chore:`), no `&`/quotes/parens (PowerShell-safe). No co-author trailer (repo convention).
- Work on `main`; do not push (user pushes manually).

---

## Phase 0 — Schema & seed

### Task 1: Prisma models, migration, and question seed

**Files:**
- Modify: `prisma/schema.prisma` (add 2 enums, 2 models, 2 fields + 2 relations on `EvaluationPeriod`, 2 relations on `User`)
- Create: `prisma/migrations/20260629120000_add_self_evaluation/migration.sql`

**Deploy note:** `package.json` build runs `prisma migrate deploy` — the migration (incl. the seeded questions, appended as `INSERT`s à la `20260423103000_seed_dept_evaluation_questions`) applies automatically on the next Vercel deploy. Do **not** run `migrate deploy` against the shared DB manually. `prisma generate` is local-only and safe.

**Interfaces:**
- Produces: Prisma models `SelfEvaluationQuestion`, `SelfEvaluation`; enums `SelfEvaluationQuestionType`, `SelfEvaluationStatus`; `EvaluationPeriod.selfEvaluationTriggeredAt/ById`.

- [ ] **Step 1: Add enums** to `prisma/schema.prisma` (near the other evaluation enums, ~line 53):

```prisma
enum SelfEvaluationQuestionType {
  TEXT
  LIST
  GOAL_TABLE
}

enum SelfEvaluationStatus {
  DRAFT
  SUBMITTED
}
```

- [ ] **Step 2: Add models** to `prisma/schema.prisma` (after `PreEvaluationEvaluateeSelection`):

```prisma
model SelfEvaluationQuestion {
  id         String                     @id @default(cuid())
  section    String
  prompt     String
  helpText   String?
  type       SelfEvaluationQuestionType @default(TEXT)
  orderIndex Int
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
  answers     Json                 @default("[]")
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
```

- [ ] **Step 3: Add fields + relations** on `EvaluationPeriod` (in the model body and relations area):

```prisma
  selfEvaluationTriggeredAt   DateTime?
  selfEvaluationTriggeredById String?
  selfEvaluationTriggeredBy   User?            @relation("SelfEvaluationTriggeredBy", fields: [selfEvaluationTriggeredById], references: [id], onDelete: SetNull)
  selfEvaluations             SelfEvaluation[]
```

And on `User` add:

```prisma
  selfEvaluations         SelfEvaluation[]   @relation("SelfEvaluationEmployee")
  selfEvaluationTriggers  EvaluationPeriod[] @relation("SelfEvaluationTriggeredBy")
```

- [ ] **Step 4: Write the migration SQL** at `prisma/migrations/20260629120000_add_self_evaluation/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "SelfEvaluationQuestionType" AS ENUM ('TEXT', 'LIST', 'GOAL_TABLE');
CREATE TYPE "SelfEvaluationStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterTable
ALTER TABLE "EvaluationPeriod"
  ADD COLUMN "selfEvaluationTriggeredAt" TIMESTAMP(3),
  ADD COLUMN "selfEvaluationTriggeredById" TEXT;

-- CreateTable
CREATE TABLE "SelfEvaluationQuestion" (
  "id" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "helpText" TEXT,
  "type" "SelfEvaluationQuestionType" NOT NULL DEFAULT 'TEXT',
  "orderIndex" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SelfEvaluationQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SelfEvaluation" (
  "id" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "status" "SelfEvaluationStatus" NOT NULL DEFAULT 'DRAFT',
  "answers" JSONB NOT NULL DEFAULT '[]',
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SelfEvaluation_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "SelfEvaluationQuestion_isActive_orderIndex_idx" ON "SelfEvaluationQuestion"("isActive", "orderIndex");
CREATE UNIQUE INDEX "SelfEvaluation_periodId_employeeId_key" ON "SelfEvaluation"("periodId", "employeeId");
CREATE INDEX "SelfEvaluation_periodId_idx" ON "SelfEvaluation"("periodId");
CREATE INDEX "SelfEvaluation_employeeId_idx" ON "SelfEvaluation"("employeeId");
CREATE INDEX "SelfEvaluation_status_idx" ON "SelfEvaluation"("status");

-- FKs
ALTER TABLE "EvaluationPeriod" ADD CONSTRAINT "EvaluationPeriod_selfEvaluationTriggeredById_fkey" FOREIGN KEY ("selfEvaluationTriggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SelfEvaluation" ADD CONSTRAINT "SelfEvaluation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "EvaluationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SelfEvaluation" ADD CONSTRAINT "SelfEvaluation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Apply migration + regenerate client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migration `20260629120000_add_self_evaluation` applied; client types include `selfEvaluation`.

- [ ] **Step 6: Seed the 9-section bank** — create `prisma/seed-self-evaluation-questions.ts`:

```ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const QUESTIONS = [
  { section: 'Key Accomplishments', prompt: 'What were your most significant achievements during this review period?', type: 'LIST' as const },
  { section: 'Goal Progress', prompt: 'Review the goals set with your Team Lead for this period. For each goal, indicate your progress.', type: 'GOAL_TABLE' as const },
  { section: 'Strengths', prompt: 'What do you consider your greatest strengths in your role?', type: 'TEXT' as const },
  { section: 'Areas for Development', prompt: 'What obstacles or challenges have you faced in your role?', type: 'TEXT' as const },
  { section: 'Learning & Development', prompt: 'What new skills or knowledge have you acquired during this period?', type: 'TEXT' as const },
  { section: 'Collaboration & Impact', prompt: 'How have you contributed to team success?', type: 'TEXT' as const },
  { section: 'Goals for Next Review Period', prompt: 'What are your top 3-5 goals for the next review period?', type: 'LIST' as const },
  { section: 'Career Development', prompt: 'What are your career aspirations within the organization?', type: 'TEXT' as const },
  { section: 'Feedback & Support', prompt: 'What feedback do you have for your team lead or management?', type: 'TEXT' as const },
]

async function main() {
  const existing = await prisma.selfEvaluationQuestion.count()
  if (existing > 0) { console.log(`Skip: ${existing} questions already exist`); return }
  for (let i = 0; i < QUESTIONS.length; i++) {
    await prisma.selfEvaluationQuestion.create({ data: { ...QUESTIONS[i], orderIndex: i + 1 } })
  }
  console.log(`Seeded ${QUESTIONS.length} self-evaluation questions`)
}
main().finally(() => prisma.$disconnect())
```

- [ ] **Step 7: Run the seed**

Run: `npx tsx prisma/seed-self-evaluation-questions.ts`
Expected: `Seeded 9 self-evaluation questions`

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260629120000_add_self_evaluation prisma/seed-self-evaluation-questions.ts
git commit -m "feat: self-evaluation schema, migration and question seed"
```

---

## Phase 1 — Shared library (`lib/self-evaluation.ts`)

### Task 2: Types, validation, eligibility, snapshot helpers (TDD)

**Files:**
- Create: `lib/self-evaluation.ts`
- Test: `tests/self-evaluation.test.ts`

**Interfaces:**
- Produces:
  - `type GoalStatus = 'NOT_STARTED'|'IN_PROGRESS'|'COMPLETED'|'EXCEEDED'`
  - `type SelfEvaluationAnswer = { questionId: string; section: string; prompt: string; type: 'TEXT'|'LIST'|'GOAL_TABLE'; value: string | string[] | GoalRow[] }` where `GoalRow = { goal: string; status: GoalStatus; comments: string }`
  - `SELF_EVAL_EXCLUDED_POSITIONS: string[]`
  - `validateAnswers(questions, rawAnswers): SelfEvaluationAnswer[]` — throws `Error` on shape mismatch; trims empty list/table rows
  - `buildSnapshot(questions, rawAnswers): SelfEvaluationAnswer[]` — alias used at submit, drops answers whose question is inactive/missing
  - `isEligibleEmployee({ role, position, leadsAnyone }): boolean`

- [ ] **Step 1: Write failing tests** at `tests/self-evaluation.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { isEligibleEmployee, validateAnswers, type SelfEvaluationQuestionLike } from '../lib/self-evaluation'

const Q: SelfEvaluationQuestionLike[] = [
  { id: 'q1', section: 'A', prompt: 'p1', type: 'TEXT' },
  { id: 'q2', section: 'B', prompt: 'p2', type: 'LIST' },
  { id: 'q3', section: 'C', prompt: 'p3', type: 'GOAL_TABLE' },
]

test('isEligibleEmployee: plain employee who leads no one is eligible', () => {
  assert.equal(isEligibleEmployee({ role: 'EMPLOYEE', position: 'Analyst', leadsAnyone: false }), true)
})
test('isEligibleEmployee: team lead excluded', () => {
  assert.equal(isEligibleEmployee({ role: 'EMPLOYEE', position: 'Analyst', leadsAnyone: true }), false)
})
test('isEligibleEmployee: partner/manager position excluded', () => {
  assert.equal(isEligibleEmployee({ role: 'EMPLOYEE', position: 'Principal', leadsAnyone: false }), false)
  assert.equal(isEligibleEmployee({ role: 'EMPLOYEE', position: 'Manager', leadsAnyone: false }), false)
})
test('isEligibleEmployee: non-employee role excluded', () => {
  assert.equal(isEligibleEmployee({ role: 'HR', position: 'Analyst', leadsAnyone: false }), false)
})

test('validateAnswers: coerces and trims per type', () => {
  const out = validateAnswers(Q, [
    { questionId: 'q1', value: 'hello' },
    { questionId: 'q2', value: ['a', '', '  '] },
    { questionId: 'q3', value: [{ goal: 'g', status: 'COMPLETED', comments: 'c' }, { goal: '', status: 'NOT_STARTED', comments: '' }] },
  ])
  assert.equal(out[0].value, 'hello')
  assert.deepEqual(out[1].value, ['a'])
  assert.deepEqual(out[2].value, [{ goal: 'g', status: 'COMPLETED', comments: 'c' }])
  assert.equal(out[2].prompt, 'p3') // snapshot fields filled from question
})
test('validateAnswers: rejects bad goal status', () => {
  assert.throws(() => validateAnswers(Q, [{ questionId: 'q3', value: [{ goal: 'g', status: 'WAT', comments: '' }] }]))
})
test('validateAnswers: rejects TEXT given an array', () => {
  assert.throws(() => validateAnswers(Q, [{ questionId: 'q1', value: ['x'] }]))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test tests/self-evaluation.test.ts`
Expected: FAIL (`Cannot find module '../lib/self-evaluation'`)

- [ ] **Step 3: Implement** `lib/self-evaluation.ts`:

```ts
import { z } from 'zod'

export type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXCEEDED'
export const GOAL_STATUSES: GoalStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXCEEDED']
export type SelfEvaluationQuestionType = 'TEXT' | 'LIST' | 'GOAL_TABLE'

export interface GoalRow { goal: string; status: GoalStatus; comments: string }
export interface SelfEvaluationQuestionLike {
  id: string; section: string; prompt: string; type: SelfEvaluationQuestionType
}
export interface SelfEvaluationAnswer {
  questionId: string; section: string; prompt: string
  type: SelfEvaluationQuestionType
  value: string | string[] | GoalRow[]
}

export const SELF_EVAL_EXCLUDED_POSITIONS = ['Manager', 'Partner', 'Principal', 'Managing Partner']

export function isEligibleEmployee(p: { role: string; position: string | null; leadsAnyone: boolean }): boolean {
  if (p.role !== 'EMPLOYEE') return false
  if (p.leadsAnyone) return false
  if (p.position && SELF_EVAL_EXCLUDED_POSITIONS.some((x) => x.toLowerCase() === p.position!.trim().toLowerCase())) return false
  return true
}

const goalRowSchema = z.object({
  goal: z.string().default(''),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXCEEDED']),
  comments: z.string().default(''),
})

export function validateAnswers(
  questions: SelfEvaluationQuestionLike[],
  rawAnswers: Array<{ questionId: string; value: unknown }>,
): SelfEvaluationAnswer[] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const result: SelfEvaluationAnswer[] = []
  for (const raw of rawAnswers) {
    const q = byId.get(raw.questionId)
    if (!q) continue // drop answers to unknown/inactive questions
    let value: SelfEvaluationAnswer['value']
    if (q.type === 'TEXT') {
      value = z.string().parse(raw.value)
    } else if (q.type === 'LIST') {
      value = z.array(z.string()).parse(raw.value).map((s) => s.trim()).filter(Boolean)
    } else {
      value = z.array(goalRowSchema).parse(raw.value).filter((r) => r.goal.trim() || r.comments.trim())
    }
    result.push({ questionId: q.id, section: q.section, prompt: q.prompt, type: q.type, value })
  }
  return result
}

export const buildSnapshot = validateAnswers
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx --test tests/self-evaluation.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/self-evaluation.ts tests/self-evaluation.test.ts
git commit -m "feat: self-evaluation shared types validation and eligibility"
```

---

## Phase 2 — Email invite

### Task 3: `sendSelfEvaluationInvite`

**Files:**
- Modify: `lib/email.ts` (append new exported function; reuse `transporter`, `FROM_EMAIL`, `escapeHtml`)

**Interfaces:**
- Consumes: `transporter`, `FROM_EMAIL`, `escapeHtml` (already in `lib/email.ts`)
- Produces: `export async function sendSelfEvaluationInvite(opts: { to: string; employeeName: string; periodName: string; appUrl?: string }): Promise<void>`

- [ ] **Step 1: Implement** — append to `lib/email.ts`:

```ts
export async function sendSelfEvaluationInvite(opts: {
  to: string
  employeeName: string
  periodName: string
  appUrl?: string
}): Promise<void> {
  if (!opts.to) return
  const base = opts.appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://compass-blond.vercel.app'
  const link = `${base}/evaluations`
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
      <h2>Self-Evaluation — ${escapeHtml(opts.periodName)}</h2>
      <p>Hi ${escapeHtml(opts.employeeName)},</p>
      <p>Please complete your self-evaluation for <strong>${escapeHtml(opts.periodName)}</strong>.
      Your reflections are shared with your team lead as context for your review.</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none">Complete self-evaluation</a></p>
      <p style="color:#6b7280;font-size:13px">You can also find it on your dashboard.</p>
    </div>`
  await transporter.sendMail({
    from: FROM_EMAIL,
    to: opts.to,
    subject: `Self-Evaluation — ${opts.periodName}`,
    html,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "feat: self-evaluation invite email"
```

---

## Phase 3 — HR question bank API

### Task 4: `/api/admin/self-evaluation/questions` CRUD

**Files:**
- Create: `app/api/admin/self-evaluation/questions/route.ts`

**Interfaces:**
- Consumes: `getSession`, `isAdminRole`, `prisma`
- Produces: `GET` → `{ questions }`; `POST` `{ section, prompt, helpText?, type }` → `{ success, question }`; `PUT` `{ id, section?, prompt?, helpText?, type?, orderIndex?, isActive? }` → `{ success, question }`; `DELETE ?id=` → `{ success }`

- [ ] **Step 1: Implement** (mirror `app/api/admin/questions/route.ts`):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'

const TYPES = ['TEXT', 'LIST', 'GOAL_TABLE']

export async function GET() {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const questions = await prisma.selfEvaluationQuestion.findMany({ orderBy: { orderIndex: 'asc' } })
  return NextResponse.json({ questions })
}

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { section, prompt, helpText, type } = await request.json()
  if (!section || !prompt || !TYPES.includes(type)) {
    return NextResponse.json({ error: 'section, prompt and a valid type are required' }, { status: 400 })
  }
  const last = await prisma.selfEvaluationQuestion.findFirst({ orderBy: { orderIndex: 'desc' } })
  const question = await prisma.selfEvaluationQuestion.create({
    data: { section, prompt, helpText: helpText || null, type, orderIndex: (last?.orderIndex || 0) + 1 },
  })
  return NextResponse.json({ success: true, question })
}

export async function PUT(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, section, prompt, helpText, type, orderIndex, isActive } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (type && !TYPES.includes(type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 })
  const question = await prisma.selfEvaluationQuestion.update({
    where: { id },
    data: {
      ...(section !== undefined ? { section } : {}),
      ...(prompt !== undefined ? { prompt } : {}),
      ...(helpText !== undefined ? { helpText: helpText || null } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(orderIndex !== undefined ? { orderIndex } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  })
  return NextResponse.json({ success: true, question })
}

export async function DELETE(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const body = await request.json().catch(() => null)
  const id = searchParams.get('id') || body?.id
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.selfEvaluationQuestion.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/self-evaluation/questions/route.ts
git commit -m "feat: self-evaluation question bank API"
```

---

## Phase 4 — Trigger API

### Task 5: `/api/admin/self-evaluation/trigger` (preview + fire)

**Files:**
- Create: `lib/self-evaluation-eligibility.ts` (server-side recipient computation)
- Create: `app/api/admin/self-evaluation/trigger/route.ts`

**Interfaces:**
- Consumes: `isEligibleEmployee` (Task 2), `sendSelfEvaluationInvite` (Task 3)
- Produces:
  - `getEligibleCandidates(): Promise<Array<{ id: string; name: string; email: string|null; department: string|null; position: string|null }>>`
  - `GET ?periodId=` → `{ period, candidates, alreadyTriggered, existingCount }`
  - `POST { periodId, employeeIds[] }` → `{ created, skipped, emailed }`

- [ ] **Step 1: Implement** `lib/self-evaluation-eligibility.ts`:

```ts
import { prisma } from '@/lib/db'
import { isEligibleEmployee } from '@/lib/self-evaluation'

export async function getEligibleCandidates() {
  const [users, leadMappings] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'EMPLOYEE' },
      select: { id: true, name: true, email: true, department: true, position: true },
      orderBy: { name: 'asc' },
    }),
    prisma.evaluatorMapping.findMany({
      where: { relationshipType: 'TEAM_LEAD' },
      select: { evaluatorId: true },
    }),
  ])
  const leads = new Set(leadMappings.map((m) => m.evaluatorId))
  return users.filter((u) =>
    isEligibleEmployee({ role: 'EMPLOYEE', position: u.position, leadsAnyone: leads.has(u.id) }),
  )
}
```

- [ ] **Step 2: Implement** `app/api/admin/self-evaluation/trigger/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getEligibleCandidates } from '@/lib/self-evaluation-eligibility'
import { sendSelfEvaluationInvite } from '@/lib/email'

export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('periodId')
  if (!periodId) return NextResponse.json({ error: 'periodId is required' }, { status: 400 })
  const [period, candidates, existingCount] = await Promise.all([
    prisma.evaluationPeriod.findUnique({ where: { id: periodId } }),
    getEligibleCandidates(),
    prisma.selfEvaluation.count({ where: { periodId } }),
  ])
  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 })
  return NextResponse.json({
    period: { id: period.id, name: period.name, selfEvaluationTriggeredAt: period.selfEvaluationTriggeredAt },
    candidates,
    alreadyTriggered: Boolean(period.selfEvaluationTriggeredAt),
    existingCount,
  })
}

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { periodId, employeeIds } = await request.json()
  if (!periodId || !Array.isArray(employeeIds) || employeeIds.length === 0) {
    return NextResponse.json({ error: 'periodId and a non-empty employeeIds[] are required' }, { status: 400 })
  }
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId } })
  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 })

  const existing = await prisma.selfEvaluation.findMany({
    where: { periodId, employeeId: { in: employeeIds } },
    select: { employeeId: true },
  })
  const existingSet = new Set(existing.map((e) => e.employeeId))
  const toCreate = employeeIds.filter((id: string) => !existingSet.has(id))

  if (toCreate.length > 0) {
    await prisma.selfEvaluation.createMany({
      data: toCreate.map((employeeId: string) => ({ periodId, employeeId })),
      skipDuplicates: true,
    })
  }
  await prisma.evaluationPeriod.update({
    where: { id: periodId },
    data: { selfEvaluationTriggeredAt: new Date(), selfEvaluationTriggeredById: user.id },
  })

  // Email only the newly added employees
  const newEmployees = await prisma.user.findMany({
    where: { id: { in: toCreate }, email: { not: null } },
    select: { name: true, email: true },
  })
  let emailed = 0
  for (const e of newEmployees) {
    try { await sendSelfEvaluationInvite({ to: e.email!, employeeName: e.name, periodName: period.name }); emailed++ }
    catch (err) { console.error('Self-eval invite failed for', e.email, err) }
  }

  return NextResponse.json({ created: toCreate.length, skipped: existingSet.size, emailed })
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/self-evaluation-eligibility.ts app/api/admin/self-evaluation/trigger/route.ts
git commit -m "feat: self-evaluation trigger and eligibility API"
```

---

## Phase 5 — Employee API

### Task 6: employee fetch/save/submit + pending prompt

**Files:**
- Create: `app/api/self-evaluation/[periodId]/route.ts`
- Create: `app/api/self-evaluation/pending/route.ts`

**Interfaces:**
- Consumes: `validateAnswers`/`buildSnapshot` (Task 2)
- Produces:
  - `GET /api/self-evaluation/[periodId]` → `{ selfEvaluation: { id, status, answers, submittedAt } | null, questions }`
  - `PUT /api/self-evaluation/[periodId]` `{ answers, submit?: boolean }` → `{ success, status }`
  - `GET /api/self-evaluation/pending` → `{ pending: boolean, periodId?, periodName? }`

- [ ] **Step 1: Implement** `app/api/self-evaluation/[periodId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { buildSnapshot, validateAnswers } from '@/lib/self-evaluation'

async function loadActiveQuestions() {
  return prisma.selfEvaluationQuestion.findMany({ where: { isActive: true }, orderBy: { orderIndex: 'asc' } })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ periodId: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { periodId } = await params
  const [selfEvaluation, questions] = await Promise.all([
    prisma.selfEvaluation.findUnique({ where: { periodId_employeeId: { periodId, employeeId: user.id } } }),
    loadActiveQuestions(),
  ])
  if (!selfEvaluation) return NextResponse.json({ error: 'No self-evaluation assigned for this period' }, { status: 404 })
  return NextResponse.json({
    selfEvaluation: { id: selfEvaluation.id, status: selfEvaluation.status, answers: selfEvaluation.answers, submittedAt: selfEvaluation.submittedAt },
    questions,
  })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ periodId: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { periodId } = await params
  const { answers, submit } = await request.json()
  const current = await prisma.selfEvaluation.findUnique({ where: { periodId_employeeId: { periodId, employeeId: user.id } } })
  if (!current) return NextResponse.json({ error: 'No self-evaluation assigned for this period' }, { status: 404 })
  if (current.status === 'SUBMITTED') return NextResponse.json({ error: 'Self-evaluation already submitted' }, { status: 400 })

  const questions = await loadActiveQuestions()
  let saved
  try {
    saved = submit ? buildSnapshot(questions, answers || []) : validateAnswers(questions, answers || [])
  } catch {
    return NextResponse.json({ error: 'Invalid answer format' }, { status: 400 })
  }
  const updated = await prisma.selfEvaluation.update({
    where: { id: current.id },
    data: {
      answers: saved as object[],
      startedAt: current.startedAt || new Date(),
      ...(submit ? { status: 'SUBMITTED', submittedAt: new Date() } : {}),
    },
  })
  return NextResponse.json({ success: true, status: updated.status })
}
```

- [ ] **Step 2: Implement** `app/api/self-evaluation/pending/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pendingRow = await prisma.selfEvaluation.findFirst({
    where: { employeeId: user.id, status: 'DRAFT', period: { isActive: true } },
    include: { period: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  if (!pendingRow) return NextResponse.json({ pending: false })
  return NextResponse.json({ pending: true, periodId: pendingRow.period.id, periodName: pendingRow.period.name })
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no new errors)
```bash
git add app/api/self-evaluation/[periodId]/route.ts app/api/self-evaluation/pending/route.ts
git commit -m "feat: employee self-evaluation fetch save submit and pending API"
```

---

## Phase 6 — Lead read-only API

### Task 7: `/api/self-evaluation/for-evaluatee/[evaluateeId]`

**Files:**
- Create: `app/api/self-evaluation/for-evaluatee/[evaluateeId]/route.ts`

**Interfaces:**
- Consumes: `getResolvedEvaluationAssignmentForPair` from `@/lib/evaluation-assignments`
- Produces: `GET ?periodId=` → `{ status: 'SUBMITTED', submittedAt, answers, employeeName } | { status: 'NONE' }`

- [ ] **Step 1: Implement**:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignmentForPair } from '@/lib/evaluation-assignments'

export async function GET(request: NextRequest, { params }: { params: Promise<{ evaluateeId: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('periodId')
  if (!periodId) return NextResponse.json({ error: 'periodId is required' }, { status: 400 })
  const { evaluateeId } = await params

  // Authz: caller must be an assigned evaluator of this evaluatee for the period
  const assignment = await getResolvedEvaluationAssignmentForPair(periodId, user.id, evaluateeId)
  if (!assignment) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const row = await prisma.selfEvaluation.findUnique({
    where: { periodId_employeeId: { periodId, employeeId: evaluateeId } },
    include: { employee: { select: { name: true } } },
  })
  if (!row || row.status !== 'SUBMITTED') return NextResponse.json({ status: 'NONE' })
  return NextResponse.json({ status: 'SUBMITTED', submittedAt: row.submittedAt, answers: row.answers, employeeName: row.employee.name })
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no new errors)
```bash
git add app/api/self-evaluation/for-evaluatee/[evaluateeId]/route.ts
git commit -m "feat: lead read-only self-evaluation context API"
```

---

## Phase 7 — HR question editor UI

### Task 8: `app/(hr)/admin/self-evaluation/questions/page.tsx`

**Files:**
- Create: `app/(hr)/admin/self-evaluation/questions/page.tsx`

**Pattern:** Mirror `app/(hr)/admin/questions/page.tsx` (`'use client'`, `Card`, `Modal`, `ConfirmDialog`, `Button`, `Badge`, `Select`, `Textarea`, `toast` from `sonner`, `framer-motion`, lucide icons).

- [ ] **Step 1: Build the page** with: load `GET /api/admin/self-evaluation/questions`; a list ordered by `orderIndex` showing `section`, `prompt`, a `Badge` for `type`, active/inactive state; "Add question" button → `Modal` with fields `section` (input), `prompt` (`Textarea`), `helpText` (`Textarea`), `type` (`Select` of TEXT/LIST/GOAL_TABLE); Save → `POST`; edit (pencil) → `Modal` prefilled → `PUT`; reorder up/down buttons → `PUT { id, orderIndex }` swapping neighbors; activate/deactivate toggle → `PUT { id, isActive }`; delete (`ConfirmDialog`) → `DELETE`. Use `toast.success/error`. Show a `LoadingScreen` while fetching.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit` then `npx next build` (or dev render check)
Expected: page compiles, renders the seeded 9 questions.

- [ ] **Step 3: Commit**

```bash
git add app/(hr)/admin/self-evaluation/questions/page.tsx
git commit -m "feat: HR self-evaluation question editor page"
```

---

## Phase 8 — HR trigger UI

### Task 9: Trigger action + recipient dialog on `admin/periods`

**Files:**
- Modify: `app/(hr)/admin/periods/page.tsx` (add a "Self-Evaluations" action per period)

- [ ] **Step 1:** Add a button per period row "Trigger self-evaluations". On click, `GET /api/admin/self-evaluation/trigger?periodId=` and open a `Modal` listing `candidates` with checkboxes (all checked by default), a count summary, and showing `alreadyTriggered`/`existingCount`. Confirm → `POST { periodId, employeeIds }` with checked ids → `toast.success(`Sent ${created}, skipped ${skipped}`)`. If `alreadyTriggered`, show "Re-trigger (only new employees emailed)".

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`
```bash
git add app/(hr)/admin/periods/page.tsx
git commit -m "feat: HR trigger self-evaluations with recipient preview"
```

---

## Phase 9 — Employee form UI

### Task 10: `app/(evaluator)/self-evaluation/[periodId]/page.tsx`

**Files:**
- Create: `app/(evaluator)/self-evaluation/[periodId]/page.tsx`
- Create: `components/self-evaluation/SelfEvaluationForm.tsx` (renders questions by type)

- [ ] **Step 1:** Page loads `GET /api/self-evaluation/[periodId]`. If 404, show "No self-evaluation assigned" + link back. Build a `responses` map keyed by `questionId`, hydrated from `selfEvaluation.answers`. Render `SelfEvaluationForm`:
  - `TEXT` → `Textarea`
  - `LIST` → rows of inputs with add/remove buttons
  - `GOAL_TABLE` → table rows `{ goal input, status Select (Not Started/In Progress/Completed/Exceeded), comments input }` + add/remove
  Debounced autosave → `PUT { answers }` (status stays DRAFT); "Submit" → `PUT { answers, submit: true }` then redirect to `/evaluations` with `toast.success('Self-evaluation submitted')`. If `status === 'SUBMITTED'`, render read-only with a "Submitted on …" banner.

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`
```bash
git add app/(evaluator)/self-evaluation/[periodId]/page.tsx components/self-evaluation/SelfEvaluationForm.tsx
git commit -m "feat: employee self-evaluation form"
```

---

## Phase 10 — Dashboard & evaluations prompts

### Task 11: pending-prompt card on dashboard + evaluations

**Files:**
- Create: `components/self-evaluation/SelfEvaluationPrompt.tsx` (fetches `/api/self-evaluation/pending`, renders a dismissible-free CTA card linking to `/self-evaluation/<periodId>`; renders nothing if `pending: false`)
- Modify: `app/(evaluator)/dashboard/page.tsx` (mount `<SelfEvaluationPrompt />` near the top)
- Modify: `app/(evaluator)/evaluations/page.tsx` (mount `<SelfEvaluationPrompt />` at the top)

- [ ] **Step 1: Build the shared component** and mount it in both pages.

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`
```bash
git add components/self-evaluation/SelfEvaluationPrompt.tsx app/(evaluator)/dashboard/page.tsx app/(evaluator)/evaluations/page.tsx
git commit -m "feat: self-evaluation prompt on dashboard and evaluations"
```

---

## Phase 11 — Lead read-only panel

### Task 12: Self-evaluation context on the evaluate page

**Files:**
- Modify: `app/(evaluator)/evaluate/[id]/page.tsx`
- Create: `components/self-evaluation/SelfEvaluationContextPanel.tsx`

- [ ] **Step 1:** In `evaluate/[id]`, after the evaluatee + periodId are known, fetch `GET /api/self-evaluation/for-evaluatee/<evaluateeId>?periodId=<periodId>`. Render `SelfEvaluationContextPanel`: collapsible `Card` titled "Employee self-evaluation". If `status === 'NONE'` → muted "Not submitted yet." Else render each answer by type (TEXT paragraph, LIST as bullets, GOAL_TABLE as a read-only table) with the snapshot `section`/`prompt` labels and a "Submitted on …" caption. Read-only; never blocks submission.

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`
```bash
git add app/(evaluator)/evaluate/[id]/page.tsx components/self-evaluation/SelfEvaluationContextPanel.tsx
git commit -m "feat: lead sees employee self-evaluation as context"
```

---

## Phase 12 — Non-regression & final verification

### Task 13: Guard scoring isolation + full verify

**Files:**
- Create: `tests/self-evaluation-isolation.test.ts`

- [ ] **Step 1: Write the test** asserting the scoring/eligibility layers ignore self-eval data. Pure-function level (no DB): assert `normalizeRelationshipTypeForWeighting`/weight map still yields `SELF: 0` and that no self-eval code path imports into `lib/scoring.ts`. Minimal, deterministic:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_WEIGHTS } from '../lib/config'

test('SELF carries zero weight so self-evaluations never affect scores', () => {
  assert.equal(DEFAULT_WEIGHTS.SELF, 0)
})
```

(If `DEFAULT_WEIGHTS` is not exported, export it from `lib/config.ts` as part of this task.)

- [ ] **Step 2: Run the full suite + typecheck**

Run: `node --import tsx --test tests/self-evaluation.test.ts tests/self-evaluation-isolation.test.ts` and `npx tsc --noEmit`
Expected: all pass, no new type errors.

- [ ] **Step 3: Commit**

```bash
git add tests/self-evaluation-isolation.test.ts lib/config.ts
git commit -m "test: self-evaluation does not affect scoring"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §2 data model → Task 1; §3 answers/snapshot → Task 2/6; §4 eligibility → Task 2/5; §5 endpoints → Tasks 4–7; §6 UI → Tasks 8–12; §7 email → Task 3; §8 non-scoring → Task 13; §9 edge cases → covered in Tasks 5 (re-trigger idempotency), 6 (post-submit lock, snapshot freeze), 7 (authz/submitted-only). §10 testing → Tasks 2/13 unit + manual integration verification per route.
- **Placeholder scan:** none — every code step has concrete content.
- **Type consistency:** `SelfEvaluationAnswer`, `GoalStatus`, `validateAnswers`/`buildSnapshot`, `getEligibleCandidates`, `sendSelfEvaluationInvite` signatures match across Tasks 2/3/5/6/7.
- **Note:** API integration tests requiring a live server are deferred to manual verification (repo's `tests/api-integration.test.ts` needs a dev server on :3000); pure-logic tests cover validation/eligibility/isolation.
```
