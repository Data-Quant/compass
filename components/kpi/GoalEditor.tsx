'use client'

// Setting KPIs happens in the table itself (Notion style): goals and draft KPIs are edited in their cells, an empty
// row under each goal adds a KPI and the last row adds a goal. Only deletions ask for confirmation.
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { GoalView, KpiView, PersonRef } from '@/lib/kpi/view-types'
import { goalSubtitle } from './GoalList'
import { InlineText } from './inline/InlineCells'
import { NewGoalRow, NewKpiRow, type NewKpiValues } from './inline/NewRows'
import { errorMessage, kpiRequest } from './kpi-api'
import type { KpiPatch } from './KpiRow'
import { HEADERS, KpiTable, type KpiTableGoal } from './KpiTable'

export interface GoalFormValues { title: string; description?: string }

interface GoalEditorProps {
  goals: GoalView[]
  editable: boolean
  ownerOptions: PersonRef[]
  defaultOwnerIds: string[]
  emptyMessage: string
  createGoal: (values: GoalFormValues) => Promise<void>
  onChanged: () => Promise<void>
}

export function GoalEditor({ goals, editable, ownerOptions, defaultOwnerIds, emptyMessage, createGoal, onChanged }: GoalEditorProps) {
  const [toDiscard, setToDiscard] = useState<KpiView | null>(null)
  const [toArchive, setToArchive] = useState<GoalView | null>(null)
  const byId = new Map(goals.map((goal) => [goal.id, goal]))

  /** Saves, reloads the table, and reports whether it worked so a cell can put its old value back. */
  async function run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
    try {
      await action()
      if (success) toast.success(success)
      await onChanged()
      return true
    } catch (error) {
      toast.error(errorMessage(error, 'Something went wrong'))
      return false
    }
  }

  const saveKpi = (kpi: KpiView, patch: KpiPatch) =>
    run(() => kpiRequest(`/api/kpi/kpis/${kpi.id}`, { method: 'PATCH', body: { action: 'edit', version: kpi.version, ...patch } }))
  const addKpi = (goal: GoalView, values: NewKpiValues) =>
    run(() => kpiRequest('/api/kpi/kpis', { method: 'POST', body: { goalId: goal.id, ...values } }), 'KPI added')
  const renameGoal = (goal: GoalView, title: string) =>
    run(() => kpiRequest(`/api/kpi/goals/${goal.id}`, { method: 'PATCH', body: { action: 'edit', title } }))

  function confirmDiscard() {
    const kpi = toDiscard
    setToDiscard(null)
    if (kpi) void run(() => kpiRequest(`/api/kpi/kpis/${kpi.id}`, { method: 'PATCH', body: { action: 'discard', version: kpi.version } }), 'KPI discarded')
  }

  function confirmArchive() {
    const goal = toArchive
    setToArchive(null)
    if (goal) void run(() => kpiRequest(`/api/kpi/goals/${goal.id}`, { method: 'PATCH', body: { action: 'archive' } }), 'Goal removed')
  }

  const rows: KpiTableGoal[] = goals.map((goal) => {
    const lastOwners = goal.kpis.at(-1)?.owners.map((o) => o.id)
    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      subtitle: goalSubtitle(goal),
      kpis: goal.kpis,
      ...(editable
        ? {
            titleEditor: <InlineText value={goal.title} label={`Goal ${goal.title}`} maxLength={200} className="font-semibold" onSave={(title) => renameGoal(goal, title)} />,
            actions: goal.kpis.length === 0 ? <Button size="sm" variant="ghost" onClick={() => setToArchive(goal)}>Remove goal</Button> : undefined,
            addRow: (goalCell: React.ReactNode | undefined) => (
              <NewKpiRow
                key={`${goal.id}-new`}
                goalTitle={goal.title}
                goalCell={goalCell}
                ownerOptions={ownerOptions}
                defaultOwnerIds={lastOwners ?? defaultOwnerIds}
                onAdd={(values) => addKpi(goal, values)}
              />
            ),
          }
        : {}),
    }
  })

  return (
    <div className="space-y-4">
      <KpiTable
        goals={rows}
        emptyMessage={emptyMessage}
        onChanged={onChanged}
        rowEdit={editable ? (row, kpi) => (byId.has(row.id) ? { ownerOptions, save: (patch) => saveKpi(kpi, patch) } : undefined) : undefined}
        draftActions={(_row, kpi) => (editable && kpi.status === 'DRAFT' ? <Button size="sm" variant="ghost" onClick={() => setToDiscard(kpi)}>Discard</Button> : undefined)}
        footer={editable ? <NewGoalRow columns={HEADERS.length} onAdd={(title) => run(() => createGoal({ title }), 'Goal added')} /> : undefined}
      />
      <ConfirmDialog
        isOpen={toDiscard !== null}
        onClose={() => setToDiscard(null)}
        onConfirm={confirmDiscard}
        title="Discard this KPI?"
        message="It will be removed from this month. The change is kept in the audit log."
        confirmText="Discard"
        variant="danger"
      />
      <ConfirmDialog
        isOpen={toArchive !== null}
        onClose={() => setToArchive(null)}
        onConfirm={confirmArchive}
        title="Remove this goal?"
        message="The goal has no KPIs and will be removed from this month."
        confirmText="Remove"
        variant="warning"
      />
    </div>
  )
}
