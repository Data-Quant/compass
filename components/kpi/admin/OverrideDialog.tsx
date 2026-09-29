'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { STATUS_LABELS } from '@/lib/kpi/format'
import type { KpiStatusValue, ResultsRow } from '@/lib/kpi/view-types'
import { errorMessage, kpiRequest } from '../kpi-api'

const FINAL_RESULTS: KpiStatusValue[] = ['VERIFIED', 'NOT_VERIFIED', 'NOT_DONE', 'CANCELLED']

interface OverrideDialogProps { row: ResultsRow; onClose: () => void; onDone: () => Promise<void> }

export function OverrideDialog({ row, onClose, onDone }: OverrideDialogProps) {
  const choices = FINAL_RESULTS.filter((status) => status !== row.status)
  const [to, setTo] = useState<KpiStatusValue>(choices[0])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await kpiRequest(`/api/admin/kpi/kpis/${row.kpiId}/override`, { method: 'POST', body: { version: row.version, to, reason: reason.trim() } })
      toast.success('Result corrected')
      onClose()
      await onDone()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not correct the result'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Correct the result: ${row.title}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm">Current result: {STATUS_LABELS[row.status]}</p>
        <Select value={to} onValueChange={(value) => setTo(value as KpiStatusValue)}>
          <SelectTrigger aria-label="New result"><SelectValue /></SelectTrigger>
          <SelectContent>
            {choices.map((status) => <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="space-y-2">
          <Label htmlFor="override-reason">Reason</Label>
          <Textarea id="override-reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Correct result'}</Button>
        </div>
      </form>
    </Modal>
  )
}
