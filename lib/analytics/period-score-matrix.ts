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
 * of a query fan-out per employee. Equivalence with the live scorer is asserted
 * against real data by scripts/verify-analytics-scores.ts.
 *
 * Returns null when the period does not exist.
 */
export async function computePeriodScoreMatrix(
  periodId: string
): Promise<PeriodScoreMatrix | null> {
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId } })
  if (!period) return null

  const [users, assignments, evaluations, allEvaluations, weightProfiles, customWeightages] =
    await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, department: true, position: true } }),
      // includeUsers is required, not cosmetic: the dept-pool helpers key on
      // `assignment.evaluatee?.department`. Without the user objects every
      // department collapses to one "__unassigned__" pool, the wrong
      // authoritative evaluatee wins, and DEPT scores silently diverge from
      // real reports.
      getResolvedEvaluationAssignments(period.id, { includeUsers: true }),
      prisma.evaluation.findMany({
        where: { periodId: period.id, submittedAt: { not: null } },
        include: { question: true, leadQuestion: true },
      }),
      // Deliberately unfiltered by submittedAt, mirroring lib/scoring.ts: its
      // dept-pool carry-forward lookup queries { periodId, evaluatorId } with no
      // submitted filter, so drafts count there while the main path is
      // submitted-only. Replicated exactly so analytics matches real reports.
      prisma.evaluation.findMany({
        where: { periodId: period.id },
        include: { question: true, leadQuestion: true },
      }),
      prisma.weightProfile.findMany(),
      prisma.weightage.findMany(),
    ])

  // Let Prisma's inference define the row shape: it already carries evaluateeId
  // and question.relationshipType, which the pooling helpers require and the
  // narrower NormalizableEvaluation deliberately omits.
  type EvaluationRow = (typeof evaluations)[number]

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

  // The main path scores submitted evaluations only.
  const evaluationsByEvaluatee = new Map<string, EvaluationRow[]>()
  for (const evaluation of evaluations) {
    evaluationsByEvaluatee.set(evaluation.evaluateeId, [
      ...(evaluationsByEvaluatee.get(evaluation.evaluateeId) || []),
      evaluation,
    ])
  }

  // The dept-pool lookup gets the unfiltered set (drafts included), matching the
  // scorer. Only dept evaluators are ever looked up here, so the extra rows for
  // other evaluators are inert.
  const evaluationsByEvaluator = new Map<string, EvaluationRow[]>()
  for (const evaluation of allEvaluations) {
    evaluationsByEvaluator.set(evaluation.evaluatorId, [
      ...(evaluationsByEvaluator.get(evaluation.evaluatorId) || []),
      evaluation,
    ])
  }

  const weightsByCategoryKey = new Map(
    weightProfiles.map((profile) => [
      profile.categorySetKey,
      profile.weights as Record<string, number>,
    ])
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

    // Group the full rows, not NormalizableEvaluation: the pooling helpers need
    // evaluateeId, which the narrower scoring shape deliberately omits.
    const grouped = new Map<RelationshipType, EvaluationRow[]>()
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
