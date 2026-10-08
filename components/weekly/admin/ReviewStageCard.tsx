'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { ReviewStageView } from '@/lib/weekly/view-types'
import { PeerRequestsAdminCard } from '../mapping/PeerRequestsAdminCard'
import { errorMessage, weeklyRequest } from '../weekly-api'

/** The round's review stage: HR opens it, then follows the leads' team questions and everyone's change requests. */
export function ReviewStageCard({ periodId }: { periodId: string }) {
  const [view, setView] = useState<ReviewStageView | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setView(await weeklyRequest<ReviewStageView>(`/api/admin/weekly/review-stage?periodId=${periodId}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the review stage'))
    }
  }, [periodId])
  useEffect(() => {
    void load()
  }, [load])

  async function open() {
    setBusy(true)
    try {
      const r = await weeklyRequest<{ leadTasks: number; listEmails: number }>('/api/admin/weekly/review-stage', { method: 'POST', body: { periodId } })
      toast.success(`Review stage open: ${r.leadTasks} leads asked for their team questions; ${r.listEmails} people sent their lists`)
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not open the review stage'))
    } finally {
      setBusy(false)
    }
  }

  if (!view) return null
  const submitted = view.leads.filter((l) => l.questionsSubmitted).length
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Review stage · {view.periodName}</p>
              <p className="text-sm text-muted-foreground">
                {view.openedAt
                  ? `Opened ${formatKarachiDate(view.openedAt)}. Everyone checks their lead, team and peers on their Evaluations page; leads write their two team questions. Ends ${formatKarachiDate(view.reviewEndsAt)}.`
                  : 'Before the round opens: leads write their two team questions, and everyone checks their lead, team and peers and asks for corrections.'}
              </p>
            </div>
            <Button disabled={busy} variant={view.openedAt ? 'outline' : 'default'} onClick={() => void open()}>
              {busy ? 'Opening…' : view.openedAt ? 'Send to anyone new' : 'Open review stage'}
            </Button>
          </div>
          {view.leads.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Leads&apos; team questions · {submitted} of {view.leads.length} in</p>
              <ul className="flex flex-wrap gap-2">
                {view.leads.map((l) => (
                  <li key={l.lead.id}><Badge variant={l.questionsSubmitted ? 'default' : 'outline'}>{l.lead.name}{l.questionsSubmitted ? '' : ' · waiting'}</Badge></li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <PeerRequestsAdminCard />
    </div>
  )
}
