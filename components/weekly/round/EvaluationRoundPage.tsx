'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronRight, Circle, CircleDot, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatKarachiDate } from '@/lib/weekly/format'
import { ROUND_STAGE_LABELS, ROUND_STAGES } from '@/lib/weekly/round-stage'
import { cn } from '@/lib/utils'
import type { RoundChecklistItem, RoundSummary, RoundView, WeeklyMeResponse } from '@/lib/weekly/view-types'
import { QuarterEvaluationsWorkspace } from '../form-tables/QuarterEvaluationsWorkspace'
import { AiModelTab } from '../admin/AiModelTab'
import { CloseTab } from '../admin/CloseTab'
import { ContentTab } from '../admin/ContentTab'
import { DashboardTab } from '../admin/DashboardTab'
import { PeopleTab } from '../admin/PeopleTab'
import { ReviewTab } from '../admin/ReviewTab'
import { SelfReviewsTab } from '../admin/SelfReviewsTab'
import { SurveyTab } from '../admin/SurveyTab'
import { TestToolsTab } from '../admin/TestToolsTab'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { RoundCycleContext } from './RoundContext'
import { RoundResultsCard } from './RoundResultsCard'
import { SetupRoundDialog } from './SetupRoundDialog'

type Tab = RoundChecklistItem['tab']
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'overview', label: 'Overview' }, { value: 'people', label: 'People' }, { value: 'progress', label: 'Progress' }, { value: 'review', label: 'Review answers' }, { value: 'self-reviews', label: 'Self-evaluations' },
  { value: 'forms', label: 'Quarter-end forms' }, { value: 'results', label: 'Close and release' }, { value: 'advanced', label: 'Advanced' },
]

function Stepper({ view }: { view: RoundView }) {
  const current = ROUND_STAGES.indexOf(view.stage)
  return (
    <ol className="flex flex-wrap items-center gap-1 text-sm" aria-label="Round stages">
      {ROUND_STAGES.map((stage, i) => (
        <li key={stage} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          <span className={`flex items-center gap-1 ${i === current ? 'font-semibold text-foreground' : 'text-muted-foreground'}`} aria-current={i === current ? 'step' : undefined}>
            {i < current ? <Check className="h-3.5 w-3.5" aria-hidden /> : i === current ? <CircleDot className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}
            {ROUND_STAGE_LABELS[stage]}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** UX spec, section 4: HR runs the whole round from here. It always says what is next, with one button for it. */
/** HR's overview while the round runs: the week, how much is answered, who is behind, and what waits on HR. */
function RoundHealthPanel({ view, onOpen }: { view: RoundView; onOpen: (tab: Tab) => void }) {
  const health = view.health!
  const week = view.currentWeek ?? 1
  // A round opened ahead of week 1 has not started its questions yet.
  const started = Date.now() >= new Date(view.weekOneStartsOn).getTime()
  const answeredShare = health.asked ? Math.round((health.answered / health.asked) * 100) : 0
  const tiles: Array<{ label: string; value: string; hint: string; tab: Tab | null; alert: boolean }> = [
    { label: 'Answered', value: `${answeredShare}%`, hint: `${health.answered} of ${health.asked} questions so far`, tab: 'progress', alert: false },
    { label: 'Behind', value: String(health.behind), hint: '2 or more weeks behind', tab: 'progress', alert: health.behind > 0 },
    { label: 'Waiting for you', value: String(health.waitingReview), hint: 'answers to review', tab: 'review', alert: health.waitingReview > 0 },
    { label: 'Requests', value: String(health.openRequests), hint: health.unreadSelfReviews ? `list changes · ${health.unreadSelfReviews} self-evaluations unread` : 'list changes waiting', tab: 'people', alert: health.openRequests > 0 },
  ]
  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-xl font-semibold">{started ? `Week ${week} of ${view.totalWeeks}` : `Questions start ${formatKarachiDate(view.weekOneStartsOn)}`}</p>
            <p className="text-sm text-muted-foreground">closes {formatKarachiDate(view.closesOn)}</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full origin-left rounded-full bg-primary transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]" style={{ transform: `scaleX(${started ? week / view.totalWeeks : 0})` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <button
              key={t.label}
              type="button"
              disabled={!t.tab}
              onClick={() => t.tab && onOpen(t.tab)}
              className="group rounded-xl border border-border/70 p-4 text-left transition-[border-color,background-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-border hover:bg-muted/40 active:scale-[0.99]"
            >
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.label}</p>
              <p className={cn('mt-1 text-2xl font-semibold tabular-nums', t.alert ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>{t.value}</p>
              <p className="text-xs text-muted-foreground">{t.hint}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function EvaluationRoundPage() {
  const [rounds, setRounds] = useState<RoundSummary[] | null>(null)
  const [periodId, setPeriodId] = useState('')
  const [view, setView] = useState<RoundView | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [advanced, setAdvanced] = useState('content')
  const [settingUp, setSettingUp] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [locking, setLocking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testTools, setTestTools] = useState(false)

  const loadRounds = useCallback(async (select?: string) => {
    try {
      const result = await weeklyRequest<{ rounds: RoundSummary[] }>('/api/admin/rounds')
      setRounds(result.rounds)
      const preferred = select ?? result.rounds.find((r) => r.stage === 'OPEN')?.periodId ?? result.rounds[0]?.periodId ?? ''
      setPeriodId(preferred)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the rounds'))
    }
  }, [])
  const loadView = useCallback(async () => {
    if (!periodId) return setView(null)
    try {
      setView(await weeklyRequest<RoundView>(`/api/admin/rounds/${periodId}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the round'))
    }
  }, [periodId])

  useEffect(() => {
    void loadRounds()
    weeklyRequest<WeeklyMeResponse>('/api/weekly/me').then((me) => setTestTools(Boolean(me.testTools))).catch(() => setTestTools(false))
    const requested = new URLSearchParams(window.location.search).get('tab')
    if (TABS.some((t) => t.value === requested)) setTab(requested as Tab)
    const sub = new URLSearchParams(window.location.search).get('sub')
    if (sub) setAdvanced(sub)
  }, [loadRounds])
  useEffect(() => {
    void loadView()
  }, [loadView])

  async function act(action: 'open-review' | 'open-round') {
    setBusy(true)
    try {
      await weeklyRequest(`/api/admin/rounds/${periodId}`, { method: 'POST', body: { action } })
      toast.success(action === 'open-review' ? 'Review stage open. Everyone can now check their lists.' : 'Round open. Weekly questions start on week 1.')
      setConfirming(false)
      await loadRounds(periodId)
      await loadView()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not move the round on'))
    } finally {
      setBusy(false)
    }
  }

  async function setLock(locked: boolean) {
    setBusy(true)
    try {
      await weeklyRequest(`/api/admin/rounds/${periodId}`, { method: 'POST', body: { action: locked ? 'lock' : 'unlock' } })
      toast.success(locked ? 'Round locked' : 'Round unlocked')
      setLocking(false)
      await loadView()
    } catch (e) {
      toast.error(errorMessage(e, locked ? 'Could not lock the round' : 'Could not unlock the round'))
    } finally {
      setBusy(false)
    }
  }

  function primary() {
    const next = view?.next
    if (!next) return
    if (next.action === 'close-round' || next.action === 'release') setTab('results')
    else setConfirming(true)
  }

  const pending = view?.checklist.find((c) => c.key === 'requests')?.count ?? 0
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Evaluation round{view ? ` · ${view.name}` : ''}</h1>
          <p className="mt-1 text-muted-foreground">Run the quarter&apos;s evaluations from here, one step at a time.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rounds && rounds.length > 1 && (
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger className="w-56" aria-label="Round"><SelectValue /></SelectTrigger>
              <SelectContent>{rounds.map((r) => <SelectItem key={r.periodId} value={r.periodId}>{r.name} · {ROUND_STAGE_LABELS[r.stage]}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={() => setSettingUp(true)}>Set up a new round</Button>
        </div>
      </div>

      {rounds && rounds.length === 0 && (
        <Card><CardContent className="space-y-3 p-6">
          <p className="font-semibold">No evaluation round yet</p>
          <p className="text-sm text-muted-foreground">Set up a round for the quarter: its dates, when weekly questions start, and how many weeks they run.</p>
          <Button onClick={() => setSettingUp(true)}>Set up round</Button>
        </CardContent></Card>
      )}

      {view && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <Stepper view={view} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{view.next ? 'Next step' : 'Done'}</p>
                <p className="text-sm text-muted-foreground">{view.next?.sentence ?? 'This round has been released.'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Weekly questions from {formatKarachiDate(view.weekOneStartsOn)} for {view.questionWeeks} weeks, plus 2 catch-up weeks; closes {formatKarachiDate(view.closesOn)}
                  {view.reviewDeadline ? ` · review stage ends ${formatKarachiDate(view.reviewDeadline)}` : ''}
                  {view.currentWeek ? ` · now in week ${view.currentWeek}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {view.locked && <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" aria-hidden /> Locked</Badge>}
                {view.stage !== 'DRAFT' && view.stage !== 'REVIEW' && (
                  <Button variant="outline" disabled={busy} onClick={() => setLocking(true)}>{view.locked ? 'Unlock' : 'Lock'}</Button>
                )}
                {view.next && (
                  <Button disabled={busy} variant={view.next.action === 'close-round' && (view.currentWeek ?? 0) < view.totalWeeks ? 'outline' : 'default'} onClick={primary}>
                    {view.next.label}
                  </Button>
                )}
              </div>
            </div>
            {view.checklist.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {view.checklist.map((item) => (
                  <li key={item.key}>
                    <button type="button" onClick={() => setTab(item.tab)} className="rounded-full">
                      <Badge variant={item.done ? 'secondary' : 'outline'} className="gap-1">{item.done ? <Check className="h-3 w-3" aria-hidden /> : null}{item.label}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {view && (
        <RoundCycleContext.Provider value={view.cycleId}>
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <TabsList className="flex-wrap">{TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList>
            <TabsContent value="overview" className="space-y-4 pt-4">
              {view.health && view.currentWeek && <RoundHealthPanel view={view} onOpen={setTab} />}
              <Card><CardContent className="space-y-2 p-4 text-sm">
                <p><span className="font-medium">Quarter:</span> {formatKarachiDate(view.startDate)} to {formatKarachiDate(view.endDate)}</p>
                <p><span className="font-medium">Stage:</span> {ROUND_STAGE_LABELS[view.stage]}{view.reviewOpenedAt ? ` · review stage opened ${formatKarachiDate(view.reviewOpenedAt)}` : ''}</p>
                {view.checklist.length === 0 ? <p className="text-muted-foreground">Nothing is waiting on you at this stage.</p> : (
                  <ul className="list-disc pl-5">{view.checklist.map((c) => <li key={c.key}>{c.label}</li>)}</ul>
                )}
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="people" className="pt-4"><PeopleTab /></TabsContent>
            <TabsContent value="progress" className="pt-4"><DashboardTab /></TabsContent>
            <TabsContent value="review" className="pt-4"><ReviewTab /></TabsContent>
            <TabsContent value="self-reviews" className="pt-4"><SelfReviewsTab periodId={view.periodId} /></TabsContent>
            <TabsContent value="forms" className="pt-4"><QuarterEvaluationsWorkspace /></TabsContent>
            <TabsContent value="results" className="space-y-4 pt-4">
              <CloseTab />
              <RoundResultsCard key={view.periodId} periodId={view.periodId} onReleased={async () => { await loadRounds(view.periodId); await loadView() }} />
            </TabsContent>
            <TabsContent value="advanced" className="pt-4">
              <Tabs value={advanced} onValueChange={setAdvanced}>
                <TabsList className="flex-wrap">
                  <TabsTrigger value="content">Questions</TabsTrigger>
                  <TabsTrigger value="ai">AI model</TabsTrigger>
                  <TabsTrigger value="survey">Pulse survey</TabsTrigger>
                  {testTools && <TabsTrigger value="test">Test tools</TabsTrigger>}
                </TabsList>
                <TabsContent value="content"><ContentTab /></TabsContent>
                <TabsContent value="ai"><AiModelTab /></TabsContent>
                <TabsContent value="survey"><SurveyTab /></TabsContent>
                {testTools && <TabsContent value="test"><TestToolsTab /></TabsContent>}
              </Tabs>
            </TabsContent>
          </Tabs>
        </RoundCycleContext.Provider>
      )}

      {settingUp && (
        <SetupRoundDialog
          onClose={() => setSettingUp(false)}
          onCreated={async (id) => {
            setSettingUp(false)
            await loadRounds(id)
          }}
        />
      )}
      {locking && view && (
        <ConfirmDialog
          isOpen
          title={view.locked ? 'Unlock this round?' : 'Lock this round?'}
          message={view.locked
            ? 'Answers, lists and quarter-end forms can change again, and the daily questions and reminders resume while the round is open.'
            : 'Nobody can answer, change an answer, change a list or fill in a form until you unlock it. The daily questions and reminders stop. Use it to freeze the quarter once it is final.'}
          confirmText={view.locked ? 'Unlock' : 'Lock'}
          variant={view.locked ? 'info' : 'warning'}
          onConfirm={() => void setLock(!view.locked)}
          onClose={() => setLocking(false)}
        />
      )}
      {confirming && view?.next && (
        <ConfirmDialog
          isOpen
          title={view.next.label}
          message={view.next.action === 'open-review'
            ? `${view.people ? `${view.people.included} people are in the round and ${view.people.excluded} are not evaluated. ` : ''}Everyone in it is emailed their lead, team and peers to check${view.reviewDeadline ? ` by ${formatKarachiDate(view.reviewDeadline)}` : ''}. They can ask for changes until you open the round.`
            : pending > 0
              ? `${pending} change ${pending === 1 ? 'request has' : 'requests have'} not been decided: ${(view.pendingRequests ?? []).map((r) => `${r.requester.name} about ${r.other.name}`).join('; ')}. Opening the round lets them expire and tells the people involved. Decide them in People first if they matter.`
              : 'Weekly questions start on week 1. After this, list changes are made by HR only.'}
          confirmText={view.next.label}
          variant={pending > 0 && view.next.action === 'open-round' ? 'warning' : 'info'}
          onConfirm={() => void act(view.next!.action as 'open-review' | 'open-round')}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
