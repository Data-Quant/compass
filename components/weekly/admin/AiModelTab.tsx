'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { AiSettingsResponse, CalibrationItemsResponse, CalibrationRunsResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { ActiveModelCard } from './ActiveModelCard'
import { CalibrationRunsCard } from './CalibrationRunsCard'
import { CalibrationSetCard } from './CalibrationSetCard'

export function AiModelTab() {
  const [settings, setSettings] = useState<AiSettingsResponse | null>(null)
  const [items, setItems] = useState<CalibrationItemsResponse | null>(null)
  const [runs, setRuns] = useState<CalibrationRunsResponse | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, i, r] = await Promise.all([
        weeklyRequest<AiSettingsResponse>('/api/admin/weekly/ai-settings'),
        weeklyRequest<CalibrationItemsResponse>('/api/admin/weekly/calibration/items'),
        weeklyRequest<CalibrationRunsResponse>('/api/admin/weekly/calibration/runs'),
      ])
      setSettings(s)
      setItems(i)
      setRuns(r)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the AI model settings'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!settings || !items || !runs) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="space-y-4">
      <ActiveModelCard settings={settings} onChanged={load} />
      <CalibrationSetCard data={items} onChanged={load} />
      <CalibrationRunsCard runs={runs.runs} standInAvailable={settings.standInAvailable} onChanged={load} />
    </div>
  )
}
