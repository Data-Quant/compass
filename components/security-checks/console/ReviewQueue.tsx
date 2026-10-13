'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { BulkVerifyResult } from '@/lib/security-checks/service/review'
import type { QueueItem } from '@/lib/security-checks/service/review-queue'
import { formatDate } from '../format'
import { errorMessage, scRequest } from '../sc-api'
import { useScMe } from './use-sc-me'

const bulkEligible = (item: QueueItem) => item.confirmationOnly && !item.ownTask && !item.nonCompliant

export function ReviewQueue() {
  const me = useScMe()
  const [items, setItems] = useState<QueueItem[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [result, setResult] = useState<BulkVerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    scRequest<QueueItem[]>('/api/security-checks/console/queue')
      .then((queue) => {
        setItems(queue)
        setSelected([])
      })
      .catch((e: unknown) => setError(errorMessage(e, 'Could not load the review queue')))
  }, [])
  useEffect(load, [load])

  const bulkVerify = async () => {
    setBusy(true)
    setError(null)
    try {
      setResult(await scRequest<BulkVerifyResult>('/api/security-checks/console/tasks/bulk-verify', { method: 'POST', body: { taskIds: selected } }))
      load()
    } catch (e: unknown) {
      setError(errorMessage(e, 'Bulk verify failed'))
    } finally {
      setBusy(false)
    }
  }

  if (error && !items) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!items || !me) return <LoadingScreen message="Loading review queue..." />
  const canReview = Boolean(me.capabilities?.review)
  const eligible = items.filter(bulkEligible)

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
      <Link href="/security-checks/console" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Security Console</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Review queue</h1>
          <p className="mt-1 text-muted-foreground">Oldest submissions first. Your own submissions are reviewed by the other Security Admin.</p>
        </div>
        {canReview && eligible.length > 0 && (
          <Button disabled={busy || selected.length === 0} onClick={() => void bulkVerify()}>Verify {selected.length} confirmation{selected.length === 1 ? '' : 's'}</Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <p>Verified {result.verified.length}.</p>
            {result.skipped.map((entry) => <p key={entry.taskId} className="text-muted-foreground">Skipped one task: {entry.reason}</p>)}
          </CardContent>
        </Card>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting for review.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {canReview && <TableHead className="w-8"><span className="sr-only">Select</span></TableHead>}
              <TableHead>Employee</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Review by</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.taskId}>
                {canReview && (
                  <TableCell>
                    {bulkEligible(item) && (
                      <Checkbox
                        aria-label={`Select ${item.owner.name}`}
                        checked={selected.includes(item.taskId)}
                        onCheckedChange={(checked) => setSelected((previous) => (checked ? [...previous, item.taskId] : previous.filter((id) => id !== item.taskId)))}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <Link className="font-medium hover:underline" href={`/security-checks/console/tasks/${item.taskId}`}>{item.owner.name}</Link>
                  <p className="text-xs text-muted-foreground">{item.owner.department ?? ''}</p>
                </TableCell>
                <TableCell className="text-sm">{item.campaignName} · #{item.cycleNumber}</TableCell>
                <TableCell className="text-sm">{formatDate(item.submittedAt)}</TableCell>
                <TableCell className="text-sm">{formatDate(item.reviewDueAt)}</TableCell>
                <TableCell className="space-x-1">
                  {item.finalRound && <Badge variant="destructive">final round</Badge>}
                  {item.nonCompliant && <Badge variant="destructive">non-compliant</Badge>}
                  {item.naRequests > 0 && <Badge variant="secondary">{item.naRequests} N/A</Badge>}
                  {item.ownTask && <Badge variant="outline">your own</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
