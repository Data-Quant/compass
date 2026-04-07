'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { RELATIONSHIP_TYPE_LABELS } from '@/types'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ClipboardCheck,
  CheckCircle2,
  ArrowRight,
  Users,
  ClipboardList,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react'

interface Mapping {
  id: string
  evaluatee: { id: string; name: string; department: string | null; position: string | null }
  relationshipType: string
  questionsCount: number
  completedCount: number
  isComplete: boolean
  isClosedByPool?: boolean
}

interface IncomingAssignment {
  id: string
  evaluator: { id: string; name: string; department: string | null; position: string | null }
  relationshipType: string
  questionsCount: number
  completedCount: number
  isSubmitted: boolean
  isClosedByPool?: boolean
}

interface TeamIncomingAssignments {
  teamMember: { id: string; name: string; department: string | null; position: string | null }
  evaluators: IncomingAssignment[]
}

interface CandidateUser {
  id: string
  name: string
  department: string | null
  position: string | null
  role: string
}

interface SelectionRow {
  id?: string
  type: 'PRIMARY' | 'PEER' | 'CROSS_DEPARTMENT'
  evaluateeId: string
  suggestedEvaluatorId?: string | null
  reviewStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
  evaluatee?: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
  suggestedEvaluator?: {
    id: string
    name: string
    department: string | null
    position: string | null
  } | null
}

interface PreEvaluationTask {
  id: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'OVERRIDDEN'
  editable: boolean
  questionsSubmittedAt: string | null
  evaluateesSubmittedAt: string | null
  progressCount: number
  totalSections: number
  requiredQuestionCount: number
  candidateUsers: CandidateUser[]
  directReportUsers: CandidateUser[]
  evaluateeSelections: SelectionRow[]
  period: {
    id: string
    name: string
    startDate: string
    reviewStartDate: string
  }
}

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

export default function EvaluationsPage() {
  const user = useLayoutUser()
  const [mappings, setMappings] = useState<Record<string, Mapping[]>>({})
  const [incomingAssignments, setIncomingAssignments] = useState<IncomingAssignment[]>([])
  const [teamIncomingAssignments, setTeamIncomingAssignments] = useState<TeamIncomingAssignments[]>([])
  const [period, setPeriod] = useState<any>(null)
  const [preEvaluationTask, setPreEvaluationTask] = useState<PreEvaluationTask | null>(null)
  const [changeSelections, setChangeSelections] = useState<SelectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingSelections, setSavingSelections] = useState(false)
  const [submittingSelections, setSubmittingSelections] = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([loadEvaluations(), loadPreEvaluationTask()]).finally(() => setLoading(false))
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadEvaluations = async () => {
    try {
      const res = await fetch('/api/evaluations/dashboard?periodId=active')
      const data = await res.json()
      if (data.mappings) {
        setMappings(data.mappings)
        setPeriod(data.period)
        setIncomingAssignments(data.incoming || [])
        setTeamIncomingAssignments(data.teamIncoming || [])
      }
    } catch {
      toast.error('Failed to load evaluations')
    }
  }

  const loadPreEvaluationTask = async () => {
    try {
      const res = await fetch('/api/pre-evaluation/current')
      const data = await res.json()
      const prep: PreEvaluationTask | null = data.prep || null
      setPreEvaluationTask(prep)
      setChangeSelections(
        prep
          ? prep.evaluateeSelections
              .filter((selection) => selection.type !== 'PRIMARY')
              .map((selection) => ({
                id: selection.id,
                type: selection.type,
                evaluateeId: selection.evaluateeId,
                suggestedEvaluatorId: selection.suggestedEvaluatorId || null,
                reviewStatus: selection.reviewStatus,
                evaluatee: selection.evaluatee,
                suggestedEvaluator: selection.suggestedEvaluator,
              }))
          : []
      )
    } catch {
      // silent
    }
  }

  const addChangeSelection = (type: 'PEER' | 'CROSS_DEPARTMENT') => {
    setChangeSelections((current) => [
      ...current,
      {
        type,
        evaluateeId: '',
        suggestedEvaluatorId: '',
      },
    ])
  }

  const updateSelection = (index: number, nextValue: Partial<SelectionRow>) => {
    setChangeSelections((current) =>
      current.map((selection, selectionIndex) =>
        selectionIndex === index ? { ...selection, ...nextValue } : selection
      )
    )
  }

  const removeSelection = (index: number) => {
    setChangeSelections((current) => current.filter((_, selectionIndex) => selectionIndex !== index))
  }

  const saveChangeRequests = async (submit = false) => {
    if (!preEvaluationTask) return

    const payloadSelections = [
      ...preEvaluationTask.evaluateeSelections
        .filter((selection) => selection.type === 'PRIMARY')
        .map((selection) => ({
          type: selection.type,
          evaluateeId: selection.evaluateeId,
          suggestedEvaluatorId: selection.suggestedEvaluatorId || undefined,
        })),
      ...changeSelections.map((selection) => ({
        type: selection.type,
        evaluateeId: selection.evaluateeId,
        suggestedEvaluatorId: selection.suggestedEvaluatorId || undefined,
      })),
    ]

    if (submit && changeSelections.length === 0) {
      toast.error('Add at least one evaluator change request before submitting')
      return
    }

    submit ? setSubmittingSelections(true) : setSavingSelections(true)
    try {
      const response = await fetch(
        submit ? '/api/pre-evaluation/evaluatees/submit' : '/api/pre-evaluation/evaluatees',
        {
          method: submit ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selections: payloadSelections }),
        }
      )
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Failed to save evaluator change requests')
        return
      }
      toast.success(submit ? 'Evaluator change requests submitted to HR' : 'Draft saved')
      await loadPreEvaluationTask()
    } catch {
      toast.error('Failed to save evaluator change requests')
    } finally {
      submit ? setSubmittingSelections(false) : setSavingSelections(false)
    }
  }

  const allMappings = Object.values(mappings).flat()
  const totalEvaluations = allMappings.length
  const completedEvaluations = allMappings.filter((mapping) => mapping.isComplete).length
  const evaluationPercent =
    totalEvaluations > 0 ? Math.round((completedEvaluations / totalEvaluations) * 100) : 0
  const relationshipTypes = Object.keys(mappings)
  const primarySelections = preEvaluationTask?.evaluateeSelections.filter(
    (selection) => selection.type === 'PRIMARY'
  ) || []
  const peerSelections = changeSelections.filter((selection) => selection.type === 'PEER')
  const crossSelections = changeSelections.filter((selection) => selection.type === 'CROSS_DEPARTMENT')
  const requestTargetOptions = useMemo(() => {
    if (!user || !preEvaluationTask) return []

    const options = [
      {
        value: user.id,
        label: `${user.name} (Me)${user.department ? ` - ${user.department}` : ''}`,
      },
      ...preEvaluationTask.directReportUsers.map((teamMember) => ({
        value: teamMember.id,
        label: `${teamMember.name}${teamMember.department ? ` - ${teamMember.department}` : ''}`,
      })),
    ]

    return options.filter(
      (option, index) => options.findIndex((candidate) => candidate.value === option.value) === index
    )
  }, [preEvaluationTask, user])
  const candidateOptions = useMemo(
    () =>
      (preEvaluationTask?.candidateUsers || []).map((candidate) => ({
        value: candidate.id,
        label: `${candidate.name}${candidate.department ? ` - ${candidate.department}` : ''}`,
      })),
    [preEvaluationTask]
  )
  const showChangeRequests = Boolean(preEvaluationTask)
  const changeRequestsLocked =
    !preEvaluationTask?.editable || Boolean(preEvaluationTask?.evaluateesSubmittedAt)

  if (loading) return <LoadingScreen message="Loading evaluations..." />

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          Performance Evaluations
        </h1>
        <p className="text-muted-foreground mt-1">
          {period ? period.name : 'No active evaluation period'}
        </p>

        {totalEvaluations > 0 && (
          <div className="mt-4 flex items-center gap-4">
            <Progress value={evaluationPercent} className="flex-1 h-2.5 max-w-sm" />
            <span className="text-sm font-medium text-foreground">
              {completedEvaluations}/{totalEvaluations} completed ({evaluationPercent}%)
            </span>
          </div>
        )}
      </motion.div>

      {preEvaluationTask && preEvaluationTask.status !== 'COMPLETED' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Card className="border-blue-500/20">
            <CardContent className="p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-blue-500/10 p-2.5">
                  <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">Pre-evaluation onboarding is still open</p>
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      {preEvaluationTask.progressCount}/{preEvaluationTask.totalSections}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Finish your {preEvaluationTask.requiredQuestionCount} lead questions for {preEvaluationTask.period.name} before evaluations begin on{' '}
                    {new Date(preEvaluationTask.period.reviewStartDate).toLocaleDateString()}.
                  </p>
                </div>
              </div>
              <Button asChild>
                <Link href="/pre-evaluation" className="gap-1.5">
                  Open Task <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {showChangeRequests && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Evaluator Change Requests</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Suggest peer or cross-department evaluator changes for your team members or yourself. HR will review these requests before they affect the cycle setup.
                  </p>
                </div>
                {preEvaluationTask?.evaluateesSubmittedAt && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-0">Submitted to HR</Badge>
                )}
              </div>

              <div className="rounded-xl border bg-muted/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-foreground">Reporting Team Members</h3>
                    <p className="text-sm text-muted-foreground">
                      This list comes from your current team lead mappings for the active cycle.
                    </p>
                  </div>
                  <Badge variant="secondary">{primarySelections.length}</Badge>
                </div>

                {primarySelections.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No reporting team members are configured for you right now.
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {primarySelections.map((selection) => (
                      <Badge
                        key={selection.id || selection.evaluateeId}
                        variant="secondary"
                        className="bg-background text-foreground"
                      >
                        {selection.evaluatee?.name || 'Team member'}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-foreground">Peer Evaluator Requests</h3>
                    <p className="text-sm text-muted-foreground">
                      Add quarter-specific peer evaluators for yourself or your team members.
                    </p>
                  </div>
                  {!changeRequestsLocked && (
                    <Button variant="outline" size="sm" onClick={() => addChangeSelection('PEER')}>
                      <Plus className="h-4 w-4" /> Add Peer Request
                    </Button>
                  )}
                </div>

                {peerSelections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No peer evaluator requests added yet.</p>
                ) : (
                  <div className="space-y-3">
                    {peerSelections.map((selection, index) => {
                      const selectionIndex = changeSelections.findIndex((row) => row === selection)
                      return (
                        <div key={selection.id || `peer-${index}`} className="rounded-lg border p-4 space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>For</Label>
                              <Select
                                value={selection.evaluateeId || '__empty__'}
                                onValueChange={(value) =>
                                  updateSelection(selectionIndex, {
                                    evaluateeId: value === '__empty__' ? '' : value,
                                  })
                                }
                                disabled={changeRequestsLocked}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select yourself or a team member" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__empty__">Select yourself or a team member</SelectItem>
                                  {requestTargetOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Requested peer evaluator</Label>
                              <Select
                                value={selection.suggestedEvaluatorId || '__empty__'}
                                onValueChange={(value) =>
                                  updateSelection(selectionIndex, {
                                    suggestedEvaluatorId: value === '__empty__' ? '' : value,
                                  })
                                }
                                disabled={changeRequestsLocked}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select evaluator" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__empty__">Select evaluator</SelectItem>
                                  {candidateOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <Badge variant="secondary">{selection.reviewStatus || 'PENDING'}</Badge>
                            {!changeRequestsLocked && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeSelection(selectionIndex)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-foreground">Cross-Department Suggestions</h3>
                    <p className="text-sm text-muted-foreground">
                      Suggest evaluators from other teams for HR review.
                    </p>
                  </div>
                  {!changeRequestsLocked && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addChangeSelection('CROSS_DEPARTMENT')}
                    >
                      <Plus className="h-4 w-4" /> Add Cross-Dept
                    </Button>
                  )}
                </div>

                {crossSelections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No cross-department suggestions added yet.</p>
                ) : (
                  <div className="space-y-3">
                    {crossSelections.map((selection, index) => {
                      const selectionIndex = changeSelections.findIndex((row) => row === selection)
                      return (
                        <div key={selection.id || `cross-${index}`} className="rounded-lg border p-4 space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>For</Label>
                              <Select
                                value={selection.evaluateeId || '__empty__'}
                                onValueChange={(value) =>
                                  updateSelection(selectionIndex, {
                                    evaluateeId: value === '__empty__' ? '' : value,
                                  })
                                }
                                disabled={changeRequestsLocked}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select yourself or a team member" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__empty__">Select yourself or a team member</SelectItem>
                                  {requestTargetOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Suggested evaluator</Label>
                              <Select
                                value={selection.suggestedEvaluatorId || '__empty__'}
                                onValueChange={(value) =>
                                  updateSelection(selectionIndex, {
                                    suggestedEvaluatorId: value === '__empty__' ? '' : value,
                                  })
                                }
                                disabled={changeRequestsLocked}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select evaluator" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__empty__">Select evaluator</SelectItem>
                                  {candidateOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <Badge variant="secondary">{selection.reviewStatus || 'PENDING'}</Badge>
                            {!changeRequestsLocked && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeSelection(selectionIndex)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {preEvaluationTask?.evaluateesSubmittedAt ? (
                <p className="text-sm text-muted-foreground">
                  Your evaluator change requests were submitted on{' '}
                  {new Date(preEvaluationTask.evaluateesSubmittedAt).toLocaleString()}. HR will review them from the admin queue.
                </p>
              ) : (
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => saveChangeRequests(false)}
                    disabled={!preEvaluationTask?.editable || savingSelections || submittingSelections}
                  >
                    <Save className="h-4 w-4" />
                    {savingSelections ? 'Saving...' : 'Save Draft'}
                  </Button>
                  <Button
                    onClick={() => saveChangeRequests(true)}
                    disabled={!preEvaluationTask?.editable || submittingSelections || changeSelections.length === 0}
                  >
                    <Send className="h-4 w-4" />
                    {submittingSelections ? 'Submitting...' : 'Submit to HR'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {totalEvaluations === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-12 w-12" />}
          title="No evaluations assigned"
          description={period ? 'You have no evaluations to complete for this period.' : 'No active evaluation period found.'}
        />
      ) : (
        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {relationshipTypes.map((type) => {
            const group = mappings[type]
            const groupCompleted = group.filter((mapping) => mapping.isComplete).length
            const label = RELATIONSHIP_TYPE_LABELS[type as keyof typeof RELATIONSHIP_TYPE_LABELS] || type

            return (
              <motion.div key={type} variants={stagger.item}>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-semibold text-foreground">{label}</h2>
                      </div>
                      <Badge variant="secondary">
                        {groupCompleted}/{group.length} done
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {group.map((mapping) => {
                        const pct =
                          mapping.questionsCount > 0
                            ? Math.round((mapping.completedCount / mapping.questionsCount) * 100)
                            : 0

                        return (
                          <Link
                            key={mapping.id}
                            href={`/evaluate/${mapping.evaluatee.id}`}
                            className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-muted transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <UserAvatar name={mapping.evaluatee.name} size="sm" />
                              <div>
                                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                  {mapping.evaluatee.name}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {mapping.evaluatee.position && <span>{mapping.evaluatee.position}</span>}
                                  {mapping.evaluatee.position && mapping.evaluatee.department && <span>-</span>}
                                  {mapping.evaluatee.department && <span>{mapping.evaluatee.department}</span>}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {mapping.isComplete ? (
                                <div
                                  className={`flex items-center gap-1.5 ${
                                    mapping.isClosedByPool ? 'text-slate-500' : 'text-emerald-500'
                                  }`}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span className="text-xs font-medium">
                                    {mapping.isClosedByPool ? 'Closed' : 'Complete'}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Progress value={pct} className="w-20 h-1.5" />
                                  <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                                </div>
                              )}
                              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Who Is Evaluating You</h2>
              </div>
              {incomingAssignments.length > 0 && (
                <Badge variant="secondary">{incomingAssignments.length} evaluator(s)</Badge>
              )}
            </div>

            {incomingAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {period
                  ? 'No incoming evaluators are assigned to you for this active period.'
                  : 'No active evaluation period found.'}
              </p>
            ) : (
              <div className="space-y-2">
                {incomingAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between py-3 px-4 rounded-lg border bg-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar name={assignment.evaluator.name} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{assignment.evaluator.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {RELATIONSHIP_TYPE_LABELS[
                              assignment.relationshipType as keyof typeof RELATIONSHIP_TYPE_LABELS
                            ] || assignment.relationshipType}
                          </span>
                          {(assignment.evaluator.position || assignment.evaluator.department) && <span>-</span>}
                          <span>
                            {[assignment.evaluator.position, assignment.evaluator.department]
                              .filter(Boolean)
                              .join(' - ')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant="secondary"
                      className={
                        assignment.isClosedByPool
                          ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
                          : assignment.isSubmitted
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      }
                    >
                      {assignment.isClosedByPool ? 'Closed' : assignment.isSubmitted ? 'Submitted' : 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {teamIncomingAssignments.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Who Is Evaluating Your Team</h2>
                </div>
                <Badge variant="secondary">{teamIncomingAssignments.length} team member(s)</Badge>
              </div>

              <div className="space-y-4">
                {teamIncomingAssignments.map((group) => (
                  <div key={group.teamMember.id} className="rounded-xl border bg-muted/10 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <UserAvatar name={group.teamMember.name} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{group.teamMember.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {group.teamMember.position && <span>{group.teamMember.position}</span>}
                          {group.teamMember.position && group.teamMember.department && <span>-</span>}
                          {group.teamMember.department && <span>{group.teamMember.department}</span>}
                        </div>
                      </div>
                    </div>

                    {group.evaluators.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No evaluators are assigned to this team member for the active period yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {group.evaluators.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="flex items-center justify-between rounded-lg border bg-background/80 px-4 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <UserAvatar name={assignment.evaluator.name} size="sm" />
                              <div>
                                <p className="text-sm font-medium text-foreground">{assignment.evaluator.name}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>
                                    {RELATIONSHIP_TYPE_LABELS[
                                      assignment.relationshipType as keyof typeof RELATIONSHIP_TYPE_LABELS
                                    ] || assignment.relationshipType}
                                  </span>
                                  {(assignment.evaluator.position || assignment.evaluator.department) && <span>-</span>}
                                  <span>
                                    {[assignment.evaluator.position, assignment.evaluator.department]
                                      .filter(Boolean)
                                      .join(' - ')}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <Badge
                              variant="secondary"
                              className={
                                assignment.isClosedByPool
                                  ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
                                  : assignment.isSubmitted
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              }
                            >
                              {assignment.isClosedByPool ? 'Closed' : assignment.isSubmitted ? 'Submitted' : 'Pending'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
