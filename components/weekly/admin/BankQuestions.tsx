'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { COMMENT_BANKS, FORM_BANKS, type BankQuestionType } from '@/lib/weekly/bank-questions'
import { perspectiveForBank } from '@/lib/weekly/perspectives'
import { createEmptyRatingDescriptions, hasAnyRatingDescriptions, normalizeRatingDescriptions, type RatingDescriptions } from '@/lib/rating-descriptions'
import { RATING_LABELS, type RelationshipType } from '@/types'
import { FORM_LABELS } from '../forms/FormEditor'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { SECTION_TITLES } from './ContentTab'

interface BankQuestion {
  id: string
  relationshipType: RelationshipType
  questionText: string
  questionType: BankQuestionType
  rating1Description: string | null
  rating2Description: string | null
  rating3Description: string | null
  rating4Description: string | null
}

type FormBank = (typeof FORM_BANKS)[number]
type CommentBank = (typeof COMMENT_BANKS)[number]
/** A new question in a bank, or an existing one being edited. */
type Draft = { bank: RelationshipType; question: BankQuestion | null }

const RATINGS = [1, 2, 3, 4] as const

function commentTitle(bank: CommentBank): string {
  const perspective = perspectiveForBank(bank)
  return perspective ? SECTION_TITLES[perspective] : bank
}

/**
 * The questions outside the weekly topics: the quarter-end forms' questions (C-Level, Department, HR) and the
 * written comment questions released with the weekly ones.
 */
export function BankQuestions() {
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [toDelete, setToDelete] = useState<BankQuestion | null>(null)

  const load = useCallback(async () => {
    try {
      setQuestions((await weeklyRequest<{ questions: BankQuestion[] }>('/api/admin/questions')).questions)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the questions'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function remove() {
    if (!toDelete) return
    try {
      await weeklyRequest('/api/admin/questions', { method: 'DELETE', body: { id: toDelete.id } })
      toast.success('Question deleted')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not delete the question'))
    } finally {
      setToDelete(null)
    }
  }

  if (!questions) return <p className="text-sm text-muted-foreground">Loading questions…</p>
  const inBank = (bank: RelationshipType) => questions.filter((q) => q.relationshipType === bank)
  const rowProps = { onEdit: (question: BankQuestion) => setDraft({ bank: question.relationshipType, question }), onDelete: setToDelete }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Quarter-end form questions</h2>
          <p className="text-sm text-muted-foreground">What C-Level, the department and HR answer about each person at the end of the quarter.</p>
        </div>
        {FORM_BANKS.map((bank: FormBank) => (
          <BankSection key={bank} title={FORM_LABELS[bank]} onAdd={() => setDraft({ bank, question: null })}>
            {inBank(bank).map((q) => <QuestionRow key={q.id} question={q} {...rowProps} />)}
          </BankSection>
        ))}
      </section>
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Weekly comment questions</h2>
          <p className="text-sm text-muted-foreground">Optional written questions released with the weekly ones. Answering them is never required.</p>
        </div>
        {COMMENT_BANKS.map((bank: CommentBank) => (
          <BankSection key={bank} title={commentTitle(bank)} onAdd={() => setDraft({ bank, question: null })}>
            {inBank(bank).map((q) => <QuestionRow key={q.id} question={q} {...rowProps} />)}
          </BankSection>
        ))}
      </section>
      {draft && <QuestionDialog draft={draft} onClose={() => setDraft(null)} onSaved={async () => { setDraft(null); await load() }} />}
      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => void remove()}
        title="Delete this question?"
        message="It will no longer be asked. A question that has already been answered cannot be deleted; change its wording instead."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  )
}

function BankSection({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode[] }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        <Button size="sm" variant="outline" onClick={onAdd}>Add question</Button>
      </div>
      {children.length ? children : <p className="text-sm text-muted-foreground">No questions yet.</p>}
    </div>
  )
}

function QuestionRow({ question, onEdit, onDelete }: { question: BankQuestion; onEdit: (q: BankQuestion) => void; onDelete: (q: BankQuestion) => void }) {
  const descriptions = normalizeRatingDescriptions(question)
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-sm">{question.questionText}</p>
          <Badge variant="secondary">{question.questionType === 'RATING' ? 'Rating 1–4' : 'Written'}</Badge>
          <Button size="sm" variant="ghost" onClick={() => onEdit(question)}>Edit</Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(question)}>Delete</Button>
        </div>
        {question.questionType === 'RATING' && hasAnyRatingDescriptions(question) && (
          <div className="grid gap-2 md:grid-cols-2">
            {RATINGS.filter((r) => descriptions[r]).map((r) => (
              <div key={r} className="rounded-lg border bg-muted/20 px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">{RATING_LABELS[r].label} ({r})</p>
                <p className="mt-1 text-sm">{descriptions[r]}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function QuestionDialog({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => Promise<void> }) {
  // Comment banks hold written questions only; their rating questions are the weekly topics.
  const writtenOnly = (COMMENT_BANKS as readonly RelationshipType[]).includes(draft.bank)
  const [text, setText] = useState(draft.question?.questionText ?? '')
  const [type, setType] = useState<BankQuestionType>(draft.question?.questionType ?? (writtenOnly ? 'TEXT' : 'RATING'))
  const [descriptions, setDescriptions] = useState<RatingDescriptions>(draft.question ? normalizeRatingDescriptions(draft.question) : createEmptyRatingDescriptions())
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const fields = { questionText: text.trim(), questionType: type, ...(type === 'RATING' ? { ratingDescriptions: descriptions } : {}) }
      if (draft.question) await weeklyRequest('/api/admin/questions', { method: 'PUT', body: { id: draft.question.id, ...fields } })
      else await weeklyRequest('/api/admin/questions', { method: 'POST', body: { relationshipType: draft.bank, ...fields } })
      toast.success(draft.question ? 'Question saved' : 'Question added')
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the question'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={draft.question ? 'Edit question' : 'New question'}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="bank-question-text">Question</Label>
          <Textarea id="bank-question-text" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {!writtenOnly && (
          <div className="space-y-1.5">
            <Label htmlFor="bank-question-type">Answer</Label>
            <Select value={type} onValueChange={(value) => setType(value as BankQuestionType)}>
              <SelectTrigger id="bank-question-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RATING">Rating 1–4</SelectItem>
                <SelectItem value="TEXT">Written</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {type === 'RATING' && (
          <div className="grid gap-3 md:grid-cols-2">
            {RATINGS.map((r) => (
              <div key={r} className="space-y-1.5">
                <Label htmlFor={`bank-rating-${r}`}>{RATING_LABELS[r].label} ({r})</Label>
                <Textarea
                  id={`bank-rating-${r}`}
                  rows={2}
                  maxLength={500}
                  value={descriptions[r]}
                  placeholder={`What "${RATING_LABELS[r].label}" means here (optional)`}
                  onChange={(e) => setDescriptions({ ...descriptions, [r]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !text.trim()} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  )
}
