import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { computePeriodScoreMatrix } from '@/lib/analytics/period-score-matrix'
import { computeTalentGrid } from '@/lib/analytics/talent-grid'
import { computeBlindSpots } from '@/lib/analytics/blind-spots'
import { deriveOutlook, type CompPoint } from '@/lib/analytics/employee-360'
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
    })
  } catch (error) {
    console.error('Failed to build employee 360:', error)
    return NextResponse.json({ error: 'Failed to build employee 360' }, { status: 500 })
  }
}
