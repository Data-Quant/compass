import type { EmployeePeriodScore, PeriodScoreMatrix } from '@/lib/analytics/period-score-matrix'

/** Maximum entries per mover list, in each direction. */
export const MOVERS_LIMIT = 5

export interface TrendPoint {
  periodId: string
  periodName: string
  /** 0-100 scale. */
  avgScore: number
  employeeCount: number
}

export interface Mover {
  employeeId: string
  department: string | null
  currentScore: number
  previousScore: number
  /** Points on the 0-100 scale. Positive means improved. */
  delta: number
}

export interface NewJoiner {
  employeeId: string
  department: string | null
  currentScore: number
}

export interface DepartmentTrend {
  department: string
  points: TrendPoint[]
}

export interface TrendsResult {
  orgSeries: TrendPoint[]
  departmentSeries: DepartmentTrend[]
  topImprovers: Mover[]
  topDecliners: Mover[]
  newJoiners: NewJoiner[]
  insufficientData: boolean
}

const UNKNOWN_DEPARTMENT = 'Unknown'

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function toTrendPoint(
  matrix: PeriodScoreMatrix,
  scores: readonly EmployeePeriodScore[]
): TrendPoint {
  return {
    periodId: matrix.periodId,
    periodName: matrix.periodName,
    avgScore: mean(scores.map((entry) => entry.overallScore)),
    employeeCount: scores.length,
  }
}

/**
 * Org/department score series across periods, plus movers between the current
 * and comparison period.
 *
 * `matrices` must already be ordered oldest-first. Movers require a score in
 * both periods; employees present only in the current period are new joiners and
 * are never ranked.
 */
export function computeTrends(params: {
  matrices: readonly PeriodScoreMatrix[]
  currentPeriodId: string
  comparisonPeriodId: string | null
}): TrendsResult {
  const orgSeries = params.matrices.map((matrix) => toTrendPoint(matrix, matrix.scores))

  const departments = [
    ...new Set(
      params.matrices.flatMap((matrix) =>
        matrix.scores.map((entry) => entry.department || UNKNOWN_DEPARTMENT)
      )
    ),
  ].sort((a, b) => a.localeCompare(b))

  const departmentSeries: DepartmentTrend[] = departments.map((department) => ({
    department,
    points: params.matrices
      .map((matrix) => {
        const scores = matrix.scores.filter(
          (entry) => (entry.department || UNKNOWN_DEPARTMENT) === department
        )
        return scores.length > 0 ? toTrendPoint(matrix, scores) : null
      })
      .filter((point): point is TrendPoint => point !== null),
  }))

  const current = params.matrices.find((matrix) => matrix.periodId === params.currentPeriodId)
  const comparison = params.comparisonPeriodId
    ? params.matrices.find((matrix) => matrix.periodId === params.comparisonPeriodId)
    : undefined

  if (!current || !comparison) {
    return {
      orgSeries,
      departmentSeries,
      topImprovers: [],
      topDecliners: [],
      newJoiners: [],
      insufficientData: true,
    }
  }

  const previousById = new Map(comparison.scores.map((entry) => [entry.employeeId, entry]))
  const movers: Mover[] = []
  const newJoiners: NewJoiner[] = []

  for (const entry of current.scores) {
    const previous = previousById.get(entry.employeeId)
    if (!previous) {
      newJoiners.push({
        employeeId: entry.employeeId,
        department: entry.department,
        currentScore: entry.overallScore,
      })
      continue
    }
    movers.push({
      employeeId: entry.employeeId,
      department: entry.department,
      currentScore: entry.overallScore,
      previousScore: previous.overallScore,
      delta: entry.overallScore - previous.overallScore,
    })
  }

  const topImprovers = [...movers]
    .filter((mover) => mover.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, MOVERS_LIMIT)
  const topDecliners = [...movers]
    .filter((mover) => mover.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, MOVERS_LIMIT)

  return {
    orgSeries,
    departmentSeries,
    topImprovers,
    topDecliners,
    newJoiners,
    insufficientData: false,
  }
}
