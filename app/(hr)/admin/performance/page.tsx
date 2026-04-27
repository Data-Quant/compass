'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatsCard } from '@/components/composed/StatsCard'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { isThreeEDepartment } from '@/lib/company-branding'
import {
  AlertCircle,
  Users,
  Calendar,
  FileText,
  Mail,
  Download,
  CheckCircle2,
  Clock,
  Eye,
  ArrowRight,
  ClipboardList,
  ArrowUpDown,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Undo2,
  UserPlus,
} from 'lucide-react'
import { RATING_LABELS, RELATIONSHIP_TYPE_LABELS, type RelationshipType } from '@/types'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

type EmployeeRow = {
  id: string
  name: string
  department: string | null
  position: string | null
  inboundCompletionRate?: number
  completionRate?: number
  inboundCompletedQuestions?: number
  completedEvaluations?: number
  inboundTotalQuestions?: number
  totalNeeded?: number
  outboundCompletionRate?: number
  outboundCompletedQuestions?: number
  outboundTotalQuestions?: number
  reportEligible?: boolean
  reportGenerated?: boolean
  reportPersisted?: boolean
  reportStatus?: 'READY' | 'PENDING' | 'NOT_APPLICABLE'
}

type ActivityResponse = {
  key: string
  questionText: string
  questionType: 'RATING' | 'TEXT'
  questionSource: 'GLOBAL' | 'LEAD'
  ratingValue: number | null
  textResponse: string | null
  submittedAt: string | null
  updatedAt: string | null
  isArchived: boolean
}

type ActivityAssignment = {
  id: string
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  source: string
  partner?: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
  questionsCount: number
  savedResponseCount: number
  submittedResponseCount: number
  completedResponseCount: number
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CLOSED_BY_POOL'
  isClosedByPool: boolean
  submittedAt: string | null
  lastSavedAt: string | null
  questionWarning: string | null
  responses: ActivityResponse[]
}

type PeriodOverride = {
  id: string
  action: 'ADD' | 'REMOVE'
  relationshipType: RelationshipType
  note: string | null
  createdAt: string
  createdBy: {
    id: string
    name: string
  } | null
  direction: 'incoming' | 'outgoing'
  evaluator: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
  evaluatee: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
}

type UserOption = {
  id: string
  name: string
  department: string | null
  position: string | null
}

type PerformanceDetail = {
  period: {
    id: string
    name: string
    startDate: string
    endDate: string
    reviewStartDate: string
    isActive: boolean
  }
  employee: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
  outgoing: ActivityAssignment[]
  incoming: ActivityAssignment[]
  periodOverrides: PeriodOverride[]
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null
  return new Date(value).toLocaleString()
}

function getActivityStatusBadge(status: ActivityAssignment['status']) {
  switch (status) {
    case 'SUBMITTED':
      return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
    case 'IN_PROGRESS':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    case 'CLOSED_BY_POOL':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function getActivityStatusLabel(status: ActivityAssignment['status']) {
  switch (status) {
    case 'SUBMITTED':
      return 'Submitted'
    case 'IN_PROGRESS':
      return 'Draft Saved'
    case 'CLOSED_BY_POOL':
      return 'Closed by HR Pool'
    default:
      return 'Not Started'
  }
}

function getRelationshipTypeLabel(type: RelationshipType) {
  return RELATIONSHIP_TYPE_LABELS[type] || type.replaceAll('_', ' ')
}

function getRatingLabel(value: number | null) {
  if (value === null) return null
  if (RATING_LABELS[value]) return RATING_LABELS[value].label
  if (value > 1 && value < 4) {
    const lower = Math.floor(value)
    return RATING_LABELS[lower]?.label || 'Unlabeled rating'
  }
  return 'Unlabeled rating'
}

function formatRatingValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function ActivityList({
  items,
  emptyState,
  direction,
  onExcludeForPeriod,
  excludeBusyKey,
  onResetEvaluation,
  resetBusyKey,
}: {
  items: ActivityAssignment[]
  emptyState: string
  direction: 'incoming' | 'outgoing'
  onExcludeForPeriod?: (item: ActivityAssignment) => void
  excludeBusyKey?: string | null
  onResetEvaluation?: (item: ActivityAssignment) => void
  resetBusyKey?: string | null
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
        {emptyState}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const partnerLabel = direction === 'outgoing' ? 'Evaluatee' : 'Evaluator'
        const savedSummary =
          item.status === 'SUBMITTED' || item.status === 'CLOSED_BY_POOL'
            ? `${item.completedResponseCount}/${item.questionsCount} completed`
            : `${item.savedResponseCount}/${item.questionsCount} saved`
        const canReset =
          item.status === 'CLOSED_BY_POOL' ||
          item.savedResponseCount > 0 ||
          item.submittedResponseCount > 0

        return (
          <div key={item.id} className="rounded-2xl border border-border/70 bg-card/60 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {partnerLabel}
                  </span>
                  <Badge variant="outline" className="border-border/70">
                    {getRelationshipTypeLabel(item.relationshipType)}
                  </Badge>
                  <Badge variant="outline" className={getActivityStatusBadge(item.status)}>
                    {getActivityStatusLabel(item.status)}
                  </Badge>
                </div>
                <div>
                  <p className="font-medium text-foreground">{item.partner?.name || 'Unknown user'}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.partner?.position || 'No role info'}
                    {item.partner?.department ? ` | ${item.partner.department}` : ''}
                  </p>
                </div>
              </div>
              <div className="space-y-2 lg:text-right">
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{savedSummary}</p>
                  {item.submittedAt ? <p>Submitted: {formatDateTime(item.submittedAt)}</p> : null}
                  {!item.submittedAt && item.lastSavedAt ? (
                    <p>Last saved: {formatDateTime(item.lastSavedAt)}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {onResetEvaluation && canReset ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onResetEvaluation(item)}
                      disabled={resetBusyKey === item.id}
                      className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      {resetBusyKey === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Reset Answers
                    </Button>
                  ) : null}
                  {onExcludeForPeriod && item.source !== 'PERIOD_OVERRIDE' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExcludeForPeriod(item)}
                      disabled={excludeBusyKey === item.id}
                      className="gap-2"
                    >
                      {excludeBusyKey === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5" />
                      )}
                      Exclude This Period
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            {item.questionWarning ? (
              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                {item.questionWarning}
              </div>
            ) : null}

            {item.responses.length > 0 ? (
              <details className="mt-4 rounded-xl border border-border/60 bg-background/40">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
                  View saved answers ({item.responses.length})
                </summary>
                <div className="border-t border-border/60 px-4 py-3 space-y-3">
                  {item.responses.map((response) => (
                    <div key={response.key} className="rounded-lg border border-border/60 bg-card/80 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{response.questionText}</p>
                        <Badge variant="outline" className="border-border/60">
                          {response.questionType === 'RATING' ? 'Rating' : 'Text'}
                        </Badge>
                        {response.questionSource === 'LEAD' ? (
                          <Badge variant="outline" className="border-purple-500/20 text-purple-500">
                            Lead Question
                          </Badge>
                        ) : null}
                        {response.isArchived ? (
                          <Badge variant="outline" className="border-amber-500/20 text-amber-500">
                            Archived
                          </Badge>
                        ) : null}
                      </div>
                      {response.ratingValue !== null ? (
                        <p className="mt-2 text-sm text-foreground">
                          <span className="font-medium">
                            {formatRatingValue(response.ratingValue)} - {getRatingLabel(response.ratingValue)}
                          </span>
                        </p>
                      ) : null}
                      {response.textResponse ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {response.textResponse}
                        </p>
                      ) : null}
                      {response.submittedAt || response.updatedAt ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {response.submittedAt
                            ? `Submitted ${formatDateTime(response.submittedAt)}`
                            : `Saved ${formatDateTime(response.updatedAt)}`}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                {item.status === 'CLOSED_BY_POOL'
                  ? 'This assignment was closed because another HR teammate completed the pooled HR evaluation.'
                  : 'No saved answers yet for this assignment.'}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ProgressCell({
  value,
  completed,
  total,
}: {
  value: number
  completed: number
  total: number
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <Progress value={value} className="w-24 h-1.5" />
        <span className="text-sm font-medium text-foreground w-10">{value}%</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {completed}/{total} questions completed
      </p>
    </div>
  )
}

export default function AdminPerformanceOverviewPage() {
  const user = useLayoutUser()
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [preEvaluationData, setPreEvaluationData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [nameSortDirection, setNameSortDirection] = useState<'asc' | 'desc'>('asc')
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null)
  const [detailData, setDetailData] = useState<PerformanceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [directoryUsers, setDirectoryUsers] = useState<UserOption[]>([])
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [overrideBusyKey, setOverrideBusyKey] = useState<string | null>(null)
  const [resetBusyKey, setResetBusyKey] = useState<string | null>(null)
  const [newOverrideEvaluatorId, setNewOverrideEvaluatorId] = useState('')
  const [newOverrideRelationshipType, setNewOverrideRelationshipType] =
    useState<RelationshipType>('TEAM_LEAD')
  const [newOverrideNote, setNewOverrideNote] = useState('')

  const sortedEmployees = useMemo(() => {
    const employees = [...((dashboardData?.employees || []) as EmployeeRow[])]
    employees.sort((left, right) => {
      const comparison = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      return nameSortDirection === 'asc' ? comparison : -comparison
    })
    return employees
  }, [dashboardData?.employees, nameSortDirection])

  const availableEvaluatorOptions = useMemo(() => {
    return directoryUsers.filter((candidate) => {
      if (!detailData) return false
      if (candidate.id === detailData.employee.id) return false
      if (isThreeEDepartment(candidate.department)) return false
      return true
    })
  }, [detailData, directoryUsers])

  useEffect(() => {
    if (user) {
      Promise.all([loadDashboard(), loadPreEvaluations()]).finally(() => setLoading(false))
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/admin/dashboard')
      const data = await response.json()
      setDashboardData(data)
    } catch {
      toast.error('Failed to load performance overview')
    }
  }

  const loadPreEvaluations = async () => {
    try {
      const res = await fetch('/api/admin/pre-evaluations')
      const data = await res.json()
      if (!data.error) {
        setPreEvaluationData(data)
      }
    } catch {
      // silent
    }
  }

  const loadDirectoryUsers = async () => {
    if (directoryLoading || directoryUsers.length > 0) {
      return
    }

    setDirectoryLoading(true)
    try {
      const response = await fetch('/api/users')
      const data = await response.json()
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to load user directory')
      }
      setDirectoryUsers((data.users || []) as UserOption[])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load user directory'
      toast.error(message)
    } finally {
      setDirectoryLoading(false)
    }
  }

  const loadEmployeeDetail = async (employeeId: string) => {
    const response = await fetch(
      `/api/admin/performance/${employeeId}?periodId=${dashboardData?.period?.id || ''}`
    )
    const data = await response.json()

    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to load employee evaluation activity')
    }

    return data as PerformanceDetail
  }

  const handleGenerateReports = async () => {
    if (!dashboardData?.period) return
    setGenerating(true)
    try {
      const employees = (dashboardData.employees || []).filter(
        (employee: EmployeeRow) => employee.reportEligible
      )
      let successCount = 0
      let errorCount = 0
      for (const employee of employees) {
        try {
          await fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeId: employee.id, periodId: dashboardData.period.id }),
          })
          successCount++
        } catch {
          errorCount++
        }
      }
      if (errorCount > 0) toast.warning(`Generated ${successCount} reports, ${errorCount} failed`)
      else toast.success(`Generated ${successCount} reports`)
      loadDashboard()
    } catch {
      toast.error('Failed to generate reports')
    } finally {
      setGenerating(false)
    }
  }

  const openEmployeeDetail = async (employee: EmployeeRow) => {
    setSelectedEmployee(employee)
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailError(null)
    setDetailData(null)
    setNewOverrideEvaluatorId('')
    setNewOverrideRelationshipType('TEAM_LEAD')
    setNewOverrideNote('')
    void loadDirectoryUsers()

    try {
      const data = await loadEmployeeDetail(employee.id)
      setDetailData(data)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load employee evaluation activity'
      setDetailError(message)
      setDetailData(null)
      toast.error(message)
    } finally {
      setDetailLoading(false)
    }
  }

  const refreshDetail = async () => {
    if (!selectedEmployee) return

    setDetailLoading(true)
    setDetailError(null)
    try {
      const data = await loadEmployeeDetail(selectedEmployee.id)
      setDetailData(data)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load employee evaluation activity'
      setDetailError(message)
      toast.error(message)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleExcludeAssignment = async (item: ActivityAssignment) => {
    if (!detailData) return

    setOverrideBusyKey(item.id)
    try {
      const response = await fetch('/api/admin/performance/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId: detailData.period.id,
          evaluatorId: item.evaluatorId,
          evaluateeId: item.evaluateeId,
          relationshipType: item.relationshipType,
          action: 'REMOVE',
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to exclude assignment for this period')
      }

      toast.success('Period-only exclusion saved')
      await Promise.all([refreshDetail(), loadDashboard()])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to exclude assignment for this period'
      toast.error(message)
    } finally {
      setOverrideBusyKey(null)
    }
  }

  const handleResetAssignment = async (item: ActivityAssignment) => {
    if (!detailData) return

    const confirmed = window.confirm(
      'Reset this evaluation? This removes saved and submitted answers for the selected period and clears cached reports so scores recalculate.'
    )
    if (!confirmed) return

    setResetBusyKey(item.id)
    try {
      const response = await fetch('/api/admin/performance/resets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId: detailData.period.id,
          evaluatorId: item.evaluatorId,
          evaluateeId: item.evaluateeId,
          relationshipType: item.relationshipType,
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to reset evaluation')
      }

      const deletedRows = Number(data.deletedEvaluationRows || 0)
      toast.success(
        deletedRows > 0
          ? `Evaluation reset (${deletedRows} answer${deletedRows === 1 ? '' : 's'} removed)`
          : 'Evaluation reset; no saved answers were found'
      )
      await Promise.all([refreshDetail(), loadDashboard()])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset evaluation'
      toast.error(message)
    } finally {
      setResetBusyKey(null)
    }
  }

  const handleAddIncomingOverride = async () => {
    if (!detailData || !newOverrideEvaluatorId) {
      toast.error('Select an evaluator first')
      return
    }

    const busyKey = `add:${newOverrideEvaluatorId}:${newOverrideRelationshipType}`
    setOverrideBusyKey(busyKey)
    try {
      const response = await fetch('/api/admin/performance/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId: detailData.period.id,
          evaluatorId: newOverrideEvaluatorId,
          evaluateeId: detailData.employee.id,
          relationshipType: newOverrideRelationshipType,
          action: 'ADD',
          note: newOverrideNote.trim() || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to add evaluator for this period')
      }

      setNewOverrideEvaluatorId('')
      setNewOverrideRelationshipType('TEAM_LEAD')
      setNewOverrideNote('')
      toast.success('Period-only evaluator added')
      await Promise.all([refreshDetail(), loadDashboard()])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to add evaluator for this period'
      toast.error(message)
    } finally {
      setOverrideBusyKey(null)
    }
  }

  const handleUndoOverride = async (overrideId: string) => {
    setOverrideBusyKey(`undo:${overrideId}`)
    try {
      const response = await fetch(`/api/admin/performance/overrides/${overrideId}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to undo period override')
      }

      toast.success('Period override removed')
      await Promise.all([refreshDetail(), loadDashboard()])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to undo period override'
      toast.error(message)
    } finally {
      setOverrideBusyKey(null)
    }
  }

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading performance overview..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          Performance Overview
        </h1>
        {dashboardData?.period && (
          <div className="flex items-center gap-2 text-muted-foreground mt-1">
            <Calendar className="w-4 h-4" />
            <span>{dashboardData.period.name}</span>
            <span className="text-border">|</span>
            <span className="text-sm">
              {new Date(dashboardData.period.startDate).toLocaleDateString()} - {new Date(dashboardData.period.endDate).toLocaleDateString()}
            </span>
          </div>
        )}
        <p className="text-muted-foreground mt-2">
          Review evaluation progress, pre-evaluation readiness, reports, and completion trends in one place.
        </p>
      </motion.div>

      {preEvaluationData?.period && preEvaluationData?.summary?.total > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Card className="border-blue-500/20">
            <CardContent className="p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-blue-500/10 p-2.5">
                  <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">Pre-evaluation onboarding</p>
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      {preEvaluationData.summary.completed}/{preEvaluationData.summary.total} complete
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {preEvaluationData.period.name} evaluations start on{' '}
                    {new Date(preEvaluationData.period.reviewStartDate).toLocaleDateString()}.
                    {preEvaluationData.summary.overdue > 0
                      ? ` ${preEvaluationData.summary.overdue} lead prep(s) are overdue.`
                      : ' Review outstanding lead prep tasks before evaluations begin.'}
                  </p>
                </div>
              </div>
              <Button asChild>
                <Link href={`/admin/pre-evaluations?periodId=${preEvaluationData.period.id}`} className="gap-1.5">
                  Review Queue <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {dashboardData?.summary && (
          <>
            <motion.div variants={stagger.item}>
              <StatsCard
                title="Team Members"
                value={dashboardData.summary.totalTeamMembers ?? dashboardData.summary.totalEmployees}
                icon={<Users className="w-5 h-5" />}
              />
            </motion.div>
            <motion.div variants={stagger.item}>
              <StatsCard
                title="Avg Being Evaluated"
                value={dashboardData.summary.averageInboundCompletion ?? dashboardData.summary.averageCompletion}
                suffix="%"
                icon={<Clock className="w-5 h-5" />}
              />
            </motion.div>
            <motion.div variants={stagger.item}>
              <StatsCard
                title="Avg Evaluating Others"
                value={dashboardData.summary.averageOutboundCompletion ?? 0}
                suffix="%"
                icon={<ClipboardList className="w-5 h-5" />}
              />
            </motion.div>
            <motion.div variants={stagger.item}>
              <StatsCard
                title="Reports Ready"
                value={dashboardData.summary.employeesWithReports}
                suffix={`/${dashboardData.summary.reportEligibleCount ?? dashboardData.summary.totalTeamMembers ?? dashboardData.summary.totalEmployees}`}
                icon={<FileText className="w-5 h-5" />}
              />
            </motion.div>
          </>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap gap-3 mb-8"
      >
        <ShimmerButton onClick={handleGenerateReports} disabled={generating} className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          {generating ? 'Generating...' : 'Generate Reports'}
        </ShimmerButton>
        <Button variant="outline" asChild>
          <Link href={`/admin/reports?periodId=${dashboardData?.period?.id || ''}`} className="flex items-center gap-2">
            <Eye className="w-4 h-4" /> View Reports
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/admin/email?periodId=${dashboardData?.period?.id || ''}`} className="flex items-center gap-2">
            <Mail className="w-4 h-4" /> Email Distribution
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <a href={`/api/reports/export?periodId=${dashboardData?.period?.id || ''}`} className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Export Excel
          </a>
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-display font-semibold text-foreground">Employee Progress</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Track both how much of each employee&apos;s inbound review set is complete and how much of their own evaluator workload they have finished.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setNameSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
                  }
                  className="gap-2 self-start"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Sort names {nameSortDirection === 'asc' ? 'A-Z' : 'Z-A'}
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">Employee</TableHead>
                  <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">Department</TableHead>
                  <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">Being Evaluated</TableHead>
                  <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">Evaluating Others</TableHead>
                  <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEmployees.map((employee) => (
                  <TableRow key={employee.id} className="border-b transition-colors hover:bg-muted/50">
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={employee.name} size="sm" />
                        <div>
                          <button
                            type="button"
                            onClick={() => openEmployeeDetail(employee)}
                            className="font-medium text-foreground transition-colors hover:text-primary hover:underline"
                          >
                            {employee.name}
                          </button>
                          {employee.position && <div className="text-sm text-muted-foreground">{employee.position}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {employee.department || '\u2014'}
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap align-top">
                      <ProgressCell
                        value={employee.inboundCompletionRate ?? employee.completionRate ?? 0}
                        completed={employee.inboundCompletedQuestions ?? employee.completedEvaluations ?? 0}
                        total={employee.inboundTotalQuestions ?? employee.totalNeeded ?? 0}
                      />
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap align-top">
                      <ProgressCell
                        value={employee.outboundCompletionRate ?? 0}
                        completed={employee.outboundCompletedQuestions ?? 0}
                        total={employee.outboundTotalQuestions ?? 0}
                      />
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      {employee.reportStatus === 'NOT_APPLICABLE' || employee.reportEligible === false ? (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          N/A
                        </Badge>
                      ) : employee.reportStatus === 'READY' || employee.reportGenerated ? (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          <Clock className="w-3 h-3 mr-1" /> Pending
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      <Modal
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false)
          setSelectedEmployee(null)
          setDetailData(null)
          setDetailError(null)
        }}
        title={
          detailData?.employee?.name || selectedEmployee?.name
            ? `${detailData?.employee?.name || selectedEmployee?.name} Evaluation Activity`
            : 'Evaluation Activity'
        }
        size="xl"
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading evaluation activity...
          </div>
        ) : detailError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            {detailError}
          </div>
        ) : detailData ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-lg font-semibold text-foreground">{detailData.employee.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {detailData.employee.position || 'No role info'}
                    {detailData.employee.department ? ` | ${detailData.employee.department}` : ''}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>{detailData.period.name}</p>
                  <p>
                    {new Date(detailData.period.startDate).toLocaleDateString()} -{' '}
                    {new Date(detailData.period.endDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border/70 bg-card/80 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Assigned
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {detailData.outgoing.length}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/80 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Assigned Submitted
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {detailData.outgoing.filter((item) => item.status === 'SUBMITTED').length}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/80 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Received
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {detailData.incoming.length}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/80 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Received Submitted
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {
                      detailData.incoming.filter(
                        (item) =>
                          item.status === 'SUBMITTED' || item.status === 'CLOSED_BY_POOL'
                      ).length
                    }
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    <p className="font-semibold text-foreground">Current-period evaluator changes</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use this when HR needs to adjust live evaluations without touching the permanent mappings. If an evaluator is excluded here, any answers they already submitted for that pairing stop counting for this period too.
                  </p>
                </div>
              </div>

              {detailData.periodOverrides.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {detailData.periodOverrides.map((override) => {
                    const partner =
                      override.direction === 'outgoing'
                        ? override.evaluatee
                        : override.evaluator

                    return (
                      <div
                        key={override.id}
                        className="rounded-xl border border-border/70 bg-background/40 p-4"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={
                                  override.action === 'ADD'
                                    ? 'border-green-500/20 text-green-600 dark:text-green-400'
                                    : 'border-amber-500/20 text-amber-600 dark:text-amber-400'
                                }
                              >
                                {override.action === 'ADD' ? 'Added for this period' : 'Excluded for this period'}
                              </Badge>
                              <Badge variant="outline" className="border-border/70">
                                {getRelationshipTypeLabel(override.relationshipType)}
                              </Badge>
                              <Badge variant="outline" className="border-border/70">
                                {override.direction === 'outgoing' ? 'They evaluate' : 'They are evaluated by'}
                              </Badge>
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{partner.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {partner.position || 'No role info'}
                                {partner.department ? ` | ${partner.department}` : ''}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Saved {formatDateTime(override.createdAt)}
                              {override.createdBy ? ` by ${override.createdBy.name}` : ''}
                            </p>
                            {override.note ? (
                              <p className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-sm text-muted-foreground">
                                {override.note}
                              </p>
                            ) : null}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUndoOverride(override.id)}
                            disabled={overrideBusyKey === `undo:${override.id}`}
                            className="gap-2 self-start"
                          >
                            {overrideBusyKey === `undo:${override.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Undo2 className="h-3.5 w-3.5" />
                            )}
                            Undo
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                  No period-only evaluator changes have been added for this employee yet.
                </div>
              )}
            </div>

            <Tabs key={detailData.employee.id} defaultValue="outgoing" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="outgoing">
                  What They Did ({detailData.outgoing.length})
                </TabsTrigger>
                <TabsTrigger value="incoming">
                  What Others Gave ({detailData.incoming.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="outgoing" className="space-y-4 pt-2">
                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    This shows each evaluation assigned to {detailData.employee.name}, whether it is untouched, saved as a draft, submitted, or closed by the pooled HR rule. Expand a row to inspect the saved answers.
                  </p>
                </div>
                <ActivityList
                  items={detailData.outgoing}
                  direction="outgoing"
                  onResetEvaluation={handleResetAssignment}
                  resetBusyKey={resetBusyKey}
                  onExcludeForPeriod={handleExcludeAssignment}
                  excludeBusyKey={overrideBusyKey}
                  emptyState="No evaluation assignments were resolved for this employee in the selected period."
                />
              </TabsContent>
              <TabsContent value="incoming" className="space-y-4 pt-2">
                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    This shows every evaluator currently mapped to {detailData.employee.name} for the selected period, along with any submitted or saved answers we have on file.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-primary" />
                    <p className="font-semibold text-foreground">Add evaluator for this period</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This creates a current-period-only evaluator link for {detailData.employee.name}. The permanent mapping stays unchanged.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="period-override-evaluator">Evaluator</Label>
                      <Select
                        value={newOverrideEvaluatorId || '__none__'}
                        onValueChange={(value) =>
                          setNewOverrideEvaluatorId(value === '__none__' ? '' : value)
                        }
                      >
                        <SelectTrigger id="period-override-evaluator">
                          <SelectValue
                            placeholder={
                              directoryLoading ? 'Loading team members...' : 'Select evaluator'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select evaluator</SelectItem>
                          {availableEvaluatorOptions.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {candidate.name}
                              {candidate.department ? ` (${candidate.department})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="period-override-relationship">Relationship type</Label>
                      <Select
                        value={newOverrideRelationshipType}
                        onValueChange={(value) =>
                          setNewOverrideRelationshipType(value as RelationshipType)
                        }
                      >
                        <SelectTrigger id="period-override-relationship">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            [
                              'TEAM_LEAD',
                              'DIRECT_REPORT',
                              'PEER',
                              'HR',
                              'C_LEVEL',
                              'DEPT',
                              'CROSS_DEPARTMENT',
                            ] as RelationshipType[]
                          ).map((type) => (
                            <SelectItem key={type} value={type}>
                              {getRelationshipTypeLabel(type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="period-override-note">Note for HR team</Label>
                    <Textarea
                      id="period-override-note"
                      value={newOverrideNote}
                      onChange={(event) => setNewOverrideNote(event.target.value)}
                      placeholder="Optional note, e.g. maternity leave cover or temporary reviewer change"
                      rows={3}
                    />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={handleAddIncomingOverride}
                      disabled={
                        !newOverrideEvaluatorId ||
                        overrideBusyKey ===
                          `add:${newOverrideEvaluatorId}:${newOverrideRelationshipType}`
                      }
                      className="gap-2"
                    >
                      {overrideBusyKey ===
                      `add:${newOverrideEvaluatorId}:${newOverrideRelationshipType}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      Add evaluator
                    </Button>
                  </div>
                </div>
                <ActivityList
                  items={detailData.incoming}
                  direction="incoming"
                  onResetEvaluation={handleResetAssignment}
                  resetBusyKey={resetBusyKey}
                  onExcludeForPeriod={handleExcludeAssignment}
                  excludeBusyKey={overrideBusyKey}
                  emptyState="No incoming evaluations were resolved for this employee in the selected period."
                />
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
