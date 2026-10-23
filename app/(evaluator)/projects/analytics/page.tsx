'use client'

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarX2, ChevronLeft, FolderKanban, Lock, TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/composed/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WorkspaceSkeleton } from '@/components/projects/analytics/AnalyticsSkeleton'
import { ProjectHealthTable } from '@/components/projects/analytics/ProjectHealthTable'
import { RangeControl, type RangeSelection } from '@/components/projects/analytics/RangeControl'
import { StatTileGrid, type StatTileProps } from '@/components/projects/analytics/StatTile'
import { WorkspaceThroughputChart } from '@/components/projects/analytics/WorkspaceThroughputChart'
import { WorkspaceWorkloadChart } from '@/components/projects/analytics/WorkspaceWorkloadChart'
import { VIZ_VARS, plural } from '@/components/projects/analytics/chart-theme'
import { assignProjectColors } from '@/components/projects/analytics/workspace-colors'
import type { WorkspaceAnalytics, WorkspaceAnalyticsResponse } from '@/components/projects/analytics/types'
import { cn } from '@/lib/utils'

type Failure = 'forbidden' | 'bad_range' | 'error'
const failureFor = (status: number): Failure => (status === 403 ? 'forbidden' : status === 400 ? 'bad_range' : 'error')

const ON_TIME_DEFINITION = 'Completed on or before the due date, out of completed tasks that had a due date.'

function workspaceTiles({ tiles }: WorkspaceAnalytics): StatTileProps[] {
  return [
    {
      label: 'Active projects',
      value: String(tiles.activeProjects),
      sub: tiles.onHoldProjects > 0 ? `${tiles.onHoldProjects} on hold` : 'None on hold',
      definition: 'Projects you can open with status Active.',
    },
    {
      label: 'Completed',
      value: String(tiles.completed),
      unit: tiles.completed === 1 ? 'task' : 'tasks',
      sub: 'In the selected range',
      definition: 'Non-backlog tasks marked done in the selected range, across these projects.',
    },
    tiles.onTime
      ? {
        label: 'On time',
        value: `${Math.round((tiles.onTime.onTime / tiles.onTime.dated) * 100)}%`,
        unit: `${tiles.onTime.onTime} of ${tiles.onTime.dated} with a due date`,
        sub: 'Tasks without a due date are left out',
        definition: ON_TIME_DEFINITION,
      }
      : { label: 'On time', value: '–', sub: 'Needs 5 completed tasks with due dates', definition: ON_TIME_DEFINITION },
    {
      label: 'Overdue now',
      value: String(tiles.overdue),
      unit: 'open tasks',
      sub: tiles.overdue > 0 ? `Across ${plural(tiles.projectsWithOverdue, 'project')}` : 'Nothing is past due',
      definition: 'Open non-backlog tasks whose due date has passed.',
    },
  ]
}

// useSearchParams needs a Suspense boundary or `next build` fails
export default function WorkspaceAnalyticsPage() {
  return (
    <Suspense fallback={<Shell><WorkspaceSkeleton /></Shell>}>
      <WorkspaceAnalyticsView />
    </Suspense>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className={cn('mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8', VIZ_VARS)}>
      <header className="mb-6 flex flex-col gap-1.5">
        <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/projects" className="transition-colors hover:text-foreground">Projects</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-foreground">Analytics</li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-display font-light tracking-tight text-foreground sm:text-3xl">Projects analytics</h1>
          <Button variant="outline" size="sm" asChild>
            <Link href="/projects">
              <ChevronLeft aria-hidden="true" />
              Back to projects
            </Link>
          </Button>
        </div>
        <p className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          Projects you lead. HR sees all of them.
        </p>
      </header>
      {children}
    </div>
  )
}

function WorkspaceAnalyticsView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<WorkspaceAnalyticsResponse | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (from || to) {
      params.set('from', from ?? '')
      params.set('to', to ?? '')
    } else {
      params.set('range', searchParams.get('range') ?? '90d')
    }
    return params.toString()
  }, [searchParams])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/projects/analytics?${query}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw failureFor(res.status)
        setData(await res.json())
        setFailure(null)
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setFailure(typeof reason === 'string' ? (reason as Failure) : 'error')
        setLoading(false)
      })
    return () => controller.abort()
  }, [query, attempt])

  const colors = useMemo(() => (data ? assignProjectColors(data.analytics.projects.map((row) => ({
    projectId: row.projectId,
    name: row.name,
    color: data.projects.find((project) => project.id === row.projectId)?.color ?? null,
    completed: row.completed,
  }))) : null), [data])

  const changeRange = (next: RangeSelection) => {
    const params = 'range' in next ? `range=${next.range}` : `from=${next.from}&to=${next.to}`
    router.replace(`/projects/analytics?${params}`, { scroll: false })
  }

  if (failure && (failure !== 'bad_range' || !data)) {
    return (
      <Shell>
        <FailureState
          failure={failure}
          onRetry={failure === 'bad_range' ? () => changeRange({ range: '90d' }) : () => { setFailure(null); setAttempt((count) => count + 1) }}
        />
      </Shell>
    )
  }
  if (!data || !colors) {
    return (
      <Shell>
        <div className="mb-5 flex justify-end"><Skeleton className="h-9 w-64" /></div>
        <WorkspaceSkeleton />
      </Shell>
    )
  }

  const { analytics } = data
  const isEmpty = analytics.projects.every((row) => row.open === 0 && row.completed === 0 && row.sparkline.every((count) => count === 0))

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <Shell>
        <div className="mb-5 flex justify-end">
          <RangeControl range={data.range} onChange={changeRange} />
        </div>

        {failure === 'bad_range' && (
          <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            <CalendarX2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            That date range can&apos;t be shown. Pick dates up to today, at most two years apart.
          </p>
        )}

        <div aria-busy={loading} className={cn('flex flex-col gap-4 transition-opacity', loading && 'pointer-events-none opacity-60')}>
          {isEmpty ? (
            <EmptyState
              icon={<FolderKanban className="h-10 w-10" />}
              title="No tasks to measure yet"
              description="Your projects have no open or completed tasks outside the backlog. Numbers show here once work is planned and done."
              className="rounded-xl border border-dashed border-border py-16"
              action={<Button size="sm" asChild><Link href="/projects">Go to projects</Link></Button>}
            />
          ) : (
            <>
              <StatTileGrid tiles={workspaceTiles(analytics)} />
              <ProjectHealthTable rows={analytics.projects} weeks={analytics.weeks} colorOf={colors.colorOf} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <WorkspaceThroughputChart analytics={analytics} range={data.range} series={colors.series} keyOf={colors.keyOf} />
                <WorkspaceWorkloadChart workload={analytics.workload} series={colors.series} keyOf={colors.keyOf} />
              </div>
            </>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            Backlog tasks are never counted. Only projects you can open are included. Person-level contribution graphs live on each project&apos;s analytics page, under People.
          </p>
        </div>
      </Shell>
    </TooltipProvider>
  )
}

function FailureState({ failure, onRetry }: { failure: Failure; onRetry: () => void }) {
  const copy = {
    forbidden: { icon: <Lock className="h-10 w-10" />, title: 'Only project leads and HR can see analytics', description: "You don't lead any projects yet. Ask a project owner to make you a lead if you need these numbers." },
    bad_range: { icon: <CalendarX2 className="h-10 w-10" />, title: "That date range can't be shown", description: 'Pick dates up to today, at most two years apart.' },
    error: { icon: <TriangleAlert className="h-10 w-10" />, title: "Couldn't load analytics", description: 'Check your connection and try again.' },
  }[failure]
  return (
    <EmptyState
      icon={copy.icon}
      title={copy.title}
      description={copy.description}
      className="min-h-[50vh]"
      action={
        <div className="flex items-center gap-2">
          {failure === 'error' && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
          {failure === 'bad_range' && <Button variant="outline" size="sm" onClick={onRetry}>Show the last 90 days</Button>}
          <Button size="sm" asChild><Link href="/projects">Back to projects</Link></Button>
        </div>
      }
    />
  )
}
