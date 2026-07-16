'use client'

import { motion } from 'framer-motion'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Eye, Users } from 'lucide-react'
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
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
        {entries.length > 0 ? (
          <div className="space-y-3">
            {entries.map((entry, index) => (
              <motion.button
                key={entry.employeeId}
                type="button"
                onClick={() => onSelect(entry.employeeId)}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index }}
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
  const radarData = selected
    ? (Object.entries(selected.perLens) as Array<[RelationshipType, number]>).map(
        ([lens, score]) => ({
          lens: RELATIONSHIP_TYPE_LABELS[lens] ?? lens,
          score: Number(score.toFixed(2)),
        })
      )
    : []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FlagList
          title="Largest Self-Awareness Gaps"
          subtitle="Self rating vs. how everyone else rates them (0-4 scale)"
          entries={blindSpots.topSelfGaps}
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
          entries={blindSpots.topSpreads}
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
                Self {selected.selfScore?.toFixed(2) ?? '—'} • Others{' '}
                {selected.weightedOthersScore?.toFixed(2) ?? '—'} • Spread{' '}
                {selected.lensSpread?.toFixed(2) ?? '—'}
              </p>
            )}
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="lens" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <PolarRadiusAxis domain={[0, 4]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Radar
                    name="Score"
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
