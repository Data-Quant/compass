'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { MySurveyResponse, SurveyQuestionView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const AGREE = ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree']
interface Answer { value?: number; choice?: string; text?: string; anonymous?: boolean }

const choiceClass = (selected: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm ${selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`

/** Whether the "why" box shows: a disagree answer, or a chosen option on the improvement question. */
function needsText(q: SurveyQuestionView, a: Answer | undefined): boolean {
  if (q.kind === 'AGREE') return a?.value !== undefined && a.value <= 2
  if (q.kind === 'CHOICE') return q.explainChoice && Boolean(a?.choice)
  return false
}

function complete(q: SurveyQuestionView, a: Answer | undefined): boolean {
  if (q.kind === 'TEXT') return !q.required || Boolean(a?.text?.trim())
  if (q.kind === 'CHOICE' ? !a?.choice : a?.value === undefined) return false
  return !needsText(q, a) || Boolean(a?.text?.trim())
}

function QuestionField({ q, answer, onChange }: { q: SurveyQuestionView; answer: Answer | undefined; onChange: (a: Answer) => void }) {
  const set = (patch: Answer) => onChange({ ...answer, ...patch })
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-sm font-medium">{q.text}{!q.required && <span className="font-normal text-muted-foreground"> (optional)</span>}</p>
      {q.kind === 'NPS' && (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={q.text}>
          {Array.from({ length: 11 }, (_, v) => (
            <button key={v} type="button" role="radio" aria-checked={answer?.value === v} className={choiceClass(answer?.value === v)} onClick={() => set({ value: v })}>{v}</button>
          ))}
        </div>
      )}
      {q.kind === 'AGREE' && (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={q.text}>
          {AGREE.map((label, i) => (
            <button key={label} type="button" role="radio" aria-checked={answer?.value === i + 1} className={choiceClass(answer?.value === i + 1)} onClick={() => set({ value: i + 1, ...(i + 1 > 2 ? { text: undefined } : {}) })}>{label}</button>
          ))}
        </div>
      )}
      {q.kind === 'CHOICE' && (
        <div className="flex flex-col gap-1" role="radiogroup" aria-label={q.text}>
          {q.options.map((option) => (
            <div key={option} className="space-y-1">
              <button type="button" role="radio" aria-checked={answer?.choice === option} className={`${choiceClass(answer?.choice === option)} w-full text-left`} onClick={() => set({ choice: option, ...(answer?.choice !== option ? { text: undefined } : {}) })}>{option}</button>
              {q.explainChoice && answer?.choice === option && (
                <Textarea rows={2} maxLength={2000} aria-label={`${option}: what should change, and how would you improve it?`} placeholder="What should change, and how would you improve it?" value={answer.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      )}
      {q.kind === 'AGREE' && needsText(q, answer) && (
        <Textarea rows={2} maxLength={2000} aria-label="Please tell us why." placeholder="Please tell us why." value={answer?.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
      )}
      {q.kind === 'NPS' && answer?.value !== undefined && (
        <Textarea rows={2} maxLength={2000} aria-label="What is the main reason for your score? (optional)" placeholder="What is the main reason for your score? (optional)" value={answer.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
      )}
      {q.kind === 'TEXT' && <Textarea rows={3} maxLength={2000} aria-label={q.text} value={answer?.text ?? ''} onChange={(e) => set({ text: e.target.value })} />}
      <div className="flex items-center gap-2 pt-1">
        <Checkbox id={`anon-${q.id}`} checked={answer?.anonymous === true} onCheckedChange={(v) => set({ anonymous: v === true })} />
        <Label htmlFor={`anon-${q.id}`} className="text-xs font-normal text-muted-foreground">Submit this answer anonymously</Label>
      </div>
    </div>
  )
}

/** UX spec, section 11: this week's company sentiment question, confidential to HR and never part of a score. */
export function PulseSurveyCard() {
  const [data, setData] = useState<MySurveyResponse | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<MySurveyResponse>('/api/weekly/survey'))
    } catch {
      setData(null)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  if (!data || data.questions.length === 0) return null
  const ready = data.questions.filter((q) => complete(q, answers[q.id]) && (answers[q.id] || !q.required))
  const missing = data.questions.filter((q) => q.required && !complete(q, answers[q.id]))

  async function submit() {
    if (!data) return
    setSaving(true)
    try {
      const body = ready.flatMap((q): Array<{ questionId: string; value?: number | null; choice?: string | null; text: string | null; anonymous: boolean }> => {
        const a = answers[q.id]
        if (q.kind === 'TEXT' && !a?.text?.trim()) return q.required ? [] : [{ questionId: q.id, text: '', anonymous: false }]
        return [{ questionId: q.id, value: a?.value ?? null, choice: a?.choice ?? null, text: a?.text?.trim() || null, anonymous: a?.anonymous === true }]
      })
      await weeklyRequest('/api/weekly/survey', { method: 'POST', body: { answers: body } })
      toast.success('Thank you')
      setAnswers({})
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save your answers'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <h2 className="font-semibold">This week’s sentiment question</h2>
          <p className="text-sm text-muted-foreground">{data.notice}</p>
        </div>
        {data.questions.map((q) => (
          <QuestionField key={q.id} q={q} answer={answers[q.id]} onChange={(a) => setAnswers((current) => ({ ...current, [q.id]: a }))} />
        ))}
        <div className="flex justify-end">
          <Button disabled={saving || missing.length > 0} onClick={() => void submit()}>{saving ? 'Saving…' : 'Submit'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}
