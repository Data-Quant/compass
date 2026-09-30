'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { WeeklyMeResponse } from '@/lib/weekly/view-types'
import { weeklyRequest } from '../weekly-api'
import { AiModelTab } from './AiModelTab'
import { ChallengesTab } from './ChallengesTab'
import { CloseTab } from './CloseTab'
import { ContentTab } from './ContentTab'
import { DashboardTab } from './DashboardTab'
import { PeopleTab } from './PeopleTab'
import { ReviewTab } from './ReviewTab'
import { SetupTab } from './SetupTab'
import { TestToolsTab } from './TestToolsTab'

const TABS = ['setup', 'content', 'people', 'review', 'dashboard', 'ai', 'close', 'challenges', 'test'] as const
type Tab = (typeof TABS)[number]
const isTab = (value: string | null): value is Tab => value !== null && (TABS as readonly string[]).includes(value)

export function AdminWeeklyWorkspace() {
  const [testTools, setTestTools] = useState(false)
  const [tab, setTab] = useState<Tab>('setup')
  useEffect(() => {
    weeklyRequest<WeeklyMeResponse>('/api/weekly/me').then((me) => setTestTools(Boolean(me.testTools))).catch(() => setTestTools(false))
    // HR emails link straight to a tab (?tab=review, ?tab=dashboard).
    const requested = new URLSearchParams(window.location.search).get('tab')
    if (isTab(requested)) setTab(requested)
  }, [])
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Weekly evaluations</h1>
        <p className="mt-1 text-muted-foreground">Set up the quarter, approve the topics and 1–4 profiles answers are scored against, review the AI’s scores and follow coverage.</p>
      </div>
      <Tabs value={tab} onValueChange={(value) => isTab(value) && setTab(value)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="content">Topics and profiles</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="ai">AI model</TabsTrigger>
          <TabsTrigger value="close">Close quarter</TabsTrigger>
          <TabsTrigger value="challenges">Challenges</TabsTrigger>
          {testTools && <TabsTrigger value="test">Test tools</TabsTrigger>}
        </TabsList>
        <TabsContent value="setup"><SetupTab /></TabsContent>
        <TabsContent value="content"><ContentTab /></TabsContent>
        <TabsContent value="people"><PeopleTab /></TabsContent>
        <TabsContent value="review"><ReviewTab /></TabsContent>
        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="ai"><AiModelTab /></TabsContent>
        <TabsContent value="close"><CloseTab /></TabsContent>
        <TabsContent value="challenges"><ChallengesTab /></TabsContent>
        {testTools && <TabsContent value="test"><TestToolsTab /></TabsContent>}
      </Tabs>
    </div>
  )
}
