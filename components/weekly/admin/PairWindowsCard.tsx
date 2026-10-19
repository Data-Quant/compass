'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { PairWindowView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const keyOf = (w: PairWindowView) => `${w.evaluator.id}|${w.evaluatee.id}|${w.relationshipType}`

/** People added after the quarter started: HR sets the week their questions start and how many weeks they run. */
export function PairWindowsCard({ cycleId }: { cycleId: string }) {
  const [windows, setWindows] = useState<PairWindowView[]>([])
  const [drafts, setDrafts] = useState<Record<string, { startWeek: string; weeks: string }>>({})

  const load = useCallback(async () => {
    try {
      const result = await weeklyRequest<{ windows: PairWindowView[] }>(`/api/admin/weekly/pair-windows?cycleId=${cycleId}`)
      setWindows(result.windows)
      setDrafts(Object.fromEntries(result.windows.map((w) => [keyOf(w), { startWeek: String(w.startWeek), weeks: String(w.weeks) }])))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the mid-quarter additions'))
    }
  }, [cycleId])

  useEffect(() => {
    void load()
  }, [load])

  async function save(w: PairWindowView) {
    const draft = drafts[keyOf(w)]
    try {
      await weeklyRequest('/api/admin/weekly/pair-windows', {
        method: 'POST',
        body: { cycleId, evaluatorId: w.evaluator.id, evaluateeId: w.evaluatee.id, relationshipType: w.relationshipType, startWeek: Number(draft.startWeek), weeks: Number(draft.weeks) },
      })
      toast.success('Saved')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save'))
    }
  }

  if (windows.length === 0) return null
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="font-semibold">Added during the quarter</p>
          <p className="text-sm text-muted-foreground">Their five questions are spread over the weeks below instead of the whole quarter. Set the week they start and how many weeks they have.</p>
        </div>
        <ul className="divide-y">
          {windows.map((w) => {
            const draft = drafts[keyOf(w)] ?? { startWeek: String(w.startWeek), weeks: String(w.weeks) }
            const set = (field: 'startWeek' | 'weeks', value: string) => setDrafts((d) => ({ ...d, [keyOf(w)]: { ...draft, [field]: value } }))
            return (
              <li key={keyOf(w)} className="flex flex-wrap items-end justify-between gap-3 py-2">
                <p className="text-sm"><span className="font-medium">{w.evaluator.name}</span> evaluating <span className="font-medium">{w.evaluatee.name}</span></p>
                <div className="flex items-end gap-2">
                  <label className="text-xs text-muted-foreground">Start week
                    <Input className="h-8 w-20" type="number" min={1} value={draft.startWeek} onChange={(e) => set('startWeek', e.target.value)} />
                  </label>
                  <label className="text-xs text-muted-foreground">Weeks
                    <Input className="h-8 w-20" type="number" min={1} value={draft.weeks} onChange={(e) => set('weeks', e.target.value)} />
                  </label>
                  <Button size="sm" variant="outline" onClick={() => void save(w)}>Save</Button>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
