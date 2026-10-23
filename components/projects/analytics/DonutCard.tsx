'use client'

import { useState } from 'react'
import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import { cn } from '@/lib/utils'
import { SURFACE } from './chart-theme'
import { ChartCard, ChartEmpty, LegendKey, SrTable, TipCard } from './ChartCard'

export type DonutSegment = { key: string; label: string; count: number; color: string }

interface DonutCardProps {
  id: string
  title: string
  description: string
  centerLabel: string
  segments: DonutSegment[]
  empty: { title: string; description: string }
}

const pct = (count: number, total: number) => `${Math.round((count / total) * 100)}%`

export function DonutCard({ id, title, description, centerLabel, segments, empty }: DonutCardProps) {
  const [active, setActive] = useState<string | null>(null)
  const total = segments.reduce((sum, segment) => sum + segment.count, 0)
  const drawn = segments.filter((segment) => segment.count > 0)

  return (
    <ChartCard id={id} title={title} description={description}>
      {total === 0 ? (
        <ChartEmpty className="h-[160px]" title={empty.title} description={empty.description} />
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative mx-auto h-[160px] w-[160px] shrink-0 sm:mx-0">
            <PieChart width={160} height={160} accessibilityLayer={false}>
              <Pie
                data={drawn}
                dataKey="count"
                nameKey="label"
                innerRadius={52}
                outerRadius={76}
                startAngle={90}
                endAngle={-270}
                stroke={SURFACE}
                strokeWidth={2}
                isAnimationActive={false}
                onMouseEnter={(_, index) => setActive(drawn[index]?.key ?? null)}
                onMouseLeave={() => setActive(null)}
              >
                {drawn.map((segment) => (
                  <Cell key={segment.key} fill={segment.color} opacity={active === null || active === segment.key ? 1 : 0.3} />
                ))}
              </Pie>
              <Tooltip
                isAnimationActive={false}
                wrapperStyle={{ zIndex: 10 }}
                content={({ active: shown, payload }) => {
                  const segment = payload?.[0]?.payload as DonutSegment | undefined
                  if (!shown || !segment) return null
                  return <TipCard title={segment.label} rows={[{ label: `of ${total}`, value: `${segment.count} (${pct(segment.count, total)})`, color: segment.color, kind: 'rect' }]} />
                }}
              />
            </PieChart>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[26px] font-semibold leading-none text-foreground">{total}</span>
              <span className="mt-1 text-[11px] text-muted-foreground">{centerLabel}</span>
            </div>
          </div>
          <ul className="flex min-w-[180px] flex-1 flex-col gap-0.5" onMouseLeave={() => setActive(null)}>
            {segments.map((segment) => (
              <li
                key={segment.key}
                tabIndex={0}
                aria-label={`${segment.label}: ${segment.count} of ${total}`}
                onMouseEnter={() => setActive(segment.key)}
                onFocus={() => setActive(segment.key)}
                onBlur={() => setActive(null)}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active === segment.key && 'bg-muted',
                )}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <LegendKey color={segment.color} />
                  <span className="truncate text-foreground">{segment.label}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold text-foreground">{segment.count}</span>{' '}
                  <span className="text-muted-foreground">{pct(segment.count, total)}</span>
                </span>
              </li>
            ))}
          </ul>
          <SrTable caption={title} headers={['Group', 'Tasks', 'Share']} rows={segments.map((segment) => [segment.label, segment.count, pct(segment.count, total)])} />
        </div>
      )}
    </ChartCard>
  )
}
