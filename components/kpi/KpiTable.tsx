'use client'

import { Fragment, type ReactNode } from 'react'
import type { KpiView } from '@/lib/kpi/view-types'
import { KpiRow, type KpiRowEdit } from './KpiRow'

export interface KpiTableGoal {
  id: string
  title: string
  /** e.g. "Team KPIs · Set by …" or the department. */
  subtitle?: string
  description?: string | null
  /** Goal buttons (edit, add KPI) for setters. */
  actions?: ReactNode
  /** Replaces the plain title when the goal can be edited in place. */
  titleEditor?: ReactNode
  /** The empty row for adding a KPI; it receives the goal cell when it is the goal's only row. */
  addRow?: (goalCell: ReactNode | undefined) => ReactNode
  kpis: KpiView[]
}

interface KpiTableProps {
  goals: KpiTableGoal[]
  emptyMessage: string
  draftActions?: (goal: KpiTableGoal, kpi: KpiView) => ReactNode
  onChanged?: () => Promise<void>
  rowEdit?: (goal: KpiTableGoal, kpi: KpiView) => KpiRowEdit | undefined
  /** A last row, such as the new-goal row. */
  footer?: ReactNode
}

export const HEADERS = ['Goal', 'KPI', 'Deadline', 'Notes', 'Completed', 'Verified', '']

function GoalCell({ goal, span }: { goal: KpiTableGoal; span: number }) {
  return (
    <td rowSpan={span} className="w-56 space-y-1 border-r p-3 align-top">
      {goal.titleEditor ?? <h3 className="font-semibold">{goal.title}</h3>}
      {goal.description && <p className="text-xs text-muted-foreground">{goal.description}</p>}
      {goal.subtitle && <p className="text-xs text-muted-foreground">{goal.subtitle}</p>}
      {goal.actions && <div className="flex flex-wrap gap-2 pt-1">{goal.actions}</div>}
    </td>
  )
}

/** The leads' sheet as one table: a goal spans its KPIs; a late completion is highlighted. */
export function KpiTable({ goals, emptyMessage, draftActions, onChanged, rowEdit, footer }: KpiTableProps) {
  if (goals.length === 0 && !footer) return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>{HEADERS.map((header, i) => <th key={i} className="p-3 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody>
          {goals.length === 0 && (
            <tr><td colSpan={HEADERS.length} className="p-3 text-sm text-muted-foreground">{emptyMessage}</td></tr>
          )}
          {goals.map((goal) => {
            const span = goal.kpis.length + (goal.addRow ? 1 : 0)
            if (goal.kpis.length === 0) {
              const cell = <GoalCell goal={goal} span={Math.max(1, span)} />
              return goal.addRow ? (
                <Fragment key={goal.id}>{goal.addRow(cell)}</Fragment>
              ) : (
                <tr key={goal.id} className="border-t align-top">
                  {cell}
                  <td colSpan={HEADERS.length - 1} className="p-3 text-sm text-muted-foreground">No KPIs yet.</td>
                </tr>
              )
            }
            return (
              <Fragment key={goal.id}>
                {goal.kpis.map((kpi, index) => (
                  <KpiRow
                    key={kpi.id}
                    kpi={kpi}
                    goalCell={index === 0 ? <GoalCell goal={goal} span={span} /> : undefined}
                    draftActions={draftActions?.(goal, kpi)}
                    onChanged={onChanged}
                    edit={rowEdit?.(goal, kpi)}
                  />
                ))}
                {goal.addRow?.(undefined)}
              </Fragment>
            )
          })}
          {footer}
        </tbody>
      </table>
    </div>
  )
}
