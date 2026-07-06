'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SELF_EVALUATION_QUESTION_TYPES, type SelfEvaluationQuestionType } from '@/lib/self-evaluation'
import { ArrowDown, ArrowUp, Edit2, Eye, EyeOff, Plus, Send, Trash2 } from 'lucide-react'

interface Question {
  id: string
  section: string
  prompt: string
  helpText: string | null
  type: SelfEvaluationQuestionType
  orderIndex: number
  isActive: boolean
}

interface PeriodOption {
  id: string
  name: string
  isActive: boolean
}

interface Candidate {
  id: string
  name: string
  email: string | null
  department: string | null
  position: string | null
  role: string
  autoSelect: boolean
}

const TYPE_LABELS: Record<SelfEvaluationQuestionType, string> = {
  TEXT: 'Long text',
  LIST: 'List',
  GOAL_TABLE: 'Goal table',
}

const emptyForm = { section: '', prompt: '', helpText: '', type: 'TEXT' as SelfEvaluationQuestionType }

export default function AdminSelfEvaluationPage() {
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<Question[]>([])

  // question modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Question | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<Question | null>(null)

  // send tab
  const [periods, setPeriods] = useState<PeriodOption[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [alreadyTriggered, setAlreadyTriggered] = useState(false)
  const [existingCount, setExistingCount] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    loadQuestions()
    loadPeriods()
  }, [])

  async function loadQuestions() {
    try {
      const res = await fetch('/api/admin/self-evaluation/questions')
      const data = await res.json()
      setQuestions(data.questions || [])
    } catch {
      toast.error('Failed to load questions')
    } finally {
      setLoading(false)
    }
  }

  async function loadPeriods() {
    try {
      const res = await fetch('/api/admin/periods')
      const data = await res.json()
      const list: PeriodOption[] = data.periods || []
      setPeriods(list)
      const active = list.find((p) => p.isActive) || list[0]
      if (active) setSelectedPeriodId(active.id)
    } catch {
      // periods are only needed for the Send tab
    }
  }

  // ── Question CRUD ──────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setIsModalOpen(true)
  }
  const openEdit = (q: Question) => {
    setEditing(q)
    setForm({ section: q.section, prompt: q.prompt, helpText: q.helpText || '', type: q.type })
    setIsModalOpen(true)
  }

  const saveQuestion = async () => {
    if (!form.section.trim() || !form.prompt.trim()) {
      toast.error('Section and prompt are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/self-evaluation/questions', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to save question')
      } else {
        toast.success(editing ? 'Question updated' : 'Question created')
        setIsModalOpen(false)
        loadQuestions()
      }
    } catch {
      toast.error('Failed to save question')
    } finally {
      setSaving(false)
    }
  }

  const patchQuestion = async (id: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/admin/self-evaluation/questions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      if (!res.ok) {
        toast.error('Update failed')
        return
      }
      loadQuestions()
    } catch {
      toast.error('Update failed')
    }
  }

  const swapOrder = async (q: Question, dir: -1 | 1) => {
    const idx = questions.findIndex((x) => x.id === q.id)
    const neighbor = questions[idx + dir]
    if (!neighbor) return
    await Promise.all([
      patchQuestion(q.id, { orderIndex: neighbor.orderIndex }),
      patchQuestion(neighbor.id, { orderIndex: q.orderIndex }),
    ])
  }

  const deleteQuestion = async () => {
    if (!toDelete) return
    try {
      const res = await fetch(`/api/admin/self-evaluation/questions?id=${toDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Failed to delete question')
      } else {
        toast.success('Question deleted')
        loadQuestions()
      }
    } catch {
      toast.error('Failed to delete question')
    } finally {
      setToDelete(null)
    }
  }

  // ── Send tab ───────────────────────────────────────────────────
  const loadPreview = async (periodId: string) => {
    if (!periodId) return
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/admin/self-evaluation/trigger?periodId=${periodId}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to load recipients')
        return
      }
      const list: Candidate[] = data.candidates || []
      setCandidates(list)
      // Pre-check regular employees only; functional-role staff (HR/OA/etc.) are opt-in.
      setSelectedIds(new Set(list.filter((c) => c.autoSelect).map((c) => c.id)))
      setAlreadyTriggered(Boolean(data.alreadyTriggered))
      setExistingCount(data.existingCount || 0)
    } catch {
      toast.error('Failed to load recipients')
    } finally {
      setPreviewLoading(false)
    }
  }

  useEffect(() => {
    if (selectedPeriodId) loadPreview(selectedPeriodId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriodId])

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const send = async () => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one employee')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/admin/self-evaluation/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId: selectedPeriodId, employeeIds: Array.from(selectedIds) }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to send')
      } else {
        toast.success(`Sent ${data.created}, skipped ${data.skipped} existing, emailed ${data.emailed}`)
        loadPreview(selectedPeriodId)
      }
    } catch {
      toast.error('Failed to send')
    } finally {
      setSending(false)
    }
  }

  const allChecked = useMemo(
    () => candidates.length > 0 && candidates.every((c) => selectedIds.has(c.id)),
    [candidates, selectedIds],
  )

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto">
        <LoadingScreen message="Loading self-evaluation..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-display">Self-Evaluation</h1>
        <p className="text-muted-foreground mt-1">
          Manage the self-evaluation question bank and send self-evaluations to employees for a period.
        </p>
      </div>

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="send">Send to employees</TabsTrigger>
        </TabsList>

        {/* Questions tab */}
        <TabsContent value="questions" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" /> Add question
            </Button>
          </div>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <Card key={q.id} className={q.isActive ? '' : 'opacity-60'}>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => swapOrder(q, -1)}
                      disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => swapOrder(q, 1)}
                      disabled={i === questions.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {q.section}
                      </span>
                      <Badge variant="secondary">{TYPE_LABELS[q.type]}</Badge>
                      {!q.isActive && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-foreground">{q.prompt}</p>
                    {q.helpText && <p className="mt-0.5 text-xs text-muted-foreground">{q.helpText}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={q.isActive ? 'Deactivate' : 'Activate'}
                      onClick={() => patchQuestion(q.id, { isActive: !q.isActive })}
                    >
                      {q.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(q)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(q)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {questions.length === 0 && (
              <p className="text-sm text-muted-foreground">No questions yet. Add one to get started.</p>
            )}
          </div>
        </TabsContent>

        {/* Send tab */}
        <TabsContent value="send" className="space-y-4">
          <div className="flex flex-col gap-2 sm:max-w-sm">
            <Label>Evaluation period</Label>
            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a period" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.isActive ? ' (active)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {alreadyTriggered && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
              Already triggered for this period — {existingCount} self-evaluation(s) exist. Re-sending only
              creates and emails employees who do not already have one.
            </div>
          )}

          {previewLoading ? (
            <p className="text-sm text-muted-foreground">Loading recipients…</p>
          ) : (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    {selectedIds.size} of {candidates.length} selected
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelectedIds(allChecked ? new Set() : new Set(candidates.map((c) => c.id)))
                    }
                  >
                    {allChecked ? 'Clear all' : 'Select all'}
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {candidates.map((c) => (
                    <label key={c.id} className="flex items-center gap-3 py-2 cursor-pointer">
                      <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                      <span className="flex-1">
                        <span className="text-sm text-foreground">{c.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {[c.position, c.department].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {c.role !== 'EMPLOYEE' && <Badge variant="secondary">{c.role}</Badge>}
                      {!c.email && <Badge variant="outline">no email</Badge>}
                    </label>
                  ))}
                  {candidates.length === 0 && (
                    <p className="py-2 text-sm text-muted-foreground">No eligible employees found.</p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button onClick={send} disabled={sending || selectedIds.size === 0}>
                    <Send className="w-4 h-4" />
                    {sending ? 'Sending…' : alreadyTriggered ? 'Send to new employees' : 'Send self-evaluations'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Question editor modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editing ? 'Edit question' : 'Add question'}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Section</Label>
            <Input
              value={form.section}
              onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
              placeholder="e.g. Key Accomplishments"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prompt</Label>
            <Textarea
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              rows={3}
              placeholder="The question shown to the employee"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Help text (optional)</Label>
            <Textarea
              value={form.helpText}
              onChange={(e) => setForm((f) => ({ ...f, helpText: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Answer type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v as SelfEvaluationQuestionType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SELF_EVALUATION_QUESTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveQuestion} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={deleteQuestion}
        title="Delete question"
        message="Remove this question from the self-evaluation bank? Submitted responses keep their saved copy."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  )
}
