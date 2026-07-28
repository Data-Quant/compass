'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Eye, Search, Users } from 'lucide-react'
import type { BlindSpotEntry, BlindSpotsResult } from '@/lib/analytics/blind-spots'
import { RELATIONSHIP_TYPE_LABELS, type RelationshipType } from '@/types'
import type { NameResolver } from '@/components/analytics/types'

interface BlindSpotsTabProps {
  blindSpots: BlindSpotsResult
  resolveName: NameResolver
  selectedEmployeeId: string | null
  onSelectEmployee: (employeeId: string) => void
}

interface FlagListProps {
  title: string
  subtitle: string
  entries: BlindSpotEntry[]
  resolveName: NameResolver
  selectedId: string | null
  onSelect: (employeeId: string) => void
  render: (entry: BlindSpotEntry) => string
}

function FlagList({
  title,
  subtitle,
  entries,
  resolveName,
  selectedId,
  onSelect,
  render,
}: FlagListProps) {
  const [query, setQuery] = useState('')

  // These lists now hold everyone rather than a top five, so they need a filter
  // and a bounded height; roughly fifty rows is otherwise a wall to scan.
  const filtered = query.trim()
    ? entries.filter((entry) => {
        const term = query.trim().toLowerCase()
        return (
          resolveName(entry.employeeId).toLowerCase().includes(term) ||
          (entry.department || '').toLowerCase().includes(term)
        )
      })
    : entries

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <span className="text-xs text-muted-foreground shrink-0">
            {filtered.length === entries.length
              ? `${entries.length} people`
              : `${filtered.length} of ${entries.length}`}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{subtitle}</p>
        {entries.length > 8 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search name or department..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
        )}
        {filtered.length > 0 ? (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {filtered.map((entry, index) => (
              <motion.button
                key={entry.employeeId}
                type="button"
                onClick={() => onSelect(entry.employeeId)}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                // Cap the stagger: at fifty rows a per-row delay would take
                // seconds to finish drawing the list.
                transition={{ delay: Math.min(index, 8) * 0.04 }}
                className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                  selectedId === entry.employeeId ? 'bg-primary/10 ring-1 ring-primary' : 'bg-muted'
                }`}
              >
                <div>
                  <div className="font-medium text-foreground">{resolveName(entry.employeeId)}</div>
                  <div className="text-xs text-muted-foreground">
                    {entry.department || 'No department'}
                  </div>
                </div>
                <div className="font-semibold text-foreground">{render(entry)}</div>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">No data available</div>
        )}
      </CardContent>
    </Card>
  )
}

export function BlindSpotsTab({
  blindSpots,
  resolveName,
  selectedEmployeeId,
  onSelectEmployee,
}: BlindSpotsTabProps) {
  // Fall back to the most notable person so the radar is never empty on arrival.
  const selectedId =
    selectedEmployeeId ??
    blindSpots.topSelfGaps[0]?.employeeId ??
    blindSpots.entries[0]?.employeeId ??
    null

  if (blindSpots.insufficientData) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Eye className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Blind-spot analysis needs at least two evaluation lenses per person. No one in this
            period qualifies yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  const selected = blindSpots.entries.find((entry) => entry.employeeId === selectedId) ?? null

  // Each lens is plotted against the average for that lens across everyone. A 3.1
  // from peers means nothing on its own; against a 3.4 norm it is a dip, and that
  // difference is what "split opinion" actually refers to.
  const radarData = selected
    ? (Object.entries(selected.perLens) as Array<[RelationshipType, number]>)
        .map(([lens, score]) => ({
          lens: RELATIONSHIP_TYPE_LABELS[lens] ?? lens,
          score: Number(score.toFixed(2)),
          average: Number((blindSpots.orgPerLensAverage[lens] ?? 0).toFixed(2)),
        }))
        .sort((a, b) => a.lens.localeCompare(b.lens))
    : []

  const lensValues = selected ? Object.values(selected.perLens) : []
  const highestLens = lensValues.length > 0 ? Math.max(...lensValues) : null
  const lowestLens = lensValues.length > 0 ? Math.min(...lensValues) : null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FlagList
          title="Largest Self-Awareness Gaps"
          subtitle="Self rating vs. how everyone else rates them (0-4 scale)"
          entries={blindSpots.bySelfGap}
          resolveName={resolveName}
          selectedId={selectedId}
          onSelect={onSelectEmployee}
          render={(entry) =>
            entry.selfGap === null
              ? '—'
              : `${entry.selfGap > 0 ? '+' : ''}${entry.selfGap.toFixed(2)}`
          }
        />
        <FlagList
          title="Most Split Opinions"
          subtitle="Spread between the highest and lowest lens (0-4 scale)"
          entries={blindSpots.bySpread}
          resolveName={resolveName}
          selectedId={selectedId}
          onSelect={onSelectEmployee}
          render={(entry) => (entry.lensSpread === null ? '—' : entry.lensSpread.toFixed(2))}
        />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">
                {selected ? resolveName(selected.employeeId) : 'Select a person'}
              </h3>
            </div>
            {selected && (
              <p className="text-sm text-muted-foreground mb-4">
                Others {selected.weightedOthersScore?.toFixed(2) ?? '—'} • Spread{' '}
                {selected.lensSpread?.toFixed(2) ?? '—'}
                {highestLens !== null && lowestLens !== null
                  ? ` (${lowestLens.toFixed(2)} to ${highestLens.toFixed(2)})`
                  : ''}
                {selected.selfScore !== null ? ` • Self ${selected.selfScore.toFixed(2)}` : ''}
              </p>
            )}
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="lens" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  {/* Labels and axis line hidden, but the domain stays pinned to
                      0-4: without it Recharts rescales per person, so shapes stop
                      being comparable and the average overlay misleads. */}
                  <PolarRadiusAxis domain={[0, 4]} tick={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {/* Drawn first so the individual reads on top of the norm. */}
                  <Radar
                    name="Everyone (avg)"
                    dataKey="average"
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 3"
                    fill="hsl(var(--muted-foreground))"
                    fillOpacity={0.08}
                    animationDuration={700}
                  />
                  <Radar
                    name="This person"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.35}
                    animationDuration={700}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[360px] flex items-center justify-center text-muted-foreground">
                Select someone from a list above.
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
