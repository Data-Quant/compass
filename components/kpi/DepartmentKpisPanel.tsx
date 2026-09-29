'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { currentMonthKey, monthLabel, shiftMonth } from '@/lib/kpi/format'
import type { DepartmentViewResponse } from '@/lib/kpi/view-types'
import { DeadlineBanner } from './DeadlineBanner'
import { GoalEditor } from './GoalEditor'
import { PeriodSwitcher } from './PeriodSwitcher'
import { errorMessage, kpiRequest } from './kpi-api'

export function DepartmentKpisPanel({ allowPicker }: { allowPicker: boolean }) {
  const [monthKey, setMonthKey] = useState(() => currentMonthKey())
  const [departmentKey, setDepartmentKey] = useState<string | null>(null)
  const [data, setData] = useState<DepartmentViewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ month: monthKey })
      if (departmentKey) query.set('department', departmentKey)
      setData(await kpiRequest<DepartmentViewResponse>(`/api/kpi/department?${query.toString()}`))
      setError(null)
    } catch (e) {
      setError(errorMessage(e, 'Could not load department KPIs'))
    }
  }, [monthKey, departmentKey])

  useEffect(() => {
    void load()
  }, [load])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading department KPIs…</p>
  const department = data.department

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSwitcher label={monthLabel(monthKey)} onPrevious={() => setMonthKey(shiftMonth(monthKey, -1))} onNext={() => setMonthKey(shiftMonth(monthKey, 1))} />
        {allowPicker && data.departments.length > 1 && (
          <Select value={department.key} onValueChange={setDepartmentKey}>
            <SelectTrigger className="w-64" aria-label="Department"><SelectValue /></SelectTrigger>
            <SelectContent>
              {data.departments.map((option) => (
                <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <DeadlineBanner month={data.month} />
      <Card>
        <CardContent className="p-4 text-sm">
          <span className="font-medium">{`${department.label} leads and JPs: `}</span>
          {department.owners.map((person) => person.name).join(', ')}
        </CardContent>
      </Card>
      {data.canEdit && data.departmentsWithoutKpis.length > 0 && (
        <p className="text-sm text-muted-foreground">{`Departments without KPIs this month: ${data.departmentsWithoutKpis.join(', ')}`}</p>
      )}
      <GoalEditor
        goals={data.goals}
        editable={data.canEdit && !data.month.locked}
        ownerOptions={department.owners}
        defaultOwnerIds={department.owners.map((person) => person.id)}
        emptyMessage={data.canEdit && !data.month.locked ? 'No department goals yet. Add a goal, then its KPIs.' : 'No department KPIs for this month.'}
        createGoal={async (values) => {
          await kpiRequest('/api/kpi/goals', {
            method: 'POST',
            body: { monthKey, scope: 'DEPARTMENT', departmentKey: department.key, title: values.title, ...(values.description ? { description: values.description } : {}) },
          })
        }}
        onChanged={load}
      />
    </div>
  )
}
