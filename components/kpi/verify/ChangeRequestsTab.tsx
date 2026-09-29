'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { EVIDENCE_LABELS, formatKarachiDate, monthLabel } from '@/lib/kpi/format'
import type { ChangeProposal, ChangeRequestView } from '@/lib/kpi/view-types'
import { errorMessage, kpiRequest } from '../kpi-api'

interface Deciding { request: ChangeRequestView; approve: boolean }

function describeProposal(proposed: ChangeProposal): string {
  if ('cancel' in proposed) return 'Cancel this KPI'
  const parts = [
    proposed.title ? `Title → ${proposed.title}` : null,
    proposed.target ? `Target → ${proposed.target}` : null,
    proposed.evidenceType ? `Proof → ${EVIDENCE_LABELS[proposed.evidenceType]}` : null,
    proposed.ownerIds ? `Owners → ${proposed.ownerIds.length} people` : null,
  ]
  return parts.filter((part): part is string => part !== null).join(' · ')
}

export function ChangeRequestsTab() {
  const [requests, setRequests] = useState<ChangeRequestView[] | null>(null)
  const [deciding, setDeciding] = useState<Deciding | null>(null)

  const load = useCallback(async () => {
    try {
      setRequests((await kpiRequest<{ requests: ChangeRequestView[] }>('/api/kpi/verify/change-requests')).requests)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load change requests'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!requests) return <p className="text-sm text-muted-foreground">Loading change requests…</p>
  return (
    <div className="space-y-3">
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No change requests waiting.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="min-w-0 space-y-1 text-sm">
                <p className="font-medium">{request.kpiTitle}</p>
                <p>{describeProposal(request.proposed)}</p>
                <p className="text-xs text-muted-foreground">
                  {monthLabel(request.monthKey)} · asked by {request.requestedBy.name} on {formatKarachiDate(request.createdAt)} · “{request.reason}”
                </p>
              </div>
              {request.canDecide ? (
                <div className="flex gap-2">
                  <Button size="sm" aria-label={`Approve change to ${request.kpiTitle}`} onClick={() => setDeciding({ request, approve: true })}>Approve</Button>
                  <Button size="sm" variant="outline" aria-label={`Reject change to ${request.kpiTitle}`} onClick={() => setDeciding({ request, approve: false })}>Reject</Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Someone without a conflict must decide this.</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {deciding && <DecideChangeDialog deciding={deciding} onClose={() => setDeciding(null)} onDone={load} />}
    </div>
  )
}

interface DecideChangeDialogProps { deciding: Deciding; onClose: () => void; onDone: () => Promise<void> }

function DecideChangeDialog({ deciding, onClose, onDone }: DecideChangeDialogProps) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const verb = deciding.approve ? 'Approve' : 'Reject'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await kpiRequest(`/api/kpi/verify/change-requests/${deciding.request.id}`, {
        method: 'POST',
        body: { approve: deciding.approve, note: note.trim() },
      })
      toast.success(deciding.approve ? 'Change approved' : 'Change rejected')
      onClose()
      await onDone()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the decision'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`${verb} change: ${deciding.request.kpiTitle}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm">{describeProposal(deciding.request.proposed)}</p>
        <div className="space-y-2">
          <Label htmlFor="change-decision-note">Decision note</Label>
          <Textarea id="change-decision-note" required minLength={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : verb}</Button>
        </div>
      </form>
    </Modal>
  )
}
