'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, Lock, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCalendarDate, karachiCalendarDate } from '@/lib/weekly/calendar'
import { formatKarachiDate } from '@/lib/weekly/format'
import { ROUND_STAGE_LABELS } from '@/lib/weekly/round-stage'
import { cn } from '@/lib/utils'
import type { EarlierQuarterView, RoundChecklistItem, RoundSummary, RoundView, WeeklyMeResponse } from '@/lib/weekly/view-types'
import { EarlierQuarterPanel } from './EarlierQuarterPanel'
import { QuarterEvaluationsWorkspace } from '../form-tables/QuarterEvaluationsWorkspace'
import { AiModelTab } from '../admin/AiModelTab'
import { BankQuestions } from '../admin/BankQuestions'
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
import { RoundHealthPanel, RoundKeyDates } from './RoundOverview'
import { RoundResultsCard } from './RoundResultsCard'
import { RoundStepper } from './RoundStepper'
import { SetupRoundDialog } from './SetupRoundDialog'

type Tab = RoundChecklistItem['tab']
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'overview', label: 'Overview' }, { value: 'people', label: 'People' }, { value: 'progress', label: 'Progress' }, { value: 'review', label: 'Review answers' }, { value: 'self-reviews', label: 'Self-evaluations' },
  { value: 'forms', label: 'Quarter-end forms' }, { value: 'results', label: 'Close and release' }, { value: 'advanced', label: 'Advanced' },
]

/** How many things wait on HR in a tab, shown as a count beside its name. */
function tabCounts(view: RoundView): Partial<Record<Tab, number>> {
  return {
    people: view.health?.openRequests ?? view.checklist.find((c) => c.key === 'requests')?.count,
    review: view.health?.waitingReview,
    'self-reviews': view.health?.unreadSelfReviews,
  }
}

/** A stored date as the YYYY-MM-DD the date inputs take, in Karachi. */
const isoDay = (iso: string) => formatCalendarDate(karachiCalendarDate(new Date(iso)))

/** What deleting a draft undoes, so HR decides knowingly. */
function deleteMessage(view: RoundView): string {
  const draft = view.draft ?? { requests: 0, confirmations: 0, listChanges: 0 }
  const lost = [
    draft.requests ? `${draft.requests} list change ${draft.requests === 1 ? 'request' : 'requests'}` : '',
    draft.confirmations ? `${draft.confirmations} ${draft.confirmations === 1 ? 'person’s' : 'people’s'} “my lists look right”` : '',
    draft.listChanges ? `${draft.listChanges} list ${draft.listChanges === 1 ? 'change' : 'changes'} approved for this round (peer changes are undone; lead and team changes stay in the org chart)` : '',
  ].filter(Boolean)
  const what = lost.length ? ` This also removes ${lost.join(', ')}.` : ''
  return `The quarter and its round are removed, so you can set it up again and send the list emails afresh.${what} Nothing has been asked yet, so no answers are lost.`
}

/** UX spec, section 4: HR runs the whole round from here. It always says what is next, with one button for it. */
export function EvaluationRoundPage() {
  const [rounds, setRounds] = useState<RoundSummary[] | null>(null)
  const [periodId, setPeriodId] = useState('')
  const [view, setView] = useState<RoundView | null>(null)
  // A quarter run on the earlier evaluations: the short view to finish and close it.
  const [earlier, setEarlier] = useState<EarlierQuarterView | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [advanced, setAdvanced] = useState('content')
  const [settingUp, setSettingUp] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [locking, setLocking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testTools, setTestTools] = useState(false)

  const choosePeriod = useCallback((id: string) => {
    setPeriodId(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('period', id)
    else url.searchParams.delete('period')
    window.history.replaceState(null, '', url)
  }, [])
  const loadRounds = useCallback(async (select?: string) => {
    try {
      const result = await weeklyRequest<{ rounds: RoundSummary[] }>('/api/admin/rounds')
      setRounds(result.rounds)
      // The quarter HR had open (kept in the address, so a reload stays on it); else a weekly round first (the open
      // one, else the newest), and an earlier quarter only when there is no weekly round.
      const kept = select ?? new URLSearchParams(window.location.search).get('period')
      const weekly = result.rounds.filter((r) => !r.earlier)
      const preferred = result.rounds.find((r) => r.periodId === kept)?.periodId ?? weekly.find((r) => r.stage === 'OPEN')?.periodId ?? weekly[0]?.periodId ?? result.rounds[0]?.periodId ?? ''
      choosePeriod(preferred)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the rounds'))
    }
  }, [choosePeriod])
  const loadView = useCallback(async () => {
    if (!periodId) {
      setEarlier(null)
      return setView(null)
    }
    try {
      const result = await weeklyRequest<RoundView | EarlierQuarterView>(`/api/admin/rounds/${periodId}`)
      if ('kind' in result && result.kind === 'earlier') {
        setView(null)
        setEarlier(result)
      } else {
        setEarlier(null)
        setView(result as RoundView)
      }
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

  /** Deletes a round that has not opened, so HR can set it up again and send the list emails afresh. */
  async function deleteDraft() {
    setBusy(true)
    try {
      await weeklyRequest(`/api/admin/rounds/${encodeURIComponent(periodId)}`, { method: 'DELETE' })
      toast.success('Draft deleted. Set up the round again when you are ready.')
      setDeleting(false)
      setView(null)
      await loadRounds()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not delete the draft'))
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
  const counts = view ? tabCounts(view) : {}
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Evaluation round</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-3xl font-bold tracking-tight text-foreground">
            {view?.name ?? earlier?.name ?? 'Evaluations'}
            {view && <Badge variant="outline" className="font-sans text-xs font-medium">{ROUND_STAGE_LABELS[view.stage]}</Badge>}
            {earlier && <Badge variant="outline" className="font-sans text-xs font-medium">{earlier.locked ? 'Earlier quarter · closed' : 'Earlier quarter'}</Badge>}
            {view?.locked && <Badge variant="outline" className="gap-1 font-sans text-xs font-medium"><Lock className="h-3 w-3" aria-hidden /> Locked</Badge>}
          </h1>
          <p className="mt-1.5 text-muted-foreground">Run the quarter&apos;s evaluations from here, one step at a time.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rounds && rounds.length > 1 && (
            <Select value={periodId} onValueChange={choosePeriod}>
              <SelectTrigger className="w-56" aria-label="Round"><SelectValue /></SelectTrigger>
              <SelectContent>
                {rounds.map((r) => (
                  <SelectItem key={r.periodId} value={r.periodId}>
                    {r.name} · {r.earlier ? (r.stage === 'CLOSED' ? 'Earlier quarter, closed' : 'Earlier quarter') : ROUND_STAGE_LABELS[r.stage]}
                  </SelectItem>
                ))}
              </SelectContent>
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

      {earlier && <EarlierQuarterPanel view={earlier} onChanged={async () => { await loadRounds(earlier.periodId); await loadView() }} />}

      {view && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="px-6 pb-6 pt-7"><RoundStepper stage={view.stage} /></div>
            <div className="border-t border-border/70 bg-muted/30 px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 max-w-2xl">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">{view.next ? 'Next step' : 'Done'}</p>
                  <p className="mt-1 text-base font-medium text-foreground">{view.next?.sentence ?? 'This round has been released.'}</p>
                  {view.currentWeek ? <p className="mt-1 text-sm text-muted-foreground">Now in week {view.currentWeek} of {view.totalWeeks} · closes {formatKarachiDate(view.closesOn)}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {view.stage !== 'DRAFT' && view.stage !== 'REVIEW' && (
                    <Button variant="ghost" disabled={busy} onClick={() => setLocking(true)} className="gap-1.5">
                      {view.locked ? <Unlock className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
                      {view.locked ? 'Unlock' : 'Lock'}
                    </Button>
                  )}
                  {view.next && (
                    <Button
                      disabled={busy}
                      size="lg"
                      variant={view.next.action === 'close-round' && (view.currentWeek ?? 0) < view.totalWeeks ? 'outline' : 'default'}
                      onClick={primary}
                      className="group gap-2 px-5"
                    >
                      {view.next.label}
                      <ArrowRight className="transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5" aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
              {view.checklist.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {view.checklist.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => setTab(item.tab)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200 hover:border-foreground/25',
                          item.done ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-background text-foreground',
                        )}
                      >
                        {item.done ? <Check className="h-3 w-3" aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />}
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {view && (
        <RoundCycleContext.Provider value={view.cycleId}>
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            {/* Eight tabs: on a narrow screen the strip scrolls sideways rather than wrapping into a block. */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <TabsList className="w-max">
                {TABS.map((t) => {
                  const count = counts[t.value]
                  return (
                    <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                      {t.label}
                      {count ? <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold tabular-nums text-primary">{count}</span> : null}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </div>
            <TabsContent value="overview" className="space-y-4 pt-4">
              {view.health && view.currentWeek && <RoundHealthPanel view={view} onOpen={setTab} />}
              <RoundKeyDates
                view={view}
                {...(view.stage === 'DRAFT' || view.stage === 'REVIEW' ? { onEdit: () => setEditing(true), onDelete: () => setDeleting(true) } : {})}
              />
              {view.checklist.length === 0 && !view.health && <p className="px-1 text-sm text-muted-foreground">Nothing is waiting on you at this stage.</p>}
            </TabsContent>
            <TabsContent value="people" className="pt-4"><PeopleTab /></TabsContent>
            <TabsContent value="progress" className="pt-4"><DashboardTab /></TabsContent>
            <TabsContent value="review" className="pt-4"><ReviewTab onChanged={() => void loadView()} /></TabsContent>
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
                <TabsContent value="content" className="space-y-10"><ContentTab /><BankQuestions /></TabsContent>
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
      {editing && view && (
        <SetupRoundDialog
          edit={{
            periodId: view.periodId,
            initial: {
              name: view.name, startDate: isoDay(view.startDate), endDate: isoDay(view.endDate), weekOneStartsOn: isoDay(view.weekOneStartsOn),
              questionWeeks: String(view.questionWeeks), reviewDeadline: view.reviewDeadline ? isoDay(view.reviewDeadline) : '',
            },
          }}
          onClose={() => setEditing(false)}
          onCreated={async () => {
            setEditing(false)
            await loadRounds(view.periodId)
            await loadView()
          }}
        />
      )}
      {deleting && view && (
        <ConfirmDialog
          isOpen
          title={`Delete the ${view.name} draft?`}
          message={deleteMessage(view)}
          confirmText="Delete draft"
          variant="danger"
          onConfirm={() => void deleteDraft()}
          onClose={() => setDeleting(false)}
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
