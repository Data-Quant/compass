'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { EVIDENCE_LABELS } from '@/lib/kpi/format'
import type { EvidenceFileView, KpiView } from '@/lib/kpi/view-types'
import { EvidenceFiles } from './EvidenceFiles'
import { errorMessage, kpiRequest } from './kpi-api'

interface ClaimDialogProps { kpi: KpiView; onClose: () => void; onDone: () => Promise<void> }

const optional = (key: string, value: string) => (value.trim() ? { [key]: value.trim() } : {})

export function ClaimDialog({ kpi, onClose, onDone }: ClaimDialogProps) {
  const [outcome, setOutcome] = useState<'DONE' | 'NOT_DONE'>('DONE')
  const [url, setUrl] = useState(kpi.claim?.url ?? '')
  const [reportedValue, setReportedValue] = useState(kpi.claim?.reportedValue ?? '')
  const [note, setNote] = useState(kpi.claim?.note ?? '')
  const [files, setFiles] = useState<EvidenceFileView[]>(kpi.files)
  const [version, setVersion] = useState(kpi.version)
  const [saving, setSaving] = useState(false)
  const revising = kpi.status === 'CLAIMED_DONE'
  const acceptsFiles = kpi.evidenceType === 'DOCUMENT' || kpi.evidenceType === 'CLIENT_CONFIRMATION'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await kpiRequest(`/api/kpi/kpis/${kpi.id}/claim`, {
        method: 'POST',
        body: { version, outcome, ...optional('note', note), ...optional('url', url), ...optional('reportedValue', reportedValue) },
      })
      toast.success(outcome === 'DONE' ? 'Claim submitted' : 'Marked not done')
      onClose()
      await onDone()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not submit the claim'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`${revising ? 'Revise claim' : 'Claim'}: ${kpi.title}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm">Target: {kpi.target}</p>
        {!revising && (
          <RadioGroup value={outcome} onValueChange={(value) => setOutcome(value === 'NOT_DONE' ? 'NOT_DONE' : 'DONE')} className="flex gap-6">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="DONE" id="claim-done" />
              <Label htmlFor="claim-done">Done</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="NOT_DONE" id="claim-not-done" />
              <Label htmlFor="claim-not-done">Not done</Label>
            </div>
          </RadioGroup>
        )}
        {outcome === 'NOT_DONE' ? (
          <p className="text-sm text-muted-foreground">Not done is final for this month and counts against KPI %.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Proof needed: {EVIDENCE_LABELS[kpi.evidenceType]}</p>
            <div className="space-y-2">
              <Label htmlFor="claim-url">{kpi.evidenceType === 'LINK' ? 'Link' : 'Link (optional)'}</Label>
              <Input id="claim-url" type="url" placeholder="https://" maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            {kpi.evidenceType === 'NUMBER' && (
              <div className="space-y-2">
                <Label htmlFor="claim-value">Number achieved</Label>
                <Input id="claim-value" maxLength={200} value={reportedValue} onChange={(e) => setReportedValue(e.target.value)} />
              </div>
            )}
            {acceptsFiles && (
              <EvidenceFiles
                kpiId={kpi.id}
                files={files}
                canUpload
                onUploaded={(file, kpiVersion) => {
                  setFiles((current) => [...current, file])
                  setVersion(kpiVersion)
                }}
              />
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="claim-note">Note</Label>
          <Textarea id="claim-note" maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : outcome === 'DONE' ? 'Submit claim' : 'Mark not done'}</Button>
        </div>
      </form>
    </Modal>
  )
}
