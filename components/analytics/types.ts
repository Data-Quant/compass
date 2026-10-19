import type { TrendsResult } from '@/lib/analytics/trends'
import type { TalentGridResult } from '@/lib/analytics/talent-grid'
import type { BlindSpotsResult } from '@/lib/analytics/blind-spots'
import type { CalibrationResult } from '@/lib/analytics/calibration'

export interface Analytics {
  period: { id: string; name: string; startDate: string; endDate: string }
  summary: {
    totalTeamMembers: number
    /** Null for quarters that did not run on weekly evaluations. */
    employeesComplete: number | null
    totalEvaluations: number
    totalReports: number
    avgOverallScore: number
    completionRate: number | null
  }
  departmentData: Array<{
    name: string
    employees: number
    completed: number
    completionRate: number | null
    avgScore: number
  }>
  scoreDistribution: Array<{ range: string; count: number }>
  relationshipData: Array<{ type: string; count: number }>
  topPerformers: Array<{ name: string; department: string | null; score: number }>
  bottomPerformers: Array<{ name: string; department: string | null; score: number }>
}

export interface PeriodRef {
  id: string
  name: string
}

export interface InsightsPayload {
  currentPeriod: PeriodRef
  comparisonPeriod: PeriodRef | null
  periods: PeriodRef[]
  trends: TrendsResult
  talentGrid: TalentGridResult
  blindSpots: BlindSpotsResult
  calibration: CalibrationResult
}

/** Maps an employeeId to a display name, resolved client-side from the directory. */
export type NameResolver = (employeeId: string) => string
