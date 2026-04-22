'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  RELATIONSHIP_TYPE_LABELS,
  RATING_LABELS,
  type RelationshipType,
} from '@/types'
import {
  isEvaluationResponseComplete,
  ratingRequiresExplanation,
} from '@/lib/evaluation-response'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { CheckCircle, Clock, Send } from 'lucide-react'

interface Question {
  id: string
  questionSource: 'GLOBAL' | 'LEAD'
  questionText: string
  questionType: string
  maxRating: number
  ratingDescriptions: Partial<Record<1 | 2 | 3 | 4, string>> | null
  orderIndex: number
  ratingValue: number | null
  textResponse: string | null
  submittedAt: Date | null
}

interface FourRatingQuota {
  quotaRelationshipType: RelationshipType
  totalQuestions: number
  usedFourRatings: number
  maxAllowedFourRatings: number
  remainingFourRatings: number
}

export default function EvaluatePage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const evaluateeId = params.id as string
  const relationshipTypeParam = searchParams.get('relationshipType')

  const [evaluatee, setEvaluatee] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [relationshipType, setRelationshipType] = useState<string>('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isClosedByPool, setIsClosedByPool] = useState(false)
  const [fourRatingQuota, setFourRatingQuota] = useState<FourRatingQuota | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [responses, setResponses] = useState<Record<string, { rating?: number; text?: string }>>({})
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const textSaveTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    loadEvaluationData()
  }, [evaluateeId, relationshipTypeParam])

  useEffect(() => {
    return () => {
      Object.values(textSaveTimeouts.current).forEach((timeout) => clearTimeout(timeout))
    }
  }, [])

  const loadEvaluationData = async () => {
    try {
      const periodResponse = await fetch('/api/evaluations/dashboard?periodId=active')
      const periodData = await periodResponse.json()
      const periodId = periodData.period?.id
      if (!periodId) { toast.error('No active evaluation period found'); router.push('/dashboard'); return }

      const relationshipQuery = relationshipTypeParam
        ? `&relationshipType=${encodeURIComponent(relationshipTypeParam)}`
        : ''
      const response = await fetch(
        `/api/evaluations/${evaluateeId}?periodId=${periodId}${relationshipQuery}`
      )
      const data = await response.json()
      if (data.error) { toast.error(data.error); router.push('/dashboard'); return }

      setEvaluatee(data.evaluatee)
      setQuestions(data.questions)
      setRelationshipType(data.relationshipType)
      setIsSubmitted(data.isSubmitted)
      setIsClosedByPool(Boolean(data.isClosedByPool))
      setFourRatingQuota(data.fourRatingQuota || null)

      const initialResponses: Record<string, { rating?: number; text?: string }> = {}
      data.questions.forEach((q: Question) => {
        initialResponses[q.id] = { rating: q.ratingValue ?? undefined, text: q.textResponse ?? undefined }
      })
      setResponses(initialResponses)
    } catch { toast.error('Failed to load evaluation') }
    finally { setLoading(false) }
  }

  const handleRatingChange = (questionId: string, rating: number) => {
    setResponses((prev) => ({ ...prev, [questionId]: { ...prev[questionId], rating } }))
    autoSave(questionId, rating, responses[questionId]?.text)
  }

  const handleTextChange = (questionId: string, text: string) => {
    setResponses((prev) => ({ ...prev, [questionId]: { ...prev[questionId], text } }))
    if (textSaveTimeouts.current[questionId]) {
      clearTimeout(textSaveTimeouts.current[questionId])
    }

    textSaveTimeouts.current[questionId] = setTimeout(() => {
      autoSave(questionId, responses[questionId]?.rating, text)
    }, 500)
  }

  const autoSave = async (questionId: string, rating?: number, text?: string) => {
    try {
      const periodResponse = await fetch('/api/evaluations/dashboard?periodId=active')
      const periodData = await periodResponse.json()
      const periodId = periodData.period?.id
      if (!periodId) return
      await fetch('/api/evaluations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluateeId,
          periodId,
          questionId,
          questionSource: questions.find((q) => q.id === questionId)?.questionSource || 'GLOBAL',
          relationshipType: relationshipTypeParam || relationshipType || undefined,
          ratingValue: rating,
          textResponse: text,
        }),
      })
      setLastSaved(new Date())
    } catch (error) { console.error('Auto-save failed:', error) }
  }

  const handleSubmit = async () => {
    if (isSubmitted) { toast.info('This evaluation has already been submitted.'); return }

    const incompleteQuestions: string[] = []
    questions.forEach((q) => {
      if (
        !isEvaluationResponseComplete({
          questionType: q.questionType,
          ratingValue: responses[q.id]?.rating,
          textResponse: responses[q.id]?.text,
        })
      ) {
        incompleteQuestions.push(q.questionText)
      }
    })
    if (incompleteQuestions.length > 0) {
      toast.error(`Please complete all required responses (${incompleteQuestions.length} remaining)`)
      return
    }

    setSaving(true)
    try {
      const periodResponse = await fetch('/api/evaluations/dashboard?periodId=active')
      const periodData = await periodResponse.json()
      const periodId = periodData.period?.id
      if (!periodId) throw new Error('No active period found')

      const responseData = questions.map((q) => ({
        questionId: q.id,
        questionSource: q.questionSource,
        ratingValue: q.questionType === 'RATING' ? responses[q.id]?.rating : undefined,
        textResponse: responses[q.id]?.text,
      }))

      const response = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluateeId,
          periodId,
          relationshipType: relationshipTypeParam || relationshipType || undefined,
          responses: responseData,
        }),
      })
      const data = await response.json()
      if (data.success) {
        setIsSubmitted(true)
        setIsClosedByPool(false)
        toast.success('Evaluation submitted successfully!')
        router.push('/dashboard')
      }
      else { toast.error(data.error || 'Failed to submit evaluation') }
    } catch (error: any) { toast.error(error.message || 'Failed to submit evaluation') }
    finally { setSaving(false) }
  }

  const completedQuestions = questions.filter((question) =>
    isEvaluationResponseComplete({
      questionType: question.questionType,
      ratingValue: responses[question.id]?.rating,
      textResponse: responses[question.id]?.text,
    })
  ).length
  const totalQuestions = questions.length
  const progress = totalQuestions > 0 ? Math.round((completedQuestions / totalQuestions) * 100) : 0
  const selectedFourCount = questions.filter(
    (question) =>
      question.questionType === 'RATING' && responses[question.id]?.rating === 4
  ).length
  const currentFourUsage =
    (fourRatingQuota?.usedFourRatings || 0) + selectedFourCount
  const fourRatingQuotaLabel = fourRatingQuota
    ? RELATIONSHIP_TYPE_LABELS[fourRatingQuota.quotaRelationshipType]
    : null
  const canSelectFour = (questionId: string) => {
    if (!fourRatingQuota) {
      return true
    }

    if (responses[questionId]?.rating === 4) {
      return true
    }

    return selectedFourCount < fourRatingQuota.remainingFourRatings
  }

  if (loading) {
    return <div className="p-6 sm:p-8 max-w-7xl mx-auto"><LoadingScreen message="Loading evaluation..." variant="section" /></div>
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        {/* Header Card */}
        <Card className="rounded-card mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <UserAvatar name={evaluatee?.name || ''} size="lg" />
                <div>
                  <h1 className="text-2xl font-display font-bold text-foreground">Evaluating: {evaluatee?.name}</h1>
                  {evaluatee?.department && <p className="text-muted-foreground">{evaluatee.department}</p>}
                </div>
              </div>
              {isSubmitted && (
                <Badge
                  className={`border-0 gap-1 ${
                    isClosedByPool
                      ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" /> {isClosedByPool ? 'Closed' : 'Submitted'}
                </Badge>
              )}
            </div>

            {!isSubmitted && (
              <div>
                <div className="flex justify-between text-sm text-muted-foreground mb-2">
                  <span>Progress</span>
                  <span>{progress}% complete</span>
                </div>
                <Progress value={progress} className="h-3" />
              </div>
            )}

            {lastSaved && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Auto-saved {lastSaved.toLocaleTimeString()}
              </div>
            )}

            {!isSubmitted && fourRatingQuota && (
              <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm">
                <p className="font-medium text-foreground">
                  4-rating allowance for {fourRatingQuotaLabel}: {currentFourUsage}/{fourRatingQuota.maxAllowedFourRatings}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Ratings of 4 are capped at 10% of your {fourRatingQuota.totalQuestions}{' '}
                  {fourRatingQuotaLabel?.toLowerCase()} evaluation questions this period.
                </p>
              </div>
            )}

            {isClosedByPool && (
              <div className="mt-4 rounded-lg border border-slate-500/20 bg-slate-500/5 px-4 py-3 text-sm text-muted-foreground">
                Another HR team member has already submitted the HR evaluation for this employee, so this HR slot is closed.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Questions */}
        <div className="space-y-6">
          {questions.map((question, index) => (
            <motion.div
              key={question.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index }}
            >
              <Card className="rounded-card">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-5">
                    <span className="shrink-0 w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-semibold">
                      {index + 1}
                    </span>
                    <h3 className="text-lg font-medium text-foreground flex-1 pt-2">{question.questionText}</h3>
                  </div>

                  {question.questionType === 'RATING' ? (
                    <div className="ml-14">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => handleRatingChange(question.id, rating)}
                            disabled={isSubmitted || (rating === 4 && !canSelectFour(question.id))}
                            className={`p-4 rounded-xl border-2 transition-all ${
                              responses[question.id]?.rating === rating
                                ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                                : 'border-border hover:border-primary/50 bg-card'
                            } ${isSubmitted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <div className="text-3xl font-bold text-foreground mb-1">{rating}</div>
                            <div className="text-xs font-semibold text-primary">
                              {RATING_LABELS[rating].label}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 hidden md:block">
                              {question.ratingDescriptions?.[rating as 1 | 2 | 3 | 4] || RATING_LABELS[rating].description}
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <label
                            htmlFor={`explanation-${question.id}`}
                            className="font-medium text-foreground"
                          >
                            Explanation
                          </label>
                          {ratingRequiresExplanation(responses[question.id]?.rating) ? (
                            <span className="text-amber-600 dark:text-amber-400">
                              Required for ratings of 1 or 4
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Optional for ratings of 2 or 3
                            </span>
                          )}
                        </div>
                        <Textarea
                          id={`explanation-${question.id}`}
                          value={responses[question.id]?.text || ''}
                          onChange={(e) => handleTextChange(question.id, e.target.value)}
                          disabled={isSubmitted}
                          rows={3}
                          placeholder={
                            ratingRequiresExplanation(responses[question.id]?.rating)
                              ? 'Please explain why you selected this rating.'
                              : 'Add context if helpful.'
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="ml-14">
                      <Textarea
                        value={responses[question.id]?.text || ''}
                        onChange={(e) => handleTextChange(question.id, e.target.value)}
                        disabled={isSubmitted}
                        rows={4}
                        placeholder="Enter your feedback..."
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {!isSubmitted && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 flex justify-end gap-4 sticky bottom-4 bg-card/80 backdrop-blur-sm rounded-card p-4 border border-border"
          >
            <Button variant="outline" asChild>
              <Link href="/dashboard">Cancel</Link>
            </Button>
            <ShimmerButton
              onClick={handleSubmit}
              disabled={saving || progress < 100}
              className="disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-2" />
              {saving ? 'Submitting...' : 'Submit Evaluation'}
            </ShimmerButton>
          </motion.div>
        )}

    </div>
  )
}
