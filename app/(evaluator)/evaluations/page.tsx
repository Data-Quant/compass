'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { RELATIONSHIP_TYPE_LABELS } from '@/types'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  Users,
} from 'lucide-react'

interface Mapping {
  id: string
  evaluatee: { id: string; name: string; department: string | null; position: string | null }
  relationshipType: string
  questionsCount: number
  completedCount: number
  isComplete: boolean
}

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

export default function EvaluationsPage() {
  const user = useLayoutUser()
  const [mappings, setMappings] = useState<Record<string, Mapping[]>>({})
  const [period, setPeriod] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadEvaluations()
  }, [user])

  const loadEvaluations = async () => {
    try {
      const res = await fetch('/api/evaluations/dashboard?periodId=active')
      const data = await res.json()
      if (data.mappings) {
        setMappings(data.mappings)
        setPeriod(data.period)
      }
    } catch {
      toast.error('Failed to load evaluations')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingScreen message="Loading evaluations..." />

  const allMappings = Object.values(mappings).flat()
  const totalEvaluations = allMappings.length
  const completedEvaluations = allMappings.filter(m => m.isComplete).length
  const evaluationPercent = totalEvaluations > 0
    ? Math.round((completedEvaluations / totalEvaluations) * 100)
    : 0

  const relationshipTypes = Object.keys(mappings)

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          Performance Evaluations
        </h1>
        <p className="text-muted-foreground mt-1">
          {period ? period.name : 'No active evaluation period'}
        </p>

        {/* Overall progress */}
        {totalEvaluations > 0 && (
          <div className="mt-4 flex items-center gap-4">
            <Progress value={evaluationPercent} className="flex-1 h-2.5 max-w-sm" />
            <span className="text-sm font-medium text-foreground">
              {completedEvaluations}/{totalEvaluations} completed ({evaluationPercent}%)
            </span>
          </div>
        )}
      </motion.div>

      {/* No evaluations */}
      {totalEvaluations === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-12 w-12" />}
          title="No evaluations assigned"
          description={period ? 'You have no evaluations to complete for this period.' : 'No active evaluation period found.'}
        />
      ) : (
        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Grouped by relationship type */}
          {relationshipTypes.map((type) => {
            const group = mappings[type]
            const groupCompleted = group.filter(m => m.isComplete).length
            const label = RELATIONSHIP_TYPE_LABELS[type as keyof typeof RELATIONSHIP_TYPE_LABELS] || type

            return (
              <motion.div key={type} variants={stagger.item}>
                <Card>
                  <CardContent className="p-6">
                    {/* Group header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-semibold text-foreground">{label}</h2>
                      </div>
                      <Badge variant="secondary">
                        {groupCompleted}/{group.length} done
                      </Badge>
                    </div>

                    {/* Evaluatee list */}
                    <div className="space-y-2">
                      {group.map((m) => {
                        const pct = m.questionsCount > 0
                          ? Math.round((m.completedCount / m.questionsCount) * 100)
                          : 0

                        return (
                          <Link
                            key={m.id}
                            href={`/evaluate/${m.evaluatee.id}`}
                            className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-muted transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <UserAvatar name={m.evaluatee.name} size="sm" />
                              <div>
                                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                  {m.evaluatee.name}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {m.evaluatee.position && <span>{m.evaluatee.position}</span>}
                                  {m.evaluatee.position && m.evaluatee.department && <span>·</span>}
                                  {m.evaluatee.department && <span>{m.evaluatee.department}</span>}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {m.isComplete ? (
                                <div className="flex items-center gap-1.5 text-emerald-500">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span className="text-xs font-medium">Complete</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Progress value={pct} className="w-20 h-1.5" />
                                  <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                                </div>
                              )}
                              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}
