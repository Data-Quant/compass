'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import type { PersonAnalytics } from './types'
import { formatLongDay, formatMonthYear, plural } from './chart-theme'
import { ChartCard, MarkTip } from './ChartCard'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' })
const LEVELS = [0, 1, 2, 3, 4]

type Cell = PersonAnalytics['heatmap'][number]

const describe = (cell: Cell) => `${formatLongDay(cell.date)}: ${
  cell.owned + cell.helped === 0 ? 'no completed tasks' : `${cell.owned} owned, ${cell.helped} helped`
}`

export function ContributionHeatmap({ heatmap, firstName }: { heatmap: Cell[]; firstName: string }) {
  const weeks = Math.ceil(heatmap.length / 7)
  const [focusIndex, setFocusIndex] = useState(heatmap.length - 1)
  const [readout, setReadout] = useState<Cell | null>(null)
  const cellRefs = useRef<Array<HTMLDivElement | null>>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Open on the most recent weeks when the grid is wider than the card.
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollLeft = node.scrollWidth
  }, [heatmap])
  useEffect(() => { setFocusIndex(heatmap.length - 1) }, [heatmap])

  const months = Array.from({ length: weeks }, (_, week) => {
    const date = heatmap[week * 7]?.date
    const previous = week > 0 ? heatmap[(week - 1) * 7]?.date : undefined
    if (!date || (previous && previous.slice(0, 7) === date.slice(0, 7))) return ''
    // Skip a partial first month whose label would collide with the next one.
    if (week === 0 && heatmap[14]?.date.slice(0, 7) !== date.slice(0, 7)) return ''
    return MONTH.format(new Date(`${date}T00:00:00Z`))
  })

  const move = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const delta = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key]
    let next = delta === undefined ? index : index + delta
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = heatmap.length - 1
    if (next === index || next < 0 || next >= heatmap.length) return
    event.preventDefault()
    setFocusIndex(next)
    cellRefs.current[next]?.focus()
  }

  const title = `${firstName}'s completed tasks`
  const first = heatmap[0]
  const last = heatmap[heatmap.length - 1]

  return (
    <ChartCard
      id="heatmap"
      title={title}
      description={`Each square is a day. Shading is relative to ${firstName}'s own busiest days, so it can't be compared between people.`}
      aside={first && last && (
        <span className="text-xs text-muted-foreground">{formatMonthYear(first.date)} – {formatMonthYear(last.date)}</span>
      )}
    >
      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          <div aria-hidden="true" className="flex gap-[3px] text-[11px] text-muted-foreground">
            <span className="sticky left-0 z-10 w-[29px] shrink-0 bg-card shadow-[3px_0_0_hsl(var(--card))]" />
            {months.map((month, week) => (
              <span key={week} className="w-3 shrink-0 overflow-visible whitespace-nowrap">{month}</span>
            ))}
          </div>
          <div role="grid" aria-label={`${title}, last 12 months`} className="flex flex-col gap-[3px]" onMouseLeave={() => setReadout(null)}>
            {DAYS.map((day, dayIndex) => (
              <div role="row" key={day} className="flex items-center gap-[3px]">
                <span role="rowheader" aria-label={day} className="sticky left-0 z-10 w-[29px] shrink-0 bg-card shadow-[3px_0_0_hsl(var(--card))] text-[10px] leading-3 text-muted-foreground">
                  <span aria-hidden="true">{dayIndex % 2 === 0 && dayIndex < 6 ? day : ''}</span>
                </span>
                {Array.from({ length: weeks }, (_, week) => {
                  const index = week * 7 + dayIndex
                  const cell = heatmap[index]
                  if (!cell) return <span key={week} role="gridcell" aria-hidden="true" className="h-3 w-3 shrink-0" />
                  return (
                    <MarkTip key={week} title={formatLongDay(cell.date)} rows={[{ label: 'Owned', value: cell.owned }, { label: 'Helped', value: cell.helped }]}>
                      <div
                        ref={(node) => { cellRefs.current[index] = node }}
                        role="gridcell"
                        tabIndex={index === focusIndex ? 0 : -1}
                        aria-label={describe(cell)}
                        onKeyDown={(event) => move(event, index)}
                        onFocus={() => { setFocusIndex(index); setReadout(cell) }}
                        onMouseEnter={() => setReadout(cell)}
                        className={cn(
                          'h-3 w-3 shrink-0 rounded-[3px] border border-[rgba(127,127,127,0.14)] outline-none',
                          'hover:ring-1 hover:ring-foreground/60 focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                        style={{ background: `var(--viz-heat-${cell.level})` }}
                      />
                    </MarkTip>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="min-h-[18px] text-xs text-foreground">
          {readout ? describe(readout) : <span className="text-muted-foreground">Hover or focus a day to see what was completed. Use the arrow keys to move between days.</span>}
        </p>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          Fewer
          {LEVELS.map((level) => (
            <span key={level} aria-hidden="true" className="h-3 w-3 rounded-[3px] border border-[rgba(127,127,127,0.14)]" style={{ background: `var(--viz-heat-${level})` }} />
          ))}
          More
        </span>
      </div>
      <p className="sr-only">{`${plural(heatmap.filter((cell) => cell.owned + cell.helped > 0).length, 'day')} with completed tasks in the last 12 months.`}</p>
    </ChartCard>
  )
}
