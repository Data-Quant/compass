'use client'

import { motion } from 'framer-motion'
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Grid3x3 } from 'lucide-react'
import {
  MOMENTUM_DEAD_BAND,
  type TalentGridEntry,
  type TalentGridResult,
} from '@/lib/analytics/talent-grid'
import type { NameResolver } from '@/components/analytics/types'

const BAND_COLORS: Record<string, string> = {
  HIGH: 'hsl(142 71% 45%)',
  MID: 'hsl(217 91% 60%)',
  LOW: 'hsl(0 72% 51%)',
}

interface TalentGridTabProps {
  talentGrid: TalentGridResult
  resolveName: NameResolver
  onSelectEmployee: (employeeId: string) => void
}

interface PlottedEntry extends TalentGridEntry {
  name: string
  momentum: number
  consensusLabel: string
}

function TalentTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: PlottedEntry }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0].payload

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm text-foreground shadow-lg">
      <div className="font-semibold">{entry.name}</div>
      <div className="text-muted-foreground text-xs mb-2">
        {entry.department || 'No department'}
        {entry.cellLabel ? ` • ${entry.cellLabel}` : ' • New this period'}
      </div>
      <div>Performance: {entry.performanceScore.toFixed(1)}%</div>
      <div>
        Momentum:{' '}
        {entry.momentumDelta === null
          ? 'no prior period'
          : `${entry.momentumDelta > 0 ? '+' : ''}${entry.momentumDelta.toFixed(1)} pts`}
      </div>
      <div>Consensus: {entry.consensusLabel}</div>
    </div>
  )
}

export function TalentGridTab({ talentGrid, resolveName, onSelectEmployee }: TalentGridTabProps) {
  const plotted: PlottedEntry[] = talentGrid.entries.map((entry) => ({
    ...entry,
    name: resolveName(entry.employeeId),
    momentum: entry.momentumDelta ?? 0,
    consensusLabel:
      entry.consensus === null ? 'not enough lenses' : `${(entry.consensus * 100).toFixed(0)}%`,
  }))

  const established = plotted.filter((entry) => !entry.isNew)
  const newcomers = plotted.filter((entry) => entry.isNew)

  return (
    <div className="space-y-6">
      {talentGrid.insufficientData && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No prior period to compare against, so momentum is unavailable — everyone is plotted at
            zero momentum. This view gains its horizontal axis once a second period closes.
          </CardContent>
        </Card>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <Grid3x3 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Talent Grid</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Performance vs. momentum. Dot size shows evaluator consensus — smaller means opinions
              are split. Placement is relative to this period&apos;s cohort; hover for real scores,
              click to open their 360 radar.
            </p>
            <ResponsiveContainer width="100%" height={460}>
              <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  dataKey="momentum"
                  name="Momentum"
                  unit=" pts"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  type="number"
                  dataKey="performanceScore"
                  name="Performance"
                  unit="%"
                  domain={[0, 100]}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <ZAxis type="number" dataKey="consensus" range={[60, 400]} />
                <ReferenceLine
                  x={MOMENTUM_DEAD_BAND}
                  stroke="hsl(var(--border))"
                  strokeDasharray="4 4"
                />
                <ReferenceLine
                  x={-MOMENTUM_DEAD_BAND}
                  stroke="hsl(var(--border))"
                  strokeDasharray="4 4"
                />
                <Tooltip content={<TalentTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter
                  name="Team"
                  data={established}
                  animationDuration={800}
                  cursor="pointer"
                  onClick={(data) => {
                    const point = data as unknown as PlottedEntry | undefined
                    if (point?.employeeId) onSelectEmployee(point.employeeId)
                  }}
                >
                  {established.map((entry) => (
                    <Cell key={entry.employeeId} fill={BAND_COLORS[entry.performanceBand]} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {newcomers.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              New This Period ({newcomers.length})
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              No prior score, so they have no momentum and are not placed on the grid.
            </p>
            <div className="flex flex-wrap gap-2">
              {newcomers.map((entry) => (
                <span key={entry.employeeId} className="px-3 py-1 bg-muted rounded-full text-sm">
                  {entry.name} — {entry.performanceScore.toFixed(1)}%
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
