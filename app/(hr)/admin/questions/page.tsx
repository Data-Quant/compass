'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { RATING_LABELS, RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import {
  createEmptyRatingDescriptions,
  hasAnyRatingDescriptions,
  normalizeRatingDescriptions,
  type RatingDescriptions,
} from '@/lib/rating-descriptions'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  HelpCircle,
  MessageSquare,
  Plus,
  Edit2,
  Star,
  Trash2,
} from 'lucide-react'

interface GlobalQuestion {
  id: string
  questionText: string
  questionType: 'RATING' | 'TEXT'
  relationshipType: RelationshipType
  maxRating: number
  rating1Description?: string | null
  rating2Description?: string | null
  rating3Description?: string | null
  rating4Description?: string | null
  orderIndex: number
}

type LeadQuestionInput = {
  questionText: string
  ratingDescriptions: RatingDescriptions
}

interface PeriodOption {
  id: string
  name: string
  startDate: string
  endDate: string
  reviewStartDate: string
  isActive: boolean
  preEvaluationTriggeredAt: string | null
}

interface LeadQuestionSet {
  id: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'OVERRIDDEN'
  questionsSubmittedAt: string | null
  evaluateesSubmittedAt: string | null
  questionCount: number
  usesDefaultBank: boolean
  effectiveQuestionCount: number
  isRuntimeActive: boolean
  lead: {
    id: string
    name: string
    email: string | null
    department: string | null
    position: string | null
  }
  period: PeriodOption
  questions: Array<{
    id: string
    orderIndex: number
    questionText: string
    rating1Description?: string | null
    rating2Description?: string | null
    rating3Description?: string | null
    rating4Description?: string | null
  }>
}

interface LeadQuestionResponse {
  periods: PeriodOption[]
  selectedPeriodId: string | null
  requiredQuestionCount: number
  defaultQuestionCount: number
  leadQuestionSets: LeadQuestionSet[]
}

function buildLeadQuestionInputs(count: number, questions: LeadQuestionSet['questions'] = []) {
  const next = Array.from({ length: count }, () => ({
    questionText: '',
    ratingDescriptions: createEmptyRatingDescriptions(),
  }))
  questions.forEach((question) => {
    next[question.orderIndex - 1] = {
      questionText: question.questionText,
      ratingDescriptions: normalizeRatingDescriptions(question),
    }
  })
  return next
}

const LEAD_STATUS_BADGES: Record<LeadQuestionSet['status'], { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  COMPLETED: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  OVERDUE: { label: 'Overdue', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  OVERRIDDEN: { label: 'Overridden', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString()
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not submitted'
  return new Date(value).toLocaleString()
}

export default function QuestionsPage() {
  const [activeTab, setActiveTab] = useState<'global' | 'lead-submissions'>('global')
  const [questions, setQuestions] = useState<GlobalQuestion[]>([])
  const [leadQuestionSets, setLeadQuestionSets] = useState<LeadQuestionSet[]>([])
  const [periodOptions, setPeriodOptions] = useState<PeriodOption[]>([])
  const [globalLoading, setGlobalLoading] = useState(true)
  const [leadLoading, setLeadLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('')
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('')
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [requiredLeadQuestionCount, setRequiredLeadQuestionCount] = useState(2)
  const [defaultLeadQuestionCount, setDefaultLeadQuestionCount] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedQuestion, setSelectedQuestion] = useState<GlobalQuestion | null>(null)
  const [questionToDelete, setQuestionToDelete] = useState<GlobalQuestion | null>(null)
  const [isLeadQuestionModalOpen, setIsLeadQuestionModalOpen] = useState(false)
  const [selectedLeadQuestionSet, setSelectedLeadQuestionSet] = useState<LeadQuestionSet | null>(null)
  const [leadQuestionInputs, setLeadQuestionInputs] = useState<LeadQuestionInput[]>([])
  const [formData, setFormData] = useState({
    questionText: '',
    questionType: 'RATING',
    relationshipType: 'PEER',
    maxRating: 4,
    ratingDescriptions: createEmptyRatingDescriptions(),
  })
  const [saving, setSaving] = useState(false)
  const [savingLeadQuestions, setSavingLeadQuestions] = useState(false)

  const relationshipTypes = (Object.keys(RELATIONSHIP_TYPE_LABELS) as RelationshipType[]).filter(
    (type) => type !== 'CROSS_DEPARTMENT'
  )

  const selectedPeriod = useMemo(
    () => periodOptions.find((period) => period.id === selectedPeriodId) || null,
    [periodOptions, selectedPeriodId]
  )

  const departmentOptions = useMemo(
    () =>
      [...new Set(
        leadQuestionSets
          .map((set) => set.lead.department)
          .filter((department): department is string => Boolean(department))
      )].sort((a, b) => a.localeCompare(b)),
    [leadQuestionSets]
  )

  const leadOptions = useMemo(
    () =>
      leadQuestionSets
        .map((set) => ({
          id: set.lead.id,
          name: set.lead.name,
          department: set.lead.department,
        }))
        .filter((lead, index, all) => all.findIndex((item) => item.id === lead.id) === index)
        .filter((lead) => !selectedDepartment || lead.department === selectedDepartment)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [leadQuestionSets, selectedDepartment]
  )

  const filteredLeadQuestionSets = useMemo(
    () =>
      leadQuestionSets.filter((set) => {
        if (selectedDepartment && set.lead.department !== selectedDepartment) {
          return false
        }
        if (selectedLeadId && set.lead.id !== selectedLeadId) {
          return false
        }
        return true
      }),
    [leadQuestionSets, selectedDepartment, selectedLeadId]
  )

  const leadSummary = useMemo(() => {
    const submitted = filteredLeadQuestionSets.filter((set) => Boolean(set.questionsSubmittedAt)).length
    const drafts = filteredLeadQuestionSets.filter(
      (set) => !set.questionsSubmittedAt && set.questionCount > 0
    ).length
    const missing = filteredLeadQuestionSets.filter((set) => set.questionCount === 0).length
    const runtimeActive = filteredLeadQuestionSets.filter((set) => set.isRuntimeActive).length

    return {
      total: filteredLeadQuestionSets.length,
      submitted,
      drafts,
      missing,
      runtimeActive,
    }
  }, [filteredLeadQuestionSets])

  const isLoading = globalLoading || leadLoading

  const loadGlobalQuestions = async () => {
    setGlobalLoading(true)
    try {
      const url = filterType ? `/api/admin/questions?relationshipType=${filterType}` : '/api/admin/questions'
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to load global questions')
        return
      }
      setQuestions(data.questions || [])
    } catch {
      toast.error('Failed to load global questions')
    } finally {
      setGlobalLoading(false)
    }
  }

  const loadLeadQuestionSets = async (periodId?: string) => {
    setLeadLoading(true)
    try {
      const params = new URLSearchParams({ view: 'lead-submissions' })
      if (periodId) {
        params.set('periodId', periodId)
      }

      const res = await fetch(`/api/admin/questions?${params.toString()}`)
      const data: LeadQuestionResponse & { error?: string } = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to load lead-submitted questions')
        return
      }

      setLeadQuestionSets(data.leadQuestionSets || [])
      setPeriodOptions(data.periods || [])
      setRequiredLeadQuestionCount(data.requiredQuestionCount || 2)
      setDefaultLeadQuestionCount(data.defaultQuestionCount || 0)
      if (data.selectedPeriodId && data.selectedPeriodId !== selectedPeriodId) {
        setSelectedPeriodId(data.selectedPeriodId)
      }
    } catch {
      toast.error('Failed to load lead-submitted questions')
    } finally {
      setLeadLoading(false)
    }
  }

  useEffect(() => {
    loadGlobalQuestions()
  }, [filterType]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadLeadQuestionSets(selectedPeriodId || undefined)
  }, [selectedPeriodId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedLeadId && !leadOptions.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId('')
    }
  }, [leadOptions, selectedLeadId])

  const handleOpenModal = (question?: GlobalQuestion) => {
    if (question) {
      setSelectedQuestion(question)
      setFormData({
        questionText: question.questionText,
        questionType: question.questionType,
        relationshipType: question.relationshipType,
        maxRating: question.maxRating,
        ratingDescriptions: normalizeRatingDescriptions(question),
      })
    } else {
      setSelectedQuestion(null)
      setFormData({
        questionText: '',
        questionType: 'RATING',
        relationshipType: 'PEER',
        maxRating: 4,
        ratingDescriptions: createEmptyRatingDescriptions(),
      })
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.questionText) {
      toast.error('Question text required')
      return
    }
    setSaving(true)
    try {
      const method = selectedQuestion ? 'PUT' : 'POST'
      const body = selectedQuestion ? { ...formData, id: selectedQuestion.id } : formData
      const res = await fetch('/api/admin/questions', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to save question')
      } else {
        toast.success(selectedQuestion ? 'Question updated' : 'Question created')
        setIsModalOpen(false)
        loadGlobalQuestions()
      }
    } catch {
      toast.error('Failed to save question')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!questionToDelete) return
    try {
      const res = await fetch('/api/admin/questions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: questionToDelete.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to delete question')
      } else {
        toast.success('Question deleted')
        loadGlobalQuestions()
      }
    } catch {
      toast.error('Failed to delete question')
    } finally {
      setIsDeleteDialogOpen(false)
      setQuestionToDelete(null)
    }
  }

  const openLeadQuestionModal = (set: LeadQuestionSet) => {
    setSelectedLeadQuestionSet(set)
    setLeadQuestionInputs(buildLeadQuestionInputs(requiredLeadQuestionCount, set.questions))
    setIsLeadQuestionModalOpen(true)
  }

  const handleLeadQuestionSave = async (submit = false) => {
    if (!selectedLeadQuestionSet) return

    const normalizedQuestions = leadQuestionInputs.map((question) => ({
      questionText: question.questionText.trim(),
      ratingDescriptions: question.ratingDescriptions,
    }))
    if (submit && normalizedQuestions.some((question) => !question.questionText)) {
      toast.error(`Submit exactly ${requiredLeadQuestionCount} non-empty questions`)
      return
    }

    setSavingLeadQuestions(true)
    try {
      const response = await fetch(`/api/admin/pre-evaluations/${selectedLeadQuestionSet.id}/questions`, {
        method: submit ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: normalizedQuestions }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Failed to save lead questions')
        return
      }

      toast.success(submit ? 'Lead question set submitted on behalf of the lead' : 'Lead question draft saved')
      setIsLeadQuestionModalOpen(false)
      setSelectedLeadQuestionSet(null)
      await loadLeadQuestionSets(selectedPeriodId || undefined)
    } catch {
      toast.error('Failed to save lead questions')
    } finally {
      setSavingLeadQuestions(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading questions..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Questions</h1>
          <p className="text-muted-foreground mt-1">
            Manage the global question bank and review lead-submitted question sets by period.
          </p>
        </div>
        {activeTab === 'global' ? (
          <div className="flex gap-3 mt-1 md:mt-0">
            <Select
              value={filterType || '__all__'}
              onValueChange={(value) => setFilterType(value === '__all__' ? '' : value)}
            >
              <SelectTrigger className="min-w-[160px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Types</SelectItem>
                {relationshipTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {RELATIONSHIP_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="w-4 h-4" /> Add Question
            </Button>
          </div>
        ) : (
          <div className="flex gap-3 mt-1 md:mt-0">
            <Button variant="outline" asChild>
              <Link href={selectedPeriodId ? `/admin/pre-evaluations?periodId=${selectedPeriodId}` : '/admin/pre-evaluations'}>
                Open Prep Queue <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'global' | 'lead-submissions')} className="space-y-6">
        <TabsList>
          <TabsTrigger value="global">Global Question Bank</TabsTrigger>
          <TabsTrigger value="lead-submissions">Lead Submitted Questions</TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-4">
          <div className="space-y-4">
            {questions.map((question, index) => (
              <motion.div
                key={question.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * index }}
              >
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          question.questionType === 'RATING'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {question.questionType === 'RATING' ? (
                          <Star className="w-5 h-5" />
                        ) : (
                          <MessageSquare className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{question.questionText}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="secondary" className="text-muted-foreground">
                            {RELATIONSHIP_TYPE_LABELS[question.relationshipType]}
                          </Badge>
                          <Badge variant="secondary" className="text-muted-foreground">
                            {question.questionType}
                          </Badge>
                          {question.questionType === 'RATING' && (
                            <Badge variant="secondary" className="text-muted-foreground">
                              Max: {question.maxRating}
                            </Badge>
                          )}
                        </div>
                        {question.questionType === 'RATING' &&
                          hasAnyRatingDescriptions(question) && (
                            <div className="mt-4 grid gap-2 md:grid-cols-2">
                              {[1, 2, 3, 4].map((rating) => {
                                const description =
                                  normalizeRatingDescriptions(question)[rating as 1 | 2 | 3 | 4]

                                if (!description) return null

                                return (
                                  <div
                                    key={`${question.id}-rating-${rating}`}
                                    className="rounded-lg border bg-muted/20 px-3 py-2"
                                  >
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                      Rating {rating} · {RATING_LABELS[rating].label}
                                    </p>
                                    <p className="mt-1 text-sm text-foreground">{description}</p>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenModal(question)}
                          className="text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setQuestionToDelete(question)
                            setIsDeleteDialogOpen(true)
                          }}
                          className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {questions.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card>
                <CardContent className="p-12 text-center">
                  <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No questions found</p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </TabsContent>

        <TabsContent value="lead-submissions" className="space-y-6">
          <Card className="border-blue-500/20">
            <CardContent className="p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <p className="font-medium text-foreground">Lead-authored question sets</p>
                  {selectedPeriod && (
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      {selectedPeriod.name}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  These questions stay separate from the global bank and become extra KPI questions that each lead
                  answers about their direct reports for the selected period. When submitted, they are added on top of
                  the default Direct Reports question bank. They do not change what direct reports answer about the
                  lead. Evaluations begin on{' '}
                  {selectedPeriod ? formatDate(selectedPeriod.reviewStartDate) : 'the configured review date'}.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[640px]">
                <Select
                  value={selectedPeriodId || '__none__'}
                  onValueChange={(value) => {
                    setSelectedPeriodId(value === '__none__' ? '' : value)
                    setSelectedDepartment('')
                    setSelectedLeadId('')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    {periodOptions.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        No periods
                      </SelectItem>
                    ) : (
                      periodOptions.map((period) => (
                        <SelectItem key={period.id} value={period.id}>
                          {period.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedDepartment || '__all__'}
                  onValueChange={(value) => {
                    setSelectedDepartment(value === '__all__' ? '' : value)
                    setSelectedLeadId('')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All departments</SelectItem>
                    {departmentOptions.map((department) => (
                      <SelectItem key={department} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedLeadId || '__all__'} onValueChange={(value) => setSelectedLeadId(value === '__all__' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All leads" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All leads</SelectItem>
                    {leadOptions.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Visible Leads', value: leadSummary.total, tone: 'text-foreground' },
              { label: 'Submitted', value: leadSummary.submitted, tone: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Drafts', value: leadSummary.drafts, tone: 'text-blue-600 dark:text-blue-400' },
              { label: 'Runtime Active', value: leadSummary.runtimeActive, tone: 'text-violet-600 dark:text-violet-400' },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className={`mt-2 text-3xl font-semibold ${item.tone}`}>{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredLeadQuestionSets.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="font-medium text-foreground">
                  {selectedPeriod ? 'No lead question sets match these filters' : 'No lead question sets yet'}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedPeriod
                    ? 'Either this period has not been triggered yet, or no lead has saved questions for the selected filters.'
                    : 'Trigger pre-evaluation onboarding for a future period to start collecting lead-authored questions.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredLeadQuestionSets.map((set, index) => {
                const statusBadge = LEAD_STATUS_BADGES[set.status]
                const submissionBadge = set.questionsSubmittedAt
                  ? {
                      label: 'Submitted',
                      className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    }
                  : set.questionCount > 0
                    ? {
                        label: 'Draft Only',
                        className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                      }
                    : {
                        label: 'Using Default Bank',
                        className: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
                      }

                return (
                  <motion.div
                    key={set.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 * index }}
                  >
                    <Card>
                      <CardContent className="p-6 space-y-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-lg font-semibold text-foreground">{set.lead.name}</p>
                              <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
                              <Badge className={submissionBadge.className}>{submissionBadge.label}</Badge>
                              {set.isRuntimeActive && (
                                <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-400">
                                  Runtime Active
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">
                              {[set.lead.position, set.lead.department, set.lead.email].filter(Boolean).join(' | ') || 'Team lead'}
                            </p>
                            {set.usesDefaultBank && (
                              <p className="mt-2 text-sm text-muted-foreground">
                                Runtime will use only the default Direct Reports question bank until a lead-specific KPI set is submitted.
                              </p>
                            )}
                            {!set.usesDefaultBank && (
                              <p className="mt-2 text-sm text-muted-foreground">
                                Runtime will use the default Direct Reports question bank plus this lead&apos;s submitted KPI questions for their direct-report evaluations.
                              </p>
                            )}
                          </div>

                          <div className="space-y-3 xl:text-right">
                            <div className="text-sm text-muted-foreground">
                              <p>Questions submitted: {formatDateTime(set.questionsSubmittedAt)}</p>
                              <p>
                                Lead set size: {set.questionCount}/{requiredLeadQuestionCount}
                                {set.period.isActive ? ' | Active evaluation period' : ' | Upcoming / inactive period'}
                              </p>
                              <p>Runtime total: {set.effectiveQuestionCount} questions</p>
                              {set.usesDefaultBank ? (
                                <p>Direct-report bank only: {defaultLeadQuestionCount} questions</p>
                              ) : (
                                <p>Direct-report bank {defaultLeadQuestionCount} + lead KPI questions {set.questionCount}</p>
                              )}
                            </div>
                            <div className="flex justify-end">
                              <Button variant="outline" size="sm" onClick={() => openLeadQuestionModal(set)}>
                                <Edit2 className="w-4 h-4" />
                                {set.questionCount > 0 || set.questionsSubmittedAt ? 'Override Questions' : 'Add on Behalf'}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {set.questions.length > 0 ? (
                          <div className="space-y-3">
                            {set.questions.map((question) => (
                              <div key={question.id} className="rounded-lg border bg-muted/30 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Question {question.orderIndex}
                                  </p>
                                  {set.questionsSubmittedAt && question.orderIndex === 1 && (
                                    <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Ready for runtime
                                    </div>
                                  )}
                                </div>
                                <p className="mt-1 text-sm text-foreground">{question.questionText}</p>
                                {hasAnyRatingDescriptions(question) && (
                                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                                    {[1, 2, 3, 4].map((rating) => {
                                      const description =
                                        normalizeRatingDescriptions(question)[rating as 1 | 2 | 3 | 4]

                                      if (!description) return null

                                      return (
                                        <div
                                          key={`${question.id}-rating-${rating}`}
                                          className="rounded-md border bg-muted/20 px-3 py-2"
                                        >
                                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                            Rating {rating} · {RATING_LABELS[rating].label}
                                          </p>
                                          <p className="mt-1 text-sm text-foreground">{description}</p>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed p-5">
                            <p className="text-sm text-muted-foreground">
                              This lead has not submitted their KPI question set yet. The default Direct Reports question bank will be used unless HR adds or overrides the extra lead questions here.
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedQuestion ? 'Edit Question' : 'Add Question'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="question-text" className="mb-1">
              Question Text *
            </Label>
            <Textarea
              id="question-text"
              value={formData.questionText}
              onChange={(event) => setFormData({ ...formData, questionText: event.target.value })}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="question-type" className="mb-1">
                Type
              </Label>
              <Select
                value={formData.questionType}
                onValueChange={(value) => setFormData({ ...formData, questionType: value as 'RATING' | 'TEXT' })}
              >
                <SelectTrigger id="question-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RATING">Rating (1-4)</SelectItem>
                  <SelectItem value="TEXT">Text Response</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="relationship-type" className="mb-1">
                Relationship Type
              </Label>
              <Select
                value={formData.relationshipType}
                onValueChange={(value) =>
                  setFormData({ ...formData, relationshipType: value as RelationshipType })
                }
              >
                <SelectTrigger id="relationship-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {relationshipTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {RELATIONSHIP_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {formData.questionType === 'RATING' && (
            <div className="grid gap-3 md:grid-cols-2">
              {[1, 2, 3, 4].map((rating) => (
                <div key={`global-rating-description-${rating}`}>
                  <Label htmlFor={`global-rating-description-${rating}`} className="mb-1">
                    Rating {rating} meaning
                  </Label>
                  <Textarea
                    id={`global-rating-description-${rating}`}
                    rows={2}
                    value={formData.ratingDescriptions[rating as 1 | 2 | 3 | 4]}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        ratingDescriptions: {
                          ...formData.ratingDescriptions,
                          [rating]: event.target.value,
                        },
                      })
                    }
                    placeholder={`What does a ${rating} mean for this question?`}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isLeadQuestionModalOpen}
        onClose={() => {
          setIsLeadQuestionModalOpen(false)
          setSelectedLeadQuestionSet(null)
        }}
        title={
          selectedLeadQuestionSet
            ? `Manage ${selectedLeadQuestionSet.lead.name}'s Question Set`
            : 'Manage Lead Question Set'
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            HR can add or override this lead&apos;s extra KPI question set. If nothing is submitted, runtime will use only the default Direct Reports question bank.
          </p>

          {leadQuestionInputs.map((question, index) => (
            <div key={`lead-question-${index}`} className="space-y-2">
              <Label htmlFor={`lead-question-${index}`}>Question {index + 1}</Label>
              <Textarea
                id={`lead-question-${index}`}
                rows={3}
                value={question.questionText}
                onChange={(event) =>
                  setLeadQuestionInputs((current) =>
                    current.map((value, valueIndex) =>
                      valueIndex === index
                        ? { ...value, questionText: event.target.value }
                        : value
                    )
                  )
                }
              />
              <div className="grid gap-3 md:grid-cols-2">
                {[1, 2, 3, 4].map((rating) => (
                  <div key={`lead-question-${index}-rating-${rating}`} className="space-y-2">
                    <Label htmlFor={`lead-question-${index}-rating-${rating}`}>
                      Rating {rating} meaning
                    </Label>
                    <Textarea
                      id={`lead-question-${index}-rating-${rating}`}
                      rows={2}
                      value={question.ratingDescriptions[rating as 1 | 2 | 3 | 4]}
                      onChange={(event) =>
                        setLeadQuestionInputs((current) =>
                          current.map((value, valueIndex) =>
                            valueIndex === index
                              ? {
                                  ...value,
                                  ratingDescriptions: {
                                    ...value.ratingDescriptions,
                                    [rating]: event.target.value,
                                  },
                                }
                              : value
                          )
                        )
                      }
                      placeholder={`What does a ${rating} mean for this KPI?`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleLeadQuestionSave(false)}
              disabled={savingLeadQuestions}
            >
              {savingLeadQuestions ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button
              type="button"
              onClick={() => void handleLeadQuestionSave(true)}
              disabled={savingLeadQuestions}
            >
              {savingLeadQuestions ? 'Saving...' : 'Submit on Behalf'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Delete Question"
        message="Are you sure you want to delete this question?"
        confirmText="Delete"
        variant="danger"
      />
    </div>
  )
}
