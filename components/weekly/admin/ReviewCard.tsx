'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatKarachiDateTime } from '@/lib/weekly/format'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import { LEVEL_LABELS, type LevelKey } from '@/lib/weekly/profile'
import { ANSWER_STATE_LABELS, REVIEW_REASON_LABELS } from '@/lib/weekly/review-rules'
import type { DecisionView, ReviewAnswerView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CorrectionDialog, DecisionDialog, type DecisionMode } from './ReviewDialogs'

const ACTION_LABELS: Record<DecisionView['action'], string> = {
  ACCEPTED: 'Accepted', ADJUSTED: 'Score changed', MARKED_INSUFFICIENT: 'Asked for more detail', EXCLUDED: 'Excluded',
  AUTO_ACCEPTED: 'Accepted automatically', MANUAL: 'Scored by hand',
}
const FLAG_LABELS: Record<string, string> = {
  GENERIC_PRAISE: 'Generic praise', UNSUPPORTED_CLAIM: 'Unsupported claim', NO_RESULT: 'No result', OFF_TOPIC: 'Off topic',
  SENSITIVE_CONTENT: 'Sensitive — HR only', POSSIBLE_COPY: 'Possible copy',
}

function scoreLabel(score: number): string {
  const label = LEVEL_LABELS[String(Math.round(score)) as LevelKey]
  return label ? `${score} · ${label}` : String(score)
}

function Box({ label, text }: { label: string; text: string | null }) {
  if (!text) return null
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm">{text}</p>
    </div>
  )
}

function List({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <ul className="list-disc pl-5 text-sm">{items.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul>
    </div>
  )
}

export function ReviewCard({ item, onChanged }: { item: ReviewAnswerView; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<DecisionMode | null>(null)
  const [correcting, setCorrecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const ai = item.ai
  const canAccept = ai?.sufficiency === 'SUFFICIENT' && ai.score !== null && item.state !== 'DECIDED'
  const locked = item.state === 'SCORING'

  async function post(url: string, body: unknown, success: string) {
    setBusy(true)
    try {
      await weeklyRequest(url, { method: 'POST', body })
      toast.success(success)
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save'))
    } finally {
      setBusy(false)
    }
  }

  const done = async () => {
    setMode(null)
    setCorrecting(false)
    await onChanged()
  }

  return (
    <article aria-label={`${item.evaluatee.name}, ${item.topic}, from ${item.evaluator.name}`}>
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{item.evaluatee.name} · {item.topic}</p>
              <p className="text-sm text-muted-foreground">
                {PERSPECTIVE_LABELS[item.perspective]} — from {item.evaluator.name} · week {item.weekIndex}
                {item.submittedAt ? ` · ${formatKarachiDateTime(item.submittedAt)}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{ANSWER_STATE_LABELS[item.state]}</Badge>
              {item.kind === 'FOLLOW_UP' && <Badge variant="outline">Follow-up</Badge>}
              {item.reasons.map((reason) => <Badge key={reason} variant="secondary">{REVIEW_REASON_LABELS[reason]}</Badge>)}
              {(ai?.flags ?? []).map((flag) => <Badge key={flag} variant={flag === 'SENSITIVE_CONTENT' ? 'destructive' : 'outline'}>{FLAG_LABELS[flag] ?? flag}</Badge>)}
            </div>
          </div>
          <p className="text-sm italic text-muted-foreground">{item.question}</p>
          <div className="space-y-2 rounded-md border p-3">
            <Box label="Situation" text={item.answer.situation} />
            <Box label="What they did" text={item.answer.action} />
            <Box label="Result" text={item.answer.result} />
            <Box label="What didn’t go well" text={item.answer.shortfall} />
            <p className="text-xs text-muted-foreground">{item.wordCount} words · revision {item.revision}</p>
          </div>
          {ai && (
            <div className="space-y-2 rounded-md bg-muted/40 p-3">
              <p className="font-medium">
                {ai.sufficiency === 'SUFFICIENT' && ai.score !== null ? `AI proposes ${scoreLabel(ai.score)}` : 'AI: not enough evidence'}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{ai.confidence.toLowerCase()} confidence</span>
              </p>
              <p className="text-sm">{ai.rationale}</p>
              <List label="Shows" items={ai.criteriaMet} />
              <List label="Does not show" items={ai.criteriaNotDemonstrated} />
              <List label="Evidence quoted" items={ai.evidenceQuotes.map((q) => `“${q}”`)} />
              <p className="text-xs text-muted-foreground">{ai.model} · profile v{ai.profileVersion ?? '?'}</p>
            </div>
          )}
          {item.jobError && <p className="text-sm text-destructive">Scoring failed ({item.jobError}).</p>}
          {item.decision && (
            <p className="text-sm">
              <span className="font-medium">{ACTION_LABELS[item.decision.action]}</span>
              {item.decision.finalScore !== null ? ` · ${scoreLabel(item.decision.finalScore)}` : ''}
              {` · ${item.decision.reviewerName ?? 'automatically'} · ${formatKarachiDateTime(item.decision.createdAt)}`}
              {item.decision.reason ? ` — ${item.decision.reason}` : ''}
            </p>
          )}
          {item.autoAcceptAt && <p className="text-sm text-muted-foreground">Accepted automatically on {formatKarachiDateTime(item.autoAcceptAt)} unless you decide first.</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {item.state === 'FAILED' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void post(`/api/admin/weekly/review/${item.responseId}/retry`, {}, 'Scoring again')}>Retry scoring</Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => setCorrecting(true)}>Correct text</Button>
            <Button size="sm" variant="outline" disabled={busy || locked} onClick={() => setMode('EXCLUDE')}>Exclude</Button>
            <Button size="sm" variant="outline" disabled={busy || locked} onClick={() => setMode('ASK_FOR_DETAIL')}>Ask for more detail</Button>
            <Button size="sm" variant="outline" disabled={busy || locked} onClick={() => setMode('SET_SCORE')}>{ai ? 'Set score' : 'Score by hand'}</Button>
            {canAccept && (
              <Button size="sm" disabled={busy} onClick={() => void post(`/api/admin/weekly/review/${item.responseId}`, { action: 'ACCEPT', basedOn: item.basedOn }, 'Decision saved')}>Accept</Button>
            )}
          </div>
        </CardContent>
      </Card>
      {mode && <DecisionDialog item={item} mode={mode} onClose={() => setMode(null)} onDone={done} />}
      {correcting && <CorrectionDialog item={item} onClose={() => setCorrecting(false)} onDone={done} />}
    </article>
  )
}
