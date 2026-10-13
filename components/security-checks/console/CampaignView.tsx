'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CampaignDashboard } from '@/lib/security-checks/service/dashboard'
import type { CampaignDetail } from '@/lib/security-checks/service/campaigns'
import { formatDate } from '../format'
import { errorMessage, scRequest } from '../sc-api'
import { CampaignDashboardPanel } from './CampaignDashboardPanel'
import { CampaignEditor } from './CampaignEditor'
import { useScMe } from './use-sc-me'

export function CampaignView({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const me = useScMe()
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [dashboard, setDashboard] = useState<CampaignDashboard | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ title: string; message: string; variant: 'danger' | 'warning' | 'info'; run: () => Promise<unknown> } | null>(null)

  const load = useCallback(() => {
    Promise.all([
      scRequest<CampaignDetail>(`/api/security-checks/console/campaigns/${campaignId}`),
      scRequest<CampaignDashboard>(`/api/security-checks/console/campaigns/${campaignId}/dashboard`),
    ])
      .then(([campaign, stats]) => {
        setDetail(campaign)
        setDashboard(stats)
      })
      .catch((e: unknown) => setError(errorMessage(e, 'Could not load the campaign')))
  }, [campaignId])

  useEffect(load, [load])

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      setReason('')
      load()
    } catch (e: unknown) {
      setError(errorMessage(e, 'The action failed'))
    } finally {
      setBusy(false)
    }
  }
  const post = (action: string, body: unknown = {}) => scRequest(`/api/security-checks/console/campaigns/${campaignId}/${action}`, { method: 'POST', body })

  if (error && !detail) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!detail || !dashboard || !me) return <LoadingScreen message="Loading campaign..." />
  const manage = Boolean(me.capabilities?.manageCampaigns)
  const openCycle = detail.cycles.find((cycle) => !cycle.actualCloseAt)
  const needsReason = reason.trim().length < 3

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
      <Link href="/security-checks/console" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Security Console</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{detail.fields.name}</h1>
          <p className="text-sm text-muted-foreground">
            {detail.fields.control} · version {detail.version}
            {detail.launchedAt && ` · launched ${formatDate(detail.launchedAt)}`}
            {detail.retiredAt && ` · retired ${formatDate(detail.retiredAt)}`}
          </p>
        </div>
        <Badge variant={detail.status === 'ACTIVE' ? 'default' : 'outline'}>{detail.status.toLowerCase()}</Badge>
      </div>

      {manage && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            {detail.status === 'DRAFT' && (
              <Button disabled={busy} onClick={() => setConfirm({
                title: 'Activate this campaign?',
                message: 'If the first open date is today, every person in the audience gets a task and a notification now. Questions and subtasks lock once it is live.',
                variant: 'info',
                run: () => post('activate'),
              })}>Activate</Button>
            )}
            {detail.status === 'DRAFT' && detail.cycles.length === 0 && (
              <Button variant="outline" disabled={busy} onClick={() => setConfirm({
                title: 'Delete this draft?',
                message: 'The draft and its questions are removed. This cannot be undone.',
                variant: 'danger',
                run: async () => {
                  await scRequest(`/api/security-checks/console/campaigns/${campaignId}`, { method: 'DELETE' })
                  router.push('/security-checks/console')
                },
              })}>Delete draft</Button>
            )}
            {detail.status !== 'DRAFT' && (
              <Button variant="outline" disabled={busy} onClick={() => void act(async () => {
                const clone = await post('clone') as { id: string }
                router.push(`/security-checks/console/campaigns/${clone.id}`)
              })}>Clone as new version</Button>
            )}
            {(detail.status === 'ACTIVE' || openCycle) && (
              <>
                <Input className="max-w-xs" placeholder="Reason (for retire / early close)" value={reason} onChange={(event) => setReason(event.target.value)} />
                {detail.status === 'ACTIVE' && (
                  <Button variant="outline" disabled={busy || needsReason} onClick={() => setConfirm({
                    title: 'Retire this campaign?',
                    message: 'No further cycles will be scheduled. An open cycle still runs to completion.',
                    variant: 'warning',
                    run: () => post('retire', { reason }),
                  })}>Retire</Button>
                )}
                {openCycle && (
                  <Button variant="destructive" disabled={busy || needsReason} onClick={() => setConfirm({
                    title: `Close cycle ${openCycle.number} early?`,
                    message: 'Every task that is not yet final becomes Cancelled. Relative recurrence still anchors to the original scheduled close.',
                    variant: 'danger',
                    run: () => scRequest(`/api/security-checks/console/cycles/${openCycle.id}/close-early`, { method: 'POST', body: { reason } }),
                  })}>
                    Close cycle {openCycle.number} early
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ConfirmDialog
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => { if (confirm) void act(confirm.run) }}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        variant={confirm?.variant ?? 'info'}
      />

      <Tabs defaultValue={detail.cycles.length > 0 ? 'dashboard' : 'definition'}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="definition">Definition</TabsTrigger>
          <TabsTrigger value="cycles">Cycles ({detail.cycles.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><CampaignDashboardPanel data={dashboard} /></TabsContent>
        <TabsContent value="definition">
          {manage && detail.status !== 'CLOSED' ? (
            <CampaignEditor key={detail.status} campaignId={campaignId} initial={detail.fields} status={detail.status} onSaved={load} />
          ) : (
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">{detail.fields.instructions || 'No instructions.'}</pre>
          )}
        </TabsContent>
        <TabsContent value="cycles" className="space-y-2">
          {detail.cycles.length === 0 && <p className="text-sm text-muted-foreground">No cycles yet.</p>}
          {detail.cycles.map((cycle) => (
            <Card key={cycle.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <span className="font-medium">Cycle {cycle.number}</span>
                <span className="text-muted-foreground">
                  {formatDate(cycle.openAt)} → deadline {formatDate(cycle.deadline)} · close {formatDate(cycle.actualCloseAt ?? cycle.scheduledCloseAt)} · {cycle.taskCount} tasks
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{cycle.status.toLowerCase()}</Badge>
                  {me.capabilities?.exportCsv && <a className="underline underline-offset-2" href={`/api/security-checks/console/export?cycleId=${cycle.id}`}>CSV</a>}
                </span>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
