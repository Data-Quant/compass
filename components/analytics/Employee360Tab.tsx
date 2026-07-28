'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Orbit } from 'lucide-react'
import { EmployeeOrrery } from '@/components/analytics/EmployeeOrrery'
import { compGrowth, type Outlook } from '@/lib/analytics/employee-360'
import type { RelationshipType } from '@/types'

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
}

interface Employee360TabProps {
  employees: Array<{ id: string; name: string; department: string | null }>
  selectedEmployeeId: string | null
  onSelectEmployee: (employeeId: string) => void
}

const TONE_COLOR: Record<string, string> = {
  STRONG: '#5BC0A8',
  STEADY: '#E8C25A',
  WATCH: '#E06C55',
  UNKNOWN: '#9AA3B2',
}

/** A stat on the ink field. Values are tabular so columns line up as they change. */
function Readout({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-[#9AA3B2]" style={{ letterSpacing: '0.16em' }}>
        {label}
      </p>
      <p
        className="mt-1 text-2xl text-[#E9E4D6]"
        style={{ fontVariantNumeric: 'tabular-nums', color: tone }}
      >
        {value}
      </p>
    </div>
  )
}

/** Minimal trajectory line. Axis labels are omitted; the shape is the message. */
function Trajectory({
  points,
  format,
}: {
  points: Array<{ label: string; value: number }>
  format: (value: number) => string
}) {
  if (points.length === 0) {
    return <p className="text-sm text-[#9AA3B2]">No history recorded.</p>
  }
  if (points.length === 1) {
    return (
      <p className="text-2xl text-[#E9E4D6]" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {format(points[0].value)}
        <span className="ml-2 text-sm text-[#9AA3B2]">{points[0].label}</span>
      </p>
    )
  }

  const width = 320
  const height = 90
  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const coords = points.map((point, index) => ({
    x: (index / (points.length - 1)) * width,
    y: height - ((point.value - min) / span) * height,
  }))

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const last = points[points.length - 1]

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height + 8}`} className="w-full overflow-visible">
        <motion.path
          d={path}
          fill="none"
          stroke="#E8C25A"
          strokeWidth={1.75}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 4 : 2.5} fill="#E8C25A" />
        ))}
      </svg>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[11px] text-[#9AA3B2]">{points[0].label}</span>
        <span className="text-lg text-[#E9E4D6]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {format(last.value)}
        </span>
      </div>
    </div>
  )
}

export function Employee360Tab({
  employees,
  selectedEmployeeId,
  onSelectEmployee,
}: Employee360TabProps) {
  const [query, setQuery] = useState('')
  const [data, setData] = useState<Employee360 | null>(null)
  const [loading, setLoading] = useState(false)

  const activeId = selectedEmployeeId ?? employees[0]?.id ?? null

  useEffect(() => {
    if (!activeId) return
    setLoading(true)
    fetch(`/api/admin/analytics/employee-360?employeeId=${activeId}`)
      .then((res) => res.json())
      .then((payload) => {
        if (payload.error) throw new Error(payload.error)
        setData(payload)
      })
      .catch(() => toast.error('Failed to load this profile'))
      .finally(() => setLoading(false))
  }, [activeId])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return employees
    return employees.filter(
      (employee) =>
        employee.name.toLowerCase().includes(term) ||
        (employee.department || '').toLowerCase().includes(term)
    )
  }, [employees, query])

  const growth = data ? compGrowth(data.comp) : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
      {/* Roster */}
      <Card className="h-fit">
        <CardContent className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Find someone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
          <div className="max-h-[600px] overflow-y-auto pr-1 space-y-1">
            {filtered.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => onSelectEmployee(employee.id)}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  activeId === employee.id ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted'
                }`}
              >
                <div className="truncate text-sm font-medium text-foreground">{employee.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {employee.department || 'No department'}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nobody matches.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* The dossier, on its own ink field so the orrery reads as an instrument. */}
      <div className="rounded-2xl border border-[#1E2A44] bg-[#0D1424] overflow-hidden">
        {loading && !data ? (
          <div className="flex h-[560px] items-center justify-center text-[#9AA3B2]">
            Assembling profile...
          </div>
        ) : !data ? (
          <div className="flex h-[560px] flex-col items-center justify-center gap-3 text-[#9AA3B2]">
            <Orbit className="h-10 w-10" />
            <p>Select someone to build their profile.</p>
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2
                  className="text-4xl leading-none text-[#E9E4D6]"
                  style={{
                    fontFamily: 'var(--font-display, Instrument Serif), Georgia, serif',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {data.employee.name}
                </h2>
                <p className="mt-2 text-sm text-[#9AA3B2]">
                  {[data.employee.position, data.employee.department].filter(Boolean).join(' · ') ||
                    'No role recorded'}
                </p>
              </div>
              {data.period && (
                <span
                  className="text-[10px] uppercase text-[#9AA3B2]"
                  style={{ letterSpacing: '0.18em' }}
                >
                  {data.period.name}
                </span>
              )}
            </div>

            <EmployeeOrrery
              name={data.employee.name}
              perLens={data.performance.perLens}
              orgPerLensAverage={data.performance.orgPerLensAverage}
              overallScore={data.performance.overallScore}
              clients={data.clients}
            />

            <p className="mt-2 text-center text-[11px] text-[#9AA3B2]">
              Solid outline is this person. Dashed is the company average for the same lenses.
              Outer ring is their clients; filled marks the ones they lead.
            </p>

            {/* Outlook */}
            <div className="mt-8 rounded-xl border border-[#1E2A44] bg-[#0B1120] p-5">
              <p className="text-[10px] uppercase text-[#9AA3B2]" style={{ letterSpacing: '0.16em' }}>
                Outlook
              </p>
              <p
                className="mt-1 text-2xl"
                style={{
                  fontFamily: 'var(--font-display, Instrument Serif), Georgia, serif',
                  color: TONE_COLOR[data.outlook.tone],
                }}
              >
                {data.outlook.headline}
              </p>
              <p className="mt-1 text-sm text-[#C6CCD8]">{data.outlook.detail}</p>
              {data.outlook.caveat && (
                <p className="mt-3 border-l-2 border-[#E06C55] pl-3 text-sm text-[#E0A99C]">
                  {data.outlook.caveat}
                </p>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Readout
                label="Score"
                value={
                  data.performance.overallScore === null
                    ? '—'
                    : `${data.performance.overallScore.toFixed(0)}%`
                }
              />
              <Readout
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
                      ? TONE_COLOR.STRONG
                      : TONE_COLOR.WATCH
                }
              />
              <Readout
                label="Consensus"
                value={
                  data.performance.consensus === null
                    ? '—'
                    : `${(data.performance.consensus * 100).toFixed(0)}%`
                }
              />
              <Readout label="Clients" value={String(data.clients.length)} />
            </div>

            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
              <div>
                <p
                  className="mb-3 text-[10px] uppercase text-[#9AA3B2]"
                  style={{ letterSpacing: '0.16em' }}
                >
                  Performance over time
                </p>
                <Trajectory
                  points={data.history.map((point) => ({
                    label: point.periodName,
                    value: point.score,
                  }))}
                  format={(value) => `${value.toFixed(0)}%`}
                />
              </div>

              <div>
                <div className="mb-3 flex items-baseline justify-between">
                  <p
                    className="text-[10px] uppercase text-[#9AA3B2]"
                    style={{ letterSpacing: '0.16em' }}
                  >
                    Compensation over time
                  </p>
                  {growth !== null && (
                    <span
                      className="text-xs"
                      style={{
                        color: growth >= 0 ? TONE_COLOR.STRONG : TONE_COLOR.WATCH,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {growth > 0 ? '+' : ''}
                      {growth.toFixed(0)}% overall
                    </span>
                  )}
                </div>
                <Trajectory
                  points={data.comp.map((point) => ({
                    label: new Date(point.effectiveFrom).toLocaleDateString(undefined, {
                      month: 'short',
                      year: 'numeric',
                    }),
                    value: point.total,
                  }))}
                  format={(value) => value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
