'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EVIDENCE_LABELS } from '@/lib/kpi/format'
import type { EvidenceTypeValue, PersonRef } from '@/lib/kpi/view-types'

export interface KpiFormValues { title: string; target: string; evidenceType: EvidenceTypeValue; ownerIds: string[]; dueDate?: string }

interface KpiFormDialogProps {
  initial?: KpiFormValues
  ownerOptions: PersonRef[]
  /** The KPI's current owners, so someone who has left the team can still be seen and removed. */
  currentOwners?: PersonRef[]
  defaultOwnerIds: string[]
  onClose: () => void
  onSubmit: (values: KpiFormValues) => Promise<void>
}

const EVIDENCE_TYPES: EvidenceTypeValue[] = ['LINK', 'DOCUMENT', 'NUMBER', 'CLIENT_CONFIRMATION']

export function KpiFormDialog({ initial, ownerOptions, currentOwners = [], defaultOwnerIds, onClose, onSubmit }: KpiFormDialogProps) {
  const [values, setValues] = useState<KpiFormValues>(initial ?? { title: '', target: '', evidenceType: 'LINK', ownerIds: defaultOwnerIds })
  const [saving, setSaving] = useState(false)
  const departedIds = new Set(currentOwners.filter((owner) => !ownerOptions.some((option) => option.id === owner.id)).map((owner) => owner.id))
  const choices = [...ownerOptions, ...currentOwners.filter((owner) => departedIds.has(owner.id))]

  function toggleOwner(id: string, checked: boolean) {
    setValues((current) => ({
      ...current,
      ownerIds: checked ? [...current.ownerIds, id] : current.ownerIds.filter((ownerId) => ownerId !== id),
    }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (values.ownerIds.length === 0) return
    setSaving(true)
    try {
      const { dueDate, ...rest } = values
      await onSubmit({ ...rest, title: values.title.trim(), target: values.target.trim(), ...(dueDate ? { dueDate } : {}) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={initial ? 'Edit KPI' : 'New KPI'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="kpi-title">KPI</Label>
          <Input id="kpi-title" value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} required minLength={3} maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kpi-target">Measurable target</Label>
          <Input
            id="kpi-target"
            placeholder="For example: send 40 qualified outreach emails"
            value={values.target}
            onChange={(e) => setValues({ ...values, target: e.target.value })}
            required
            minLength={3}
            maxLength={500}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kpi-due">Deadline</Label>
          <Input id="kpi-due" type="date" value={values.dueDate ?? ''} onChange={(e) => setValues({ ...values, dueDate: e.target.value })} />
          <p className="text-xs text-muted-foreground">A day in this KPI's month. Leave it empty for the last day of the month.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kpi-evidence">Proof of completion</Label>
          <Select value={values.evidenceType} onValueChange={(value) => setValues({ ...values, evidenceType: value as EvidenceTypeValue })}>
            <SelectTrigger id="kpi-evidence"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVIDENCE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>{EVIDENCE_LABELS[type]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Owners</legend>
          {choices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody can own KPIs here yet.</p>
          ) : (
            choices.map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={values.ownerIds.includes(person.id)} onCheckedChange={(checked) => toggleOwner(person.id, checked === true)} aria-label={person.name} />
                <span>{person.name}</span>
                {person.position ? <span className="text-muted-foreground">· {person.position}</span> : null}
                {departedIds.has(person.id) ? <span className="text-destructive">· no longer in this team</span> : null}
              </label>
            ))
          )}
          {values.ownerIds.length === 0 && <p className="text-sm text-destructive">Choose at least one owner.</p>}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || values.ownerIds.length === 0}>{saving ? 'Saving…' : 'Save KPI'}</Button>
        </div>
      </form>
    </Modal>
  )
}
