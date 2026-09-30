'use client'

// The empty rows at the bottom of the KPI table: type a KPI (or a goal) straight into the table and press Enter.
import { useState, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EvidenceTypeValue, PersonRef } from '@/lib/kpi/view-types'
import { EVIDENCE_OPTIONS } from '../KpiRow'
import { InlineOwners, InlineSelect } from './InlineCells'

const input = 'w-full rounded border border-input bg-background px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

export interface NewKpiValues { title: string; target: string; evidenceType: EvidenceTypeValue; ownerIds: string[]; dueDate?: string }

interface NewKpiRowProps {
  goalTitle: string
  ownerOptions: PersonRef[]
  defaultOwnerIds: string[]
  /** The goal cell, when this is the goal's only row. */
  goalCell?: React.ReactNode
  onAdd: (values: NewKpiValues) => Promise<boolean>
}

export function NewKpiRow({ goalTitle, ownerOptions, defaultOwnerIds, goalCell, onAdd }: NewKpiRowProps) {
  const empty = { title: '', target: '', evidenceType: 'LINK' as EvidenceTypeValue, ownerIds: defaultOwnerIds, dueDate: '' }
  const [values, setValues] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const owners = ownerOptions.filter((p) => values.ownerIds.includes(p.id))

  function problem(): string | null {
    if (values.title.trim().length < 3) return 'Name the KPI (at least 3 characters)'
    if (values.target.trim().length < 3) return 'Add a measurable target'
    if (values.ownerIds.length === 0) return 'Choose at least one owner'
    return null
  }

  async function add() {
    const issue = problem()
    if (issue) {
      setError(issue)
      return
    }
    setSaving(true)
    const ok = await onAdd({
      title: values.title.trim(), target: values.target.trim(), evidenceType: values.evidenceType, ownerIds: values.ownerIds,
      ...(values.dueDate ? { dueDate: values.dueDate } : {}),
    })
    setSaving(false)
    if (ok) {
      setValues({ ...empty, ownerIds: values.ownerIds })
      setError(null)
    }
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void add()
  }

  return (
    <tr className="border-t bg-muted/20 align-top">
      {goalCell}
      <td className="space-y-1 p-3">
        <input aria-label={`New KPI for ${goalTitle}`} className={input} placeholder="+ Add a KPI" maxLength={200} value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} onKeyDown={onKey} />
        <input aria-label={`New KPI target for ${goalTitle}`} className={input} placeholder="Measurable target" maxLength={500} value={values.target} onChange={(e) => setValues({ ...values, target: e.target.value })} onKeyDown={onKey} />
        <div className="flex flex-wrap items-center gap-2">
          <InlineSelect value={values.evidenceType} label={`New KPI proof for ${goalTitle}`} options={EVIDENCE_OPTIONS} onSave={async (evidenceType) => { setValues((v) => ({ ...v, evidenceType })); return true }} />
          <InlineOwners value={owners} options={ownerOptions} label={`New KPI owners for ${goalTitle}`} onSave={async (ownerIds) => { setValues((v) => ({ ...v, ownerIds })); return true }} />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </td>
      <td className="p-3">
        <input type="date" aria-label={`New KPI deadline for ${goalTitle}`} className={`${input} w-36`} value={values.dueDate} onChange={(e) => setValues({ ...values, dueDate: e.target.value })} />
        <p className="pt-1 text-xs text-muted-foreground">Empty: month end</p>
      </td>
      <td colSpan={3} />
      <td className="p-3 text-right">
        <Button size="sm" disabled={saving} aria-label={`Add KPI to ${goalTitle}`} onClick={() => void add()}>
          <Plus className="h-4 w-4" /> {saving ? 'Adding…' : 'Add'}
        </Button>
      </td>
    </tr>
  )
}

interface NewGoalRowProps { columns: number; onAdd: (title: string) => Promise<boolean> }

export function NewGoalRow({ columns, onAdd }: NewGoalRowProps) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  async function add() {
    if (title.trim().length < 3 || saving) return
    setSaving(true)
    if (await onAdd(title.trim())) setTitle('')
    setSaving(false)
  }
  return (
    <tr className="border-t">
      <td colSpan={columns} className="p-3">
        <input
          aria-label="New goal"
          className={`${input} max-w-md font-medium`}
          placeholder="+ New goal (type a name and press Enter)"
          maxLength={200}
          value={title}
          disabled={saving}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
        />
      </td>
    </tr>
  )
}
