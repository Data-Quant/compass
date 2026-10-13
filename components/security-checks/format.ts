// Display helpers. Dates are shown in Asia/Karachi, matching how deadlines are set.
const DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric' })
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Karachi',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export const formatDate = (iso: string | null | undefined): string => (iso ? DATE.format(new Date(iso)) : '—')
export const formatDateTime = (iso: string | null | undefined): string => (iso ? DATE_TIME.format(new Date(iso)) : '—')

export function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / (24 * 60 * 60 * 1000))
}

export function dueLabel(iso: string, now: number = Date.now()): string {
  const days = daysUntil(iso, now)
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`
  if (days === 0) return 'Due today'
  return `Due in ${days} day${days === 1 ? '' : 's'}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const formatPct = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : `${value}%`)
