'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { isHttpUrl } from '@/lib/kpi/evidence'
import { EVIDENCE_LABELS, STATUS_LABELS, formatKarachiDate } from '@/lib/kpi/format'
import type { KpiDetailResponse, KpiStatusValue } from '@/lib/kpi/view-types'
import { EvidenceFiles } from '../EvidenceFiles'
import { KpiStatusBadge } from '../KpiStatusBadge'
import { errorMessage, kpiRequest } from '../kpi-api'

type Decision = 'VERIFIED' | 'NEEDS_INFO' | 'REJECTED' | 'NOT_VERIFIED'
const FIRST_DECISIONS: Array<{ value: Decision; label: string }> = [
  { value: 'VERIFIED', label: 'Verify' },
  { value: 'NEEDS_INFO', label: 'Needs info' },
  { value: 'REJECTED', label: 'Reject' },
]
const APPEAL_DECISIONS: Array<{ value: Decision; label: string }> = [
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'NOT_VERIFIED', label: 'Not verified' },
]

function statusLabel(value: string | null): string {
  if (!value) return ''
  return value in STATUS_LABELS ? STATUS_LABELS[value as KpiStatusValue] : value
}

interface KpiReviewDialogProps { kpiId: string; onClose: () => void; onDecided: () => Promise<void> }

export function KpiReviewDialog({ kpiId, onClose, onDecided }: KpiReviewDialogProps) {
  const [data, setData] = useState<KpiDetailResponse | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    kpiRequest<KpiDetailResponse>(`/api/kpi/kpis/${kpiId}`)
      .then((value) => {
        if (active) setData(value)
      })
      .catch((e: unknown) => toast.error(errorMessage(e, 'Could not load the KPI')))
    return () => {
      active = false
    }
  }, [kpiId])

  async function decide(decision: Decision) {
    if (!data) return
    if (decision !== 'VERIFIED' && !note.trim()) {
      toast.error('Add a note explaining what is missing or why')
      return
    }
    setSaving(true)
    try {
      await kpiRequest(`/api/kpi/verify/${kpiId}`, {
        method: 'POST',
        body: { version: data.kpi.version, decision, ...(note.trim() ? { note: note.trim() } : {}) },
      })
      toast.success('Decision saved')
      onClose()
      await onDecided()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the decision'))
    } finally {
      setSaving(false)
    }
  }

  const kpi = data?.kpi
  const snapshot = data?.lockedSnapshot
  const changed = Boolean(snapshot && kpi && (snapshot.title !== kpi.title || snapshot.target !== kpi.target || snapshot.evidenceType !== kpi.evidenceType))
  const awaitingDecision = kpi?.status === 'CLAIMED_DONE' || kpi?.status === 'APPEALED'
  // After the response deadline the claimer can no longer reply or appeal: needs info is refused and a rejection is final.
  const responsesClosed = data ? Date.now() > new Date(data.month.responseDueAt).getTime() : false
  const firstDecisions = responsesClosed ? FIRST_DECISIONS.filter((option) => option.value !== 'NEEDS_INFO') : FIRST_DECISIONS

  return (
    <Modal isOpen onClose={onClose} title={kpi ? kpi.title : 'Loading…'} size="lg">
      {!data || !kpi ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <KpiStatusBadge status={kpi.status} />
            <span className="text-muted-foreground">{kpi.goalTitle} · set by {kpi.setter.name}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-0.5">
              <p className="font-medium">Now</p>
              <p>Target: {kpi.target}</p>
              <p>Proof: {EVIDENCE_LABELS[kpi.evidenceType]}</p>
              <p>Owners: {kpi.owners.map((owner) => owner.name).join(', ')}</p>
            </div>
            {snapshot && (
              <div className="space-y-0.5">
                <p className="font-medium">When locked{changed ? ' (changed since)' : ''}</p>
                <p>Target: {snapshot.target}</p>
                <p>Proof: {EVIDENCE_LABELS[snapshot.evidenceType]}</p>
                <p>Owners: {snapshot.owners.map((owner) => owner.name).join(', ')}</p>
              </div>
            )}
          </div>
          {kpi.claim && (
            <div className="space-y-1 rounded-md border p-3">
              <p>
                Claimed by {kpi.claim.claimedBy.name} on {formatKarachiDate(kpi.claim.claimedAt)}
                {data.claimerStats ? ` · ${data.claimerStats.claims} claims, ${data.claimerStats.rejections} rejected` : ''}
              </p>
              {kpi.claim.reportedValue && <p>Result: {kpi.claim.reportedValue}</p>}
              {kpi.claim.url && isHttpUrl(kpi.claim.url) && (
                <a href={kpi.claim.url} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">{kpi.claim.url}</a>
              )}
              {kpi.claim.note && <p className="text-muted-foreground">“{kpi.claim.note}”</p>}
              <EvidenceFiles kpiId={kpi.id} files={kpi.files} canUpload={false} />
            </div>
          )}
          {data.history.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">History ({data.history.length})</summary>
              <ul className="mt-2 space-y-1">
                {data.history.map((row) => (
                  <li key={row.id} className="text-xs">
                    {formatKarachiDate(row.at)} · {row.actorName} ({row.actorRole}) · {row.action}
                    {row.toStatus ? ` → ${statusLabel(row.toStatus)}` : ''}
                    {row.reason ? ` · ${row.reason}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data.canDecide ? (
            <div className="space-y-2">
              {responsesClosed && kpi.status === 'CLAIMED_DONE' && (
                <p className="rounded-md bg-muted p-3 text-xs">
                  The response deadline has passed, so the claimer can no longer reply or appeal. A rejection now is final (Not verified).
                </p>
              )}
              <Label htmlFor="decision-note">Note</Label>
              <Textarea id="decision-note" maxLength={4000} placeholder="Required unless you verify" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap justify-end gap-2">
                {(kpi.status === 'APPEALED' ? APPEAL_DECISIONS : firstDecisions).map((option) => (
                  <Button key={option.value} disabled={saving} variant={option.value === 'VERIFIED' ? 'default' : 'outline'} onClick={() => void decide(option.value)}>
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : awaitingDecision ? (
            <p className="text-muted-foreground">Someone else must decide this KPI: you own, set or claimed it.</p>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
