'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

interface QuizQuestion {
  id: string
  questionText: string
  optionsJson: unknown
  orderIndex: number
}

interface QuizResult {
  correctCount: number
  totalQuestions: number
  scorePercent: number
  passPercent: number
  passed: boolean
  attemptsUsed: number
  attemptsRemaining: number
  lockedOut: boolean
}

interface AttemptItem {
  id: string
  score: number
  totalQuestions: number
  passed: boolean
  createdAt: string
}

export default function OnboardingQuizPage() {
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [attempts, setAttempts] = useState<AttemptItem[]>([])
  const [attemptsRemaining, setAttemptsRemaining] = useState(0)
  const [maxAttempts, setMaxAttempts] = useState(0)

  const loadQuiz = async () => {
    try {
      const [quizRes, attemptsRes] = await Promise.all([
        fetch('/api/onboarding/quiz'),
        fetch('/api/onboarding/quiz/attempts'),
      ])
      const [quizData, attemptsData] = await Promise.all([quizRes.json(), attemptsRes.json()])
      if (!quizRes.ok) {
        throw new Error(quizData.error || 'Failed to load quiz')
      }
      if (!attemptsRes.ok) {
        throw new Error(attemptsData.error || 'Failed to load quiz attempts')
      }
      setQuestions(quizData.questions || [])
      setAttempts(attemptsData.attempts || [])
      setAttemptsRemaining(attemptsData.attemptsRemaining ?? 0)
      setMaxAttempts(attemptsData.maxQuizAttempts ?? 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load quiz')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadQuiz()
  }, [])

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers])
  const canSubmit = questions.length > 0 && answeredCount === questions.length && attemptsRemaining > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/onboarding/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit quiz')
      }
      setResult(data.result)
      toast.success(data.result.passed ? 'Quiz passed' : 'Quiz submitted')
      await loadQuiz()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit quiz')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading quiz..." />
  }

  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/onboarding" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to Onboarding
          </Link>
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Onboarding Quiz</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Answer all questions to submit your final onboarding assessment.
              </p>
            </div>
            <Badge variant="secondary">
              Attempts left: {attemptsRemaining}/{maxAttempts}
            </Badge>
          </div>
          {questions.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>{answeredCount} of {questions.length} answered</span>
                <span>{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>
      </motion.div>

      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
        <Card className={`mb-6 border-l-4 ${result.passed ? 'border-l-emerald-500' : 'border-l-amber-500'}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Latest Result</p>
                <p className="text-xl font-semibold text-foreground">
                  {result.correctCount}/{result.totalQuestions} ({result.scorePercent}%)
                </p>
              </div>
              <Badge
                variant="secondary"
                className={
                  result.passed
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }
              >
                {result.passed ? 'Passed' : result.lockedOut ? 'Contact HR' : 'Retry Available'}
              </Badge>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}

      <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-4">
        {questions.map((question, index) => {
          const options = Array.isArray(question.optionsJson)
            ? question.optionsJson.filter((item): item is string => typeof item === 'string')
            : []
          return (
            <motion.div key={question.id} variants={stagger.item}>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground mb-1">Question {index + 1} of {questions.length}</p>
                <p className="text-base font-medium text-foreground mb-4">{question.questionText}</p>
                <RadioGroup
                  value={answers[question.id] || ''}
                  onValueChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
                  className="space-y-2"
                >
                  {options.map((option) => {
                    const optionId = `${question.id}-${option}`
                    return (
                      <div key={optionId} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                        <RadioGroupItem value={option} id={optionId} />
                        <Label htmlFor={optionId} className="cursor-pointer">{option}</Label>
                      </div>
                    )
                  })}
                </RadioGroup>
              </CardContent>
            </Card>
            </motion.div>
          )
        })}
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-6 flex justify-end">
        <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="gap-1.5">
          {submitting ? 'Submitting...' : 'Submit Quiz'}
          {!submitting && <CheckCircle2 className="h-4 w-4" />}
        </Button>
      </motion.div>

      {attempts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card className="mt-8">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Attempt History</p>
            </div>
            <div className="space-y-2">
              {attempts.slice(0, 5).map((attempt) => (
                <div key={attempt.id} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 transition-colors hover:bg-muted/60">
                  <p className="text-sm text-foreground">
                    {attempt.score}/{attempt.totalQuestions}
                  </p>
                  <Badge
                    variant="secondary"
                    className={
                      attempt.passed
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }
                  >
                    {attempt.passed ? 'Passed' : 'Failed'}
                  </Badge>
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
