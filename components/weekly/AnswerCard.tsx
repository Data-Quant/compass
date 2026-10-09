'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { commentProblem } from '@/lib/weekly/answer-rules'
import { RELATIONSHIP_WORDS } from '@/lib/weekly/perspectives'
import type { InboxPrompt } from '@/lib/weekly/view-types'
import { cn } from '@/lib/utils'
import { errorMessage, weeklyRequest, withActingAs } from './weekly-api'

interface AnswerCardProps { prompt: InboxPrompt; actingAs?: string; onChanged: () => Promise<void> }

/** The server's message when a choice needs a note (answer-rules.ts choiceProblem). */
const NOTE_NEEDED = /^Add a short note/

/**
 * UX spec, section 8: one statement per question, saved on click. Some choices need a short note; the evaluator never
 * sees scores, so the server says when one is needed and the choice waits as a draft until it is written.
 */
export function AnswerCard({ prompt, actingAs, onChanged }: AnswerCardProps) {
  const [optionId, setOptionId] = useState<string | null>(prompt.answer?.optionId ?? null)
  const [note, setNote] = useState(prompt.answer?.note ?? '')
  const [commentText, setCommentText] = useState(prompt.answer?.commentText ?? '')
  const [noteRequired, setNoteRequired] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(prompt.status === 'SUBMITTED')
  const [savedNote, setSavedNote] = useState(prompt.answer?.note ?? '')
  // The choice the server holds; a choice waiting for its note is not saved yet.
  const [savedOptionId, setSavedOptionId] = useState<string | null>(prompt.status === 'SUBMITTED' ? prompt.answer?.optionId ?? null : null)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const comment = prompt.kind === 'COMMENT'
  const locked = !prompt.canEdit
  const answerUrl = withActingAs(`/api/weekly/prompts/${prompt.id}/answer`, actingAs)

  async function save(next: { optionId?: string | null; note?: string; commentText?: string }) {
    setSaving(true)
    try {
      await weeklyRequest(answerUrl, { method: 'POST', body: comment ? { commentText: next.commentText ?? commentText } : { optionId: next.optionId ?? optionId, note: (next.note ?? note).trim() || null } })
      setNoteRequired(false)
      setSubmitted(true)
      setSavedNote((next.note ?? note).trim())
      if (!comment) setSavedOptionId(next.optionId ?? optionId)
      toast.success('Saved')
      void onChanged()
    } catch (e) {
      const message = errorMessage(e, 'Could not save the answer')
      if (!comment && NOTE_NEEDED.test(message)) {
        setNoteRequired(true)
        // Keep the choice while they write the note (only possible before the answer was first submitted).
        if (!submitted) await weeklyRequest(answerUrl, { method: 'PUT', body: { optionId: next.optionId ?? optionId, note } }).catch(() => undefined)
      } else {
        // Not saved (the cap on 4s, a locked quarter): show the answer the server still holds.
        if (!comment) setOptionId(savedOptionId)
        setNoteRequired(false)
        toast.error(message)
      }
    } finally {
      setSaving(false)
    }
  }

  function choose(id: string) {
    if (locked || saving) return
    setOptionId(id)
    void save({ optionId: id })
  }

  async function skip() {
    setConfirmSkip(false)
    try {
      await weeklyRequest(withActingAs(`/api/weekly/prompts/${prompt.id}/not-observed`, actingAs), { method: 'POST' })
      toast.success(comment ? 'Skipped' : 'Marked as not observed')
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update the question'))
    }
  }

  const noteChanged = note.trim() !== savedNote
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-muted-foreground">About {prompt.evaluatee.name} · {RELATIONSHIP_WORDS[prompt.perspective]}</p>
            <p className="font-medium">{prompt.text}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {prompt.overdue && !submitted && <Badge variant="secondary">From week {prompt.weekIndex}</Badge>}
            {noteRequired ? <Badge variant="outline">Needs a note</Badge> : submitted && optionId === savedOptionId && <Badge>Saved</Badge>}
          </div>
        </div>
        {comment ? (
          <div className="space-y-2">
            <Label htmlFor={`${prompt.id}-comment`}>Comment (optional, not scored)</Label>
            <Textarea id={`${prompt.id}-comment`} rows={3} maxLength={4000} value={commentText} disabled={locked} onChange={(e) => setCommentText(e.target.value)} />
            <div className="flex justify-end gap-2">
              {!submitted && <Button variant="ghost" size="sm" onClick={() => setConfirmSkip(true)}>Skip</Button>}
              <Button size="sm" disabled={saving || locked || commentProblem(commentText) !== null} onClick={() => void save({ commentText })}>{saving ? 'Saving…' : 'Save comment'}</Button>
            </div>
          </div>
        ) : (
          <>
            <div role="radiogroup" aria-label={prompt.text} className="space-y-2">
              {prompt.options.map((option) => {
                const selected = option.id === optionId
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={locked || saving}
                    onClick={() => choose(option.id)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                      selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/60',
                      (locked || saving) && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <span aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0 rounded-full border', selected && 'border-[5px] border-primary')} />
                    <span>{option.text}</span>
                  </button>
                )
              })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prompt.id}-note`}>{noteRequired ? 'Note (needed for this choice)' : 'Note (optional)'}</Label>
              {noteRequired && <p className="text-xs text-amber-700 dark:text-amber-400">Add one sentence on what you saw, then save.</p>}
              <Textarea id={`${prompt.id}-note`} rows={2} maxLength={4000} value={note} disabled={locked} placeholder="Add anything that explains your choice." onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{locked ? (submitted ? 'Locked. Only HR can change this answer now.' : 'Locked by HR') : submitted ? 'Saved. You can change it until Sunday.' : 'Your choice saves as soon as you pick it.'}</p>
              <div className="flex flex-wrap gap-2">
                {!submitted && <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setConfirmSkip(true)}>I haven’t worked with them closely enough on this to say</Button>}
                {optionId && !locked && (noteRequired || noteChanged) && (
                  <Button size="sm" disabled={saving || (noteRequired && !note.trim())} onClick={() => void save({})}>{saving ? 'Saving…' : 'Save note'}</Button>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
      <ConfirmDialog
        isOpen={confirmSkip}
        onClose={() => setConfirmSkip(false)}
        onConfirm={() => void skip()}
        title={comment ? 'Skip this comment?' : 'Mark as not observed?'}
        message={comment ? 'Comments are optional.' : 'The question comes back once, three weeks later; a second “not observed” closes it.'}
        confirmText={comment ? 'Skip comment' : 'Not observed'}
        variant="warning"
      />
    </Card>
  )
}
