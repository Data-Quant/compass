import type { CycleSummary } from './view-types'

const KARACHI_DATE_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const KARACHI_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric' })

export function formatKarachiDateTime(iso: string): string {
  return KARACHI_DATE_TIME.format(new Date(iso)).replace(',', '')
}

export function formatKarachiDate(iso: string): string {
  return KARACHI_DATE.format(new Date(iso))
}

export function weekLabel(cycle: CycleSummary): string {
  if (cycle.currentWeek < 1) return `Starts ${formatKarachiDate(cycle.weekOneStartsOn)}`
  const phase = cycle.currentWeek > cycle.questionWeeks ? ' · catch-up' : ''
  return `Week ${Math.min(cycle.currentWeek, cycle.totalWeeks)} of ${cycle.totalWeeks}${phase}`
}
