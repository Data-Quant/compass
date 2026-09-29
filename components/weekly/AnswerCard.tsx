'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { answerProblem, answerWordCount, commentProblem, MIN_ANSWER_WORDS } from '@/lib/weekly/answer-rules'
import { formatKarachiDateTime } from '@/lib/weekly/format'
import type { InboxPrompt } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest, withActingAs } from './weekly-api'

interface AnswerCardProps { prompt: InboxPrompt; actingAs?: string; onChanged: () => Promise<void> }
interface Fields { situation: string; action: string; result: string; shortfall: string; commentText: string }

const AUTOSAVE_MS = 1000

function initialFields(prompt: InboxPrompt): Fields {
  const a = prompt.answer
  return { situation: a?.situation ?? '', action: a?.action ?? '', result: a?.result ?? '', shortfall: a?.shortfall ?? '', commentText: a?.commentText ?? '' }
}

export function AnswerCard({ prompt, actingAs, onChanged }: AnswerCardProps) {
  const [fields, setFields] = useState<Fields>(() => initialFields(prompt))
  const [editing, setEditing] = useState(prompt.status !== 'SUBMITTED')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(fields)
  const submitted = prompt.status === 'SUBMITTED'
  const comment = prompt.kind === 'COMMENT'
  const answerUrl = withActingAs(`/api/weekly/prompts/${prompt.id}/answer`, actingAs)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function payload(f: Fields) {
    return comment
      ? { situation: '', action: '', result: '', commentText: f.commentText }
      : { situation: f.situation, action: f.action, result: f.result, shortfall: f.shortfall || null }
  }

  async function autosave() {
    try {
      const result = await weeklyRequest<{ savedAt: string }>(answerUrl, { method: 'PUT', body: payload(latest.current) })
      setSavedAt(result.savedAt)
    } catch {
      // The server refuses a save that lands after submitting; the submitted answer stands.
    }
  }

  function update(key: keyof Fields, value: string) {
    const next = { ...latest.current, [key]: value }
    latest.current = next
    setFields(next)
    if (submitted) return // edits to a submitted answer are saved by resubmitting
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void autosave(), AUTOSAVE_MS)
  }

  async function submit() {
    if (timer.current) clearTimeout(timer.current)
    setSaving(true)
    try {
      await weeklyRequest(answerUrl, { method: 'POST', body: payload(latest.current) })
      toast.success(submitted ? 'Answer updated' : 'Answer submitted')
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not submit the answer'))
    } finally {
      setSaving(false)
    }
  }

  async function skip() {
    setConfirmSkip(false)
    if (timer.current) clearTimeout(timer.current)
    try {
      await weeklyRequest(withActingAs(`/api/weekly/prompts/${prompt.id}/not-observed`, actingAs), { method: 'POST' })
      toast.success(comment ? 'Skipped' : 'Marked as not observed')
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update the question'))
    }
  }

  const problem = comment ? commentProblem(fields.commentText) : answerProblem(fields)
  const words = answerWordCount(fields)
  const status = [
    comment ? 'Optional and not scored' : `${words} of ${MIN_ANSWER_WORDS} words`,
    problem && editing ? problem : null,
    savedAt && !submitted ? `Saved ${formatKarachiDateTime(savedAt)}` : null,
    submitted && prompt.canEdit && prompt.editableUntil ? `Editable until ${formatKarachiDateTime(prompt.editableUntil)}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{prompt.topic}</p>
            <p className="font-medium">{prompt.text}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {prompt.kind === 'FOLLOW_UP' && <Badge variant="outline">Follow-up</Badge>}
            {prompt.overdue && !submitted && <Badge variant="secondary">From week {prompt.weekIndex}</Badge>}
            {submitted && <Badge>Submitted</Badge>}
          </div>
        </div>
        {comment ? (
          <AnswerField id={`${prompt.id}-comment`} label="Comment" value={fields.commentText} disabled={!editing} onChange={(v) => update('commentText', v)} />
        ) : (
          <>
            <AnswerField id={`${prompt.id}-situation`} label="Situation" hint="What was going on?" value={fields.situation} disabled={!editing} onChange={(v) => update('situation', v)} />
            <AnswerField id={`${prompt.id}-action`} label="What they did" hint="Their actions, not your opinion of them." value={fields.action} disabled={!editing} onChange={(v) => update('action', v)} />
            <AnswerField id={`${prompt.id}-result`} label="Result" hint="What happened because of it?" value={fields.result} disabled={!editing} onChange={(v) => update('result', v)} />
            <AnswerField id={`${prompt.id}-shortfall`} label="Anything that did not go well (optional)" value={fields.shortfall} disabled={!editing} onChange={(v) => update('shortfall', v)} />
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{status}</p>
          <div className="flex flex-wrap gap-2">
            {!submitted && <Button variant="ghost" size="sm" onClick={() => setConfirmSkip(true)}>{comment ? 'Skip' : 'Not observed'}</Button>}
            {submitted && prompt.canEdit && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>}
            {editing && (
              <Button size="sm" disabled={saving || problem !== null} onClick={() => void submit()}>
                {saving ? 'Saving…' : submitted ? 'Resubmit' : 'Submit'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
      <ConfirmDialog
        isOpen={confirmSkip}
        onClose={() => setConfirmSkip(false)}
        onConfirm={() => void skip()}
        title={comment ? 'Skip this comment?' : 'Mark as not observed?'}
        message={comment ? 'Comments are optional.' : 'Use this only if you have not worked with them on this recently. The question comes back in three weeks; a second “not observed” closes it.'}
        confirmText={comment ? 'Skip comment' : 'Not observed'}
        variant="warning"
      />
    </Card>
  )
}

function AnswerField(props: { id: string; label: string; hint?: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.hint && <p className="text-xs text-muted-foreground">{props.hint}</p>}
      <Textarea id={props.id} value={props.value} disabled={props.disabled} maxLength={4000} rows={3} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  )
}
