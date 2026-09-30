'use client'

import { Card, CardContent } from '@/components/ui/card'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import type { AiCostView, StandardsUsedView } from '@/lib/weekly/view-types'
import { dollars } from './numbers'

const STATUS_LABELS: Record<StandardsUsedView['versions'][number]['status'], string> = { APPROVED: 'current', RETIRED: 'retired', DRAFT: 'draft' }

export function AiCostSection({ cost }: { cost: AiCostView }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <h2 className="font-semibold">AI cost this quarter</h2>
        <p className="text-lg font-semibold">{dollars(cost.usd)}</p>
        <p className="text-sm text-muted-foreground">{cost.inputTokens.toLocaleString()} input and {cost.outputTokens.toLocaleString()} output tokens, re-scores included.</p>
        {cost.unpricedModels.length > 0 && <p className="text-sm">No price is set for {cost.unpricedModels.join(', ')}: add it on the AI model tab.</p>}
        {cost.byModel.length > 1 && (
          <ul className="text-sm">{cost.byModel.map((m) => <li key={m.model}><span className="font-mono text-xs">{m.model}</span>: {dollars(m.usd)}</li>)}</ul>
        )}
      </CardContent>
    </Card>
  )
}

export function StandardsSection({ standards }: { standards: StandardsUsedView[] }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <h2 className="font-semibold">Standards used this quarter</h2>
        <p className="text-sm text-muted-foreground">The profile versions each topic’s answers were scored against.</p>
        {standards.length === 0 ? <p className="text-sm">No answers have been scored yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Topic</th><th>Group</th><th>Versions</th></tr></thead>
            <tbody>
              {standards.map((s) => (
                <tr key={`${s.perspective}-${s.topic}`} className="border-t">
                  <td className="py-1">{s.topic}</td>
                  <td>{PERSPECTIVE_LABELS[s.perspective]}</td>
                  <td>{s.versions.map((v) => `v${v.version} (${STATUS_LABELS[v.status]}): ${v.answers} answer${v.answers === 1 ? '' : 's'}`).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
