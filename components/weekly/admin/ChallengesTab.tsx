'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { ChallengeStatusValue, ChallengesResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { ChallengeDetailDialog } from './ChallengeDetailDialog'
import { CyclePicker, useCycles } from './PeopleTab'

const STATUS_LABELS: Record<ChallengeStatusValue, string> = { OPEN: 'Open', UPHELD: 'Upheld', NOT_UPHELD: 'Not upheld' }

export function ChallengesTab() {
  const { cycles, cycleId, setCycleId } = useCycles()
  const [data, setData] = useState<ChallengesResponse | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!cycleId) return
    try {
      setData(await weeklyRequest<ChallengesResponse>(`/api/admin/weekly/challenges?cycleId=${encodeURIComponent(cycleId)}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load challenges'))
    }
  }, [cycleId])

  useEffect(() => {
    void load()
  }, [load])

  if (cycles.length === 0) return <p className="text-sm text-muted-foreground">Create a cycle in Setup first.</p>
  return (
    <div className="space-y-4">
      <CyclePicker cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
      <p className="text-sm text-muted-foreground">
        {data?.deadline ? `People can raise a challenge until ${formatKarachiDate(data.deadline)}.` : 'Challenges open once you mark this quarter’s results published.'}
      </p>
      {data && data.challenges.length === 0 && <p className="text-sm">No challenges.</p>}
      {data && data.challenges.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1">Person</th><th>Raised</th><th>Status</th><th>Resolved by</th><th /></tr></thead>
          <tbody>
            {data.challenges.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-1">{c.evaluatee.name}</td>
                <td>{formatKarachiDate(c.createdAt)}</td>
                <td><Badge variant={c.status === 'OPEN' ? 'default' : 'outline'}>{STATUS_LABELS[c.status]}</Badge></td>
                <td>{c.resolvedBy ?? '—'}</td>
                <td className="text-right"><Button size="sm" variant="outline" aria-label={`Open the challenge from ${c.evaluatee.name}`} onClick={() => setOpenId(c.id)}>Open</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {openId && <ChallengeDetailDialog challengeId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  )
}
