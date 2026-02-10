'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { RELATIONSHIP_TYPE_LABELS } from '@/types'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Modal } from '@/components/ui/modal'
import { 
  LogOut, 
  Settings, 
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
  XCircle
} from 'lucide-react'
import { PLATFORM_NAME, COMPANY_NAME, LOGO } from '@/lib/config'

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
  
  // Leave approval state
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([])
  const [actionModal, setActionModal] = useState<{ open: boolean; action: 'approve' | 'reject' | null; request: LeaveRequest | null }>({ open: false, action: null, request: null })
  const [comment, setComment] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push('/login')
          return
        }
        setUser(data.user)
        loadDashboard()
        loadPendingLeaves()
      })
      .catch(() => router.push('/login'))
  }, [])

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/evaluations/dashboard?periodId=active')
      const data = await response.json()
      if (data.mappings) {
        setMappings(data.mappings)
        setPeriod(data.period)
      }
    } catch (error) {
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const loadPendingLeaves = async () => {
    try {
      const response = await fetch('/api/leave/requests?forApproval=true')
      const data = await response.json()
      setPendingLeaves(data.requests || [])
    } catch (error) {
      console.error('Failed to load pending leaves:', error)
    }
  }

  const handleLeaveAction = async () => {
    if (!actionModal.request || !actionModal.action) return
    
    setProcessing(true)
    try {
      const res = await fetch('/api/leave/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: actionModal.request.id,
          action: actionModal.action,
          comment: comment || undefined,
        }),
      })
      
      const data = await res.json()
      
      if (data.success) {
        toast.success(actionModal.action === 'approve' ? 'Leave approved' : 'Leave rejected')
        setActionModal({ open: false, action: null, request: null })
        setComment('')
        loadPendingLeaves()
      } else {
        toast.error(data.error || 'Action failed')
      }
    } catch {
      toast.error('Action failed')
    } finally {
      setProcessing(false)
    }
  }

  const getDaysCount = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
          <p className="text-muted text-sm">Loading your evaluations...</p>
        </motion.div>
      </div>
    )
  }

  const relationshipTypes = Object.keys(mappings) as Array<keyof typeof RELATIONSHIP_TYPE_LABELS>
  const totalEvaluations = Object.values(mappings).flat().length
  const completedEvaluations = Object.values(mappings).flat().filter(m => m.isComplete).length
  const progressPercent = totalEvaluations > 0 ? (completedEvaluations / totalEvaluations) * 100 : 0

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <img src={LOGO.company} alt={COMPANY_NAME} className="h-8 w-auto" />
              <div className="h-6 w-px bg-border hidden sm:block" />
              <div className="hidden sm:flex items-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center">
                  <img src={LOGO.platformLight} alt="" aria-hidden="true" className="h-4 w-4 dark:hidden" />
                  <img src={LOGO.platformDark} alt="" aria-hidden="true" className="hidden h-4 w-4 dark:block" />
                </span>
                <span className="text-lg font-semibold text-foreground">{PLATFORM_NAME}</span>
              </div>
            </motion.div>
            
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted hidden sm:block">
                {user?.name}
              </span>
              <Link
                href="/leave"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium transition-colors"
              >
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">Leave</span>
              </Link>
              {user?.role === 'HR' && (
                <Link
                  href="/admin"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              )}
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="p-2 text-muted hover:text-foreground transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Welcome back, {user?.name?.split(' ')[0]}
          </h1>
          {period && (
            <div className="flex items-center gap-2 text-muted">
              <Calendar className="w-4 h-4" />
              <span>{period.name}</span>
              <span className="text-border">•</span>
              <span className="text-sm">
                {new Date(period.startDate).toLocaleDateString()} – {new Date(period.endDate).toLocaleDateString()}
              </span>
            </div>
          )}
        </motion.div>

        {/* Stats Grid */}
        {totalEvaluations > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
          >
            {/* Progress Card */}
            <div className="md:col-span-2 glass rounded-2xl p-6 border border-border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Your Progress</h3>
                    <p className="text-sm text-muted">
                      {completedEvaluations === totalEvaluations 
                        ? 'All evaluations complete!' 
                        : `${totalEvaluations - completedEvaluations} remaining`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold gradient-text">
                    {Math.round(progressPercent)}%
                  </div>
                  <div className="text-xs text-muted">
                    {completedEvaluations}/{totalEvaluations}
                  </div>
                </div>
              </div>
              <div className="h-3 bg-surface rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full gradient-primary rounded-full"
                />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="glass rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Activity</h3>
                  <p className="text-sm text-muted">This period</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Completed</span>
                  <span className="font-medium text-green-600 dark:text-green-400">{completedEvaluations}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Pending</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">{totalEvaluations - completedEvaluations}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Pending Leave Approvals (for Leads) */}
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
              <span className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-500/20 text-amber-600 rounded-full">
                {pendingLeaves.length}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pendingLeaves.map((request) => {
                const typeConfig = LEAVE_TYPE_CONFIG[request.leaveType]
                const TypeIcon = typeConfig.icon
                const days = getDaysCount(request.startDate, request.endDate)
                
                return (
                  <div 
                    key={request.id}
                    className="glass rounded-xl p-4 border border-amber-200 dark:border-amber-500/30"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg ${typeConfig.bg} flex items-center justify-center flex-shrink-0`}>
                        <TypeIcon className={`w-5 h-5 ${typeConfig.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-foreground">{request.employee.name}</h4>
                        <p className="text-sm text-muted">{request.employee.department || 'No dept'}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-sm mb-3">
                      <div className="flex justify-between">
                        <span className="text-muted">Type</span>
                        <span className="font-medium text-foreground">{typeConfig.label}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Duration</span>
                        <span className="font-medium text-foreground">{days} day{days > 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Dates</span>
                        <span className="text-foreground text-xs">
                          {new Date(request.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(request.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted mb-3 line-clamp-2">{request.reason}</p>
                    
                    {/* Approval status */}
                    <div className="flex gap-2 text-xs mb-3">
                      <span className={request.hrApprovedBy ? 'text-emerald-600' : 'text-muted'}>
                        {request.hrApprovedBy ? '✓ HR' : '○ HR'}
                      </span>
                      <span className={request.leadApprovedBy ? 'text-emerald-600' : 'text-muted'}>
                        {request.leadApprovedBy ? '✓ Lead' : '○ Lead'}
                      </span>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => setActionModal({ open: true, action: 'approve', request })}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => setActionModal({ open: true, action: 'reject', request })}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Evaluations */}
        {relationshipTypes.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-12 border border-border text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-surface mx-auto mb-4 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-muted" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No evaluations assigned</h3>
            <p className="text-muted">You'll see your evaluation tasks here when they're assigned.</p>
          </motion.div>
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
                  <span className="text-sm font-normal text-muted">({mappings[type].length})</span>
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
                        <Link
                          href={`/evaluate/${mapping.evaluatee.id}`}
                          className="block glass rounded-xl p-5 border border-border hover:border-indigo-500/30 transition-all duration-300 group"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium text-sm">
                                {mapping.evaluatee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                  {mapping.evaluatee.name}
                                </h4>
                                {mapping.evaluatee.department && (
                                  <p className="text-sm text-muted">{mapping.evaluatee.department}</p>
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
                              <span className="text-muted">Progress</span>
                              <span className="font-medium text-foreground">
                                {mapping.completedCount}/{mapping.questionsCount}
                              </span>
                            </div>
                            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  mapping.isComplete ? 'bg-green-500' : 'gradient-primary'
                                }`}
                                style={{ width: `${(mapping.completedCount / mapping.questionsCount) * 100}%` }}
                              />
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between text-sm">
                            <span className={`px-2 py-1 rounded-md ${
                              mapping.isComplete 
                                ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}>
                              {mapping.isComplete ? 'Complete' : 'In Progress'}
                            </span>
                            <ArrowRight className="w-4 h-4 text-muted group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Footer signature */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-16 flex items-center justify-center gap-2 text-xs text-muted/50"
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
            <div className="p-3 bg-surface rounded-lg">
              <p className="font-medium text-foreground">{actionModal.request.employee.name}</p>
              <p className="text-sm text-muted">
                {LEAVE_TYPE_CONFIG[actionModal.request.leaveType].label} Leave • 
                {getDaysCount(actionModal.request.startDate, actionModal.request.endDate)} days
              </p>
              <p className="text-sm text-muted mt-1">
                {new Date(actionModal.request.startDate).toLocaleDateString()} - {new Date(actionModal.request.endDate).toLocaleDateString()}
              </p>
            </div>
            
            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">Transition Plan:</p>
              <p className="text-sm text-amber-800 dark:text-amber-300">{actionModal.request.transitionPlan}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Comment {actionModal.action === 'reject' ? '(recommended)' : '(optional)'}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder={actionModal.action === 'reject' ? 'Please provide a reason for rejection...' : 'Add a comment...'}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setActionModal({ open: false, action: null, request: null })}
                className="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveAction}
                disabled={processing}
                className={`px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${
                  actionModal.action === 'approve' 
                    ? 'bg-emerald-600 hover:bg-emerald-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {processing ? 'Processing...' : actionModal.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
