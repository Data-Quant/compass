'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
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
import { Button } from '@/components/ui/button'
import { Box, Grid2x2, Grid3x3 } from 'lucide-react'
import {
  MOMENTUM_DEAD_BAND,
  type TalentGridEntry,
  type TalentGridResult,
} from '@/lib/analytics/talent-grid'
import type { NameResolver } from '@/components/analytics/types'
import { CubeErrorBoundary } from '@/components/analytics/CubeErrorBoundary'

// Lazy-loaded so three.js never lands in the initial page bundle.
const TalentCube = dynamic(() => import('@/components/analytics/TalentCube'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] items-center justify-center text-muted-foreground">
      Loading 3D view…
    </div>
  ),
})

/** WebGL is required for the cube; the 2D grid carries the same data without it. */
function useWebGLSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      setSupported(Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')))
    } catch {
      setSupported(false)
    }
  }, [])

  return supported
}

/**
 * Performance band colors. Validated for colorblind separation (worst adjacent
 * pair ΔE 30.5 deutan, well above the 8 threshold). Band is redundant with the
 * y-axis position, and the legend below names each one, so performance is never
 * carried by color alone.
 */
const BAND_COLORS: Record<string, string> = {
  HIGH: 'hsl(142 71% 45%)',
  MID: 'hsl(217 91% 60%)',
  LOW: 'hsl(0 72% 51%)',
}

const BAND_LABELS: Record<string, string> = {
  HIGH: 'Top third',
  MID: 'Middle third',
  LOW: 'Bottom third',
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
  const webglSupported = useWebGLSupport()
  const [view, setView] = useState<'3d' | '2d'>('3d')

  const plotted: PlottedEntry[] = talentGrid.entries.map((entry) => ({
    ...entry,
    name: resolveName(entry.employeeId),
    momentum: entry.momentumDelta ?? 0,
    consensusLabel:
      entry.consensus === null ? 'not enough lenses' : `${(entry.consensus * 100).toFixed(0)}%`,
  }))

  const established = plotted.filter((entry) => !entry.isNew)
  const newcomers = plotted.filter((entry) => entry.isNew)
  const showCube = view === '3d' && webglSupported === true

  const grid2d = (
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
        <ReferenceLine x={MOMENTUM_DEAD_BAND} stroke="hsl(var(--border))" strokeDasharray="4 4" />
        <ReferenceLine x={-MOMENTUM_DEAD_BAND} stroke="hsl(var(--border))" strokeDasharray="4 4" />
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
  )

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
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Grid3x3 className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Talent Grid</h3>
              </div>
              {webglSupported && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={view === '3d' ? 'default' : 'outline'}
                    onClick={() => setView('3d')}
                  >
                    <Box className="mr-1 h-4 w-4" /> 3D
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={view === '2d' ? 'default' : 'outline'}
                    onClick={() => setView('2d')}
                  >
                    <Grid2x2 className="mr-1 h-4 w-4" /> 2D
                  </Button>
                </div>
              )}
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              {showCube
                ? 'Performance vs. momentum vs. consensus. Depth is how tightly evaluators agree — a high performer everyone agrees on is a different call from one whose reviews are split. Drag to orbit, hover for real scores, click to open their 360 radar.'
                : "Performance vs. momentum. Dot size shows evaluator consensus — smaller means opinions are split. Placement is relative to this period's cohort; hover for real scores, click to open their 360 radar."}
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-4">
              {(['HIGH', 'MID', 'LOW'] as const).map((band) => (
                <span key={band} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: BAND_COLORS[band] }}
                  />
                  {BAND_LABELS[band]}
                </span>
              ))}
              {!showCube && (
                <span className="text-xs text-muted-foreground">
                  dashed lines mark the ±{MOMENTUM_DEAD_BAND}pt &ldquo;stable&rdquo; band
                </span>
              )}
            </div>
            {showCube ? (
              <CubeErrorBoundary fallback={grid2d} onError={() => setView('2d')}>
                <TalentCube
                  entries={talentGrid.entries}
                  resolveName={resolveName}
                  onSelect={onSelectEmployee}
                />
              </CubeErrorBoundary>
            ) : (
              grid2d
            )}
          </CardContent>
        </Card>
      </motion.div>

      {newcomers.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              New This Period ({newcomers.length})
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              No prior score, so they have no momentum and are not placed on the grid.
            </p>
            <div className="flex flex-wrap gap-2">
              {newcomers.map((entry) => (
                <span key={entry.employeeId} className="rounded-full bg-muted px-3 py-1 text-sm">
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
