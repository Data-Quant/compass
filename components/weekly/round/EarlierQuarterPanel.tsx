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

/** Employees' own unfinished evaluations of the quarter: HR lets them finish on their Evaluations page, and sees who is behind. */
function LateFormsCard({ view, busy, onSet }: { view: EarlierQuarterView; busy: boolean; onSet: (open: boolean) => Promise<void> }) {
  // Stopping locks everyone out mid-form, and its button sits where "Let employees finish them" was: it asks first.
  const [stopping, setStopping] = useState(false)
  const { openedAt, left, people } = view.lateForms
  if (!openedAt && left === 0) return null
  return (
    <Card className={openedAt ? 'border-emerald-500/40' : undefined}>
      <CardContent className="space-y-3 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl space-y-1">
            <p className="font-medium text-foreground">
              {openedAt ? `Employees can finish their ${view.name} evaluations now` : 'Employees’ unfinished evaluations'}
            </p>
            <p className="text-sm text-muted-foreground">
              {openedAt
                ? `Since ${formatKarachiDate(openedAt)}, each person sees what they have left on their Evaluations page. ${left === 0 ? 'Everyone has finished.' : `${left} left across ${people.length} ${people.length === 1 ? 'person' : 'people'}.`} Leave this on until they are done; closing the quarter ends it.`
                : `${left} ${left === 1 ? 'evaluation' : 'evaluations'} across ${people.length} ${people.length === 1 ? 'person' : 'people'} were never finished. Let employees finish them on their Evaluations page before you close the quarter. Nobody is emailed.`}
            </p>
          </div>
          {openedAt
            ? <Button variant="outline" disabled={busy} onClick={() => setStopping(true)}>Stop letting employees finish</Button>
            : <Button disabled={busy} onClick={() => void onSet(true)}>Let employees finish them</Button>}
        </div>
        {stopping && (
          <ConfirmDialog
            isOpen
            title={`Stop employees finishing ${view.name}?`}
            message={`Nobody can open or submit their ${view.name} evaluations until you let them again${left > 0 ? `, and ${left} are still unfinished` : ''}. Anyone filling one in right now loses what they have not submitted.`}
            confirmText="Stop"
            variant="warning"
            onConfirm={() => { setStopping(false); void onSet(false) }}
            onClose={() => setStopping(false)}
          />
        )}
        {people.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Who still has evaluations left</summary>
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {people.map((p) => (
                <li key={p.id} className="flex justify-between gap-3"><span>{p.name}</span><span className="tabular-nums text-muted-foreground">{p.left}</span></li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

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

  async function setLateForms(open: boolean) {
    setBusy(true)
    try {
      await weeklyRequest(`/api/admin/rounds/${encodeURIComponent(view.periodId)}`, { method: 'POST', body: { action: open ? 'open-late-forms' : 'stop-late-forms' } })
      toast.success(open ? `Employees can now finish their ${view.name} evaluations` : `Employees can no longer finish ${view.name}`)
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, open ? 'Could not reopen the quarter to employees' : 'Could not stop it'))
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

      {!view.locked && <LateFormsCard view={view} busy={busy} onSet={setLateForms} />}

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
          message={`Its scores become final and the quarter-end tables lock.${left > 0 ? ` ${left} quarter-end ${left === 1 ? 'evaluation is' : 'evaluations are'} still not done and will count as missing.` : ''}${view.lateForms.left > 0 ? ` Employees still have ${view.lateForms.left} of their own ${view.lateForms.left === 1 ? 'evaluation' : 'evaluations'} unfinished; those count as missing too.` : ''} You can reopen it to correct something.`}
          confirmText="Close quarter"
          variant="warning"
          onConfirm={() => void setClosed(true)}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
