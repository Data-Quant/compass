import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { computePeriodScoreMatrix } from '@/lib/analytics/period-score-matrix'
import { computeTalentGrid } from '@/lib/analytics/talent-grid'
import { computeBlindSpots } from '@/lib/analytics/blind-spots'
import { deriveOutlook, type CompPoint } from '@/lib/analytics/employee-360'
import { computeCalibration } from '@/lib/analytics/calibration'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import type { RelationshipType } from '@/types'

/**
 * Everything Employee 360 shows about one person.
 *
 * HR only, matching the rest of analytics -- this returns compensation, so the
 * audience is exactly the people who can already open payroll.
 *
 * Scores come from the same matrix the other analytics tabs use rather than a
 * parallel calculation, so 360 cannot quietly disagree with the talent grid or
 * the calibration view about the same person.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId is required' }, { status: 400 })
    }

    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, department: true, position: true, teamTag: true },
    })
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    // Newest first, so index 0 is the current period and the rest is history.
    const periods = await prisma.evaluationPeriod.findMany({
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true, startDate: true, isActive: true },
      take: 8,
    })

    const matrices = (
      await Promise.all(periods.map((period) => computePeriodScoreMatrix(period.id)))
    ).filter((matrix): matrix is NonNullable<typeof matrix> => matrix !== null)

    const current = matrices[0] ?? null
    const previous = matrices[1] ?? null

    const currentScore = current?.scores.find((score) => score.employeeId === employeeId) ?? null

    const perLens: Partial<Record<RelationshipType, number>> = {}
    if (currentScore) {
      for (const [lens, lensScore] of Object.entries(currentScore.perLens)) {
        if (lensScore) perLens[lens as RelationshipType] = lensScore.normalizedScore
      }
    }

    const grid = current
      ? computeTalentGrid({ current, comparison: previous })
      : { entries: [], insufficientData: true }
    const gridEntry = grid.entries.find((entry) => entry.employeeId === employeeId) ?? null

    // Reused so a lens score reads as a deviation from typical, not a bare figure.
    const orgPerLensAverage = current ? computeBlindSpots(current).orgPerLensAverage : {}

    // Oldest first for the trajectory chart.
    const history = matrices
      .map((matrix, index) => {
        const score = matrix.scores.find((entry) => entry.employeeId === employeeId)
        return score
          ? { periodId: matrix.periodId, periodName: matrix.periodName, score: score.overallScore }
          : null
      })
      .filter((point): point is NonNullable<typeof point> => point !== null)
      .reverse()

    const clientAssignments = await prisma.clientAssignment.findMany({
      where: { userId: employeeId, client: { status: 'ACTIVE' } },
      include: { client: { select: { id: true, name: true } } },
    })

    const clients = clientAssignments
      .map((assignment) => ({
        id: assignment.client.id,
        name: assignment.client.name,
        role: assignment.role,
      }))
      .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'MANAGER' ? -1 : 1))

    // Compensation comes from run payroll rather than PayrollSalaryRevision: that
    // table is empty for every one of the 85 profiles, so sourcing from it would
    // have shown an empty panel for the whole company.
    //
    // Basic salary rather than net or total earnings: it is the contractual figure
    // and moves only on an actual raise, where the others swing month to month
    // with bonuses, reimbursements and deductions.
    //
    // DRAFT periods are excluded so an unfinalised run is never displayed as pay.
    const receipts = await prisma.payrollReceipt.findMany({
      where: { userId: employeeId, period: { status: { not: 'DRAFT' } } },
      select: { receiptJson: true, period: { select: { periodStart: true } } },
      orderBy: { period: { periodStart: 'asc' } },
    })

    const comp: CompPoint[] = receipts
      .map((receipt) => {
        const earnings = (receipt.receiptJson as { earnings?: Record<string, number> })?.earnings
        const basic = Number(earnings?.basicSalary ?? 0)
        return basic > 0
          ? { effectiveFrom: receipt.period.periodStart.toISOString(), total: basic }
          : null
      })
      .filter((point): point is CompPoint => point !== null)

    /* ---- Who rated them, and how that rater rates generally ----
     * A 2.4 from someone who runs 0.5 below everyone else is a different fact
     * from a 2.4 from a generous rater. Without the rater's own calibration
     * beside the score, a low mark cannot be told apart from a harsh marker. */
    const periodId = periods[0]?.id ?? null
    let evaluators: Array<{
      id: string
      name: string
      relationshipType: string
      meanGiven: number
      raterDeviation: number | null
      raterIsProvisional: boolean
    }> = []

    if (periodId) {
      const [allRatings, assignments] = await Promise.all([
        prisma.evaluation.findMany({
          where: { periodId, submittedAt: { not: null }, ratingValue: { not: null } },
          select: { evaluatorId: true, evaluateeId: true, ratingValue: true },
        }),
        getResolvedEvaluationAssignments(periodId),
      ])

      const lensByPair = new Map(
        assignments.map((a) => [`${a.evaluatorId}:${a.evaluateeId}`, a.relationshipType as string])
      )

      const calibration = computeCalibration({
        ratings: allRatings.map((row) => ({
          evaluatorId: row.evaluatorId,
          ratingValue: row.ratingValue as number,
          relationshipType: lensByPair.get(`${row.evaluatorId}:${row.evaluateeId}`),
        })),
        capUsage: [],
        exemptEvaluatorIds: new Set(),
      })
      const calByEvaluator = new Map(calibration.allEvaluators.map((e) => [e.evaluatorId, e]))

      const mine = allRatings.filter((row) => row.evaluateeId === employeeId)
      const grouped = new Map<string, number[]>()
      for (const row of mine) {
        grouped.set(row.evaluatorId, [...(grouped.get(row.evaluatorId) ?? []), row.ratingValue as number])
      }

      const raterNames = await prisma.user.findMany({
        where: { id: { in: [...grouped.keys()] } },
        select: { id: true, name: true },
      })
      const nameById = new Map(raterNames.map((u) => [u.id, u.name]))

      evaluators = [...grouped.entries()]
        .map(([evaluatorId, values]) => {
          const cal = calByEvaluator.get(evaluatorId)
          return {
            id: evaluatorId,
            name: nameById.get(evaluatorId) ?? 'Unknown',
            relationshipType: lensByPair.get(`${evaluatorId}:${employeeId}`) ?? 'UNKNOWN',
            meanGiven: values.reduce((sum, v) => sum + v, 0) / values.length,
            raterDeviation: cal?.deviation ?? null,
            raterIsProvisional: cal?.isProvisional ?? true,
          }
        })
        .sort((a, b) => a.meanGiven - b.meanGiven)
    }

    /* ---- Network: reporting line and the people they share clients with ---- */
    const [leadRows, reportRows] = await Promise.all([
      prisma.evaluatorMapping.findMany({
        where: { evaluateeId: employeeId, relationshipType: 'TEAM_LEAD' },
        select: { evaluator: { select: { id: true, name: true, position: true } } },
      }),
      prisma.evaluatorMapping.findMany({
        where: { evaluatorId: employeeId, relationshipType: 'TEAM_LEAD' },
        select: { evaluatee: { select: { id: true, name: true, position: true } } },
      }),
    ])

    const clientIds = clientAssignments.map((a) => a.clientId)
    const colleagueRows = clientIds.length
      ? await prisma.clientAssignment.findMany({
          where: { clientId: { in: clientIds }, userId: { not: employeeId } },
          include: { user: { select: { id: true, name: true } }, client: { select: { name: true } } },
        })
      : []

    const colleagueMap = new Map<string, { id: string; name: string; clients: string[] }>()
    for (const row of colleagueRows) {
      const existing = colleagueMap.get(row.user.id)
      if (existing) existing.clients.push(row.client.name)
      else colleagueMap.set(row.user.id, { id: row.user.id, name: row.user.name, clients: [row.client.name] })
    }

    /* ---- Standing relative to the company and to their own department ---- */
    const scored = current?.scores.filter((s) => s.overallScore > 0) ?? []
    const rankAmong = (pool: typeof scored) => {
      if (!currentScore || pool.length < 2) return null
      const below = pool.filter((s) => s.overallScore < currentScore.overallScore).length
      return Math.round((below / (pool.length - 1)) * 100)
    }

    const standing = {
      companyPercentile: rankAmong(scored),
      departmentPercentile: rankAmong(
        scored.filter((s) => (s.department ?? null) === (employee.department ?? null))
      ),
      companySize: scored.length,
    }

    /* ---- Workload and time away ---- */
    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))
    const [openTasks, doneTasks, leaveRequests, assetCount] = await Promise.all([
      prisma.task.count({ where: { assigneeId: employeeId, status: { not: 'DONE' } } }),
      prisma.task.count({ where: { assigneeId: employeeId, status: 'DONE' } }),
      prisma.leaveRequest.findMany({
        where: { employeeId, status: 'APPROVED', startDate: { gte: yearStart } },
        select: { startDate: true, endDate: true, leaveType: true, isHalfDay: true },
      }),
      prisma.equipmentAssignment.count({ where: { employeeId, unassignedAt: null } }),
    ])

    const leaveDays = leaveRequests.reduce((sum, request) => {
      const days =
        Math.round(
          (new Date(request.endDate).getTime() - new Date(request.startDate).getTime()) / 86400000
        ) + 1
      return sum + (request.isHalfDay ? 0.5 : Math.max(days, 1))
    }, 0)

    const outlook = deriveOutlook({
      cellLabel: gridEntry?.cellLabel ?? null,
      momentumDelta: gridEntry?.momentumDelta ?? null,
      consensus: gridEntry?.consensus ?? null,
      isNew: gridEntry?.isNew ?? true,
    })

    return NextResponse.json({
      employee,
      period: periods[0] ? { id: periods[0].id, name: periods[0].name } : null,
      performance: {
        overallScore: currentScore?.overallScore ?? null,
        perLens,
        orgPerLensAverage,
        band: gridEntry?.performanceBand ?? null,
        momentumDelta: gridEntry?.momentumDelta ?? null,
        momentumBand: gridEntry?.momentumBand ?? null,
        consensus: gridEntry?.consensus ?? null,
      },
      history,
      clients,
      comp,
      outlook,
      evaluators,
      network: {
        leads: leadRows.map((row) => row.evaluator),
        reports: reportRows.map((row) => row.evaluatee),
        colleagues: [...colleagueMap.values()].sort((a, b) => b.clients.length - a.clients.length),
      },
      standing,
      activity: {
        openTasks,
        doneTasks,
        leaveDays,
        leaveRequests: leaveRequests.length,
        assets: assetCount,
      },
    })
  } catch (error) {
    console.error('Failed to build employee 360:', error)
    return NextResponse.json({ error: 'Failed to build employee 360' }, { status: 500 })
  }
}
