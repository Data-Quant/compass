'use client'

// Pre-evaluation, step two: a lead suggests quarter-specific peer and cross-department evaluators for themselves or
// their team members. HR reviews the requests before they change the cycle's mappings.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Save, Send, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface PersonOption { id: string; name: string; department: string | null; position: string | null }
type RequestType = 'PEER' | 'CROSS_DEPARTMENT'

interface SelectionRow {
  id?: string
  type: 'PRIMARY' | RequestType
  evaluateeId: string
  suggestedEvaluatorId?: string | null
  reviewStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
  evaluatee?: PersonOption
  suggestedEvaluator?: PersonOption | null
}

interface PreEvaluationTask {
  editable: boolean
  evaluateesSubmittedAt: string | null
  candidateUsers: PersonOption[]
  directReportUsers: PersonOption[]
  evaluateeSelections: SelectionRow[]
}

interface Option { value: string; label: string }

const EMPTY = '__empty__'
const label = (p: PersonOption) => `${p.name}${p.department ? ` - ${p.department}` : ''}`

const SECTIONS: Record<RequestType, { title: string; hint: string; add: string; evaluatorLabel: string; empty: string }> = {
  PEER: {
    title: 'Peer Evaluator Requests',
    hint: 'Add quarter-specific peer evaluators for yourself or your team members.',
    add: 'Add Peer Request',
    evaluatorLabel: 'Requested peer evaluator',
    empty: 'No peer evaluator requests added yet.',
  },
  CROSS_DEPARTMENT: {
    title: 'Cross-Department Suggestions',
    hint: 'Suggest evaluators from other teams for HR review.',
    add: 'Add Cross-Dept',
    evaluatorLabel: 'Suggested evaluator',
    empty: 'No cross-department suggestions added yet.',
  },
}

function PersonSelect({ value, placeholder, options, disabled, onChange }: { value: string; placeholder: string; options: Option[]; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <Select value={value || EMPTY} onValueChange={(v) => onChange(v === EMPTY ? '' : v)} disabled={disabled}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY}>{placeholder}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function EvaluatorChangeRequests() {
  const user = useLayoutUser()
  const [task, setTask] = useState<PreEvaluationTask | null>(null)
  const [requests, setRequests] = useState<SelectionRow[]>([])
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await (await fetch('/api/pre-evaluation/current', { cache: 'no-store' })).json()
      const prep: PreEvaluationTask | null = data.prep || null
      setTask(prep)
      setRequests(prep ? prep.evaluateeSelections.filter((s) => s.type !== 'PRIMARY') : [])
    } catch {
      toast.error('Could not load evaluator change requests')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const targets = useMemo<Option[]>(() => {
    if (!user || !task) return []
    const all = [{ value: user.id, label: `${user.name} (Me)${user.department ? ` - ${user.department}` : ''}` }, ...task.directReportUsers.map((p) => ({ value: p.id, label: label(p) }))]
    return all.filter((o, i) => all.findIndex((x) => x.value === o.value) === i)
  }, [task, user])
  const candidates = useMemo<Option[]>(() => (task?.candidateUsers ?? []).map((p) => ({ value: p.id, label: label(p) })), [task])

  if (!task) return null
  const locked = !task.editable || Boolean(task.evaluateesSubmittedAt)
  const primary = task.evaluateeSelections.filter((s) => s.type === 'PRIMARY')
  const update = (row: SelectionRow, next: Partial<SelectionRow>) => setRequests((cur) => cur.map((r) => (r === row ? { ...r, ...next } : r)))

  async function save(submit: boolean) {
    if (!task) return
    if (submit && requests.length === 0) {
      toast.error('Add at least one evaluator change request before submitting')
      return
    }
    const selections = [...primary, ...requests].map((s) => ({ type: s.type, evaluateeId: s.evaluateeId, suggestedEvaluatorId: s.suggestedEvaluatorId || undefined }))
    setSaving(submit ? 'submit' : 'draft')
    try {
      const response = await fetch(submit ? '/api/pre-evaluation/evaluatees/submit' : '/api/pre-evaluation/evaluatees', {
        method: submit ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Failed to save evaluator change requests')
        return
      }
      toast.success(submit ? 'Evaluator change requests submitted to HR' : 'Draft saved')
      await load()
    } catch {
      toast.error('Failed to save evaluator change requests')
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Evaluator Change Requests</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Suggest peer or cross-department evaluator changes for your team members or yourself. HR reviews these requests before they affect the quarter.
            </p>
          </div>
          {task.evaluateesSubmittedAt && <Badge className="border-0 bg-emerald-500/10 text-emerald-600">Submitted to HR</Badge>}
        </div>

        <div className="rounded-xl border bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-medium text-foreground">Reporting Team Members</h3>
              <p className="text-sm text-muted-foreground">This list comes from your current team lead mappings.</p>
            </div>
            <Badge variant="secondary">{primary.length}</Badge>
          </div>
          {primary.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No reporting team members are configured for you right now.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {primary.map((s) => <Badge key={s.id || s.evaluateeId} variant="secondary" className="bg-background text-foreground">{s.evaluatee?.name || 'Team member'}</Badge>)}
            </div>
          )}
        </div>

        {(Object.keys(SECTIONS) as RequestType[]).map((type) => {
          const section = SECTIONS[type]
          const rows = requests.filter((r) => r.type === type)
          return (
            <div key={type} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground">{section.title}</h3>
                  <p className="text-sm text-muted-foreground">{section.hint}</p>
                </div>
                {!locked && (
                  <Button variant="outline" size="sm" onClick={() => setRequests((cur) => [...cur, { type, evaluateeId: '', suggestedEvaluatorId: '' }])}>
                    <Plus className="h-4 w-4" /> {section.add}
                  </Button>
                )}
              </div>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{section.empty}</p>
              ) : (
                <div className="space-y-3">
                  {rows.map((row, index) => (
                    <div key={row.id || `${type}-${index}`} className="space-y-3 rounded-lg border p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>For</Label>
                          <PersonSelect value={row.evaluateeId} placeholder="Select yourself or a team member" options={targets} disabled={locked} onChange={(v) => update(row, { evaluateeId: v })} />
                        </div>
                        <div className="space-y-2">
                          <Label>{section.evaluatorLabel}</Label>
                          <PersonSelect value={row.suggestedEvaluatorId ?? ''} placeholder="Select evaluator" options={candidates} disabled={locked} onChange={(v) => update(row, { suggestedEvaluatorId: v })} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{row.reviewStatus || 'PENDING'}</Badge>
                        {!locked && (
                          <Button variant="ghost" size="sm" onClick={() => setRequests((cur) => cur.filter((r) => r !== row))}>
                            <Trash2 className="h-4 w-4" /> Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {task.evaluateesSubmittedAt ? (
          <p className="text-sm text-muted-foreground">
            Your evaluator change requests were submitted on {new Date(task.evaluateesSubmittedAt).toLocaleString()}. HR will review them from the admin queue.
          </p>
        ) : (
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => void save(false)} disabled={!task.editable || saving !== null}>
              <Save className="h-4 w-4" /> {saving === 'draft' ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button onClick={() => void save(true)} disabled={!task.editable || saving !== null || requests.length === 0}>
              <Send className="h-4 w-4" /> {saving === 'submit' ? 'Submitting...' : 'Submit to HR'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
