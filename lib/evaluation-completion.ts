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
  source?: string | null
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
    // D32: weekly evidence from cross-department evaluators is collected with the peer questions.
    if (relationshipType === 'CROSS_DEPARTMENT' && evaluation.source === 'AI_WEEKLY') {
      return evaluation.question.relationshipType === 'PEER'
    }
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
