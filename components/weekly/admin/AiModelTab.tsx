'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatKarachiDateTime } from '@/lib/weekly/format'
import type { AiSettingsView } from '@/lib/weekly/service/ai-settings'
import { errorMessage, weeklyRequest } from '../weekly-api'

/** Which Fireworks model scores answers. HR reviews every score it gives. */
export function AiModelTab() {
  const [view, setView] = useState<AiSettingsView | null>(null)
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const next = await weeklyRequest<AiSettingsView>('/api/admin/weekly/ai-settings')
      setView(next)
      setModel(next.activeModel ?? '')
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the model settings'))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function save(value: string | null) {
    setSaving(true)
    try {
      await weeklyRequest('/api/admin/weekly/ai-settings', { method: 'POST', body: { model: value } })
      toast.success(value ? 'Model saved' : 'Using the default model')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the model'))
    } finally {
      setSaving(false)
    }
  }

  if (!view) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">Scoring model</p>
          {view.effectiveModel ? <Badge>{view.effectiveModel}</Badge> : <Badge variant="destructive">None: answers wait for you to score them</Badge>}
          {view.standInForced && <Badge variant="secondary">Stand-in model (preview)</Badge>}
        </div>
        {!view.apiKeyConfigured && !view.standInForced && <p className="text-sm text-destructive">No Fireworks API key is set for this site.</p>}
        <p className="text-sm text-muted-foreground">
          The model scores each answer from the statement the evaluator chose, their note and their earlier answers about the same person, staying within one level of the chosen statement. You review every score.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="ai-model">Fireworks model id</Label>
          <Input id="ai-model" value={model} placeholder={view.envModel ?? 'accounts/fireworks/models/…'} onChange={(e) => setModel(e.target.value)} />
          <p className="text-xs text-muted-foreground">Leave empty to use the site’s default{view.envModel ? ` (${view.envModel})` : ''}.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{view.updatedAt ? `Changed ${formatKarachiDateTime(view.updatedAt)}${view.updatedBy ? ` by ${view.updatedBy}` : ''}` : ''}</p>
          <div className="flex gap-2">
            {view.activeModel && <Button variant="outline" disabled={saving} onClick={() => void save(null)}>Use the default</Button>}
            <Button disabled={saving || model.trim() === (view.activeModel ?? '')} onClick={() => void save(model.trim() || null)}>Save model</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
