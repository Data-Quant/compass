'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import { LEVEL_KEYS, LEVEL_LABELS } from '@/lib/weekly/profile'
import type { ChallengeDetailResponse, ReviewAnswerView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

function AdjustRow({ challengeId, answer, onChanged }: { challengeId: string; answer: ReviewAnswerView; onChanged: () => Promise<void> }) {
  const [score, setScore] = useState(String(answer.decision?.finalScore ?? 2))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await weeklyRequest(`/api/admin/weekly/challenges/${challengeId}`, { method: 'POST', body: { action: 'adjust', responseId: answer.responseId, score: Number(score), reason } })
      toast.success('Score changed. It applies when you resolve the challenge.')
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change the score'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select value={score} onValueChange={setScore}>
        <SelectTrigger className="w-56" aria-label={`New score for ${answer.topic} from ${answer.evaluator.name}`}><SelectValue /></SelectTrigger>
        <SelectContent>{LEVEL_KEYS.map((key) => <SelectItem key={key} value={key}>{key} · {LEVEL_LABELS[key]}</SelectItem>)}</SelectContent>
      </Select>
      <Textarea className="min-w-64 flex-1" rows={1} placeholder="Reason" aria-label={`Reason for changing ${answer.topic}`} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button size="sm" variant="outline" disabled={saving || reason.trim().length < 3} onClick={() => void save()}>Change score</Button>
    </div>
  )
}

export function ChallengeDetailDialog({ challengeId, onClose, onChanged }: { challengeId: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<ChallengeDetailResponse | null>(null)
  const [outcome, setOutcome] = useState<'UPHELD' | 'NOT_UPHELD'>('NOT_UPHELD')
  const [resolution, setResolution] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<ChallengeDetailResponse>(`/api/admin/weekly/challenges/${challengeId}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the challenge'))
    }
  }, [challengeId])

  useEffect(() => {
    void load()
  }, [load])

  async function resolve() {
    setSaving(true)
    try {
      await weeklyRequest(`/api/admin/weekly/challenges/${challengeId}`, { method: 'POST', body: { action: 'resolve', outcome, resolution } })
      toast.success('Challenge resolved')
      await onChanged()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not resolve the challenge'))
    } finally {
      setSaving(false)
    }
  }

  const open = data?.challenge.status === 'OPEN'
  return (
    <Modal isOpen onClose={onClose} title={data ? `Challenge from ${data.challenge.evaluatee.name}` : 'Challenge'} size="xl">
      {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="space-y-4">
          <div className="rounded-md border p-3">
            <p className="text-xs font-medium text-muted-foreground">Their reason</p>
            <p className="whitespace-pre-wrap text-sm">{data.challenge.reason}</p>
          </div>
          <p className="text-sm">Current overall score: {data.overallScore === null ? '—' : `${data.overallScore.toFixed(1)}%`}</p>
          <div className="space-y-3">
            <h3 className="font-medium">Their accepted weekly evidence</h3>
            {data.answers.length === 0 && <p className="text-sm text-muted-foreground">No weekly answers about this person were decided.</p>}
            {data.answers.map((answer) => (
              <div key={answer.responseId} className="space-y-2 rounded-md border p-3 text-sm">
                <p className="font-medium">{answer.topic} · {PERSPECTIVE_LABELS[answer.perspective]} — from {answer.evaluator.name} · week {answer.weekIndex}</p>
                <p className="whitespace-pre-wrap">{[answer.answer.situation, answer.answer.action, answer.answer.result].filter(Boolean).join('\n')}</p>
                <p className="text-muted-foreground">Decision: {answer.decision?.action.toLowerCase().replace(/_/g, ' ')}{answer.decision?.finalScore != null ? ` · ${answer.decision.finalScore}` : ''}{answer.decision?.reason ? ` — ${answer.decision.reason}` : ''}</p>
                {open && <AdjustRow challengeId={challengeId} answer={answer} onChanged={load} />}
              </div>
            ))}
          </div>
          {open ? (
            <div className="space-y-2 rounded-md border p-3">
              <h3 className="font-medium">Resolve</h3>
              <Select value={outcome} onValueChange={(value) => setOutcome(value === 'UPHELD' ? 'UPHELD' : 'NOT_UPHELD')}>
                <SelectTrigger className="w-72" aria-label="Outcome"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPHELD">Upheld — results change</SelectItem>
                  <SelectItem value="NOT_UPHELD">Not upheld — results stay</SelectItem>
                </SelectContent>
              </Select>
              <Label htmlFor="challenge-resolution">Resolution</Label>
              <Textarea id="challenge-resolution" rows={3} maxLength={3000} value={resolution} onChange={(e) => setResolution(e.target.value)} />
              <p className="text-xs text-muted-foreground">Sent to the person. Changed scores are applied and their report is rebuilt when you resolve.</p>
              <div className="flex justify-end"><Button disabled={saving || resolution.trim().length < 10} onClick={() => void resolve()}>Resolve challenge</Button></div>
            </div>
          ) : (
            <p className="text-sm">{data.challenge.status === 'UPHELD' ? 'Upheld' : 'Not upheld'} by {data.challenge.resolvedBy ?? 'HR'}: {data.challenge.resolution}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
