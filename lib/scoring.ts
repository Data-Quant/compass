import { prisma } from '@/lib/db'
import { RelationshipType, normalizeRelationshipTypeForWeighting, toCategorySetKey } from '@/types'
import { calculateRedistributedWeights } from '@/lib/config'
import { getEvaluationQuestionMeta } from '@/lib/pre-evaluation'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { shouldReceiveConstantEvaluations } from '@/lib/evaluation-profile-rules'
import { filterPooledRelationshipEvaluations } from '@/lib/evaluation-completion'
import { applyAuthoritativeDeptPoolEvaluations } from '@/lib/dept-evaluation-pool'
import {
  buildAssignmentLookup,
  resolveEvaluationRelationshipTypeForRow,
} from '@/lib/evaluation-relationship-resolution'

export interface ScoreBreakdown {
  relationshipType: RelationshipType
  weight: number
  rawScore: number
  maxScore: number
  normalizedScore: number
  weightedContribution: number
  evaluatorCount: number
}

export interface EvaluationReport {
  employeeId: string
  employeeName: string
  periodId: string
  periodName: string
  overallScore: number
  breakdown: ScoreBreakdown[]
  qualitativeFeedback: Record<string, string[]>
}

function assertCanReceiveWeightedScore(employee: {
  name: string
  department?: string | null
  position?: string | null
}) {
  if (!shouldReceiveConstantEvaluations(employee)) {
    throw new Error('This person does not receive incoming evaluations or reports')
  }
}

/**
 * Get the available evaluator types for an employee based on their mappings
 */
export async function getAvailableEvaluatorTypes(
  employeeId: string,
  periodId?: string
): Promise<RelationshipType[]> {
  const mappings = periodId
    ? await getResolvedEvaluationAssignments(periodId, { evaluateeId: employeeId })
    : await prisma.evaluatorMapping.findMany({
        where: { evaluateeId: employeeId },
        select: { relationshipType: true },
        distinct: ['relationshipType'],
      })
  return [...new Set(
    mappings.map((mapping) =>
      normalizeRelationshipTypeForWeighting(mapping.relationshipType as RelationshipType)
    )
  )]
}

/**
 * Look up the weight profile for a set of relationship types.
 * Returns the profile weights if found, null otherwise.
 */
export async function getWeightProfileWeights(
  types: string[]
): Promise<Record<string, number> | null> {
  const key = toCategorySetKey(types)
  if (!key) return null

  const profile = await prisma.weightProfile.findUnique({
    where: { categorySetKey: key },
  })

  if (profile) {
    return profile.weights as Record<string, number>
  }
  return null
}

/**
 * Calculate dynamic weights for an employee based on their available evaluator types.
 * 
 * Priority:
 * 1. WeightProfile match (category-set based weights from compiled data)
 * 2. Per-employee custom Weightage overrides
 * 3. Proportional redistribution of default weights (fallback)
 */
export async function getDynamicWeights(
  employeeId: string,
  periodId?: string
): Promise<Record<string, number>> {
  const availableTypes = await getAvailableEvaluatorTypes(employeeId, periodId)

  // 1. Try weight profile based on category set
  const profileWeights = await getWeightProfileWeights(availableTypes)
  if (profileWeights) {
    return profileWeights
  }

  // 2. Check for per-employee custom weightages
  const customWeightages = await prisma.weightage.findMany({
    where: { employeeId },
  })

  if (customWeightages.length > 0) {
    const weights: Record<string, number> = {}
    customWeightages.forEach(w => {
      weights[normalizeRelationshipTypeForWeighting(w.relationshipType as RelationshipType)] = w.weightagePercentage
    })
    return weights
  }

  // 3. Fallback: redistribute defaults proportionally
  return calculateRedistributedWeights(availableTypes)
}

export async function calculateWeightedScore(
  employeeId: string,
  periodId: string
): Promise<EvaluationReport> {
  // Get employee info
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
  })

  if (!employee) {
    throw new Error('Employee not found')
  }

  assertCanReceiveWeightedScore(employee)

  // Get period info
  const period = await prisma.evaluationPeriod.findUnique({
    where: { id: periodId },
  })

  if (!period) {
    throw new Error('Evaluation period not found')
  }

  // Get all evaluations for this employee in this period
  const evaluations = await prisma.evaluation.findMany({
    where: {
      evaluateeId: employeeId,
      periodId: periodId,
      submittedAt: { not: null },
    },
    include: {
      question: true,
      leadQuestion: true,
      evaluator: true,
    },
  })

  const mappings = await getResolvedEvaluationAssignments(periodId, {
    evaluateeId: employeeId,
    includeUsers: true,
  })

  const deptEvaluatorIds = [...new Set(
    mappings
      .filter((mapping) => mapping.relationshipType === 'DEPT')
      .map((mapping) => mapping.evaluatorId)
  )]
  const [deptEvaluatorAssignments, deptEvaluatorEvaluations] = await Promise.all([
    Promise.all(
      deptEvaluatorIds.map(async (evaluatorId) => [
        evaluatorId,
        await getResolvedEvaluationAssignments(periodId, {
          evaluatorId,
          includeUsers: true,
        }),
      ] as const)
    ),
    Promise.all(
      deptEvaluatorIds.map(async (evaluatorId) => [
        evaluatorId,
        await prisma.evaluation.findMany({
          where: {
            periodId,
            evaluatorId,
          },
          include: {
            question: true,
            leadQuestion: true,
            evaluator: true,
          },
        }),
      ] as const)
    ),
  ])
  const deptAssignmentsByEvaluator = new Map(deptEvaluatorAssignments)
  const deptEvaluationsByEvaluator = new Map(deptEvaluatorEvaluations)
  const effectiveEvaluations = applyAuthoritativeDeptPoolEvaluations({
    evaluateeId: employeeId,
    evaluations,
    assignments: mappings,
    getAssignmentsForEvaluator: (evaluatorId) =>
      deptAssignmentsByEvaluator.get(evaluatorId) || [],
    getEvaluationsForEvaluator: (evaluatorId) =>
      deptEvaluationsByEvaluator.get(evaluatorId) || [],
  })

  const assignmentLookup = buildAssignmentLookup(
    mappings.map((mapping) => ({
      evaluatorId: mapping.evaluatorId,
      evaluateeId: mapping.evaluateeId,
      relationshipType: mapping.relationshipType as RelationshipType,
    }))
  )

  // Group evaluations by relationship type
  const evaluationsByType = new Map<RelationshipType, typeof evaluations>()

  for (const evaluation of effectiveEvaluations) {
    const type = resolveEvaluationRelationshipTypeForRow({
      evaluation,
      assignmentLookup,
    })
    if (type) {
      if (!evaluationsByType.has(type)) {
        evaluationsByType.set(type, [])
      }
      evaluationsByType.get(type)!.push(evaluation)
    }
  }

  // Determine weights: use the employee's full mapped category set (not just types with evaluations)
  // This ensures consistent weighting even if some evaluators haven't submitted yet
  const allMappedTypes = [...new Set(
    mappings.map((mapping) =>
      normalizeRelationshipTypeForWeighting(mapping.relationshipType as RelationshipType)
    )
  )]
  
  // Try weight profile first, then per-employee, then fallback
  let dynamicWeights = await getWeightProfileWeights(allMappedTypes)
  
  if (!dynamicWeights) {
    // Check per-employee custom weightages
    const customWeightages = await prisma.weightage.findMany({
      where: { employeeId },
    })
    if (customWeightages.length > 0) {
      dynamicWeights = {}
      customWeightages.forEach(w => {
        dynamicWeights![normalizeRelationshipTypeForWeighting(w.relationshipType as RelationshipType)] =
          w.weightagePercentage
      })
    } else {
      // Keep fallback stable against late submissions by using the full mapped set.
      dynamicWeights = calculateRedistributedWeights(allMappedTypes)
    }
  }

  // Calculate breakdown for each relationship type
  const breakdown: ScoreBreakdown[] = []

  for (const [relationshipType, typeEvaluations] of evaluationsByType.entries()) {
    const effectiveEvaluations = filterPooledRelationshipEvaluations(
      relationshipType,
      typeEvaluations
    )

    // Get the weight for this type
    const weight = dynamicWeights[relationshipType] ?? 0

    // Skip SELF evaluations in weighted calculation
    if (relationshipType === 'SELF') {
      continue
    }

    // Group by question to calculate averages
    const questionGroups = new Map<string, typeof typeEvaluations>()
    for (const evaluation of effectiveEvaluations) {
      const questionMeta = getEvaluationQuestionMeta(evaluation)
      if (!questionMeta) {
        continue
      }
      if (!questionGroups.has(questionMeta.key)) {
        questionGroups.set(questionMeta.key, [])
      }
      questionGroups.get(questionMeta.key)!.push(evaluation)
    }

    // Calculate average rating for this relationship type
    let totalRating = 0
    let totalMaxRating = 0
    const evaluatorIds = new Set<string>()

    for (const [, questionEvals] of questionGroups.entries()) {
      const question = questionEvals[0].question
      const questionMeta = getEvaluationQuestionMeta(questionEvals[0])
      if (!questionMeta) {
        continue
      }
      if (questionMeta.questionType === 'RATING') {
        let questionTotal = 0
        let questionCount = 0

        for (const evaluation of questionEvals) {
          if (evaluation.ratingValue !== null) {
            questionTotal += evaluation.ratingValue
            questionCount++
            evaluatorIds.add(evaluation.evaluatorId)
          }
        }

        if (questionCount > 0) {
          totalRating += questionTotal / questionCount
          totalMaxRating += questionMeta.maxRating
        }
      }
    }

    const rawScore = totalRating
    const maxScore = totalMaxRating
    const normalizedScore = maxScore > 0 ? (totalRating / totalMaxRating) * 4 : 0
    const weightedContribution = normalizedScore * weight

    breakdown.push({
      relationshipType,
      weight,
      rawScore,
      maxScore,
      normalizedScore,
      weightedContribution,
      evaluatorCount: evaluatorIds.size,
    })
  }

  // Overall score = sum of weighted contributions (each is normalizedScore * weight)
  // normalizedScore is on 0-4 scale, weight is a fraction summing to 1.0
  // So totalWeightedContribution is on 0-4 scale, divide by 4 for percentage
  const totalWeightedContribution = breakdown.reduce(
    (sum, b) => sum + b.weightedContribution,
    0
  )
  const overallScore = (totalWeightedContribution / 4.0) * 100

  // Aggregate qualitative feedback
  const qualitativeFeedback: Record<string, string[]> = {}
  const filteredEvaluations = effectiveEvaluations.filter((evaluation) => {
    const relationshipType = resolveEvaluationRelationshipTypeForRow({
      evaluation,
      assignmentLookup,
    })
    if (!relationshipType) {
      return false
    }

    return filterPooledRelationshipEvaluations(
      relationshipType,
      evaluationsByType.get(relationshipType) || []
    ).includes(evaluation)
  })

  for (const evaluation of filteredEvaluations) {
    if (evaluation.textResponse && evaluation.textResponse.trim()) {
      const questionMeta = getEvaluationQuestionMeta(evaluation)
      if (!questionMeta) continue
      const questionKey = questionMeta.questionText
      if (!qualitativeFeedback[questionKey]) {
        qualitativeFeedback[questionKey] = []
      }
      qualitativeFeedback[questionKey].push(evaluation.textResponse)
    }
  }

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    periodId: period.id,
    periodName: period.name,
    overallScore,
    breakdown,
    qualitativeFeedback,
  }
}
