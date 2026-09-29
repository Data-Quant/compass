'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EVIDENCE_LABELS } from '@/lib/kpi/format'
import type { ChangeProposal, EvidenceTypeValue, KpiView } from '@/lib/kpi/view-types'
import { errorMessage, kpiRequest } from './kpi-api'

interface ChangeRequestDialogProps { kpi: KpiView; onClose: () => void; onDone: () => Promise<void> }

const EVIDENCE_TYPES: EvidenceTypeValue[] = ['LINK', 'DOCUMENT', 'NUMBER', 'CLIENT_CONFIRMATION']

export function ChangeRequestDialog({ kpi, onClose, onDone }: ChangeRequestDialogProps) {
  const [mode, setMode] = useState<'EDIT' | 'CANCEL'>('EDIT')
  const [title, setTitle] = useState(kpi.title)
  const [target, setTarget] = useState(kpi.target)
  const [evidenceType, setEvidenceType] = useState<EvidenceTypeValue>(kpi.evidenceType)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  function proposal(): ChangeProposal {
    if (mode === 'CANCEL') return { cancel: true }
    return {
      ...(title.trim() !== kpi.title ? { title: title.trim() } : {}),
      ...(target.trim() !== kpi.target ? { target: target.trim() } : {}),
      ...(evidenceType !== kpi.evidenceType ? { evidenceType } : {}),
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const proposed = proposal()
    if (Object.keys(proposed).length === 0) {
      toast.error('Change at least one field, or ask to cancel the KPI')
      return
    }
    setSaving(true)
    try {
      await kpiRequest(`/api/kpi/kpis/${kpi.id}/change-requests`, { method: 'POST', body: { version: kpi.version, proposed, reason: reason.trim() } })
      toast.success('Change request sent to Execution')
      onClose()
      await onDone()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not send the request'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Request a change: ${kpi.title}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">Locked KPIs change only when Execution approves. The locked version stays on record.</p>
        <RadioGroup value={mode} onValueChange={(value) => setMode(value === 'CANCEL' ? 'CANCEL' : 'EDIT')} className="flex gap-6">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="EDIT" id="change-edit" />
            <Label htmlFor="change-edit">Change the KPI</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="CANCEL" id="change-cancel" />
            <Label htmlFor="change-cancel">Cancel the KPI</Label>
          </div>
        </RadioGroup>
        {mode === 'EDIT' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="change-title">KPI</Label>
              <Input id="change-title" minLength={3} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="change-target">Measurable target</Label>
              <Input id="change-target" minLength={3} maxLength={500} value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <Select value={evidenceType} onValueChange={(value) => setEvidenceType(value as EvidenceTypeValue)}>
              <SelectTrigger aria-label="Proof"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVIDENCE_TYPES.map((type) => <SelectItem key={type} value={type}>{EVIDENCE_LABELS[type]}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        <div className="space-y-2">
          <Label htmlFor="change-reason">Reason</Label>
          <Textarea id="change-reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Sending…' : 'Send request'}</Button>
        </div>
      </form>
    </Modal>
  )
}
