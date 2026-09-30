'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { formatKarachiDateTime } from '@/lib/weekly/format'
import type { CalibrationResultView, CalibrationRunDetailResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { dollars, percent } from './numbers'

const judgement = (j: { sufficiency: string; score: number | null } | null) => (j === null ? '—' : j.sufficiency === 'INSUFFICIENT' ? 'Not enough evidence' : String(j.score))

function Match({ result }: { result: CalibrationResultView }) {
  if (result.error) return <Badge variant="destructive">Error: {result.error}</Badge>
  if (!result.completed) return <span className="text-muted-foreground">Waiting</span>
  if (result.exact) return <Badge>Exact</Badge>
  return result.withinOne ? <Badge variant="secondary">Within one</Badge> : <Badge variant="outline">Off</Badge>
}

export function CalibrationRunDialog({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [data, setData] = useState<CalibrationRunDetailResponse | null>(null)
  useEffect(() => {
    weeklyRequest<CalibrationRunDetailResponse>(`/api/admin/weekly/calibration/runs/${runId}`)
      .then(setData)
      .catch((e: unknown) => toast.error(errorMessage(e, 'Could not load the run')))
  }, [runId])
  const run = data?.run
  return (
    <Modal isOpen onClose={onClose} title={run ? `Run of ${run.model}` : 'Calibration run'} size="xl">
      {!data || !run ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="space-y-4">
          <p className="text-sm">
            {run.kind === 'SET' ? 'Calibration set' : `Re-score of ${run.cycleName ?? 'a quarter'}`} · {run.completed} of {run.itemCount} scored · prompt {run.promptVersion}
            {run.finishedAt ? ` · finished ${formatKarachiDateTime(run.finishedAt)}` : ''}
          </p>
          {run.summary && (
            <p className="text-sm">
              Exact {percent(run.summary.exactRate)} · within one level {percent(run.summary.withinOneRate)} · {run.summary.errors} errors ·{' '}
              {(run.summary.inputTokens + run.summary.outputTokens).toLocaleString()} tokens · {dollars(run.costUsd)} · average {run.summary.avgLatencyMs ?? '—'} ms
            </p>
          )}
          {run.summary?.failure && <p className="text-sm text-destructive">{run.summary.failure}</p>}
          {run.gate && <p className="text-sm">{run.gate.passed ? 'Passed the trust gate: this model’s scores can be accepted automatically.' : `Not passed: ${run.gate.reasons.join('; ')}.`}</p>}
          <div className="space-y-1">
            <h3 className="font-medium">Per topic</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1">Topic</th><th>Compared</th><th>Exact</th><th>Within one</th></tr></thead>
              <tbody>
                {(run.summary?.byTopic ?? []).map((t) => (
                  <tr key={t.topic} className="border-t"><td className="py-1">{t.topic}</td><td>{t.compared}</td><td>{percent(t.exact / t.compared)}</td><td>{percent(t.withinOne / t.compared)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-1">
            <h3 className="font-medium">Per item</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1">Item</th><th>Topic</th><th>Target</th><th>AI</th><th>Match</th></tr></thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="max-w-sm py-1">{r.label}{r.ai?.rationale ? <p className="text-xs text-muted-foreground">{r.ai.rationale}</p> : null}</td>
                    <td>{r.topic}</td>
                    <td>{judgement(r.target)}</td>
                    <td>{judgement(r.ai)}</td>
                    <td><Match result={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
