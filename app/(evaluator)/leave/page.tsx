'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Modal } from '@/components/ui/modal'
import { 
  LogOut, 
  Calendar,
  Plus,
  ArrowLeft,
  Sun,
  Thermometer,
  Palmtree,
  ChevronLeft,
  ChevronRight,
  Users,
  X
} from 'lucide-react'
import { PLATFORM_NAME, COMPANY_NAME, LOGO } from '@/lib/config'

interface LeaveBalance {
  casualDays: number
  sickDays: number
  annualDays: number
  casualUsed: number
  sickUsed: number
  annualUsed: number
  remaining: {
    casual: number
    sick: number
    annual: number
  }
}

interface LeaveRequest {
  id: string
  leaveType: 'CASUAL' | 'SICK' | 'ANNUAL'
  startDate: string
  endDate: string
  reason: string
  transitionPlan: string
  status: string
  coverPerson?: { id: string; name: string }
  leadApprovedBy?: string
  hrApprovedBy?: string
  rejectionReason?: string
  createdAt: string
}

interface CalendarEvent {
  id: string
  employeeId: string
  employeeName: string
  department: string | null
  leaveType: 'CASUAL' | 'SICK' | 'ANNUAL'
  startDate: string
  endDate: string
  status: string
  isCurrentUser: boolean
}

interface User {
  id: string
  name: string
  department?: string
}

const LEAVE_TYPE_CONFIG = {
  CASUAL: { icon: Sun, color: 'text-amber-500', bg: 'bg-amber-500', bgLight: 'bg-amber-100 dark:bg-amber-500/20', label: 'Casual' },
  SICK: { icon: Thermometer, color: 'text-red-500', bg: 'bg-red-500', bgLight: 'bg-red-100 dark:bg-red-500/20', label: 'Sick' },
  ANNUAL: { icon: Palmtree, color: 'text-emerald-500', bg: 'bg-emerald-500', bgLight: 'bg-emerald-100 dark:bg-emerald-500/20', label: 'Annual' },
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  PENDING: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-500/20', label: 'Pending' },
  LEAD_APPROVED: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-500/20', label: 'Lead Approved' },
  HR_APPROVED: { color: 'text-indigo-600', bg: 'bg-indigo-100 dark:bg-indigo-500/20', label: 'HR Approved' },
  APPROVED: { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-500/20', label: 'Approved' },
  REJECTED: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-500/20', label: 'Rejected' },
  CANCELLED: { color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-500/20', label: 'Cancelled' },
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function LeavePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedRange, setSelectedRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null })
  const [selectingEnd, setSelectingEnd] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    leaveType: 'CASUAL',
    startDate: '',
    endDate: '',
    reason: '',
    transitionPlan: '',
    coverPersonId: '',
    additionalNotifyIds: [] as string[],
  })

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (user) {
      loadCalendarEvents()
    }
  }, [currentMonth, currentYear, user])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (!data.user) {
        router.push('/login')
        return
      }
      setUser(data.user)
      loadData()
    } catch {
      router.push('/login')
    }
  }

  const loadData = async () => {
    try {
      const [balanceRes, requestsRes, usersRes] = await Promise.all([
        fetch('/api/leave/balance'),
        fetch('/api/leave/requests?employeeId=me'),
        fetch('/api/auth/login'),
      ])
      
      const balanceData = await balanceRes.json()
      const requestsData = await requestsRes.json()
      const usersData = await usersRes.json()
      
      setBalance(balanceData.balance)
      setRequests(requestsData.requests || [])
      setUsers(usersData.users || [])
    } catch (error) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const loadCalendarEvents = async () => {
    try {
      const res = await fetch(`/api/leave/calendar?month=${currentMonth}&year=${currentYear}`)
      const data = await res.json()
      setCalendarEvents(data.events || [])
    } catch (error) {
      console.error('Failed to load calendar:', error)
    }
  }

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1)
    const lastDay = new Date(currentYear, currentMonth + 1, 0)
    const startPadding = firstDay.getDay()
    const totalDays = lastDay.getDate()
    
    const days: { date: Date; isCurrentMonth: boolean }[] = []
    
    // Previous month padding
    for (let i = startPadding - 1; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth, -i)
      days.push({ date, isCurrentMonth: false })
    }
    
    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const date = new Date(currentYear, currentMonth, i)
      days.push({ date, isCurrentMonth: true })
    }
    
    // Next month padding
    const remaining = 42 - days.length // 6 rows * 7 days
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(currentYear, currentMonth + 1, i)
      days.push({ date, isCurrentMonth: false })
    }
    
    return days
  }, [currentMonth, currentYear])

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    const dateStr = date.toDateString()
    return calendarEvents.filter(event => {
      const start = new Date(event.startDate)
      const end = new Date(event.endDate)
      return date >= new Date(start.toDateString()) && date <= new Date(end.toDateString())
    })
  }

  const handleDateClick = (date: Date) => {
    if (!selectingEnd) {
      // Start new selection
      setSelectedRange({ start: date, end: null })
      setSelectingEnd(true)
      setFormData({
        ...formData,
        startDate: date.toISOString().split('T')[0],
        endDate: '',
      })
    } else {
      // Complete selection
      if (selectedRange.start && date >= selectedRange.start) {
        setSelectedRange({ ...selectedRange, end: date })
        setFormData({
          ...formData,
          endDate: date.toISOString().split('T')[0],
        })
        setSelectingEnd(false)
        setIsModalOpen(true)
      } else {
        // Reset if end is before start
        setSelectedRange({ start: date, end: null })
        setFormData({
          ...formData,
          startDate: date.toISOString().split('T')[0],
          endDate: '',
        })
      }
    }
  }

  const isInSelectedRange = (date: Date) => {
    if (!selectedRange.start) return false
    if (!selectedRange.end) return date.toDateString() === selectedRange.start.toDateString()
    return date >= selectedRange.start && date <= selectedRange.end
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    
    try {
      const res = await fetch('/api/leave/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          additionalNotifyIds: formData.additionalNotifyIds,
        }),
      })
      
      const data = await res.json()
      
      if (data.success) {
        toast.success('Leave request submitted!')
        setIsModalOpen(false)
        setSelectedRange({ start: null, end: null })
        setFormData({
          leaveType: 'CASUAL',
          startDate: '',
          endDate: '',
          reason: '',
          transitionPlan: '',
          coverPersonId: '',
          additionalNotifyIds: [],
        })
        loadData()
        loadCalendarEvents()
      } else {
        toast.error(data.error || 'Failed to submit request')
      }
    } catch {
      toast.error('Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async (requestId: string) => {
    if (!confirm('Are you sure you want to cancel this request?')) return
    
    try {
      const res = await fetch(`/api/leave/requests?id=${requestId}`, {
        method: 'DELETE',
      })
      
      const data = await res.json()
      
      if (data.success) {
        toast.success('Request cancelled')
        loadData()
        loadCalendarEvents()
      } else {
        toast.error(data.error || 'Failed to cancel')
      }
    } catch {
      toast.error('Failed to cancel')
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const getDaysCount = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  const clearSelection = () => {
    setSelectedRange({ start: null, end: null })
    setSelectingEnd(false)
    setFormData({
      ...formData,
      startDate: '',
      endDate: '',
    })
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
          <p className="text-muted text-sm">Loading...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="p-2 hover:bg-surface rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-muted" />
              </button>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center">
                  <img src={LOGO.company} alt={COMPANY_NAME} className="h-8 w-8 dark:hidden" />
                  <img src={LOGO.companyDark} alt={COMPANY_NAME} className="hidden h-8 w-8 dark:block" />
                </span>
                <div className="hidden sm:flex items-center">
                  <span className="font-semibold text-foreground">{PLATFORM_NAME}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-surface rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5 text-muted" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Leave Management</h1>
            <p className="text-muted">Select dates on the calendar to apply for leave</p>
          </div>
        </div>

        {/* Leave Balance Cards */}
        {balance && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {(['CASUAL', 'SICK', 'ANNUAL'] as const).map((type) => {
              const config = LEAVE_TYPE_CONFIG[type]
              const Icon = config.icon
              const remaining = balance.remaining[type.toLowerCase() as 'casual' | 'sick' | 'annual']
              const total = balance[`${type.toLowerCase()}Days` as 'casualDays' | 'sickDays' | 'annualDays']
              
              return (
                <motion.div
                  key={type}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`${config.bgLight} rounded-xl p-4 border border-border`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="text-sm font-medium text-foreground">{config.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-bold ${config.color}`}>{remaining}</span>
                    <span className="text-sm text-muted">/ {total} days</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-xl border border-border overflow-hidden"
            >
              {/* Calendar Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <button
                  onClick={() => {
                    if (currentMonth === 0) {
                      setCurrentMonth(11)
                      setCurrentYear(currentYear - 1)
                    } else {
                      setCurrentMonth(currentMonth - 1)
                    }
                  }}
                  className="p-2 hover:bg-surface rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-semibold text-foreground">
                  {MONTHS[currentMonth]} {currentYear}
                </h2>
                <button
                  onClick={() => {
                    if (currentMonth === 11) {
                      setCurrentMonth(0)
                      setCurrentYear(currentYear + 1)
                    } else {
                      setCurrentMonth(currentMonth + 1)
                    }
                  }}
                  className="p-2 hover:bg-surface rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Selection indicator */}
              {selectingEnd && (
                <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 border-b border-border flex items-center justify-between">
                  <span className="text-sm text-indigo-600 dark:text-indigo-400">
                    Select end date for your leave
                  </span>
                  <button 
                    onClick={clearSelection}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              )}

              {/* Calendar Grid */}
              <div className="p-4">
                {/* Day headers */}
                <div className="grid grid-cols-7 mb-2">
                  {DAYS.map(day => (
                    <div key={day} className="text-center text-xs font-medium text-muted py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar days */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map(({ date, isCurrentMonth }, index) => {
                    const events = getEventsForDate(date)
                    const isToday = date.toDateString() === new Date().toDateString()
                    const isSelected = isInSelectedRange(date)
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6
                    const isPast = date < new Date(new Date().setHours(0, 0, 0, 0))
                    
                    return (
                      <button
                        key={index}
                        onClick={() => !isPast && isCurrentMonth && handleDateClick(date)}
                        disabled={isPast || !isCurrentMonth}
                        className={`
                          relative p-1 min-h-[70px] rounded-lg text-left transition-all
                          ${!isCurrentMonth ? 'opacity-30' : ''}
                          ${isPast ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface cursor-pointer'}
                          ${isSelected ? 'bg-indigo-100 dark:bg-indigo-500/20 ring-2 ring-indigo-500' : ''}
                          ${isToday && !isSelected ? 'bg-surface ring-1 ring-indigo-300' : ''}
                        `}
                      >
                        <span className={`
                          text-sm font-medium
                          ${isWeekend ? 'text-muted' : 'text-foreground'}
                          ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : ''}
                          ${isToday ? 'text-indigo-600' : ''}
                        `}>
                          {date.getDate()}
                        </span>
                        
                        {/* Event indicators */}
                        {events.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {events.slice(0, 2).map((event, i) => (
                              <div
                                key={i}
                                className={`
                                  text-[10px] px-1 py-0.5 rounded truncate
                                  ${event.isCurrentUser 
                                    ? LEAVE_TYPE_CONFIG[event.leaveType].bg + ' text-white' 
                                    : 'bg-gray-200 dark:bg-gray-700 text-foreground'
                                  }
                                  ${event.status === 'PENDING' || event.status === 'LEAD_APPROVED' || event.status === 'HR_APPROVED' 
                                    ? 'opacity-60' 
                                    : ''
                                  }
                                `}
                                title={`${event.employeeName} - ${LEAVE_TYPE_CONFIG[event.leaveType].label}`}
                              >
                                {event.isCurrentUser ? 'You' : event.employeeName.split(' ')[0]}
                              </div>
                            ))}
                            {events.length > 2 && (
                              <div className="text-[10px] text-muted px-1">
                                +{events.length - 2} more
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Legend */}
              <div className="px-4 py-3 border-t border-border bg-surface/50">
                <div className="flex flex-wrap gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-amber-500" />
                    <span className="text-muted">Casual</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-red-500" />
                    <span className="text-muted">Sick</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-emerald-500" />
                    <span className="text-muted">Annual</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-gray-300 dark:bg-gray-600" />
                    <span className="text-muted">Team member</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Sidebar - My Requests */}
          <div>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-xl border border-border overflow-hidden"
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-foreground">My Leave Requests</h3>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <div className="max-h-[500px] overflow-y-auto">
                {requests.length === 0 ? (
                  <div className="p-6 text-center">
                    <Calendar className="w-10 h-10 text-muted/30 mx-auto mb-2" />
                    <p className="text-sm text-muted">No requests yet</p>
                    <p className="text-xs text-muted mt-1">Click on calendar dates to apply</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {requests.map((request) => {
                      const typeConfig = LEAVE_TYPE_CONFIG[request.leaveType]
                      const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.PENDING
                      const TypeIcon = typeConfig.icon
                      const days = getDaysCount(request.startDate, request.endDate)
                      
                      return (
                        <div key={request.id} className="p-3 hover:bg-surface/50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-lg ${typeConfig.bgLight} flex items-center justify-center flex-shrink-0`}>
                              <TypeIcon className={`w-4 h-4 ${typeConfig.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-medium text-foreground">{typeConfig.label}</span>
                                <span className={`px-1.5 py-0.5 text-[10px] rounded ${statusConfig.bg} ${statusConfig.color}`}>
                                  {statusConfig.label}
                                </span>
                              </div>
                              <p className="text-xs text-muted">
                                {new Date(request.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {' - '}
                                {new Date(request.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {' • '}{days}d
                              </p>
                              
                              {(request.status === 'PENDING' || request.status === 'LEAD_APPROVED' || request.status === 'HR_APPROVED') && (
                                <button
                                  onClick={() => handleCancel(request.id)}
                                  className="text-[10px] text-red-600 hover:underline mt-1"
                                >
                                  Cancel request
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Team on Leave Today */}
            {calendarEvents.filter(e => {
              const today = new Date()
              const start = new Date(e.startDate)
              const end = new Date(e.endDate)
              return today >= new Date(start.toDateString()) && today <= new Date(end.toDateString()) && !e.isCurrentUser && e.status === 'APPROVED'
            }).length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass rounded-xl border border-border overflow-hidden mt-4"
              >
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Out Today
                  </h3>
                </div>
                <div className="p-3 space-y-2">
                  {calendarEvents.filter(e => {
                    const today = new Date()
                    const start = new Date(e.startDate)
                    const end = new Date(e.endDate)
                    return today >= new Date(start.toDateString()) && today <= new Date(end.toDateString()) && !e.isCurrentUser && e.status === 'APPROVED'
                  }).map(event => (
                    <div key={event.id} className="flex items-center gap-2 text-sm">
                      <div className={`w-2 h-2 rounded-full ${LEAVE_TYPE_CONFIG[event.leaveType].bg}`} />
                      <span className="text-foreground">{event.employeeName}</span>
                      <span className="text-muted text-xs">({LEAVE_TYPE_CONFIG[event.leaveType].label})</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </main>

      {/* Apply Leave Modal */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); clearSelection(); }} title="Apply for Leave" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Leave Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Leave Type</label>
            <div className="grid grid-cols-3 gap-3">
              {(['CASUAL', 'SICK', 'ANNUAL'] as const).map((type) => {
                const config = LEAVE_TYPE_CONFIG[type]
                const Icon = config.icon
                const remaining = balance?.remaining[type.toLowerCase() as 'casual' | 'sick' | 'annual'] || 0
                
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, leaveType: type })}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      formData.leaveType === type 
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' 
                        : 'border-border hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${config.color} mx-auto mb-1`} />
                    <div className="text-sm font-medium text-foreground">{config.label}</div>
                    <div className="text-xs text-muted">{remaining} days left</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Start Date</label>
              <input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">End Date</label>
              <input
                type="date"
                required
                value={formData.endDate}
                min={formData.startDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Reason</label>
            <textarea
              required
              rows={2}
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Brief description of why you need this leave..."
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Transition Plan */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Transition Plan
              <span className="text-muted font-normal ml-1">(required)</span>
            </label>
            <textarea
              required
              rows={3}
              value={formData.transitionPlan}
              onChange={(e) => setFormData({ ...formData, transitionPlan: e.target.value })}
              placeholder="List your current tasks and how they will be handled during your absence..."
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Cover Person */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Cover Person
              <span className="text-muted font-normal ml-1">(optional)</span>
            </label>
            <select
              value={formData.coverPersonId}
              onChange={(e) => setFormData({ ...formData, coverPersonId: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select who will cover your tasks...</option>
              {users.filter(u => u.id !== user?.id).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.department ? `(${u.department})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Additional notify (email only, not approval) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Notify additional team members
              <span className="text-muted font-normal ml-1">(optional)</span>
            </label>
            <p className="text-xs text-muted mb-2">
              These people will receive an email notification. Approval still goes to your lead and HR only.
            </p>
            <div className="max-h-32 overflow-y-auto border border-border rounded-lg p-2 bg-surface space-y-1.5">
              {users.filter(u => u.id !== user?.id).map((u) => (
                <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-surface-hover rounded px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={formData.additionalNotifyIds.includes(u.id)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...formData.additionalNotifyIds, u.id]
                        : formData.additionalNotifyIds.filter(id => id !== u.id)
                      setFormData({ ...formData, additionalNotifyIds: ids })
                    }}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-foreground">{u.name}</span>
                  {u.department && <span className="text-xs text-muted">({u.department})</span>}
                </label>
              ))}
              {users.filter(u => u.id !== user?.id).length === 0 && (
                <p className="text-xs text-muted py-2">No other team members</p>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setIsModalOpen(false); clearSelection(); }}
              className="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
