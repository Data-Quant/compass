'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { WeeklyMeResponse } from '@/lib/weekly/view-types'
import { weeklyRequest } from '../weekly-api'
import { ContentTab } from './ContentTab'
import { PeopleTab } from './PeopleTab'
import { SetupTab } from './SetupTab'
import { TestToolsTab } from './TestToolsTab'

export function AdminWeeklyWorkspace() {
  const [testTools, setTestTools] = useState(false)
  useEffect(() => {
    weeklyRequest<WeeklyMeResponse>('/api/weekly/me').then((me) => setTestTools(Boolean(me.testTools))).catch(() => setTestTools(false))
  }, [])
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Weekly evaluations</h1>
        <p className="mt-1 text-muted-foreground">Set up the quarter, approve the topics, questions and 1–4 profiles answers are scored against, and see who takes part.</p>
      </div>
      <Tabs defaultValue="setup">
        <TabsList>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="content">Topics and profiles</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          {testTools && <TabsTrigger value="test">Test tools</TabsTrigger>}
        </TabsList>
        <TabsContent value="setup"><SetupTab /></TabsContent>
        <TabsContent value="content"><ContentTab /></TabsContent>
        <TabsContent value="people"><PeopleTab /></TabsContent>
        {testTools && <TabsContent value="test"><TestToolsTab /></TabsContent>}
      </Tabs>
    </div>
  )
}
