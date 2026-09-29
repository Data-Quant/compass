'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { weekLabel } from '@/lib/weekly/format'
import { PERSPECTIVE_LABELS, type Perspective } from '@/lib/weekly/perspectives'
import type { InboxPrompt, InboxResponse } from '@/lib/weekly/view-types'
import { AnswerCard } from './AnswerCard'
import { HistoryList } from './HistoryList'
import { WeeklyProgress } from './WeeklyProgress'
import { errorMessage, weeklyRequest, withActingAs } from './weekly-api'

interface PersonGroup { key: string; name: string; perspective: Perspective; prompts: InboxPrompt[] }

function groupByPerson(prompts: InboxPrompt[]): PersonGroup[] {
  const groups = new Map<string, PersonGroup>()
  for (const prompt of prompts) {
    const key = `${prompt.evaluatee.id}:${prompt.perspective}`
    const group = groups.get(key) ?? { key, name: prompt.evaluatee.name, perspective: prompt.perspective, prompts: [] }
    groups.set(key, { ...group, prompts: [...group.prompts, prompt] })
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function WeeklyInbox({ actingAs }: { actingAs?: string }) {
  const [data, setData] = useState<InboxResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<InboxResponse>(withActingAs('/api/weekly/inbox', actingAs)))
      setError(null)
      setVersion((v) => v + 1)
    } catch (e) {
      setError(errorMessage(e, 'Could not load your questions'))
    }
  }, [actingAs])

  useEffect(() => {
    setData(null)
    void load()
  }, [load])

  const groups = useMemo(() => groupByPerson(data?.prompts ?? []), [data])
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading questions…</p>
  if (!data.cycle) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Weekly evaluations are not running right now.</CardContent></Card>
  }
  const open = data.prompts.filter((p) => p.status !== 'SUBMITTED').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">{data.cycle.periodName} · {weekLabel(data.cycle)}</p>
        <p className="text-sm">{open === 0 ? 'All caught up' : `${open} question${open === 1 ? '' : 's'} to answer`}</p>
      </div>
      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">This week</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="space-y-6">
          {groups.length === 0 && <p className="text-sm text-muted-foreground">No questions right now. New ones arrive on Mondays.</p>}
          {groups.map((group) => (
            <section key={group.key} className="space-y-3">
              <h2 className="font-semibold">
                {group.name} <span className="text-sm font-normal text-muted-foreground">· {PERSPECTIVE_LABELS[group.perspective]}</span>
              </h2>
              {group.prompts.map((prompt) => (
                <AnswerCard key={`${prompt.id}-${prompt.status}-${version}`} prompt={prompt} actingAs={actingAs} onChanged={load} />
              ))}
            </section>
          ))}
        </TabsContent>
        <TabsContent value="history">
          <HistoryList key={version} actingAs={actingAs} />
        </TabsContent>
        <TabsContent value="progress">
          <WeeklyProgress progress={data.progress} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
