import {
  normalizeRelationshipTypeForWeighting,
  type RelationshipType,
} from '@/types'

type AssignmentLike = {
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
}

type EvaluationLike = {
  evaluatorId: string
  evaluateeId: string
  question?: {
    relationshipType: RelationshipType
  } | null
  leadQuestionId?: string | null
}

function buildAssignmentPairKey(evaluatorId: string, evaluateeId: string) {
  return `${evaluatorId}:${evaluateeId}`
}

export function buildAssignmentLookup(assignments: AssignmentLike[]) {
  const lookup = new Map<string, AssignmentLike[]>()

  for (const assignment of assignments) {
    const key = buildAssignmentPairKey(assignment.evaluatorId, assignment.evaluateeId)
    const existing = lookup.get(key) || []
    existing.push(assignment)
    lookup.set(key, existing)
  }

  return lookup
}

export function resolveEvaluationRelationshipTypeForRow(params: {
  evaluation: EvaluationLike
  assignmentLookup: ReadonlyMap<string, AssignmentLike[]>
}) {
  const candidates =
    params.assignmentLookup.get(
      buildAssignmentPairKey(params.evaluation.evaluatorId, params.evaluation.evaluateeId)
    ) || []

  if (candidates.length === 0) {
    return null
  }

  if (candidates.length === 1) {
    return normalizeRelationshipTypeForWeighting(candidates[0].relationshipType)
  }

  if (params.evaluation.leadQuestionId) {
    const teamLeadAssignment = candidates.find(
      (candidate) => candidate.relationshipType === 'TEAM_LEAD'
    )
    if (teamLeadAssignment) {
      return normalizeRelationshipTypeForWeighting(teamLeadAssignment.relationshipType)
    }
  }

  const questionRelationshipType = params.evaluation.question?.relationshipType
  if (questionRelationshipType) {
    const normalizedQuestionType =
      normalizeRelationshipTypeForWeighting(questionRelationshipType)
    const matchingAssignment = candidates.find(
      (candidate) =>
        normalizeRelationshipTypeForWeighting(candidate.relationshipType) ===
        normalizedQuestionType
    )

    if (matchingAssignment) {
      return normalizeRelationshipTypeForWeighting(matchingAssignment.relationshipType)
    }
  }

  return normalizeRelationshipTypeForWeighting(candidates[0].relationshipType)
}
