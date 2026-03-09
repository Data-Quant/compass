'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/composed/EmptyState'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ClipboardList, Plus, Save, Send, Trash2, Users, AlertTriangle } from 'lucide-react'

interface CandidateUser {
  id: string
  name: string
  department: string | null
  position: string | null
  role: string
}

interface SelectionRow {
  id?: string
  type: 'PRIMARY' | 'CROSS_DEPARTMENT'
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

interface PrepResponse {
  prep: {
    id: string
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'OVERRIDDEN'
    editable: boolean
    questionsSubmittedAt: string | null
    evaluateesSubmittedAt: string | null
    requiredQuestionCount: number
    progressCount: number
    totalSections: number
    questions: Array<{ id: string; orderIndex: number; questionText: string }>
    evaluateeSelections: SelectionRow[]
    candidateUsers: CandidateUser[]
    period: {
      id: string
      name: string
      startDate: string
      endDate: string
      isActive: boolean
    }
  } | null
}

const emptyQuestionSet = ['', '', '']

export default function PreEvaluationPage() {
  const [prep, setPrep] = useState<PrepResponse['prep']>(null)
  const [loading, setLoading] = useState(true)
  const [questionInputs, setQuestionInputs] = useState<string[]>(emptyQuestionSet)
  const [selections, setSelections] = useState<SelectionRow[]>([])
  const [savingQuestions, setSavingQuestions] = useState(false)
  const [submittingQuestions, setSubmittingQuestions] = useState(false)
  const [savingSelections, setSavingSelections] = useState(false)
  const [submittingSelections, setSubmittingSelections] = useState(false)

  const loadPrep = async () => {
    try {
      const response = await fetch('/api/pre-evaluation/current')
      const data: PrepResponse = await response.json()
      setPrep(data.prep)
      if (data.prep) {
        const nextQuestions = [...emptyQuestionSet]
        data.prep.questions.forEach((question) => {
          nextQuestions[question.orderIndex - 1] = question.questionText
        })
        setQuestionInputs(nextQuestions)
        setSelections(
          data.prep.evaluateeSelections.map((selection) => ({
            id: selection.id,
            type: selection.type,
            evaluateeId: selection.evaluateeId,
            suggestedEvaluatorId: selection.suggestedEvaluatorId || null,
            reviewStatus: selection.reviewStatus,
            evaluatee: selection.evaluatee,
            suggestedEvaluator: selection.suggestedEvaluator,
          }))
        )
      }
    } catch {
      toast.error('Failed to load pre-evaluation task')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPrep()
  }, [])

  const candidateUsers = prep?.candidateUsers || []
  const primarySelections = selections.filter((selection) => selection.type === 'PRIMARY')
  const crossSelections = selections.filter((selection) => selection.type === 'CROSS_DEPARTMENT')
  const progressValue = prep ? Math.round((prep.progressCount / prep.totalSections) * 100) : 0
  const hasValidQuestions = questionInputs.every((question) => question.trim())

  const userOptions = useMemo(
    () =>
      candidateUsers.map((user) => ({
        value: user.id,
        label: `${user.name}${user.department ? ` (${user.department})` : ''}`,
      })),
    [candidateUsers]
  )

  const saveQuestions = async (submit = false) => {
    if (!prep) return
    const trimmedQuestions = questionInputs.map((question) => question.trim())
    if (submit && !hasValidQuestions) {
      toast.error('Submit exactly 3 non-empty questions')
      return
    }

    submit ? setSubmittingQuestions(true) : setSavingQuestions(true)
    try {
      const response = await fetch(
        submit ? '/api/pre-evaluation/questions/submit' : '/api/pre-evaluation/questions',
        {
          method: submit ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions: trimmedQuestions }),
        }
      )
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Failed to save questions')
        return
      }
      toast.success(submit ? 'Evaluation questions submitted' : 'Draft saved')
      await loadPrep()
    } catch {
      toast.error('Failed to save questions')
    } finally {
      submit ? setSubmittingQuestions(false) : setSavingQuestions(false)
    }
  }

  const saveEvaluatees = async (submit = false) => {
    if (!prep) return
    const payloadSelections = selections.map((selection) => ({
      type: selection.type,
      evaluateeId: selection.evaluateeId,
      suggestedEvaluatorId: selection.suggestedEvaluatorId || undefined,
    }))

    if (submit && payloadSelections.length === 0) {
      toast.error('Add at least one evaluatee selection before submitting')
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
        toast.error(data.error || 'Failed to save evaluatee list')
        return
      }
      toast.success(submit ? 'Evaluatee list submitted' : 'Draft saved')
      await loadPrep()
    } catch {
      toast.error('Failed to save evaluatee list')
    } finally {
      submit ? setSubmittingSelections(false) : setSavingSelections(false)
    }
  }

  const addPrimarySelection = () => {
    setSelections((current) => [
      ...current,
      {
        type: 'PRIMARY',
        evaluateeId: '',
      },
    ])
  }

  const addCrossSelection = () => {
    setSelections((current) => [
      ...current,
      {
        type: 'CROSS_DEPARTMENT',
        evaluateeId: '',
        suggestedEvaluatorId: '',
      },
    ])
  }

  const updateSelection = (index: number, nextValue: Partial<SelectionRow>) => {
    setSelections((current) =>
      current.map((selection, selectionIndex) =>
        selectionIndex === index ? { ...selection, ...nextValue } : selection
      )
    )
  }

  const removeSelection = (index: number) => {
    setSelections((current) => current.filter((_, selectionIndex) => selectionIndex !== index))
  }

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto">
        <LoadingScreen message="Loading pre-evaluation task..." />
      </div>
    )
  }

  if (!prep) {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto">
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title="No pre-evaluation task"
          description="There is no active pre-evaluation onboarding assigned to you right now."
        />
      </div>
    )
  }

  const readOnly = !prep.editable

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
              Pre-Evaluation Onboarding
            </h1>
            <p className="text-muted-foreground mt-1">
              {prep.period.name} opens on {new Date(prep.period.startDate).toLocaleDateString()}.
            </p>
          </div>
          <Badge variant="secondary">
            {prep.progressCount}/{prep.totalSections} completed
          </Badge>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <Progress value={progressValue} className="flex-1 h-2.5 max-w-sm" />
          <span className="text-sm text-muted-foreground">{progressValue}% complete</span>
        </div>
      </motion.div>

      {readOnly && prep.status !== 'COMPLETED' && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">This pre-evaluation task is locked.</p>
              <p className="text-sm text-muted-foreground">
                The cycle has already opened. Late submission is disabled; HR can review or override the overdue task.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">1. Evaluation Questions</h2>
              <p className="text-sm text-muted-foreground">
                Submit exactly 3 questions for your team and approved cross-department evaluators.
              </p>
            </div>
            {prep.questionsSubmittedAt && (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-0">Submitted</Badge>
            )}
          </div>

          <div className="space-y-4">
            {questionInputs.map((question, index) => (
              <div key={`question-${index}`} className="space-y-2">
                <Label>Question {index + 1}</Label>
                <Textarea
                  rows={3}
                  value={question}
                  disabled={readOnly || Boolean(prep.questionsSubmittedAt)}
                  onChange={(event) =>
                    setQuestionInputs((current) =>
                      current.map((value, valueIndex) =>
                        valueIndex === index ? event.target.value : value
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>

          {!prep.questionsSubmittedAt && (
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => saveQuestions(false)}
                disabled={readOnly || savingQuestions || submittingQuestions}
              >
                <Save className="h-4 w-4" />
                {savingQuestions ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button
                onClick={() => saveQuestions(true)}
                disabled={readOnly || submittingQuestions || !hasValidQuestions}
              >
                <Send className="h-4 w-4" />
                {submittingQuestions ? 'Submitting...' : 'Submit Questions'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">2. Evaluatee List</h2>
              <p className="text-sm text-muted-foreground">
                Review your primary evaluatees and add any cross-department evaluator suggestions for HR review.
              </p>
            </div>
            {prep.evaluateesSubmittedAt && (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-0">Submitted</Badge>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Primary Evaluatees</h3>
                <p className="text-sm text-muted-foreground">People you will directly evaluate this cycle.</p>
              </div>
              {!prep.evaluateesSubmittedAt && (
                <Button variant="outline" size="sm" onClick={addPrimarySelection} disabled={readOnly}>
                  <Plus className="h-4 w-4" /> Add Primary
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {primarySelections.length === 0 && (
                <p className="text-sm text-muted-foreground">No primary evaluatees added yet.</p>
              )}
              {primarySelections.map((selection, index) => {
                const selectionIndex = selections.findIndex((row) => row === selection)
                return (
                  <div key={selection.id || `primary-${index}`} className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <Select
                      value={selection.evaluateeId || '__empty__'}
                      onValueChange={(value) => updateSelection(selectionIndex, { evaluateeId: value === '__empty__' ? '' : value })}
                      disabled={readOnly || Boolean(prep.evaluateesSubmittedAt)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select evaluatee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__empty__">Select evaluatee</SelectItem>
                        {userOptions.map((user) => (
                          <SelectItem key={user.value} value={user.value}>
                            {user.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!prep.evaluateesSubmittedAt && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSelection(selectionIndex)}
                        disabled={readOnly}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Cross-Department Suggestions</h3>
                <p className="text-sm text-muted-foreground">
                  Suggest additional evaluators from other teams for HR to review.
                </p>
              </div>
              {!prep.evaluateesSubmittedAt && (
                <Button variant="outline" size="sm" onClick={addCrossSelection} disabled={readOnly}>
                  <Plus className="h-4 w-4" /> Add Cross-Dept
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {crossSelections.length === 0 && (
                <p className="text-sm text-muted-foreground">No cross-department suggestions added yet.</p>
              )}
              {crossSelections.map((selection, index) => {
                const selectionIndex = selections.findIndex((row) => row === selection)
                return (
                  <div key={selection.id || `cross-${index}`} className="rounded-lg border p-4 space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Evaluatee</Label>
                        <Select
                          value={selection.evaluateeId || '__empty__'}
                          onValueChange={(value) => updateSelection(selectionIndex, { evaluateeId: value === '__empty__' ? '' : value })}
                          disabled={readOnly || Boolean(prep.evaluateesSubmittedAt)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select evaluatee" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty__">Select evaluatee</SelectItem>
                            {userOptions.map((user) => (
                              <SelectItem key={user.value} value={user.value}>
                                {user.label}
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
                          disabled={readOnly || Boolean(prep.evaluateesSubmittedAt)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select evaluator" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty__">Select evaluator</SelectItem>
                            {userOptions.map((user) => (
                              <SelectItem key={user.value} value={user.value}>
                                {user.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {selection.reviewStatus || 'PENDING'}
                      </Badge>
                      {!prep.evaluateesSubmittedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSelection(selectionIndex)}
                          disabled={readOnly}
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
          </div>

          {!prep.evaluateesSubmittedAt && (
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => saveEvaluatees(false)}
                disabled={readOnly || savingSelections || submittingSelections}
              >
                <Save className="h-4 w-4" />
                {savingSelections ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button
                onClick={() => saveEvaluatees(true)}
                disabled={readOnly || submittingSelections || selections.length === 0}
              >
                <Send className="h-4 w-4" />
                {submittingSelections ? 'Submitting...' : 'Submit Evaluatee List'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {prep.status === 'COMPLETED' && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Pre-evaluation onboarding completed.</p>
              <p className="text-sm text-muted-foreground">
                Both required submissions are in. HR can now review the cycle setup items.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/evaluations">Back to evaluations</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
