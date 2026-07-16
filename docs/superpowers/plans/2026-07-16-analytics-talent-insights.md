# Analytics Talent Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the admin analytics tab with multi-period talent analytics — trends, a 3D Talent Cube, 360 blind spots, and evaluator calibration — built on historical evaluation scores.

**Architecture:** One shared, batched "period score matrix" (every reportable employee's per-lens and overall scores for a period) feeds four pure, independently-testable view modules. The matrix is built on a normalization helper extracted from `lib/scoring.ts`, so analytics is structurally incapable of disagreeing with individual reports. A single admin-gated endpoint returns one combined payload; the client fetches once and switches tabs with no refetch.

**Tech Stack:** Next.js 15 (App Router) · React 18 · TypeScript 5.7 · Prisma 5 / PostgreSQL (Neon) · recharts 3.7 · framer-motion 12 · `@react-three/fiber` + `@react-three/drei` (new, lazy-loaded) · tests via `node:test` + `tsx`

**Spec:** `docs/superpowers/specs/2026-07-16-analytics-talent-insights-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **NEVER run `npm run build`.** The build script is `prisma migrate deploy && next build`, and the local `.env` `DATABASE_URL` points at the **shared production Neon database**. Running it mutates prod. Typecheck with `npx tsc --noEmit`. If a real build is needed, use `npx next build` (skips `migrate deploy`).
- **NEVER run `prisma migrate deploy`, `prisma migrate dev`, or `prisma db push`.** No schema changes are in scope for this plan.
- **The GitHub repo is PUBLIC.** No employee names, real scores, emails, or other PII may appear in code, tests, fixtures, comments, or commit messages. All test fixtures use synthetic identifiers (`emp-1`, `dept-a`, `evaluator-1`).
- **Do not change scoring, weighting, or four-rating-cap behavior.** This work *reads* existing semantics. Task 1 is a pure refactor with a guard test proving no behavior change.
- **Analytics stays admin-only.** Every new route gates on `getSession()` + `isAdminRole(user.role)`, returning `401` otherwise. No per-lead scoping, no employee-facing views.
- **No new 2D charting dependency.** `recharts@^3.7.0` and `framer-motion@^12.29.2` are already installed and cover every 2D need.
- **Code style:** explicit types on all exported functions; `interface` for object shapes; no `any` (use `unknown` + narrowing); immutable updates (spread, no mutation of inputs); no `console.log` (use `console.error` for server-side failures, matching the existing analytics route).
- **Test command:** single file → `node --import tsx --test tests/<file>.test.ts`. Full suite → `npm test`.
- **Commits:** conventional commits (`feat:`, `refactor:`, `test:`). No attribution footer (disabled globally).
- **Rating scale:** `ratingValue` is `0–4` (`Float?`). Per-lens `normalizedScore` is `0–4`. `overallScore` is `0–100`.

---

## File Structure

**Create:**
- `lib/evaluation-normalization.ts` — pure per-lens normalization + overall-score math. Single source of truth shared by `scoring.ts` and the matrix.
- `lib/analytics/period-score-matrix.ts` — pure matrix builder + batched IO shell.
- `lib/analytics/trends.ts` — org/department series, movers, new joiners.
- `lib/analytics/talent-grid.ts` — tertile/momentum banding, consensus, 9-cell labels.
- `lib/analytics/blind-spots.ts` — self-gap, lens spread, flag lists.
- `lib/analytics/calibration.ts` — evaluator leniency, distribution, cap usage.
- `app/api/admin/analytics/insights/route.ts` — combined admin-gated payload.
- `components/analytics/OverviewTab.tsx` · `TrendsTab.tsx` · `TalentGridTab.tsx` · `TalentCube.tsx` · `BlindSpotsTab.tsx` · `CalibrationTab.tsx`
- `tests/evaluation-normalization.test.ts` · `tests/analytics-period-score-matrix.test.ts` · `tests/analytics-trends.test.ts` · `tests/analytics-talent-grid.test.ts` · `tests/analytics-blind-spots.test.ts` · `tests/analytics-calibration.test.ts`

**Modify:**
- `lib/scoring.ts:264-335` — consume the extracted normalization helper.
- `app/(hr)/admin/analytics/page.tsx` — becomes a thin shell (period selector + tabs + fetching).

**Unchanged:** `app/api/admin/analytics/route.ts` continues to feed the Overview tab.

---

### Task 1: Shared normalization helper

Extract the per-lens scoring math from `lib/scoring.ts` into a pure, shared helper. This is a **pure refactor** — the guard test proves `scoring.ts` behavior is unchanged.

**Files:**
- Create: `lib/evaluation-normalization.ts`
- Create: `tests/evaluation-normalization.test.ts`
- Modify: `lib/scoring.ts:264-335`

**Interfaces:**
- Consumes: `getEvaluationQuestionMeta` from `@/lib/pre-evaluation` — returns `{ sourceType, key, questionText, maxRating, questionType } | null`.
- Produces:
  - `NormalizableEvaluation` — `{ evaluatorId, ratingValue: number | null, questionId: string | null, question?, leadQuestionId?, leadQuestion? }`
  - `LensNormalization` — `{ rawScore, maxScore, normalizedScore, evaluatorCount }`
  - `normalizeLensEvaluations(evaluations: readonly NormalizableEvaluation[]): LensNormalization`
  - `computeOverallScorePercent(contributions: ReadonlyArray<{ normalizedScore: number; weight: number }>): number`

- [ ] **Step 1: Write the failing test**

Create `tests/evaluation-normalization.test.ts`:

```typescript
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeOverallScorePercent,
  normalizeLensEvaluations,
  type NormalizableEvaluation,
} from '../lib/evaluation-normalization'

function ratingEvaluation(
  evaluatorId: string,
  questionId: string,
  ratingValue: number | null
): NormalizableEvaluation {
  return {
    evaluatorId,
    ratingValue,
    questionId,
    question: { questionText: `q-${questionId}`, maxRating: 4, questionType: 'RATING' },
    leadQuestionId: null,
    leadQuestion: null,
  }
}

test('normalizeLensEvaluations averages each question across evaluators before normalizing', () => {
  // q-1: (4 + 2) / 2 = 3 ; q-2: (3 + 3) / 2 = 3 -> raw 6 of max 8 -> (6/8)*4 = 3
  const result = normalizeLensEvaluations([
    ratingEvaluation('evaluator-1', 'q-1', 4),
    ratingEvaluation('evaluator-2', 'q-1', 2),
    ratingEvaluation('evaluator-1', 'q-2', 3),
    ratingEvaluation('evaluator-2', 'q-2', 3),
  ])

  assert.equal(result.rawScore, 6)
  assert.equal(result.maxScore, 8)
  assert.equal(result.normalizedScore, 3)
  assert.equal(result.evaluatorCount, 2)
})

test('normalizeLensEvaluations ignores null ratings and TEXT questions', () => {
  const textEvaluation: NormalizableEvaluation = {
    evaluatorId: 'evaluator-3',
    ratingValue: null,
    questionId: 'q-text',
    question: { questionText: 'comments', maxRating: 4, questionType: 'TEXT' },
    leadQuestionId: null,
    leadQuestion: null,
  }

  const result = normalizeLensEvaluations([
    ratingEvaluation('evaluator-1', 'q-1', 4),
    ratingEvaluation('evaluator-2', 'q-1', null),
    textEvaluation,
  ])

  // Only evaluator-1's 4 counts: raw 4 of max 4 -> 4
  assert.equal(result.rawScore, 4)
  assert.equal(result.maxScore, 4)
  assert.equal(result.normalizedScore, 4)
  assert.equal(result.evaluatorCount, 1)
})

test('normalizeLensEvaluations returns a zero score when nothing is rateable', () => {
  const result = normalizeLensEvaluations([])

  assert.equal(result.maxScore, 0)
  assert.equal(result.normalizedScore, 0)
  assert.equal(result.evaluatorCount, 0)
})

test('normalizeLensEvaluations supports lead-authored questions at max rating 4', () => {
  const leadEvaluation: NormalizableEvaluation = {
    evaluatorId: 'evaluator-1',
    ratingValue: 2,
    questionId: null,
    question: null,
    leadQuestionId: 'lead-q-1',
    leadQuestion: { questionText: 'lead question', orderIndex: 0 },
  }

  const result = normalizeLensEvaluations([leadEvaluation])

  assert.equal(result.maxScore, 4)
  assert.equal(result.normalizedScore, 2)
})

test('computeOverallScorePercent converts weighted 0-4 contributions to a percentage', () => {
  // (4 * 0.5) + (2 * 0.5) = 3 -> (3 / 4) * 100 = 75
  assert.equal(
    computeOverallScorePercent([
      { normalizedScore: 4, weight: 0.5 },
      { normalizedScore: 2, weight: 0.5 },
    ]),
    75
  )
  assert.equal(computeOverallScorePercent([]), 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/evaluation-normalization.test.ts`
Expected: FAIL — `Cannot find module '../lib/evaluation-normalization'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/evaluation-normalization.ts`:

```typescript
import type { QuestionType } from '@prisma/client'
import { getEvaluationQuestionMeta } from '@/lib/pre-evaluation'

/**
 * The minimum shape the scoring math needs from an evaluation row. Kept
 * structural (not a Prisma type) so analytics fixtures and Prisma rows both fit.
 */
export interface NormalizableEvaluation {
  evaluatorId: string
  ratingValue: number | null
  questionId: string | null
  question?: {
    questionText: string
    maxRating: number
    questionType: QuestionType
  } | null
  leadQuestionId?: string | null
  leadQuestion?: {
    questionText: string
    orderIndex: number
  } | null
}

export interface LensNormalization {
  rawScore: number
  maxScore: number
  /** 0-4 scale. */
  normalizedScore: number
  evaluatorCount: number
}

/**
 * Normalize one relationship lens to a 0-4 score.
 *
 * Each question is first averaged across the evaluators who answered it, so a
 * lens with many evaluators is not weighted more heavily than a lens with one.
 * The per-question averages are then summed and divided by the summed max
 * ratings. This is the single source of truth for lens scoring — `lib/scoring.ts`
 * and the analytics period score matrix both call it.
 */
export function normalizeLensEvaluations(
  evaluations: readonly NormalizableEvaluation[]
): LensNormalization {
  const questionGroups = new Map<string, NormalizableEvaluation[]>()
  for (const evaluation of evaluations) {
    const meta = getEvaluationQuestionMeta(evaluation)
    if (!meta) continue
    questionGroups.set(meta.key, [...(questionGroups.get(meta.key) || []), evaluation])
  }

  let rawScore = 0
  let maxScore = 0
  const evaluatorIds = new Set<string>()

  for (const group of questionGroups.values()) {
    const meta = getEvaluationQuestionMeta(group[0])
    if (!meta || meta.questionType !== 'RATING') continue

    let questionTotal = 0
    let questionCount = 0
    for (const evaluation of group) {
      if (evaluation.ratingValue !== null) {
        questionTotal += evaluation.ratingValue
        questionCount++
        evaluatorIds.add(evaluation.evaluatorId)
      }
    }

    if (questionCount > 0) {
      rawScore += questionTotal / questionCount
      maxScore += meta.maxRating
    }
  }

  return {
    rawScore,
    maxScore,
    normalizedScore: maxScore > 0 ? (rawScore / maxScore) * 4 : 0,
    evaluatorCount: evaluatorIds.size,
  }
}

/**
 * Convert weighted 0-4 lens contributions into a 0-100 overall score.
 */
export function computeOverallScorePercent(
  contributions: ReadonlyArray<{ normalizedScore: number; weight: number }>
): number {
  const total = contributions.reduce(
    (sum, contribution) => sum + contribution.normalizedScore * contribution.weight,
    0
  )
  return (total / 4) * 100
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/evaluation-normalization.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Refactor `lib/scoring.ts` to consume the helper**

In `lib/scoring.ts`, add to the imports at the top:

```typescript
import {
  computeOverallScorePercent,
  normalizeLensEvaluations,
} from '@/lib/evaluation-normalization'
```

Replace the body of the `for (const [relationshipType, typeEvaluations] of evaluationsByType.entries())` loop (currently lines ~264-335) with:

```typescript
  for (const [relationshipType, typeEvaluations] of evaluationsByType.entries()) {
    // Skip SELF evaluations in weighted calculation
    if (relationshipType === 'SELF') {
      continue
    }

    const lensEvaluations = filterPooledRelationshipEvaluations(
      relationshipType,
      typeEvaluations
    )
    const weight = dynamicWeights[relationshipType] ?? 0
    const normalization = normalizeLensEvaluations(lensEvaluations)

    breakdown.push({
      relationshipType,
      weight,
      rawScore: normalization.rawScore,
      maxScore: normalization.maxScore,
      normalizedScore: normalization.normalizedScore,
      weightedContribution: normalization.normalizedScore * weight,
      evaluatorCount: normalization.evaluatorCount,
    })
  }
```

Then replace the overall-score computation immediately below it:

```typescript
  const overallScore = computeOverallScorePercent(breakdown)
```

Delete the now-unused `totalWeightedContribution` reduction. Note the `SELF` guard moves **above** the normalization work (it previously ran after grouping); this is behavior-preserving because the old code `continue`d before pushing to `breakdown`.

- [ ] **Step 6: Run the scoring guard tests**

Run: `node --import tsx --test tests/scoring-logic.test.ts`
Expected: PASS — no regressions. This is the guard proving the refactor did not shift any score.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test`
Expected: PASS — all tests, including the pre-existing suite.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/evaluation-normalization.ts tests/evaluation-normalization.test.ts lib/scoring.ts
git commit -m "refactor: extract shared evaluation normalization helper

Single source of truth for per-lens 0-4 normalization and weighted
overall score, consumed by lib/scoring.ts and (next) the analytics
period score matrix. No behavior change - guarded by scoring-logic tests."
```

---

### Task 2: Period score matrix

The primitive every view derives from. A **pure builder** (unit-tested) plus a thin **IO shell** that bulk-loads a period and delegates to it.

**Files:**
- Create: `lib/analytics/period-score-matrix.ts`
- Create: `tests/analytics-period-score-matrix.test.ts`

**Interfaces:**
- Consumes: `normalizeLensEvaluations`, `computeOverallScorePercent` (Task 1); `getResolvedEvaluationAssignments(periodId, { db?, includeUsers? })`; `shouldReceiveConstantEvaluations(user)`; `buildAssignmentLookup(assignments)`; `resolveEvaluationRelationshipTypeForRow({ evaluation, assignmentLookup })`; `filterPooledRelationshipEvaluations(type, evaluations)`; `applyAuthoritativeDeptPoolEvaluations(params)`; `normalizeRelationshipTypeForWeighting(type)`; `toCategorySetKey(types)`; `calculateRedistributedWeights(types)`.
- Produces:
  - `LensScore` — `{ normalizedScore: number; evaluatorCount: number }`
  - `EmployeePeriodScore` — `{ employeeId, department, overallScore, perLens, weights }`
  - `PeriodScoreMatrix` — `{ periodId, periodName, scores: EmployeePeriodScore[] }`
  - `EmployeeScoreInput` — `{ employeeId, department, evaluationsByLens, weights }`
  - `buildEmployeePeriodScore(input: EmployeeScoreInput): EmployeePeriodScore`
  - `buildPeriodScoreMatrix(params: { periodId; periodName; employees: EmployeeScoreInput[] }): PeriodScoreMatrix`
  - `computePeriodScoreMatrix(periodId: string): Promise<PeriodScoreMatrix | null>`

- [ ] **Step 1: Write the failing test**

Create `tests/analytics-period-score-matrix.test.ts`:

```typescript
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEmployeePeriodScore,
  buildPeriodScoreMatrix,
  type EmployeeScoreInput,
} from '../lib/analytics/period-score-matrix'
import type { NormalizableEvaluation } from '../lib/evaluation-normalization'

function ratingEvaluation(
  evaluatorId: string,
  questionId: string,
  ratingValue: number
): NormalizableEvaluation {
  return {
    evaluatorId,
    ratingValue,
    questionId,
    question: { questionText: `q-${questionId}`, maxRating: 4, questionType: 'RATING' },
    leadQuestionId: null,
    leadQuestion: null,
  }
}

test('buildEmployeePeriodScore normalizes each lens and weights the overall score', () => {
  const input: EmployeeScoreInput = {
    employeeId: 'emp-1',
    department: 'dept-a',
    evaluationsByLens: {
      C_LEVEL: [ratingEvaluation('evaluator-1', 'q-1', 4)],
      PEER: [ratingEvaluation('evaluator-2', 'q-1', 2)],
    },
    weights: { C_LEVEL: 0.5, PEER: 0.5 },
  }

  const result = buildEmployeePeriodScore(input)

  assert.equal(result.employeeId, 'emp-1')
  assert.equal(result.perLens.C_LEVEL?.normalizedScore, 4)
  assert.equal(result.perLens.PEER?.normalizedScore, 2)
  // (4 * 0.5 + 2 * 0.5) / 4 * 100 = 75
  assert.equal(result.overallScore, 75)
})

test('buildEmployeePeriodScore excludes SELF from the weighted overall score but keeps its lens score', () => {
  const input: EmployeeScoreInput = {
    employeeId: 'emp-1',
    department: 'dept-a',
    evaluationsByLens: {
      C_LEVEL: [ratingEvaluation('evaluator-1', 'q-1', 2)],
      SELF: [ratingEvaluation('emp-1', 'q-1', 4)],
    },
    weights: { C_LEVEL: 1 },
  }

  const result = buildEmployeePeriodScore(input)

  assert.equal(result.perLens.SELF?.normalizedScore, 4)
  // SELF must not contribute: (2 * 1) / 4 * 100 = 50
  assert.equal(result.overallScore, 50)
})

test('buildEmployeePeriodScore ignores lenses with no weight', () => {
  const input: EmployeeScoreInput = {
    employeeId: 'emp-1',
    department: null,
    evaluationsByLens: {
      C_LEVEL: [ratingEvaluation('evaluator-1', 'q-1', 4)],
      HR: [ratingEvaluation('evaluator-2', 'q-1', 1)],
    },
    weights: { C_LEVEL: 1 },
  }

  const result = buildEmployeePeriodScore(input)

  assert.equal(result.perLens.HR?.normalizedScore, 1)
  assert.equal(result.overallScore, 100)
})

test('buildPeriodScoreMatrix maps every employee input into the matrix', () => {
  const matrix = buildPeriodScoreMatrix({
    periodId: 'period-1',
    periodName: 'Q1',
    employees: [
      {
        employeeId: 'emp-1',
        department: 'dept-a',
        evaluationsByLens: { C_LEVEL: [ratingEvaluation('evaluator-1', 'q-1', 4)] },
        weights: { C_LEVEL: 1 },
      },
      {
        employeeId: 'emp-2',
        department: 'dept-b',
        evaluationsByLens: { C_LEVEL: [ratingEvaluation('evaluator-1', 'q-1', 2)] },
        weights: { C_LEVEL: 1 },
      },
    ],
  })

  assert.equal(matrix.periodId, 'period-1')
  assert.equal(matrix.scores.length, 2)
  assert.equal(matrix.scores[0].overallScore, 100)
  assert.equal(matrix.scores[1].overallScore, 50)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/analytics-period-score-matrix.test.ts`
Expected: FAIL — `Cannot find module '../lib/analytics/period-score-matrix'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/analytics/period-score-matrix.ts`:

```typescript
import { prisma } from '@/lib/db'
import {
  computeOverallScorePercent,
  normalizeLensEvaluations,
  type NormalizableEvaluation,
} from '@/lib/evaluation-normalization'
import {
  normalizeRelationshipTypeForWeighting,
  toCategorySetKey,
  type RelationshipType,
} from '@/types'
import { calculateRedistributedWeights } from '@/lib/config'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { shouldReceiveConstantEvaluations } from '@/lib/evaluation-profile-rules'
import { filterPooledRelationshipEvaluations } from '@/lib/evaluation-completion'
import { applyAuthoritativeDeptPoolEvaluations } from '@/lib/dept-evaluation-pool'
import {
  buildAssignmentLookup,
  resolveEvaluationRelationshipTypeForRow,
} from '@/lib/evaluation-relationship-resolution'

export interface LensScore {
  /** 0-4 scale. */
  normalizedScore: number
  evaluatorCount: number
}

export interface EmployeePeriodScore {
  employeeId: string
  department: string | null
  /** 0-100 scale. */
  overallScore: number
  perLens: Partial<Record<RelationshipType, LensScore>>
  weights: Record<string, number>
}

export interface PeriodScoreMatrix {
  periodId: string
  periodName: string
  scores: EmployeePeriodScore[]
}

export interface EmployeeScoreInput {
  employeeId: string
  department: string | null
  evaluationsByLens: Partial<Record<RelationshipType, NormalizableEvaluation[]>>
  weights: Record<string, number>
}

/**
 * Pure: turn one employee's per-lens evaluations into their period score.
 * SELF is scored for 360 analysis but never contributes to the weighted overall,
 * matching lib/scoring.ts.
 */
export function buildEmployeePeriodScore(input: EmployeeScoreInput): EmployeePeriodScore {
  const perLens: Partial<Record<RelationshipType, LensScore>> = {}
  const contributions: Array<{ normalizedScore: number; weight: number }> = []

  for (const [lens, evaluations] of Object.entries(input.evaluationsByLens)) {
    if (!evaluations || evaluations.length === 0) continue
    const relationshipType = lens as RelationshipType
    const normalization = normalizeLensEvaluations(evaluations)

    perLens[relationshipType] = {
      normalizedScore: normalization.normalizedScore,
      evaluatorCount: normalization.evaluatorCount,
    }

    if (relationshipType === 'SELF') continue
    const weight = input.weights[relationshipType] ?? 0
    if (weight <= 0) continue
    contributions.push({ normalizedScore: normalization.normalizedScore, weight })
  }

  return {
    employeeId: input.employeeId,
    department: input.department,
    overallScore: computeOverallScorePercent(contributions),
    perLens,
    weights: input.weights,
  }
}

/** Pure: assemble a full matrix from per-employee inputs. */
export function buildPeriodScoreMatrix(params: {
  periodId: string
  periodName: string
  employees: readonly EmployeeScoreInput[]
}): PeriodScoreMatrix {
  return {
    periodId: params.periodId,
    periodName: params.periodName,
    scores: params.employees.map(buildEmployeePeriodScore),
  }
}

/**
 * IO shell: bulk-load a period and delegate to the pure builder.
 *
 * Mirrors lib/scoring.ts semantics (dept-pool carry-forward, HR pooling,
 * weight-profile priority) but loads everything in a handful of queries instead
 * of a query fan-out per employee.
 *
 * Returns null when the period does not exist.
 */
export async function computePeriodScoreMatrix(
  periodId: string
): Promise<PeriodScoreMatrix | null> {
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId } })
  if (!period) return null

  const [users, assignments, evaluations, weightProfiles, customWeightages] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, department: true, position: true } }),
    getResolvedEvaluationAssignments(period.id, { includeUsers: false }),
    prisma.evaluation.findMany({
      where: { periodId: period.id, submittedAt: { not: null } },
      include: { question: true, leadQuestion: true },
    }),
    prisma.weightProfile.findMany(),
    prisma.weightage.findMany(),
  ])

  const assignmentsByEvaluatee = new Map<string, typeof assignments>()
  const assignmentsByEvaluator = new Map<string, typeof assignments>()
  for (const assignment of assignments) {
    assignmentsByEvaluatee.set(assignment.evaluateeId, [
      ...(assignmentsByEvaluatee.get(assignment.evaluateeId) || []),
      assignment,
    ])
    assignmentsByEvaluator.set(assignment.evaluatorId, [
      ...(assignmentsByEvaluator.get(assignment.evaluatorId) || []),
      assignment,
    ])
  }

  const evaluationsByEvaluatee = new Map<string, typeof evaluations>()
  const evaluationsByEvaluator = new Map<string, typeof evaluations>()
  for (const evaluation of evaluations) {
    evaluationsByEvaluatee.set(evaluation.evaluateeId, [
      ...(evaluationsByEvaluatee.get(evaluation.evaluateeId) || []),
      evaluation,
    ])
    evaluationsByEvaluator.set(evaluation.evaluatorId, [
      ...(evaluationsByEvaluator.get(evaluation.evaluatorId) || []),
      evaluation,
    ])
  }

  const weightsByCategoryKey = new Map(
    weightProfiles.map((profile) => [profile.categorySetKey, profile.weights as Record<string, number>])
  )
  const customWeightsByEmployee = new Map<string, Record<string, number>>()
  for (const weightage of customWeightages) {
    const existing = customWeightsByEmployee.get(weightage.employeeId) || {}
    customWeightsByEmployee.set(weightage.employeeId, {
      ...existing,
      [normalizeRelationshipTypeForWeighting(weightage.relationshipType as RelationshipType)]:
        weightage.weightagePercentage,
    })
  }

  const employeeInputs: EmployeeScoreInput[] = []

  for (const user of users) {
    const employeeAssignments = assignmentsByEvaluatee.get(user.id) || []
    if (employeeAssignments.length === 0) continue
    if (!shouldReceiveConstantEvaluations(user)) continue

    const effectiveEvaluations = applyAuthoritativeDeptPoolEvaluations({
      evaluateeId: user.id,
      evaluations: evaluationsByEvaluatee.get(user.id) || [],
      assignments: employeeAssignments,
      getAssignmentsForEvaluator: (evaluatorId) => assignmentsByEvaluator.get(evaluatorId) || [],
      getEvaluationsForEvaluator: (evaluatorId) => evaluationsByEvaluator.get(evaluatorId) || [],
    })

    const assignmentLookup = buildAssignmentLookup(
      employeeAssignments.map((assignment) => ({
        evaluatorId: assignment.evaluatorId,
        evaluateeId: assignment.evaluateeId,
        relationshipType: assignment.relationshipType as RelationshipType,
      }))
    )

    const grouped = new Map<RelationshipType, NormalizableEvaluation[]>()
    for (const evaluation of effectiveEvaluations) {
      const relationshipType = resolveEvaluationRelationshipTypeForRow({
        evaluation,
        assignmentLookup,
      })
      if (!relationshipType) continue
      grouped.set(relationshipType, [...(grouped.get(relationshipType) || []), evaluation])
    }

    const evaluationsByLens: Partial<Record<RelationshipType, NormalizableEvaluation[]>> = {}
    for (const [relationshipType, lensEvaluations] of grouped.entries()) {
      evaluationsByLens[relationshipType] = filterPooledRelationshipEvaluations(
        relationshipType,
        lensEvaluations
      )
    }

    const mappedTypes = [
      ...new Set(
        employeeAssignments.map((assignment) =>
          normalizeRelationshipTypeForWeighting(assignment.relationshipType as RelationshipType)
        )
      ),
    ]
    const categoryKey = toCategorySetKey(mappedTypes)
    const profileWeights = categoryKey ? weightsByCategoryKey.get(categoryKey) : undefined
    const customWeights = customWeightsByEmployee.get(user.id)
    const weights =
      profileWeights ||
      (customWeights && Object.keys(customWeights).length > 0
        ? customWeights
        : calculateRedistributedWeights(mappedTypes))

    employeeInputs.push({
      employeeId: user.id,
      department: user.department,
      evaluationsByLens,
      weights,
    })
  }

  return buildPeriodScoreMatrix({
    periodId: period.id,
    periodName: period.name,
    employees: employeeInputs,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/analytics-period-score-matrix.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/analytics/period-score-matrix.ts tests/analytics-period-score-matrix.test.ts
git commit -m "feat: add batched analytics period score matrix

Pure builder (unit tested) plus a bulk-loading IO shell that mirrors
lib/scoring.ts semantics without a per-employee query fan-out."
```

---

### Task 3: Trends module

**Files:**
- Create: `lib/analytics/trends.ts`
- Create: `tests/analytics-trends.test.ts`

**Interfaces:**
- Consumes: `PeriodScoreMatrix`, `EmployeePeriodScore` (Task 2).
- Produces:
  - `MOVERS_LIMIT = 5`
  - `TrendPoint` — `{ periodId, periodName, avgScore, employeeCount }`
  - `Mover` — `{ employeeId, department, currentScore, previousScore, delta }`
  - `NewJoiner` — `{ employeeId, department, currentScore }`
  - `TrendsResult` — `{ orgSeries, departmentSeries, topImprovers, topDecliners, newJoiners, insufficientData }`
  - `computeTrends(params: { matrices: readonly PeriodScoreMatrix[]; currentPeriodId: string; comparisonPeriodId: string | null }): TrendsResult`

- [ ] **Step 1: Write the failing test**

Create `tests/analytics-trends.test.ts`:

```typescript
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTrends, MOVERS_LIMIT } from '../lib/analytics/trends'
import type { EmployeePeriodScore, PeriodScoreMatrix } from '../lib/analytics/period-score-matrix'

function score(employeeId: string, department: string | null, overallScore: number): EmployeePeriodScore {
  return { employeeId, department, overallScore, perLens: {}, weights: {} }
}

function matrix(periodId: string, periodName: string, scores: EmployeePeriodScore[]): PeriodScoreMatrix {
  return { periodId, periodName, scores }
}

const q1 = matrix('p1', 'Q1', [score('emp-1', 'dept-a', 50), score('emp-2', 'dept-b', 80)])
const q2 = matrix('p2', 'Q2', [
  score('emp-1', 'dept-a', 70),
  score('emp-2', 'dept-b', 60),
  score('emp-3', 'dept-a', 90),
])

test('computeTrends builds org and department series in period order', () => {
  const result = computeTrends({ matrices: [q1, q2], currentPeriodId: 'p2', comparisonPeriodId: 'p1' })

  assert.deepEqual(
    result.orgSeries.map((point) => [point.periodName, point.avgScore, point.employeeCount]),
    [
      ['Q1', 65, 2],
      ['Q2', 220 / 3, 3],
    ]
  )

  const deptA = result.departmentSeries.find((series) => series.department === 'dept-a')
  assert.deepEqual(deptA?.points.map((point) => point.avgScore), [50, 80])
})

test('computeTrends ranks improvers and decliners by delta', () => {
  const result = computeTrends({ matrices: [q1, q2], currentPeriodId: 'p2', comparisonPeriodId: 'p1' })

  assert.equal(result.topImprovers.length, 1)
  assert.equal(result.topImprovers[0].employeeId, 'emp-1')
  assert.equal(result.topImprovers[0].delta, 20)

  assert.equal(result.topDecliners.length, 1)
  assert.equal(result.topDecliners[0].employeeId, 'emp-2')
  assert.equal(result.topDecliners[0].delta, -20)
})

test('computeTrends separates new joiners from movers', () => {
  const result = computeTrends({ matrices: [q1, q2], currentPeriodId: 'p2', comparisonPeriodId: 'p1' })

  assert.deepEqual(result.newJoiners.map((joiner) => joiner.employeeId), ['emp-3'])
  const moverIds = [...result.topImprovers, ...result.topDecliners].map((mover) => mover.employeeId)
  assert.equal(moverIds.includes('emp-3'), false)
})

test('computeTrends caps each mover list at MOVERS_LIMIT', () => {
  const many = Array.from({ length: 8 }, (_, index) => score(`emp-${index}`, 'dept-a', 50))
  const improved = Array.from({ length: 8 }, (_, index) => score(`emp-${index}`, 'dept-a', 50 + index + 1))
  const result = computeTrends({
    matrices: [matrix('p1', 'Q1', many), matrix('p2', 'Q2', improved)],
    currentPeriodId: 'p2',
    comparisonPeriodId: 'p1',
  })

  assert.equal(result.topImprovers.length, MOVERS_LIMIT)
  assert.equal(result.topImprovers[0].delta, 8)
})

test('computeTrends flags insufficient data with only one period', () => {
  const result = computeTrends({ matrices: [q1], currentPeriodId: 'p1', comparisonPeriodId: null })

  assert.equal(result.insufficientData, true)
  assert.equal(result.topImprovers.length, 0)
  assert.equal(result.topDecliners.length, 0)
  assert.equal(result.orgSeries.length, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/analytics-trends.test.ts`
Expected: FAIL — `Cannot find module '../lib/analytics/trends'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/analytics/trends.ts`:

```typescript
import type { EmployeePeriodScore, PeriodScoreMatrix } from '@/lib/analytics/period-score-matrix'

/** Maximum entries per mover list, in each direction. */
export const MOVERS_LIMIT = 5

export interface TrendPoint {
  periodId: string
  periodName: string
  /** 0-100 scale. */
  avgScore: number
  employeeCount: number
}

export interface Mover {
  employeeId: string
  department: string | null
  currentScore: number
  previousScore: number
  /** Points on the 0-100 scale. Positive means improved. */
  delta: number
}

export interface NewJoiner {
  employeeId: string
  department: string | null
  currentScore: number
}

export interface DepartmentTrend {
  department: string
  points: TrendPoint[]
}

export interface TrendsResult {
  orgSeries: TrendPoint[]
  departmentSeries: DepartmentTrend[]
  topImprovers: Mover[]
  topDecliners: Mover[]
  newJoiners: NewJoiner[]
  insufficientData: boolean
}

const UNKNOWN_DEPARTMENT = 'Unknown'

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function toTrendPoint(matrix: PeriodScoreMatrix, scores: readonly EmployeePeriodScore[]): TrendPoint {
  return {
    periodId: matrix.periodId,
    periodName: matrix.periodName,
    avgScore: mean(scores.map((entry) => entry.overallScore)),
    employeeCount: scores.length,
  }
}

/**
 * Org/department score series across periods, plus movers between the current
 * and comparison period.
 *
 * `matrices` must already be ordered oldest-first. Movers require a score in
 * both periods; employees present only in the current period are new joiners and
 * are never ranked.
 */
export function computeTrends(params: {
  matrices: readonly PeriodScoreMatrix[]
  currentPeriodId: string
  comparisonPeriodId: string | null
}): TrendsResult {
  const orgSeries = params.matrices.map((matrix) => toTrendPoint(matrix, matrix.scores))

  const departments = [
    ...new Set(
      params.matrices.flatMap((matrix) =>
        matrix.scores.map((entry) => entry.department || UNKNOWN_DEPARTMENT)
      )
    ),
  ].sort((a, b) => a.localeCompare(b))

  const departmentSeries: DepartmentTrend[] = departments.map((department) => ({
    department,
    points: params.matrices
      .map((matrix) => {
        const scores = matrix.scores.filter(
          (entry) => (entry.department || UNKNOWN_DEPARTMENT) === department
        )
        return scores.length > 0 ? toTrendPoint(matrix, scores) : null
      })
      .filter((point): point is TrendPoint => point !== null),
  }))

  const current = params.matrices.find((matrix) => matrix.periodId === params.currentPeriodId)
  const comparison = params.comparisonPeriodId
    ? params.matrices.find((matrix) => matrix.periodId === params.comparisonPeriodId)
    : undefined

  if (!current || !comparison) {
    return {
      orgSeries,
      departmentSeries,
      topImprovers: [],
      topDecliners: [],
      newJoiners: [],
      insufficientData: true,
    }
  }

  const previousById = new Map(comparison.scores.map((entry) => [entry.employeeId, entry]))
  const movers: Mover[] = []
  const newJoiners: NewJoiner[] = []

  for (const entry of current.scores) {
    const previous = previousById.get(entry.employeeId)
    if (!previous) {
      newJoiners.push({
        employeeId: entry.employeeId,
        department: entry.department,
        currentScore: entry.overallScore,
      })
      continue
    }
    movers.push({
      employeeId: entry.employeeId,
      department: entry.department,
      currentScore: entry.overallScore,
      previousScore: previous.overallScore,
      delta: entry.overallScore - previous.overallScore,
    })
  }

  const topImprovers = [...movers]
    .filter((mover) => mover.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, MOVERS_LIMIT)
  const topDecliners = [...movers]
    .filter((mover) => mover.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, MOVERS_LIMIT)

  return {
    orgSeries,
    departmentSeries,
    topImprovers,
    topDecliners,
    newJoiners,
    insufficientData: false,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/analytics-trends.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/trends.ts tests/analytics-trends.test.ts
git commit -m "feat: add analytics trends module

Org and department score series across periods, plus movers and new
joiners between the current and comparison period."
```

---

### Task 4: Talent grid module

**Files:**
- Create: `lib/analytics/talent-grid.ts`
- Create: `tests/analytics-talent-grid.test.ts`

**Interfaces:**
- Consumes: `PeriodScoreMatrix`, `LensScore` (Task 2); `RelationshipType` from `@/types`.
- Produces:
  - `MOMENTUM_DEAD_BAND = 3.0`
  - `PerformanceBand` — `'LOW' | 'MID' | 'HIGH'`
  - `MomentumBand` — `'DECLINING' | 'STABLE' | 'RISING'`
  - `TalentGridEntry` — `{ employeeId, department, performanceScore, performanceBand, momentumDelta, momentumBand, consensus, cellLabel, isNew }`
  - `TalentGridResult` — `{ entries, insufficientData }`
  - `computeConsensus(perLens: Partial<Record<RelationshipType, LensScore>>): number | null`
  - `computeTalentGrid(params: { current: PeriodScoreMatrix; comparison: PeriodScoreMatrix | null }): TalentGridResult`

- [ ] **Step 1: Write the failing test**

Create `tests/analytics-talent-grid.test.ts`:

```typescript
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeConsensus,
  computeTalentGrid,
  MOMENTUM_DEAD_BAND,
} from '../lib/analytics/talent-grid'
import type { EmployeePeriodScore, PeriodScoreMatrix } from '../lib/analytics/period-score-matrix'

function score(
  employeeId: string,
  overallScore: number,
  perLens: EmployeePeriodScore['perLens'] = {}
): EmployeePeriodScore {
  return { employeeId, department: 'dept-a', overallScore, perLens, weights: {} }
}

function matrix(periodId: string, scores: EmployeePeriodScore[]): PeriodScoreMatrix {
  return { periodId, periodName: periodId, scores }
}

test('computeConsensus inverts the external lens spread onto a 0-1 scale', () => {
  // spread = 4 - 2 = 2 -> 1 - 2/4 = 0.5
  assert.equal(
    computeConsensus({
      C_LEVEL: { normalizedScore: 4, evaluatorCount: 1 },
      PEER: { normalizedScore: 2, evaluatorCount: 1 },
    }),
    0.5
  )
  // Perfect agreement -> 1
  assert.equal(
    computeConsensus({
      C_LEVEL: { normalizedScore: 3, evaluatorCount: 1 },
      PEER: { normalizedScore: 3, evaluatorCount: 1 },
    }),
    1
  )
})

test('computeConsensus excludes SELF and needs at least two external lenses', () => {
  assert.equal(
    computeConsensus({
      C_LEVEL: { normalizedScore: 4, evaluatorCount: 1 },
      SELF: { normalizedScore: 0, evaluatorCount: 1 },
    }),
    null
  )
  assert.equal(computeConsensus({}), null)
})

test('computeTalentGrid buckets performance into cohort-relative tertiles', () => {
  const current = matrix('p2', [
    score('emp-1', 10),
    score('emp-2', 50),
    score('emp-3', 90),
  ])

  const result = computeTalentGrid({ current, comparison: null })
  const bands = new Map(result.entries.map((entry) => [entry.employeeId, entry.performanceBand]))

  assert.equal(bands.get('emp-1'), 'LOW')
  assert.equal(bands.get('emp-2'), 'MID')
  assert.equal(bands.get('emp-3'), 'HIGH')
})

test('computeTalentGrid treats a delta inside the dead band as stable', () => {
  const comparison = matrix('p1', [score('emp-1', 50), score('emp-2', 50), score('emp-3', 50)])
  const current = matrix('p2', [
    score('emp-1', 50 + MOMENTUM_DEAD_BAND), // exactly at the band -> STABLE
    score('emp-2', 50 + MOMENTUM_DEAD_BAND + 0.1), // just beyond -> RISING
    score('emp-3', 50 - MOMENTUM_DEAD_BAND - 0.1), // just beyond -> DECLINING
  ])

  const result = computeTalentGrid({ current, comparison })
  const bands = new Map(result.entries.map((entry) => [entry.employeeId, entry.momentumBand]))

  assert.equal(bands.get('emp-1'), 'STABLE')
  assert.equal(bands.get('emp-2'), 'RISING')
  assert.equal(bands.get('emp-3'), 'DECLINING')
})

test('computeTalentGrid marks employees without a prior score as new', () => {
  const comparison = matrix('p1', [score('emp-1', 50)])
  const current = matrix('p2', [score('emp-1', 50), score('emp-2', 70)])

  const result = computeTalentGrid({ current, comparison })
  const newEntry = result.entries.find((entry) => entry.employeeId === 'emp-2')

  assert.equal(newEntry?.isNew, true)
  assert.equal(newEntry?.momentumDelta, null)
  assert.equal(newEntry?.momentumBand, null)
  assert.equal(newEntry?.cellLabel, null)
})

test('computeTalentGrid labels the nine cells', () => {
  const comparison = matrix('p1', [score('emp-1', 90), score('emp-2', 50), score('emp-3', 10)])
  const current = matrix('p2', [
    score('emp-1', 90), // HIGH + STABLE
    score('emp-2', 60), // MID + RISING
    score('emp-3', 0), // LOW + DECLINING
  ])

  const result = computeTalentGrid({ current, comparison })
  const labels = new Map(result.entries.map((entry) => [entry.employeeId, entry.cellLabel]))

  assert.equal(labels.get('emp-1'), 'Top performer')
  assert.equal(labels.get('emp-2'), 'Emerging')
  assert.equal(labels.get('emp-3'), 'At-risk')
})

test('computeTalentGrid flags insufficient data without a comparison period', () => {
  const result = computeTalentGrid({ current: matrix('p1', [score('emp-1', 50)]), comparison: null })

  assert.equal(result.insufficientData, true)
  assert.equal(result.entries[0].momentumBand, null)
})

test('computeTalentGrid puts everyone in MID when the cohort is too small to split', () => {
  const result = computeTalentGrid({
    current: matrix('p1', [score('emp-1', 10), score('emp-2', 90)]),
    comparison: null,
  })

  assert.deepEqual(result.entries.map((entry) => entry.performanceBand), ['MID', 'MID'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/analytics-talent-grid.test.ts`
Expected: FAIL — `Cannot find module '../lib/analytics/talent-grid'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/analytics/talent-grid.ts`:

```typescript
import type {
  EmployeePeriodScore,
  LensScore,
  PeriodScoreMatrix,
} from '@/lib/analytics/period-score-matrix'
import type { RelationshipType } from '@/types'

/** Points on the 0-100 overall-score scale. |delta| <= this is STABLE. */
export const MOMENTUM_DEAD_BAND = 3.0

/** Fewer than this many scored employees cannot be split into tertiles. */
const MIN_COHORT_FOR_TERTILES = 3

/** The 0-4 lens scale, used to normalize spread onto 0-1. */
const LENS_SCALE = 4

export type PerformanceBand = 'LOW' | 'MID' | 'HIGH'
export type MomentumBand = 'DECLINING' | 'STABLE' | 'RISING'

export interface TalentGridEntry {
  employeeId: string
  department: string | null
  /** 0-100 scale. */
  performanceScore: number
  performanceBand: PerformanceBand
  /** Points on the 0-100 scale. Null for new joiners. */
  momentumDelta: number | null
  momentumBand: MomentumBand | null
  /** 0-1, where 1 is total evaluator agreement. Null when under two external lenses. */
  consensus: number | null
  cellLabel: string | null
  isNew: boolean
}

export interface TalentGridResult {
  entries: TalentGridEntry[]
  insufficientData: boolean
}

const CELL_LABELS: Record<PerformanceBand, Record<MomentumBand, string>> = {
  HIGH: { DECLINING: 'Slipping star', STABLE: 'Top performer', RISING: 'Accelerate' },
  MID: { DECLINING: 'Drifting', STABLE: 'Core', RISING: 'Emerging' },
  LOW: { DECLINING: 'At-risk', STABLE: 'Needs support', RISING: 'Improving' },
}

/**
 * Agreement across external lenses, on 0-1. A wide spread between how different
 * groups rate someone means low consensus. SELF is excluded — it measures
 * self-awareness, not evaluator agreement. Null when under two external lenses.
 */
export function computeConsensus(
  perLens: Partial<Record<RelationshipType, LensScore>>
): number | null {
  const externalScores = Object.entries(perLens)
    .filter(([lens, lensScore]) => lens !== 'SELF' && lensScore !== undefined)
    .map(([, lensScore]) => (lensScore as LensScore).normalizedScore)

  if (externalScores.length < 2) return null

  const spread = Math.max(...externalScores) - Math.min(...externalScores)
  return Math.min(1, Math.max(0, 1 - spread / LENS_SCALE))
}

function toPerformanceBander(
  scores: readonly EmployeePeriodScore[]
): (score: number) => PerformanceBand {
  if (scores.length < MIN_COHORT_FOR_TERTILES) {
    return () => 'MID'
  }

  const sorted = [...scores.map((entry) => entry.overallScore)].sort((a, b) => a - b)
  const lowerThreshold = sorted[Math.floor(sorted.length / 3)]
  const upperThreshold = sorted[Math.floor((sorted.length * 2) / 3)]

  return (score: number) => {
    if (score < lowerThreshold) return 'LOW'
    if (score < upperThreshold) return 'MID'
    return 'HIGH'
  }
}

function toMomentumBand(delta: number): MomentumBand {
  if (Math.abs(delta) <= MOMENTUM_DEAD_BAND) return 'STABLE'
  return delta > 0 ? 'RISING' : 'DECLINING'
}

/**
 * Place every current-period employee on performance x momentum x consensus.
 *
 * Performance uses cohort-relative tertiles over all scored employees in the
 * current period so the grid populates meaningfully; the absolute score travels
 * with each entry so the UI can always show the real number.
 */
export function computeTalentGrid(params: {
  current: PeriodScoreMatrix
  comparison: PeriodScoreMatrix | null
}): TalentGridResult {
  const bandFor = toPerformanceBander(params.current.scores)
  const previousById = new Map(
    (params.comparison?.scores || []).map((entry) => [entry.employeeId, entry.overallScore])
  )

  const entries = params.current.scores.map((entry): TalentGridEntry => {
    const performanceBand = bandFor(entry.overallScore)
    const previousScore = previousById.get(entry.employeeId)
    const isNew = params.comparison !== null && previousScore === undefined
    const momentumDelta =
      previousScore === undefined ? null : entry.overallScore - previousScore
    const momentumBand = momentumDelta === null ? null : toMomentumBand(momentumDelta)

    return {
      employeeId: entry.employeeId,
      department: entry.department,
      performanceScore: entry.overallScore,
      performanceBand,
      momentumDelta,
      momentumBand,
      consensus: computeConsensus(entry.perLens),
      cellLabel: momentumBand ? CELL_LABELS[performanceBand][momentumBand] : null,
      isNew,
    }
  })

  return { entries, insufficientData: params.comparison === null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/analytics-talent-grid.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/talent-grid.ts tests/analytics-talent-grid.test.ts
git commit -m "feat: add analytics talent grid module

Cohort-relative performance tertiles, momentum banding with a dead band,
consensus from external lens spread, and nine labeled cells."
```

---

### Task 5: Blind spots module

**Files:**
- Create: `lib/analytics/blind-spots.ts`
- Create: `tests/analytics-blind-spots.test.ts`

**Interfaces:**
- Consumes: `PeriodScoreMatrix`, `EmployeePeriodScore` (Task 2); `RelationshipType` from `@/types`.
- Produces:
  - `BLIND_SPOT_FLAG_LIMIT = 5`
  - `BlindSpotEntry` — `{ employeeId, department, perLens, selfScore, weightedOthersScore, selfGap, lensSpread }`
  - `BlindSpotsResult` — `{ entries, topSelfGaps, topSpreads, insufficientData }`
  - `computeBlindSpots(matrix: PeriodScoreMatrix): BlindSpotsResult`

- [ ] **Step 1: Write the failing test**

Create `tests/analytics-blind-spots.test.ts`:

```typescript
import test from 'node:test'
import assert from 'node:assert/strict'
import { BLIND_SPOT_FLAG_LIMIT, computeBlindSpots } from '../lib/analytics/blind-spots'
import type { EmployeePeriodScore, PeriodScoreMatrix } from '../lib/analytics/period-score-matrix'

function employee(
  employeeId: string,
  perLens: EmployeePeriodScore['perLens'],
  weights: Record<string, number>
): EmployeePeriodScore {
  return { employeeId, department: 'dept-a', overallScore: 0, perLens, weights }
}

function lens(normalizedScore: number) {
  return { normalizedScore, evaluatorCount: 1 }
}

test('computeBlindSpots computes the self gap against a weighted others score', () => {
  const matrix: PeriodScoreMatrix = {
    periodId: 'p1',
    periodName: 'Q1',
    scores: [
      employee(
        'emp-1',
        { C_LEVEL: lens(2), PEER: lens(4), SELF: lens(4) },
        { C_LEVEL: 0.5, PEER: 0.5 }
      ),
    ],
  }

  const result = computeBlindSpots(matrix)
  const entry = result.entries[0]

  // weighted others = (2*0.5 + 4*0.5) / 1 = 3 ; gap = 4 - 3 = 1
  assert.equal(entry.weightedOthersScore, 3)
  assert.equal(entry.selfScore, 4)
  assert.equal(entry.selfGap, 1)
  // spread = 4 - 2 = 2
  assert.equal(entry.lensSpread, 2)
})

test('computeBlindSpots leaves the self gap null when there is no self score', () => {
  const matrix: PeriodScoreMatrix = {
    periodId: 'p1',
    periodName: 'Q1',
    scores: [employee('emp-1', { C_LEVEL: lens(2), PEER: lens(4) }, { C_LEVEL: 0.5, PEER: 0.5 })],
  }

  const result = computeBlindSpots(matrix)

  assert.equal(result.entries[0].selfScore, null)
  assert.equal(result.entries[0].selfGap, null)
  assert.equal(result.entries[0].lensSpread, 2)
})

test('computeBlindSpots excludes employees with fewer than two external lenses', () => {
  const matrix: PeriodScoreMatrix = {
    periodId: 'p1',
    periodName: 'Q1',
    scores: [
      employee('emp-1', { C_LEVEL: lens(2), SELF: lens(4) }, { C_LEVEL: 1 }),
      employee('emp-2', {}, {}),
    ],
  }

  const result = computeBlindSpots(matrix)

  assert.equal(result.entries.length, 0)
  assert.equal(result.insufficientData, true)
})

test('computeBlindSpots ranks flags by absolute self gap and by spread, capped at the limit', () => {
  const scores = Array.from({ length: 7 }, (_, index) =>
    employee(
      `emp-${index}`,
      { C_LEVEL: lens(1), PEER: lens(1 + index * 0.4), SELF: lens(4) },
      { C_LEVEL: 0.5, PEER: 0.5 }
    )
  )
  const result = computeBlindSpots({ periodId: 'p1', periodName: 'Q1', scores })

  assert.equal(result.topSelfGaps.length, BLIND_SPOT_FLAG_LIMIT)
  assert.equal(result.topSpreads.length, BLIND_SPOT_FLAG_LIMIT)
  // Widest spread is the last employee (PEER 1 + 6*0.4 = 3.4 vs C_LEVEL 1).
  assert.equal(result.topSpreads[0].employeeId, 'emp-6')
  // Largest |self gap| is the employee whose others score is lowest.
  assert.equal(result.topSelfGaps[0].employeeId, 'emp-0')
})

test('computeBlindSpots ranks a negative self gap by magnitude', () => {
  const matrix: PeriodScoreMatrix = {
    periodId: 'p1',
    periodName: 'Q1',
    scores: [
      employee('emp-under', { C_LEVEL: lens(4), PEER: lens(4), SELF: lens(1) }, { C_LEVEL: 0.5, PEER: 0.5 }),
      employee('emp-close', { C_LEVEL: lens(3), PEER: lens(3), SELF: lens(3) }, { C_LEVEL: 0.5, PEER: 0.5 }),
    ],
  }

  const result = computeBlindSpots(matrix)

  assert.equal(result.topSelfGaps[0].employeeId, 'emp-under')
  assert.equal(result.topSelfGaps[0].selfGap, -3)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/analytics-blind-spots.test.ts`
Expected: FAIL — `Cannot find module '../lib/analytics/blind-spots'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/analytics/blind-spots.ts`:

```typescript
import type { LensScore, PeriodScoreMatrix } from '@/lib/analytics/period-score-matrix'
import type { RelationshipType } from '@/types'

/** Maximum entries per flag list. */
export const BLIND_SPOT_FLAG_LIMIT = 5

/** Spread and gap analysis need at least two external lenses to mean anything. */
const MIN_EXTERNAL_LENSES = 2

export interface BlindSpotEntry {
  employeeId: string
  department: string | null
  /** 0-4 per lens, including SELF. */
  perLens: Partial<Record<RelationshipType, number>>
  selfScore: number | null
  weightedOthersScore: number | null
  /** selfScore - weightedOthersScore. Positive means they rate themselves above others do. */
  selfGap: number | null
  /** max - min across external lenses, on the 0-4 scale. */
  lensSpread: number | null
}

export interface BlindSpotsResult {
  entries: BlindSpotEntry[]
  topSelfGaps: BlindSpotEntry[]
  topSpreads: BlindSpotEntry[]
  insufficientData: boolean
}

/**
 * Surface where an employee is seen differently by different lenses, and where
 * their self-assessment diverges from everyone else's.
 *
 * Employees with fewer than two external lenses are excluded rather than shown
 * as zero — a single lens has no spread and no meaningful "others" baseline.
 */
export function computeBlindSpots(matrix: PeriodScoreMatrix): BlindSpotsResult {
  const entries: BlindSpotEntry[] = []

  for (const score of matrix.scores) {
    const externalLenses = Object.entries(score.perLens).filter(
      ([lens, lensScore]) => lens !== 'SELF' && lensScore !== undefined
    ) as Array<[RelationshipType, LensScore]>

    if (externalLenses.length < MIN_EXTERNAL_LENSES) continue

    const perLens: Partial<Record<RelationshipType, number>> = {}
    for (const [lens, lensScore] of Object.entries(score.perLens)) {
      if (!lensScore) continue
      perLens[lens as RelationshipType] = lensScore.normalizedScore
    }

    const externalScores = externalLenses.map(([, lensScore]) => lensScore.normalizedScore)
    const lensSpread = Math.max(...externalScores) - Math.min(...externalScores)

    let weightSum = 0
    let weightedTotal = 0
    for (const [lens, lensScore] of externalLenses) {
      const weight = score.weights[lens] ?? 0
      if (weight <= 0) continue
      weightSum += weight
      weightedTotal += lensScore.normalizedScore * weight
    }
    const weightedOthersScore = weightSum > 0 ? weightedTotal / weightSum : null

    const selfScore = score.perLens.SELF?.normalizedScore ?? null
    const selfGap =
      selfScore !== null && weightedOthersScore !== null ? selfScore - weightedOthersScore : null

    entries.push({
      employeeId: score.employeeId,
      department: score.department,
      perLens,
      selfScore,
      weightedOthersScore,
      selfGap,
      lensSpread,
    })
  }

  const topSelfGaps = entries
    .filter((entry): entry is BlindSpotEntry & { selfGap: number } => entry.selfGap !== null)
    .sort((a, b) => Math.abs(b.selfGap) - Math.abs(a.selfGap))
    .slice(0, BLIND_SPOT_FLAG_LIMIT)

  const topSpreads = entries
    .filter((entry): entry is BlindSpotEntry & { lensSpread: number } => entry.lensSpread !== null)
    .sort((a, b) => b.lensSpread - a.lensSpread)
    .slice(0, BLIND_SPOT_FLAG_LIMIT)

  return {
    entries,
    topSelfGaps,
    topSpreads,
    insufficientData: entries.length === 0,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/analytics-blind-spots.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/blind-spots.ts tests/analytics-blind-spots.test.ts
git commit -m "feat: add analytics blind spots module

Self-awareness gap against a weighted others score, external lens
spread, and ranked flag lists."
```

---

### Task 6: Calibration module

**Files:**
- Create: `lib/analytics/calibration.ts`
- Create: `tests/analytics-calibration.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks — inputs are plain rating rows and cap usage, supplied by the API in Task 7.
- Produces:
  - `MIN_RATINGS_FOR_CALIBRATION = 5`
  - `CalibrationRating` — `{ evaluatorId: string; ratingValue: number }`
  - `CapUsage` — `{ evaluatorId: string; scope: string; usedFours: number; maxAllowed: number }`
  - `EvaluatorCalibration` — `{ evaluatorId, ratingCount, meanRating, deviation, fourRatingCount, isExempt }`
  - `CalibrationResult` — `{ orgMeanRating, totalRatings, distribution, fourRatingShare, mostLenient, mostSevere, evaluatorsAtCap, evaluatorsNearCap, insufficientData }`
  - `computeCalibration(params: { ratings: readonly CalibrationRating[]; capUsage: readonly CapUsage[]; exemptEvaluatorIds: ReadonlySet<string> }): CalibrationResult`

- [ ] **Step 1: Write the failing test**

Create `tests/analytics-calibration.test.ts`:

```typescript
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeCalibration,
  MIN_RATINGS_FOR_CALIBRATION,
  type CalibrationRating,
} from '../lib/analytics/calibration'

function ratings(evaluatorId: string, values: number[]): CalibrationRating[] {
  return values.map((ratingValue) => ({ evaluatorId, ratingValue }))
}

test('computeCalibration ranks evaluators by deviation from the org mean', () => {
  const result = computeCalibration({
    ratings: [
      ...ratings('lenient', [4, 4, 4, 4, 4]),
      ...ratings('severe', [1, 1, 1, 1, 1]),
    ],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  assert.equal(result.orgMeanRating, 2.5)
  assert.equal(result.mostLenient[0].evaluatorId, 'lenient')
  assert.equal(result.mostLenient[0].deviation, 1.5)
  assert.equal(result.mostSevere[0].evaluatorId, 'severe')
  assert.equal(result.mostSevere[0].deviation, -1.5)
})

test('computeCalibration ignores evaluators below the minimum rating count', () => {
  const result = computeCalibration({
    ratings: [...ratings('busy', [3, 3, 3, 3, 3]), ...ratings('sparse', [4])],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  const ranked = [...result.mostLenient, ...result.mostSevere].map((entry) => entry.evaluatorId)

  assert.equal(ranked.includes('sparse'), false)
  assert.equal(ranked.includes('busy'), true)
  assert.equal(MIN_RATINGS_FOR_CALIBRATION, 5)
})

test('computeCalibration builds the 1-4 distribution and the share of top ratings', () => {
  const result = computeCalibration({
    ratings: ratings('evaluator-1', [1, 2, 3, 4, 4]),
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  assert.deepEqual(result.distribution, [
    { rating: 1, count: 1 },
    { rating: 2, count: 1 },
    { rating: 3, count: 1 },
    { rating: 4, count: 2 },
  ])
  assert.equal(result.totalRatings, 5)
  assert.equal(result.fourRatingShare, 0.4)
})

test('computeCalibration counts evaluators at and near the cap, excluding exempt ones', () => {
  const result = computeCalibration({
    ratings: ratings('evaluator-1', [4, 4, 4, 4, 4]),
    capUsage: [
      { evaluatorId: 'at-cap', scope: 'PEER', usedFours: 2, maxAllowed: 2 },
      { evaluatorId: 'near-cap', scope: 'PEER', usedFours: 1, maxAllowed: 2 },
      { evaluatorId: 'clear', scope: 'PEER', usedFours: 0, maxAllowed: 2 },
      { evaluatorId: 'exempt-1', scope: 'PEER', usedFours: 9, maxAllowed: 2 },
    ],
    exemptEvaluatorIds: new Set(['exempt-1']),
  })

  assert.equal(result.evaluatorsAtCap, 1)
  // near = usedFours >= maxAllowed - 1, which includes the at-cap evaluator.
  assert.equal(result.evaluatorsNearCap, 2)
})

test('computeCalibration counts an evaluator at cap if any single scope is exhausted', () => {
  const result = computeCalibration({
    ratings: ratings('evaluator-1', [3, 3, 3, 3, 3]),
    capUsage: [
      { evaluatorId: 'multi', scope: 'PEER', usedFours: 0, maxAllowed: 2 },
      { evaluatorId: 'multi', scope: 'TEAM_LEAD', usedFours: 3, maxAllowed: 3 },
    ],
    exemptEvaluatorIds: new Set(),
  })

  assert.equal(result.evaluatorsAtCap, 1)
})

test('computeCalibration flags insufficient data with no ratings', () => {
  const result = computeCalibration({
    ratings: [],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  assert.equal(result.insufficientData, true)
  assert.equal(result.orgMeanRating, 0)
  assert.equal(result.fourRatingShare, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/analytics-calibration.test.ts`
Expected: FAIL — `Cannot find module '../lib/analytics/calibration'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/analytics/calibration.ts`:

```typescript
/** Below this many ratings an evaluator's mean is too noisy to rank. */
export const MIN_RATINGS_FOR_CALIBRATION = 5

/** Maximum entries per leniency list. */
const LENIENCY_LIMIT = 5

/** The rating buckets shown in the distribution. */
const DISTRIBUTION_BUCKETS = [1, 2, 3, 4] as const

/** The top rating value, which the four-rating quota governs. */
const TOP_RATING = 4

export interface CalibrationRating {
  evaluatorId: string
  ratingValue: number
}

/** One evaluator's four-rating usage within a single quota scope. */
export interface CapUsage {
  evaluatorId: string
  scope: string
  usedFours: number
  maxAllowed: number
}

export interface EvaluatorCalibration {
  evaluatorId: string
  ratingCount: number
  meanRating: number
  /** meanRating - orgMeanRating. Positive means more lenient than the org. */
  deviation: number
  fourRatingCount: number
  isExempt: boolean
}

export interface CalibrationResult {
  orgMeanRating: number
  totalRatings: number
  distribution: Array<{ rating: number; count: number }>
  fourRatingShare: number
  mostLenient: EvaluatorCalibration[]
  mostSevere: EvaluatorCalibration[]
  evaluatorsAtCap: number
  evaluatorsNearCap: number
  insufficientData: boolean
}

/**
 * Evaluator-side calibration: who rates high, who rates low, how ratings are
 * distributed, and how hard the four-rating cap is biting.
 *
 * Evaluators exempt from the cap (partner-level titles and the configured
 * C-level evaluator) are excluded from at/near-cap counts — an uncapped
 * evaluator giving many top ratings is expected, not a calibration signal. They
 * remain in the leniency lists, flagged, since their leniency is still real.
 */
export function computeCalibration(params: {
  ratings: readonly CalibrationRating[]
  capUsage: readonly CapUsage[]
  exemptEvaluatorIds: ReadonlySet<string>
}): CalibrationResult {
  const totalRatings = params.ratings.length

  if (totalRatings === 0) {
    return {
      orgMeanRating: 0,
      totalRatings: 0,
      distribution: DISTRIBUTION_BUCKETS.map((rating) => ({ rating, count: 0 })),
      fourRatingShare: 0,
      mostLenient: [],
      mostSevere: [],
      evaluatorsAtCap: 0,
      evaluatorsNearCap: 0,
      insufficientData: true,
    }
  }

  const orgMeanRating =
    params.ratings.reduce((sum, rating) => sum + rating.ratingValue, 0) / totalRatings

  const distribution = DISTRIBUTION_BUCKETS.map((rating) => ({
    rating,
    count: params.ratings.filter((entry) => Math.round(entry.ratingValue) === rating).length,
  }))

  const fourRatingCount = params.ratings.filter((entry) => entry.ratingValue === TOP_RATING).length

  const byEvaluator = new Map<string, CalibrationRating[]>()
  for (const rating of params.ratings) {
    byEvaluator.set(rating.evaluatorId, [...(byEvaluator.get(rating.evaluatorId) || []), rating])
  }

  const evaluators: EvaluatorCalibration[] = [...byEvaluator.entries()]
    .filter(([, evaluatorRatings]) => evaluatorRatings.length >= MIN_RATINGS_FOR_CALIBRATION)
    .map(([evaluatorId, evaluatorRatings]) => {
      const meanRating =
        evaluatorRatings.reduce((sum, rating) => sum + rating.ratingValue, 0) /
        evaluatorRatings.length
      return {
        evaluatorId,
        ratingCount: evaluatorRatings.length,
        meanRating,
        deviation: meanRating - orgMeanRating,
        fourRatingCount: evaluatorRatings.filter((rating) => rating.ratingValue === TOP_RATING)
          .length,
        isExempt: params.exemptEvaluatorIds.has(evaluatorId),
      }
    })

  const cappedUsage = params.capUsage.filter(
    (usage) => !params.exemptEvaluatorIds.has(usage.evaluatorId)
  )
  const atCap = new Set(
    cappedUsage.filter((usage) => usage.usedFours >= usage.maxAllowed).map((usage) => usage.evaluatorId)
  )
  const nearCap = new Set(
    cappedUsage
      .filter((usage) => usage.usedFours >= usage.maxAllowed - 1)
      .map((usage) => usage.evaluatorId)
  )

  return {
    orgMeanRating,
    totalRatings,
    distribution,
    fourRatingShare: fourRatingCount / totalRatings,
    mostLenient: [...evaluators].sort((a, b) => b.deviation - a.deviation).slice(0, LENIENCY_LIMIT),
    mostSevere: [...evaluators].sort((a, b) => a.deviation - b.deviation).slice(0, LENIENCY_LIMIT),
    evaluatorsAtCap: atCap.size,
    evaluatorsNearCap: nearCap.size,
    insufficientData: false,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/analytics-calibration.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/calibration.ts tests/analytics-calibration.test.ts
git commit -m "feat: add analytics calibration module

Evaluator leniency vs the org mean, rating distribution, top-rating
share, and cap usage with exempt evaluators excluded."
```

---

### Task 7: Insights API endpoint

Wire all four modules behind one admin-gated endpoint returning a combined payload.

**Files:**
- Create: `app/api/admin/analytics/insights/route.ts`

**Interfaces:**
- Consumes: `computePeriodScoreMatrix` (Task 2); `computeTrends` (Task 3); `computeTalentGrid` (Task 4); `computeBlindSpots` (Task 5); `computeCalibration`, `CapUsage` (Task 6); `getSession` from `@/lib/auth`; `isAdminRole` from `@/lib/permissions`; `getResolvedQuestionCount` from `@/lib/pre-evaluation`; `getResolvedEvaluationAssignments` from `@/lib/evaluation-assignments`; `getFourRatingQuotaScopeType`, `shouldCountAssignmentTowardsFourRatingQuota`, `getMaxAllowedFourRatings`, `isExemptFromFourRatingCapByTitle` from `@/lib/evaluation-rating-quota`; `HAMIZ_EVALUATOR` from `@/lib/config`.
- Produces: `GET /api/admin/analytics/insights?periodId=<id|active>` returning
  `{ currentPeriod, comparisonPeriod, periods, trends, talentGrid, blindSpots, calibration }`.

- [ ] **Step 1: Write the implementation**

Create `app/api/admin/analytics/insights/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import { computePeriodScoreMatrix, type PeriodScoreMatrix } from '@/lib/analytics/period-score-matrix'
import { computeTrends } from '@/lib/analytics/trends'
import { computeTalentGrid } from '@/lib/analytics/talent-grid'
import { computeBlindSpots } from '@/lib/analytics/blind-spots'
import { computeCalibration, type CapUsage } from '@/lib/analytics/calibration'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { getResolvedQuestionCount } from '@/lib/pre-evaluation'
import {
  getFourRatingQuotaScopeType,
  getMaxAllowedFourRatings,
  isExemptFromFourRatingCapByTitle,
  shouldCountAssignmentTowardsFourRatingQuota,
} from '@/lib/evaluation-rating-quota'
import { HAMIZ_EVALUATOR } from '@/lib/config'

/**
 * Evaluators whose four-rating budget is unlimited: any partner-level title,
 * plus the configured C-level evaluator. Mirrors lib/evaluation-rating-quota.
 */
async function getExemptEvaluatorIds(): Promise<Set<string>> {
  const users = await prisma.user.findMany({ select: { id: true, name: true, position: true } })
  const exemptName = HAMIZ_EVALUATOR.trim().toLowerCase()

  return new Set(
    users
      .filter(
        (user) =>
          isExemptFromFourRatingCapByTitle(user.position) ||
          (user.name || '').trim().toLowerCase() === exemptName
      )
      .map((user) => user.id)
  )
}

/**
 * Build per-(evaluator, quota scope) four-rating usage for the period.
 *
 * Question counts are resolved per assignment exactly as the existing analytics
 * route does, then grouped into the same quota scopes the submit-time validator
 * uses, so "at cap" here means what it means at submit time.
 */
async function buildCapUsage(periodId: string): Promise<CapUsage[]> {
  const assignments = await getResolvedEvaluationAssignments(periodId)
  const quotaAssignments = assignments.filter((assignment) =>
    shouldCountAssignmentTowardsFourRatingQuota({
      assignment: {
        evaluatorId: assignment.evaluatorId,
        evaluateeId: assignment.evaluateeId,
        relationshipType: assignment.relationshipType as RelationshipType,
      },
    })
  )

  const questionCounts = await Promise.all(
    quotaAssignments.map(async (assignment) => ({
      evaluatorId: assignment.evaluatorId,
      evaluateeId: assignment.evaluateeId,
      scope: getFourRatingQuotaScopeType(assignment.relationshipType as RelationshipType),
      total: await getResolvedQuestionCount({
        relationshipType: assignment.relationshipType as RelationshipType,
        periodId,
        evaluatorId: assignment.evaluatorId,
        evaluateeId: assignment.evaluateeId,
      }),
    }))
  )

  const totalsByKey = new Map<string, { evaluatorId: string; scope: string; total: number }>()
  for (const entry of questionCounts) {
    const key = `${entry.evaluatorId}:${entry.scope}`
    const existing = totalsByKey.get(key)
    totalsByKey.set(key, {
      evaluatorId: entry.evaluatorId,
      scope: entry.scope,
      total: (existing?.total ?? 0) + entry.total,
    })
  }

  const scopeByPair = new Map(
    quotaAssignments.map((assignment) => [
      `${assignment.evaluatorId}:${assignment.evaluateeId}`,
      getFourRatingQuotaScopeType(assignment.relationshipType as RelationshipType),
    ])
  )
  const submittedFours = await prisma.evaluation.findMany({
    where: { periodId, submittedAt: { not: null }, ratingValue: 4 },
    select: { evaluatorId: true, evaluateeId: true },
  })

  const usedByKey = new Map<string, number>()
  for (const evaluation of submittedFours) {
    const scope = scopeByPair.get(`${evaluation.evaluatorId}:${evaluation.evaluateeId}`)
    if (!scope) continue
    const key = `${evaluation.evaluatorId}:${scope}`
    usedByKey.set(key, (usedByKey.get(key) ?? 0) + 1)
  }

  return [...totalsByKey.entries()].map(([key, entry]) => ({
    evaluatorId: entry.evaluatorId,
    scope: entry.scope,
    usedFours: usedByKey.get(key) ?? 0,
    maxAllowed: getMaxAllowedFourRatings(entry.total),
  }))
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const periods = await prisma.evaluationPeriod.findMany({ orderBy: { startDate: 'asc' } })
    if (periods.length === 0) {
      return NextResponse.json({ error: 'No period found' }, { status: 404 })
    }

    // Only periods with submitted evaluations can produce scores.
    const periodsWithData = await prisma.evaluation.groupBy({
      by: ['periodId'],
      where: { submittedAt: { not: null } },
    })
    const withDataIds = new Set(periodsWithData.map((entry) => entry.periodId))
    const scorablePeriods = periods.filter((period) => withDataIds.has(period.id))

    if (scorablePeriods.length === 0) {
      return NextResponse.json({ error: 'No evaluation data found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const requestedPeriodId = searchParams.get('periodId')
    const activePeriod = scorablePeriods.find((period) => period.isActive)
    const latestPeriod = scorablePeriods[scorablePeriods.length - 1]
    const currentPeriod =
      (requestedPeriodId && requestedPeriodId !== 'active'
        ? scorablePeriods.find((period) => period.id === requestedPeriodId)
        : undefined) ||
      activePeriod ||
      latestPeriod

    const currentIndex = scorablePeriods.findIndex((period) => period.id === currentPeriod.id)
    const comparisonPeriod = currentIndex > 0 ? scorablePeriods[currentIndex - 1] : null

    const matrices = (
      await Promise.all(
        scorablePeriods.map(async (period) => {
          try {
            return await computePeriodScoreMatrix(period.id)
          } catch (error) {
            console.error(`Failed to compute score matrix for period ${period.id}:`, error)
            return null
          }
        })
      )
    ).filter((matrix): matrix is PeriodScoreMatrix => matrix !== null)

    const currentMatrix = matrices.find((matrix) => matrix.periodId === currentPeriod.id)
    if (!currentMatrix) {
      return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 })
    }
    const comparisonMatrix =
      matrices.find((matrix) => matrix.periodId === comparisonPeriod?.id) || null

    const [exemptEvaluatorIds, capUsage, ratingRows] = await Promise.all([
      getExemptEvaluatorIds(),
      buildCapUsage(currentPeriod.id),
      prisma.evaluation.findMany({
        where: { periodId: currentPeriod.id, submittedAt: { not: null }, ratingValue: { not: null } },
        select: { evaluatorId: true, ratingValue: true },
      }),
    ])

    return NextResponse.json({
      currentPeriod: { id: currentPeriod.id, name: currentPeriod.name },
      comparisonPeriod: comparisonPeriod
        ? { id: comparisonPeriod.id, name: comparisonPeriod.name }
        : null,
      periods: scorablePeriods.map((period) => ({ id: period.id, name: period.name })),
      trends: computeTrends({
        matrices,
        currentPeriodId: currentPeriod.id,
        comparisonPeriodId: comparisonPeriod?.id ?? null,
      }),
      talentGrid: computeTalentGrid({ current: currentMatrix, comparison: comparisonMatrix }),
      blindSpots: computeBlindSpots(currentMatrix),
      calibration: computeCalibration({
        ratings: ratingRows.map((row) => ({
          evaluatorId: row.evaluatorId,
          ratingValue: row.ratingValue as number,
        })),
        capUsage,
        exemptEvaluatorIds,
      }),
    })
  } catch (error) {
    console.error('Failed to fetch analytics insights:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics insights' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the route responds against the dev server**

Run: `npx next dev` in one shell, then in another:

```bash
curl -i http://localhost:3000/api/admin/analytics/insights
```

Expected: `HTTP/1.1 401` with `{"error":"Unauthorized"}` — proves the admin gate is wired. (An authenticated browser session on `/admin/analytics` will exercise the success path in Task 8.)

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — no regressions.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/analytics/insights/route.ts
git commit -m "feat: add admin analytics insights endpoint

Combined admin-gated payload wiring the trends, talent grid, blind
spots, and calibration modules over the period score matrix."
```

---

### Task 8: Analytics page shell

Turn the single page into a thin shell: period selector, sub-tabs, both fetches. Move today's content into `OverviewTab` untouched.

**Files:**
- Create: `components/analytics/OverviewTab.tsx`
- Modify: `app/(hr)/admin/analytics/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `GET /api/admin/analytics` (existing) and `GET /api/admin/analytics/insights` (Task 7); `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`; `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/select`.
- Produces:
  - `components/analytics/types.ts` — `Analytics`, `InsightsPayload` shared response types.
  - `OverviewTab({ analytics }: { analytics: Analytics })`

- [ ] **Step 1: Create the shared response types**

Create `components/analytics/types.ts`:

```typescript
import type { TrendsResult } from '@/lib/analytics/trends'
import type { TalentGridResult } from '@/lib/analytics/talent-grid'
import type { BlindSpotsResult } from '@/lib/analytics/blind-spots'
import type { CalibrationResult } from '@/lib/analytics/calibration'

export interface Analytics {
  period: { id: string; name: string; startDate: string; endDate: string }
  summary: {
    totalTeamMembers?: number
    totalEmployees: number
    employeesWithEvaluations: number
    employeesComplete?: number
    totalEvaluations: number
    totalReports: number
    avgOverallScore: number
    completionRate: number
  }
  departmentData: Array<{
    name: string
    employees: number
    completed: number
    completionRate: number
    avgScore: number
  }>
  scoreDistribution: Array<{ range: string; count: number }>
  relationshipData: Array<{ type: string; count: number }>
  topPerformers: Array<{ name: string; department: string | null; score: number }>
  bottomPerformers: Array<{ name: string; department: string | null; score: number }>
}

export interface PeriodRef {
  id: string
  name: string
}

export interface InsightsPayload {
  currentPeriod: PeriodRef
  comparisonPeriod: PeriodRef | null
  periods: PeriodRef[]
  trends: TrendsResult
  talentGrid: TalentGridResult
  blindSpots: BlindSpotsResult
  calibration: CalibrationResult
}

/** Maps an employeeId to a display name, resolved client-side from the directory. */
export type NameResolver = (employeeId: string) => string
```

- [ ] **Step 2: Extract `OverviewTab`**

Create `components/analytics/OverviewTab.tsx` by moving the existing markup out of the page. Copy the **entire** JSX currently inside `app/(hr)/admin/analytics/page.tsx` from the `{/* Stats Grid */}` comment through the closing `</div>` of the Performers block, unchanged, into this component:

```tsx
'use client'

import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Users, CheckCircle, FileText, TrendingUp, Trophy, AlertCircle } from 'lucide-react'
import type { Analytics } from '@/components/analytics/types'

interface OverviewTabProps {
  analytics: Analytics
}

export function OverviewTab({ analytics }: OverviewTabProps) {
  const statCards = [
    {
      label: 'Team Members',
      value: analytics.summary.totalTeamMembers ?? analytics.summary.totalEmployees,
      icon: Users,
      color: 'text-primary',
    },
    {
      label: 'Complete',
      value: `${analytics.summary.employeesComplete ?? analytics.summary.employeesWithEvaluations}/${
        analytics.summary.totalTeamMembers ?? analytics.summary.totalEmployees
      }`,
      icon: CheckCircle,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Avg Completion',
      value: `${analytics.summary.completionRate.toFixed(1)}%`,
      icon: FileText,
      color: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Avg Score',
      value: `${analytics.summary.avgOverallScore.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'text-amber-600 dark:text-amber-400',
    },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
          >
            <Card>
              <CardContent className="p-5">
                <stat.icon className={`w-6 h-6 ${stat.color} mb-2`} />
                <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Department Performance</h3>
              {analytics.departmentData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.departmentData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="avgScore" name="Avg Score (%)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completionRate" name="Completion (%)" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No department data
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Score Distribution</h3>
              {analytics.scoreDistribution.some((entry) => entry.count > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.scoreDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="range" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Bar dataKey="count" name="Employees" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">No score data</div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-semibold text-foreground">Top Performers</h3>
              </div>
              {analytics.topPerformers.length > 0 ? (
                <div className="space-y-3">
                  {analytics.topPerformers.map((performer, index) => (
                    <div
                      key={`${performer.name}-${index}`}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                            index === 0
                              ? 'bg-amber-500'
                              : index === 1
                                ? 'bg-gray-400'
                                : index === 2
                                  ? 'bg-amber-700'
                                  : 'bg-primary'
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{performer.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {performer.department || 'No department'}
                          </div>
                        </div>
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {performer.score.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">No data available</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-semibold text-foreground">Needs Improvement</h3>
              </div>
              {analytics.bottomPerformers.length > 0 ? (
                <div className="space-y-3">
                  {analytics.bottomPerformers.map((performer, index) => (
                    <div
                      key={`${performer.name}-${index}`}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{performer.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {performer.department || 'No department'}
                          </div>
                        </div>
                      </div>
                      <div className="text-red-600 dark:text-red-400 font-semibold">
                        {performer.score.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">No data available</div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite the page as a shell**

Replace the entire contents of `app/(hr)/admin/analytics/page.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertCircle } from 'lucide-react'
import { OverviewTab } from '@/components/analytics/OverviewTab'
import type { Analytics, InsightsPayload } from '@/components/analytics/types'

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [insights, setInsights] = useState<InsightsPayload | null>(null)
  const [periodId, setPeriodId] = useState<string>('active')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async (selectedPeriodId: string) => {
    setLoading(true)
    try {
      const query = selectedPeriodId === 'active' ? '' : `?periodId=${selectedPeriodId}`
      const [analyticsRes, insightsRes] = await Promise.all([
        fetch(`/api/admin/analytics${query}`),
        fetch(`/api/admin/analytics/insights${query}`),
      ])
      const [analyticsData, insightsData] = await Promise.all([
        analyticsRes.json(),
        insightsRes.json(),
      ])

      if (analyticsData.error) {
        toast.error(analyticsData.error)
      } else {
        setAnalytics(analyticsData)
      }

      if (insightsData.error) {
        toast.error(insightsData.error)
      } else {
        setInsights(insightsData)
      }
    } catch (error) {
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(periodId)
  }, [loadData, periodId])

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading analytics..." />
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No analytics data available.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {analytics.period.name} • {new Date(analytics.period.startDate).toLocaleDateString()} -{' '}
            {new Date(analytics.period.endDate).toLocaleDateString()}
          </p>
        </div>

        {insights && insights.periods.length > 0 && (
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active period</SelectItem>
              {insights.periods.map((period) => (
                <SelectItem key={period.id} value={period.id}>
                  {period.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="talent">Talent Grid</TabsTrigger>
          <TabsTrigger value="blindspots">Blind Spots</TabsTrigger>
          <TabsTrigger value="calibration">Calibration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab analytics={analytics} />
        </TabsContent>
        <TabsContent value="trends">
          <div className="text-muted-foreground">Trends view arrives in the next task.</div>
        </TabsContent>
        <TabsContent value="talent">
          <div className="text-muted-foreground">Talent Grid arrives in a later task.</div>
        </TabsContent>
        <TabsContent value="blindspots">
          <div className="text-muted-foreground">Blind Spots arrives in a later task.</div>
        </TabsContent>
        <TabsContent value="calibration">
          <div className="text-muted-foreground">Calibration arrives in a later task.</div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Run: `npx next dev`, sign in as an admin, open `http://localhost:3000/admin/analytics`.
Expected: the Overview tab renders exactly as before; the period selector lists periods; the four other tabs render their placeholder text.

- [ ] **Step 6: Commit**

```bash
git add components/analytics/types.ts components/analytics/OverviewTab.tsx "app/(hr)/admin/analytics/page.tsx"
git commit -m "refactor: split analytics page into a tabbed shell

Extracts the existing dashboard into OverviewTab and adds a period
selector plus sub-tabs for the incoming insight views."
```

---

### Task 9: Trends tab

**Files:**
- Create: `components/analytics/TrendsTab.tsx`
- Modify: `app/(hr)/admin/analytics/page.tsx` (swap the trends placeholder)

**Interfaces:**
- Consumes: `InsightsPayload`, `NameResolver` (Task 8); `TrendsResult` (Task 3).
- Produces: `TrendsTab({ trends, resolveName }: { trends: TrendsResult; resolveName: NameResolver })`

- [ ] **Step 1: Write the component**

Create `components/analytics/TrendsTab.tsx`:

```tsx
'use client'

import { motion } from 'framer-motion'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowDownRight, ArrowUpRight, Sparkles } from 'lucide-react'
import type { Mover, TrendsResult } from '@/lib/analytics/trends'
import type { NameResolver } from '@/components/analytics/types'

const DEPARTMENT_COLORS = [
  'hsl(var(--primary))',
  'hsl(142 71% 45%)',
  'hsl(217 91% 60%)',
  'hsl(38 92% 50%)',
  'hsl(280 65% 60%)',
  'hsl(0 72% 51%)',
]

interface TrendsTabProps {
  trends: TrendsResult
  resolveName: NameResolver
}

interface MoverListProps {
  title: string
  movers: Mover[]
  resolveName: NameResolver
  tone: 'positive' | 'negative'
}

function MoverList({ title, movers, resolveName, tone }: MoverListProps) {
  const Icon = tone === 'positive' ? ArrowUpRight : ArrowDownRight
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400'

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Icon className={`w-5 h-5 ${toneClass}`} />
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        {movers.length > 0 ? (
          <div className="space-y-3">
            {movers.map((mover, index) => (
              <motion.div
                key={mover.employeeId}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index }}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div>
                  <div className="font-medium text-foreground">{resolveName(mover.employeeId)}</div>
                  <div className="text-xs text-muted-foreground">
                    {mover.department || 'No department'} • {mover.previousScore.toFixed(1)}% →{' '}
                    {mover.currentScore.toFixed(1)}%
                  </div>
                </div>
                <div className={`font-semibold ${toneClass}`}>
                  {mover.delta > 0 ? '+' : ''}
                  {mover.delta.toFixed(1)}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">No data available</div>
        )}
      </CardContent>
    </Card>
  )
}

export function TrendsTab({ trends, resolveName }: TrendsTabProps) {
  if (trends.insufficientData) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Trends need at least two completed evaluation periods. This view fills in once the next
            quarter closes.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Recharts needs one row per period with a key per department.
  const chartData = trends.orgSeries.map((point) => {
    const row: Record<string, string | number> = {
      periodName: point.periodName,
      Organization: Number(point.avgScore.toFixed(2)),
    }
    for (const series of trends.departmentSeries) {
      const match = series.points.find((entry) => entry.periodId === point.periodId)
      if (match) {
        row[series.department] = Number(match.avgScore.toFixed(2))
      }
    }
    return row
  })

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Score Trajectory</h3>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="periodName" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Organization"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  animationDuration={900}
                />
                {trends.departmentSeries.map((series, index) => (
                  <Line
                    key={series.department}
                    type="monotone"
                    dataKey={series.department}
                    stroke={DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length]}
                    strokeWidth={2}
                    strokeOpacity={0.8}
                    dot={{ r: 3 }}
                    animationDuration={900}
                    animationBegin={120 * (index + 1)}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MoverList
          title="Biggest Improvers"
          movers={trends.topImprovers}
          resolveName={resolveName}
          tone="positive"
        />
        <MoverList
          title="Biggest Decliners"
          movers={trends.topDecliners}
          resolveName={resolveName}
          tone="negative"
        />
      </div>

      {trends.newJoiners.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              New This Period ({trends.newJoiners.length})
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              No prior score, so they have no momentum yet and are not ranked as movers.
            </p>
            <div className="flex flex-wrap gap-2">
              {trends.newJoiners.map((joiner) => (
                <span key={joiner.employeeId} className="px-3 py-1 bg-muted rounded-full text-sm">
                  {resolveName(joiner.employeeId)} — {joiner.currentScore.toFixed(1)}%
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add a name resolver and wire the tab into the page**

The insight modules return `employeeId`s only. Resolve display names client-side from the existing users endpoint.

In `app/(hr)/admin/analytics/page.tsx`, add the import:

```tsx
import { TrendsTab } from '@/components/analytics/TrendsTab'
```

Add this state and effect below the existing `useState` declarations:

```tsx
  const [namesById, setNamesById] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    // GET /api/users responds with { users: [{ id, name, department, position }] }.
    fetch('/api/users')
      .then((res) => res.json())
      .then((data: { users?: Array<{ id?: string; name?: string }> }) => {
        if (cancelled || !Array.isArray(data.users)) return
        const entries: Record<string, string> = {}
        for (const entry of data.users) {
          if (entry.id && entry.name) entries[entry.id] = entry.name
        }
        setNamesById(entries)
      })
      .catch(() => {
        // Names are cosmetic; the views fall back to the id.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const resolveName = useCallback(
    (employeeId: string) => namesById[employeeId] || employeeId,
    [namesById]
  )
```

Replace the trends `TabsContent` block:

```tsx
        <TabsContent value="trends">
          {insights ? (
            <TrendsTab trends={insights.trends} resolveName={resolveName} />
          ) : (
            <div className="text-muted-foreground">No insight data available.</div>
          )}
        </TabsContent>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Open `/admin/analytics` → **Trends** tab.
Expected: an animated multi-line chart (organization plus one line per department) and two mover lists with **real names, not raw ids** — if you see ids, the `/api/users` shape changed and the effect in Step 2 needs updating. With only two periods, the chart shows two points.

- [ ] **Step 5: Commit**

```bash
git add components/analytics/TrendsTab.tsx "app/(hr)/admin/analytics/page.tsx"
git commit -m "feat: add analytics trends tab

Animated org and department trajectory lines plus improver/decliner
lists, with client-side name resolution."
```

---

### Task 10: Calibration tab

**Files:**
- Create: `components/analytics/CalibrationTab.tsx`
- Modify: `app/(hr)/admin/analytics/page.tsx` (swap the calibration placeholder)

**Interfaces:**
- Consumes: `CalibrationResult`, `EvaluatorCalibration` (Task 6); `NameResolver` (Task 8).
- Produces: `CalibrationTab({ calibration, resolveName }: { calibration: CalibrationResult; resolveName: NameResolver })`

- [ ] **Step 1: Write the component**

Create `components/analytics/CalibrationTab.tsx`:

```tsx
'use client'

import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Scale, ShieldCheck } from 'lucide-react'
import type { CalibrationResult, EvaluatorCalibration } from '@/lib/analytics/calibration'
import type { NameResolver } from '@/components/analytics/types'

interface CalibrationTabProps {
  calibration: CalibrationResult
  resolveName: NameResolver
}

interface EvaluatorListProps {
  title: string
  subtitle: string
  evaluators: EvaluatorCalibration[]
  resolveName: NameResolver
}

function EvaluatorList({ title, subtitle, evaluators, resolveName }: EvaluatorListProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
        {evaluators.length > 0 ? (
          <div className="space-y-3">
            {evaluators.map((evaluator, index) => (
              <motion.div
                key={evaluator.evaluatorId}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index }}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div>
                  <div className="font-medium text-foreground">
                    {resolveName(evaluator.evaluatorId)}
                    {evaluator.isExempt && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-background text-muted-foreground">
                        uncapped
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {evaluator.ratingCount} ratings • mean {evaluator.meanRating.toFixed(2)}
                  </div>
                </div>
                <div
                  className={`font-semibold ${
                    evaluator.deviation >= 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {evaluator.deviation > 0 ? '+' : ''}
                  {evaluator.deviation.toFixed(2)}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">No data available</div>
        )}
      </CardContent>
    </Card>
  )
}

export function CalibrationTab({ calibration, resolveName }: CalibrationTabProps) {
  if (calibration.insufficientData) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Scale className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No submitted ratings in this period yet.</p>
        </CardContent>
      </Card>
    )
  }

  const stats = [
    { label: 'Org Mean Rating', value: calibration.orgMeanRating.toFixed(2) },
    { label: 'Total Ratings', value: String(calibration.totalRatings) },
    { label: 'Share of 4s', value: `${(calibration.fourRatingShare * 100).toFixed(1)}%` },
    { label: 'At / Near Cap', value: `${calibration.evaluatorsAtCap} / ${calibration.evaluatorsNearCap}` },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
          >
            <Card>
              <CardContent className="p-5">
                <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Rating Distribution</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={calibration.distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="rating" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Ratings"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  animationDuration={900}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EvaluatorList
          title="Most Lenient"
          subtitle="Rates above the org mean"
          evaluators={calibration.mostLenient}
          resolveName={resolveName}
        />
        <EvaluatorList
          title="Most Severe"
          subtitle="Rates below the org mean"
          evaluators={calibration.mostSevere}
          resolveName={resolveName}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire the tab into the page**

In `app/(hr)/admin/analytics/page.tsx`, add the import:

```tsx
import { CalibrationTab } from '@/components/analytics/CalibrationTab'
```

Replace the calibration `TabsContent` block:

```tsx
        <TabsContent value="calibration">
          {insights ? (
            <CalibrationTab calibration={insights.calibration} resolveName={resolveName} />
          ) : (
            <div className="text-muted-foreground">No insight data available.</div>
          )}
        </TabsContent>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Open `/admin/analytics` → **Calibration** tab.
Expected: four stat cards, an animated 1–4 distribution histogram, and lenient/severe evaluator lists with `uncapped` badges on exempt evaluators.

- [ ] **Step 5: Commit**

```bash
git add components/analytics/CalibrationTab.tsx "app/(hr)/admin/analytics/page.tsx"
git commit -m "feat: add analytics calibration tab

Rating distribution, org mean, top-rating share, cap usage, and
lenient/severe evaluator rankings."
```

---

### Task 11: Blind spots tab

**Files:**
- Create: `components/analytics/BlindSpotsTab.tsx`
- Modify: `app/(hr)/admin/analytics/page.tsx` (swap the blind-spots placeholder)

**Interfaces:**
- Consumes: `BlindSpotsResult`, `BlindSpotEntry` (Task 5); `RELATIONSHIP_TYPE_LABELS`, `RelationshipType` from `@/types`; `NameResolver` (Task 8).
- Produces: `BlindSpotsTab({ blindSpots, resolveName }: { blindSpots: BlindSpotsResult; resolveName: NameResolver })`

- [ ] **Step 1: Write the component**

Create `components/analytics/BlindSpotsTab.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Eye, Users } from 'lucide-react'
import type { BlindSpotEntry, BlindSpotsResult } from '@/lib/analytics/blind-spots'
import { RELATIONSHIP_TYPE_LABELS, type RelationshipType } from '@/types'
import type { NameResolver } from '@/components/analytics/types'

interface BlindSpotsTabProps {
  blindSpots: BlindSpotsResult
  resolveName: NameResolver
}

interface FlagListProps {
  title: string
  subtitle: string
  entries: BlindSpotEntry[]
  resolveName: NameResolver
  selectedId: string | null
  onSelect: (employeeId: string) => void
  render: (entry: BlindSpotEntry) => string
}

function FlagList({
  title,
  subtitle,
  entries,
  resolveName,
  selectedId,
  onSelect,
  render,
}: FlagListProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
        {entries.length > 0 ? (
          <div className="space-y-3">
            {entries.map((entry, index) => (
              <motion.button
                key={entry.employeeId}
                type="button"
                onClick={() => onSelect(entry.employeeId)}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index }}
                className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                  selectedId === entry.employeeId ? 'bg-primary/10 ring-1 ring-primary' : 'bg-muted'
                }`}
              >
                <div>
                  <div className="font-medium text-foreground">{resolveName(entry.employeeId)}</div>
                  <div className="text-xs text-muted-foreground">
                    {entry.department || 'No department'}
                  </div>
                </div>
                <div className="font-semibold text-foreground">{render(entry)}</div>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">No data available</div>
        )}
      </CardContent>
    </Card>
  )
}

export function BlindSpotsTab({ blindSpots, resolveName }: BlindSpotsTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    blindSpots.topSelfGaps[0]?.employeeId ?? blindSpots.entries[0]?.employeeId ?? null
  )

  if (blindSpots.insufficientData) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Eye className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Blind-spot analysis needs at least two evaluation lenses per person. No one in this
            period qualifies yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  const selected = blindSpots.entries.find((entry) => entry.employeeId === selectedId) ?? null
  const radarData = selected
    ? (Object.entries(selected.perLens) as Array<[RelationshipType, number]>).map(
        ([lens, score]) => ({
          lens: RELATIONSHIP_TYPE_LABELS[lens] ?? lens,
          score: Number(score.toFixed(2)),
        })
      )
    : []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FlagList
          title="Largest Self-Awareness Gaps"
          subtitle="Self rating vs. how everyone else rates them (0-4 scale)"
          entries={blindSpots.topSelfGaps}
          resolveName={resolveName}
          selectedId={selectedId}
          onSelect={setSelectedId}
          render={(entry) =>
            entry.selfGap === null
              ? '—'
              : `${entry.selfGap > 0 ? '+' : ''}${entry.selfGap.toFixed(2)}`
          }
        />
        <FlagList
          title="Most Split Opinions"
          subtitle="Spread between the highest and lowest lens (0-4 scale)"
          entries={blindSpots.topSpreads}
          resolveName={resolveName}
          selectedId={selectedId}
          onSelect={setSelectedId}
          render={(entry) => (entry.lensSpread === null ? '—' : entry.lensSpread.toFixed(2))}
        />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">
                {selected ? resolveName(selected.employeeId) : 'Select a person'}
              </h3>
            </div>
            {selected && (
              <p className="text-sm text-muted-foreground mb-4">
                Self {selected.selfScore?.toFixed(2) ?? '—'} • Others{' '}
                {selected.weightedOthersScore?.toFixed(2) ?? '—'} • Spread{' '}
                {selected.lensSpread?.toFixed(2) ?? '—'}
              </p>
            )}
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="lens" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <PolarRadiusAxis domain={[0, 4]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.35}
                    animationDuration={700}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[360px] flex items-center justify-center text-muted-foreground">
                Select someone from a list above.
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 2: Wire the tab into the page**

In `app/(hr)/admin/analytics/page.tsx`, add the import:

```tsx
import { BlindSpotsTab } from '@/components/analytics/BlindSpotsTab'
```

Replace the blind-spots `TabsContent` block:

```tsx
        <TabsContent value="blindspots">
          {insights ? (
            <BlindSpotsTab blindSpots={insights.blindSpots} resolveName={resolveName} />
          ) : (
            <div className="text-muted-foreground">No insight data available.</div>
          )}
        </TabsContent>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Open `/admin/analytics` → **Blind Spots** tab.
Expected: two flag lists; clicking a person morphs the radar to their per-lens scores.

- [ ] **Step 5: Commit**

```bash
git add components/analytics/BlindSpotsTab.tsx "app/(hr)/admin/analytics/page.tsx"
git commit -m "feat: add analytics blind spots tab

Self-gap and lens-spread flag lists with a per-person 360 radar."
```

---

### Task 12: Talent grid tab (2D)

Ship the readable 2D grid first. It is also the WebGL fallback for Task 13, so it must stand alone.

**Files:**
- Create: `components/analytics/TalentGridTab.tsx`
- Modify: `app/(hr)/admin/analytics/page.tsx` (swap the talent placeholder)

**Interfaces:**
- Consumes: `TalentGridResult`, `TalentGridEntry`, `MOMENTUM_DEAD_BAND` (Task 4); `NameResolver` (Task 8).
- Produces: `TalentGridTab({ talentGrid, resolveName }: { talentGrid: TalentGridResult; resolveName: NameResolver })`

- [ ] **Step 1: Write the component**

Create `components/analytics/TalentGridTab.tsx`:

```tsx
'use client'

import { motion } from 'framer-motion'
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Grid3x3 } from 'lucide-react'
import {
  MOMENTUM_DEAD_BAND,
  type TalentGridEntry,
  type TalentGridResult,
} from '@/lib/analytics/talent-grid'
import type { NameResolver } from '@/components/analytics/types'

const BAND_COLORS: Record<string, string> = {
  HIGH: 'hsl(142 71% 45%)',
  MID: 'hsl(217 91% 60%)',
  LOW: 'hsl(0 72% 51%)',
}

interface TalentGridTabProps {
  talentGrid: TalentGridResult
  resolveName: NameResolver
}

interface PlottedEntry extends TalentGridEntry {
  name: string
  momentum: number
  consensusLabel: string
}

function TalentTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PlottedEntry }> }) {
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0].payload

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm text-foreground shadow-lg">
      <div className="font-semibold">{entry.name}</div>
      <div className="text-muted-foreground text-xs mb-2">
        {entry.department || 'No department'}
        {entry.cellLabel ? ` • ${entry.cellLabel}` : ' • New this period'}
      </div>
      <div>Performance: {entry.performanceScore.toFixed(1)}%</div>
      <div>
        Momentum:{' '}
        {entry.momentumDelta === null
          ? 'no prior period'
          : `${entry.momentumDelta > 0 ? '+' : ''}${entry.momentumDelta.toFixed(1)} pts`}
      </div>
      <div>Consensus: {entry.consensusLabel}</div>
    </div>
  )
}

export function TalentGridTab({ talentGrid, resolveName }: TalentGridTabProps) {
  const plotted: PlottedEntry[] = talentGrid.entries.map((entry) => ({
    ...entry,
    name: resolveName(entry.employeeId),
    momentum: entry.momentumDelta ?? 0,
    consensusLabel:
      entry.consensus === null ? 'not enough lenses' : `${(entry.consensus * 100).toFixed(0)}%`,
  }))

  const established = plotted.filter((entry) => !entry.isNew)
  const newcomers = plotted.filter((entry) => entry.isNew)

  return (
    <div className="space-y-6">
      {talentGrid.insufficientData && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No prior period to compare against, so momentum is unavailable — everyone is plotted at
            zero momentum. This view gains its horizontal axis once a second period closes.
          </CardContent>
        </Card>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <Grid3x3 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Talent Grid</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Performance vs. momentum. Dot size shows evaluator consensus — smaller means opinions
              are split. Placement is relative to this period&apos;s cohort; hover for real scores.
            </p>
            <ResponsiveContainer width="100%" height={460}>
              <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  dataKey="momentum"
                  name="Momentum"
                  unit=" pts"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  type="number"
                  dataKey="performanceScore"
                  name="Performance"
                  unit="%"
                  domain={[0, 100]}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <ZAxis type="number" dataKey="consensus" range={[60, 400]} />
                <ReferenceLine x={MOMENTUM_DEAD_BAND} stroke="hsl(var(--border))" strokeDasharray="4 4" />
                <ReferenceLine x={-MOMENTUM_DEAD_BAND} stroke="hsl(var(--border))" strokeDasharray="4 4" />
                <Tooltip content={<TalentTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Team" data={established} animationDuration={800}>
                  {established.map((entry) => (
                    <Cell key={entry.employeeId} fill={BAND_COLORS[entry.performanceBand]} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {newcomers.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              New This Period ({newcomers.length})
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              No prior score, so they have no momentum and are not placed on the grid.
            </p>
            <div className="flex flex-wrap gap-2">
              {newcomers.map((entry) => (
                <span key={entry.employeeId} className="px-3 py-1 bg-muted rounded-full text-sm">
                  {entry.name} — {entry.performanceScore.toFixed(1)}%
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire the tab into the page**

In `app/(hr)/admin/analytics/page.tsx`, add the import:

```tsx
import { TalentGridTab } from '@/components/analytics/TalentGridTab'
```

Replace the talent `TabsContent` block:

```tsx
        <TabsContent value="talent">
          {insights ? (
            <TalentGridTab talentGrid={insights.talentGrid} resolveName={resolveName} />
          ) : (
            <div className="text-muted-foreground">No insight data available.</div>
          )}
        </TabsContent>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Open `/admin/analytics` → **Talent Grid** tab.
Expected: a scatter plot with dots colored by performance band, sized by consensus, dead-band reference lines at ±3, and hover tooltips showing real scores.

- [ ] **Step 5: Commit**

```bash
git add components/analytics/TalentGridTab.tsx "app/(hr)/admin/analytics/page.tsx"
git commit -m "feat: add 2D talent grid tab

Performance vs momentum scatter with consensus-sized dots, band colors,
and dead-band reference lines. Doubles as the WebGL fallback."
```

---

### Task 13: Talent Cube (3D hero)

Add the 3D view with the Task 12 grid as its fallback. **Read the `dataviz` skill before writing chart code, and `frontend-design` for aesthetic direction.**

**Files:**
- Create: `components/analytics/TalentCube.tsx`
- Modify: `components/analytics/TalentGridTab.tsx` (add the 3D/2D toggle + lazy load)
- Modify: `package.json` (add dependencies)

**Interfaces:**
- Consumes: `TalentGridEntry`, `MOMENTUM_DEAD_BAND` (Task 4); `NameResolver` (Task 8).
- Produces: `TalentCube({ entries, resolveName }: { entries: TalentGridEntry[]; resolveName: NameResolver })` — default-exported for `next/dynamic`.

- [ ] **Step 1: Install the 3D dependencies**

Run:

```bash
npm install @react-three/fiber@^8.17.10 @react-three/drei@^9.114.3 three@^0.169.0
npm install --save-dev @types/three@^0.169.0
```

Expected: installs cleanly. These versions are the React 18 compatible line — `@react-three/fiber` v9 requires React 19, which this project does not use.

- [ ] **Step 2: Write the cube component**

Create `components/analytics/TalentCube.tsx`:

```tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, Text } from '@react-three/drei'
import { Vector3, type Mesh } from 'three'
import type { TalentGridEntry } from '@/lib/analytics/talent-grid'
import type { NameResolver } from '@/components/analytics/types'

const CUBE_SIZE = 10
const BAND_COLORS: Record<string, string> = {
  HIGH: '#22c55e',
  MID: '#3b82f6',
  LOW: '#ef4444',
}

/** Momentum beyond this many points is clamped to the cube edge. */
const MOMENTUM_CLAMP = 20

interface TalentCubeProps {
  entries: TalentGridEntry[]
  resolveName: NameResolver
}

interface Placed {
  entry: TalentGridEntry
  position: [number, number, number]
  color: string
  name: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function PersonDot({
  placed,
  isHovered,
  onHover,
}: {
  placed: Placed
  isHovered: boolean
  onHover: (employeeId: string | null) => void
}) {
  const meshRef = useRef<Mesh>(null)
  const hoverScale = useRef(new Vector3(1.8, 1.8, 1.8))
  const restScale = useRef(new Vector3(1, 1, 1))

  useFrame(() => {
    if (!meshRef.current) return
    // Ease toward the target scale rather than snapping.
    meshRef.current.scale.lerp(isHovered ? hoverScale.current : restScale.current, 0.15)
  })

  return (
    <mesh
      ref={meshRef}
      position={placed.position}
      onPointerOver={(event) => {
        event.stopPropagation()
        onHover(placed.entry.employeeId)
      }}
      onPointerOut={() => onHover(null)}
    >
      <sphereGeometry args={[0.18, 24, 24]} />
      <meshStandardMaterial
        color={placed.color}
        emissive={placed.color}
        emissiveIntensity={isHovered ? 0.6 : 0.15}
        roughness={0.35}
      />
      {isHovered && (
        <Html distanceFactor={12} position={[0, 0.45, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground shadow-lg">
            <div className="font-semibold">{placed.name}</div>
            <div>{placed.entry.performanceScore.toFixed(1)}%</div>
            <div>
              {placed.entry.momentumDelta === null
                ? 'no prior period'
                : `${placed.entry.momentumDelta > 0 ? '+' : ''}${placed.entry.momentumDelta.toFixed(1)} pts`}
            </div>
            <div>
              consensus{' '}
              {placed.entry.consensus === null
                ? 'n/a'
                : `${(placed.entry.consensus * 100).toFixed(0)}%`}
            </div>
          </div>
        </Html>
      )}
    </mesh>
  )
}

function AxisLabel({ position, label }: { position: [number, number, number]; label: string }) {
  return (
    <Text position={position} fontSize={0.45} color="#94a3b8" anchorX="center" anchorY="middle">
      {label}
    </Text>
  )
}

export default function TalentCube({ entries, resolveName }: TalentCubeProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const placed = useMemo<Placed[]>(
    () =>
      entries
        .filter((entry) => !entry.isNew)
        .map((entry) => {
          const half = CUBE_SIZE / 2
          // X: momentum, clamped so outliers stay inside the cube.
          const x =
            (clamp(entry.momentumDelta ?? 0, -MOMENTUM_CLAMP, MOMENTUM_CLAMP) / MOMENTUM_CLAMP) * half
          // Y: performance 0-100 mapped across the cube height.
          const y = (entry.performanceScore / 100) * CUBE_SIZE - half
          // Z: consensus 0-1; null (too few lenses) sits at the neutral centre.
          const z = entry.consensus === null ? 0 : entry.consensus * CUBE_SIZE - half

          return {
            entry,
            position: [x, y, z] as [number, number, number],
            color: BAND_COLORS[entry.performanceBand],
            name: resolveName(entry.employeeId),
          }
        }),
    [entries, resolveName]
  )

  return (
    <div className="h-[520px] w-full rounded-lg bg-gradient-to-b from-slate-950 to-slate-900">
      <Canvas camera={{ position: [12, 8, 14], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 12, 8]} intensity={1.1} />

        <mesh>
          <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
          <meshBasicMaterial color="#1e293b" wireframe transparent opacity={0.35} />
        </mesh>

        <AxisLabel position={[0, -CUBE_SIZE / 2 - 0.9, CUBE_SIZE / 2]} label="Momentum →" />
        <AxisLabel position={[-CUBE_SIZE / 2 - 0.9, 0, CUBE_SIZE / 2]} label="Performance ↑" />
        <AxisLabel position={[CUBE_SIZE / 2 + 0.9, -CUBE_SIZE / 2 - 0.9, 0]} label="Consensus" />

        {placed.map((entry) => (
          <PersonDot
            key={entry.entry.employeeId}
            placed={entry}
            isHovered={hoveredId === entry.entry.employeeId}
            onHover={setHoveredId}
          />
        ))}

        <OrbitControls enablePan={false} minDistance={8} maxDistance={30} autoRotate={!hoveredId} autoRotateSpeed={0.4} />
      </Canvas>
      <p className="sr-only">
        Interactive 3D talent cube plotting performance against momentum and evaluator consensus. A
        two-dimensional grid with the same data is available via the 2D toggle.
      </p>
    </div>
  )
}
```

Note: `MOMENTUM_DEAD_BAND` is intentionally not drawn in the cube — the 2D grid carries the dead-band reference lines, and wireframe planes inside the cube hurt readability more than they help.

- [ ] **Step 3: Add the 3D/2D toggle to `TalentGridTab`**

In `components/analytics/TalentGridTab.tsx`, add these imports at the top:

```tsx
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Box, Grid2x2 } from 'lucide-react'

const TalentCube = dynamic(() => import('@/components/analytics/TalentCube'), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] flex items-center justify-center text-muted-foreground">
      Loading 3D view…
    </div>
  ),
})
```

Add this helper above the `TalentGridTab` component:

```tsx
/** WebGL is required for the cube; fall back to the 2D grid when unavailable. */
function useWebGLSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('webgl2') || canvas.getContext('webgl')
      setSupported(Boolean(context))
    } catch {
      setSupported(false)
    }
  }, [])

  return supported
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
```

Inside `TalentGridTab`, add this state directly after the function's opening brace:

```tsx
  const webglSupported = useWebGLSupport()
  const [view, setView] = useState<'3d' | '2d'>('2d')

  useEffect(() => {
    // Default to the cube only where it will look and perform well.
    if (webglSupported && !prefersReducedMotion()) {
      setView('3d')
    }
  }, [webglSupported])
```

Then replace the `<div className="flex items-center gap-2 mb-1">` header block inside the Talent Grid `Card` with:

```tsx
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Grid3x3 className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Talent Grid</h3>
              </div>
              {webglSupported && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={view === '3d' ? 'default' : 'outline'}
                    onClick={() => setView('3d')}
                  >
                    <Box className="w-4 h-4 mr-1" /> 3D
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={view === '2d' ? 'default' : 'outline'}
                    onClick={() => setView('2d')}
                  >
                    <Grid2x2 className="w-4 h-4 mr-1" /> 2D
                  </Button>
                </div>
              )}
            </div>
```

Finally, wrap the existing `<ResponsiveContainer>` block so the cube replaces it when 3D is active:

```tsx
            {view === '3d' && webglSupported ? (
              <TalentCube entries={talentGrid.entries} resolveName={resolveName} />
            ) : (
              <ResponsiveContainer width="100%" height={460}>
                {/* ...the existing ScatterChart, unchanged... */}
              </ResponsiveContainer>
            )}
```

Update the descriptive paragraph above the chart to read:

```tsx
            <p className="text-sm text-muted-foreground mb-4">
              Performance vs. momentum vs. consensus. In 3D, depth is how tightly evaluators agree —
              a high performer everyone agrees on is a different call from one whose reviews are
              split. Placement is relative to this period&apos;s cohort; hover for real scores.
            </p>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Open `/admin/analytics` → **Talent Grid** tab.
Expected: the cube renders and slowly auto-rotates; dragging orbits it; hovering a sphere expands it and shows the person's real scores; the 2D toggle swaps back to the scatter. Confirm the initial page load does not download Three.js — open DevTools → Network, reload, and check the `three` chunk only appears after opening this tab.

- [ ] **Step 6: Confirm reduced-motion and fallback behavior**

In DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce", reload and open the tab.
Expected: the 2D grid is selected by default; the 3D toggle is still available.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — no regressions.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json components/analytics/TalentCube.tsx components/analytics/TalentGridTab.tsx
git commit -m "feat: add 3D talent cube

Lazy-loaded react-three-fiber cube plotting performance x momentum x
consensus, with orbit controls, hover detail, a 2D fallback, and
reduced-motion support."
```

---

### Task 14: Cube → radar drill-down

Spec §7.1 requires "click to drill into their radar." Lift the selected employee to the page so clicking a person in the Talent Grid (2D or 3D) jumps to Blind Spots with their radar open.

**Files:**
- Modify: `components/analytics/TalentCube.tsx` (add `onSelect`)
- Modify: `components/analytics/TalentGridTab.tsx` (add `onSelectEmployee`, forward to cube + scatter)
- Modify: `components/analytics/BlindSpotsTab.tsx` (make selection controlled)
- Modify: `app/(hr)/admin/analytics/page.tsx` (controlled tabs + selection state)

**Interfaces:**
- Consumes: `TalentCube`, `TalentGridTab`, `BlindSpotsTab` (Tasks 11–13).
- Produces:
  - `TalentCubeProps` gains `onSelect: (employeeId: string) => void`
  - `TalentGridTabProps` gains `onSelectEmployee: (employeeId: string) => void`
  - `BlindSpotsTabProps` gains `selectedEmployeeId: string | null` and `onSelectEmployee: (employeeId: string) => void`

- [ ] **Step 1: Add `onSelect` to the cube**

In `components/analytics/TalentCube.tsx`, change the props interface:

```tsx
interface TalentCubeProps {
  entries: TalentGridEntry[]
  resolveName: NameResolver
  onSelect: (employeeId: string) => void
}
```

Change the `PersonDot` props and add a click handler to its `<mesh>`:

```tsx
function PersonDot({
  placed,
  isHovered,
  onHover,
  onSelect,
}: {
  placed: Placed
  isHovered: boolean
  onHover: (employeeId: string | null) => void
  onSelect: (employeeId: string) => void
}) {
```

On the `<mesh>` element, add below `onPointerOut`:

```tsx
      onClick={(event) => {
        event.stopPropagation()
        onSelect(placed.entry.employeeId)
      }}
```

Update the component signature and the `PersonDot` render:

```tsx
export default function TalentCube({ entries, resolveName, onSelect }: TalentCubeProps) {
```

```tsx
        {placed.map((entry) => (
          <PersonDot
            key={entry.entry.employeeId}
            placed={entry}
            isHovered={hoveredId === entry.entry.employeeId}
            onHover={setHoveredId}
            onSelect={onSelect}
          />
        ))}
```

Add a hint to the hover label, directly below the consensus line inside the `<Html>` block:

```tsx
            <div className="text-muted-foreground">click for 360 radar</div>
```

- [ ] **Step 2: Forward selection from `TalentGridTab`**

In `components/analytics/TalentGridTab.tsx`, extend the props:

```tsx
interface TalentGridTabProps {
  talentGrid: TalentGridResult
  resolveName: NameResolver
  onSelectEmployee: (employeeId: string) => void
}
```

```tsx
export function TalentGridTab({ talentGrid, resolveName, onSelectEmployee }: TalentGridTabProps) {
```

Pass it to the cube:

```tsx
              <TalentCube
                entries={talentGrid.entries}
                resolveName={resolveName}
                onSelect={onSelectEmployee}
              />
```

Give the 2D scatter the same behavior so both views drill through — replace the opening `<Scatter ...>` tag:

```tsx
                <Scatter
                  name="Team"
                  data={established}
                  animationDuration={800}
                  cursor="pointer"
                  onClick={(data) => {
                    const point = data as unknown as PlottedEntry | undefined
                    if (point?.employeeId) onSelectEmployee(point.employeeId)
                  }}
                >
```

- [ ] **Step 3: Make `BlindSpotsTab` selection controlled**

In `components/analytics/BlindSpotsTab.tsx`, extend the props:

```tsx
interface BlindSpotsTabProps {
  blindSpots: BlindSpotsResult
  resolveName: NameResolver
  selectedEmployeeId: string | null
  onSelectEmployee: (employeeId: string) => void
}
```

Replace the component's `useState` selection with a derived value:

```tsx
export function BlindSpotsTab({
  blindSpots,
  resolveName,
  selectedEmployeeId,
  onSelectEmployee,
}: BlindSpotsTabProps) {
  // Fall back to the most notable person so the radar is never empty on arrival.
  const selectedId =
    selectedEmployeeId ??
    blindSpots.topSelfGaps[0]?.employeeId ??
    blindSpots.entries[0]?.employeeId ??
    null
```

Remove the now-unused `useState` import if nothing else uses it, and replace both `onSelect={setSelectedId}` props on the two `FlagList` elements with:

```tsx
          onSelect={onSelectEmployee}
```

- [ ] **Step 4: Lift selection into the page**

In `app/(hr)/admin/analytics/page.tsx`, add state below the existing `useState` declarations:

```tsx
  const [tab, setTab] = useState('overview')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)

  const handleSelectEmployee = useCallback((employeeId: string) => {
    setSelectedEmployeeId(employeeId)
    setTab('blindspots')
  }, [])
```

Make the tabs controlled:

```tsx
      <Tabs value={tab} onValueChange={setTab}>
```

Update the two affected `TabsContent` blocks:

```tsx
        <TabsContent value="talent">
          {insights ? (
            <TalentGridTab
              talentGrid={insights.talentGrid}
              resolveName={resolveName}
              onSelectEmployee={handleSelectEmployee}
            />
          ) : (
            <div className="text-muted-foreground">No insight data available.</div>
          )}
        </TabsContent>
        <TabsContent value="blindspots">
          {insights ? (
            <BlindSpotsTab
              blindSpots={insights.blindSpots}
              resolveName={resolveName}
              selectedEmployeeId={selectedEmployeeId}
              onSelectEmployee={handleSelectEmployee}
            />
          ) : (
            <div className="text-muted-foreground">No insight data available.</div>
          )}
        </TabsContent>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify in the browser**

Open `/admin/analytics` → **Talent Grid**, click a sphere in the cube.
Expected: the view jumps to **Blind Spots** with that person's radar shown. Repeat with the 2D toggle — clicking a scatter dot does the same. Clicking a name inside a Blind Spots flag list still swaps the radar without leaving the tab.

- [ ] **Step 7: Commit**

```bash
git add components/analytics/TalentCube.tsx components/analytics/TalentGridTab.tsx components/analytics/BlindSpotsTab.tsx "app/(hr)/admin/analytics/page.tsx"
git commit -m "feat: drill from the talent grid into a person's 360 radar

Clicking a person in the 3D cube or 2D scatter opens Blind Spots with
their radar selected."
```

---

## Verification

After Task 14, confirm the whole feature:

- [ ] `npm test` — all tests pass, including the six new analytics suites.
- [ ] `npx tsc --noEmit` — no type errors.
- [ ] `/admin/analytics` renders all five tabs; the period selector re-fetches both endpoints.
- [ ] Every view shows **real names**, not raw employee ids.
- [ ] Clicking a person in the Talent Grid (3D or 2D) opens their radar in Blind Spots.
- [ ] Three.js loads only after opening the Talent Grid tab (DevTools → Network on a fresh reload).
- [ ] With `prefers-reduced-motion: reduce`, the Talent Grid defaults to 2D.
- [ ] Signing in as a non-admin and hitting `/api/admin/analytics/insights` returns `401`.
- [ ] Individual reports are unchanged: open a report generated before Task 1 and confirm the overall score matches.
- [ ] `git log --oneline` shows one commit per task.
