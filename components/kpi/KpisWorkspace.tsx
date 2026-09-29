'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { MeResponse } from '@/lib/kpi/view-types'
import { DepartmentKpisPanel } from './DepartmentKpisPanel'
import { MyKpisPanel } from './MyKpisPanel'
import { TeamKpisPanel } from './TeamKpisPanel'
import { errorMessage, kpiRequest } from './kpi-api'

type TabId = 'mine' | 'team' | 'department'

export function KpisWorkspace() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    kpiRequest<MeResponse>('/api/kpi/me')
      .then(setMe)
      .catch((e: unknown) => setError(errorMessage(e, 'Could not load KPIs')))
  }, [])

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!me) return <LoadingScreen message="Loading KPIs..." />
  const caps = me.capabilities
  const tabs: TabId[] = [
    ...(caps?.inScheme && !caps.isLeadOrJp ? (['mine'] as const) : []),
    ...(caps?.isTeamSetter || caps?.isHr ? (['team'] as const) : []),
    ...(caps?.isLeadOrJp ? (['department', 'mine'] as const) : []),
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">KPIs</h1>
          <p className="mt-1 text-muted-foreground">
            Monthly goals with measurable KPIs. Only KPIs verified by the Execution team count toward the quarter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {caps?.isDepartmentSetter && (
            <Button asChild variant="outline"><Link href="/kpis/department">Set department KPIs</Link></Button>
          )}
          {caps?.isVerifier && (
            <Button asChild variant="outline"><Link href="/kpis/verify">Verification</Link></Button>
          )}
        </div>
      </div>
      {tabs.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You have no KPIs to set or track. KPIs apply to people in the profit-sharing scheme.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={tabs[0]}>
          <TabsList>
            {tabs.includes('department') && <TabsTrigger value="department">Department</TabsTrigger>}
            {tabs.includes('team') && <TabsTrigger value="team">Team</TabsTrigger>}
            {tabs.includes('mine') && <TabsTrigger value="mine">My KPIs</TabsTrigger>}
          </TabsList>
          {tabs.includes('department') && <TabsContent value="department"><DepartmentKpisPanel allowPicker={false} /></TabsContent>}
          {tabs.includes('team') && <TabsContent value="team"><TeamKpisPanel /></TabsContent>}
          {tabs.includes('mine') && <TabsContent value="mine"><MyKpisPanel /></TabsContent>}
        </Tabs>
      )}
    </div>
  )
}
