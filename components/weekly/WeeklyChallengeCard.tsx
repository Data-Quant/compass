'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { MyChallengeResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from './weekly-api'

/** D14. Renders nothing unless the person has published results within the window, or a recent challenge. */
export function WeeklyChallengeCard() {
  const [data, setData] = useState<MyChallengeResponse | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    // The module may be off (404): show nothing.
    setData(await weeklyRequest<MyChallengeResponse>('/api/weekly/challenge').catch(() => null))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await weeklyRequest('/api/weekly/challenge', { method: 'POST', body: { reason } })
      toast.success('Challenge raised')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not raise the challenge'))
    } finally {
      setSaving(false)
    }
  }

  if (!data?.available) return null
  const challenge = data.challenge
  return (
    <Card className="mb-8">
      <CardContent className="space-y-3 p-6">
        <p className="font-semibold">Your {data.periodName} results</p>
        {challenge?.status === 'OPEN' && <p className="text-sm">You raised a challenge on {formatKarachiDate(challenge.createdAt)}. HR will review it and let you know.</p>}
        {challenge && challenge.status !== 'OPEN' && (
          <div className="space-y-1 text-sm">
            <p>{challenge.status === 'UPHELD' ? 'HR upheld your challenge and updated your results.' : 'HR reviewed your challenge and kept your results as they were.'}</p>
            {challenge.resolution && <p className="whitespace-pre-wrap text-muted-foreground">{challenge.resolution}</p>}
          </div>
        )}
        {!challenge && data.canRaise && data.deadline && (
          <form onSubmit={submit} className="space-y-2">
            <p className="text-sm text-muted-foreground">If you believe your results are wrong, you can raise one challenge by {formatKarachiDate(data.deadline)}. Say what you disagree with and why.</p>
            <Label htmlFor="challenge-reason">Why are you challenging your results?</Label>
            <Textarea id="challenge-reason" rows={4} required minLength={20} maxLength={3000} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'Sending…' : 'Raise a challenge'}</Button></div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
