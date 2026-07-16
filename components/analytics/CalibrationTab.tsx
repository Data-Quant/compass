'use client'

import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Scale, ShieldCheck } from 'lucide-react'
import type { CalibrationResult, EvaluatorCalibration } from '@/lib/analytics/calibration'
import type { NameResolver } from '@/components/analytics/types'

interface CalibrationTabProps {
  calibration: CalibrationResult
  resolveName: NameResolver
}

interface EvaluatorListProps {
  title: string
  subtitle: string
  evaluators: EvaluatorCalibration[]
  resolveName: NameResolver
}

function EvaluatorList({ title, subtitle, evaluators, resolveName }: EvaluatorListProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
        {evaluators.length > 0 ? (
          <div className="space-y-3">
            {evaluators.map((evaluator, index) => (
              <motion.div
                key={evaluator.evaluatorId}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index }}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div>
                  <div className="font-medium text-foreground">
                    {resolveName(evaluator.evaluatorId)}
                    {evaluator.isExempt && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-background text-muted-foreground">
                        uncapped
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {evaluator.ratingCount} ratings • mean {evaluator.meanRating.toFixed(2)}
                  </div>
                </div>
                <div
                  className={`font-semibold ${
                    evaluator.deviation >= 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {evaluator.deviation > 0 ? '+' : ''}
                  {evaluator.deviation.toFixed(2)}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">No data available</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EvaluatorList
          title="Most Lenient"
          subtitle="Rates above the org mean"
          evaluators={calibration.mostLenient}
          resolveName={resolveName}
        />
        <EvaluatorList
          title="Most Severe"
          subtitle="Rates below the org mean"
          evaluators={calibration.mostSevere}
          resolveName={resolveName}
        />
      </div>
    </div>
  )
}
