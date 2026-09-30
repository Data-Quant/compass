'use client'

import type { ReactNode } from 'react'
import type { KpiView } from '@/lib/kpi/view-types'
import { KpiRow } from './KpiRow'

export interface KpiTableGoal {
  id: string
  title: string
  /** e.g. "Team KPIs · Set by …" or the department. */
  subtitle?: string
  description?: string | null
  /** Goal buttons (edit, add KPI) for setters. */
  actions?: ReactNode
  kpis: KpiView[]
}

interface KpiTableProps {
  goals: KpiTableGoal[]
  emptyMessage: string
  draftActions?: (goal: KpiTableGoal, kpi: KpiView) => ReactNode
  onChanged?: () => Promise<void>
}

const HEADERS = ['Goal', 'KPI', 'Deadline', 'Notes', 'Completed', 'Verified', '']

function GoalCell({ goal, span }: { goal: KpiTableGoal; span: number }) {
  return (
    <td rowSpan={span} className="w-56 space-y-1 border-r p-3 align-top">
      <p className="font-semibold">{goal.title}</p>
      {goal.description && <p className="text-xs text-muted-foreground">{goal.description}</p>}
      {goal.subtitle && <p className="text-xs text-muted-foreground">{goal.subtitle}</p>}
      {goal.actions && <div className="flex flex-wrap gap-2 pt-1">{goal.actions}</div>}
    </td>
  )
}

/** The leads' sheet as one table: a goal spans its KPIs; a late completion is highlighted. */
export function KpiTable({ goals, emptyMessage, draftActions, onChanged }: KpiTableProps) {
  if (goals.length === 0) return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>{HEADERS.map((header, i) => <th key={i} className="p-3 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody>
          {goals.map((goal) =>
            goal.kpis.length === 0 ? (
              <tr key={goal.id} className="border-t align-top">
                <GoalCell goal={goal} span={1} />
                <td colSpan={HEADERS.length - 1} className="p-3 text-sm text-muted-foreground">No KPIs yet.</td>
              </tr>
            ) : (
              goal.kpis.map((kpi, index) => (
                <KpiRow
                  key={kpi.id}
                  kpi={kpi}
                  goalCell={index === 0 ? <GoalCell goal={goal} span={goal.kpis.length} /> : undefined}
                  draftActions={draftActions?.(goal, kpi)}
                  onChanged={onChanged}
                />
              ))
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
