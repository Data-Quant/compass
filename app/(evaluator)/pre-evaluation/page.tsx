'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/composed/EmptyState'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ClipboardList, Save, Send, AlertTriangle, ArrowRight } from 'lucide-react'

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
    period: {
      id: string
      name: string
      startDate: string
      endDate: string
      reviewStartDate: string
      isActive: boolean
    }
  } | null
}

function buildEmptyQuestionSet(count: number) {
  return Array.from({ length: count }, () => '')
}

export default function PreEvaluationPage() {
  const [prep, setPrep] = useState<PrepResponse['prep']>(null)
  const [loading, setLoading] = useState(true)
  const [questionInputs, setQuestionInputs] = useState<string[]>([])
  const [savingQuestions, setSavingQuestions] = useState(false)
  const [submittingQuestions, setSubmittingQuestions] = useState(false)

  const loadPrep = async () => {
    try {
      const response = await fetch('/api/pre-evaluation/current')
      const data: PrepResponse = await response.json()
      setPrep(data.prep)

      if (data.prep) {
        const nextQuestions = buildEmptyQuestionSet(data.prep.requiredQuestionCount)
        data.prep.questions.forEach((question) => {
          nextQuestions[question.orderIndex - 1] = question.questionText
        })
        setQuestionInputs(nextQuestions)
      } else {
        setQuestionInputs([])
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

  const progressValue = prep ? Math.round((prep.progressCount / prep.totalSections) * 100) : 0
  const hasValidQuestions = questionInputs.length > 0 && questionInputs.every((question) => question.trim())

  const saveQuestions = async (submit = false) => {
    if (!prep) return

    const trimmedQuestions = questionInputs.map((question) => question.trim())
    if (submit && !hasValidQuestions) {
      toast.error(`Submit exactly ${prep.requiredQuestionCount} non-empty questions`)
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

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
        <LoadingScreen message="Loading pre-evaluation task..." />
      </div>
    )
  }

  if (!prep) {
    return (
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
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
    <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
              Pre-Evaluation Onboarding
            </h1>
            <p className="text-muted-foreground mt-1">
              {prep.period.name} quarter ends on {new Date(prep.period.endDate).toLocaleDateString()}. Evaluations start on{' '}
              {new Date(prep.period.reviewStartDate).toLocaleDateString()}.
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
                Evaluations have already started. Late submission is disabled; HR can review or override the overdue task, and the default Direct Reports question bank will be used unless a lead-specific KPI add-on set was submitted.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Direct Report KPI Questions</h2>
              <p className="text-sm text-muted-foreground">
                Submit exactly {prep.requiredQuestionCount} extra KPI questions that you will answer about your direct reports. These are added on top of the default Direct Reports question bank for your direct-report evaluations. They do not change the questions your team answers about you. If you do not submit them, runtime uses only the default Direct Reports bank.
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

      <Card className="border-blue-500/20">
        <CardContent className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-foreground">Evaluator change requests now live in Evaluations.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Use the evaluations page to suggest peer or cross-department evaluator changes for yourself or your team members for HR review.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/evaluations" className="gap-1.5">
              Open Evaluations <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {prep.status === 'COMPLETED' && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Pre-evaluation onboarding completed.</p>
              <p className="text-sm text-muted-foreground">
                Your question set is in. Optional evaluator change requests can still be managed from the evaluations page while the window is open.
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
