'use client'

// HR's controls for the weekly question bank: add or remove a topic's questions, remove a topic, restore it.
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Textarea } from '@/components/ui/textarea'
import type { McqStatement } from '@/lib/weekly/mcq'
import type { ContentPrompt, RemovedTopic } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { BLANK_STATEMENTS, StatementsEditor, statementsProblem } from './StatementsEditor'

type Reload = () => Promise<void>

async function act(request: () => Promise<unknown>, success: string, onChanged: Reload): Promise<boolean> {
  try {
    await request()
    toast.success(success)
    await onChanged()
    return true
  } catch (e) {
    toast.error(errorMessage(e, 'Could not change the question bank'))
    return false
  }
}

export function AddQuestion({ topicId, topicName, onChanged }: { topicId: string; topicName: string; onChanged: Reload }) {
  const [text, setText] = useState('')
  const [statements, setStatements] = useState<McqStatement[]>(BLANK_STATEMENTS)
  const [saving, setSaving] = useState(false)
  async function add() {
    setSaving(true)
    const ok = await act(() => weeklyRequest(`/api/admin/weekly/competencies/${topicId}/questions`, { method: 'POST', body: { text: text.trim(), options: statements } }), 'Question added', onChanged)
    setSaving(false)
    if (ok) {
      setText('')
      setStatements(BLANK_STATEMENTS)
    }
  }
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <Textarea value={text} rows={2} maxLength={600} placeholder="+ Add a question to this topic (asked in rotation with the others)" aria-label={`New question for ${topicName}`} onChange={(e) => setText(e.target.value)} />
      {text.trim().length > 0 && (
        <>
          <StatementsEditor label={`New question for ${topicName}`} statements={statements} onChange={setStatements} disabled={saving} />
          <div className="flex justify-end">
            <Button size="sm" disabled={saving || text.trim().length < 10 || statementsProblem(statements) !== null} onClick={() => void add()}>{saving ? 'Adding…' : 'Add question'}</Button>
          </div>
        </>
      )}
    </div>
  )
}

export function RemoveQuestion({ prompt, onChanged }: { prompt: ContentPrompt; onChanged: Reload }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" aria-label={`Remove question ${prompt.variant}`} onClick={() => setConfirm(true)}>Remove</Button>
      <ConfirmDialog
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false)
          void act(() => weeklyRequest(`/api/admin/weekly/prompts/${prompt.id}`, { method: 'DELETE' }), 'Question removed', onChanged)
        }}
        title={`Remove question ${prompt.variant}?`}
        message="It will not be asked again. If it was already asked, earlier answers keep it."
        confirmText="Remove"
        variant="danger"
      />
    </>
  )
}

export function RemoveTopic({ topicId, topicName, onChanged }: { topicId: string; topicName: string; onChanged: Reload }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>Remove topic</Button>
      <ConfirmDialog
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false)
          void act(() => weeklyRequest(`/api/admin/weekly/competencies/${topicId}/status`, { method: 'PATCH', body: { action: 'remove' } }), `${topicName} removed`, onChanged)
        }}
        title={`Remove ${topicName}?`}
        message="Nobody is asked about it from now on. Questions already sent can still be answered, and you can restore the topic later."
        confirmText="Remove topic"
        variant="danger"
      />
    </>
  )
}

export function RemovedTopics({ topics, onChanged }: { topics: RemovedTopic[]; onChanged: Reload }) {
  if (topics.length === 0) return null
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Removed topics ({topics.length})</summary>
      <ul className="mt-3 space-y-2">
        {topics.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2">
            <span>{t.name}</span>
            <Button size="sm" variant="outline" onClick={() => void act(() => weeklyRequest(`/api/admin/weekly/competencies/${t.id}/status`, { method: 'PATCH', body: { action: 'restore' } }), `${t.name} restored`, onChanged)}>Restore</Button>
          </li>
        ))}
      </ul>
    </details>
  )
}
