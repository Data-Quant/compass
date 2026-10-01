'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { EVALUATOR_STATUS_LABELS, type EvaluatorAnswerStatus } from '@/lib/weekly/answer-rules'
import { formatKarachiDateTime } from '@/lib/weekly/format'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import type { HistoryEntry, HistoryResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest, withActingAs } from './weekly-api'

const TONE: Record<EvaluatorAnswerStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  OPEN: 'outline', DRAFT: 'outline', BEING_REVIEWED: 'secondary', ACCEPTED: 'default',
  NOT_USED: 'outline', NOT_OBSERVED: 'outline', EXPIRED: 'outline', CANCELLED: 'outline',
}

export function HistoryList({ actingAs }: { actingAs?: string }) {
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    weeklyRequest<HistoryResponse>(withActingAs('/api/weekly/history', actingAs))
      .then((value) => {
        if (active) setData(value)
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e, 'Could not load your answers'))
      })
    return () => {
      active = false
    }
  }, [actingAs])

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
                <p className="text-sm text-muted-foreground">{entry.text}</p>
                <AnswerDetails entry={entry} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
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
