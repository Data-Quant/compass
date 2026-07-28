import { createHmac } from 'node:crypto'
import { calculateLeaveDuration } from '@/lib/leave-utils'
import { toStartOfDay } from '@/lib/my-tasks/dates'
import {
  buildCompensationTrajectory,
  computeClientConcentration,
  resolveEmploymentStatus,
  selfVsOthersGap,
  sortEvaluationLenses,
  sortTimelineNewestFirst,
  sumApprovedWorkingLeaveDays,
  summarizeAvailability,
} from '@/lib/analytics/employee-360'
import {
  directoryPayloadSchema,
  employeeDossierSchema,
  evidencePayloadSchema,
  type Availability,
  type DirectoryPayload,
  type Employee360PeriodRef,
  type EmployeeDossier,
  type EvidencePayload,
  type StructuredEvidenceResponse,
} from '@/lib/analytics/employee-360-contracts'
import type { EmployeePeriodScore } from '@/lib/analytics/period-score-matrix'
import type { RelationshipType } from '@/types'
import {
  buildAssignmentLookup,
  resolveEvaluationRelationshipTypeForRow,
} from '@/lib/evaluation-relationship-resolution'
import {
  type loadAnalyticsContext,
  type loadDirectoryRows,
  type loadDossierRows,
  type loadEvidenceRows,
  RECENT_ITEM_LIMIT,
  type ScorablePeriod,
  extractBasicSalary,
} from './_data'

type AnalyticsContext = Awaited<ReturnType<typeof loadAnalyticsContext>>
type DirectoryRows = Awaited<ReturnType<typeof loadDirectoryRows>>
type DossierRows = Awaited<ReturnType<typeof loadDossierRows>>
type EvidenceRows = Awaited<ReturnType<typeof loadEvidenceRows>>

const LENS_ORDER: RelationshipType[] = [
  'TEAM_LEAD',
  'PEER',
  'HR',
  'DEPT',
  'DIRECT_REPORT',
  'C_LEVEL',
  'CROSS_DEPARTMENT',
  'SELF',
]

const LENS_LABELS: Record<RelationshipType, string> = {
  TEAM_LEAD: 'Team lead',
  PEER: 'Peer',
  HR: 'HR',
  DEPT: 'Department',
  DIRECT_REPORT: 'Direct report',
  C_LEVEL: 'C-level',
  CROSS_DEPARTMENT: 'Cross-department',
  SELF: 'Self',
}

function round(value: number, places = 4) {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

export function toPeriodRef(period: ScorablePeriod): Employee360PeriodRef {
  return {
    id: period.id,
    name: period.name,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    isActive: period.isActive,
  }
}

export function assembleDirectoryPayload(params: {
  generatedAt: Date
  periods: readonly ScorablePeriod[]
  rows: DirectoryRows
  evaluationCoverage: ReadonlyMap<string, ReadonlySet<string>>
  compensationCoverage: ReadonlyMap<string, number>
}): DirectoryPayload {
  const payload = {
    generatedAt: params.generatedAt.toISOString(),
    periods: params.periods.map(toPeriodRef),
    employees: params.rows.map((row) => {
      const evaluatedPeriods = params.evaluationCoverage.get(row.id)?.size ?? 0
      const evaluation: Availability =
        evaluatedPeriods === 0
          ? 'NO_DATA'
          : evaluatedPeriods < params.periods.length
            ? 'PARTIAL'
            : 'AVAILABLE'
      const clients: Availability =
        row._count.clientAssignments > 0 ? 'AVAILABLE' : 'NO_DATA'
      const salaryObservations = params.compensationCoverage.get(row.id) ?? 0
      const compensation: Availability =
        salaryObservations > 1
          ? 'AVAILABLE'
          : salaryObservations === 1
            ? 'PARTIAL'
            : 'NO_DATA'
      const network: Availability =
        row._count.evaluatorMappings +
          row._count.evaluateeMappings +
          row._count.clientAssignments >
        0
          ? 'AVAILABLE'
          : 'NO_DATA'

      return {
        id: row.id,
        name: row.name,
        department: row.department,
        position: row.position,
        employmentStatus: resolveEmploymentStatus(
          row.payrollProfile?.isPayrollActive
        ),
        dataCoverage: {
          evaluation,
          clients,
          compensation,
          // A zero task/leave count is a measured zero, not missing data.
          operations: 'AVAILABLE' as const,
          network,
        },
      }
    }).sort(
      (a, b) =>
        (a.employmentStatus === 'ACTIVE' ? 0 : 1) -
          (b.employmentStatus === 'ACTIVE' ? 0 : 1) ||
        a.name.localeCompare(b.name)
    ),
  }

  return directoryPayloadSchema.parse(payload)
}

function hasWeightedExternalEvidence(score: EmployeePeriodScore | null | undefined) {
  if (!score) return false
  return Object.entries(score.perLens).some(
    ([lens, lensScore]) =>
      lens !== 'SELF' &&
      lensScore !== undefined &&
      (score.weights[lens] ?? 0) > 0
  )
}

function lensesForScore(
  score: EmployeePeriodScore | null | undefined,
  orgAverages: Partial<Record<RelationshipType, number>>
) {
  if (!score) return []
  return sortEvaluationLenses(LENS_ORDER.flatMap((relationshipType) => {
    const lens = score.perLens[relationshipType]
    if (!lens) return []
    const rawWeight = relationshipType === 'SELF' ? 0 : (score.weights[relationshipType] ?? 0)
    return [
      {
        relationshipType,
        score: lens.normalizedScore,
        evaluatorCount: lens.evaluatorCount,
        orgAverage: orgAverages[relationshipType] ?? null,
        weight: rawWeight > 0 ? rawWeight : null,
        includedInOverall: relationshipType !== 'SELF' && rawWeight > 0,
      },
    ]
  }))
}

function opaqueRaterKey(params: {
  employeeId: string
  evaluatorId: string
  periodId: string
}) {
  const key = process.env.SESSION_SECRET || 'employee-360-local-key'
  return createHmac('sha256', key)
    .update(`${params.periodId}:${params.employeeId}:${params.evaluatorId}`)
    .digest('hex')
    .slice(0, 20)
}

function buildEvaluationDomain(params: {
  employeeId: string
  periods: readonly ScorablePeriod[]
  selectedPeriod: ScorablePeriod
  analytics: AnalyticsContext
}) {
  const currentScore =
    params.analytics.currentMatrix.scores.find(
      (entry) => entry.employeeId === params.employeeId
    ) ?? null
  const currentHasOverall = hasWeightedExternalEvidence(currentScore)
  const talentEntry = currentHasOverall
    ? params.analytics.talentGrid.entries.find(
        (entry) => entry.employeeId === params.employeeId
      ) ?? null
    : null

  const comparableScores = params.analytics.currentMatrix.scores.filter(
    hasWeightedExternalEvidence
  )
  const companyBaseline =
    comparableScores.length > 0
      ? comparableScores.reduce((sum, score) => sum + score.overallScore, 0) /
        comparableScores.length
      : null

  const self = currentScore?.perLens.SELF?.normalizedScore ?? null
  const selfGap = selfVsOthersGap(
    self,
    currentHasOverall ? currentScore!.overallScore : null
  )

  const history = [...params.periods]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((period) => {
    const matrix = params.analytics.matrices.find(
      (entry) => entry.periodId === period.id
    )
    const score =
      matrix?.scores.find((entry) => entry.employeeId === params.employeeId) ?? null
    const observedOverall = hasWeightedExternalEvidence(score)
      ? score!.overallScore
      : null
    const averages =
      params.analytics.orgPerLensAverageByPeriod.get(period.id) ?? {}
    return {
      period: toPeriodRef(period),
      overallScore: observedOverall,
      perLens: lensesForScore(score, averages),
    }
    })
    .filter(
      (point) => point.overallScore !== null || point.perLens.length > 0
    )

  const calibrationByEvaluator = new Map(
    params.analytics.calibration.allEvaluators.map((row) => [row.evaluatorId, row])
  )
  const responses = new Map<
    string,
    { relationshipType: RelationshipType; values: number[] }
  >()
  for (const row of params.analytics.ratingRows) {
    if (row.evaluateeId !== params.employeeId || row.ratingValue === null) continue
    const relationshipType = row.relationshipType
    if (!relationshipType) continue
    const existing = responses.get(row.evaluatorId)
    if (existing) existing.values.push(row.ratingValue)
    else responses.set(row.evaluatorId, { relationshipType, values: [row.ratingValue] })
  }

  const raters = [...responses.entries()]
    .map(([evaluatorId, row]) => {
      const calibration = calibrationByEvaluator.get(evaluatorId)
      return {
        raterKey: opaqueRaterKey({
          employeeId: params.employeeId,
          evaluatorId,
          periodId: params.selectedPeriod.id,
        }),
        relationshipType: row.relationshipType,
        meanGiven:
          row.values.length > 0
            ? row.values.reduce((sum, value) => sum + value, 0) / row.values.length
            : null,
        deviation: calibration?.deviation ?? null,
        isProvisional: calibration?.isProvisional ?? true,
        responseCount: row.values.length,
      }
    })
    .sort(
      (a, b) =>
        LENS_ORDER.indexOf(a.relationshipType) -
          LENS_ORDER.indexOf(b.relationshipType) ||
        a.raterKey.localeCompare(b.raterKey)
    )

  return {
    period: toPeriodRef(params.selectedPeriod),
    overallScore: currentHasOverall ? currentScore!.overallScore : null,
    performanceBand: talentEntry?.performanceBand ?? null,
    momentumDelta: talentEntry?.momentumDelta ?? null,
    momentumBand: talentEntry?.momentumBand ?? null,
    consensus: talentEntry?.consensus ?? null,
    companyBaseline,
    selfVsOthersGap: selfGap,
    lenses: lensesForScore(
      currentScore,
      params.analytics.blindSpots.orgPerLensAverage
    ),
    history,
    raters,
  }
}

function buildClientFootprint(params: {
  employeeId: string
  rows: DossierRows
  generatedAt: Date
}) {
  const mine = params.rows.clientAssignments.filter(
    (assignment) => assignment.userId === params.employeeId
  )
  const activeRowsByClient = new Map<string, typeof params.rows.colleagueAssignments>()
  for (const assignment of params.rows.colleagueAssignments) {
    activeRowsByClient.set(assignment.clientId, [
      ...(activeRowsByClient.get(assignment.clientId) ?? []),
      assignment,
    ])
  }

  const assignments = mine.map((assignment) => ({
    clientId: assignment.clientId,
    clientName: assignment.client.name,
    role: assignment.role,
    assignedAt: assignment.createdAt.toISOString(),
    tenureDays: Math.max(
      0,
      Math.floor(
        (params.generatedAt.getTime() - assignment.createdAt.getTime()) /
          (24 * 60 * 60 * 1000)
      )
    ),
    teamSize: activeRowsByClient.get(assignment.clientId)?.length ?? null,
  }))

  const myClientIds = new Set(mine.map((assignment) => assignment.clientId))
  const collaborators = new Map<
    string,
    {
      employeeId: string
      name: string
      position: string | null
      sharedClients: Array<{ id: string; name: string }>
    }
  >()
  for (const assignment of params.rows.colleagueAssignments) {
    if (
      assignment.userId === params.employeeId ||
      !myClientIds.has(assignment.clientId)
    ) {
      continue
    }
    const existing = collaborators.get(assignment.userId)
    const sharedClient = {
      id: assignment.client.id,
      name: assignment.client.name,
    }
    if (existing) {
      if (!existing.sharedClients.some((client) => client.id === sharedClient.id)) {
        existing.sharedClients.push(sharedClient)
      }
    } else {
      collaborators.set(assignment.userId, {
        employeeId: assignment.user.id,
        name: assignment.user.name,
        position: assignment.user.position,
        sharedClients: [sharedClient],
      })
    }
  }

  return {
    assignments,
    // Assignment presence is the only supported basis; no time allocation or
    // outcome weighting is inferred.
    concentration: computeClientConcentration(
      mine.map((assignment) => ({
        clientId: assignment.clientId,
        clientName: assignment.client.name,
      }))
    ),
    collaborators: [...collaborators.values()].sort(
      (a, b) =>
        b.sharedClients.length - a.sharedClients.length ||
        a.name.localeCompare(b.name)
    ),
    outcomeEvidenceAvailable: false as const,
  }
}

function buildCompensation(params: {
  employeeId: string
  rows: DossierRows
}) {
  const salaryRows = params.rows.payrollReceipts.flatMap((receipt) => {
    if (receipt.userId !== params.employeeId) return []
    const amount = extractBasicSalary(receipt.receiptJson)
    if (amount === null) return []
    return [
      {
        periodId: receipt.period.id,
        periodLabel: receipt.period.label,
        effectiveFrom: receipt.period.periodStart,
        amount,
        currency: receipt.period.currency,
        receiptStatus: receipt.status,
      },
    ]
  })
  return buildCompensationTrajectory(
    salaryRows.map((row) => {
      const receipt = params.rows.payrollReceipts.find(
        (candidate) =>
          candidate.userId === params.employeeId &&
          candidate.period.id === row.periodId
      )
      return {
        effectiveFrom: row.effectiveFrom.toISOString(),
        amount: row.amount,
        currency: row.currency,
        periodId: row.periodId,
        periodName: row.periodLabel,
        periodStatus: receipt?.period.status ?? null,
        receiptStatus: row.receiptStatus,
      }
    })
  )
}

function buildOperations(params: {
  employeeId: string
  rows: DossierRows
  generatedAt: Date
}) {
  const open = params.rows.openTasks.filter(
    (task) => task.assigneeId === params.employeeId
  )
  const completed = params.rows.completedTasks.filter(
    (task) => task.assigneeId === params.employeeId
  )
  const leave = params.rows.leaveRequests.filter(
    (request) => request.employeeId === params.employeeId
  )
  const approvedWorkingLeaveDays = sumApprovedWorkingLeaveDays(
    leave.map((request) => ({
      status: 'APPROVED',
      startDate:
        request.startDate < params.rows.yearStart
          ? params.rows.yearStart
          : request.startDate,
      endDate:
        request.endDate > params.rows.yearEnd
          ? params.rows.yearEnd
          : request.endDate,
      isHalfDay: request.isHalfDay,
    }))
  )

  return {
    asOf: params.generatedAt.toISOString(),
    openTasks: open.length,
    overdueTasks: open.filter(
      (task) =>
        task.dueDate !== null &&
        toStartOfDay(task.dueDate) < toStartOfDay(params.generatedAt)
    ).length,
    recentCompletions: completed.length,
    approvedWorkingLeaveDays,
    approvedLeaveRequests: leave.length,
  }
}

function buildNetwork(params: {
  employeeId: string
  rows: DossierRows
  analytics: AnalyticsContext
}) {
  const edges = new Map<
    string,
    {
      id: string
      kind: 'LEAD' | 'REPORT' | 'EVALUATOR' | 'SHARED_CLIENT'
      label: string
      person: {
        employeeId: string | null
        name: string
        position: string | null
        identityRevealed: boolean
      }
      sharedClientNames: string[]
    }
  >()

  const add = (edge: (typeof edges extends Map<string, infer V> ? V : never)) => {
    edges.set(edge.id, edge)
  }

  for (const mapping of params.rows.mappingRows) {
    if (
      mapping.evaluateeId === params.employeeId &&
      mapping.relationshipType === 'TEAM_LEAD'
    ) {
      add({
        id: `${params.employeeId}:lead:${mapping.evaluatorId}`,
        kind: 'LEAD',
        label: 'Reports to',
        person: {
          employeeId: mapping.evaluator.id,
          name: mapping.evaluator.name,
          position: mapping.evaluator.position,
          identityRevealed: true,
        },
        sharedClientNames: [],
      })
    }
    if (
      mapping.evaluatorId === params.employeeId &&
      mapping.relationshipType === 'TEAM_LEAD'
    ) {
      add({
        id: `${params.employeeId}:report:${mapping.evaluateeId}`,
        kind: 'REPORT',
        label: 'Direct report',
        person: {
          employeeId: mapping.evaluatee.id,
          name: mapping.evaluatee.name,
          position: mapping.evaluatee.position,
          identityRevealed: true,
        },
        sharedClientNames: [],
      })
    }
  }

  for (const assignment of params.analytics.assignments) {
    if (
      assignment.evaluateeId !== params.employeeId ||
      assignment.evaluatorId === params.employeeId
    ) {
      continue
    }
    const relationshipType = assignment.relationshipType as RelationshipType
    const raterKey = opaqueRaterKey({
      employeeId: params.employeeId,
      evaluatorId: assignment.evaluatorId,
      periodId: params.analytics.currentMatrix.periodId,
    })
    add({
      id: `${params.employeeId}:evaluator:${raterKey}:${relationshipType}`,
      kind: 'EVALUATOR',
      label: `${LENS_LABELS[relationshipType]} evaluator`,
      person: {
        employeeId: null,
        name: `${LENS_LABELS[relationshipType]} evaluator`,
        position: null,
        identityRevealed: false,
      },
      sharedClientNames: [],
    })
  }

  const footprint = buildClientFootprint({
    employeeId: params.employeeId,
    rows: params.rows,
    generatedAt: params.rows.now,
  })
  for (const colleague of footprint.collaborators) {
    add({
      id: `${params.employeeId}:shared-client:${colleague.employeeId}`,
      kind: 'SHARED_CLIENT',
      label:
        colleague.sharedClients.length === 1
          ? `Shares ${colleague.sharedClients[0].name}`
          : `Shares ${colleague.sharedClients.length} clients`,
      person: {
        employeeId: colleague.employeeId,
        name: colleague.name,
        position: colleague.position,
        identityRevealed: true,
      },
      sharedClientNames: colleague.sharedClients.map((client) => client.name),
    })
  }

  const kindOrder = new Map([
    ['LEAD', 0],
    ['REPORT', 1],
    ['EVALUATOR', 2],
    ['SHARED_CLIENT', 3],
  ])
  return {
    edges: [...edges.values()].sort(
      (a, b) =>
        (kindOrder.get(a.kind) ?? 99) - (kindOrder.get(b.kind) ?? 99) ||
        a.person.name.localeCompare(b.person.name)
    ),
  }
}

function buildTimeline(params: {
  employeeId: string
  generatedAt: Date
  periods: readonly ScorablePeriod[]
  analytics: AnalyticsContext
  rows: DossierRows
  clientFootprint: ReturnType<typeof buildClientFootprint>
  compensation: ReturnType<typeof buildCompensation>
}) {
  const asOf = params.generatedAt.toISOString()
  const events: EmployeeDossier['timeline'] = []

  let previousObservedScore: number | null = null
  for (const period of [...params.periods].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  )) {
    const matrix = params.analytics.matrices.find(
      (entry) => entry.periodId === period.id
    )
    const score =
      matrix?.scores.find((entry) => entry.employeeId === params.employeeId) ?? null
    if (!hasWeightedExternalEvidence(score)) continue
    const delta =
      previousObservedScore === null ? null : score!.overallScore - previousObservedScore
    events.push({
      id: `evaluation:${params.employeeId}:${period.id}`,
      occurredAt: period.endDate.toISOString(),
      kind: 'EVALUATION',
      title: `${period.name} evaluation`,
      detail: `${score!.overallScore.toFixed(1)}%${delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} vs prior observed period)`}`,
      source: 'Submitted evaluation scores',
      asOf,
    })
    previousObservedScore = score!.overallScore
  }

  for (const change of params.compensation.changeEvents) {
    events.push({
      id: `compensation:${params.employeeId}:${change.currency}:${change.effectiveFrom}`,
      occurredAt: change.effectiveFrom,
      kind: 'COMPENSATION',
      title: `Basic salary changed`,
      detail: `${change.currency} ${change.previousAmount.toLocaleString()} to ${change.amount.toLocaleString()}`,
      source: 'Finalized payroll receipt',
      asOf,
    })
  }

  for (const assignment of params.clientFootprint.assignments) {
    events.push({
      id: `client:${params.employeeId}:${assignment.clientId}:${assignment.assignedAt}`,
      occurredAt: assignment.assignedAt,
      kind: 'CLIENT_ASSIGNMENT',
      title: `Assigned to ${assignment.clientName}`,
      detail: assignment.role === 'MANAGER' ? 'Client manager' : 'Client member',
      source: 'Active client roster',
      asOf,
    })
  }

  for (const request of params.rows.leaveRequests
    .filter((row) => row.employeeId === params.employeeId)
    .slice(0, RECENT_ITEM_LIMIT)) {
    const clampedStart =
      request.startDate < params.rows.yearStart
        ? params.rows.yearStart
        : request.startDate
    const clampedEnd =
      request.endDate > params.rows.yearEnd
        ? params.rows.yearEnd
        : request.endDate
    const days = calculateLeaveDuration(
      clampedStart,
      clampedEnd,
      request.isHalfDay
    )
    events.push({
      id: `leave:${request.id}`,
      occurredAt: request.startDate.toISOString(),
      kind: 'LEAVE',
      title: `${request.leaveType.toLowerCase()} leave`,
      detail: `${days} approved working day${days === 1 ? '' : 's'}`,
      source: 'Approved leave request',
      asOf: request.updatedAt.toISOString(),
    })
  }

  for (const task of params.rows.completedTasks
    .filter((row) => row.assigneeId === params.employeeId)
    .slice(0, RECENT_ITEM_LIMIT)) {
    events.push({
      id: `task:${task.id}`,
      occurredAt: (task.completedAt ?? task.updatedAt).toISOString(),
      kind: 'TASK',
      title: `Completed: ${task.title}`,
      detail: task.project.name,
      source: 'Project tasks',
      asOf: task.updatedAt.toISOString(),
    })
  }

  return sortTimelineNewestFirst(events)
}

export function assembleDossier(params: {
  employeeId: string
  generatedAt: Date
  periods: readonly ScorablePeriod[]
  selectedPeriod: ScorablePeriod
  analytics: AnalyticsContext
  rows: DossierRows
}): EmployeeDossier {
  const employee = params.rows.users.find((user) => user.id === params.employeeId)!
  let evaluation = buildEvaluationDomain({
    employeeId: params.employeeId,
    periods: params.periods,
    selectedPeriod: params.selectedPeriod,
    analytics: params.analytics,
  })
  const clientFootprint = buildClientFootprint({
    employeeId: params.employeeId,
    rows: params.rows,
    generatedAt: params.generatedAt,
  })
  const compensation = buildCompensation({
    employeeId: params.employeeId,
    rows: params.rows,
  })
  const operations = buildOperations({
    employeeId: params.employeeId,
    rows: params.rows,
    generatedAt: params.generatedAt,
  })
  const network = buildNetwork({
    employeeId: params.employeeId,
    rows: params.rows,
    analytics: params.analytics,
  })

  const evaluationState: Availability =
    evaluation.overallScore === null &&
    evaluation.lenses.length === 0 &&
    evaluation.history.length === 0 &&
    evaluation.raters.length === 0
      ? 'NO_DATA'
      : evaluation.overallScore === null ||
          evaluation.lenses.filter((lens) => lens.relationshipType !== 'SELF').length < 2
        ? 'PARTIAL'
        : 'AVAILABLE'
  if (evaluationState === 'NO_DATA') {
    evaluation = {
      ...evaluation,
      companyBaseline: null,
      history: [],
    }
  }
  const clientsState: Availability =
    clientFootprint.assignments.length > 0 ? 'AVAILABLE' : 'NO_DATA'
  const compensationState: Availability =
    compensation.history.length > 1
      ? 'AVAILABLE'
      : compensation.history.length === 1
        ? 'PARTIAL'
        : 'NO_DATA'
  const networkState: Availability =
    network.edges.length > 0 ? 'AVAILABLE' : 'NO_DATA'
  const availability = {
    evaluation: evaluationState,
    clients: clientsState,
    compensation: compensationState,
    operations: 'AVAILABLE' as const,
    network: networkState,
  }
  const latestChange =
    compensation.currency === null
      ? null
      : [...compensation.changeEvents]
          .reverse()
          .find((change) => change.currency === compensation.currency) ?? null
  const signals = {
    performance: evaluation.overallScore,
    momentum: evaluation.momentumDelta,
    evaluatorConsensus: evaluation.consensus,
    clientFootprint:
      clientsState === 'NO_DATA' ? null : clientFootprint.assignments.length,
    currentCompensation:
      compensation.currency !== null && compensation.currentBasic !== null
        ? {
            amount: compensation.currentBasic,
            currency: compensation.currency,
          }
        : null,
    compensationChange: latestChange?.percentChange ?? null,
    workload: {
      openTasks: operations.openTasks,
      overdueTasks: operations.overdueTasks,
      recentCompletions: operations.recentCompletions,
    },
    dataCompleteness: summarizeAvailability(availability).completeness,
  }
  const timeline = buildTimeline({
    employeeId: params.employeeId,
    generatedAt: params.generatedAt,
    periods: params.periods,
    analytics: params.analytics,
    rows: params.rows,
    clientFootprint,
    compensation,
  })

  return employeeDossierSchema.parse({
    identity: {
      id: employee.id,
      name: employee.name,
      department: employee.department,
      position: employee.position,
      teamTag: employee.teamTag,
    },
    employment: {
      status: resolveEmploymentStatus(employee.payrollProfile?.isPayrollActive),
      joinedAt: employee.payrollProfile?.joiningDate?.toISOString() ?? null,
      exitedAt: employee.payrollProfile?.exitDate?.toISOString() ?? null,
    },
    availability,
    signals,
    evaluation,
    clientFootprint,
    compensation,
    operations,
    network,
    timeline,
  })
}

function asStructuredSelfResponse(answer: unknown): {
  questionId: string
  prompt: string
  response: string | null
  structured: StructuredEvidenceResponse
} | null {
  if (!answer || typeof answer !== 'object') return null
  const row = answer as {
    questionId?: unknown
    prompt?: unknown
    section?: unknown
    type?: unknown
    value?: unknown
  }
  if (typeof row.questionId !== 'string' || typeof row.prompt !== 'string') return null
  const section = typeof row.section === 'string' ? row.section : null

  if (row.type === 'TEXT' && typeof row.value === 'string') {
    return {
      questionId: row.questionId,
      prompt: row.prompt,
      response: row.value || null,
      structured: { type: 'TEXT', section, value: row.value },
    }
  }
  if (
    row.type === 'LIST' &&
    Array.isArray(row.value) &&
    row.value.every((item) => typeof item === 'string')
  ) {
    return {
      questionId: row.questionId,
      prompt: row.prompt,
      response: row.value.join('\n') || null,
      structured: { type: 'LIST', section, value: row.value },
    }
  }
  if (row.type === 'GOAL_TABLE' && Array.isArray(row.value)) {
    const goals = row.value.flatMap((value) => {
      if (!value || typeof value !== 'object') return []
      const goal = value as {
        goal?: unknown
        status?: unknown
        comments?: unknown
      }
      if (
        typeof goal.goal !== 'string' ||
        !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXCEEDED'].includes(
          String(goal.status)
        ) ||
        typeof goal.comments !== 'string'
      ) {
        return []
      }
      return [
        {
          goal: goal.goal,
          status: goal.status as
            | 'NOT_STARTED'
            | 'IN_PROGRESS'
            | 'COMPLETED'
            | 'EXCEEDED',
          comments: goal.comments,
        },
      ]
    })
    return {
      questionId: row.questionId,
      prompt: row.prompt,
      response:
        goals.map((goal) => `${goal.goal} — ${goal.status}`).join('\n') || null,
      structured: { type: 'GOAL_TABLE', section, value: goals },
    }
  }
  return null
}

export function assembleEvidencePayload(params: {
  generatedAt: Date
  period: ScorablePeriod
  rows: EvidenceRows
  domain: 'EVALUATION' | 'SELF_EVALUATION'
  lens: RelationshipType | null
  revealEvaluator: boolean
}): EvidencePayload {
  const assignmentLookup = buildAssignmentLookup(
    params.rows.assignments.map((assignment) => ({
      evaluatorId: assignment.evaluatorId,
      evaluateeId: assignment.evaluateeId,
      relationshipType: assignment.relationshipType as RelationshipType,
    }))
  )
  let items: EvidencePayload['items'] = []

  if (params.domain === 'EVALUATION') {
    items = params.rows.evaluationRows.flatMap((row) => {
      const lens = resolveEvaluationRelationshipTypeForRow({
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
      })
      if (!lens || (params.lens !== null && lens !== params.lens)) return []
      const question = row.question?.questionText ?? row.leadQuestion?.questionText
      if (!question) return []
      const response = row.textResponse?.trim() || null
      if (row.ratingValue === null && response === null) return []
      const canReveal = row.evaluatorId !== row.evaluateeId
      const isRevealed = canReveal && params.revealEvaluator
      return [
        {
          id: row.id,
          lens,
          question,
          response,
          structuredResponse: null,
          rating: row.ratingValue,
          evaluator: {
            raterKey: opaqueRaterKey({
              employeeId: row.evaluateeId,
              evaluatorId: row.evaluatorId,
              periodId: params.period.id,
            }),
            canReveal,
            isRevealed,
            name: isRevealed ? row.evaluator.name : null,
          },
          provenance: {
            source: 'EVALUATION' as const,
            recordId: row.id,
            submittedAt: (row.submittedAt ?? row.updatedAt).toISOString(),
            periodId: params.period.id,
            periodName: params.period.name,
          },
        },
      ]
    })
  } else if (
    params.rows.selfEvaluation?.status === 'SUBMITTED' &&
    params.rows.selfEvaluation.submittedAt
  ) {
    const rawAnswers = Array.isArray(params.rows.selfEvaluation.answers)
      ? params.rows.selfEvaluation.answers
      : []
    items = rawAnswers.flatMap((raw) => {
      const answer = asStructuredSelfResponse(raw)
      if (!answer) return []
      return [
        {
          id: `${params.rows.selfEvaluation!.id}:${answer.questionId}`,
          lens: 'SELF' as const,
          question: answer.prompt,
          response: answer.response,
          structuredResponse: answer.structured,
          rating: null,
          evaluator: {
            raterKey: opaqueRaterKey({
              employeeId: params.rows.employee.id,
              evaluatorId: params.rows.employee.id,
              periodId: params.period.id,
            }),
            canReveal: false,
            isRevealed: false,
            name: null,
          },
          provenance: {
            source: 'SELF_EVALUATION' as const,
            recordId: params.rows.selfEvaluation!.id,
            submittedAt: params.rows.selfEvaluation!.submittedAt!.toISOString(),
            periodId: params.period.id,
            periodName: params.period.name,
          },
        },
      ]
    })
  }

  items.sort(
    (a, b) =>
      LENS_ORDER.indexOf(a.lens) - LENS_ORDER.indexOf(b.lens) ||
      a.evaluator.raterKey.localeCompare(b.evaluator.raterKey) ||
      a.question.localeCompare(b.question)
  )

  return evidencePayloadSchema.parse({
    generatedAt: params.generatedAt.toISOString(),
    employeeId: params.rows.employee.id,
    period: toPeriodRef(params.period),
    domain: params.domain,
    lens: params.lens,
    items,
  })
}
