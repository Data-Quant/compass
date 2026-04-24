import {
  normalizeRelationshipTypeForWeighting,
  type RelationshipType,
} from '@/types'
import { getDefaultQuestionBankRelationshipType } from '@/lib/pre-evaluation'

type AssignmentLike = {
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
}

type EvaluationLike = {
  evaluatorId: string
  evaluateeId: string
  submittedAt?: Date | null
}

type EvaluationWithBank = {
  evaluatorId: string
  evaluateeId: string
  submittedAt?: Date | null
  leadQuestionId?: string | null
  question?: { relationshipType: RelationshipType } | null
}

// An evaluation row's question comes from the bank corresponding to the
// evaluator's relationship type (e.g. a DIRECT_REPORT evaluator pulls from
// the TEAM_LEAD bank). Lead-authored questions only apply for TEAM_LEAD
// evaluators. Use this to decide whether a submitted row counts towards
// completion of a specific (evaluator, evaluatee, relationshipType) slot.
export function isEvaluationInBankForRelationshipType(
  evaluation: EvaluationWithBank,
  relationshipType: RelationshipType
): boolean {
  if (evaluation.leadQuestionId) {
    return relationshipType === 'TEAM_LEAD'
  }
  if (evaluation.question) {
    const expectedBankType = getDefaultQuestionBankRelationshipType(relationshipType)
    return evaluation.question.relationshipType === expectedBankType
  }
  return false
}

export function buildAssignmentTripleKey(
  evaluatorId: string,
  evaluateeId: string,
  relationshipType: string
) {
  return `${evaluatorId}:${evaluateeId}:${relationshipType}`
}

type SubmittedSlotLike = EvaluationLike & {
  relationshipType: RelationshipType
}

export type WeightedCompletionPendingSlot = {
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
}

export type WeightedCompletionBreakdown = {
  relationshipType: RelationshipType
  weight: number
  requiredSlots: number
  completedSlots: number
  completionPercentage: number
  weightedCompletion: number
  pendingSlots: WeightedCompletionPendingSlot[]
}

export function buildEvaluationPairKey(evaluatorId: string, evaluateeId: string) {
  return `${evaluatorId}:${evaluateeId}`
}

/**
 * Build a map of submitted evaluation counts keyed by
 * `evaluatorId:evaluateeId:relationshipType`. Correctly separates submissions
 * per relationship type — prevents one assignment's submissions from falsely
 * marking another assignment as complete when the same evaluator has multiple
 * mappings to the same evaluatee (e.g. Areebah is both TEAM_LEAD and HR for
 * Saman; her TEAM_LEAD submissions must not count towards the HR slot).
 */
export function buildSubmittedCountMap(
  evaluations: EvaluationWithBank[],
  assignments: AssignmentLike[]
): Map<string, number> {
  const evalsByPair = new Map<string, EvaluationWithBank[]>()
  for (const evaluation of evaluations) {
    if (!evaluation.submittedAt) continue
    const pairKey = buildEvaluationPairKey(evaluation.evaluatorId, evaluation.evaluateeId)
    const existing = evalsByPair.get(pairKey) || []
    existing.push(evaluation)
    evalsByPair.set(pairKey, existing)
  }

  const counts = new Map<string, number>()
  // Seed every known assignment so a lookup with no submissions returns 0
  // rather than undefined — keeps downstream logic simple.
  for (const assignment of assignments) {
    const pairKey = buildEvaluationPairKey(assignment.evaluatorId, assignment.evaluateeId)
    const pairEvaluations = evalsByPair.get(pairKey) || []
    const matching = pairEvaluations.filter((evaluation) =>
      isEvaluationInBankForRelationshipType(evaluation, assignment.relationshipType)
    )
    if (matching.length > 0) {
      counts.set(
        buildAssignmentTripleKey(
          assignment.evaluatorId,
          assignment.evaluateeId,
          assignment.relationshipType
        ),
        matching.length
      )
    }
  }
  return counts
}

/**
 * Extract the set of (evaluator, evaluatee) pair keys that have at least one
 * HR-bank submission. Feed into getHrPoolClosedPairKeys so pool closure only
 * fires when an actual HR evaluation was submitted, not when any other
 * relationship's eval happens to share the same pair key.
 */
export function deriveSubmittedHrPairKeys(
  submittedCounts: ReadonlyMap<string, number>
): Set<string> {
  const hrPairKeys = new Set<string>()
  for (const [tripleKey, count] of submittedCounts.entries()) {
    if (count <= 0) continue
    if (!tripleKey.endsWith(':HR')) continue
    const [evaluatorId, evaluateeId] = tripleKey.split(':')
    hrPairKeys.add(buildEvaluationPairKey(evaluatorId, evaluateeId))
  }
  return hrPairKeys
}

export function getHrPoolClosedPairKeys(
  assignments: AssignmentLike[],
  submittedPairKeys: ReadonlySet<string>
) {
  const hrPairsByEvaluatee = new Map<string, string[]>()

  for (const assignment of assignments) {
    if (assignment.relationshipType !== 'HR') {
      continue
    }

    const pairKey = buildEvaluationPairKey(assignment.evaluatorId, assignment.evaluateeId)
    const existing = hrPairsByEvaluatee.get(assignment.evaluateeId) || []
    existing.push(pairKey)
    hrPairsByEvaluatee.set(assignment.evaluateeId, existing)
  }

  const closedPairKeys = new Set<string>()

  for (const pairKeys of hrPairsByEvaluatee.values()) {
    if (!pairKeys.some((pairKey) => submittedPairKeys.has(pairKey))) {
      continue
    }

    pairKeys.forEach((pairKey) => closedPairKeys.add(pairKey))
  }

  return closedPairKeys
}

export function getAssignmentCompletionState(params: {
  assignment: AssignmentLike
  questionsCount: number
  submittedCounts: ReadonlyMap<string, number>
  hrPoolClosedPairKeys: ReadonlySet<string>
}) {
  const pairKey = buildEvaluationPairKey(
    params.assignment.evaluatorId,
    params.assignment.evaluateeId
  )
  const tripleKey = buildAssignmentTripleKey(
    params.assignment.evaluatorId,
    params.assignment.evaluateeId,
    params.assignment.relationshipType
  )
  const rawCompletedCount = params.submittedCounts.get(tripleKey) || 0
  const isClosedByPool =
    params.assignment.relationshipType === 'HR' &&
    params.hrPoolClosedPairKeys.has(pairKey) &&
    rawCompletedCount === 0
  const completedCount = isClosedByPool ? params.questionsCount : rawCompletedCount

  return {
    pairKey,
    rawCompletedCount,
    completedCount,
    isClosedByPool,
    isComplete: params.questionsCount > 0 && completedCount >= params.questionsCount,
  }
}

export function getEffectiveEvaluationSlotKey(assignment: AssignmentLike) {
  if (assignment.relationshipType === 'HR') {
    return `HR_POOL:${assignment.evaluateeId}`
  }

  return `${assignment.relationshipType}:${buildEvaluationPairKey(
    assignment.evaluatorId,
    assignment.evaluateeId
  )}`
}

function getWeightedCompletionSlotKey(input: AssignmentLike) {
  const relationshipType = normalizeRelationshipTypeForWeighting(input.relationshipType)
  if (relationshipType === 'HR') {
    return `HR_POOL:${input.evaluateeId}`
  }

  return `${relationshipType}:${buildEvaluationPairKey(input.evaluatorId, input.evaluateeId)}`
}

function getPositiveWeightEntries(weights: Record<string, number>) {
  const normalizedWeights = new Map<RelationshipType, number>()

  for (const [relationshipType, weight] of Object.entries(weights)) {
    const normalizedType = normalizeRelationshipTypeForWeighting(
      relationshipType as RelationshipType
    ) as RelationshipType
    if (normalizedType === 'SELF') continue

    const numericWeight = Number(weight) || 0
    if (numericWeight <= 0) continue

    normalizedWeights.set(
      normalizedType,
      (normalizedWeights.get(normalizedType) || 0) + numericWeight
    )
  }

  return [...normalizedWeights.entries()].map(([relationshipType, weight]) => ({
    relationshipType,
    weight,
  }))
}

export function calculateWeightedEvaluationCompletion(params: {
  assignments: AssignmentLike[]
  submittedSlots: SubmittedSlotLike[]
  weights: Record<string, number>
}) {
  const requiredSlotsByType = new Map<
    RelationshipType,
    Map<string, WeightedCompletionPendingSlot>
  >()
  const submittedSlotKeysByType = new Map<RelationshipType, Set<string>>()

  for (const assignment of params.assignments) {
    const relationshipType = normalizeRelationshipTypeForWeighting(
      assignment.relationshipType
    ) as RelationshipType
    if (relationshipType === 'SELF') continue

    const slotKey = getWeightedCompletionSlotKey({
      ...assignment,
      relationshipType,
    })
    const existing = requiredSlotsByType.get(relationshipType) || new Map()
    if (!existing.has(slotKey)) {
      existing.set(slotKey, {
        evaluatorId: assignment.evaluatorId,
        evaluateeId: assignment.evaluateeId,
        relationshipType,
      })
    }
    requiredSlotsByType.set(relationshipType, existing)
  }

  for (const submittedSlot of params.submittedSlots) {
    if (!submittedSlot.submittedAt) continue

    const relationshipType = normalizeRelationshipTypeForWeighting(
      submittedSlot.relationshipType
    ) as RelationshipType
    if (relationshipType === 'SELF') continue

    const slotKey = getWeightedCompletionSlotKey({
      ...submittedSlot,
      relationshipType,
    })
    const existing = submittedSlotKeysByType.get(relationshipType) || new Set<string>()
    existing.add(slotKey)
    submittedSlotKeysByType.set(relationshipType, existing)
  }

  const weightEntries = getPositiveWeightEntries(params.weights)
  const totalWeight = weightEntries.reduce((sum, entry) => sum + entry.weight, 0)
  const breakdown: WeightedCompletionBreakdown[] = []

  for (const { relationshipType, weight } of weightEntries) {
    const requiredSlots = requiredSlotsByType.get(relationshipType) || new Map()
    const submittedSlotKeys = submittedSlotKeysByType.get(relationshipType) || new Set()
    const completedSlots = [...requiredSlots.keys()].filter((slotKey) =>
      submittedSlotKeys.has(slotKey)
    )
    const requiredCount = requiredSlots.size
    const completionRatio =
      requiredCount > 0 ? completedSlots.length / requiredCount : 0
    const pendingSlots = [...requiredSlots.entries()]
      .filter(([slotKey]) => !submittedSlotKeys.has(slotKey))
      .map(([, slot]) => slot)

    breakdown.push({
      relationshipType,
      weight,
      requiredSlots: requiredCount,
      completedSlots: completedSlots.length,
      completionPercentage: completionRatio * 100,
      weightedCompletion: weight * completionRatio,
      pendingSlots,
    })
  }

  const completedWeight = breakdown.reduce(
    (sum, entry) => sum + entry.weightedCompletion,
    0
  )
  const completionPercentage =
    totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 100

  return {
    completionPercentage,
    completedWeight,
    totalWeight,
    breakdown,
    pendingSlots: breakdown.flatMap((entry) => entry.pendingSlots),
  }
}

export function collapseAssignmentRequirementsByPool(
  requirements: Array<
    AssignmentLike & {
      questionsCount: number
      isComplete: boolean
    }
  >
) {
  const collapsed = new Map<
    string,
    {
      evaluateeId: string
      questionsCount: number
      isComplete: boolean
    }
  >()

  for (const requirement of requirements) {
    const key = getEffectiveEvaluationSlotKey(requirement)
    const existing = collapsed.get(key)

    if (!existing) {
      collapsed.set(key, {
        evaluateeId: requirement.evaluateeId,
        questionsCount: requirement.questionsCount,
        isComplete: requirement.isComplete,
      })
      continue
    }

    collapsed.set(key, {
      evaluateeId: existing.evaluateeId,
      questionsCount: Math.max(existing.questionsCount, requirement.questionsCount),
      isComplete: existing.isComplete || requirement.isComplete,
    })
  }

  return [...collapsed.values()]
}

export function getAuthoritativeHrEvaluatorId(
  evaluations: EvaluationLike[]
) {
  const submittedByEvaluator = new Map<string, number>()

  for (const evaluation of evaluations) {
    if (!evaluation.submittedAt) {
      continue
    }

    const submittedAt = evaluation.submittedAt.getTime()
    const existing = submittedByEvaluator.get(evaluation.evaluatorId)

    if (existing === undefined || submittedAt < existing) {
      submittedByEvaluator.set(evaluation.evaluatorId, submittedAt)
    }
  }

  if (submittedByEvaluator.size === 0) {
    return null
  }

  return [...submittedByEvaluator.entries()].sort((first, second) => {
    if (first[1] !== second[1]) {
      return first[1] - second[1]
    }

    return first[0].localeCompare(second[0])
  })[0][0]
}

export function filterPooledRelationshipEvaluations<T extends EvaluationLike>(
  relationshipType: RelationshipType,
  evaluations: T[]
) {
  if (relationshipType !== 'HR') {
    return evaluations
  }

  const authoritativeEvaluatorId = getAuthoritativeHrEvaluatorId(evaluations)
  if (!authoritativeEvaluatorId) {
    return evaluations
  }

  return evaluations.filter((evaluation) => evaluation.evaluatorId === authoritativeEvaluatorId)
}
