'use client'

import { useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { EarlierQuarterView } from '@/lib/weekly/view-types'
import { QuarterEvaluationsWorkspace } from '../form-tables/QuarterEvaluationsWorkspace'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { RoundResultsCard } from './RoundResultsCard'

/**
 * A quarter run on the earlier evaluations, finished here: HR fills in what is left in the quarter-end tables (the
 * partners' evaluations among them), closes the quarter so its scores are final, then releases its reports.
 */
export function EarlierQuarterPanel({ view, onChanged }: { view: EarlierQuarterView; onChanged: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const left = view.forms.total - view.forms.done

  async function setClosed(closed: boolean) {
    setBusy(true)
    try {
      await weeklyRequest(`/api/admin/rounds/${encodeURIComponent(view.periodId)}`, { method: 'POST', body: { action: closed ? 'lock' : 'unlock' } })
      toast.success(closed ? `${view.name} closed. Its reports can now be released.` : `${view.name} reopened`)
      setConfirming(false)
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, closed ? 'Could not close the quarter' : 'Could not reopen the quarter'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="min-w-0 max-w-2xl space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">{view.locked ? 'Closed' : 'Next step'}</p>
            <p className="text-base font-medium text-foreground">
              {view.locked
                ? 'Scores are final. Release the reports below.'
                : 'This quarter ran on the earlier evaluations. Fill in what is left in the quarter-end tables, then close it to release its reports.'}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatKarachiDate(view.startDate)} to {formatKarachiDate(view.endDate)} · {view.forms.done} of {view.forms.total} quarter-end evaluations done{left > 0 ? ` · ${left} left` : ''}. Nobody is emailed until you release reports.
            </p>
          </div>
          {view.locked
            ? <Button variant="outline" disabled={busy} className="gap-1.5" onClick={() => void setClosed(false)}><Unlock className="h-4 w-4" aria-hidden /> Reopen</Button>
            : <Button size="lg" disabled={busy} className="gap-1.5" onClick={() => setConfirming(true)}><Lock className="h-4 w-4" aria-hidden /> Close quarter</Button>}
        </CardContent>
      </Card>

      <Tabs defaultValue={view.locked ? 'results' : 'forms'}>
        <TabsList>
          <TabsTrigger value="forms">Quarter-end forms</TabsTrigger>
          <TabsTrigger value="results">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="forms" className="pt-4"><QuarterEvaluationsWorkspace key={`${view.periodId}-${view.locked}`} periodId={view.periodId} /></TabsContent>
        <TabsContent value="results" className="pt-4">
          {view.locked
            ? <RoundResultsCard key={view.periodId} periodId={view.periodId} onReleased={onChanged} />
            : <p className="text-sm text-muted-foreground">Close the quarter first; then each person’s report is generated from the final scores and can be emailed to them.</p>}
        </TabsContent>
      </Tabs>

      {confirming && (
        <ConfirmDialog
          isOpen
          title={`Close ${view.name}?`}
          message={`Its scores become final and the quarter-end tables lock.${left > 0 ? ` ${left} quarter-end ${left === 1 ? 'evaluation is' : 'evaluations are'} still not done and will count as missing.` : ''} You can reopen it to correct something.`}
          confirmText="Close quarter"
          variant="warning"
          onConfirm={() => void setClosed(true)}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
