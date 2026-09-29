'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AllKpisTab } from './verify/AllKpisTab'
import { ChangeRequestsTab } from './verify/ChangeRequestsTab'
import { QueueTab } from './verify/QueueTab'

export function VerifyWorkspace() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">KPI verification</h1>
        <p className="mt-1 text-muted-foreground">
          Claims to check, change requests to decide, and every KPI by month. You never decide KPIs you own, set or claimed.
        </p>
      </div>
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="changes">Change requests</TabsTrigger>
          <TabsTrigger value="all">All KPIs</TabsTrigger>
        </TabsList>
        <TabsContent value="queue"><QueueTab /></TabsContent>
        <TabsContent value="changes"><ChangeRequestsTab /></TabsContent>
        <TabsContent value="all"><AllKpisTab /></TabsContent>
      </Tabs>
    </div>
  )
}
