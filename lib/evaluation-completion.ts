import type { RelationshipType } from '@/types'

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

export function buildEvaluationPairKey(evaluatorId: string, evaluateeId: string) {
  return `${evaluatorId}:${evaluateeId}`
}

export function getSubmittedEvaluationCountMap(
  evaluations: Array<{ evaluatorId: string; evaluateeId: string; count: number }>
) {
  return new Map(
    evaluations.map((evaluation) => [
      buildEvaluationPairKey(evaluation.evaluatorId, evaluation.evaluateeId),
      evaluation.count,
    ])
  )
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
  const rawCompletedCount = params.submittedCounts.get(pairKey) || 0
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
