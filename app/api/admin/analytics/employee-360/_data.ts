import { prisma } from '@/lib/db'
import {
  computePeriodScoreMatrix,
  type PeriodScoreMatrix,
} from '@/lib/analytics/period-score-matrix'
import { computeBlindSpots } from '@/lib/analytics/blind-spots'
import { computeTalentGrid } from '@/lib/analytics/talent-grid'
import { computeCalibration } from '@/lib/analytics/calibration'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import {
  FINALIZED_PAYROLL_PERIOD_STATUSES as FINALIZED_PAYROLL_PERIOD_STATUS_SET,
  USABLE_PAYROLL_RECEIPT_STATUSES as USABLE_PAYROLL_RECEIPT_STATUS_SET,
  getScorablePeriods as filterScorablePeriods,
  isEmployee360Eligible,
  selectScorablePeriod,
  type ScorablePeriodCandidate,
} from '@/lib/analytics/employee-360'
import {
  buildAssignmentLookup,
  resolveEvaluationRelationshipTypeForRow,
} from '@/lib/evaluation-relationship-resolution'
import type { RelationshipType } from '@/types'
import type { PayrollPeriodStatus, PayrollReceiptStatus } from '@prisma/client'

export class Employee360RequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export const FINALIZED_PAYROLL_PERIOD_STATUSES = [
  ...FINALIZED_PAYROLL_PERIOD_STATUS_SET,
] as PayrollPeriodStatus[]

export const USABLE_PAYROLL_RECEIPT_STATUSES = [
  ...USABLE_PAYROLL_RECEIPT_STATUS_SET,
] as PayrollReceiptStatus[]

export const RECENT_OPERATIONS_DAYS = 90
export const RECENT_ITEM_LIMIT = 12
const ANALYTICS_CACHE_TTL_MS = 30_000

export function extractBasicSalary(receiptJson: unknown): number | null {
  if (!receiptJson || typeof receiptJson !== 'object') return null
  const earnings = (receiptJson as { earnings?: unknown }).earnings
  if (!earnings || typeof earnings !== 'object') return null
  const amount = Number((earnings as { basicSalary?: unknown }).basicSalary)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export type ScorablePeriod = ScorablePeriodCandidate & {
  startDate: Date
  endDate: Date
}

export async function getScorablePeriods(): Promise<ScorablePeriod[]> {
  const [periods, periodIdsWithScores] = await Promise.all([
    prisma.evaluationPeriod.findMany({
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isActive: true,
      },
    }),
    prisma.evaluation.groupBy({
      by: ['periodId'],
      where: {
        submittedAt: { not: null },
        ratingValue: { not: null },
      },
      _count: { _all: true },
    }),
  ])

  const scoreCountByPeriod = new Map(
    periodIdsWithScores.map((entry) => [entry.periodId, entry._count._all])
  )
  return filterScorablePeriods(
    periods.map((period) => ({
      ...period,
      submittedScoreCount: scoreCountByPeriod.get(period.id) ?? 0,
    }))
  )
}

export function resolveSelectedPeriod(
  periods: readonly ScorablePeriod[],
  requestedPeriodId?: string | null
) {
  if (periods.length === 0) {
    throw new Employee360RequestError('No evaluation data found', 404)
  }

  if (
    requestedPeriodId &&
    requestedPeriodId !== 'active' &&
    !periods.some((period) => period.id === requestedPeriodId)
  ) {
    throw new Employee360RequestError('The requested period is not scorable', 400)
  }

  const selected = selectScorablePeriod(
    periods,
    requestedPeriodId === 'active' ? null : requestedPeriodId
  )
  if (!selected) {
    throw new Employee360RequestError('The requested period is not scorable', 400)
  }
  return selected
}

export async function loadAnalyticsContext(
  periods: readonly ScorablePeriod[],
  selectedPeriod: ScorablePeriod
) {
  const matrices = (
    await Promise.all(
      periods.map(async (period) => {
        try {
          return await computePeriodScoreMatrix(period.id)
        } catch (error) {
          console.error(`Failed to compute Employee 360 matrix for ${period.id}:`, error)
          return null
        }
      })
    )
  ).filter((matrix): matrix is PeriodScoreMatrix => matrix !== null)

  const currentMatrix = matrices.find((matrix) => matrix.periodId === selectedPeriod.id)
  if (!currentMatrix) {
    throw new Employee360RequestError('Failed to compute analytics for the requested period', 500)
  }

  const selectedIndex = periods.findIndex((period) => period.id === selectedPeriod.id)
  const previousPeriod =
    selectedIndex >= 0 && selectedIndex < periods.length - 1
      ? periods[selectedIndex + 1]
      : null
  const previousMatrix =
    matrices.find((matrix) => matrix.periodId === previousPeriod?.id) ?? null

  const [assignments, ratingRows] = await Promise.all([
    getResolvedEvaluationAssignments(selectedPeriod.id),
    prisma.evaluation.findMany({
      where: {
        periodId: selectedPeriod.id,
        submittedAt: { not: null },
        ratingValue: { not: null },
      },
      select: {
        evaluatorId: true,
        evaluateeId: true,
        ratingValue: true,
        leadQuestionId: true,
        question: { select: { relationshipType: true } },
      },
    }),
  ])

  const assignmentLookup = buildAssignmentLookup(
    assignments.map((assignment) => ({
      evaluatorId: assignment.evaluatorId,
      evaluateeId: assignment.evaluateeId,
      relationshipType: assignment.relationshipType as RelationshipType,
    }))
  )
  const resolvedRatingRows = ratingRows.map((row) => ({
    ...row,
    relationshipType: resolveEvaluationRelationshipTypeForRow({
      evaluation: {
        evaluatorId: row.evaluatorId,
        evaluateeId: row.evaluateeId,
        question: row.question
          ? {
              relationshipType: row.question
                .relationshipType as RelationshipType,
            }
          : null,
        leadQuestionId: row.leadQuestionId,
      },
      assignmentLookup,
    }),
  }))

  const calibration = computeCalibration({
    ratings: resolvedRatingRows.map((row) => ({
      evaluatorId: row.evaluatorId,
      ratingValue: row.ratingValue as number,
      relationshipType: row.relationshipType ?? undefined,
    })),
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })
  const blindSpotsByPeriod = new Map(
    matrices.map((matrix) => [matrix.periodId, computeBlindSpots(matrix)])
  )

  return {
    matrices,
    currentMatrix,
    previousMatrix,
    previousPeriod,
    assignments,
    ratingRows: resolvedRatingRows,
    calibration,
    blindSpots: blindSpotsByPeriod.get(currentMatrix.periodId)!,
    orgPerLensAverageByPeriod: new Map(
      [...blindSpotsByPeriod.entries()].map(([periodId, result]) => [
        periodId,
        result.orgPerLensAverage,
      ])
    ),
    talentGrid: computeTalentGrid({
      current: currentMatrix,
      comparison: previousMatrix,
    }),
  }
}

type AnalyticsContext = Awaited<ReturnType<typeof loadAnalyticsContext>>
const analyticsContextCache = new Map<
  string,
  { expiresAt: number; value: Promise<AnalyticsContext> }
>()

/**
 * Only score/calibration analytics are short-cached. Payroll, leave, tasks and
 * every assembled response are always loaded fresh and returned no-store.
 */
export function loadCachedAnalyticsContext(
  periods: readonly ScorablePeriod[],
  selectedPeriod: ScorablePeriod
): Promise<AnalyticsContext> {
  const key = `${selectedPeriod.id}:${periods.map((period) => `${period.id}:${period.submittedScoreCount}`).join(',')}`
  const now = Date.now()
  const cached = analyticsContextCache.get(key)
  if (cached && cached.expiresAt > now) return cached.value

  const value = loadAnalyticsContext(periods, selectedPeriod)
  analyticsContextCache.set(key, {
    expiresAt: now + ANALYTICS_CACHE_TTL_MS,
    value,
  })
  value.catch(() => {
    if (analyticsContextCache.get(key)?.value === value) {
      analyticsContextCache.delete(key)
    }
  })
  return value
}

export async function loadDirectoryRows() {
  return prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      department: true,
      position: true,
      teamTag: true,
      payrollProfile: {
        select: {
          isPayrollActive: true,
          joiningDate: true,
          exitDate: true,
        },
      },
      _count: {
        select: {
          evaluatorMappings: true,
          evaluateeMappings: true,
          clientAssignments: {
            where: { client: { status: 'ACTIVE' } },
          },
          assignedTasks: true,
          leaveRequests: true,
        },
      },
    },
  })
}

export async function loadDirectoryEvaluationCoverage(
  scorablePeriodIds: readonly string[]
) {
  if (scorablePeriodIds.length === 0) return new Map<string, Set<string>>()

  const rows = await prisma.evaluation.findMany({
    where: {
      periodId: { in: [...scorablePeriodIds] },
      submittedAt: { not: null },
      ratingValue: { not: null },
    },
    select: {
      evaluateeId: true,
      periodId: true,
    },
    distinct: ['evaluateeId', 'periodId'],
  })

  const coverage = new Map<string, Set<string>>()
  for (const row of rows) {
    const periods = coverage.get(row.evaluateeId) ?? new Set<string>()
    periods.add(row.periodId)
    coverage.set(row.evaluateeId, periods)
  }
  return coverage
}

export async function loadDirectoryCompensationCoverage() {
  const rows = await prisma.payrollReceipt.findMany({
    where: {
      userId: { not: null },
      status: { in: [...USABLE_PAYROLL_RECEIPT_STATUSES] },
      period: { status: { in: [...FINALIZED_PAYROLL_PERIOD_STATUSES] } },
    },
    select: {
      userId: true,
      receiptJson: true,
    },
  })

  const coverage = new Map<string, number>()
  for (const row of rows) {
    if (!row.userId || extractBasicSalary(row.receiptJson) === null) continue
    coverage.set(row.userId, (coverage.get(row.userId) ?? 0) + 1)
  }
  return coverage
}

export async function loadDossierRows(employeeIds: readonly string[]) {
  const uniqueIds = [...new Set(employeeIds)]
  if (uniqueIds.length === 0) {
    throw new Employee360RequestError('At least one employee is required', 400)
  }

  const now = new Date()
  const recentSince = new Date(
    now.getTime() - RECENT_OPERATIONS_DAYS * 24 * 60 * 60 * 1000
  )
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31))

  const [
    users,
    clientAssignments,
    colleagueAssignments,
    mappingRows,
    payrollReceipts,
    openTasks,
    completedTasks,
    leaveRequests,
    selfEvaluations,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        name: true,
        department: true,
        position: true,
        teamTag: true,
        payrollProfile: {
          select: {
            isPayrollActive: true,
            joiningDate: true,
            exitDate: true,
            designation: true,
            employmentType: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
    }),
    prisma.clientAssignment.findMany({
      where: {
        userId: { in: uniqueIds },
        client: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        userId: true,
        clientId: true,
        role: true,
        createdAt: true,
        client: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    // Filled below once active client ids are known. This first query deliberately
    // gets every active assignment in one pass rather than fanning out per person.
    prisma.clientAssignment.findMany({
      where: { client: { status: 'ACTIVE' } },
      select: {
        userId: true,
        clientId: true,
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            position: true,
            department: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.evaluatorMapping.findMany({
      where: {
        OR: [
          { evaluatorId: { in: uniqueIds } },
          { evaluateeId: { in: uniqueIds } },
        ],
      },
      select: {
        evaluatorId: true,
        evaluateeId: true,
        relationshipType: true,
        evaluator: {
          select: {
            id: true,
            name: true,
            position: true,
            department: true,
          },
        },
        evaluatee: {
          select: {
            id: true,
            name: true,
            position: true,
            department: true,
          },
        },
      },
    }),
    prisma.payrollReceipt.findMany({
      where: {
        userId: { in: uniqueIds },
        status: { in: [...USABLE_PAYROLL_RECEIPT_STATUSES] },
        period: { status: { in: [...FINALIZED_PAYROLL_PERIOD_STATUSES] } },
      },
      select: {
        id: true,
        userId: true,
        status: true,
        receiptJson: true,
        period: {
          select: {
            id: true,
            label: true,
            currency: true,
            periodStart: true,
            periodEnd: true,
            status: true,
          },
        },
      },
      orderBy: { period: { periodStart: 'asc' } },
    }),
    prisma.task.findMany({
      where: {
        assigneeId: { in: uniqueIds },
        status: { not: 'DONE' },
      },
      select: {
        id: true,
        assigneeId: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        updatedAt: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
    }),
    prisma.task.findMany({
      where: {
        assigneeId: { in: uniqueIds },
        status: 'DONE',
        OR: [
          { completedAt: { gte: recentSince } },
          { completedAt: null, updatedAt: { gte: recentSince } },
        ],
      },
      select: {
        id: true,
        assigneeId: true,
        title: true,
        completedAt: true,
        updatedAt: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: uniqueIds },
        status: 'APPROVED',
        endDate: { gte: yearStart },
        startDate: { lte: yearEnd },
      },
      select: {
        id: true,
        employeeId: true,
        leaveType: true,
        isHalfDay: true,
        startDate: true,
        endDate: true,
        requestTimezone: true,
        updatedAt: true,
      },
      orderBy: { startDate: 'desc' },
    }),
    prisma.selfEvaluation.findMany({
      where: {
        employeeId: { in: uniqueIds },
        status: 'SUBMITTED',
      },
      select: {
        id: true,
        employeeId: true,
        periodId: true,
        submittedAt: true,
      },
    }),
  ])

  const userById = new Map(users.map((user) => [user.id, user]))
  const unavailable = uniqueIds.find((id) => {
    const employee = userById.get(id)
    return !employee || !isEmployee360Eligible(employee)
  })
  if (unavailable) {
    throw new Employee360RequestError(
      unavailable === uniqueIds[0] ? 'Employee not found' : 'Comparison employee not found',
      404
    )
  }

  return {
    now,
    recentSince,
    yearStart,
    yearEnd,
    users,
    clientAssignments,
    colleagueAssignments,
    mappingRows,
    payrollReceipts,
    openTasks,
    completedTasks,
    leaveRequests,
    selfEvaluations,
  }
}

export async function loadEvidenceRows(params: {
  employeeId: string
  periodId: string
}) {
  const [employee, assignments, evaluationRows, selfEvaluation] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: params.employeeId },
        select: { id: true, name: true, department: true },
      }),
      getResolvedEvaluationAssignments(params.periodId),
      prisma.evaluation.findMany({
        where: {
          evaluateeId: params.employeeId,
          periodId: params.periodId,
          submittedAt: { not: null },
          OR: [
            { ratingValue: { not: null } },
            { textResponse: { not: null } },
          ],
        },
        select: {
          id: true,
          evaluatorId: true,
          evaluateeId: true,
          leadQuestionId: true,
          ratingValue: true,
          textResponse: true,
          submittedAt: true,
          updatedAt: true,
          evaluator: {
            select: {
              id: true,
              name: true,
              position: true,
              department: true,
            },
          },
          question: {
            select: {
              id: true,
              questionText: true,
              questionType: true,
              relationshipType: true,
              maxRating: true,
              orderIndex: true,
            },
          },
          leadQuestion: {
            select: {
              id: true,
              questionText: true,
              orderIndex: true,
            },
          },
        },
        orderBy: [{ evaluatorId: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.selfEvaluation.findUnique({
        where: {
          periodId_employeeId: {
            periodId: params.periodId,
            employeeId: params.employeeId,
          },
        },
        select: {
          id: true,
          status: true,
          answers: true,
          submittedAt: true,
          updatedAt: true,
        },
      }),
    ])

  if (!employee || !isEmployee360Eligible(employee)) {
    throw new Employee360RequestError('Employee not found', 404)
  }

  return {
    employee,
    assignments,
    evaluationRows,
    selfEvaluation,
  }
}
