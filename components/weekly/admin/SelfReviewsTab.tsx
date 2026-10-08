'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { AdminSelfReviewRow } from '@/lib/weekly/service/self-review'
import type { PersonRef } from '@/lib/weekly/view-types'
import { cn } from '@/lib/utils'
import { errorMessage, weeklyRequest } from '../weekly-api'

interface Data { months: Array<{ month: number; title: string; monthName: string; releaseWeek: number | null }>; rows: AdminSelfReviewRow[]; missing: PersonRef[] }

/** HR's view of the round's monthly self-evaluations (UX spec, section 12): by month and department, with read status. */
export function SelfReviewsTab({ periodId }: { periodId: string }) {
  const [month, setMonth] = useState<number | null>(null)
  const [department, setDepartment] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [open, setOpen] = useState<string | null>(null)

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
      <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button></div>
    </div>
  )
}
