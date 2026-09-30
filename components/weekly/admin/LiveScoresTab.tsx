'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ParticipantsResponse, PersonScoreAnswer, PersonScoreView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CyclePicker, useCycles } from './PeopleTab'

/** Refreshes while the tab is open, so an AI score shows up seconds after the evaluator submits. */
const REFRESH_MS = 5_000
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

function AiCell({ answer }: { answer: PersonScoreAnswer }) {
  if (answer.state === 'SCORING') return <span className="text-muted-foreground">AI is reading it…</span>
  if (answer.aiSufficiency === 'INSUFFICIENT') return <span>Not enough evidence</span>
  if (answer.aiScore === null) return <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-0.5">
      <span className="text-lg font-semibold">{answer.aiScore}</span>
      {answer.aiConfidence && <span className="ml-2 text-xs text-muted-foreground">{answer.aiConfidence.toLowerCase()} confidence</span>}
      {answer.aiRationale && <p className="max-w-sm text-xs text-muted-foreground">{answer.aiRationale}</p>}
    </div>
  )
}

function ScoreCard({ data }: { data: PersonScoreView }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-start gap-8 p-5">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Running score for {data.person.name}</p>
          <p className="text-4xl font-bold">{data.provisional.score === null ? '—' : data.provisional.score.toFixed(2)}<span className="text-lg font-normal text-muted-foreground"> / 4</span></p>
          <p className="text-xs text-muted-foreground">From accepted answers only. The PE score itself is calculated at quarter close.</p>
        </div>
        {data.provisional.byRelationship.length > 0 && (
          <table className="text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="pr-4 text-left">From</th><th className="pr-4">Answers</th><th className="pr-4">Average</th><th>Weight</th></tr></thead>
            <tbody>
              {data.provisional.byRelationship.map((r) => (
                <tr key={r.relationshipType}><td className="pr-4">{r.label}</td><td className="pr-4 text-center">{r.count}</td><td className="pr-4 text-center">{r.average.toFixed(2)}</td><td className="text-center">{Math.round(r.weight * 100)}%</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

export function LiveScoresTab() {
  const { cycles, cycleId, setCycleId } = useCycles()
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([])
  const [personId, setPersonId] = useState('')
  const [data, setData] = useState<PersonScoreView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!cycleId) return
    weeklyRequest<ParticipantsResponse>(`/api/admin/weekly/participants?cycleId=${cycleId}`)
      .then((result) => setPeople(result.rows.filter((row) => row.exclusion === null).map((row) => row.person)))
      .catch((e: unknown) => setError(errorMessage(e, 'Could not load people')))
  }, [cycleId])

  const load = useCallback(async () => {
    if (!cycleId || !personId) return
    try {
      setData(await weeklyRequest<PersonScoreView>(`/api/admin/weekly/person-score?cycleId=${cycleId}&personId=${personId}`))
      setError(null)
    } catch (e) {
      setError(errorMessage(e, 'Could not load scores'))
    }
  }, [cycleId, personId])

  useEffect(() => {
    setData(null)
    void load()
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <CyclePicker cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
        <Select value={personId} onValueChange={setPersonId}>
          <SelectTrigger className="w-72" aria-label="Person"><SelectValue placeholder="Choose a person" /></SelectTrigger>
          <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Updates every few seconds. Scores belong to the person the answers are about.</span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!personId && <p className="text-sm text-muted-foreground">Choose a person to watch their answers being scored.</p>}
      {data && (
        <>
          <ScoreCard data={data} />
          {data.answers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No answers about {data.person.name} yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr><th className="p-3">Submitted</th><th className="p-3">From</th><th className="p-3">Topic</th><th className="p-3">AI score</th><th className="p-3">Status</th><th className="p-3">Accepted</th></tr>
                </thead>
                <tbody>
                  {data.answers.map((a) => (
                    <tr key={a.responseId} className="border-t align-top">
                      <td className="whitespace-nowrap p-3">{time(a.submittedAt)}</td>
                      <td className="p-3">{a.evaluator.name}<p className="text-xs text-muted-foreground">{a.perspective}</p></td>
                      <td className="p-3">{a.topic}<p className="text-xs text-muted-foreground">Week {a.weekIndex}</p></td>
                      <td className="p-3"><AiCell answer={a} /></td>
                      <td className="p-3"><Badge variant="outline">{a.stateLabel}</Badge></td>
                      <td className="p-3 text-lg font-semibold">{a.finalScore ?? <span className="text-sm font-normal text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
