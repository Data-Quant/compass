'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { RATING_LABELS } from '@/types'
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
  questionText: string
  questionType: string
  maxRating: number
  orderIndex: number
  ratingValue: number | null
  textResponse: string | null
  submittedAt: Date | null
}

export default function EvaluatePage() {
  const router = useRouter()
  const params = useParams()
  const evaluateeId = params.id as string

  const [evaluatee, setEvaluatee] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [relationshipType, setRelationshipType] = useState<string>('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [responses, setResponses] = useState<Record<string, { rating?: number; text?: string }>>({})
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useEffect(() => {
    loadEvaluationData()
  }, [evaluateeId])

  const loadEvaluationData = async () => {
    try {
      const periodResponse = await fetch('/api/evaluations/dashboard?periodId=active')
      const periodData = await periodResponse.json()
      const periodId = periodData.period?.id
      if (!periodId) { toast.error('No active evaluation period found'); router.push('/dashboard'); return }

      const response = await fetch(`/api/evaluations/${evaluateeId}?periodId=${periodId}`)
      const data = await response.json()
      if (data.error) { toast.error(data.error); router.push('/dashboard'); return }

      setEvaluatee(data.evaluatee)
      setQuestions(data.questions)
      setRelationshipType(data.relationshipType)
      setIsSubmitted(data.isSubmitted)

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
    const timeoutId = setTimeout(() => { autoSave(questionId, responses[questionId]?.rating, text) }, 500)
    return () => clearTimeout(timeoutId)
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
        body: JSON.stringify({ evaluateeId, periodId, questionId, ratingValue: rating, textResponse: text }),
      })
      setLastSaved(new Date())
    } catch (error) { console.error('Auto-save failed:', error) }
  }

  const handleSubmit = async () => {
    if (isSubmitted) { toast.info('This evaluation has already been submitted.'); return }

    const missingFields: string[] = []
    questions.forEach((q) => {
      if (q.questionType === 'RATING' && !responses[q.id]?.rating) missingFields.push(q.questionText)
    })
    if (missingFields.length > 0) { toast.error(`Please complete all required rating fields (${missingFields.length} remaining)`); return }

    setSaving(true)
    try {
      const periodResponse = await fetch('/api/evaluations/dashboard?periodId=active')
      const periodData = await periodResponse.json()
      const periodId = periodData.period?.id
      if (!periodId) throw new Error('No active period found')

      const responseData = questions.map((q) => ({
        questionId: q.id,
        ratingValue: q.questionType === 'RATING' ? responses[q.id]?.rating : undefined,
        textResponse: responses[q.id]?.text,
      }))

      const response = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluateeId, periodId, responses: responseData }),
      })
      const data = await response.json()
      if (data.success) { setIsSubmitted(true); toast.success('Evaluation submitted successfully!'); router.push('/dashboard') }
      else { toast.error(data.error || 'Failed to submit evaluation') }
    } catch (error: any) { toast.error(error.message || 'Failed to submit evaluation') }
    finally { setSaving(false) }
  }

  const completedQuestions = questions.filter(q => q.questionType === 'RATING' ? responses[q.id]?.rating : true).length
  const totalQuestions = questions.length
  const progress = totalQuestions > 0 ? Math.round((completedQuestions / totalQuestions) * 100) : 0

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
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 gap-1">
                  <CheckCircle className="w-4 h-4" /> Submitted
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
                            disabled={isSubmitted}
                            className={`p-4 rounded-xl border-2 transition-all ${
                              responses[question.id]?.rating === rating
                                ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                                : 'border-border hover:border-primary/50 bg-card'
                            } ${isSubmitted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <div className="text-3xl font-bold text-foreground mb-1">{rating}</div>
                            <div className="text-xs font-semibold text-primary">
                              {RATING_LABELS[rating].label}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 hidden md:block">
                              {RATING_LABELS[rating].description}
                            </div>
                          </button>
                        ))}
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
