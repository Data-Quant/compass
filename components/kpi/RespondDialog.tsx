'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import type { EvidenceFileView, KpiView } from '@/lib/kpi/view-types'
import { EvidenceFiles } from './EvidenceFiles'
import { errorMessage, kpiRequest } from './kpi-api'

interface RespondDialogProps { kpi: KpiView; kind: 'REPLY' | 'APPEAL'; onClose: () => void; onDone: () => Promise<void> }

export function RespondDialog({ kpi, kind, onClose, onDone }: RespondDialogProps) {
  const [note, setNote] = useState('')
  const [url, setUrl] = useState('')
  const [reportedValue, setReportedValue] = useState('')
  const [files, setFiles] = useState<EvidenceFileView[]>(kpi.files)
  const [version, setVersion] = useState(kpi.version)
  const [saving, setSaving] = useState(false)
  const appeal = kind === 'APPEAL'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await kpiRequest(`/api/kpi/kpis/${kpi.id}/respond`, {
        method: 'POST',
        body: {
          version, kind, note: note.trim(),
          ...(url.trim() ? { url: url.trim() } : {}),
          ...(reportedValue.trim() ? { reportedValue: reportedValue.trim() } : {}),
        },
      })
      toast.success(appeal ? 'Appeal sent' : 'Reply sent')
      onClose()
      await onDone()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not send'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`${appeal ? 'Appeal' : 'Reply'}: ${kpi.title}`}>
      <form onSubmit={submit} className="space-y-4">
        {kpi.decision?.note && <p className="rounded-md bg-muted p-3 text-sm">Execution: {kpi.decision.note}</p>}
        {appeal && <p className="text-xs text-muted-foreground">You can appeal once. Execution’s next decision is final.</p>}
        <div className="space-y-2">
          <Label htmlFor="respond-note">Explanation</Label>
          <Textarea id="respond-note" required minLength={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="respond-url">New link (optional)</Label>
          <Input id="respond-url" type="url" placeholder="https://" maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        {kpi.evidenceType === 'NUMBER' && (
          <div className="space-y-2">
            <Label htmlFor="respond-value">Corrected number (optional)</Label>
            <Input id="respond-value" maxLength={200} value={reportedValue} onChange={(e) => setReportedValue(e.target.value)} />
          </div>
        )}
        <EvidenceFiles
          kpiId={kpi.id}
          files={files}
          canUpload
          onUploaded={(file, kpiVersion) => {
            setFiles((current) => [...current, file])
            setVersion(kpiVersion)
          }}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Sending…' : appeal ? 'Send appeal' : 'Send reply'}</Button>
        </div>
      </form>
    </Modal>
  )
}
