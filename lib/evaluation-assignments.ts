import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type { RelationshipType } from '@/types'
import { collapseAdminMappings } from '@/lib/evaluation-mappings'

type DbClient = typeof prisma | Prisma.TransactionClient

type UserSummary = {
  id: string
  name: string
  department: string | null
  position: string | null
}

export type AssignmentSource =
  | 'PERMANENT_MAPPING'
  | 'PRE_EVALUATION_PEER'
  | 'PRE_EVALUATION_CROSS_DEPARTMENT'

export interface ResolvedEvaluationAssignment {
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  source: AssignmentSource
  mappingId?: string
  selectionId?: string
  evaluator?: UserSummary
  evaluatee?: UserSummary
}

function buildAssignmentKey(
  evaluatorId: string,
  evaluateeId: string,
  relationshipType: RelationshipType
) {
  return `${evaluatorId}:${evaluateeId}:${relationshipType}`
}

export async function getResolvedEvaluationAssignments(
  periodId: string,
  options: {
    evaluatorId?: string
    evaluateeId?: string
    includeUsers?: boolean
    db?: DbClient
  } = {}
) {
  const db = options.db || prisma
  const includeUsers = Boolean(options.includeUsers)

  const mappingWhere: Prisma.EvaluatorMappingWhereInput = {}
  if (options.evaluatorId) mappingWhere.evaluatorId = options.evaluatorId
  if (options.evaluateeId) mappingWhere.evaluateeId = options.evaluateeId

  const selectionWhere: Prisma.PreEvaluationEvaluateeSelectionWhereInput = {
    reviewStatus: 'APPROVED',
    prep: {
      periodId,
      evaluateesSubmittedAt: { not: null },
    },
  }
  if (options.evaluateeId) selectionWhere.evaluateeId = options.evaluateeId
  if (options.evaluatorId) selectionWhere.suggestedEvaluatorId = options.evaluatorId

  const [rawMappings, approvedPeerSelections, approvedCrossSelections] = await Promise.all([
    db.evaluatorMapping.findMany({
      where: mappingWhere,
      ...(includeUsers
        ? {
            include: {
              evaluator: {
                select: { id: true, name: true, department: true, position: true },
              },
              evaluatee: {
                select: { id: true, name: true, department: true, position: true },
              },
            },
          }
        : {}),
      orderBy: [
        { evaluatorId: 'asc' },
        { evaluateeId: 'asc' },
        { relationshipType: 'asc' },
      ],
    }),
    db.preEvaluationEvaluateeSelection.findMany({
      where: {
        ...selectionWhere,
        type: 'PEER',
        suggestedEvaluatorId: { not: null },
      },
      ...(includeUsers
        ? {
            include: {
              suggestedEvaluator: {
                select: { id: true, name: true, department: true, position: true },
              },
              evaluatee: {
                select: { id: true, name: true, department: true, position: true },
              },
            },
          }
        : {}),
      orderBy: { reviewedAt: 'desc' },
    }),
    db.preEvaluationEvaluateeSelection.findMany({
      where: {
        ...selectionWhere,
        type: 'CROSS_DEPARTMENT',
        suggestedEvaluatorId: { not: null },
        prep: {
          periodId,
          evaluateesSubmittedAt: { not: null },
          questionsSubmittedAt: { not: null },
        },
      },
      ...(includeUsers
        ? {
            include: {
              suggestedEvaluator: {
                select: { id: true, name: true, department: true, position: true },
              },
              evaluatee: {
                select: { id: true, name: true, department: true, position: true },
              },
            },
          }
        : {}),
      orderBy: { reviewedAt: 'desc' },
    }),
  ])

  const approvedCrossDepartmentKeys = new Set(
    approvedCrossSelections.map((selection) =>
      buildAssignmentKey(
        selection.suggestedEvaluatorId!,
        selection.evaluateeId,
        'CROSS_DEPARTMENT'
      )
    )
  )

  const assignments: ResolvedEvaluationAssignment[] = []
  const seen = new Set<string>()

  for (const mapping of rawMappings) {
    const relationshipType = mapping.relationshipType as RelationshipType

    if (
      relationshipType === 'CROSS_DEPARTMENT' &&
      !approvedCrossDepartmentKeys.has(
        buildAssignmentKey(mapping.evaluatorId, mapping.evaluateeId, 'CROSS_DEPARTMENT')
      )
    ) {
      continue
    }

    const key = buildAssignmentKey(mapping.evaluatorId, mapping.evaluateeId, relationshipType)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    assignments.push({
      evaluatorId: mapping.evaluatorId,
      evaluateeId: mapping.evaluateeId,
      relationshipType,
      source: relationshipType === 'CROSS_DEPARTMENT' ? 'PRE_EVALUATION_CROSS_DEPARTMENT' : 'PERMANENT_MAPPING',
      mappingId: mapping.id,
      evaluator: 'evaluator' in mapping ? (mapping.evaluator as UserSummary) : undefined,
      evaluatee: 'evaluatee' in mapping ? (mapping.evaluatee as UserSummary) : undefined,
    })
  }

  for (const selection of approvedPeerSelections) {
    const key = buildAssignmentKey(selection.suggestedEvaluatorId!, selection.evaluateeId, 'PEER')
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    assignments.push({
      evaluatorId: selection.suggestedEvaluatorId!,
      evaluateeId: selection.evaluateeId,
      relationshipType: 'PEER',
      source: 'PRE_EVALUATION_PEER',
      selectionId: selection.id,
      evaluator: 'suggestedEvaluator' in selection ? (selection.suggestedEvaluator as UserSummary) : undefined,
      evaluatee: 'evaluatee' in selection ? (selection.evaluatee as UserSummary) : undefined,
    })
  }

  return assignments
}

export async function getResolvedEvaluationAssignmentForPair(
  periodId: string,
  evaluatorId: string,
  evaluateeId: string
) {
  const assignments = await getResolvedEvaluationAssignments(periodId, {
    evaluatorId,
    evaluateeId,
    includeUsers: true,
  })

  return assignments[0] || null
}

export async function getCollapsedAdminMappings() {
  const rawMappings = await prisma.evaluatorMapping.findMany({
    include: {
      evaluator: {
        select: { id: true, name: true, department: true, position: true },
      },
      evaluatee: {
        select: { id: true, name: true, department: true, position: true },
      },
    },
    orderBy: [
      { evaluatee: { name: 'asc' } },
      { relationshipType: 'asc' },
    ],
  })

  return collapseAdminMappings(rawMappings)
}
