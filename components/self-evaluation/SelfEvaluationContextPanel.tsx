'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { SelfEvaluationAnswerView } from '@/components/self-evaluation/SelfEvaluationAnswerView'
import type { SelfEvaluationAnswer } from '@/lib/self-evaluation'
import { ChevronDown, ChevronRight, UserCheck } from 'lucide-react'

interface Props {
  evaluateeId: string
}

interface ContextState {
  status: 'SUBMITTED' | 'NONE'
  submittedAt?: string | null
  answers?: SelfEvaluationAnswer[]
  employeeName?: string
}

/**
 * Read-only panel on the evaluate page showing the evaluatee's submitted
 * self-evaluation as context. Resolves the active period itself and only renders
 * once the data is available; never blocks the evaluator.
 */
export function SelfEvaluationContextPanel({ evaluateeId }: Props) {
  const [state, setState] = useState<ContextState | null>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const periodRes = await fetch('/api/evaluations/dashboard?periodId=active')
        const periodData = await periodRes.json()
        const periodId = periodData.period?.id
        if (!periodId) return
        const res = await fetch(`/api/self-evaluation/for-evaluatee/${evaluateeId}?periodId=${periodId}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setState(data)
      } catch {
        // context is optional; stay silent
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [evaluateeId])

  if (!state) return null

  return (
    <Card className="rounded-card border-border">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-5 text-left"
        >
          <span className="flex items-center gap-3">
            <span className="shrink-0 w-9 h-9 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </span>
            <span>
              <span className="block font-medium text-foreground">Employee self-evaluation</span>
              <span className="block text-sm text-muted-foreground">
                {state.status === 'SUBMITTED'
                  ? `Submitted${state.submittedAt ? ` on ${new Date(state.submittedAt).toLocaleDateString()}` : ''} — context for your review`
                  : 'Not submitted yet'}
              </span>
            </span>
          </span>
          {open ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        {open && state.status === 'SUBMITTED' && (
          <div className="border-t border-border px-5 pb-5 pt-4">
            <SelfEvaluationAnswerView answers={state.answers || []} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
