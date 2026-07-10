'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SelfEvaluationAnswerView } from '@/components/self-evaluation/SelfEvaluationAnswerView'
import {
  SELF_EVAL_PROGRESS_LABELS,
  type SelfEvaluationProgressStatus,
  type SelfEvaluationProgressSummary,
} from '@/lib/self-evaluation-progress'
import type { SelfEvaluationAnswer } from '@/lib/self-evaluation'
import { Bell, CheckCircle2, Clock, Circle, Eye } from 'lucide-react'

interface PeriodOption {
  id: string
  name: string
  isActive: boolean
}

interface ProgressItem {
  employeeId: string
  name: string
  department: string | null
  position: string | null
  role: string
  progressStatus: SelfEvaluationProgressStatus
  submittedAt: string | null
}

type Filter = 'ALL' | SelfEvaluationProgressStatus

const EMPTY_SUMMARY: SelfEvaluationProgressSummary = { sent: 0, submitted: 0, inProgress: 0, notStarted: 0 }

const STATUS_STYLE: Record<SelfEvaluationProgressStatus, { badge: string; Icon: typeof CheckCircle2 }> = {
  SUBMITTED: { badge: 'bg-emerald-500/15 text-emerald-700 border-emerald-300', Icon: CheckCircle2 },
  IN_PROGRESS: { badge: 'bg-amber-500/15 text-amber-700 border-amber-300', Icon: Clock },
  NOT_STARTED: { badge: 'bg-slate-500/15 text-slate-600 border-slate-300', Icon: Circle },
}

function timeAgo(value: string | null): string {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return 'just now'
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  periods: PeriodOption[]
}

export function SelfEvaluationProgressPanel({ periods }: Props) {
  const [periodId, setPeriodId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ProgressItem[]>([])
  const [summary, setSummary] = useState<SelfEvaluationProgressSummary>(EMPTY_SUMMARY)
  const [filter, setFilter] = useState<Filter>('ALL')

  const [reminding, setReminding] = useState(false)
  const [confirmRemind, setConfirmRemind] = useState(false)

  // View modal
  const [viewing, setViewing] = useState<ProgressItem | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewAnswers, setViewAnswers] = useState<SelfEvaluationAnswer[] | null>(null)

  useEffect(() => {
    if (periodId) return
    const active = periods.find((p) => p.isActive) || periods[0]
    if (active) setPeriodId(active.id)
  }, [periods, periodId])

  useEffect(() => {
    if (periodId) loadProgress(periodId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId])

  async function loadProgress(id: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/self-evaluation/progress?periodId=${id}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to load progress')
        setItems([])
        setSummary(EMPTY_SUMMARY)
        return
      }
      setItems(data.items || [])
      setSummary(data.summary || EMPTY_SUMMARY)
    } catch {
      toast.error('Failed to load progress')
    } finally {
      setLoading(false)
    }
  }

  const pendingCount = summary.inProgress + summary.notStarted

  const filtered = useMemo(() => {
    if (filter === 'ALL') return items
    return items.filter((i) => i.progressStatus === filter)
  }, [items, filter])

  const openView = async (item: ProgressItem) => {
    setViewing(item)
    setViewAnswers(null)
    setViewLoading(true)
    try {
      const res = await fetch(
        `/api/admin/self-evaluation/response?periodId=${periodId}&employeeId=${item.employeeId}`,
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to load response')
        setViewing(null)
        return
      }
      setViewAnswers((data.answers as SelfEvaluationAnswer[]) || [])
    } catch {
      toast.error('Failed to load response')
      setViewing(null)
    } finally {
      setViewLoading(false)
    }
  }

  const remindPending = async () => {
    setConfirmRemind(false)
    setReminding(true)
    try {
      const res = await fetch('/api/admin/self-evaluation/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to send reminders')
        return
      }
      toast.success(
        `Reminded ${data.reminded}` + (data.skippedNoEmail ? `, skipped ${data.skippedNoEmail} without email` : ''),
      )
      loadProgress(periodId)
    } catch {
      toast.error('Failed to send reminders')
    } finally {
      setReminding(false)
    }
  }

  const pct = summary.sent > 0 ? Math.round((summary.submitted / summary.sent) * 100) : 0

  const filterChips: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'ALL', label: 'All', count: summary.sent },
    { key: 'SUBMITTED', label: 'Submitted', count: summary.submitted },
    { key: 'IN_PROGRESS', label: 'In progress', count: summary.inProgress },
    { key: 'NOT_STARTED', label: 'Not started', count: summary.notStarted },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <Label>Evaluation period</Label>
        <Select value={periodId} onValueChange={setPeriodId}>
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

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading progress…</p>
      ) : summary.sent === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No self-evaluations have been sent for this period yet. Use the “Send to employees” tab to send them.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium text-foreground">{summary.sent} sent</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" /> {summary.submitted} submitted
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <Clock className="w-4 h-4" /> {summary.inProgress} in progress
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    <Circle className="w-4 h-4" /> {summary.notStarted} not started
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmRemind(true)}
                  disabled={reminding || pendingCount === 0}
                >
                  <Bell className="w-4 h-4" />
                  {reminding ? 'Sending…' : `Remind ${pendingCount} pending`}
                </Button>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{pct}% submitted</p>
            </CardContent>
          </Card>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  filter === chip.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {chip.label} · {chip.count}
              </button>
            ))}
          </div>

          {/* List */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {filtered.map((item) => {
                  const style = STATUS_STYLE[item.progressStatus]
                  return (
                    <div key={item.employeeId} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[item.position, item.department].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      {item.progressStatus === 'SUBMITTED' && item.submittedAt && (
                        <span className="hidden sm:inline text-xs text-muted-foreground">
                          {timeAgo(item.submittedAt)}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${style.badge}`}
                      >
                        <style.Icon className="w-3 h-3" />
                        {SELF_EVAL_PROGRESS_LABELS[item.progressStatus]}
                      </span>
                      {item.progressStatus === 'SUBMITTED' ? (
                        <Button variant="ghost" size="sm" onClick={() => openView(item)} title="View response">
                          <Eye className="w-4 h-4" />
                        </Button>
                      ) : (
                        <span className="w-9" />
                      )}
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No employees in this view.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Response modal */}
      <Modal
        isOpen={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.name} — Self-Evaluation` : 'Self-Evaluation'}
      >
        {viewLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading response…</p>
        ) : (
          <SelfEvaluationAnswerView answers={viewAnswers || []} />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmRemind}
        onClose={() => setConfirmRemind(false)}
        onConfirm={remindPending}
        title="Remind pending employees"
        message={`Email a reminder to the ${pendingCount} employee(s) who have not submitted their self-evaluation for this period?`}
        confirmText="Send reminders"
      />
    </div>
  )
}
