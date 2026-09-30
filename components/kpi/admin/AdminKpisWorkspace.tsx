'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuditTab } from './AuditTab'
import { GrantsTab } from './GrantsTab'
import { MonthsTab } from './MonthsTab'
import { OverviewTab } from './OverviewTab'
import { ResultsTab } from './ResultsTab'
import { SettersTab } from './SettersTab'
import { LeadHistoryTab } from './LeadHistoryTab'

export function AdminKpisWorkspace() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">KPIs</h1>
        <p className="mt-1 text-muted-foreground">Monthly deadlines, who sets whose KPIs, extra roles, results, corrections, the audit log and each person’s quarter result.</p>
      </div>
      <Tabs defaultValue="months">
        <TabsList>
          <TabsTrigger value="months">Months</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="lead-history">Lead history</TabsTrigger>
          <TabsTrigger value="setters">Setters</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="months"><MonthsTab /></TabsContent>
        <TabsContent value="results"><ResultsTab /></TabsContent>
        <TabsContent value="lead-history"><LeadHistoryTab /></TabsContent>
        <TabsContent value="setters"><SettersTab /></TabsContent>
        <TabsContent value="roles"><GrantsTab /></TabsContent>
        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  )
}
