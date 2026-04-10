import { isThreeEDepartment } from '@/lib/company-branding'
import type { RelationshipType } from '@/types'

type RuleUserShape = {
  id: string
  name?: string | null
  department?: string | null
}

export const PROFILE_CONSTANT_RELATIONSHIP_TYPES: RelationshipType[] = ['HR', 'DEPT']
export const PROFILE_BASE_RELATIONSHIP_TYPES: RelationshipType[] = [
  'TEAM_LEAD',
  'DIRECT_REPORT',
  'PEER',
  'C_LEVEL',
  'CROSS_DEPARTMENT',
]

export const NO_INCOMING_EVALUATION_NAMES = [
  'Hamiz Awan',
  'Daniyal Awan',
  'Brad Herman',
  'Maryam Khalil',
  'Richard Reizes',
]

export function normalizeEvaluationRuleName(name: string | null | undefined) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isNoIncomingEvaluationName(name: string | null | undefined) {
  const normalized = normalizeEvaluationRuleName(name)
  return NO_INCOMING_EVALUATION_NAMES.some(
    (entry) => normalizeEvaluationRuleName(entry) === normalized
  )
}

export function isNoIncomingEvaluationUser(user: Pick<RuleUserShape, 'name'> | null | undefined) {
  return isNoIncomingEvaluationName(user?.name)
}

export function shouldReceiveConstantEvaluations(
  user: Pick<RuleUserShape, 'name' | 'department'> | null | undefined
) {
  return !isNoIncomingEvaluationUser(user) && !isThreeEDepartment(user?.department)
}

function getManagementPairIds(input: {
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
}) {
  if (input.relationshipType === 'TEAM_LEAD') {
    return {
      leaderId: input.evaluatorId,
      reportId: input.evaluateeId,
    }
  }

  if (input.relationshipType === 'DIRECT_REPORT') {
    return {
      leaderId: input.evaluateeId,
      reportId: input.evaluatorId,
    }
  }

  return null
}

export function getMappingConstraint(
  input: {
    evaluatorId: string
    evaluateeId: string
    relationshipType: RelationshipType
  },
  usersById: Map<string, RuleUserShape>
) {
  const managementPair = getManagementPairIds(input)

  if (managementPair) {
    const leader = usersById.get(managementPair.leaderId)
    const report = usersById.get(managementPair.reportId)

    if (isNoIncomingEvaluationUser(report)) {
      return {
        blocked: true,
        reason: `${report?.name || 'This person'} cannot receive incoming evaluations`,
        skipManagementMirror: false,
      }
    }

    if (isNoIncomingEvaluationUser(leader)) {
      return {
        blocked: false,
        reason: null,
        skipManagementMirror: true,
      }
    }

    return {
      blocked: false,
      reason: null,
      skipManagementMirror: false,
    }
  }

  const evaluator = usersById.get(input.evaluatorId)
  const evaluatee = usersById.get(input.evaluateeId)

  if (input.relationshipType === 'PEER' || input.relationshipType === 'CROSS_DEPARTMENT') {
    if (isNoIncomingEvaluationUser(evaluator) || isNoIncomingEvaluationUser(evaluatee)) {
      const targetName = isNoIncomingEvaluationUser(evaluator) ? evaluator?.name : evaluatee?.name
      return {
        blocked: true,
        reason: `${targetName || 'This person'} cannot receive incoming evaluations`,
        skipManagementMirror: false,
      }
    }
  } else if (isNoIncomingEvaluationUser(evaluatee)) {
    return {
      blocked: true,
      reason: `${evaluatee?.name || 'This person'} cannot receive incoming evaluations`,
      skipManagementMirror: false,
    }
  }

  return {
    blocked: false,
    reason: null,
    skipManagementMirror: false,
  }
}
