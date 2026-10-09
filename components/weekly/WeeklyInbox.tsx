'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { weekLabel } from '@/lib/weekly/format'
import { RELATIONSHIP_WORDS, type Perspective } from '@/lib/weekly/perspectives'
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

const DUE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', weekday: 'long', day: 'numeric', month: 'short' })
/** The Sunday that ends the week: "Sunday 11 Oct". */
function dueDate(weekOneStartsOn: string, week: number): string {
  return DUE.format(new Date(new Date(weekOneStartsOn).getTime() + week * 7 * 86_400_000 - 1)).replace(',', '')
}

/** UX spec, section 5: "Submit this week", enabled once every performance question has an answer. */
function SubmitWeek({ submittedAt, unanswered, actingAs, onSubmitted }: { submittedAt: string | null; unanswered: number; actingAs?: string; onSubmitted: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  if (submittedAt) {
    return (
      <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        Submitted. You can edit until Sunday. Next questions Monday.
      </p>
    )
  }
  async function submit() {
    setBusy(true)
    try {
      await weeklyRequest(withActingAs('/api/weekly/inbox', actingAs), { method: 'POST', body: {} })
      toast.success('Week submitted')
      await onSubmitted()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not submit the week'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
      {unanswered > 0 && <p className="text-sm text-muted-foreground">Answer {unanswered === 1 ? 'the last question' : `the other ${unanswered} questions`} to submit.</p>}
      <Button disabled={busy || unanswered > 0} onClick={() => void submit()}>{busy ? 'Submitting…' : 'Submit this week'}</Button>
    </div>
  )
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

  const week = data?.cycle?.currentWeek ?? 0
  // UX spec, section 5: questions missed in earlier weeks sit at the top, marked; this week's below, by person.
  const isCarried = useCallback((p: InboxPrompt) => p.weekIndex < week && p.status !== 'SUBMITTED', [week])
  const carried = useMemo(() => groupByPerson((data?.prompts ?? []).filter(isCarried)), [data, isCarried])
  const groups = useMemo(() => groupByPerson((data?.prompts ?? []).filter((p) => !isCarried(p))), [data, isCarried])
  // Section 8: one question at a time, missed ones first (oldest first), then this week's by person.
  const queue = useMemo(() => [
    ...(data?.prompts ?? []).filter(isCarried).sort((a, b) => a.weekIndex - b.weekIndex),
    ...groups.flatMap((g) => g.prompts),
  ], [data, isCarried, groups])
  const [index, setIndex] = useState(0)
  const [allAtOnce, setAllAtOnce] = useState(false)
  const at = Math.min(index, Math.max(0, queue.length - 1))
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading questions…</p>
  if (!data.cycle) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Weekly evaluations are not running right now.</CardContent></Card>
  }
  if (data.cycle.status === 'CLOSED') {
    return (
      <div className="space-y-4">
        <Card><CardContent className="space-y-1 p-5 text-sm"><p className="font-medium">{data.cycle.periodName} round closed. HR will share your report.</p><p className="text-muted-foreground">Your answers are below, read-only.</p></CardContent></Card>
        <HistoryList key={version} actingAs={actingAs} />
      </div>
    )
  }
  const open = data.prompts.filter((p) => p.status !== 'SUBMITTED').length
  const thisWeek = data.prompts.filter((p) => p.weekIndex === week)
  const doneThisWeek = thisWeek.filter((p) => p.status === 'SUBMITTED').length
  const carriedCount = carried.reduce((n, g) => n + g.prompts.length, 0)
  const due = dueDate(data.cycle.weekOneStartsOn, week)
  // The comment questions are optional; every performance question needs an answer (or "not observed") to submit.
  const unanswered = data.prompts.filter((p) => p.kind === 'STANDARD' && p.status !== 'SUBMITTED').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">{data.cycle.periodName} · {weekLabel(data.cycle)}</p>
        <p className="text-sm">{thisWeek.length ? `This week: ${doneThisWeek} of ${thisWeek.length} done · due ${due}` : open === 0 ? 'All caught up' : `${open} question${open === 1 ? '' : 's'} to answer`}</p>
      </div>
      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">This week</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="space-y-6">
          {queue.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{allAtOnce ? `${queue.length} questions` : `This week · ${at + 1} of ${queue.length} · due ${due}`}</p>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setAllAtOnce((v) => !v)}>{allAtOnce ? 'One at a time' : 'See all at once'}</Button>
            </div>
          )}
          {!allAtOnce && queue.length > 0 && (
            <div className="space-y-3">
              {isCarried(queue[at]) && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">From last week</p>}
              <AnswerCard key={`${queue[at].id}-${queue[at].status}-${version}`} prompt={queue[at]} actingAs={actingAs} onChanged={load} />
              <div className="flex justify-between gap-2">
                <Button variant="outline" disabled={at === 0} onClick={() => setIndex(at - 1)}>Back</Button>
                <Button variant={queue[at].status === 'SUBMITTED' ? 'default' : 'outline'} disabled={at >= queue.length - 1} onClick={() => setIndex(at + 1)}>Next</Button>
              </div>
            </div>
          )}
          {allAtOnce && carriedCount > 0 && (
            <section className="space-y-4 rounded-lg border border-amber-300 p-4 dark:border-amber-800">
              <h2 className="font-semibold">{carriedCount} unanswered from last week <span className="text-sm font-normal text-muted-foreground">· they count like any other; this week’s set is not doubled</span></h2>
              {carried.map((group) => (
                <div key={group.key} className="space-y-3">
                  <h3 className="text-sm font-semibold">{group.name} <span className="font-normal text-muted-foreground">· {RELATIONSHIP_WORDS[group.perspective]} · From last week</span></h3>
                  {group.prompts.map((prompt) => <AnswerCard key={`${prompt.id}-${prompt.status}-${version}`} prompt={prompt} actingAs={actingAs} onChanged={load} />)}
                </div>
              ))}
            </section>
          )}
          {queue.length === 0 && <p className="text-sm text-muted-foreground">No questions right now. New ones arrive on Mondays.</p>}
          {allAtOnce && groups.map((group) => (
            <section key={group.key} className="space-y-3">
              <h2 className="font-semibold">
                {group.name} <span className="text-sm font-normal text-muted-foreground">· {RELATIONSHIP_WORDS[group.perspective]}</span>
              </h2>
              {group.prompts.map((prompt) => (
                <AnswerCard key={`${prompt.id}-${prompt.status}-${version}`} prompt={prompt} actingAs={actingAs} onChanged={load} />
              ))}
            </section>
          ))}
          {data.prompts.length > 0 && (
            <SubmitWeek submittedAt={data.weekSubmittedAt ?? null} unanswered={unanswered} actingAs={actingAs} onSubmitted={load} />
          )}
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
