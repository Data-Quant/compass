'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { AdminSelfReviewMonth, AdminSelfReviewRow } from '@/lib/weekly/service/self-review'
import type { PersonRef } from '@/lib/weekly/view-types'
import { cn } from '@/lib/utils'
import { errorMessage, weeklyRequest } from '../weekly-api'

interface Data { months: AdminSelfReviewMonth[]; rows: AdminSelfReviewRow[]; missing: PersonRef[] }

/** HR's view of the round's monthly self-evaluations (UX spec, section 12): by month and department, with read status. */
export function SelfReviewsTab({ periodId }: { periodId: string }) {
  const [month, setMonth] = useState<number | null>(null)
  const [department, setDepartment] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminSelfReviewMonth | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ periodId, ...(month ? { month: String(month) } : {}), ...(department.trim() ? { department: department.trim() } : {}) })
    try {
      setData(await weeklyRequest<Data>(`/api/admin/weekly/self-reviews?${params.toString()}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the self-evaluations'))
    }
  }, [periodId, month, department])
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250)
    return () => clearTimeout(timer)
  }, [load])

  const flagged = useMemo(() => (data?.rows ?? []).filter((r) => r.reads.some((x) => x.overdue)).length, [data])
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Once a month, in the last week of the month, everyone answers one question. It goes to their leads and to you the moment it is sent, and is never scored. A lead who has not read one after 5 working days is reminded once and flagged here.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Month" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {[{ month: null as number | null, label: 'All months' }, ...data.months.map((m) => ({ month: m.month as number | null, label: `${m.monthName}: ${m.title}` }))].map((m) => (
            <button key={m.label} role="tab" type="button" aria-selected={month === m.month} onClick={() => setMonth(m.month)}
              className={cn('rounded-md px-3 py-1.5 text-sm', month === m.month ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{m.label}</button>
          ))}
        </div>
        <Input className="h-9 w-56" placeholder="Filter by department" aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">{data.rows.length} sent</Badge>
        {flagged > 0 && <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700 dark:text-amber-400"><Clock className="h-3 w-3" /> {flagged} unread by a lead after 5 working days</Badge>}
        {data.missing.length > 0 && <Badge variant="outline">{data.missing.length} not sent yet</Badge>}
      </div>

      {data.rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No self-evaluations yet.</p> : (
        <ul className="divide-y rounded-lg border">
          {data.rows.map((r) => (
            <li key={r.id} className="p-3">
              <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                <span className="text-sm"><span className="font-medium">{r.person.name}</span><span className="text-muted-foreground"> · {r.department ?? 'No department'} · {r.monthName}</span></span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs">
                  {r.wantsDiscussion && <Badge variant="secondary">Wants to discuss</Badge>}
                  {r.reads.length === 0 ? <Badge variant="outline">No lead: HR only</Badge> : r.reads.map((x) => (
                    <Badge key={x.lead.id} variant="outline" className={cn(x.readAt && 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400', x.overdue && 'border-amber-400 text-amber-700 dark:text-amber-400')}>
                      {x.lead.name}: {x.readAt ? 'read' : x.overdue ? 'unread, reminded' : 'unread'}
                    </Badge>
                  ))}
                  <span className="text-muted-foreground">{formatKarachiDate(r.submittedAt)}</span>
                </span>
              </button>
              {open === r.id && (
                <div className="mt-3 space-y-2 text-sm">
                  {r.parts.map((part, i) => (
                    <div key={i}><p className="text-xs text-muted-foreground">{part}</p><p className="whitespace-pre-wrap">{r.answers[i]}</p></div>
                  ))}
                  {r.reads.filter((x) => x.reply).map((x) => <p key={x.lead.id} className="rounded-md bg-muted p-2">{x.lead.name} replied: “{x.reply}”</p>)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.missing.length > 0 && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Not sent yet ({data.missing.length})</summary>
          <p className="mt-2 text-muted-foreground">{data.missing.map((p) => p.name).join(', ')}</p>
        </details>
      )}
      <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-medium">The three questions</summary>
        <ul className="mt-3 space-y-3">
          {data.months.map((m) => (
            <li key={m.month} className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{m.monthName} (week {m.releaseWeek ?? '–'}): {m.title}</p>
                <ul className="list-disc pl-5 text-muted-foreground">{m.parts.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
              {m.answered > 0 ? <Badge variant="outline">Answered by {m.answered}: fixed</Badge> : <Button size="sm" variant="outline" onClick={() => setEditing(m)}>Edit</Button>}
            </li>
          ))}
        </ul>
      </details>
      <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button></div>
      {editing && <QuestionEditor periodId={periodId} month={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load() }} />}
    </div>
  )
}

function QuestionEditor({ periodId, month, onClose, onSaved }: { periodId: string; month: AdminSelfReviewMonth; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(month.title)
  const [parts, setParts] = useState(month.parts)
  const [discuss, setDiscuss] = useState(month.discussOption)
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await weeklyRequest('/api/admin/weekly/self-reviews', { method: 'POST', body: { periodId, month: month.month, title, parts, discussOption: discuss } })
      toast.success('Question saved')
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the question'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal isOpen onClose={onClose} title={`${month.monthName}'s self-evaluation question`}>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="sr-title">Title</Label><Input id="sr-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></div>
        {parts.map((p, i) => (
          <div key={i} className="space-y-1.5"><Label htmlFor={`sr-part-${i}`}>Part {i + 1}</Label><Input id={`sr-part-${i}`} value={p} maxLength={300} onChange={(e) => setParts(parts.map((x, j) => (j === i ? e.target.value : x)))} /></div>
        ))}
        <div className="flex items-center gap-2"><Checkbox id="sr-discuss" checked={discuss} onCheckedChange={(v) => setDiscuss(v === true)} /><Label htmlFor="sr-discuss" className="font-normal">Offer “I’d like to discuss this with my lead”</Label></div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !title.trim() || parts.some((p) => !p.trim())} onClick={() => void save()}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}
