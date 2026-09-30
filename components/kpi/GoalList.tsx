'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GoalView, KpiView } from '@/lib/kpi/view-types'
import { KpiTable, type KpiTableGoal } from './KpiTable'

interface GoalListProps {
  goals: GoalView[]
  editable: boolean
  emptyMessage: string
  onEditGoal?: (goal: GoalView) => void
  onArchiveGoal?: (goal: GoalView) => void
  onAddKpi?: (goal: GoalView) => void
  onEditKpi?: (goal: GoalView, kpi: KpiView) => void
  onDiscardKpi?: (kpi: KpiView) => void
  /** Reloads after a claim, reply, appeal or change request. Without it KPI rows are read-only. */
  onChanged?: () => Promise<void>
}

export const goalSubtitle = (goal: GoalView): string =>
  `${goal.scope === 'DEPARTMENT' ? `Department KPIs (${goal.departmentLabel ?? goal.departmentKey ?? ''})` : 'Team KPIs'} · Set by ${goal.setter.name}`

export function GoalList({ goals, editable, emptyMessage, onEditGoal, onArchiveGoal, onAddKpi, onEditKpi, onDiscardKpi, onChanged }: GoalListProps) {
  const byId = new Map(goals.map((goal) => [goal.id, goal]))
  const rows: KpiTableGoal[] = goals.map((goal) => ({
    id: goal.id,
    title: goal.title,
    description: goal.description,
    subtitle: goalSubtitle(goal),
    kpis: goal.kpis,
    actions: editable ? (
      <>
        <Button size="sm" variant="outline" onClick={() => onEditGoal?.(goal)}>Edit goal</Button>
        <Button size="sm" onClick={() => onAddKpi?.(goal)}>
          <Plus className="h-4 w-4" /> Add KPI
        </Button>
        {goal.kpis.length === 0 && <Button size="sm" variant="ghost" onClick={() => onArchiveGoal?.(goal)}>Remove goal</Button>}
      </>
    ) : undefined,
  }))
  return (
    <KpiTable
      goals={rows}
      emptyMessage={emptyMessage}
      onChanged={onChanged}
      draftActions={(row, kpi) => {
        const goal = byId.get(row.id)
        return editable && goal && kpi.status === 'DRAFT' ? (
          <>
            <Button size="sm" variant="outline" onClick={() => onEditKpi?.(goal, kpi)}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => onDiscardKpi?.(kpi)}>Discard</Button>
          </>
        ) : undefined
      }}
    />
  )
}
