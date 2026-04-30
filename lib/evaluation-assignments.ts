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

type SnapshotAssignment = {
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  source: string
  sourceRefId: string | null
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
    ignoreSnapshots?: boolean
    db?: DbClient
  } = {}
) {
  const db = options.db || prisma
  const includeUsers = Boolean(options.includeUsers)

  if (!options.ignoreSnapshots) {
    const period = await db.evaluationPeriod.findUnique({
      where: { id: periodId },
      select: { isLocked: true },
    })

    if (period?.isLocked) {
      const snapshotWhere: Prisma.EvaluationPeriodAssignmentSnapshotWhereInput = {
        periodId,
      }
      if (options.evaluatorId) snapshotWhere.evaluatorId = options.evaluatorId
      if (options.evaluateeId) snapshotWhere.evaluateeId = options.evaluateeId

      const snapshots = await db.evaluationPeriodAssignmentSnapshot.findMany({
        where: snapshotWhere,
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
      })

      if (snapshots.length > 0) {
        return snapshots.map((snapshot) => {
          const row = snapshot as SnapshotAssignment
          return {
            evaluatorId: row.evaluatorId,
            evaluateeId: row.evaluateeId,
            relationshipType: row.relationshipType,
            source: row.source as AssignmentSource,
            mappingId: row.source === 'PERMANENT_MAPPING' ? row.sourceRefId || undefined : undefined,
            selectionId:
              row.source === 'PRE_EVALUATION_PEER' ||
              row.source === 'PRE_EVALUATION_CROSS_DEPARTMENT'
                ? row.sourceRefId || undefined
                : undefined,
            overrideId: row.source === 'PERIOD_OVERRIDE' ? row.sourceRefId || undefined : undefined,
            evaluator: row.evaluator,
            evaluatee: row.evaluatee,
          }
        })
      }
    }
  }

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

export async function snapshotEvaluationPeriodAssignments(
  periodId: string,
  db: DbClient = prisma
) {
  const assignments = await getResolvedEvaluationAssignments(periodId, {
    db,
    ignoreSnapshots: true,
  })

  await db.evaluationPeriodAssignmentSnapshot.deleteMany({
    where: { periodId },
  })

  if (assignments.length === 0) {
    return { count: 0 }
  }

  await db.evaluationPeriodAssignmentSnapshot.createMany({
    data: assignments.map((assignment) => ({
      periodId,
      evaluatorId: assignment.evaluatorId,
      evaluateeId: assignment.evaluateeId,
      relationshipType: assignment.relationshipType,
      source: assignment.source,
      sourceRefId:
        assignment.mappingId ||
        assignment.selectionId ||
        assignment.overrideId ||
        null,
    })),
    skipDuplicates: true,
  })

  return { count: assignments.length }
}

export async function getResolvedEvaluationAssignmentForPair(
  periodId: string,
  evaluatorId: string,
  evaluateeId: string,
  relationshipType?: RelationshipType,
  db?: DbClient
) {
  const assignments = await getResolvedEvaluationAssignments(periodId, {
    evaluatorId,
    evaluateeId,
    includeUsers: true,
    db,
  })

  if (relationshipType) {
    return assignments.find((assignment) => assignment.relationshipType === relationshipType) || null
  }

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
