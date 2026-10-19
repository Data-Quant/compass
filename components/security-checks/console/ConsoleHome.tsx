'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download, Plus } from 'lucide-react'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FREQUENCY_LABELS } from '@/lib/security-checks/recurrence'
import type { CompanyDashboard } from '@/lib/security-checks/service/dashboard'
import type { Frequency } from '@/lib/security-checks/types'
import { formatDate, formatPct } from '../format'
import { errorMessage, scRequest } from '../sc-api'
import { useScMe } from './use-sc-me'

interface CampaignSummary {
  id: string
  name: string
  control: string
  status: string
  version: number
  frequency: Frequency
  firstOpenAt: string | null
  cycleCount: number
  latestCycle: { number: number; deadline: string; status: string } | null
}

function Stat({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${alert ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

export function ConsoleHome() {
  const me = useScMe()
  const [dashboard, setDashboard] = useState<CompanyDashboard | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([scRequest<CompanyDashboard>('/api/security-checks/console/dashboard'), scRequest<CampaignSummary[]>('/api/security-checks/console/campaigns')])
      .then(([company, list]) => {
        setDashboard(company)
        setCampaigns(list)
      })
      .catch((e: unknown) => setError(errorMessage(e, 'Could not load the Security Console')))
  }, [])

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!dashboard || !me) return <LoadingScreen message="Loading Security Console..." />
  const caps = me.capabilities
  const statsById = new Map(dashboard.campaigns.map((entry) => [entry.id, entry]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground">
          {caps?.manageCampaigns ? 'Campaigns, reviews and compliance across the company.' : 'Read-only view of compliance and submissions. Every evidence view is logged.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {caps?.exportCsv && <Button asChild variant="outline"><a href="/api/security-checks/console/export"><Download className="mr-2 h-4 w-4" />Export CSV</a></Button>}
          {caps?.manageCampaigns && <Button asChild><Link href="/security-checks/console/campaigns/new"><Plus className="mr-2 h-4 w-4" />New campaign</Link></Button>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Compliance" value={formatPct(dashboard.overall.compliancePct)} />
        <Stat label="Submitted" value={formatPct(dashboard.overall.completionPct)} />
        <Stat label="Pending review" value={dashboard.pendingReview} />
        <Stat label="Unresolved past deadline" value={dashboard.unresolvedPastDeadline} alert={dashboard.unresolvedPastDeadline > 0} />
        <Stat label="Expired unreviewed" value={dashboard.unreviewedExpired} alert={dashboard.unreviewedExpired > 0} />
        <Stat label="Self-reviews this month" value={dashboard.selfReviewsThisMonth} alert={dashboard.selfReviewsThisMonth > 0} />
      </div>
      {dashboard.unreviewedExpired > 0 && (
        <p className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" /> Some submissions expired without a review. Open the campaign dashboards to see which.</p>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Campaigns</CardTitle></CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Current cycle</TableHead>
                  <TableHead className="text-right">Compliance</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const stats = statsById.get(campaign.id)
                  return (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <Link className="font-medium underline-offset-2 hover:underline" href={`/security-checks/console/campaigns/${campaign.id}`}>{campaign.name}</Link>
                        <p className="text-xs text-muted-foreground">{campaign.control}{campaign.version > 1 && ` · v${campaign.version}`}</p>
                      </TableCell>
                      <TableCell><Badge variant={campaign.status === 'ACTIVE' ? 'default' : 'outline'}>{campaign.status.toLowerCase()}</Badge></TableCell>
                      <TableCell className="text-sm">{FREQUENCY_LABELS[campaign.frequency]}</TableCell>
                      <TableCell className="text-sm">
                        {campaign.latestCycle ? `#${campaign.latestCycle.number} · due ${formatDate(campaign.latestCycle.deadline)}` : campaign.firstOpenAt ? `Opens ${formatDate(campaign.firstOpenAt)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">{formatPct(stats?.stats?.compliancePct)}</TableCell>
                      <TableCell className="text-right">{stats?.pendingReview ?? 0}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
