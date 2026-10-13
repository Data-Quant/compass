'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AuditLogView } from '@/lib/security-checks/service/exports'
import { formatDateTime } from '../format'
import { errorMessage, scRequest } from '../sc-api'

interface AuditPage {
  entries: AuditLogView[]
  nextBefore: string | null
}

/** Read-only, append-only audit trail (Security Admins). */
export function AuditLogCard() {
  const [entries, setEntries] = useState<AuditLogView[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [action, setAction] = useState('')
  const [selfReviewOnly, setSelfReviewOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(
    (before: string | null, append: boolean) => {
      const params = new URLSearchParams()
      if (action.trim()) params.set('action', action.trim().toUpperCase())
      if (selfReviewOnly) params.set('selfReview', '1')
      if (before) params.set('before', before)
      scRequest<AuditPage>(`/api/security-checks/console/audit?${params.toString()}`)
        .then((page) => {
          setEntries((previous) => (append ? [...previous, ...page.entries] : page.entries))
          setNextBefore(page.nextBefore)
          setError(null)
        })
        .catch((e: unknown) => setError(errorMessage(e, 'Could not load the audit log')))
    },
    [action, selfReviewOnly],
  )

  useEffect(() => fetchPage(null, false), [fetchPage])

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Audit log</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input className="max-w-xs" placeholder="Filter by action, e.g. EVIDENCE_VIEWED" value={action} onChange={(event) => setAction(event.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={selfReviewOnly} onCheckedChange={(checked) => setSelfReviewOnly(checked === true)} />
            <Label className="font-normal">Self-reviews only</Label>
          </label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="max-h-[480px] space-y-2 overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-md border border-border p-2 text-xs">
              <p className="font-medium">
                {entry.action}
                {entry.selfReview && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">self-review</span>}
              </p>
              <p className="text-muted-foreground">{formatDateTime(entry.at)} · {entry.actorName} ({entry.actorRole}) · {entry.targetType}{entry.targetId ? ` ${entry.targetId.slice(0, 8)}` : ''}</p>
              {entry.details !== null && entry.details !== undefined && (
                <pre className="mt-1 whitespace-pre-wrap break-all text-muted-foreground">{JSON.stringify(entry.details)}</pre>
              )}
            </div>
          ))}
          {entries.length === 0 && !error && <p className="text-sm text-muted-foreground">No entries.</p>}
        </div>
        {nextBefore && <Button variant="outline" size="sm" onClick={() => fetchPage(nextBefore, true)}>Load older</Button>}
      </CardContent>
    </Card>
  )
}
