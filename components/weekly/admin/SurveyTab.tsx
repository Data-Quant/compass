'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { SurveyKindValue, SurveyQuestionResult, SurveyQuestionView, SurveyResultsResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CyclePicker, NoRound, useCycles } from './PeopleTab'

const KIND_LABELS: Record<SurveyKindValue, string> = { NPS: '0 to 10', AGREE: 'Agree scale', CHOICE: 'Multiple choice', TEXT: 'Written answer' }
const AGREE = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']

function ResultCard({ q, position }: { q: SurveyQuestionResult; position: number }) {
  const max = Math.max(1, ...Object.values(q.counts))
  const label = (key: string) => (q.kind === 'AGREE' ? AGREE[Number(key) - 1] : key)
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-medium">{position}. {q.text}{q.removed && <span className="text-xs text-muted-foreground"> (removed)</span>}</p>
          <p className="text-sm text-muted-foreground">
            {q.responses} {q.responses === 1 ? 'answer' : 'answers'}
            {q.enps !== null && ` · eNPS ${q.enps > 0 ? '+' : ''}${q.enps}`}
            {q.average !== null && ` · average ${q.average} of 5`}
          </p>
        </div>
        {Object.keys(q.counts).length > 0 && (
          <ul className="space-y-1">
            {Object.entries(q.counts).map(([key, count]) => (
              <li key={key} className="grid grid-cols-[minmax(0,12rem)_1fr_2rem] items-center gap-2 text-xs">
                <span className="truncate" title={label(key)}>{label(key)}</span>
                <span className="h-2 rounded bg-muted"><span className="block h-2 rounded bg-primary" style={{ width: `${(count / max) * 100}%` }} /></span>
                <span className="text-right tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        )}
        {q.comments.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-primary">{q.comments.length} written {q.comments.length === 1 ? 'answer' : 'answers'}</summary>
            <ul className="mt-2 space-y-2">
              {q.comments.map((c, i) => (
                <li key={i} className="rounded-md border p-2">
                  <p className="whitespace-pre-wrap">{c.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{c.name ?? (c.department ? `Anonymous · ${c.department}` : 'Anonymous')}{c.choice ? ` · ${c.choice}` : ''}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

/** HR: this quarter's sentiment question bank, and the results so far. */
export function SurveyTab() {
  const { cycles, cycleId, setCycleId, loaded } = useCycles()
  const periodId = cycles.find((c) => c.id === cycleId)?.periodId ?? ''
  const [bank, setBank] = useState<SurveyQuestionView[] | null>(null)
  const [results, setResults] = useState<SurveyResultsResponse | null>(null)
  const [draft, setDraft] = useState({ text: '', kind: 'AGREE' as SurveyKindValue, options: '' })

  const load = useCallback(async () => {
    if (!periodId) return
    setBank(null)
    setResults(null)
    try {
      const data = await weeklyRequest<{ bank: SurveyQuestionView[]; results: SurveyResultsResponse }>(`/api/admin/weekly/survey?periodId=${periodId}`)
      setBank(data.bank)
      setResults(data.results)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the survey'))
    }
  }, [periodId])
  useEffect(() => {
    void load()
  }, [load])

  async function act(body: Record<string, unknown>, done: string): Promise<boolean> {
    try {
      await weeklyRequest('/api/admin/weekly/survey', { method: 'POST', body })
      toast.success(done)
      await load()
      return true
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save'))
      return false
    }
  }

  if (!cycleId) return <NoRound loaded={loaded} />
  return (
    <div className="space-y-4">
      <CyclePicker cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
      <p className="text-sm text-muted-foreground">Everyone gets one question a week; the last week repeats the eNPS question. Answers are confidential to HR and never part of a score. Anonymous ones carry no name, and show a department only when at least five from it answered that week.</p>
      {bank && bank.length === 0 && (
        <Button onClick={() => void act({ action: 'load-default', periodId }, 'The standard 12 questions are loaded')}>Load the standard 12 questions</Button>
      )}
      {bank && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="font-semibold">Question bank</p>
            {bank.length === 0 && <p className="text-sm text-muted-foreground">No questions yet. Load the standard twelve, or add your own.</p>}
            <ol className="divide-y">
              {bank.map((q, i) => (
                <li key={q.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                  <span>{i + 1}. {q.text} <span className="text-xs text-muted-foreground">· {KIND_LABELS[q.kind]}{q.required ? '' : ' · optional'}</span></span>
                  <Button size="sm" variant="ghost" onClick={() => void act({ action: 'remove', questionId: q.id }, 'Question removed')}>Remove</Button>
                </li>
              ))}
            </ol>
            <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="survey-text">New question</Label>
                <Input id="survey-text" value={draft.text} maxLength={500} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
              </div>
              <Select value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind: kind as SurveyKindValue })}>
                <SelectTrigger aria-label="Answer type"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(KIND_LABELS) as SurveyKindValue[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
              <Button
                disabled={draft.text.trim().length < 5}
                onClick={() => void act({
                  action: 'add', periodId,
                  question: { text: draft.text, kind: draft.kind, ...(draft.kind === 'CHOICE' ? { options: draft.options.split('\n').map((o) => o.trim()).filter(Boolean) } : {}) },
                }, 'Question added').then((ok) => ok && setDraft({ text: '', kind: 'AGREE', options: '' }))}
              >Add</Button>
            </div>
            {draft.kind === 'CHOICE' && (
              <Textarea rows={3} aria-label="Options, one per line" placeholder="Options, one per line" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />
            )}
          </CardContent>
        </Card>
      )}
      {results && results.questions.some((q) => q.responses > 0) && (
        <div className="space-y-3">
          <p className="font-semibold">Results</p>
          {results.questions.map((q, i) => <ResultCard key={q.id} q={q} position={i + 1} />)}
        </div>
      )}
    </div>
  )
}
