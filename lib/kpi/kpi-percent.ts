import { formatMonthKey, monthKeyOf } from './calendar'
import { isFinalStatus } from './state-machine'
import type { KpiStatusValue, MonthPercent, PercentView } from './view-types'

export interface PercentKpi { monthKey: string; status: KpiStatusValue; assigneeIds: readonly string[] }

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** Verified ÷ counted across the given months (D18/D19). Statuses must be effective. */
export function computeKpiPercent(
  personId: string,
  monthKeys: readonly string[],
  kpis: readonly PercentKpi[],
  exitDate: Date | null,
): PercentView {
  const exitMonth = exitDate ? formatMonthKey(monthKeyOf(exitDate)) : null
  const months: MonthPercent[] = monthKeys.map((monthKey) => {
    const excluded = exitMonth !== null && monthKey >= exitMonth
    const own = excluded
      ? []
      : kpis.filter((kpi) => kpi.monthKey === monthKey && kpi.status !== 'CANCELLED' && kpi.assigneeIds.includes(personId))
    return {
      monthKey,
      counted: own.length,
      verified: own.filter((kpi) => kpi.status === 'VERIFIED').length,
      pending: own.filter((kpi) => !isFinalStatus(kpi.status)).length,
    }
  })
  const counted = sum(months.map((month) => month.counted))
  const verified = sum(months.map((month) => month.verified))
  return {
    counted,
    verified,
    percent: counted === 0 ? null : (verified / counted) * 100,
    provisional: months.some((month) => month.pending > 0),
    months,
  }
}
