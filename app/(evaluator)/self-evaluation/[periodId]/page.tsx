'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { SelfEvaluationForm, type ResponseValue, type SelfEvalQuestion } from '@/components/self-evaluation/SelfEvaluationForm'
import { SelfEvaluationAnswerView } from '@/components/self-evaluation/SelfEvaluationAnswerView'
import type { SelfEvaluationAnswer } from '@/lib/self-evaluation'
import { ArrowLeft, CheckCircle2, Clock, Send } from 'lucide-react'

export default function SelfEvaluationPage() {
  const params = useParams()
  const router = useRouter()
  const periodId = params.periodId as string

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [status, setStatus] = useState<'DRAFT' | 'SUBMITTED'>('DRAFT')
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [questions, setQuestions] = useState<SelfEvalQuestion[]>([])
  const [responses, setResponses] = useState<Record<string, ResponseValue>>({})
  const [submittedAnswers, setSubmittedAnswers] = useState<SelfEvaluationAnswer[]>([])
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/self-evaluation/${periodId}`)
        if (res.status === 404) {
          if (!cancelled) setNotFound(true)
          return
        }
        const data = await res.json()
        if (cancelled) return
        setStatus(data.selfEvaluation.status)
        setSubmittedAt(data.selfEvaluation.submittedAt)
        setQuestions(data.questions)
        const answers: SelfEvaluationAnswer[] = Array.isArray(data.selfEvaluation.answers)
          ? data.selfEvaluation.answers
          : []
        setSubmittedAnswers(answers)
        const map: Record<string, ResponseValue> = {}
        for (const a of answers) map[a.questionId] = a.value
        setResponses(map)
      } catch {
        toast.error('Failed to load self-evaluation')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [periodId])

  const buildAnswers = useCallback(
    (state: Record<string, ResponseValue>) =>
      questions.map((q) => ({ questionId: q.id, value: state[q.id] ?? defaultFor(q.type) })),
    [questions],
  )

  const save = useCallback(
    async (state: Record<string, ResponseValue>) => {
      try {
        const res = await fetch(`/api/self-evaluation/${periodId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: buildAnswers(state) }),
        })
        if (res.ok) setLastSaved(new Date())
      } catch {
        // silent; user can still submit
      }
    },
    [periodId, buildAnswers],
  )

  const handleChange = (questionId: string, value: ResponseValue) => {
    setResponses((prev) => {
      const next = { ...prev, [questionId]: value }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => save(next), 1000)
      return next
    })
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/self-evaluation/${periodId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: buildAnswers(responses), submit: true }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to submit self-evaluation')
        return
      }
      toast.success('Self-evaluation submitted')
      router.push('/evaluations')
    } catch {
      toast.error('Failed to submit self-evaluation')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
        <LoadingScreen message="Loading self-evaluation..." />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <h1 className="text-xl font-semibold text-foreground">No self-evaluation assigned</h1>
            <p className="text-muted-foreground">
              You do not have a self-evaluation for this period. If you believe this is a mistake, contact HR.
            </p>
            <Link href="/evaluations">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4" /> Back to Evaluations
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-2">
        <Link href="/evaluations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Evaluations
        </Link>
        <h1 className="text-2xl font-bold text-foreground font-display">Self-Evaluation</h1>
        <p className="text-muted-foreground">
          Reflect on this review period. Your responses are shared with your team lead as context for your review.
        </p>
      </div>

      {status === 'SUBMITTED' ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">
                Submitted{submittedAt ? ` on ${new Date(submittedAt).toLocaleDateString()}` : ''}
              </span>
            </div>
            <SelfEvaluationAnswerView answers={submittedAnswers} />
          </CardContent>
        </Card>
      ) : (
        <>
          <SelfEvaluationForm questions={questions} responses={responses} onChange={handleChange} />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {lastSaved && (
                <>
                  <Clock className="w-3 h-3" /> Auto-saved {lastSaved.toLocaleTimeString()}
                </>
              )}
            </div>
            <Button onClick={handleSubmit} disabled={submitting}>
              <Send className="w-4 h-4" /> {submitting ? 'Submitting...' : 'Submit self-evaluation'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function defaultFor(type: SelfEvalQuestion['type']): ResponseValue {
  if (type === 'TEXT') return ''
  if (type === 'LIST') return []
  return []
}
