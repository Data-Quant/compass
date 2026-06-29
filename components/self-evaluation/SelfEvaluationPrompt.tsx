'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ClipboardList, ArrowRight } from 'lucide-react'

interface PendingState {
  pending: boolean
  periodId?: string
  periodName?: string
}

/**
 * Shows a call-to-action when the current user has an outstanding (DRAFT)
 * self-evaluation for an active period. Renders nothing otherwise.
 */
export function SelfEvaluationPrompt() {
  const [state, setState] = useState<PendingState | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/self-evaluation/pending')
      .then((res) => (res.ok ? res.json() : { pending: false }))
      .then((data) => {
        if (!cancelled) setState(data)
      })
      .catch(() => {
        if (!cancelled) setState({ pending: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!state?.pending || !state.periodId) return null

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <ClipboardList className="w-5 h-5" />
          </span>
          <div>
            <p className="font-medium text-foreground">Complete your self-evaluation</p>
            <p className="text-sm text-muted-foreground">
              {state.periodName ? `${state.periodName} — ` : ''}share your reflections with your team lead before your review.
            </p>
          </div>
        </div>
        <Link href={`/self-evaluation/${state.periodId}`} className="shrink-0">
          <Button>
            Start <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
