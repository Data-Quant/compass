'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createEmptyRatingDescriptions, normalizeRatingDescriptions, type RatingDescriptions } from '@/lib/rating-descriptions'
import { RATING_LABELS } from '@/types'

interface LeadQuestion { questionText: string; ratingDescriptions: RatingDescriptions }
interface Prep {
  editable: boolean
  questionsSubmittedAt: string | null
  requiredQuestionCount: number
  questions: Array<{ orderIndex: number; questionText: string; rating1Description?: string | null; rating2Description?: string | null; rating3Description?: string | null; rating4Description?: string | null }>
  questionPrefillFrom: { periodName: string } | null
  questionsCarriedFrom: { periodName: string } | null
  period: { name: string }
}

const empty = (count: number): LeadQuestion[] => Array.from({ length: count }, () => ({ questionText: '', ratingDescriptions: createEmptyRatingDescriptions() }))

/** Leads write their own questions about their team for the quarter. Renders nothing for anyone without that task. */
export function LeadQuestionsCard() {
  const [prep, setPrep] = useState<Prep | null>(null)
  const [questions, setQuestions] = useState<LeadQuestion[]>([])
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null)

  const load = useCallback(async () => {
    try {
      const data: { prep: Prep | null } = await (await fetch('/api/pre-evaluation/current', { cache: 'no-store' })).json()
      setPrep(data.prep)
      if (!data.prep) return
      const next = empty(data.prep.requiredQuestionCount)
      for (const q of data.prep.questions) next[q.orderIndex - 1] = { questionText: q.questionText, ratingDescriptions: normalizeRatingDescriptions(q) }
      setQuestions(next)
    } catch {
      setPrep(null)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  if (!prep) return null
  const locked = !prep.editable || Boolean(prep.questionsSubmittedAt)
  const complete = questions.length > 0 && questions.every((q) => q.questionText.trim())
  const update = (index: number, patch: Partial<LeadQuestion>) => setQuestions((current) => current.map((q, i) => (i === index ? { ...q, ...patch } : q)))

  async function save(submit: boolean) {
    setSaving(submit ? 'submit' : 'draft')
    try {
      const response = await fetch(submit ? '/api/pre-evaluation/questions/submit' : '/api/pre-evaluation/questions', {
        method: submit ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questions.map((q) => ({ questionText: q.questionText.trim(), ratingDescriptions: q.ratingDescriptions })) }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Could not save your questions')
        return
      }
      toast.success(submit ? 'Questions submitted' : 'Draft saved')
      await load()
    } catch {
      toast.error('Could not save your questions')
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Your team questions for {prep.period.name}</h2>
            <p className="text-sm text-muted-foreground">
              Write {prep.requiredQuestionCount} questions about your team&apos;s work. You will be asked them about each team member, on top of the questions every lead answers.
            </p>
            {prep.questionsCarriedFrom && !prep.questionsSubmittedAt && (
              <p className="mt-1 text-sm text-muted-foreground">Carried forward from {prep.questionsCarriedFrom.periodName} and already in use. Edit them if you like.</p>
            )}
            {prep.questionPrefillFrom && !prep.questionsCarriedFrom && !prep.questionsSubmittedAt && (
              <p className="mt-1 text-sm text-muted-foreground">Prefilled from {prep.questionPrefillFrom.periodName}. Edit them, then submit.</p>
            )}
            {!prep.editable && !prep.questionsSubmittedAt && <p className="mt-1 text-sm text-muted-foreground">Evaluations have started, so these can no longer change. Contact HR if they need to.</p>}
          </div>
          {prep.questionsSubmittedAt && <Badge>Submitted</Badge>}
        </div>
        {questions.map((question, index) => (
          <div key={index} className="space-y-2">
            <Label htmlFor={`lead-question-${index}`}>Question {index + 1}</Label>
            <Textarea id={`lead-question-${index}`} rows={2} value={question.questionText} disabled={locked} onChange={(e) => update(index, { questionText: e.target.value })} />
            <div className="grid gap-2 md:grid-cols-2">
              {([1, 2, 3, 4] as const).map((rating) => (
                <div key={rating} className="space-y-1">
                  <Label htmlFor={`lead-question-${index}-${rating}`} className="text-xs">{rating} · {RATING_LABELS[rating].label}</Label>
                  <Textarea
                    id={`lead-question-${index}-${rating}`}
                    rows={2}
                    value={question.ratingDescriptions[rating]}
                    disabled={locked}
                    placeholder={`What "${RATING_LABELS[rating].label}" looks like`}
                    onChange={(e) => update(index, { ratingDescriptions: { ...question.ratingDescriptions, [rating]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        {!locked && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saving !== null} onClick={() => void save(false)}>{saving === 'draft' ? 'Saving…' : 'Save draft'}</Button>
            <Button disabled={saving !== null || !complete} onClick={() => void save(true)}>{saving === 'submit' ? 'Submitting…' : 'Submit'}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
