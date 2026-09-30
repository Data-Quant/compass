'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { LEVEL_KEYS, LEVEL_LABELS } from '@/lib/weekly/profile'
import type { ContentCompetency, ContentPrompt, ProfileView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { ProfileEditorDialog } from './ProfileEditorDialog'
import { AddQuestion, RemoveQuestion, RemoveTopic } from './QuestionBankControls'

export function TopicCard({ topic, onChanged }: { topic: ContentCompetency; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [approving, setApproving] = useState(false)
  const [confirmDraft, setConfirmDraft] = useState(false)
  const [drafting, setDrafting] = useState(false)

  async function draftWithAi() {
    setConfirmDraft(false)
    setDrafting(true)
    try {
      const result = await weeklyRequest<{ version: number }>(`/api/admin/weekly/competencies/${topic.id}/ai-draft`, { method: 'POST' })
      toast.success(`Draft v${result.version} written. Review it, then approve.`)
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'The AI could not draft this topic'))
    } finally {
      setDrafting(false)
    }
  }
  const shown = topic.draft ?? topic.approved

  async function approve() {
    setApproving(false)
    if (!topic.draft) return
    try {
      await weeklyRequest(`/api/admin/weekly/profiles/${topic.draft.id}/approve`, { method: 'POST' })
      toast.success(`${topic.name} approved`)
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not approve the profile'))
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{topic.name}</p>
            <p className="text-sm text-muted-foreground">{topic.definition}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {topic.ready ? <Badge>Ready</Badge> : <Badge variant="outline">Needs approval</Badge>}
            {topic.custom && <Badge variant="secondary">{topic.leadName ? `${topic.leadName}’s question` : 'Lead’s question'}</Badge>}
            {shown?.incomplete && <Badge variant="destructive">Incomplete</Badge>}
            {topic.draft && topic.approved && <Badge variant="outline">Draft v{topic.draft.version}</Badge>}
          </div>
        </div>
        <div className="space-y-2">
          {topic.prompts.map((prompt) => <PromptEditor key={`${prompt.id}-${prompt.text}`} prompt={prompt} onChanged={onChanged} />)}
          <AddQuestion topicId={topic.id} topicName={topic.name} onChanged={onChanged} />
        </div>
        {shown && <ProfileSummary profile={shown} />}
        <div className="flex flex-wrap justify-end gap-2">
          <RemoveTopic topicId={topic.id} topicName={topic.name} onChanged={onChanged} />
          <Button variant="ghost" size="sm" disabled={drafting} onClick={() => setConfirmDraft(true)}>{drafting ? 'Drafting…' : 'Draft with AI'}</Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>{topic.draft ? 'Edit draft' : 'Edit profile'}</Button>
          {topic.draft && <Button size="sm" aria-label={`Approve ${topic.name}`} onClick={() => setApproving(true)}>Approve</Button>}
        </div>
      </CardContent>
      {editing && shown && (
        <ProfileEditorDialog
          topic={topic}
          profile={shown}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false)
            await onChanged()
          }}
        />
      )}
      <ConfirmDialog
        isOpen={approving}
        onClose={() => setApproving(false)}
        onConfirm={() => void approve()}
        title={`Approve ${topic.name}?`}
        message="Answers submitted from now on are scored against this version. Earlier scores keep the version they used."
        confirmText="Approve profile"
        variant="info"
      />
      <ConfirmDialog
        isOpen={confirmDraft}
        onClose={() => setConfirmDraft(false)}
        onConfirm={() => void draftWithAi()}
        title={`Draft ${topic.name} with the AI?`}
        message={[
          'The AI rewrites both questions now and writes a draft profile from HR’s 1–4 descriptions.',
          topic.draft ? `It replaces draft v${topic.draft.version}; the replaced text is kept in the audit log.` : '',
          topic.approved ? 'The approved profile stays in use until you approve the draft, and the topic’s definition is not changed.' : '',
        ].filter(Boolean).join(' ')}
        confirmText="Draft with AI"
        variant="warning"
      />
    </Card>
  )
}

function PromptEditor({ prompt, onChanged }: { prompt: ContentPrompt; onChanged: () => Promise<void> }) {
  const [text, setText] = useState(prompt.text)
  const [saving, setSaving] = useState(false)

  async function save(body: { text?: string; isActive?: boolean }) {
    setSaving(true)
    try {
      await weeklyRequest(`/api/admin/weekly/prompts/${prompt.id}`, { method: 'PATCH', body })
      toast.success('Question saved')
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the question'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-1 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Question {prompt.variant}</p>
        <div className="flex items-center gap-2">
        <RemoveQuestion prompt={prompt} onChanged={onChanged} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Active
          <Switch checked={prompt.isActive} disabled={saving} onCheckedChange={(checked) => void save({ isActive: checked })} aria-label={`Question ${prompt.variant} active`} />
        </label>
        </div>
      </div>
      <Textarea value={text} rows={2} maxLength={600} aria-label={`Question ${prompt.variant}`} onChange={(e) => setText(e.target.value)} />
      {text !== prompt.text && (
        <div className="flex justify-end"><Button size="sm" disabled={saving} onClick={() => void save({ text })}>Save question</Button></div>
      )}
    </div>
  )
}

function ProfileSummary({ profile }: { profile: ProfileView }) {
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{profile.status === 'APPROVED' ? `Approved profile v${profile.version}` : `Draft profile v${profile.version}`}</summary>
      <div className="mt-3 space-y-3">
        {LEVEL_KEYS.map((key) => (
          <div key={key}>
            <p className="font-medium">{key} · {LEVEL_LABELS[key]}</p>
            <p>{profile.levels[key].behaviours}</p>
            <p className="text-muted-foreground">Consistency: {profile.levels[key].consistency} Outcome: {profile.levels[key].outcome}</p>
            {profile.levels[key].evidence.length > 0 && (
              <p className="text-muted-foreground">Examples: {profile.levels[key].evidence.map((e) => `“${e}”`).join(' ')}</p>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}
