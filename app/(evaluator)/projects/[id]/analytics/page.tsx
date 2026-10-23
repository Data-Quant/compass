'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { CalendarX2, ListTodo, Lock, TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/composed/EmptyState'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AnalyticsHeader } from '@/components/projects/analytics/AnalyticsHeader'
import { PageSkeleton, SectionSkeleton } from '@/components/projects/analytics/AnalyticsSkeleton'
import { OverviewSection } from '@/components/projects/analytics/OverviewSection'
import { PeopleSection } from '@/components/projects/analytics/PeopleSection'
import { RangeControl, type RangeSelection } from '@/components/projects/analytics/RangeControl'
import { VIZ_VARS } from '@/components/projects/analytics/chart-theme'
import type { AnalyticsResponse, Participant } from '@/components/projects/analytics/types'
import { cn } from '@/lib/utils'

type Section = 'overview' | 'people'
type Failure = 'forbidden' | 'not_found' | 'bad_range' | 'error'
type ProjectMeta = { name: string; color: string | null; participants: Participant[]; doneSections: Set<string> }

const failureFor = (status: number): Failure => (
  status === 403 ? 'forbidden' : status === 404 ? 'not_found' : status === 400 ? 'bad_range' : 'error'
)

// useSearchParams needs a Suspense boundary or `next build` fails
export default function ProjectAnalyticsPage() {
  return (
    <Suspense fallback={<PageSkeleton section="overview" />}>
      <ProjectAnalytics />
    </Suspense>
  )
}

function ProjectAnalytics() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const section: Section = searchParams.get('section') === 'people' ? 'people' : 'overview'

  const [meta, setMeta] = useState<ProjectMeta | null>(null)
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  const updateParams = useCallback((changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    const query = next.toString()
    router.replace(query ? `/projects/${id}/analytics?${query}` : `/projects/${id}/analytics`, { scroll: false })
  }, [id, router, searchParams])

  // Project roster and done columns come from the project itself; analytics only carries aggregates.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${id}`)
      .then(async (res) => {
        if (!res.ok) throw failureFor(res.status)
        const { project } = await res.json()
        const people = new Map<string, string>([[project.owner.id, project.owner.name]])
        for (const member of project.members as Array<{ user: Participant }>) people.set(member.user.id, member.user.name)
        if (cancelled) return
        setMeta({
          name: project.name,
          color: project.color,
          participants: [...people].map(([personId, name]) => ({ id: personId, name })).sort((a, b) => a.name.localeCompare(b.name)),
          doneSections: new Set((project.sections as Array<{ id: string; isDone?: boolean }>).filter((s) => s.isDone).map((s) => s.id)),
        })
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setFailure(typeof reason === 'string' ? (reason as Failure) : 'error')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [id, attempt])

  const personParam = searchParams.get('person')
  const selectedPerson = meta?.participants.find((person) => person.id === personParam) ?? meta?.participants[0] ?? null

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
    if (section === 'people') {
      if (!selectedPerson) return null
      params.set('userId', selectedPerson.id)
    }
    return params.toString()
  }, [searchParams, section, selectedPerson])

  useEffect(() => {
    if (query === null) return
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/projects/${id}/analytics?${query}`, { signal: controller.signal })
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
  }, [id, query, attempt])

  const changeRange = (next: RangeSelection) => updateParams(
    'range' in next ? { range: next.range, from: null, to: null } : { range: null, from: next.from, to: next.to },
  )
  const retry = () => { setFailure(null); setAttempt((count) => count + 1) }

  if (failure && failure !== 'bad_range') return <FailureState failure={failure} projectId={id} onRetry={retry} />
  if (!data || !meta) {
    if (failure === 'bad_range') return <FailureState failure={failure} projectId={id} onRetry={() => changeRange({ range: '90d' })} />
    return <PageSkeleton section={section} />
  }

  const person = data.person && data.person.userId === selectedPerson?.id ? data.person : null

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <div className={cn('mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8', VIZ_VARS)}>
        <AnalyticsHeader projectId={id} name={data.project.name} color={data.project.color} />

        <Tabs value={section} onValueChange={(value) => updateParams({ section: value === 'people' ? 'people' : null })}>
          <div className="mb-5 flex min-h-[46px] flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border">
            <TabsList aria-label="Analytics section" className="h-auto gap-5 rounded-none bg-transparent p-0">
              {(['overview', 'people'] as const).map((value) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="-mb-px rounded-none border-b-2 border-transparent px-0.5 pb-2.5 pt-1.5 text-sm text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {value === 'overview' ? 'Overview' : 'People'}
                </TabsTrigger>
              ))}
            </TabsList>
            {section === 'overview' && (
              <div className="pb-2">
                <RangeControl range={data.range} onChange={changeRange} />
              </div>
            )}
          </div>

          {failure === 'bad_range' && (
            <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              <CalendarX2 aria-hidden="true" className="h-4 w-4 shrink-0" />
              That date range can&apos;t be shown. Pick dates up to today, at most two years apart.
            </p>
          )}

          <div aria-busy={loading} className={cn('transition-opacity', loading && 'pointer-events-none opacity-60')}>
            <TabsContent value="overview" className="mt-0">
              <OverviewSection analytics={data.analytics} range={data.range} participants={meta.participants} doneSections={meta.doneSections} />
            </TabsContent>
            <TabsContent value="people" className="mt-0">
              {selectedPerson && person ? (
                <PeopleSection
                  people={meta.participants}
                  selected={selectedPerson}
                  person={person}
                  onSelect={(personId) => updateParams({ person: personId })}
                />
              ) : selectedPerson ? (
                <SectionSkeleton section="people" />
              ) : (
                <EmptyState icon={<ListTodo className="h-10 w-10" />} title="No people on this project yet" description="Add members to the project to see their completed work." />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

function FailureState({ failure, projectId, onRetry }: { failure: Failure; projectId: string; onRetry: () => void }) {
  const copy = {
    forbidden: { icon: <Lock className="h-10 w-10" />, title: 'Only leads and HR can see analytics', description: "Analytics for this project is open to the project's leads and HR. Ask a lead if you need these numbers." },
    not_found: { icon: <ListTodo className="h-10 w-10" />, title: 'Project not found', description: 'It may have been deleted, or the link is incomplete.' },
    bad_range: { icon: <CalendarX2 className="h-10 w-10" />, title: "That date range can't be shown", description: 'Pick dates up to today, at most two years apart.' },
    error: { icon: <TriangleAlert className="h-10 w-10" />, title: "Couldn't load analytics", description: 'Check your connection and try again.' },
  }[failure]
  return (
    <EmptyState
      icon={copy.icon}
      title={copy.title}
      description={copy.description}
      className="min-h-[60vh]"
      action={
        <div className="flex items-center gap-2">
          {failure === 'error' && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
          {failure === 'bad_range' && <Button variant="outline" size="sm" onClick={onRetry}>Show the last 90 days</Button>}
          <Button size="sm" asChild>
            <Link href={failure === 'not_found' ? '/projects' : `/projects/${projectId}`}>
              {failure === 'not_found' ? 'Back to Projects' : 'Back to board'}
            </Link>
          </Button>
        </div>
      }
    />
  )
}
