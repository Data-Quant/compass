'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { LEVEL_LABELS, type LevelKey } from '@/lib/weekly/levels'
import type { FormDetailResponse, FormSummaryView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

export const FORM_LABELS: Record<FormSummaryView['relationshipType'], string> = { C_LEVEL: 'C-Level', DEPT: 'Department', HR: 'HR' }
const RATINGS: readonly LevelKey[] = ['1', '2', '3', '4']
type Answer = { ratingValue: number | null; textResponse: string }

export function FormEditor({ form, onClose, onSubmitted }: { form: FormSummaryView; onClose: () => void; onSubmitted: () => Promise<void> }) {
  const [detail, setDetail] = useState<FormDetailResponse | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const query = `relationshipType=${form.relationshipType}&evaluateeId=${encodeURIComponent(form.evaluatee.id)}`
    weeklyRequest<FormDetailResponse>(`/api/weekly/forms/detail?${query}`)
      .then((result) => {
        setDetail(result)
        setAnswers(Object.fromEntries(result.questions.map((q) => [q.id, { ratingValue: q.ratingValue, textResponse: q.textResponse ?? '' }])))
      })
      .catch((e: unknown) => toast.error(errorMessage(e, 'Could not load the form')))
  }, [form])

  const set = (id: string, change: Partial<Answer>) => setAnswers((current) => ({ ...current, [id]: { ...(current[id] ?? { ratingValue: null, textResponse: '' }), ...change } }))
  const payload = () => ({
    relationshipType: form.relationshipType,
    evaluateeId: form.evaluatee.id,
    responses: (detail?.questions ?? []).map((q) => ({
      questionId: q.id, questionSource: q.source,
      ratingValue: q.type === 'RATING' ? answers[q.id]?.ratingValue ?? null : null,
      textResponse: answers[q.id]?.textResponse.trim() || null,
    })),
  })

  async function save(submit: boolean) {
    setBusy(true)
    try {
      await weeklyRequest(submit ? '/api/weekly/forms/submit' : '/api/weekly/forms/draft', { method: submit ? 'POST' : 'PUT', body: payload() })
      toast.success(submit ? 'Form submitted' : 'Draft saved')
      if (submit) await onSubmitted()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the form'))
    } finally {
      setBusy(false)
    }
  }

  const who = form.relationshipType === 'DEPT' ? `${form.department ?? 'Unassigned'} department (${form.memberCount} people)` : form.evaluatee.name
  const closed = detail?.status === 'CLOSED_BY_OTHER'
  return (
    <Modal isOpen onClose={onClose} title={`${FORM_LABELS[form.relationshipType]} form — ${who}`} size="xl">
      {!detail ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-5">
          {closed && <p className="text-sm">Another HR evaluator already submitted this person’s HR evaluation. This slot is closed.</p>}
          {detail.fourRatings && (
            <p className="text-sm text-muted-foreground">You can give up to {detail.fourRatings.max} ratings of 4 across all your {FORM_LABELS[form.relationshipType]} questions this quarter; {detail.fourRatings.used} used so far.</p>
          )}
          {detail.questions.map((q) => {
            const answer = answers[q.id] ?? { ratingValue: null, textResponse: '' }
            const needsExplanation = answer.ratingValue === 1 || answer.ratingValue === 4
            return (
              <div key={q.id} className="space-y-2 rounded-md border p-3">
                <p className="font-medium">{q.text}</p>
                {q.type === 'RATING' && (
                  <>
                    <div className="flex flex-wrap gap-2" role="group" aria-label={q.text}>
                      {RATINGS.map((key) => (
                        <Button key={key} type="button" size="sm" disabled={closed || busy} variant={answer.ratingValue === Number(key) ? 'default' : 'outline'} aria-pressed={answer.ratingValue === Number(key)} onClick={() => set(q.id, { ratingValue: Number(key) })}>
                          {key} · {LEVEL_LABELS[key]}
                        </Button>
                      ))}
                    </div>
                    {answer.ratingValue !== null && q.ratingDescriptions?.[String(answer.ratingValue) as LevelKey] && (
                      <p className="text-sm text-muted-foreground">{q.ratingDescriptions[String(answer.ratingValue) as LevelKey]}</p>
                    )}
                  </>
                )}
                <Label htmlFor={`form-${q.id}`} className="text-xs text-muted-foreground">
                  {q.type === 'TEXT' ? 'Your comment (optional)' : needsExplanation ? 'Explanation (required for a 1 or 4)' : 'Explanation (optional)'}
                </Label>
                <Textarea id={`form-${q.id}`} rows={q.type === 'TEXT' ? 4 : 2} maxLength={5000} disabled={closed || busy} aria-label={q.type === 'TEXT' ? q.text : `Explanation for ${q.text}`} value={answer.textResponse} onChange={(e) => set(q.id, { textResponse: e.target.value })} />
              </div>
            )
          })}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {!closed && detail.status !== 'SUBMITTED' && <Button variant="outline" disabled={busy} onClick={() => void save(false)}>Save draft</Button>}
            {!closed && <Button disabled={busy} onClick={() => void save(true)}>{detail.status === 'SUBMITTED' ? 'Submit changes' : 'Submit form'}</Button>}
          </div>
        </div>
      )}
    </Modal>
  )
}
