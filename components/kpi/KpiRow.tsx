'use client'

import { useState, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isHttpUrl } from '@/lib/kpi/evidence'
import { EVIDENCE_LABELS } from '@/lib/kpi/format'
import type { KpiView } from '@/lib/kpi/view-types'
import { ChangeRequestDialog } from './ChangeRequestDialog'
import { ClaimDialog } from './ClaimDialog'
import { EvidenceFiles } from './EvidenceFiles'
import { KpiStatusBadge } from './KpiStatusBadge'
import { RespondDialog } from './RespondDialog'

type OpenDialog = 'claim' | 'reply' | 'appeal' | 'change' | null

interface KpiRowProps {
  kpi: KpiView
  /** Extra line under the title, e.g. the goal on "My KPIs". */
  context?: string
  /** Edit and discard buttons for drafts. */
  draftActions?: ReactNode
  /** Reloads after an action. Without it the row is read-only. */
  onChanged?: () => Promise<void>
}

export function KpiRow({ kpi, context, draftActions, onChanged }: KpiRowProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const actions = onChanged ? kpi.actions : null
  const close = () => setDialog(null)
  const done = async () => {
    await onChanged?.()
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-3">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{kpi.title}</p>
        <p className="text-sm">Target: {kpi.target}</p>
        {context && <p className="text-xs text-muted-foreground">{context}</p>}
        <p className="text-xs text-muted-foreground">
          Proof: {EVIDENCE_LABELS[kpi.evidenceType]} · Owners: {kpi.owners.map((owner) => owner.name).join(', ')}
        </p>
        {kpi.claim && (
          <div className="space-y-0.5 text-xs">
            <p>
              Claimed by {kpi.claim.claimedBy.name}
              {kpi.claim.reportedValue ? ` · Result: ${kpi.claim.reportedValue}` : ''}
            </p>
            {kpi.claim.url && isHttpUrl(kpi.claim.url) && (
              <a href={kpi.claim.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                Evidence link <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {kpi.claim.note && <p className="text-muted-foreground">“{kpi.claim.note}”</p>}
          </div>
        )}
        {kpi.decision?.note && (
          <p className="text-xs"><span className="font-medium">Execution:</span> {kpi.decision.note}</p>
        )}
        <EvidenceFiles kpiId={kpi.id} files={kpi.files} canUpload={false} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {kpi.pendingChange && <Badge variant="outline">Change requested</Badge>}
        <KpiStatusBadge status={kpi.status} />
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
    </li>
  )
}
