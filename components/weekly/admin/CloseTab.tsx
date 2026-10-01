'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatKarachiDate, formatKarachiDateTime } from '@/lib/weekly/format'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import type { CloseViewResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { AskAgainButton } from './AskAgainButton'
import { CyclePicker, useCycles } from './PeopleTab'

type Pending = 'close' | 'reopen' | 'publish' | null
const keyOf = (evaluateeId: string, perspective: string) => `${evaluateeId}|${perspective}`

export function CloseTab() {
  const { cycles, cycleId, setCycleId } = useCycles()
  const [data, setData] = useState<CloseViewResponse | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!cycleId) return
    try {
      setData(await weeklyRequest<CloseViewResponse>(`/api/admin/weekly/close?cycleId=${encodeURIComponent(cycleId)}`))
      setSelected(new Set())
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the close screen'))
    }
  }, [cycleId])

  useEffect(() => {
    void load()
  }, [load])

  async function act(body: Record<string, unknown>, describe: (result: Record<string, unknown>) => string) {
    setBusy(true)
    try {
      toast.success(describe(await weeklyRequest<Record<string, unknown>>('/api/admin/weekly/close', { method: 'POST', body })))
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'That did not work'))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (cycles.length === 0) return <p className="text-sm text-muted-foreground">Create a cycle in Setup first.</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  const running = data.cycle.status === 'RUNNING'
  const drops = data.dropCandidates.filter((c) => selected.has(keyOf(c.evaluatee.id, c.perspective))).map((c) => ({ evaluateeId: c.evaluatee.id, perspective: c.perspective }))
  const blocked = data.blockers.scoring + data.blockers.failed + data.blockers.needsReview
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CyclePicker cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
        <Badge variant={running ? 'default' : 'secondary'}>{running ? `Running · week ${data.cycle.currentWeek} of ${data.cycle.totalWeeks}` : 'Closed'}</Badge>
      </div>
      {data.periodLocked && <p className="text-sm text-destructive">The evaluation period is locked. Unlock it on the Periods page before closing: a locked period ignores dropped groups.</p>}

      <Card>
        <CardContent className="space-y-2 p-4">
          <h2 className="font-semibold">End-of-quarter forms</h2>
          <p className="text-sm">{data.forms.done} of {data.forms.total} C-Level, Department and HR forms submitted.</p>
          {running && data.forms.outstanding.length > 0 && <p className="text-sm text-muted-foreground">Still to submit: {data.forms.outstanding.join(', ')}.</p>}
          {data.forms.open ? <p className="text-sm text-muted-foreground">The forms are open.</p> : <p className="text-sm text-muted-foreground">They open on {formatKarachiDate(data.forms.opensAt)}.</p>}
          {running && !data.forms.open && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: 'open-forms', cycleId }, () => 'Forms are open')}>Open forms now</Button>
          )}
        </CardContent>
      </Card>

      {running && (
        <>
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="font-semibold">Before closing</h2>
              {blocked === 0 ? <p className="text-sm">Nothing is blocking the close.</p> : (
                <ul className="list-disc pl-5 text-sm">
                  {data.blockers.scoring > 0 && <li>{data.blockers.scoring} answers are still being scored.</li>}
                  {data.blockers.failed > 0 && <li>{data.blockers.failed} answers could not be scored: score them by hand in Review.</li>}
                  {data.blockers.needsReview > 0 && <li>{data.blockers.needsReview} answers wait for your review in Review.</li>}
                </ul>
              )}
              {data.pendingAutoAccept > 0 && <p className="text-sm text-muted-foreground">{data.pendingAutoAccept} scores waiting for the 72-hour accept will be accepted when you close.</p>}
              {data.openPrompts > 0 && <p className="text-sm text-muted-foreground">{data.openPrompts} unanswered questions will expire.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Groups with no accepted evidence</h2>
                {data.dropCandidates.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(data.dropCandidates.map((c) => keyOf(c.evaluatee.id, c.perspective))))}>Select all</Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Tick a group to drop it from that person’s score, so the other groups’ weights grow (D8). Unticked groups stay and count as empty.</p>
              {data.dropCandidates.length === 0 ? <p className="text-sm">None.</p> : (
                <ul className="space-y-1 text-sm">
                  {data.dropCandidates.map((c) => {
                    const key = keyOf(c.evaluatee.id, c.perspective)
                    return (
                      <li key={key} className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                          {c.evaluatee.name} — {PERSPECTIVE_LABELS[c.perspective]} ({c.assignments} evaluator{c.assignments === 1 ? '' : 's'})
                        </label>
                        <AskAgainButton cycleId={cycleId} evaluatee={c.evaluatee} perspective={c.perspective} onDone={load} />
                      </li>
                    )
                  })}
                </ul>
              )}
              {data.lowCoverage.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer">{data.lowCoverage.length} groups have some evidence but under 60% coverage (for information)</summary>
                  <ul className="mt-2 space-y-1">{data.lowCoverage.map((c) => <li key={keyOf(c.evaluatee.id, c.perspective)}>{c.evaluatee.name} — {PERSPECTIVE_LABELS[c.perspective]}: {c.satisfied} of {c.total}</li>)}</ul>
                </details>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button disabled={busy || !data.canClose} onClick={() => setPending('close')}>Close the quarter</Button>
          </div>
        </>
      )}

      {!running && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className="font-semibold">Closed</h2>
            {data.closedAt && <p className="text-sm">Closed {formatKarachiDateTime(data.closedAt)}.</p>}
            {data.lastRun && (
              <p className="text-sm text-muted-foreground">
                Last aggregation by {data.lastRun.runBy}: {data.lastRun.counts.ratingRows} scores and {data.lastRun.counts.commentRows} comments for {data.lastRun.counts.evaluatees} people; {data.lastRun.drops} groups dropped; {data.lastRun.counts.excludedEvaluatees} leavers left out.
              </p>
            )}
            {data.resultsPublishedAt ? (
              <p className="text-sm">Results published {formatKarachiDateTime(data.resultsPublishedAt)}. Challenges close {data.challengeDeadline ? formatKarachiDate(data.challengeDeadline) : '—'}.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy} onClick={() => setPending('reopen')}>Reopen</Button>
                <Button disabled={busy} onClick={() => setPending('publish')}>Mark results published</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        isOpen={pending === 'close'}
        onClose={() => setPending(null)}
        onConfirm={() => void act({ action: 'close', cycleId, drops, formsAcknowledged: data.forms.outstanding.length > 0 }, (r) => {
          const counts = r.counts as { ratingRows: number; commentRows: number }
          return `Quarter closed: ${counts.ratingRows} scores and ${counts.commentRows} comments written`
        })}
        title={`Close ${data.cycle.periodName}?`}
        message={`${data.forms.outstanding.length > 0 ? `${data.forms.total - data.forms.done} end-of-quarter forms are not submitted (${data.forms.outstanding.join(', ')}) and cannot be filled after the close; their groups will count as empty. ` : ''}Weekly questions stop, accepted scores become evaluation results, and ${drops.length} group${drops.length === 1 ? ' is' : 's are'} dropped. You can reopen until results are published.`}
        confirmText="Close quarter"
        variant="warning"
      />
      <ConfirmDialog
        isOpen={pending === 'reopen'}
        onClose={() => setPending(null)}
        onConfirm={() => void act({ action: 'reopen', cycleId }, () => 'Quarter reopened')}
        title="Reopen this quarter?"
        message="Weekly questions and reviews start again. Groups you dropped stay dropped (remove their overrides on the Performance page to undo). Close again to rewrite the results."
        confirmText="Reopen"
        variant="warning"
      />
      <ConfirmDialog
        isOpen={pending === 'publish'}
        onClose={() => setPending(null)}
        onConfirm={() => void act({ action: 'publish', cycleId }, (r) => `Results published. Challenges close ${formatKarachiDate(String(r.challengeDeadline))}`)}
        title="Mark results published?"
        message="Send the reports from the Email page first. From now on, people can challenge their results for 10 working days, and the quarter can no longer be reopened."
        confirmText="Publish results"
        variant="info"
      />
    </div>
  )
}
