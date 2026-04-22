import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  getResolvedEvaluationAssignments,
  getResolvedEvaluationAssignmentForPair,
  type ResolvedEvaluationAssignment,
} from '@/lib/evaluation-assignments'

type DbClient = typeof prisma | Prisma.TransactionClient

export type DeptPoolSummary = {
  department: string | null
  departmentKey: string
  label: string
  memberCount: number
}

type EvaluationLike = {
  evaluateeId: string
  ratingValue?: number | null
  textResponse?: string | null
  submittedAt?: Date | null
  updatedAt?: Date | null
}

export function normalizeDepartmentPoolKey(department: string | null | undefined) {
  const normalized = department?.trim()
  return normalized && normalized.length > 0 ? normalized.toLowerCase() : '__unassigned__'
}

export function getDeptPoolDisplayName(department: string | null | undefined) {
  const normalized = department?.trim()
  return normalized && normalized.length > 0 ? `${normalized} Department` : 'Unassigned Department'
}

export function getDeptPoolMemberLabel(memberCount: number) {
  return `${memberCount} team member${memberCount === 1 ? '' : 's'}`
}

export function getDeptPoolKey(
  evaluatorId: string,
  department: string | null | undefined
) {
  return `DEPT_POOL:${evaluatorId}:${normalizeDepartmentPoolKey(department)}`
}

export function groupDeptAssignmentsByDepartment(
  assignments: ResolvedEvaluationAssignment[]
) {
  const groups = new Map<string, ResolvedEvaluationAssignment[]>()

  for (const assignment of assignments) {
    if (assignment.relationshipType !== 'DEPT') {
      continue
    }

    const key = getDeptPoolKey(assignment.evaluatorId, assignment.evaluatee?.department)
    const existing = groups.get(key) || []
    existing.push(assignment)
    groups.set(key, existing)
  }

  return groups
}

export function pickRepresentativeDeptAssignment(
  assignments: ResolvedEvaluationAssignment[]
) {
  return [...assignments].sort((left, right) => {
    const departmentCompare = (left.evaluatee?.department || '').localeCompare(
      right.evaluatee?.department || ''
    )
    if (departmentCompare !== 0) return departmentCompare

    const nameCompare = (left.evaluatee?.name || '').localeCompare(right.evaluatee?.name || '')
    if (nameCompare !== 0) return nameCompare

    return left.evaluateeId.localeCompare(right.evaluateeId)
  })[0]
}

export function summarizeDeptPool(assignments: ResolvedEvaluationAssignment[]): DeptPoolSummary {
  const representative = pickRepresentativeDeptAssignment(assignments)
  const department = representative?.evaluatee?.department || null

  return {
    department,
    departmentKey: normalizeDepartmentPoolKey(department),
    label: getDeptPoolDisplayName(department),
    memberCount: assignments.length,
  }
}

export async function getDeptEvaluationPoolContext(params: {
  periodId: string
  evaluatorId: string
  evaluateeId: string
  db?: DbClient
}) {
  const db = params.db || prisma

  const directAssignment = await getResolvedEvaluationAssignmentForPair(
    params.periodId,
    params.evaluatorId,
    params.evaluateeId,
    'DEPT',
    db
  )

  if (!directAssignment) {
    return null
  }

  const assignments = await getResolvedEvaluationAssignments(params.periodId, {
    evaluatorId: params.evaluatorId,
    includeUsers: true,
    db,
  })

  const deptAssignments = assignments.filter(
    (assignment) =>
      assignment.relationshipType === 'DEPT' &&
      normalizeDepartmentPoolKey(assignment.evaluatee?.department) ===
        normalizeDepartmentPoolKey(directAssignment.evaluatee?.department)
  )

  if (deptAssignments.length === 0) {
    return null
  }

  const representative = pickRepresentativeDeptAssignment(deptAssignments)
  const summary = summarizeDeptPool(deptAssignments)

  return {
    summary,
    representativeAssignment: representative,
    assignments: deptAssignments,
    evaluateeIds: deptAssignments.map((assignment) => assignment.evaluateeId),
  }
}

function countAnsweredResponses(evaluations: EvaluationLike[]) {
  return evaluations.filter(
    (evaluation) =>
      evaluation.ratingValue !== null ||
      Boolean(evaluation.textResponse && evaluation.textResponse.trim())
  ).length
}

function getLatestTimestamp(evaluations: EvaluationLike[]) {
  return evaluations.reduce<number>((latest, evaluation) => {
    const candidate = evaluation.submittedAt?.getTime() || evaluation.updatedAt?.getTime() || 0
    return candidate > latest ? candidate : latest
  }, 0)
}

export function selectAuthoritativeDeptPoolEvaluateeId(params: {
  evaluateeIds: string[]
  evaluations: EvaluationLike[]
}) {
  const evaluationsByEvaluatee = new Map<string, EvaluationLike[]>()
  for (const evaluation of params.evaluations) {
    const existing = evaluationsByEvaluatee.get(evaluation.evaluateeId) || []
    existing.push(evaluation)
    evaluationsByEvaluatee.set(evaluation.evaluateeId, existing)
  }

  const ranked = [...params.evaluateeIds].map((evaluateeId) => {
    const evaluations = evaluationsByEvaluatee.get(evaluateeId) || []
    return {
      evaluateeId,
      answeredCount: countAnsweredResponses(evaluations),
      latestTimestamp: getLatestTimestamp(evaluations),
    }
  })

  ranked.sort((left, right) => {
    if (left.answeredCount !== right.answeredCount) {
      return right.answeredCount - left.answeredCount
    }
    if (left.latestTimestamp !== right.latestTimestamp) {
      return right.latestTimestamp - left.latestTimestamp
    }
    return left.evaluateeId.localeCompare(right.evaluateeId)
  })

  return ranked[0]?.evaluateeId || params.evaluateeIds[0]
}
