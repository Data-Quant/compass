'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatKarachiDateTime } from '@/lib/weekly/format'
import type { CalibrationProgressView, CalibrationRunRow } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CalibrationRunDialog } from './CalibrationRunDialog'
import { dollars, percent } from './numbers'
import { useCycles } from './PeopleTab'

const STATUS_LABELS: Record<CalibrationRunRow['status'], string> = { RUNNING: 'Running', DONE: 'Done', FAILED: 'Failed' }

export function CalibrationRunsCard({ runs, standInAvailable, onChanged }: { runs: CalibrationRunRow[]; standInAvailable: boolean; onChanged: () => Promise<void> }) {
  const { cycles } = useCycles()
  const [model, setModel] = useState('')
  const [target, setTarget] = useState('SET')
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  async function start(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const body = target === 'SET' ? { kind: 'SET', model: model.trim() } : { kind: 'CYCLE', cycleId: target, model: model.trim() }
      const result = await weeklyRequest<{ itemCount: number }>('/api/admin/weekly/calibration/runs', { method: 'POST', body })
      toast.success(`Run started: ${result.itemCount} to score. Refresh to follow it.`)
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not start the run'))
    } finally {
      setBusy(false)
    }
  }

  async function continueRun(runId: string) {
    setBusy(true)
    try {
      const progress = await weeklyRequest<CalibrationProgressView>(`/api/admin/weekly/calibration/runs/${runId}`, { method: 'POST' })
      toast.success(progress.busy ? 'This run is already being scored' : `${progress.completed} of ${progress.itemCount} scored`)
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not continue the run'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Calibration runs</h2>
          <Button size="sm" variant="outline" onClick={() => void onChanged()}>Refresh runs</Button>
        </div>
        <form onSubmit={start} className="flex flex-wrap items-end gap-2">
          <div className="min-w-72 flex-1 space-y-1">
            <Label htmlFor="run-model">Model to test</Label>
            <Input id="run-model" value={model} onChange={(e) => setModel(e.target.value)} required placeholder={standInAvailable ? 'accounts/fireworks/models/… or stand-in' : 'accounts/fireworks/models/…'} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="run-target">What to score</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="run-target" className="w-80" aria-label="What to score"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SET">The calibration set</SelectItem>
                {cycles.map((c) => <SelectItem key={c.id} value={c.id}>Re-score {c.periodName}’s decided answers</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy}>Start run</Button>
        </form>
        <p className="text-xs text-muted-foreground">
          A calibration-set run decides whether a model is trusted: at least 40 items scored, errors on at most 5%, 90% within one level and 70% exact. A re-score only compares; it never changes a result.
        </p>
        {runs.length === 0 ? <p className="text-sm text-muted-foreground">No runs yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Model</th><th>What</th><th>Started</th><th>Status</th><th>Exact</th><th>Within one</th><th>Errors</th><th>Cost</th><th>Gate</th><th /></tr></thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t">
                  <td className="py-1 font-mono text-xs">{run.model}</td>
                  <td>{run.kind === 'SET' ? 'Calibration set' : `Re-score ${run.cycleName ?? ''}`}</td>
                  <td>{formatKarachiDateTime(run.createdAt)}</td>
                  <td>{run.status === 'RUNNING' ? `Running · ${run.completed} of ${run.itemCount}` : STATUS_LABELS[run.status]}</td>
                  <td>{percent(run.summary?.exactRate)}</td>
                  <td>{percent(run.summary?.withinOneRate)}</td>
                  <td>{run.summary ? `${run.summary.errors} of ${run.summary.items}` : '—'}</td>
                  <td>{dollars(run.costUsd)}</td>
                  <td>{run.gate ? <Badge variant={run.gate.passed ? 'default' : 'destructive'}>{run.gate.passed ? 'Passed' : 'Not passed'}</Badge> : '—'}</td>
                  <td className="whitespace-nowrap text-right">
                    {run.status === 'RUNNING' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void continueRun(run.id)}>Continue</Button>}
                    <Button size="sm" variant="ghost" aria-label={`Open the ${run.model} run from ${formatKarachiDateTime(run.createdAt)}`} onClick={() => setOpenId(run.id)}>Open</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      {openId && <CalibrationRunDialog runId={openId} onClose={() => setOpenId(null)} />}
    </Card>
  )
}
