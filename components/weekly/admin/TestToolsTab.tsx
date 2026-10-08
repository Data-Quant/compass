'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ParticipantRow, ParticipantsResponse } from '@/lib/weekly/view-types'
import { WeeklyInbox } from '../WeeklyInbox'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CyclePicker, useCycles } from './PeopleTab'

type ToolResult = Record<string, unknown>

export function TestToolsTab() {
  const { cycles, cycleId, setCycleId } = useCycles()
  const [people, setPeople] = useState<ParticipantRow[]>([])
  const [personId, setPersonId] = useState('')
  const [pair, setPair] = useState({ evaluatorId: '', evaluateeId: '' })
  const [pairOptions, setPairOptions] = useState<Array<{ evaluatee: { id: string; name: string }; perspective: string }>>([])

  async function chooseEvaluator(evaluatorId: string) {
    setPair({ evaluatorId, evaluateeId: '' })
    setPairOptions([])
    try {
      const result = await weeklyRequest<{ pairs: Array<{ evaluatee: { id: string; name: string }; perspective: string }> }>('/api/admin/weekly/test-tools', { method: 'POST', body: { action: 'pairs', cycleId, evaluatorId } })
      setPairOptions(result.pairs)
      if (result.pairs.length === 0) toast.error('This person evaluates nobody in this quarter')
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load who they evaluate'))
    }
  }
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadPeople = useCallback(async () => {
    if (!cycleId) return
    try {
      setPeople((await weeklyRequest<ParticipantsResponse>(`/api/admin/weekly/participants?cycleId=${cycleId}`)).rows)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load people'))
    }
  }, [cycleId])

  useEffect(() => {
    void loadPeople()
  }, [loadPeople])

  async function run(body: Record<string, unknown>, describe: (result: ToolResult) => string) {
    setBusy(true)
    try {
      const result = await weeklyRequest<ToolResult>('/api/admin/weekly/test-tools', { method: 'POST', body })
      toast.success(describe(result))
      setRefreshKey((k) => k + 1)
    } catch (e) {
      toast.error(errorMessage(e, 'The test tool failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="font-semibold">Preview test tools</p>
            <p className="text-sm text-muted-foreground">These change data on this preview only. No emails are sent from the preview.</p>
          </div>
          <CyclePicker cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
          <div className="flex flex-wrap gap-2">
            {cycleId && (
              <>
                <Button disabled={busy} onClick={() => void run({ action: 'release-next-week', cycleId }, (r) => `Week ${String(r.week)} released: ${String(r.promptsCreated)} questions`)}>Release next week now</Button>
                <Button disabled={busy} variant="outline" onClick={() => void run({ action: 'fill-synthetic', cycleId }, (r) => `${String(r.answered)} questions answered`)}>Answer every open question</Button>
                <Button disabled={busy} variant="outline" onClick={() => void run({ action: 'score-now', cycleId }, (r) => `${String(r.scored)} scored, ${String(r.failed)} failed, ${String(r.remaining)} still waiting`)}>Score waiting answers now</Button>
                <Button disabled={busy} variant="ghost" onClick={() => setConfirmReset(true)}>Reset this cycle</Button>
              </>
            )}
          </div>
          {cycles.length === 0 && <p className="text-sm text-muted-foreground">Create a cycle in Setup to release weeks and fill answers.</p>}
        </CardContent>
      </Card>
      {cycleId && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="font-semibold">Ask someone now</p>
              <p className="text-sm text-muted-foreground">For a live demo. “Release this week for them” gives the evaluator this week’s questions, about a random few of the people they evaluate. “Ask this pair now” gives them their next question about one person. The model scores each answer right after it is given; review the scores in Review answers.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Select value={pair.evaluatorId} onValueChange={(evaluatorId) => void chooseEvaluator(evaluatorId)}>
                <SelectTrigger className="w-60" aria-label="Evaluator"><SelectValue placeholder="Who answers" /></SelectTrigger>
                <SelectContent>{people.map((p) => <SelectItem key={p.person.id} value={p.person.id}>{p.person.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={pair.evaluateeId} onValueChange={(evaluateeId) => setPair({ ...pair, evaluateeId })}>
                <SelectTrigger className="w-60" aria-label="About"><SelectValue placeholder="About whom" /></SelectTrigger>
                <SelectContent>{pairOptions.map((o) => <SelectItem key={`${o.evaluatee.id}-${o.perspective}`} value={o.evaluatee.id}>{o.evaluatee.name} · {o.perspective}</SelectItem>)}</SelectContent>
              </Select>
              <Button disabled={busy || !pair.evaluatorId} variant="outline" onClick={() => void run({ action: 'release-for', cycleId, evaluatorId: pair.evaluatorId }, (r) => (r.evaluatorsReleased === 0 ? `Week ${String(r.week)} was already released for them` : `Week ${String(r.week)}: ${String(r.promptsCreated)} questions`))}>Release this week for them</Button>
              <Button disabled={busy || !pair.evaluatorId || !pair.evaluateeId} onClick={() => void run({ action: 'ask-pair', cycleId, ...pair }, () => 'Question asked')}>Ask this pair now</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {cycleId && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="act-as">Open inbox as</Label>
                <Select value={personId} onValueChange={setPersonId}>
                  <SelectTrigger id="act-as" className="w-72" aria-label="Open inbox as"><SelectValue placeholder="Choose a person" /></SelectTrigger>
                  <SelectContent>{people.map((p) => <SelectItem key={p.person.id} value={p.person.id}>{p.person.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {personId && (
                <Button disabled={busy} variant="outline" onClick={() => void run({ action: 'fill-synthetic', cycleId, evaluatorId: personId }, (r) => `${String(r.answered)} answers written`)}>
                  Fill their open questions
                </Button>
              )}
            </div>
            {personId && <WeeklyInbox key={`${personId}-${refreshKey}`} actingAs={personId} />}
          </CardContent>
        </Card>
      )}
      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false)
          void run({ action: 'reset', cycleId }, () => 'Cycle reset')
        }}
        title="Reset this cycle?"
        message="Deletes every question, answer and score in this cycle on the preview. Topics and profiles stay."
        confirmText="Reset"
        variant="danger"
      />
    </div>
  )
}
