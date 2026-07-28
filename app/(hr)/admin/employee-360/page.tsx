'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmployeeOrrery } from '@/components/analytics/EmployeeOrrery'
import { compGrowth, type Outlook } from '@/lib/analytics/employee-360'
import { RELATIONSHIP_TYPE_LABELS, type RelationshipType } from '@/types'
import { Search, Orbit, Radio } from 'lucide-react'

/* The cockpit is deliberately dense: an operator scanning one person should not
 * have to scroll to cross-reference how they perform, who rates them, who they
 * work with and what it costs. Panels are sized to the signal they carry. */

interface Employee360 {
  employee: { id: string; name: string; department: string | null; position: string | null }
  period: { id: string; name: string } | null
  performance: {
    overallScore: number | null
    perLens: Partial<Record<RelationshipType, number>>
    orgPerLensAverage: Partial<Record<RelationshipType, number>>
    band: string | null
    momentumDelta: number | null
    momentumBand: string | null
    consensus: number | null
  }
  history: Array<{ periodId: string; periodName: string; score: number }>
  clients: Array<{ id: string; name: string; role: 'MANAGER' | 'MEMBER' }>
  comp: Array<{ effectiveFrom: string; total: number }>
  outlook: Outlook
  evaluators: Array<{
    id: string
    name: string
    relationshipType: string
    meanGiven: number
    raterDeviation: number | null
    raterIsProvisional: boolean
  }>
  network: {
    leads: Array<{ id: string; name: string; position: string | null }>
    reports: Array<{ id: string; name: string; position: string | null }>
    colleagues: Array<{ id: string; name: string; clients: string[] }>
  }
  standing: {
    companyPercentile: number | null
    departmentPercentile: number | null
    companySize: number
  }
  activity: {
    openTasks: number
    doneTasks: number
    leaveDays: number
    leaveRequests: number
    assets: number
  }
}

const INK = '#0D1424'
const PANEL = '#0B1120'
const EDGE = '#1E2A44'
const BONE = '#E9E4D6'
const MUTED = '#9AA3B2'
const BRASS = '#E8C25A'
const COOL = '#7FB2D9'
const TONE: Record<string, string> = {
  STRONG: '#5BC0A8',
  STEADY: BRASS,
  WATCH: '#E06C55',
  UNKNOWN: MUTED,
}

const LENS_SHORT: Record<string, string> = {
  TEAM_LEAD: 'Lead',
  PEER: 'Peer',
  HR: 'HR',
  DEPT: 'Dept',
  DIRECT_REPORT: 'Report',
  C_LEVEL: 'C-Level',
  CROSS_DEPARTMENT: 'Cross-Dept',
  UNKNOWN: '—',
}

function Panel({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-xl border p-4 ${className ?? ''}`}
      style={{ borderColor: EDGE, backgroundColor: PANEL }}
    >
      <h3
        className="mb-3 text-[10px] uppercase"
        style={{ color: MUTED, letterSpacing: '0.18em' }}
      >
        {title}
      </h3>
      {children}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: '0.16em' }}>
        {label}
      </p>
      <p
        className="mt-0.5 text-xl"
        style={{ color: tone ?? BONE, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
    </div>
  )
}

/** Sparkline. The shape carries the message, so axes are omitted. */
function Spark({
  points,
  format,
}: {
  points: Array<{ label: string; value: number }>
  format: (value: number) => string
}) {
  if (points.length === 0) return <p className="text-sm" style={{ color: MUTED }}>No history.</p>
  if (points.length === 1) {
    return (
      <p className="text-xl" style={{ color: BONE, fontVariantNumeric: 'tabular-nums' }}>
        {format(points[0].value)}
        <span className="ml-2 text-xs" style={{ color: MUTED }}>{points[0].label}</span>
      </p>
    )
  }

  const w = 260
  const h = 56
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * w,
    y: h - ((p.value - min) / span) * h,
  }))
  const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h + 6}`} className="w-full overflow-visible">
        <motion.path
          d={d}
          fill="none"
          stroke={BRASS}
          strokeWidth={1.75}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3.5 : 2} fill={BRASS} />
        ))}
      </svg>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-[10px]" style={{ color: MUTED }}>{points[0].label}</span>
        <span className="text-base" style={{ color: BONE, fontVariantNumeric: 'tabular-nums' }}>
          {format(points[points.length - 1].value)}
        </span>
      </div>
    </div>
  )
}

/** Percentile as a filled track, so standing reads without arithmetic. */
function Percentile({ label, value, size }: { label: string; value: number | null; size?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: '0.16em' }}>
          {label}
        </span>
        <span className="text-sm" style={{ color: BONE, fontVariantNumeric: 'tabular-nums' }}>
          {value === null ? '—' : `${value}th`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full" style={{ backgroundColor: EDGE }}>
        <motion.div
          className="h-1.5 rounded-full"
          style={{ backgroundColor: BRASS }}
          initial={{ width: 0 }}
          animate={{ width: `${value ?? 0}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      {size !== undefined && (
        <p className="mt-1 text-[10px]" style={{ color: MUTED }}>of {size} scored</p>
      )}
    </div>
  )
}

export default function Employee360Page() {
  const [directory, setDirectory] = useState<Array<{ id: string; name: string; department: string | null }>>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [data, setData] = useState<Employee360 | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingProfile, setLoadingProfile] = useState(false)

  useEffect(() => {
    fetch('/api/users')
      .then((res) => res.json())
      .then((payload) => {
        const users = (payload.users || []) as Array<{ id: string; name: string; department: string | null }>
        const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name))
        setDirectory(sorted)
        setSelectedId((current) => current ?? sorted[0]?.id ?? null)
      })
      .catch(() => toast.error('Failed to load the directory'))
      .finally(() => setLoading(false))
  }, [])

  const load = useCallback((employeeId: string) => {
    setLoadingProfile(true)
    fetch(`/api/admin/analytics/employee-360?employeeId=${employeeId}`)
      .then((res) => res.json())
      .then((payload) => {
        if (payload.error) throw new Error(payload.error)
        setData(payload)
      })
      .catch(() => toast.error('Failed to build this profile'))
      .finally(() => setLoadingProfile(false))
  }, [])

  useEffect(() => {
    if (selectedId) load(selectedId)
  }, [selectedId, load])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return directory
    return directory.filter(
      (person) =>
        person.name.toLowerCase().includes(term) ||
        (person.department || '').toLowerCase().includes(term)
    )
  }, [directory, query])

  const growth = data ? compGrowth(data.comp) : null

  if (loading) {
    return (
      <div className="p-6 sm:p-8">
        <LoadingScreen message="Loading Employee 360..." />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6" style={{ backgroundColor: INK, minHeight: '100%' }}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4" style={{ color: BRASS }} />
          <h1
            className="text-2xl"
            style={{ color: BONE, fontFamily: 'var(--font-display, Instrument Serif), Georgia, serif' }}
          >
            Employee 360
          </h1>
        </div>
        {data?.period && (
          <span className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: '0.18em' }}>
            {data.period.name}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        {/* Subject roster */}
        <aside
          className="rounded-xl border p-3 h-fit"
          style={{ borderColor: EDGE, backgroundColor: PANEL }}
        >
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: MUTED }} />
            <Input
              placeholder="Find subject..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
              style={{ backgroundColor: INK, borderColor: EDGE, color: BONE }}
            />
          </div>
          <div className="max-h-[720px] space-y-0.5 overflow-y-auto pr-1">
            {filtered.map((person) => {
              const active = selectedId === person.id
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSelectedId(person.id)}
                  className="w-full rounded px-2 py-1.5 text-left transition-colors"
                  style={{
                    backgroundColor: active ? 'rgba(232,194,90,0.12)' : 'transparent',
                    boxShadow: active ? `inset 2px 0 0 ${BRASS}` : 'none',
                  }}
                >
                  <div className="truncate text-[13px]" style={{ color: active ? BONE : '#C6CCD8' }}>
                    {person.name}
                  </div>
                  <div className="truncate text-[10px]" style={{ color: MUTED }}>
                    {person.department || 'No department'}
                  </div>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-xs" style={{ color: MUTED }}>Nobody matches.</p>
            )}
          </div>
        </aside>

        {!data ? (
          <div className="flex h-[600px] items-center justify-center gap-3" style={{ color: MUTED }}>
            <Orbit className="h-8 w-8" />
            {loadingProfile ? 'Assembling profile...' : 'Select a subject.'}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Identity + standing */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <Panel title="Subject">
                <h2
                  className="text-3xl leading-none"
                  style={{
                    color: BONE,
                    fontFamily: 'var(--font-display, Instrument Serif), Georgia, serif',
                  }}
                >
                  {data.employee.name}
                </h2>
                <p className="mt-1.5 text-sm" style={{ color: MUTED }}>
                  {[data.employee.position, data.employee.department].filter(Boolean).join(' · ') ||
                    'No role recorded'}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat
                    label="Score"
                    value={data.performance.overallScore === null ? '—' : `${data.performance.overallScore.toFixed(0)}%`}
                  />
                  <Stat
                    label="Momentum"
                    value={
                      data.performance.momentumDelta === null
                        ? 'new'
                        : `${data.performance.momentumDelta > 0 ? '+' : ''}${data.performance.momentumDelta.toFixed(1)}`
                    }
                    tone={
                      data.performance.momentumDelta === null
                        ? undefined
                        : data.performance.momentumDelta >= 0
                          ? TONE.STRONG
                          : TONE.WATCH
                    }
                  />
                  <Stat
                    label="Consensus"
                    value={data.performance.consensus === null ? '—' : `${(data.performance.consensus * 100).toFixed(0)}%`}
                  />
                  <Stat label="Clients" value={String(data.clients.length)} />
                </div>
              </Panel>

              <Panel title="Standing">
                <div className="space-y-4">
                  <Percentile
                    label="Company"
                    value={data.standing.companyPercentile}
                    size={data.standing.companySize}
                  />
                  <Percentile label="Department" value={data.standing.departmentPercentile} />
                </div>
              </Panel>
            </div>

            {/* Orrery + outlook */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel title="Evaluation orbit">
                <EmployeeOrrery
                  name={data.employee.name}
                  perLens={data.performance.perLens}
                  orgPerLensAverage={data.performance.orgPerLensAverage}
                  overallScore={data.performance.overallScore}
                  clients={data.clients}
                />
                <p className="mt-1 text-center text-[10px]" style={{ color: MUTED }}>
                  Solid is the subject. Dashed is the company average for the same lenses. Outer
                  ring is clients; filled marks the ones they lead.
                </p>
              </Panel>

              <div className="space-y-4">
                <Panel title="Outlook">
                  <p
                    className="text-2xl leading-tight"
                    style={{
                      color: TONE[data.outlook.tone],
                      fontFamily: 'var(--font-display, Instrument Serif), Georgia, serif',
                    }}
                  >
                    {data.outlook.headline}
                  </p>
                  <p className="mt-1.5 text-sm" style={{ color: '#C6CCD8' }}>{data.outlook.detail}</p>
                  {data.outlook.caveat && (
                    <p
                      className="mt-3 border-l-2 pl-3 text-xs"
                      style={{ borderColor: TONE.WATCH, color: '#E0A99C' }}
                    >
                      {data.outlook.caveat}
                    </p>
                  )}
                </Panel>

                <Panel title="Activity">
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="Open tasks" value={String(data.activity.openTasks)} />
                    <Stat label="Completed" value={String(data.activity.doneTasks)} />
                    <Stat label="Leave days" value={String(data.activity.leaveDays)} />
                    <Stat label="Assets" value={String(data.activity.assets)} />
                  </div>
                  <p className="mt-2 text-[10px]" style={{ color: MUTED }}>
                    Leave counts approved days this calendar year.
                  </p>
                </Panel>
              </div>
            </div>

            {/* Raters: the part that separates a low score from a harsh marker */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Who rated them">
                {data.evaluators.length === 0 ? (
                  <p className="text-sm" style={{ color: MUTED }}>No submitted ratings this period.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.evaluators.map((rater) => {
                      const harsh = rater.raterDeviation !== null && rater.raterDeviation < 0
                      return (
                        <div
                          key={rater.id}
                          className="flex items-center gap-3 rounded px-2 py-1.5"
                          style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px]" style={{ color: BONE }}>
                              {rater.name}
                            </div>
                            <div className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: '0.1em' }}>
                              {LENS_SHORT[rater.relationshipType] ??
                                RELATIONSHIP_TYPE_LABELS[rater.relationshipType as RelationshipType] ??
                                rater.relationshipType}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[15px]" style={{ color: BONE, fontVariantNumeric: 'tabular-nums' }}>
                              {rater.meanGiven.toFixed(2)}
                            </div>
                            <div
                              className="text-[10px]"
                              style={{ color: rater.raterDeviation === null ? MUTED : harsh ? TONE.WATCH : TONE.STRONG }}
                            >
                              {rater.raterDeviation === null
                                ? 'rater unknown'
                                : `rates ${rater.raterDeviation > 0 ? '+' : ''}${rater.raterDeviation.toFixed(2)} vs norm`}
                              {rater.raterIsProvisional ? ' · thin' : ''}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <p className="pt-1 text-[10px]" style={{ color: MUTED }}>
                      A low mark from a habitually harsh rater is a different fact from a low mark
                      from a generous one.
                    </p>
                  </div>
                )}
              </Panel>

              <Panel title="Network">
                <div className="space-y-3 text-[13px]">
                  <div>
                    <p className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: '0.16em' }}>
                      Reports to
                    </p>
                    <p style={{ color: data.network.leads.length ? BONE : MUTED }}>
                      {data.network.leads.map((p) => p.name).join(', ') || 'No lead mapped'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: '0.16em' }}>
                      Leads ({data.network.reports.length})
                    </p>
                    <p style={{ color: data.network.reports.length ? BONE : MUTED }}>
                      {data.network.reports.map((p) => p.name).join(', ') || 'Nobody'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase" style={{ color: MUTED, letterSpacing: '0.16em' }}>
                      Shares clients with ({data.network.colleagues.length})
                    </p>
                    {data.network.colleagues.length === 0 ? (
                      <p style={{ color: MUTED }}>Not on any shared client</p>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {data.network.colleagues.map((c) => (
                          <span
                            key={c.id}
                            className="rounded px-1.5 py-0.5 text-[11px]"
                            style={{ backgroundColor: 'rgba(127,178,217,0.12)', color: COOL }}
                            title={c.clients.join(', ')}
                          >
                            {c.name}
                            {c.clients.length > 1 ? ` ×${c.clients.length}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            </div>

            {/* Trajectories */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Performance over time">
                <Spark
                  points={data.history.map((p) => ({ label: p.periodName, value: p.score }))}
                  format={(v) => `${v.toFixed(0)}%`}
                />
              </Panel>
              <Panel title="Compensation over time">
                {growth !== null && (
                  <p
                    className="mb-1 text-xs"
                    style={{
                      color: growth >= 0 ? TONE.STRONG : TONE.WATCH,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {growth > 0 ? '+' : ''}
                    {growth.toFixed(0)}% overall
                  </p>
                )}
                <Spark
                  points={data.comp.map((p) => ({
                    label: new Date(p.effectiveFrom).toLocaleDateString(undefined, {
                      month: 'short',
                      year: 'numeric',
                    }),
                    value: p.total,
                  }))}
                  format={(v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                />
              </Panel>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
