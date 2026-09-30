'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { currentMonthKey, monthLabel, shiftMonth } from '@/lib/kpi/format'
import type { TeamViewResponse } from '@/lib/kpi/view-types'
import { DeadlineBanner } from './DeadlineBanner'
import { GoalEditor } from './GoalEditor'
import { NextMonthPrompt } from './NextMonthPrompt'
import { PeriodSwitcher } from './PeriodSwitcher'
import { errorMessage, kpiRequest } from './kpi-api'

export function TeamKpisPanel() {
  const [monthKey, setMonthKey] = useState(() => currentMonthKey())
  const [setterId, setSetterId] = useState<string | null>(null)
  const [data, setData] = useState<TeamViewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ month: monthKey })
      if (setterId) query.set('setterId', setterId)
      setData(await kpiRequest<TeamViewResponse>(`/api/kpi/team?${query.toString()}`))
      setError(null)
    } catch (e) {
      setError(errorMessage(e, 'Could not load team KPIs'))
    }
  }, [monthKey, setterId])

  useEffect(() => {
    void load()
  }, [load])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading team KPIs…</p>
  const setter = data.setter

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSwitcher label={monthLabel(monthKey)} onPrevious={() => setMonthKey(shiftMonth(monthKey, -1))} onNext={() => setMonthKey(shiftMonth(monthKey, 1))} />
        {data.setters && (
          <Select value={setter?.id ?? ''} onValueChange={setSetterId}>
            <SelectTrigger className="w-64" aria-label="Team lead"><SelectValue placeholder="Choose a lead" /></SelectTrigger>
            <SelectContent>
              {data.setters.map((person) => (
                <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <DeadlineBanner month={data.month} />
      {setter && data.month.locked && <NextMonthPrompt monthKey={monthKey} onOpen={setMonthKey} />}
      {setter ? (
        <>
          <Card>
            <CardContent className="p-4 text-sm">
              <span className="font-medium">{`Team of ${setter.name}: `}</span>
              {data.team.length ? data.team.map((person) => person.name).join(', ') : 'nobody yet'}
            </CardContent>
          </Card>
          <GoalEditor
            goals={data.goals}
            editable={!data.month.locked}
            ownerOptions={data.team}
            defaultOwnerIds={[]}
            emptyMessage={data.month.locked ? 'No team KPIs were set for this month.' : 'No team goals yet. Add a goal, then its KPIs.'}
            createGoal={async (values) => {
              await kpiRequest('/api/kpi/goals', {
                method: 'POST',
                body: { monthKey, scope: 'TEAM', setterId: setter.id, title: values.title, ...(values.description ? { description: values.description } : {}) },
              })
            }}
            onChanged={load}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Choose a lead to see their team KPIs.</p>
      )}
    </div>
  )
}
