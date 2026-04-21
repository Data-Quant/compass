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
  | 'PERIOD_OVERRIDE'

export type PeriodAssignmentOverrideAction = 'ADD' | 'REMOVE'

type RawMappingAssignment = {
  id: string
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  evaluator?: UserSummary
  evaluatee?: UserSummary
}

type ApprovedSelectionAssignment = {
  id: string
  evaluateeId: string
  suggestedEvaluatorId: string
  suggestedEvaluator?: UserSummary
  evaluatee?: UserSummary
}

export type PeriodAssignmentOverrideInput = {
  id: string
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  action: PeriodAssignmentOverrideAction
  evaluator?: UserSummary
  evaluatee?: UserSummary
}

export interface ResolvedEvaluationAssignment {
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  source: AssignmentSource
  mappingId?: string
  selectionId?: string
  overrideId?: string
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

export function resolveEvaluationAssignments(params: {
  rawMappings: RawMappingAssignment[]
  approvedPeerSelections: ApprovedSelectionAssignment[]
  approvedCrossSelections: ApprovedSelectionAssignment[]
  periodOverrides?: PeriodAssignmentOverrideInput[]
}) {
  const { rawMappings, approvedPeerSelections, approvedCrossSelections } = params
  const periodOverrides = params.periodOverrides || []

  const approvedCrossDepartmentKeys = new Set(
    approvedCrossSelections.map((selection) =>
      buildAssignmentKey(
        selection.suggestedEvaluatorId,
        selection.evaluateeId,
        'CROSS_DEPARTMENT'
      )
    )
  )

  const removedKeys = new Set(
    periodOverrides
      .filter((override) => override.action === 'REMOVE')
      .map((override) =>
        buildAssignmentKey(
          override.evaluatorId,
          override.evaluateeId,
          override.relationshipType
        )
      )
  )

  const assignments: ResolvedEvaluationAssignment[] = []
  const seen = new Set<string>()

  for (const mapping of rawMappings) {
    if (
      mapping.relationshipType === 'CROSS_DEPARTMENT' &&
      !approvedCrossDepartmentKeys.has(
        buildAssignmentKey(mapping.evaluatorId, mapping.evaluateeId, 'CROSS_DEPARTMENT')
      )
    ) {
      continue
    }

    const key = buildAssignmentKey(
      mapping.evaluatorId,
      mapping.evaluateeId,
      mapping.relationshipType
    )
    if (removedKeys.has(key) || seen.has(key)) {
      continue
    }

    seen.add(key)
    assignments.push({
      evaluatorId: mapping.evaluatorId,
      evaluateeId: mapping.evaluateeId,
      relationshipType: mapping.relationshipType,
      source:
        mapping.relationshipType === 'CROSS_DEPARTMENT'
          ? 'PRE_EVALUATION_CROSS_DEPARTMENT'
          : 'PERMANENT_MAPPING',
      mappingId: mapping.id,
      evaluator: mapping.evaluator,
      evaluatee: mapping.evaluatee,
    })
  }

  for (const selection of approvedPeerSelections) {
    const key = buildAssignmentKey(selection.suggestedEvaluatorId, selection.evaluateeId, 'PEER')
    if (removedKeys.has(key) || seen.has(key)) {
      continue
    }

    seen.add(key)
    assignments.push({
      evaluatorId: selection.suggestedEvaluatorId,
      evaluateeId: selection.evaluateeId,
      relationshipType: 'PEER',
      source: 'PRE_EVALUATION_PEER',
      selectionId: selection.id,
      evaluator: selection.suggestedEvaluator,
      evaluatee: selection.evaluatee,
    })
  }

  for (const override of periodOverrides.filter((item) => item.action === 'ADD')) {
    const key = buildAssignmentKey(
      override.evaluatorId,
      override.evaluateeId,
      override.relationshipType
    )
    if (removedKeys.has(key) || seen.has(key)) {
      continue
    }

    seen.add(key)
    assignments.push({
      evaluatorId: override.evaluatorId,
      evaluateeId: override.evaluateeId,
      relationshipType: override.relationshipType,
      source: 'PERIOD_OVERRIDE',
      overrideId: override.id,
      evaluator: override.evaluator,
      evaluatee: override.evaluatee,
    })
  }

  return assignments
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

  const overrideWhere: Prisma.EvaluationPeriodAssignmentOverrideWhereInput = {
    periodId,
  }
  if (options.evaluatorId && options.evaluateeId) {
    overrideWhere.evaluatorId = options.evaluatorId
    overrideWhere.evaluateeId = options.evaluateeId
  } else if (options.evaluatorId) {
    overrideWhere.evaluatorId = options.evaluatorId
  } else if (options.evaluateeId) {
    overrideWhere.evaluateeId = options.evaluateeId
  }

  const [rawMappings, approvedPeerSelections, approvedCrossSelections, periodOverrides] =
    await Promise.all([
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
    db.evaluationPeriodAssignmentOverride.findMany({
      where: overrideWhere,
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
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ])

  return resolveEvaluationAssignments({
    rawMappings: rawMappings.map((mapping) => ({
      id: mapping.id,
      evaluatorId: mapping.evaluatorId,
      evaluateeId: mapping.evaluateeId,
      relationshipType: mapping.relationshipType as RelationshipType,
      evaluator: 'evaluator' in mapping ? (mapping.evaluator as UserSummary) : undefined,
      evaluatee: 'evaluatee' in mapping ? (mapping.evaluatee as UserSummary) : undefined,
    })),
    approvedPeerSelections: approvedPeerSelections.map((selection) => ({
      id: selection.id,
      evaluateeId: selection.evaluateeId,
      suggestedEvaluatorId: selection.suggestedEvaluatorId!,
      suggestedEvaluator:
        'suggestedEvaluator' in selection
          ? (selection.suggestedEvaluator as UserSummary)
          : undefined,
      evaluatee: 'evaluatee' in selection ? (selection.evaluatee as UserSummary) : undefined,
    })),
    approvedCrossSelections: approvedCrossSelections.map((selection) => ({
      id: selection.id,
      evaluateeId: selection.evaluateeId,
      suggestedEvaluatorId: selection.suggestedEvaluatorId!,
      suggestedEvaluator:
        'suggestedEvaluator' in selection
          ? (selection.suggestedEvaluator as UserSummary)
          : undefined,
      evaluatee: 'evaluatee' in selection ? (selection.evaluatee as UserSummary) : undefined,
    })),
    periodOverrides: periodOverrides.map((override) => ({
      id: override.id,
      evaluatorId: override.evaluatorId,
      evaluateeId: override.evaluateeId,
      relationshipType: override.relationshipType as RelationshipType,
      action: override.action as PeriodAssignmentOverrideAction,
      evaluator: 'evaluator' in override ? (override.evaluator as UserSummary) : undefined,
      evaluatee: 'evaluatee' in override ? (override.evaluatee as UserSummary) : undefined,
    })),
  })
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
