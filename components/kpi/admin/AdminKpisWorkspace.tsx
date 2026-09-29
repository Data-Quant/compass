'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GrantsTab } from './GrantsTab'
import { MonthsTab } from './MonthsTab'
import { OverviewTab } from './OverviewTab'
import { SettersTab } from './SettersTab'

export function AdminKpisWorkspace() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">KPIs</h1>
        <p className="mt-1 text-muted-foreground">Monthly deadlines, who sets whose KPIs, extra roles, and each person’s quarter result.</p>
      </div>
      <Tabs defaultValue="months">
        <TabsList>
          <TabsTrigger value="months">Months</TabsTrigger>
          <TabsTrigger value="setters">Setters</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>
        <TabsContent value="months"><MonthsTab /></TabsContent>
        <TabsContent value="setters"><SettersTab /></TabsContent>
        <TabsContent value="roles"><GrantsTab /></TabsContent>
        <TabsContent value="overview"><OverviewTab /></TabsContent>
      </Tabs>
    </div>
  )
}
