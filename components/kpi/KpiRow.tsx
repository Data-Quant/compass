'use client'

import { useState, type ReactNode } from 'react'
import { ExternalLink, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isHttpUrl } from '@/lib/kpi/evidence'
import { EVIDENCE_LABELS } from '@/lib/kpi/format'
import type { EvidenceTypeValue, KpiView, PersonRef } from '@/lib/kpi/view-types'
import { ChangeRequestDialog } from './ChangeRequestDialog'
import { ClaimDialog } from './ClaimDialog'
import { EvidenceFiles } from './EvidenceFiles'
import { InlineDate, InlineOwners, InlineSelect, InlineText, type SaveResult } from './inline/InlineCells'
import { KpiCommentsDialog } from './KpiCommentsDialog'
import { KpiStatusBadge } from './KpiStatusBadge'
import { RespondDialog } from './RespondDialog'

type OpenDialog = 'claim' | 'reply' | 'appeal' | 'change' | 'comments' | null

export interface KpiPatch { title?: string; target?: string; evidenceType?: EvidenceTypeValue; ownerIds?: string[]; dueDate?: string }
/** Inline editing of a draft KPI's cells, for its setter before the month locks. */
export interface KpiRowEdit { ownerOptions: PersonRef[]; save: (patch: KpiPatch) => SaveResult }

export const EVIDENCE_OPTIONS = (Object.keys(EVIDENCE_LABELS) as EvidenceTypeValue[]).map((value) => ({ value, label: EVIDENCE_LABELS[value] }))

interface KpiRowProps {
  kpi: KpiView
  /** The goal cell, rendered on a goal's first row only (it spans the goal's KPIs). */
  goalCell?: ReactNode
  /** Edit and discard buttons for drafts. */
  draftActions?: ReactNode
  /** Reloads after an action. Without it the row is read-only (comments stay open to everyone who can see it). */
  onChanged?: () => Promise<void>
  edit?: KpiRowEdit
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function NotesCell({ kpi, onComments }: { kpi: KpiView; onComments: () => void }) {
  return (
    <div className="space-y-1 text-xs">
      {kpi.claim && (
        <p>
          Claimed by {kpi.claim.claimedBy.name}
          {kpi.claim.reportedValue ? ` · Result: ${kpi.claim.reportedValue}` : ''}
        </p>
      )}
      {kpi.claim?.url && isHttpUrl(kpi.claim.url) && (
        <a href={kpi.claim.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          Evidence link <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {kpi.claim?.note && <p className="text-muted-foreground">“{kpi.claim.note}”</p>}
      {kpi.decision?.note && <p><span className="font-medium">Execution:</span> {kpi.decision.note}</p>}
      <EvidenceFiles kpiId={kpi.id} files={kpi.files} canUpload={false} />
      <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Comments on ${kpi.title}`} onClick={onComments}>
        <MessageSquare className="h-3.5 w-3.5" /> {kpi.commentCount > 0 ? `Comments (${kpi.commentCount})` : 'Comment'}
      </Button>
    </div>
  )
}

function EditableKpiCell({ kpi, edit }: { kpi: KpiView; edit: KpiRowEdit }) {
  return (
    <div className="space-y-1">
      <InlineText value={kpi.title} label={`KPI title for ${kpi.title}`} maxLength={200} className="font-medium" onSave={(title) => edit.save({ title })} />
      <InlineText value={kpi.target} label={`Target for ${kpi.title}`} placeholder="Measurable target" maxLength={500} className="text-sm" onSave={(target) => edit.save({ target })} />
      <div className="flex flex-wrap items-center gap-2">
        <InlineSelect value={kpi.evidenceType} label={`Proof for ${kpi.title}`} options={EVIDENCE_OPTIONS} onSave={(evidenceType) => edit.save({ evidenceType })} />
        <InlineOwners value={kpi.owners} options={edit.ownerOptions} label={`Owners of ${kpi.title}`} onSave={(ownerIds) => edit.save({ ownerIds })} />
      </div>
    </div>
  )
}

export function KpiRow({ kpi, goalCell, draftActions, onChanged, edit }: KpiRowProps) {
  const inline = edit && kpi.status === 'DRAFT' ? edit : null
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const actions = onChanged ? kpi.actions : null
  const close = () => setDialog(null)
  const done = async () => {
    await onChanged?.()
  }

  return (
    <tr className="border-t align-top">
      {goalCell}
      <td className="space-y-1 p-3">
        {inline ? (
          <EditableKpiCell kpi={kpi} edit={inline} />
        ) : (
          <>
            <p className="font-medium">{kpi.title}</p>
            <p className="text-sm">Target: {kpi.target}</p>
            <p className="text-xs text-muted-foreground">
              Proof: {EVIDENCE_LABELS[kpi.evidenceType]} · Owners: {kpi.owners.map((owner) => owner.name).join(', ')}
            </p>
          </>
        )}
      </td>
      <td className="whitespace-nowrap p-3 text-sm">
        {inline ? <InlineDate value={kpi.dueDate} label={`Deadline for ${kpi.title}`} onSave={(dueDate) => inline.save({ dueDate })} /> : day(kpi.dueDate)}
      </td>
      <td className="p-3"><NotesCell kpi={kpi} onComments={() => setDialog('comments')} /></td>
      <td className="whitespace-nowrap p-3 text-sm">
        {kpi.completedAt ? (
          <span className={kpi.late ? 'rounded bg-destructive/15 px-1.5 py-0.5 font-medium text-destructive' : ''} title={kpi.late ? 'Completed after the deadline' : undefined}>
            {day(kpi.completedAt)}{kpi.late ? ' · late' : ''}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-3">
        <div className="flex flex-col items-start gap-1">
          <KpiStatusBadge status={kpi.status} />
          {kpi.pendingChange && <Badge variant="outline">Change requested</Badge>}
        </div>
      </td>
      <td className="p-3">
        <div className="flex flex-wrap justify-end gap-2">
          {draftActions}
          {actions?.claim && (
            <Button size="sm" aria-label={`Claim ${kpi.title}`} onClick={() => setDialog('claim')}>
              {kpi.status === 'CLAIMED_DONE' ? 'Revise claim' : 'Claim'}
            </Button>
          )}
          {actions?.respond && <Button size="sm" aria-label={`Reply about ${kpi.title}`} onClick={() => setDialog('reply')}>Reply</Button>}
          {actions?.appeal && <Button size="sm" variant="outline" aria-label={`Appeal ${kpi.title}`} onClick={() => setDialog('appeal')}>Appeal</Button>}
          {actions?.requestChange && (
            <Button size="sm" variant="ghost" aria-label={`Request change for ${kpi.title}`} onClick={() => setDialog('change')}>Request change</Button>
          )}
        </div>
        {dialog === 'claim' && <ClaimDialog kpi={kpi} onClose={close} onDone={done} />}
        {(dialog === 'reply' || dialog === 'appeal') && (
          <RespondDialog kpi={kpi} kind={dialog === 'reply' ? 'REPLY' : 'APPEAL'} onClose={close} onDone={done} />
        )}
        {dialog === 'change' && <ChangeRequestDialog kpi={kpi} onClose={close} onDone={done} />}
        {dialog === 'comments' && <KpiCommentsDialog kpi={kpi} onClose={close} onChanged={onChanged} />}
      </td>
    </tr>
  )
}
