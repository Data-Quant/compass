'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Scale, Search, ShieldCheck } from 'lucide-react'
import type { CalibrationResult, EvaluatorCalibration } from '@/lib/analytics/calibration'
import type { NameResolver } from '@/components/analytics/types'

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
  orgMeanRating,
}: {
  evaluators: EvaluatorCalibration[]
  resolveName: NameResolver
  orgMeanRating: number
}) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? evaluators.filter((evaluator) =>
        resolveName(evaluator.evaluatorId).toLowerCase().includes(query.trim().toLowerCase())
      )
    : evaluators

  // Bars are scaled to the widest deviation present, so the spread fills the
  // available width whether the range is 0.2 or 1.5.
  const maxAbs = evaluators.reduce((max, e) => Math.max(max, Math.abs(e.deviation)), 0) || 1

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-foreground">All Evaluators</h3>
          <span className="text-xs text-muted-foreground shrink-0">
            {filtered.length === evaluators.length
              ? `${evaluators.length} evaluators`
              : `${filtered.length} of ${evaluators.length}`}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Lenient to severe, against the org mean of {orgMeanRating.toFixed(2)}. Amber rates above
          it, blue below.
        </p>

        {evaluators.length > 8 && (
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
            {filtered.map((evaluator, index) => {
              const lenient = evaluator.deviation >= 0
              const width = (Math.abs(evaluator.deviation) / maxAbs) * 50

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
                      {evaluator.ratingCount} ratings • mean {evaluator.meanRating.toFixed(2)}
                    </div>
                  </div>

                  {/* Centre line is the org mean; bars grow out from it. */}
                  <div className="relative hidden h-5 w-[42%] shrink-0 sm:block">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                    <div
                      className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm ${
                        lenient ? 'bg-amber-500/70' : 'bg-blue-500/70'
                      }`}
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
                    {evaluator.deviation > 0 ? '+' : ''}
                    {evaluator.deviation.toFixed(2)}
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
        orgMeanRating={calibration.orgMeanRating}
      />
    </div>
  )
}
