'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CampaignDashboard, TaskRow } from '@/lib/security-checks/service/dashboard'
import { TASK_STATUS_LABELS, type TaskStatus } from '@/lib/security-checks/types'
import { TaskStatusBadge } from '../StatusBadge'
import { formatDate, formatPct } from '../format'

function RowList({ title, rows, empty }: { title: string; rows: TaskRow[]; empty: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title} ({rows.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        {rows.map((row) => (
          <Link key={row.taskId} href={`/security-checks/console/tasks/${row.taskId}`} className="flex items-center justify-between gap-2 text-sm hover:underline">
            <span>{row.person.name} <span className="text-muted-foreground">{row.person.department ?? ''}</span></span>
            <span className="flex items-center gap-2 text-muted-foreground">
              {formatDate(row.deadline)}
              {row.lateEnrollment && ' · late'}
              {row.extended && ' · extended'}
              <TaskStatusBadge status={row.status} />
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

export function CampaignDashboardPanel({ data }: { data: CampaignDashboard }) {
  if (!data.cycle || !data.stats) return <p className="text-sm text-muted-foreground">No cycle has opened yet.</p>
  const statuses = Object.keys(data.byStatus) as TaskStatus[]
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Compliance', formatPct(data.stats.compliancePct)],
          ['Submitted', formatPct(data.stats.completionPct)],
          ['In scope', String(data.stats.inScope)],
          ['Excluded (N/A, exempt, cancelled)', String(data.stats.excluded)],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Cycle {data.cycle.number}: opened {formatDate(data.cycle.openAt)}, deadline {formatDate(data.cycle.deadline)}, scheduled close {formatDate(data.cycle.scheduledCloseAt)}
        {data.cycle.actualCloseAt && `, closed ${formatDate(data.cycle.actualCloseAt)}`}.
      </p>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">By department</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Compliance</TableHead>
                {statuses.map((status) => <TableHead key={status} className="text-right">{TASK_STATUS_LABELS[status]}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byDepartment.map((row) => (
                <TableRow key={row.department}>
                  <TableCell>{row.department}</TableCell>
                  <TableCell className="text-right">{formatPct(row.stats.compliancePct)}</TableCell>
                  {statuses.map((status) => <TableCell key={status} className="text-right">{row.byStatus[status] ?? 0}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Trend (last 6 cycles)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Cycle</TableHead><TableHead>Opened</TableHead><TableHead className="text-right">In scope</TableHead><TableHead className="text-right">Submitted</TableHead><TableHead className="text-right">Compliance</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.trend.map((point) => (
                <TableRow key={point.cycleId}>
                  <TableCell>{point.label}</TableCell>
                  <TableCell>{formatDate(point.openAt)}</TableCell>
                  <TableCell className="text-right">{point.inScope}</TableCell>
                  <TableCell className="text-right">{formatPct(point.completionPct)}</TableCell>
                  <TableCell className="text-right">{formatPct(point.compliancePct)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <RowList title="Expired unreviewed" rows={data.unreviewedExpired} empty="None — every submission was reviewed in time." />
        <RowList title="Overdue" rows={data.overdue} empty="Nobody is past their deadline." />
        <RowList title="Expired" rows={data.expired} empty="No expired tasks." />
        <RowList title="Own timeline (extended / late enrollment)" rows={data.ownTimeline} empty="Everyone is on the cycle deadline." />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">2+ consecutive expiries</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {data.repeatExpired.length === 0 ? <p className="text-muted-foreground">Nobody.</p> : data.repeatExpired.map((person) => <p key={person.id}>{person.name} <span className="text-muted-foreground">{person.department ?? ''}</span></p>)}
        </CardContent>
      </Card>
    </div>
  )
}
