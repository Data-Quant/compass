'use client'

// HR reviews every score (HR's decision): the model proposes a score from the chosen statement, the note and earlier
// answers; HR accepts it or sets the score with a reason. Only confirmed scores count.
import { useCallback, useEffect, useState } from 'react'
import { levelMeaning } from '@/lib/weekly/levels'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MCQ_LEVELS } from '@/lib/weekly/mcq'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import type { AnswerStateValue, ReviewItem, ReviewQueueResponse } from '@/lib/weekly/view-types'
import { cn } from '@/lib/utils'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CyclePicker, NoRound, useCycles } from './PeopleTab'

const FILTERS: Array<{ value: AnswerStateValue; label: string }> = [
  { value: 'NEEDS_REVIEW', label: 'To review' }, { value: 'FAILED', label: 'Model failed' }, { value: 'SCORING', label: 'With the model' }, { value: 'DECIDED', label: 'Decided' },
]
type Setting = { item: ReviewItem; score: string; reason: string; confirmFour: boolean }

export function ReviewTab() {
  const { cycles, cycleId, setCycleId, loaded } = useCycles()
  const [filter, setFilter] = useState<AnswerStateValue>('NEEDS_REVIEW')
  const [data, setData] = useState<ReviewQueueResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [setting, setSetting] = useState<Setting | null>(null)

  const load = useCallback(async () => {
    if (!cycleId) return
    try {
      setData(await weeklyRequest<ReviewQueueResponse>(`/api/admin/weekly/review?cycleId=${encodeURIComponent(cycleId)}&filter=${filter}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the answers'))
    }
  }, [cycleId, filter])
  useEffect(() => {
    void load()
  }, [load])

  async function post(body: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(true)
    try {
      await weeklyRequest('/api/admin/weekly/review', { method: 'POST', body })
      toast.success(success)
      await load()
      return true
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the decision'))
      return false
    } finally {
      setBusy(false)
    }
  }

  /** A 4 past the evaluator's limit needs a reason: open the dialog instead of accepting at once. */
  function accept(item: ReviewItem) {
    const overCap = item.ai?.score === 4 && !item.fours.exempt && item.fours.used >= item.fours.limit
    if (overCap) setSetting({ item, score: '4', reason: '', confirmFour: true })
    else void post({ action: 'accept', responseId: item.responseId, revision: item.revision, aiScoreId: item.ai?.id }, `Confirmed ${item.ai?.score}`)
  }

  /** The model agreed with the statement the evaluator chose, and no cap on 4s is crossed: safe to confirm together. */
  const agreeing = (data?.items ?? []).filter((i) => i.ai && !i.decision && i.ai.score === i.chosen.level && !(i.ai.score === 4 && !i.fours.exempt && i.fours.used >= i.fours.limit))
  async function confirmAgreeing() {
    setBusy(true)
    let confirmed = 0
    try {
      // One at a time through the same check as a single confirmation; a 4 can use up the cap along the way.
      for (const item of agreeing) {
        await weeklyRequest('/api/admin/weekly/review', { method: 'POST', body: { action: 'accept', responseId: item.responseId, revision: item.revision, aiScoreId: item.ai?.id } })
        confirmed += 1
      }
      toast.success(`Confirmed ${confirmed} ${confirmed === 1 ? 'answer' : 'answers'}`)
    } catch (e) {
      toast.error(`${confirmed} confirmed; then: ${errorMessage(e, 'could not confirm the rest')}`)
    } finally {
      setBusy(false)
      await load()
    }
  }

  async function submitSetting() {
    if (!setting) return
    const { item, score, reason, confirmFour } = setting
    const body = confirmFour
      ? { action: 'accept', responseId: item.responseId, revision: item.revision, aiScoreId: item.ai?.id, reason }
      : { action: 'set-score', responseId: item.responseId, revision: item.revision, score: Number(score), reason }
    if (await post(body, `Score set to ${score}`)) setSetting(null)
  }

  if (!cycleId) return <NoRound loaded={loaded} />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CyclePicker cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button key={f.value} size="sm" variant={filter === f.value ? 'default' : 'outline'} onClick={() => setFilter(f.value)}>
              {f.label}{data ? ` · ${data.counts[f.value]}` : ''}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">The model scores each answer from the statement the evaluator chose, their note and their earlier answers about the same person. Nothing counts until you confirm it.</p>
        {filter === 'NEEDS_REVIEW' && agreeing.length > 1 && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void confirmAgreeing()}>Confirm the {agreeing.length} that match the chosen statement</Button>
        )}
      </div>
      {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : data.items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here.</p> : (
        <div className="space-y-3">
          {data.items.map((item) => (
            <ReviewCard
              key={`${item.responseId}-${item.revision}`}
              item={item}
              busy={busy}
              onAccept={() => accept(item)}
              onSet={() => setSetting({ item, score: String(item.ai?.score ?? item.chosen.level), reason: '', confirmFour: false })}
              onRetry={() => void post({ action: 'retry', responseId: item.responseId }, 'Sent back to the model')}
            />
          ))}
        </div>
      )}
      {setting && (
        <Modal isOpen onClose={() => setSetting(null)} title={setting.confirmFour ? 'Confirm a 4 over the limit' : 'Set the score'}>
          <div className="space-y-4">
            {setting.confirmFour ? (
              <p className="text-sm">{setting.item.evaluator.name} already has {setting.item.fours.used} confirmed 4{setting.item.fours.used === 1 ? '' : 's'} in this relationship; the limit is {setting.item.fours.limit}. Say why this one is a 4 too.</p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="review-score">Score</Label>
                <Select value={setting.score} onValueChange={(score) => setSetting({ ...setting, score })}>
                  <SelectTrigger id="review-score" className="w-80"><SelectValue /></SelectTrigger>
                  <SelectContent>{MCQ_LEVELS.map((l) => <SelectItem key={l} value={String(l)}>{l} · {levelMeaning(l)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="review-reason">Reason</Label>
              <Textarea id="review-reason" rows={2} value={setting.reason} maxLength={500} placeholder="What makes this the right score (the evaluator will not see it)" onChange={(e) => setSetting({ ...setting, reason: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSetting(null)}>Cancel</Button>
              <Button disabled={busy || setting.reason.trim().length < 3} onClick={() => void submitSetting()}>{setting.confirmFour ? 'Confirm 4' : 'Set score'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ReviewCard({ item, busy, onAccept, onSet, onRetry }: { item: ReviewItem; busy: boolean; onAccept: () => void; onSet: () => void; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs text-muted-foreground">Week {item.weekIndex} · {item.topic} · {item.evaluator.name} about {item.evaluatee.name} ({PERSPECTIVE_LABELS[item.perspective].toLowerCase()})</p>
            <p className="font-medium">{item.question}</p>
          </div>
          {item.ai && <Badge className="shrink-0 text-base" title={levelMeaning(item.ai.score)}>Model: {item.ai.score} · {levelMeaning(item.ai.score)}</Badge>}
        </div>
        <ol className="space-y-1 text-sm">
          {item.statements.map((s) => (
            <li key={s.id} className={cn('flex gap-2 rounded px-2 py-1', s.id === item.chosen.id ? 'bg-primary/10 font-medium' : 'text-muted-foreground')}>
              <span className="w-8 shrink-0 tabular-nums" title={levelMeaning(s.level)}>{s.level}</span><span>{s.text}</span>
            </li>
          ))}
        </ol>
        {item.note && <p className="rounded-md bg-muted p-2 text-sm">Note: “{item.note}”</p>}
        {item.ai && <p className="text-sm text-muted-foreground">Why: {item.ai.rationale}</p>}
        {item.jobError && <p className="text-sm text-destructive">The model could not score this ({item.jobError}).</p>}
        <p className="text-xs text-muted-foreground">
          {item.fours.exempt ? 'Exempt from the cap on 4s.' : `${item.evaluator.name}: ${item.fours.used} of ${item.fours.limit} confirmed 4s used in this relationship.`}
        </p>
        {item.decision ? (
          <p className="text-sm">Confirmed {item.decision.finalScore} by {item.decision.reviewer}{item.decision.reason ? `: “${item.decision.reason}”` : ''}</p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {item.state === 'FAILED' && <Button size="sm" variant="outline" disabled={busy} onClick={onRetry}>Try the model again</Button>}
          <Button size="sm" variant="outline" disabled={busy} onClick={onSet}>{item.decision ? 'Change score' : 'Set score'}</Button>
          {item.ai && !item.decision && <Button size="sm" disabled={busy} onClick={onAccept}>Confirm {item.ai.score}</Button>}
        </div>
      </CardContent>
    </Card>
  )
}
