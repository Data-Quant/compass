'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Scale, Search, ShieldCheck } from 'lucide-react'
import {
  MIN_RATINGS_FOR_CALIBRATION,
  UNKNOWN_LENS,
  type CalibrationResult,
  type EvaluatorCalibration,
} from '@/lib/analytics/calibration'
import type { NameResolver } from '@/components/analytics/types'

const ALL_LENSES = '__all__'

/** Short labels; the full RELATIONSHIP_TYPE_LABELS are too long for filter chips. */
const LENS_LABELS: Record<string, string> = {
  TEAM_LEAD: 'Lead',
  PEER: 'Peer',
  DIRECT_REPORT: 'Reporting Member',
  HR: 'HR',
  DEPT: 'Department',
  C_LEVEL: 'C-Level',
  CROSS_DEPARTMENT: 'Cross-Dept',
}

interface CalibrationTabProps {
  calibration: CalibrationResult
  resolveName: NameResolver
}

/**
 * Every evaluator on one axis, most lenient to most severe.
 *
 * Two five-row lists showed only the extremes and hid the middle, which is where
 * most people sit and where the shape of the distribution actually lives. Each row
 * carries a bar running left or right of the org mean, so the spread is legible at
 * a glance rather than by reading numbers.
 */
function EvaluatorSpectrum({
  evaluators,
  resolveName,
  lensMeans,
}: {
  evaluators: EvaluatorCalibration[]
  resolveName: NameResolver
  lensMeans: CalibrationResult['lensMeans']
}) {
  const [query, setQuery] = useState('')
  const [lens, setLens] = useState<string>(ALL_LENSES)

  const selectableLenses = lensMeans.filter((entry) => entry.relationshipType !== UNKNOWN_LENS)
  const selectedLensMean = selectableLenses.find((entry) => entry.relationshipType === lens)

  // Picking a lens re-ranks on that lens alone, which separates "rates everyone
  // low" from "rates low only as a peer".
  const rows =
    lens === ALL_LENSES
      ? evaluators.map((evaluator) => ({
          evaluator,
          deviation: evaluator.deviation,
          ratingCount: evaluator.ratingCount,
          meanRating: evaluator.meanRating,
          isProvisional: evaluator.isProvisional,
        }))
      : evaluators
          .map((evaluator) => {
            const entry = evaluator.perLens.find((item) => item.relationshipType === lens)
            return entry
              ? {
                  evaluator,
                  deviation: entry.deviation,
                  ratingCount: entry.ratingCount,
                  meanRating: entry.meanRating,
                  isProvisional: entry.isProvisional,
                }
              : null
          })
          .filter((row): row is NonNullable<typeof row> => row !== null)
          .sort((a, b) => b.deviation - a.deviation)

  const filtered = query.trim()
    ? rows.filter((row) =>
        resolveName(row.evaluator.evaluatorId).toLowerCase().includes(query.trim().toLowerCase())
      )
    : rows

  // Bars are scaled to the widest deviation present, so the spread fills the
  // available width whether the range is 0.2 or 1.5.
  const maxAbs = rows.reduce((max, row) => Math.max(max, Math.abs(row.deviation)), 0) || 1

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-foreground">All Evaluators</h3>
          <span className="text-xs text-muted-foreground shrink-0">
            {filtered.length === rows.length
              ? `${rows.length} evaluators`
              : `${filtered.length} of ${rows.length}`}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          {lens === ALL_LENSES ? (
            <>
              Lenient to severe. Each rating is measured against the mean for the lens it was
              given through, so this reflects how someone rates rather than which lenses they
              sit in. Amber rates above the norm, blue below.
            </>
          ) : (
            <>
              How each evaluator rates <strong>as a {LENS_LABELS[lens] ?? lens}</strong>, against
              that lens&apos;s mean of {selectedLensMean?.meanRating.toFixed(2) ?? '—'}. Only
              anyone who rated in this lens appears; those under{' '}
              {MIN_RATINGS_FOR_CALIBRATION} ratings are marked as thin.
            </>
          )}
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setLens(ALL_LENSES)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              lens === ALL_LENSES
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            All lenses
          </button>
          {selectableLenses.map((entry) => (
            <button
              key={entry.relationshipType}
              type="button"
              onClick={() => setLens(entry.relationshipType)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                lens === entry.relationshipType
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              As {LENS_LABELS[entry.relationshipType] ?? entry.relationshipType}
              <span className="ml-1 opacity-60">{entry.meanRating.toFixed(2)}</span>
            </button>
          ))}
        </div>

        {rows.length > 8 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search evaluator..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
        )}

        {filtered.length > 0 ? (
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {filtered.map((row, index) => {
              const evaluator = row.evaluator
              const lenient = row.deviation >= 0
              const width = (Math.abs(row.deviation) / maxAbs) * 50

              return (
                <motion.div
                  key={evaluator.evaluatorId}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index, 8) * 0.04 }}
                  className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {resolveName(evaluator.evaluatorId)}
                      {evaluator.isExempt && (
                        <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                          uncapped
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.ratingCount} rating{row.ratingCount === 1 ? '' : 's'} • mean{' '}
                      {row.meanRating.toFixed(2)}
                      {row.isProvisional && (
                        <span
                          className="ml-2 rounded-full bg-background px-2 py-0.5"
                          title={`Fewer than ${MIN_RATINGS_FOR_CALIBRATION} ratings, so this figure moves a lot on a single answer`}
                        >
                          thin
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Centre line is the org mean; bars grow out from it. */}
                  <div className="relative hidden h-5 w-[42%] shrink-0 sm:block">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                    <div
                      className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm ${
                        lenient ? 'bg-amber-500' : 'bg-blue-500'
                      } ${row.isProvisional ? 'opacity-30' : 'opacity-70'}`}
                      style={
                        lenient
                          ? { left: '50%', width: `${width}%` }
                          : { right: '50%', width: `${width}%` }
                      }
                    />
                  </div>

                  <div
                    className={`w-14 shrink-0 text-right text-sm font-semibold ${
                      lenient
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {row.deviation > 0 ? '+' : ''}
                    {row.deviation.toFixed(2)}
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">No evaluators match.</div>
        )}
      </CardContent>
    </Card>
  )
}

export function CalibrationTab({ calibration, resolveName }: CalibrationTabProps) {
  if (calibration.insufficientData) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Scale className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No submitted ratings in this period yet.</p>
        </CardContent>
      </Card>
    )
  }

  const stats = [
    { label: 'Org Mean Rating', value: calibration.orgMeanRating.toFixed(2) },
    { label: 'Total Ratings', value: String(calibration.totalRatings) },
    { label: 'Share of 4s', value: `${(calibration.fourRatingShare * 100).toFixed(1)}%` },
    {
      label: 'At / Near Cap',
      value: `${calibration.evaluatorsAtCap} / ${calibration.evaluatorsNearCap}`,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
          >
            <Card>
              <CardContent className="p-5">
                <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Rating Distribution</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={calibration.distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="rating" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Ratings"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  animationDuration={900}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <EvaluatorSpectrum
        evaluators={calibration.allEvaluators}
        resolveName={resolveName}
        lensMeans={calibration.lensMeans}
      />
    </div>
  )
}
