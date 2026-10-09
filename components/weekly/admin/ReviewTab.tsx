'use client'

// HR reviews every score (HR's decision): the model proposes a score from the chosen statement, the note and earlier
// answers; HR accepts it or sets the score with a reason. Only confirmed scores count.
import { useCallback, useEffect, useState } from 'react'
import { levelMeaning } from '@/lib/weekly/levels'
import { toast } from 'sonner'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { EASE_SOFT } from '@/components/motion/ease'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MCQ_LEVELS } from '@/lib/weekly/mcq'
import type { AnswerStateValue, ReviewItem, ReviewQueueResponse } from '@/lib/weekly/view-types'
import { cn } from '@/lib/utils'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CyclePicker, NoRound, useCycles } from './PeopleTab'
import { ReviewCard } from './ReviewCard'

const FILTERS: Array<{ value: AnswerStateValue; label: string }> = [
  { value: 'NEEDS_REVIEW', label: 'To review' }, { value: 'FAILED', label: 'Model failed' }, { value: 'SCORING', label: 'With the model' }, { value: 'DECIDED', label: 'Decided' },
]
type Setting = { item: ReviewItem; score: string; reason: string; confirmFour: boolean }

/** onChanged lets the round page refresh its counts after a decision. */
export function ReviewTab({ onChanged }: { onChanged?: () => void } = {}) {
  const { cycles, cycleId, setCycleId, loaded } = useCycles()
  const [filter, setFilter] = useState<AnswerStateValue>('NEEDS_REVIEW')
  const [data, setData] = useState<ReviewQueueResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [setting, setSetting] = useState<Setting | null>(null)
  const reduce = useReducedMotion()

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
      onChanged?.()
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
      onChanged?.()
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
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-muted/70 p-1" role="tablist" aria-label="Which answers">
          {FILTERS.map((f) => {
            const active = filter === f.value
            return (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                  active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
                {data && <span className={cn('rounded-full px-1.5 text-[11px] font-semibold tabular-nums', active ? 'bg-primary/10 text-primary' : 'bg-background/70')}>{data.counts[f.value]}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">The model scores each answer from the statement the evaluator chose, their note and their earlier answers about the same person. Nothing counts until you confirm it.</p>
        {filter === 'NEEDS_REVIEW' && agreeing.length > 1 && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void confirmAgreeing()}>Confirm the {agreeing.length} that match the chosen statement</Button>
        )}
      </div>
      {!data ? (
        <div className="space-y-3" aria-label="Loading">
          {[0, 1].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted/60" />)}
        </div>
      ) : data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-14 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden />
          <p className="font-medium">{filter === 'NEEDS_REVIEW' ? 'All caught up' : 'Nothing here'}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{filter === 'NEEDS_REVIEW' ? 'Every scored answer has been decided. New ones appear here once the model has scored them.' : 'No answers are in this list right now.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* A decided answer slides out of the list and the rest close up behind it. */}
          <AnimatePresence initial={false} mode="popLayout">
            {data.items.map((item, i) => (
              <motion.div
                key={`${item.responseId}-${item.revision}`}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.45, delay: Math.min(i, 5) * 0.05, ease: EASE_SOFT } }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, transition: { duration: 0.3, ease: EASE_SOFT } }}
              >
                <ReviewCard
                  item={item}
                  busy={busy}
                  onAccept={() => accept(item)}
                  onSet={() => setSetting({ item, score: String(item.ai?.score ?? item.chosen.level), reason: '', confirmFour: false })}
                  onRetry={() => void post({ action: 'retry', responseId: item.responseId }, 'Sent back to the model')}
                />
              </motion.div>
            ))}
          </AnimatePresence>
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
