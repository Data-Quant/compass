'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { GoalView, KpiView, PersonRef } from '@/lib/kpi/view-types'
import { GoalFormDialog, type GoalFormValues } from './GoalFormDialog'
import { GoalList } from './GoalList'
import { KpiFormDialog, type KpiFormValues } from './KpiFormDialog'
import { errorMessage, kpiRequest } from './kpi-api'

interface GoalEditorProps {
  goals: GoalView[]
  editable: boolean
  ownerOptions: PersonRef[]
  defaultOwnerIds: string[]
  emptyMessage: string
  createGoal: (values: GoalFormValues) => Promise<void>
  onChanged: () => Promise<void>
}

type GoalDialog = { goal: GoalView | null } | null
type KpiDialog = { goal: GoalView; kpi: KpiView | null } | null

export function GoalEditor({ goals, editable, ownerOptions, defaultOwnerIds, emptyMessage, createGoal, onChanged }: GoalEditorProps) {
  const [goalDialog, setGoalDialog] = useState<GoalDialog>(null)
  const [kpiDialog, setKpiDialog] = useState<KpiDialog>(null)
  const [toDiscard, setToDiscard] = useState<KpiView | null>(null)
  const [toArchive, setToArchive] = useState<GoalView | null>(null)

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    try {
      await action()
      toast.success(success)
      await onChanged()
      return true
    } catch (error) {
      toast.error(errorMessage(error, 'Something went wrong'))
      return false
    }
  }

  async function saveGoal(values: GoalFormValues) {
    const goal = goalDialog?.goal ?? null
    const saved = await run(
      () =>
        goal
          ? kpiRequest(`/api/kpi/goals/${goal.id}`, { method: 'PATCH', body: { action: 'edit', title: values.title, description: values.description || null } })
          : createGoal(values),
      goal ? 'Goal updated' : 'Goal added',
    )
    if (saved) setGoalDialog(null)
  }

  async function saveKpi(values: KpiFormValues) {
    if (!kpiDialog) return
    const { goal, kpi } = kpiDialog
    const saved = await run(
      () =>
        kpi
          ? kpiRequest(`/api/kpi/kpis/${kpi.id}`, { method: 'PATCH', body: { action: 'edit', version: kpi.version, ...values } })
          : kpiRequest('/api/kpi/kpis', { method: 'POST', body: { goalId: goal.id, ...values } }),
      kpi ? 'KPI updated' : 'KPI added',
    )
    if (saved) setKpiDialog(null)
  }

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

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex justify-end">
          <Button onClick={() => setGoalDialog({ goal: null })}>
            <Plus className="h-4 w-4" /> New goal
          </Button>
        </div>
      )}
      <GoalList
        goals={goals}
        editable={editable}
        emptyMessage={emptyMessage}
        onEditGoal={(goal) => setGoalDialog({ goal })}
        onArchiveGoal={setToArchive}
        onAddKpi={(goal) => setKpiDialog({ goal, kpi: null })}
        onEditKpi={(goal, kpi) => setKpiDialog({ goal, kpi })}
        onDiscardKpi={setToDiscard}
        onChanged={onChanged}
      />
      {goalDialog && (
        <GoalFormDialog
          initial={goalDialog.goal ? { title: goalDialog.goal.title, description: goalDialog.goal.description ?? '' } : undefined}
          onClose={() => setGoalDialog(null)}
          onSubmit={saveGoal}
        />
      )}
      {kpiDialog && (
        <KpiFormDialog
          initial={
            kpiDialog.kpi
              ? { title: kpiDialog.kpi.title, target: kpiDialog.kpi.target, evidenceType: kpiDialog.kpi.evidenceType, ownerIds: kpiDialog.kpi.owners.map((o) => o.id), dueDate: kpiDialog.kpi.dueDate }
              : undefined
          }
          ownerOptions={ownerOptions}
          currentOwners={kpiDialog.kpi?.owners ?? []}
          defaultOwnerIds={defaultOwnerIds}
          onClose={() => setKpiDialog(null)}
          onSubmit={saveKpi}
        />
      )}
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
