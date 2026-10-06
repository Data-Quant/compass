'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EVALUATOR_STATUS_LABELS, type EvaluatorAnswerStatus } from '@/lib/weekly/answer-rules'
import { formatKarachiDateTime } from '@/lib/weekly/format'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import type { HistoryEntry, HistoryGroup, HistoryResponse, InboxPrompt } from '@/lib/weekly/view-types'
import { AnswerCard } from './AnswerCard'
import { errorMessage, weeklyRequest, withActingAs } from './weekly-api'

const TONE: Record<EvaluatorAnswerStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  OPEN: 'outline', DRAFT: 'outline', BEING_REVIEWED: 'secondary', ACCEPTED: 'default',
  NOT_USED: 'outline', NOT_OBSERVED: 'outline', EXPIRED: 'outline', CANCELLED: 'outline',
}

export function HistoryList({ actingAs }: { actingAs?: string }) {
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<HistoryResponse>(withActingAs('/api/weekly/history', actingAs)))
    } catch (e) {
      setError(errorMessage(e, 'Could not load your answers'))
    }
  }, [actingAs])

  useEffect(() => {
    void load()
  }, [load])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading your answers…</p>
  if (data.groups.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet this quarter.</p>
  return (
    <div className="space-y-6">
      {data.groups.map((group) => (
        <section key={`${group.evaluatee.id}-${group.perspective}`} className="space-y-2">
          <h3 className="font-semibold">
            {group.evaluatee.name} <span className="text-sm font-normal text-muted-foreground">· {PERSPECTIVE_LABELS[group.perspective]}</span>
          </h3>
          <ul className="divide-y rounded-md border">
            {group.entries.map((entry) => (
              <li key={entry.id} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Week {entry.weekIndex} · {entry.topic}</p>
                  <Badge variant={TONE[entry.status]}>{EVALUATOR_STATUS_LABELS[entry.status]}</Badge>
                </div>
                {editingId === entry.id ? (
                  <AnswerCard
                    prompt={asPrompt(entry, group)}
                    actingAs={actingAs}
                    onChanged={async () => {
                      setEditingId(null)
                      await load()
                    }}
                  />
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">{entry.text}</p>
                    <AnswerDetails entry={entry} />
                    {entry.canEdit && <Button size="sm" variant="outline" onClick={() => setEditingId(entry.id)}>Edit answer</Button>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** A submitted history entry, opened for editing in the same card as the inbox. */
function asPrompt(entry: HistoryEntry, group: HistoryGroup): InboxPrompt {
  return {
    id: entry.id, weekIndex: entry.weekIndex, kind: entry.kind, status: 'SUBMITTED', text: entry.text, topic: entry.topic,
    perspective: group.perspective, evaluatee: group.evaluatee, answer: entry.answer, submittedAt: entry.submittedAt, canEdit: true, overdue: false,
  }
}

function AnswerDetails({ entry }: { entry: HistoryEntry }) {
  const answer = entry.answer
  if (!answer || (!answer.commentText && !answer.situation)) return null
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-primary">Your answer{entry.submittedAt ? ` · ${formatKarachiDateTime(entry.submittedAt)}` : ''}</summary>
      <div className="mt-2 space-y-1 whitespace-pre-wrap">
        {answer.commentText ? (
          <p>{answer.commentText}</p>
        ) : (
          <>
            <p><span className="font-medium">Situation:</span> {answer.situation}</p>
            <p><span className="font-medium">What they did:</span> {answer.action}</p>
            <p><span className="font-medium">Result:</span> {answer.result}</p>
            {answer.shortfall && <p><span className="font-medium">Did not go well:</span> {answer.shortfall}</p>}
          </>
        )}
      </div>
    </details>
  )
}
