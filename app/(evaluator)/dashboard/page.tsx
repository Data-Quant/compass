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
import { Button } from '@/components/ui/button'
import { StatsCard } from '@/components/composed/StatsCard'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { EmptyState } from '@/components/composed/EmptyState'
import {
  ClipboardCheck,
  Calendar,
  FolderKanban,
  Monitor,
  ArrowRight,
  CheckCircle2,
  Clock,
  Target,
  Sun,
  Thermometer,
  Palmtree,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Mapping {
  id: string
  evaluatee: { id: string; name: string; department: string | null; position: string | null }
  relationshipType: string
  questionsCount: number
  completedCount: number
  isComplete: boolean
}

interface LeaveBalance {
  casualDays: number; casualUsed: number
  sickDays: number; sickUsed: number
  annualDays: number; annualUsed: number
}

interface ProjectSummary {
  id: string; name: string; taskCount: number; completedTasks: number
}

// ─── Animation helpers ───────────────────────────────────────────────────────

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

// ─── Dashboard Page ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useLayoutUser()
  const [mappings, setMappings] = useState<Record<string, Mapping[]>>({})
  const [period, setPeriod] = useState<any>(null)
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      loadEvaluations(),
      loadLeaveBalance(),
      loadProjects(),
    ]).finally(() => setLoading(false))
  }, [user])

  const loadEvaluations = async () => {
    try {
      const res = await fetch('/api/evaluations/dashboard?periodId=active')
      const data = await res.json()
      if (data.mappings) { setMappings(data.mappings); setPeriod(data.period) }
    } catch { /* silent */ }
  }

  const loadLeaveBalance = async () => {
    try {
      const res = await fetch('/api/leave/balance')
      const data = await res.json()
      if (data.balance) setLeaveBalance(data.balance)
    } catch { /* silent */ }
  }

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (data.projects) setProjects(data.projects.slice(0, 3))
    } catch { /* silent - projects may not exist yet */ }
  }

  // ─── Computed stats ──────────────────────────────────────────────────────

  const allMappings = Object.values(mappings).flat()
  const totalEvaluations = allMappings.length
  const completedEvaluations = allMappings.filter(m => m.isComplete).length
  const evaluationPercent = totalEvaluations > 0
    ? Math.round((completedEvaluations / totalEvaluations) * 100)
    : 0

  const totalLeaveRemaining = leaveBalance
    ? (leaveBalance.casualDays - leaveBalance.casualUsed)
      + (leaveBalance.sickDays - leaveBalance.sickUsed)
      + (leaveBalance.annualDays - leaveBalance.annualUsed)
    : 0

  const activeProjects = projects.length

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      {/* Welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          Welcome back, <span className="gradient-text">{user?.name?.split(' ')[0] || 'there'}</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          {period ? `${period.name} evaluation period` : 'Here\u2019s your overview'}
        </p>
      </motion.div>

      {/* Quick stats */}
      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        <motion.div variants={stagger.item}>
          <StatsCard
            title="Evaluations"
            value={completedEvaluations}
            suffix={`/${totalEvaluations}`}
            icon={<ClipboardCheck className="w-5 h-5" />}
          />
        </motion.div>
        <motion.div variants={stagger.item}>
          <StatsCard
            title="Leave Remaining"
            value={totalLeaveRemaining}
            suffix=" days"
            icon={<Calendar className="w-5 h-5" />}
          />
        </motion.div>
        <motion.div variants={stagger.item}>
          <StatsCard
            title="Active Projects"
            value={activeProjects}
            icon={<FolderKanban className="w-5 h-5" />}
          />
        </motion.div>
        <motion.div variants={stagger.item}>
          <StatsCard
            title="Completion"
            value={evaluationPercent}
            suffix="%"
            icon={<Target className="w-5 h-5" />}
          />
        </motion.div>
      </motion.div>

      {/* Section cards */}
      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* ── Evaluations Card ─────────────────────────────────────────── */}
        <motion.div variants={stagger.item} id="evaluations">
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Performance Evaluations</h2>
                </div>
                <Badge variant="secondary">{period?.name || 'No period'}</Badge>
              </div>

              {totalEvaluations === 0 ? (
                <p className="text-sm text-muted-foreground">No evaluations assigned yet.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Progress value={evaluationPercent} className="flex-1 h-2" />
                    <span className="text-sm font-medium text-foreground w-12 text-right">
                      {evaluationPercent}%
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {allMappings.slice(0, 6).map((m) => (
                      <Link
                        key={m.id}
                        href={`/evaluate/${m.id}`}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors group"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={m.evaluatee.name} size="xs" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{m.evaluatee.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {RELATIONSHIP_TYPE_LABELS[m.relationshipType as keyof typeof RELATIONSHIP_TYPE_LABELS] || m.relationshipType}
                            </p>
                          </div>
                        </div>
                        {m.isComplete ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                        )}
                      </Link>
                    ))}
                  </div>

                  {totalEvaluations > 6 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{totalEvaluations - 6} more evaluations
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Leave Card ───────────────────────────────────────────────── */}
        <motion.div variants={stagger.item}>
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-emerald-500" />
                  <h2 className="text-lg font-semibold text-foreground">Leave Balance</h2>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/leave" className="gap-1.5">
                    Manage <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              {leaveBalance ? (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Casual', total: leaveBalance.casualDays, used: leaveBalance.casualUsed, icon: Sun, color: 'text-amber-500' },
                    { label: 'Sick', total: leaveBalance.sickDays, used: leaveBalance.sickUsed, icon: Thermometer, color: 'text-red-500' },
                    { label: 'Annual', total: leaveBalance.annualDays, used: leaveBalance.annualUsed, icon: Palmtree, color: 'text-emerald-500' },
                  ].map((item) => (
                    <div key={item.label} className="text-center p-3 rounded-lg bg-muted/50">
                      <item.icon className={`h-5 w-5 mx-auto mb-1.5 ${item.color}`} />
                      <p className="text-xl font-semibold text-foreground">{item.total - item.used}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground/60">{item.used}/{item.total} used</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No leave balance data.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Projects Card ────────────────────────────────────────────── */}
        <motion.div variants={stagger.item}>
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-violet-500" />
                  <h2 className="text-lg font-semibold text-foreground">Projects</h2>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/projects" className="gap-1.5">
                    View All <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              {projects.length === 0 ? (
                <EmptyState
                  icon={<FolderKanban className="h-10 w-10" />}
                  title="No projects yet"
                  description="Projects will appear here once created."
                />
              ) : (
                <div className="space-y-3">
                  {projects.map((p) => {
                    const pct = p.taskCount > 0 ? Math.round((p.completedTasks / p.taskCount) * 100) : 0
                    return (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="block p-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-foreground">{p.name}</p>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {p.completedTasks}/{p.taskCount} tasks
                        </p>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Device Support Card ──────────────────────────────────────── */}
        <motion.div variants={stagger.item}>
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-sky-500" />
                  <h2 className="text-lg font-semibold text-foreground">Device Support</h2>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/device-support" className="gap-1.5">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                Submit and track device support tickets for hardware, software, or access issues.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  )
}
