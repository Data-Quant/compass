'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PERSPECTIVE_ORDER, type Perspective } from '@/lib/weekly/perspectives'
import type { ContentResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { TopicCard } from './TopicCard'

const SECTION_TITLES: Record<Perspective, string> = {
  LEAD: 'Lead about their report',
  UPWARD: 'Team member about their lead',
  PEER: 'Peer about a peer',
}

export function ContentTab() {
  const [data, setData] = useState<ContentResponse | null>(null)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<ContentResponse>('/api/admin/weekly/content'))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load topics'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function sync() {
    setSyncing(true)
    try {
      const result = await weeklyRequest<{ created: number; relinked: number; deactivated: number }>('/api/admin/weekly/content/sync', { method: 'POST' })
      toast.success(`Synced: ${result.created} new, ${result.relinked} relinked, ${result.deactivated} retired`)
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not sync the question bank'))
    } finally {
      setSyncing(false)
    }
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading topics…</p>
  const ready = data.competencies.filter((c) => c.ready).length
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data.competencies.length} topics · {ready} approved. Only approved topics are asked, and every score records the profile version it used.
        </p>
        <Button variant="outline" disabled={syncing} onClick={() => void sync()}>{syncing ? 'Syncing…' : 'Sync from the question bank'}</Button>
      </div>
      {data.competencies.length === 0 && <p className="text-sm text-muted-foreground">No topics yet. Sync from the question bank to load the drafts.</p>}
      {PERSPECTIVE_ORDER.map((perspective) => {
        const topics = data.competencies.filter((c) => c.perspective === perspective)
        if (topics.length === 0) return null
        return (
          <section key={perspective} className="space-y-3">
            <h2 className="text-lg font-semibold">{SECTION_TITLES[perspective]}</h2>
            {topics.map((topic) => <TopicCard key={topic.id} topic={topic} onChanged={load} />)}
          </section>
        )
      })}
    </div>
  )
}
