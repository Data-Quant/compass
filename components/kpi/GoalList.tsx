'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { GoalView, KpiView } from '@/lib/kpi/view-types'
import { KpiRow } from './KpiRow'

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

export function GoalList({ goals, editable, emptyMessage, onEditGoal, onArchiveGoal, onAddKpi, onEditKpi, onDiscardKpi, onChanged }: GoalListProps) {
  if (goals.length === 0) return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  return (
    <div className="space-y-4">
      {goals.map((goal) => (
        <Card key={goal.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold">{goal.title}</h3>
                {goal.description && <p className="text-sm text-muted-foreground">{goal.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {goal.scope === 'DEPARTMENT' ? `Department KPIs (${goal.departmentLabel ?? goal.departmentKey ?? ''})` : 'Team KPIs'} · Set by {goal.setter.name}
                </p>
              </div>
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => onEditGoal?.(goal)}>Edit goal</Button>
                  <Button size="sm" onClick={() => onAddKpi?.(goal)}>
                    <Plus className="h-4 w-4" /> Add KPI
                  </Button>
                  {goal.kpis.length === 0 && (
                    <Button size="sm" variant="ghost" onClick={() => onArchiveGoal?.(goal)}>Remove goal</Button>
                  )}
                </div>
              )}
            </div>
            {goal.kpis.length === 0 ? (
              <p className="text-sm text-muted-foreground">No KPIs yet.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {goal.kpis.map((kpi) => (
                  <KpiRow
                    key={kpi.id}
                    kpi={kpi}
                    onChanged={onChanged}
                    draftActions={
                      editable && kpi.status === 'DRAFT' ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => onEditKpi?.(goal, kpi)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => onDiscardKpi?.(kpi)}>Discard</Button>
                        </>
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
