'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/composed/EmptyState'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { UserAvatar } from '@/components/composed/UserAvatar'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ShieldAlert,
  Sparkles,
  Undo2,
  Users,
} from 'lucide-react'

interface PeriodOption {
  id: string
  name: string
  startDate: string
  endDate: string
  reviewStartDate: string
  isActive: boolean
  isLocked: boolean
  preEvaluationTriggeredAt: string | null
}

interface ReviewActor {
  id: string
  name: string
}

interface SelectionUser {
  id: string
  name: string
  department: string | null
  position: string | null
}

interface Selection {
  id: string
  type: 'PRIMARY' | 'PEER' | 'CROSS_DEPARTMENT'
  evaluateeId: string
  suggestedEvaluatorId: string | null
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewedAt: string | null
  reviewNote: string | null
  evaluatee: SelectionUser
  suggestedEvaluator: SelectionUser | null
  reviewedBy: ReviewActor | null
}

interface Prep {
  id: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'OVERRIDDEN'
  questionsSubmittedAt: string | null
  evaluateesSubmittedAt: string | null
  completedAt: string | null
  overdueAt: string | null
  overriddenAt: string | null
  overrideNote: string | null
  lastResetAt: string | null
  resetNote: string | null
  initialReminderSentAt: string | null
  sevenDayReminderSentAt: string | null
  oneDayReminderSentAt: string | null
  lead: {
    id: string
    name: string
    email: string | null
    department: string | null
    position: string | null
  }
  questions: Array<{
    id: string
    orderIndex: number
    questionText: string
  }>
  evaluateeSelections: Selection[]
  overriddenBy: ReviewActor | null
  resetBy: ReviewActor | null
}

interface PreEvaluationResponse {
  period: PeriodOption | null
  periods: PeriodOption[]
  preps: Prep[]
  summary: {
    total: number
    completed: number
    inProgress: number
    pending: number
    overdue: number
    overridden: number
    questionSubmissions: number
    evaluateeSubmissions: number
  } | null
}

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

const STATUS_BADGES: Record<Prep['status'], { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  COMPLETED: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  OVERDUE: { label: 'Overdue', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  OVERRIDDEN: { label: 'Overridden', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
}

const REVIEW_BADGES: Record<Selection['reviewStatus'], { label: string; className: string }> = {
  PENDING: { label: 'Pending Review', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  REJECTED: { label: 'Rejected', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not yet'
  return new Date(value).toLocaleString()
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString()
}

function isPreEvaluationWindowOpen(reviewStartDate: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const evaluationStart = new Date(reviewStartDate)
  evaluationStart.setHours(0, 0, 0, 0)
  return evaluationStart > today
}

export default function AdminPreEvaluationsPage() {
  const searchParams = useSearchParams()
  const [data, setData] = useState<PreEvaluationResponse | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [resendingAll, setResendingAll] = useState(false)
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null)
  const [prepNotes, setPrepNotes] = useState<Record<string, string>>({})
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  const loadData = async (periodId?: string) => {
    try {
      const query = periodId ? `?periodId=${periodId}` : ''
      const response = await fetch(`/api/admin/pre-evaluations${query}`)
      const nextData: PreEvaluationResponse = await response.json()
      if (!response.ok) {
        toast.error((nextData as { error?: string }).error || 'Failed to load pre-evaluation data')
        return
      }
      setData(nextData)
      if (nextData.period?.id) {
        setSelectedPeriodId(nextData.period.id)
      }
    } catch {
      toast.error('Failed to load pre-evaluation data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const periodId = searchParams.get('periodId') || undefined
    loadData(periodId)
  }, [searchParams])

  const handlePeriodChange = async (periodId: string) => {
    setSelectedPeriodId(periodId)
    setLoading(true)
    await loadData(periodId)
  }

  const handleTrigger = async (resendExisting = false) => {
    if (!selectedPeriodId) return
    setTriggering(true)
    try {
      const response = await fetch('/api/admin/pre-evaluations/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId: selectedPeriodId, resendExisting }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error(result.error || 'Failed to trigger pre-evaluation onboarding')
        return
      }
      toast.success(`Triggered ${result.prepCount} prep task(s); notified ${result.notified} lead(s)`)
      await loadData(selectedPeriodId)
    } catch {
      toast.error('Failed to trigger pre-evaluation onboarding')
    } finally {
      setTriggering(false)
    }
  }

  const handleResend = async (prepId?: string) => {
    if (!selectedPeriodId && !prepId) return
    prepId ? setActiveActionKey(`resend:${prepId}`) : setResendingAll(true)
    try {
      const response = await fetch('/api/admin/pre-evaluations/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          prepId
            ? { prepId, reminderType: 'MANUAL_RESEND' }
            : { periodId: selectedPeriodId, reminderType: 'MANUAL_RESEND' }
        ),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error(result.error || 'Failed to send reminders')
        return
      }
      toast.success(`Sent ${result.sent} reminder(s)`)
      await loadData(selectedPeriodId)
    } catch {
      toast.error('Failed to send reminders')
    } finally {
      prepId ? setActiveActionKey(null) : setResendingAll(false)
    }
  }

  const handleReset = async (prepId: string) => {
    setActiveActionKey(`reset:${prepId}`)
    try {
      const response = await fetch(`/api/admin/pre-evaluations/${prepId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: prepNotes[prepId]?.trim() || undefined }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error(result.error || 'Failed to reset prep')
        return
      }
      toast.success('Prep reopened for the lead')
      await loadData(selectedPeriodId)
    } catch {
      toast.error('Failed to reset prep')
    } finally {
      setActiveActionKey(null)
    }
  }

  const handleOverride = async (prepId: string) => {
    setActiveActionKey(`override:${prepId}`)
    try {
      const response = await fetch(`/api/admin/pre-evaluations/${prepId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: prepNotes[prepId]?.trim() || undefined }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error(result.error || 'Failed to override prep')
        return
      }
      toast.success('Overdue prep overridden')
      await loadData(selectedPeriodId)
    } catch {
      toast.error('Failed to override prep')
    } finally {
      setActiveActionKey(null)
    }
  }

  const handleReview = async (selectionId: string, reviewStatus: 'APPROVED' | 'REJECTED') => {
    setActiveActionKey(`review:${selectionId}:${reviewStatus}`)
    try {
      const response = await fetch(`/api/admin/pre-evaluations/selections/${selectionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewStatus,
          reviewNote: reviewNotes[selectionId]?.trim() || undefined,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error(result.error || 'Failed to review selection')
        return
      }
      toast.success(`Selection ${reviewStatus === 'APPROVED' ? 'approved' : 'rejected'}`)
      await loadData(selectedPeriodId)
    } catch {
      toast.error('Failed to review selection')
    } finally {
      setActiveActionKey(null)
    }
  }

  const additionalEvaluatorSelections = useMemo(
    () =>
      (data?.preps || []).flatMap((prep) =>
        prep.evaluateeSelections
          .filter((selection) => selection.type !== 'PRIMARY')
          .map((selection) => ({ prep, selection }))
      ),
    [data]
  )

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading pre-evaluation onboarding..." />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title="Pre-evaluation data unavailable"
          description="The monitoring surface could not be loaded."
        />
      </div>
    )
  }

  const summary = data.summary
  const period = data.period
  const completionPercent = summary?.total ? Math.round((summary.completed / summary.total) * 100) : 0
  const canTriggerSelectedPeriod = period ? isPreEvaluationWindowOpen(period.reviewStartDate) : false

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
              Pre-Evaluation Onboarding
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor team lead submissions, review additional evaluator requests, and trigger the pre-cycle flow.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={selectedPeriodId} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {data.periods.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => handleResend()}
              disabled={!selectedPeriodId || resendingAll || !canTriggerSelectedPeriod}
            >
              <Bell className="h-4 w-4" />
              {resendingAll ? 'Sending...' : 'Resend Outstanding'}
            </Button>
            <Button
              onClick={() => handleTrigger(false)}
              disabled={!selectedPeriodId || triggering || !canTriggerSelectedPeriod}
            >
              <Sparkles className="h-4 w-4" />
              {triggering ? 'Triggering...' : 'Trigger Flow'}
            </Button>
          </div>
        </div>
      </motion.div>

      {period && (
        <Card className={period.preEvaluationTriggeredAt ? 'border-blue-500/20' : 'border-amber-500/20'}>
          <CardContent className="p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <p className="font-medium text-foreground">{period.name}</p>
                {period.preEvaluationTriggeredAt ? (
                  <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0">Triggered</Badge>
                ) : (
                  <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-0">Not triggered</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Quarter runs {formatDate(period.startDate)} to {formatDate(period.endDate)}. Evaluations start on {formatDate(period.reviewStartDate)}. {period.preEvaluationTriggeredAt
                  ? canTriggerSelectedPeriod
                    ? `Initial trigger sent ${formatDateTime(period.preEvaluationTriggeredAt)}.`
                    : 'Evaluations have already started for this period, so this triggered prep will not surface as a current lead task.'
                  : canTriggerSelectedPeriod
                    ? 'HR can manually trigger the pre-cycle onboarding now.'
                    : 'Evaluations have already started for this period, so pre-cycle onboarding cannot be triggered.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" asChild>
                <Link href="/admin/periods">Review Periods</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/mappings">
                  Apply Approved Mappings <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-6 gap-4"
        >
          {[
            { label: 'Leads', value: summary.total, tone: 'text-foreground' },
            { label: 'Completed', value: summary.completed, tone: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'In Progress', value: summary.inProgress, tone: 'text-blue-600 dark:text-blue-400' },
            { label: 'Pending', value: summary.pending, tone: 'text-slate-600 dark:text-slate-300' },
            { label: 'Overdue', value: summary.overdue, tone: 'text-amber-700 dark:text-amber-400' },
            { label: 'Overridden', value: summary.overridden, tone: 'text-violet-600 dark:text-violet-400' },
          ].map((item) => (
            <motion.div key={item.label} variants={stagger.item}>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className={`mt-2 text-3xl font-semibold ${item.tone}`}>{item.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {summary && summary.total > 0 && (
        <Card>
          <CardContent className="p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-medium text-foreground">Overall completion</p>
              <p className="text-sm text-muted-foreground">
                {summary.completed} of {summary.total} team leads have submitted both required sections.
              </p>
            </div>
            <div className="flex items-center gap-3 min-w-[280px]">
              <Progress value={completionPercent} className="flex-1 h-2.5" />
              <span className="text-sm font-medium text-foreground w-12 text-right">{completionPercent}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {data.preps.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No pre-evaluation tasks yet"
          description={period ? 'This period has no team lead prep records yet. Trigger the flow when ready.' : 'Create or select an evaluation period to get started.'}
          action={
            period ? (
              <Button onClick={() => handleTrigger(false)} disabled={triggering}>
                <Sparkles className="h-4 w-4" /> Trigger Flow
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Tabs defaultValue="lead-preps" className="space-y-4">
          <TabsList>
            <TabsTrigger value="lead-preps">Lead Submissions</TabsTrigger>
            <TabsTrigger value="cross-review">Additional Evaluator Review</TabsTrigger>
          </TabsList>

          <TabsContent value="lead-preps" className="space-y-4">
            {data.preps.map((prep) => {
              const badge = STATUS_BADGES[prep.status]
              const primarySelections = prep.evaluateeSelections.filter((selection) => selection.type === 'PRIMARY')
              const peerSelections = prep.evaluateeSelections.filter((selection) => selection.type === 'PEER')
              const crossSelections = prep.evaluateeSelections.filter((selection) => selection.type === 'CROSS_DEPARTMENT')
              const progressCount = Number(Boolean(prep.questionsSubmittedAt)) + Number(Boolean(prep.evaluateesSubmittedAt))
              const progressValue = Math.round((progressCount / 2) * 100)

              return (
                <Card key={prep.id}>
                  <CardContent className="p-6 space-y-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex items-start gap-3">
                        <UserAvatar name={prep.lead.name} size="sm" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">{prep.lead.name}</p>
                            <Badge className={badge.className}>{badge.label}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {[prep.lead.position, prep.lead.department, prep.lead.email].filter(Boolean).join(' · ') || 'Team lead'}
                          </p>
                          <div className="mt-3 flex items-center gap-3 max-w-md">
                            <Progress value={progressValue} className="flex-1 h-2" />
                            <span className="text-xs text-muted-foreground">{progressCount}/2 sections</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 xl:items-end">
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResend(prep.id)}
                            disabled={activeActionKey === `resend:${prep.id}`}
                          >
                            <Bell className="h-4 w-4" />
                            {activeActionKey === `resend:${prep.id}` ? 'Sending...' : 'Resend'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReset(prep.id)}
                            disabled={activeActionKey === `reset:${prep.id}`}
                          >
                            <Undo2 className="h-4 w-4" />
                            {activeActionKey === `reset:${prep.id}` ? 'Resetting...' : 'Reset'}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleOverride(prep.id)}
                            disabled={activeActionKey === `override:${prep.id}`}
                          >
                            <ShieldAlert className="h-4 w-4" />
                            {activeActionKey === `override:${prep.id}` ? 'Overriding...' : 'Override'}
                          </Button>
                        </div>
                        <Input
                          value={prepNotes[prep.id] || ''}
                          onChange={(event) =>
                            setPrepNotes((current) => ({
                              ...current,
                              [prep.id]: event.target.value,
                            }))
                          }
                          placeholder="Optional reset / override note"
                          className="xl:w-[280px]"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-4 text-sm">
                      <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground">Questions submitted</p>
                        <p className="mt-1 font-medium text-foreground">{formatDateTime(prep.questionsSubmittedAt)}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground">Evaluatees submitted</p>
                        <p className="mt-1 font-medium text-foreground">{formatDateTime(prep.evaluateesSubmittedAt)}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground">Initial reminder</p>
                        <p className="mt-1 font-medium text-foreground">{formatDateTime(prep.initialReminderSentAt)}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-muted-foreground">Last reset / override</p>
                        <p className="mt-1 font-medium text-foreground">
                          {prep.lastResetAt ? formatDateTime(prep.lastResetAt) : prep.overriddenAt ? formatDateTime(prep.overriddenAt) : 'None'}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                      <div className="space-y-3">
                        <div>
                          <h3 className="font-medium text-foreground">Submitted questions</h3>
                          <p className="text-sm text-muted-foreground">
                            These will drive team lead and approved cross-department evaluations for this period.
                          </p>
                        </div>
                        {prep.questions.length > 0 ? (
                          <div className="space-y-2">
                            {prep.questions.map((question) => (
                              <div key={question.id} className="rounded-lg border bg-muted/30 px-4 py-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Question {question.orderIndex}</p>
                                <p className="mt-1 text-sm text-foreground">{question.questionText}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No questions submitted yet.</p>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h3 className="font-medium text-foreground">Evaluatee intake</h3>
                          <p className="text-sm text-muted-foreground">
                            Primary rows are reference only. Peer and cross-department rows need HR review.
                          </p>
                        </div>

                        <div className="rounded-lg border p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-foreground">Primary evaluatees</p>
                            <Badge variant="secondary">{primarySelections.length}</Badge>
                          </div>
                          {primarySelections.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {primarySelections.map((selection) => (
                                <Badge key={selection.id} variant="secondary" className="bg-muted text-foreground">
                                  {selection.evaluatee.name}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No primary evaluatees submitted.</p>
                          )}
                        </div>

                        <div className="rounded-lg border p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-foreground">Peer evaluator requests</p>
                            <Badge variant="secondary">{peerSelections.length}</Badge>
                          </div>
                          {peerSelections.length > 0 ? (
                            <div className="space-y-3">
                              {peerSelections.map((selection) => {
                                const reviewBadge = REVIEW_BADGES[selection.reviewStatus]
                                return (
                                  <div key={selection.id} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-medium text-foreground">{selection.evaluatee.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          Requested peer evaluator: {selection.suggestedEvaluator?.name || 'Not set'}
                                        </p>
                                      </div>
                                      <Badge className={reviewBadge.className}>{reviewBadge.label}</Badge>
                                    </div>
                                    {selection.reviewNote && (
                                      <p className="text-xs text-muted-foreground">Note: {selection.reviewNote}</p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No peer requests submitted.</p>
                          )}
                        </div>

                        <div className="rounded-lg border p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-foreground">Cross-department suggestions</p>
                            <Badge variant="secondary">{crossSelections.length}</Badge>
                          </div>
                          {crossSelections.length > 0 ? (
                            <div className="space-y-3">
                              {crossSelections.map((selection) => {
                                const reviewBadge = REVIEW_BADGES[selection.reviewStatus]
                                return (
                                  <div key={selection.id} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-medium text-foreground">{selection.evaluatee.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          Suggested evaluator: {selection.suggestedEvaluator?.name || 'Not set'}
                                        </p>
                                      </div>
                                      <Badge className={reviewBadge.className}>{reviewBadge.label}</Badge>
                                    </div>
                                    {selection.reviewNote && (
                                      <p className="text-xs text-muted-foreground">Note: {selection.reviewNote}</p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No cross-department suggestions submitted.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </TabsContent>

          <TabsContent value="cross-review" className="space-y-4">
            {additionalEvaluatorSelections.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-12 w-12" />}
                title="No additional evaluator requests"
                description="Once leads submit peer or cross-department evaluator requests, they will appear here for HR review."
              />
            ) : (
              additionalEvaluatorSelections.map(({ prep, selection }) => {
                const reviewBadge = REVIEW_BADGES[selection.reviewStatus]
                const approveKey = `review:${selection.id}:APPROVED`
                const rejectKey = `review:${selection.id}:REJECTED`

                return (
                  <Card key={selection.id}>
                    <CardContent className="p-5 space-y-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">{selection.evaluatee.name}</p>
                            <Badge className={reviewBadge.className}>{reviewBadge.label}</Badge>
                            <Badge variant="secondary">
                              {selection.type === 'PEER' ? 'Peer' : 'Cross-Department'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {selection.type === 'PEER' ? 'Requested peer evaluator' : 'Suggested evaluator'}: {selection.suggestedEvaluator?.name || 'Not provided'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Source lead: {prep.lead.name}
                            {selection.type === 'CROSS_DEPARTMENT'
                              ? ` · Question set for ${period?.name || 'this period'}`
                              : ` · Applies only to ${period?.name || 'this period'}`}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground lg:text-right">
                          <p>Lead submission status: {STATUS_BADGES[prep.status].label}</p>
                          <p>Reviewed: {formatDateTime(selection.reviewedAt)}</p>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                        <Input
                          value={reviewNotes[selection.id] || selection.reviewNote || ''}
                          onChange={(event) =>
                            setReviewNotes((current) => ({
                              ...current,
                              [selection.id]: event.target.value,
                            }))
                          }
                          placeholder="Optional review note"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => handleReview(selection.id, 'REJECTED')}
                            disabled={activeActionKey === approveKey || activeActionKey === rejectKey}
                          >
                            {activeActionKey === rejectKey ? 'Rejecting...' : 'Reject'}
                          </Button>
                          <Button
                            onClick={() => handleReview(selection.id, 'APPROVED')}
                            disabled={activeActionKey === approveKey || activeActionKey === rejectKey}
                          >
                            {activeActionKey === approveKey ? 'Approving...' : 'Approve'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
