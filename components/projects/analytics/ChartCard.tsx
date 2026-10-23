'use client'

import type { ReactNode } from 'react'
import { BarChart3 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ChartCardProps {
  id: string
  title: ReactNode
  description?: ReactNode
  /** Legend or headline figure, top right. */
  aside?: ReactNode
  children: ReactNode
  className?: string
}

export function ChartCard({ id, title, description, aside, children, className }: ChartCardProps) {
  return (
    <Card role="region" aria-labelledby={`${id}-title`} className={cn('min-w-0 p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-2xl">
          <h2 id={`${id}-title`} className="text-[15px] font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  )
}

export function ChartEmpty({ title, description, className }: { title: string; description?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border px-4 py-8 text-center', className)}>
      <BarChart3 aria-hidden="true" className="mb-1 h-5 w-5 text-muted-foreground/70" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted-foreground">{description}</p>}
    </div>
  )
}

type Key = 'line' | 'dash' | 'rect'

export function LegendKey({ color, kind = 'rect' }: { color: string; kind?: Key }) {
  if (kind === 'rect') return <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
  return (
    <span
      aria-hidden="true"
      className="h-0 w-3.5 shrink-0 border-t-2"
      style={{ borderColor: color, borderTopStyle: kind === 'dash' ? 'dashed' : 'solid' }}
    />
  )
}

export function Legend({ items }: { items: Array<{ label: string; color: string; kind?: Key }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <LegendKey color={item.color} kind={item.kind} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export type TipRow = { label: string; value: ReactNode; color?: string; kind?: Key }

/** Tooltip body: value leads, series name follows, keyed with a short line. */
export function TipCard({ title, rows }: { title: ReactNode; rows: TipRow[] }) {
  return (
    <div className="min-w-[160px] rounded-lg border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg">
      <p className="mb-1.5 font-medium">{title}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              {row.color && <LegendKey color={row.color} kind={row.kind ?? 'line'} />}
              {row.label}
            </span>
            <span className="font-semibold tabular-nums text-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Hover and keyboard-focus tooltip for HTML marks (bars, rows). */
export function MarkTip({ children, title, rows }: { children: ReactNode; title: ReactNode; rows: TipRow[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="border-0 bg-transparent p-0 shadow-none">
        <TipCard title={title} rows={rows} />
      </TooltipContent>
    </Tooltip>
  )
}

/** The text alternative every chart carries: a table for screen readers. */
export function SrTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}
