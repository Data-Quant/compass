'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import type { McqStatement } from '@/lib/weekly/mcq'
import { PERSPECTIVE_ORDER, type Perspective } from '@/lib/weekly/perspectives'
import type { ContentResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { RemovedTopics } from './QuestionBankControls'
import { BLANK_STATEMENTS, StatementsEditor, statementsProblem } from './StatementsEditor'
import { TopicCard } from './TopicCard'

const SECTION_TITLES: Record<Perspective, string> = {
  LEAD: 'Lead about a team member',
  UPWARD: 'Team member about their lead',
  PEER: 'Peer about a peer',
}

/** The weekly multiple-choice bank (UX spec, sections 9 and 10). */
export function ContentTab() {
  const [data, setData] = useState<ContentResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<Perspective | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<ContentResponse>('/api/admin/weekly/content'))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load topics'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function loadStandard() {
    setLoading(true)
    try {
      const result = await weeklyRequest<{ created: number; retired: number }>('/api/admin/weekly/content/standard', { method: 'POST' })
      toast.success(result.created ? `${result.created} topics loaded` : 'The standard bank is already loaded')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the standard bank'))
    } finally {
      setLoading(false)
    }
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading topics…</p>
  const ready = data.competencies.filter((c) => c.ready).length
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data.competencies.length} topics · {ready} ready to ask. Each question offers 8 statements; the level of the one an evaluator picks guides the model’s score, which you then review.
        </p>
        <Button variant="outline" disabled={loading} onClick={() => void loadStandard()}>{loading ? 'Loading…' : 'Load the standard question bank'}</Button>
      </div>
      {data.competencies.length === 0 && <p className="text-sm text-muted-foreground">No topics yet. Load the standard question bank to start.</p>}
      {PERSPECTIVE_ORDER.map((perspective) => {
        const topics = data.competencies.filter((c) => c.perspective === perspective)
        return (
          <section key={perspective} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{SECTION_TITLES[perspective]}</h2>
              <Button size="sm" variant="outline" onClick={() => setAdding(perspective)}>Add topic</Button>
            </div>
            {topics.map((topic) => <TopicCard key={`${topic.id}-${topic.name}-${topic.departments.join('|')}`} topic={topic} onChanged={load} />)}
          </section>
        )
      })}
      <RemovedTopics topics={data.removed ?? []} onChanged={load} />
      {adding && <AddTopicDialog perspective={adding} onClose={() => setAdding(null)} onAdded={async () => { setAdding(null); await load() }} />}
    </div>
  )
}

function AddTopicDialog({ perspective, onClose, onAdded }: { perspective: Perspective; onClose: () => void; onAdded: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [departments, setDepartments] = useState('')
  const [text, setText] = useState('')
  const [statements, setStatements] = useState<McqStatement[]>(BLANK_STATEMENTS)
  const [saving, setSaving] = useState(false)

  async function add() {
    setSaving(true)
    try {
      const body = { perspective, name: name.trim(), departments: departments.split(',').map((d) => d.trim()).filter(Boolean), text: text.trim(), options: statements }
      await weeklyRequest('/api/admin/weekly/competencies', { method: 'POST', body })
      toast.success('Topic added')
      await onAdded()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not add the topic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`New topic · ${SECTION_TITLES[perspective]}`}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="topic-name">Topic</Label>
          <Input id="topic-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="topic-departments">Departments (optional)</Label>
          <Input id="topic-departments" value={departments} placeholder="Every department, or e.g. Product, Design" onChange={(e) => setDepartments(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="topic-question">First question</Label>
          <Textarea id="topic-question" rows={2} maxLength={600} value={text} placeholder="e.g. When [name] hands over work, which fits best?" onChange={(e) => setText(e.target.value)} />
        </div>
        <StatementsEditor label="New topic" statements={statements} onChange={setStatements} disabled={saving} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !name.trim() || text.trim().length < 10 || statementsProblem(statements) !== null} onClick={() => void add()}>{saving ? 'Adding…' : 'Add topic'}</Button>
        </div>
      </div>
    </Modal>
  )
}
