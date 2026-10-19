'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { McqStatement } from '@/lib/weekly/mcq'
import type { ContentCompetency, ContentPrompt } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { AddQuestion, RemoveQuestion, RemoveTopic } from './QuestionBankControls'
import { StatementsEditor, statementsProblem } from './StatementsEditor'

const toStatements = (prompt: ContentPrompt): McqStatement[] => prompt.options.map((o) => ({ text: o.text, score: o.score }))
const parseDepartments = (text: string) => text.split(',').map((d) => d.trim()).filter(Boolean)

export function TopicCard({ topic, onChanged }: { topic: ContentCompetency; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(topic.name)
  const [departments, setDepartments] = useState(topic.departments.join(', '))
  const [saving, setSaving] = useState(false)
  const changed = name.trim() !== topic.name || parseDepartments(departments).join('|') !== topic.departments.join('|')

  async function saveTopic() {
    setSaving(true)
    try {
      await weeklyRequest(`/api/admin/weekly/competencies/${topic.id}`, { method: 'PATCH', body: { name: name.trim(), departments: parseDepartments(departments) } })
      toast.success('Topic saved')
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the topic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
            <Input value={name} maxLength={120} aria-label="Topic name" onChange={(e) => setName(e.target.value)} />
            <Input value={departments} maxLength={300} aria-label="Departments" placeholder="Every department" onChange={(e) => setDepartments(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {topic.ready ? <Badge>Ready</Badge> : <Badge variant="outline">Not ready</Badge>}
            {topic.departments.length > 0 && <Badge variant="secondary">{topic.departments.join(', ')} only</Badge>}
          </div>
        </div>
        {changed && <div className="flex justify-end"><Button size="sm" disabled={saving || !name.trim()} onClick={() => void saveTopic()}>Save topic</Button></div>}
        <div className="space-y-2">
          {topic.prompts.map((prompt) => <QuestionEditor key={`${prompt.id}-${prompt.text}-${prompt.options.map((o) => o.text).join('|')}`} prompt={prompt} onChanged={onChanged} />)}
          <AddQuestion topicId={topic.id} topicName={topic.name} onChanged={onChanged} />
        </div>
        <div className="flex justify-end">
          <RemoveTopic topicId={topic.id} topicName={topic.name} onChanged={onChanged} />
        </div>
      </CardContent>
    </Card>
  )
}

function QuestionEditor({ prompt, onChanged }: { prompt: ContentPrompt; onChanged: () => Promise<void> }) {
  const [text, setText] = useState(prompt.text)
  const [statements, setStatements] = useState<McqStatement[]>(toStatements(prompt))
  const [saving, setSaving] = useState(false)
  const dirty = text !== prompt.text || JSON.stringify(statements) !== JSON.stringify(toStatements(prompt))

  async function save(body: { text?: string; options?: McqStatement[]; isActive?: boolean }) {
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
    <details className="rounded-md border p-3" open={prompt.problem !== null}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0 flex-1"><span className="font-medium">Question {prompt.variant}:</span> {prompt.text}</span>
        {prompt.problem && <Badge variant="destructive">{prompt.problem}</Badge>}
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-end gap-2">
          <RemoveQuestion prompt={prompt} onChanged={onChanged} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Active
            <Switch checked={prompt.isActive} disabled={saving} onCheckedChange={(checked) => void save({ isActive: checked })} aria-label={`Question ${prompt.variant} active`} />
          </label>
        </div>
        <Textarea value={text} rows={2} maxLength={600} aria-label={`Question ${prompt.variant}`} onChange={(e) => setText(e.target.value)} />
        <p className="text-xs text-muted-foreground">Write [name] where the person’s first name goes.</p>
        <StatementsEditor label={`Question ${prompt.variant}`} statements={statements} onChange={setStatements} disabled={saving} />
        {dirty && (
          <div className="flex justify-end">
            <Button size="sm" disabled={saving || !text.trim() || statementsProblem(statements) !== null} onClick={() => void save({ text, options: statements })}>Save question</Button>
          </div>
        )}
      </div>
    </details>
  )
}
