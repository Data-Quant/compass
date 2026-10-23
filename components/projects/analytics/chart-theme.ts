// Shared chart chrome. Colours read CSS tokens so light and dark both follow the theme.
export const AXIS_TICK = { fill: 'hsl(var(--muted-foreground))', fontSize: 12 }
export const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
}
export const GRID_STROKE = 'hsl(var(--border))'
export const SURFACE = 'hsl(var(--card))'

// Validated with the dataviz palette validator against #ffffff and #121212:
// every adjacent pair clears CVD and normal-vision floors in both modes.
export const CATEGORICAL = ['#6366f1', '#0d9488', '#d97706', '#db2777', '#0284c7', '#65a30d'] as const
export const NEUTRAL = 'var(--viz-neutral)'
export const categoricalColor = (index: number) => CATEGORICAL[index] ?? NEUTRAL

/**
 * Mode-specific steps live in CSS variables on the analytics root, so marks
 * written against var(--viz-*) switch with the theme.
 * - priority: ordinal indigo ramp, more urgent = further from the surface.
 * - aging: ordinal rose ramp, later = further from the surface.
 * - heat: sequential indigo, level 0 recedes into the surface.
 * - open work: rose / amber / indigo (validated as a set), plus neutral for no date.
 */
export const VIZ_VARS = [
  '[--viz-neutral:#a3a3a3] dark:[--viz-neutral:#737373]',
  '[--viz-track:hsl(var(--muted))]',
  '[--viz-priority-0:#312e81] [--viz-priority-1:#4338ca] [--viz-priority-2:#6366f1] [--viz-priority-3:#818cf8]',
  'dark:[--viz-priority-0:#c7d2fe] dark:[--viz-priority-1:#818cf8] dark:[--viz-priority-2:#6366f1] dark:[--viz-priority-3:#4f46e5]',
  '[--viz-age-0:#fb7185] [--viz-age-1:#f43f5e] [--viz-age-2:#be123c] [--viz-age-3:#881337] [--viz-age-4:#4c0519]',
  'dark:[--viz-age-0:#9f1239] dark:[--viz-age-1:#e11d48] dark:[--viz-age-2:#fb7185] dark:[--viz-age-3:#fda4af] dark:[--viz-age-4:#ffe4e6]',
  '[--viz-heat-0:#ececf1] [--viz-heat-1:#c7d2fe] [--viz-heat-2:#a5b4fc] [--viz-heat-3:#6366f1] [--viz-heat-4:#3730a3]',
  'dark:[--viz-heat-0:#1f1f23] dark:[--viz-heat-1:#312e81] dark:[--viz-heat-2:#4338ca] dark:[--viz-heat-3:#6366f1] dark:[--viz-heat-4:#a5b4fc]',
  '[--viz-overdue:#e11d48] [--viz-soon:#d97706] [--viz-later:#6366f1]',
].join(' ')

export const PRIORITY_COLOR: Record<string, string> = {
  URGENT: 'var(--viz-priority-0)',
  HIGH: 'var(--viz-priority-1)',
  MEDIUM: 'var(--viz-priority-2)',
  LOW: 'var(--viz-priority-3)',
}
export const PRIORITY_LABEL: Record<string, string> = { URGENT: 'Urgent', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }

export const OPEN_WORK = [
  { key: 'overdue', label: 'Overdue', color: 'var(--viz-overdue)' },
  { key: 'dueSoon', label: 'Due in 7 days', color: 'var(--viz-soon)' },
  { key: 'later', label: 'Due later', color: 'var(--viz-later)' },
  { key: 'noDate', label: 'No due date', color: 'var(--viz-neutral)' },
] as const

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const LONG_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' })
/** `YYYY-MM-DD` to "22 Oct". */
export const formatDay = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`))
/** `YYYY-MM-DD` to "Thu, 22 Oct 2026". */
export const formatLongDay = (iso: string) => LONG_DAY.format(new Date(`${iso}T00:00:00Z`))
export const formatMonthYear = (iso: string) => MONTH_YEAR.format(new Date(`${iso}T00:00:00Z`))
