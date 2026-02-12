'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { RELATIONSHIP_TYPE_LABELS } from '@/types'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { StatsCard } from '@/components/composed/StatsCard'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { PageHeading } from '@/components/composed/PageHeading'
import { EmptyState } from '@/components/composed/EmptyState'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { GlareCard } from '@/components/ui/glare-card'
import { BorderBeam } from '@/components/magicui/border-beam'
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  Calendar,
  Target,
  TrendingUp,
  AlertCircle,
  Sun,
  Thermometer,
  Palmtree,
  MessageSquare,
  XCircle,
  Monitor,
} from 'lucide-react'
import { COMPANY_NAME } from '@/lib/config'

interface Mapping {
  id: string
  evaluatee: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
  relationshipType: string
  questionsCount: number
  completedCount: number
  isComplete: boolean
}

interface LeaveRequest {
  id: string
  leaveType: 'CASUAL' | 'SICK' | 'ANNUAL'
  startDate: string
  endDate: string
  reason: string
  transitionPlan: string
  status: string
  employee: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
  coverPerson?: { id: string; name: string }
  leadApprovedBy?: string
  hrApprovedBy?: string
}

interface DeviceTicket {
  id: string
  title: string
  description: string
  deviceType: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  status: 'OPEN' | 'UNDER_REVIEW' | 'SOLUTION' | 'RESOLVED'
  createdAt: string
  employee: {
    id: string
    name: string
    department: string | null
  }
}

const LEAVE_TYPE_CONFIG = {
  CASUAL: { icon: Sun, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-500/20', label: 'Casual' },
  SICK: { icon: Thermometer, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-500/20', label: 'Sick' },
  ANNUAL: { icon: Palmtree, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-500/20', label: 'Annual' },
}

export default function DashboardPage() {
  const router = useRouter()
  const [mappings, setMappings] = useState<Record<string, Mapping[]>>({})
  const [period, setPeriod] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([])
  const [actionModal, setActionModal] = useState<{ open: boolean; action: 'approve' | 'reject' | null; request: LeaveRequest | null }>({ open: false, action: null, request: null })
  const [comment, setComment] = useState('')
  const [processing, setProcessing] = useState(false)

  const [pendingTickets, setPendingTickets] = useState<DeviceTicket[]>([])
  const isSupportUser = user?.role === 'HR' || user?.role === 'SECURITY'
  const supportManageHref = user?.role === 'SECURITY' ? '/security/device-tickets' : '/admin/device-tickets'

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) { router.push('/login'); return }
        setUser(data.user)
        // Fire all data calls in parallel
        Promise.all([
          loadDashboard(),
          loadPendingLeaves(),
          ...(data.user.role === 'HR' || data.user.role === 'SECURITY' ? [loadPendingTickets()] : []),
        ])
      })
      .catch(() => router.push('/login'))
  }, [])

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/evaluations/dashboard?periodId=active')
      const data = await response.json()
      if (data.mappings) { setMappings(data.mappings); setPeriod(data.period) }
    } catch { toast.error('Failed to load dashboard') }
    finally { setLoading(false) }
  }

  const loadPendingLeaves = async () => {
    try {
      const response = await fetch('/api/leave/requests?forApproval=true')
      const data = await response.json()
      setPendingLeaves(data.requests || [])
    } catch (error) { console.error('Failed to load pending leaves:', error) }
  }

  const handleLeaveAction = async () => {
    if (!actionModal.request || !actionModal.action) return
    setProcessing(true)
    try {
      const res = await fetch('/api/leave/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: actionModal.request.id, action: actionModal.action, comment: comment || undefined }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(actionModal.action === 'approve' ? 'Leave approved' : 'Leave rejected')
        setActionModal({ open: false, action: null, request: null })
        setComment('')
        loadPendingLeaves()
      } else { toast.error(data.error || 'Action failed') }
    } catch { toast.error('Action failed') }
    finally { setProcessing(false) }
  }

  const loadPendingTickets = async () => {
    try {
      const response = await fetch('/api/device-tickets')
      const data = await response.json()
      setPendingTickets((data.tickets || []).filter((t: any) => t.status === 'OPEN' || t.status === 'UNDER_REVIEW'))
    } catch (error) { console.error('Failed to load pending tickets:', error) }
  }

  const getDaysCount = (start: string, end: string) => {
    return Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (loading) {
    return <LoadingScreen message="Loading your evaluations..." />
  }

  const relationshipTypes = Object.keys(mappings) as Array<keyof typeof RELATIONSHIP_TYPE_LABELS>
  const totalEvaluations = Object.values(mappings).flat().length
  const completedEvaluations = Object.values(mappings).flat().filter(m => m.isComplete).length
  const progressPercent = totalEvaluations > 0 ? (completedEvaluations / totalEvaluations) * 100 : 0

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar user={user} onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeading title={`Welcome back, ${user?.name?.split(' ')[0]}`}>
          {period && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{period.name}</span>
              <span className="text-border">&bull;</span>
              <span className="text-sm">
                {new Date(period.startDate).toLocaleDateString()} &ndash; {new Date(period.endDate).toLocaleDateString()}
              </span>
            </div>
          )}
        </PageHeading>

        {/* Stats Grid */}
        {totalEvaluations > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
          >
            <Card className="md:col-span-2 rounded-card relative overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Target className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Your Progress</h3>
                      <p className="text-sm text-muted-foreground">
                        {completedEvaluations === totalEvaluations
                          ? 'All evaluations complete!'
                          : `${totalEvaluations - completedEvaluations} remaining`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-light tracking-tight gradient-text">
                      {Math.round(progressPercent)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {completedEvaluations}/{totalEvaluations}
                    </div>
                  </div>
                </div>
                <Progress value={progressPercent} className="h-3" />
              </CardContent>
              <BorderBeam size={200} duration={10} borderWidth={1.5} />
            </Card>

            <StatsCard
              title="Activity"
              value={completedEvaluations}
              suffix={`/ ${totalEvaluations}`}
              icon={<TrendingUp className="w-5 h-5" />}
              description="Evaluations this period"
            />
          </motion.div>
        )}

        {/* Pending Leave Approvals */}
        {pendingLeaves.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-foreground">Pending Leave Approvals</h2>
              <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-500/20 text-amber-600 border-0">
                {pendingLeaves.length}
              </Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pendingLeaves.map((request, leaveIdx) => {
                const typeConfig = LEAVE_TYPE_CONFIG[request.leaveType]
                const TypeIcon = typeConfig.icon
                const days = getDaysCount(request.startDate, request.endDate)
                return (
                  <div key={request.id}>
                    <Card className="rounded-card border-amber-200 dark:border-amber-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`w-10 h-10 rounded-lg ${typeConfig.bg} flex items-center justify-center shrink-0`}>
                            <TypeIcon className={`w-5 h-5 ${typeConfig.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-foreground">{request.employee.name}</h4>
                            <p className="text-sm text-muted-foreground">{request.employee.department || 'No dept'}</p>
                          </div>
                        </div>
                        <div className="space-y-1 text-sm mb-3">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Type</span>
                            <span className="font-medium text-foreground">{typeConfig.label}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Duration</span>
                            <span className="font-medium text-foreground">{days} day{days > 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Dates</span>
                            <span className="text-foreground text-xs">
                              {new Date(request.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(request.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{request.reason}</p>
                        <div className="flex gap-2 text-xs mb-3">
                          <span className={request.hrApprovedBy ? 'text-emerald-600' : 'text-muted-foreground'}>
                            {request.hrApprovedBy ? '✓ HR' : '○ HR'}
                          </span>
                          <span className={request.leadApprovedBy ? 'text-emerald-600' : 'text-muted-foreground'}>
                            {request.leadApprovedBy ? '✓ Lead' : '○ Lead'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setActionModal({ open: true, action: 'approve', request })}>
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" className="flex-1" onClick={() => setActionModal({ open: true, action: 'reject', request })}>
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Pending Device Tickets */}
        {isSupportUser && pendingTickets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-4">
              <Monitor className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Pending Device Support Tickets</h2>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                {pendingTickets.length}
              </Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pendingTickets.map((ticket, ticketIdx) => (
                <div key={ticket.id}>
                <Card className="rounded-card border-primary/20">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Monitor className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-foreground">{ticket.employee.name}</h4>
                        <p className="text-sm text-muted-foreground">{ticket.employee.department || 'No dept'}</p>
                      </div>
                    </div>
                    <div className="mb-3">
                      <h5 className="text-sm font-medium text-foreground">{ticket.title}</h5>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{ticket.description}</p>
                    </div>
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2">
                        <Badge variant={ticket.priority === 'URGENT' ? 'destructive' : 'secondary'} className="text-[10px] uppercase tracking-wider">
                          {ticket.priority}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <Link href={supportManageHref} className="text-xs font-semibold text-primary hover:underline">
                        Manage &rarr;
                      </Link>
                    </div>
                  </CardContent>
                </Card>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Evaluations */}
        {relationshipTypes.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-16 h-16" />}
            title="No evaluations assigned"
            description="You'll see your evaluation tasks here when they're assigned."
          />
        ) : (
          <div className="space-y-8">
            {relationshipTypes.map((type, typeIndex) => (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + typeIndex * 0.05 }}
              >
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <span>{RELATIONSHIP_TYPE_LABELS[type]}</span>
                  <Badge variant="outline">{mappings[type].length}</Badge>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence>
                    {mappings[type].map((mapping, index) => (
                      <motion.div
                        key={mapping.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Link href={`/evaluate/${mapping.evaluatee.id}`}>
                          <GlareCard className="rounded-card">
                          <Card className="rounded-card hover:border-primary/30 hover:-translate-y-1 hover:shadow-glow transition-all duration-300 group cursor-pointer">
                            <CardContent className="p-5">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <UserAvatar name={mapping.evaluatee.name} size="sm" />
                                  <div>
                                    <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                                      {mapping.evaluatee.name}
                                    </h4>
                                    {mapping.evaluatee.department && (
                                      <p className="text-sm text-muted-foreground">{mapping.evaluatee.department}</p>
                                    )}
                                  </div>
                                </div>
                                {mapping.isComplete ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                                ) : (
                                  <Clock className="w-5 h-5 text-amber-500" />
                                )}
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Progress</span>
                                  <span className="font-medium text-foreground">
                                    {mapping.completedCount}/{mapping.questionsCount}
                                  </span>
                                </div>
                                <Progress
                                  value={(mapping.completedCount / mapping.questionsCount) * 100}
                                  className={`h-1.5 ${mapping.isComplete ? '[&>div]:bg-green-500' : ''}`}
                                />
                              </div>
                              <div className="mt-4 flex items-center justify-between text-sm">
                                <Badge variant={mapping.isComplete ? 'default' : 'secondary'} className={mapping.isComplete ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-0' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0'}>
                                  {mapping.isComplete ? 'Complete' : 'In Progress'}
                                </Badge>
                                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                              </div>
                            </CardContent>
                          </Card>
                          </GlareCard>
                        </Link>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-16 flex items-center justify-center gap-2 text-xs text-muted-foreground/50"
        >
          <span>Powered by {COMPANY_NAME}</span>
        </motion.div>
      </main>

      {/* Leave Action Modal */}
      <Modal
        isOpen={actionModal.open}
        onClose={() => setActionModal({ open: false, action: null, request: null })}
        title={actionModal.action === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
        size="sm"
      >
        {actionModal.request && (
          <div className="space-y-4">
            <Card className="bg-muted/50">
              <CardContent className="p-3">
                <p className="font-medium text-foreground">{actionModal.request.employee.name}</p>
                <p className="text-sm text-muted-foreground">
                  {LEAVE_TYPE_CONFIG[actionModal.request.leaveType].label} Leave &bull;{' '}
                  {getDaysCount(actionModal.request.startDate, actionModal.request.endDate)} days
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(actionModal.request.startDate).toLocaleDateString()} - {new Date(actionModal.request.endDate).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20">
              <CardContent className="p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">Transition Plan:</p>
                <p className="text-sm text-amber-800 dark:text-amber-300">{actionModal.request.transitionPlan}</p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <MessageSquare className="w-4 h-4" />
                Comment {actionModal.action === 'reject' ? '(recommended)' : '(optional)'}
              </Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder={actionModal.action === 'reject' ? 'Please provide a reason for rejection...' : 'Add a comment...'}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setActionModal({ open: false, action: null, request: null })}>
                Cancel
              </Button>
              <Button
                onClick={handleLeaveAction}
                disabled={processing}
                className={actionModal.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-destructive hover:bg-destructive/90'}
              >
                {processing ? 'Processing...' : actionModal.action === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
