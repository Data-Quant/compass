'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatKarachiDateTime } from '@/lib/weekly/format'
import type { AiSettingsResponse, ModelGateView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

export function GateBadge({ gate }: { gate: ModelGateView | undefined }) {
  if (gate?.standIn) return <Badge variant="secondary">Stand-in (always trusted)</Badge>
  return gate?.trusted ? <Badge>Calibrated</Badge> : <Badge variant="destructive">Not calibrated</Badge>
}

export function ActiveModelCard({ settings, onChanged }: { settings: AiSettingsResponse; onChanged: () => Promise<void> }) {
  const [model, setModel] = useState(settings.activeModel ?? '')
  const [priceModel, setPriceModel] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const gates = new Map(settings.gates.map((g) => [g.model, g]))

  async function post(body: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(true)
    try {
      await weeklyRequest('/api/admin/weekly/ai-settings', { method: 'POST', body })
      toast.success(success)
      await onChanged()
      return true
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveModel(event: FormEvent) {
    event.preventDefault()
    const chosen = model.trim()
    await post({ action: 'set-active', model: chosen || null }, chosen ? 'Active model saved' : 'Active model cleared')
  }

  async function savePrice(event: FormEvent) {
    event.preventDefault()
    if (await post({ action: 'set-price', model: priceModel.trim(), inputPerMillion: Number(input), outputPerMillion: Number(output) }, 'Price saved')) {
      setPriceModel('')
      setInput('')
      setOutput('')
    }
  }

  const effective = settings.effectiveModel
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1">
          <h2 className="font-semibold">Scoring model</h2>
          <p className="text-sm">
            {effective
              ? <>Answers are scored with <span className="font-mono">{effective}</span> <GateBadge gate={gates.get(effective)} /></>
              : 'No model is available: set FIREWORKS_API_KEY. Until then answers wait in Review as “Scoring failed”.'}
          </p>
          {settings.standInForced && <p className="text-sm text-muted-foreground">This preview forces the stand-in model (WEEKLY_AI_FAKE), whatever is set below.</p>}
          <p className="text-xs text-muted-foreground">A score from a model that has not passed calibration is never accepted automatically: it waits in Review as “Model not yet calibrated”.</p>
        </div>
        <form onSubmit={saveModel} className="flex flex-wrap items-end gap-2">
          <div className="min-w-80 flex-1 space-y-1">
            <Label htmlFor="ai-active-model">Active model</Label>
            <Input id="ai-active-model" placeholder={settings.envModel ?? 'accounts/fireworks/models/…'} value={model} onChange={(e) => setModel(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the deployment default{settings.envModel ? ` (${settings.envModel})` : ''}.
              {settings.updatedAt ? ` Last changed ${formatKarachiDateTime(settings.updatedAt)} by ${settings.updatedBy ?? 'HR'}.` : ''}
            </p>
          </div>
          <Button type="submit" disabled={busy}>Save active model</Button>
        </form>
        <div className="space-y-2">
          <h3 className="font-medium">Models and prices</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Model</th><th>Input $ / M tokens</th><th>Output $ / M tokens</th><th>Calibration</th><th /></tr></thead>
            <tbody>
              {settings.gates.map((gate) => {
                const price = settings.prices.find((p) => p.model === gate.model)
                return (
                  <tr key={gate.model} className="border-t align-top">
                    <td className="py-1 font-mono text-xs">{gate.model}</td>
                    <td>{price ? price.inputPerMillion : '—'}</td>
                    <td>{price ? price.outputPerMillion : '—'}</td>
                    <td>
                      <GateBadge gate={gate} />
                      {!gate.trusted && gate.reasons.length > 0 && <p className="text-xs text-muted-foreground">{gate.reasons.join(' · ')}</p>}
                    </td>
                    <td className="text-right">
                      {price && (
                        <Button size="sm" variant="ghost" disabled={busy} aria-label={`Remove the price for ${gate.model}`} onClick={() => void post({ action: 'remove-price', model: gate.model }, 'Price removed')}>
                          Remove price
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <form onSubmit={savePrice} className="flex flex-wrap items-end gap-2">
            <div className="min-w-72 flex-1 space-y-1">
              <Label htmlFor="ai-price-model">Priced model</Label>
              <Input id="ai-price-model" value={priceModel} onChange={(e) => setPriceModel(e.target.value)} placeholder="accounts/fireworks/models/…" required />
            </div>
            <div className="w-44 space-y-1">
              <Label htmlFor="ai-price-input">Input $ per million tokens</Label>
              <Input id="ai-price-input" type="number" min={0} step="0.01" value={input} onChange={(e) => setInput(e.target.value)} required />
            </div>
            <div className="w-44 space-y-1">
              <Label htmlFor="ai-price-output">Output $ per million tokens</Label>
              <Input id="ai-price-output" type="number" min={0} step="0.01" value={output} onChange={(e) => setOutput(e.target.value)} required />
            </div>
            <Button type="submit" variant="outline" disabled={busy}>Save price</Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
