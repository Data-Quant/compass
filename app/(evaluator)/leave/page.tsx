'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Palmtree,
  Plus,
  Sun,
  Thermometer,
  Users,
  X,
} from 'lucide-react'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatsCard } from '@/components/composed/StatsCard'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Textarea } from '@/components/ui/textarea'

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
  const layoutUser = useLayoutUser()
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
    if (layoutUser) setUser(layoutUser)
    loadData()
  }, [layoutUser])

  useEffect(() => {
    if (user) {
      loadCalendarEvents()
    }
  }, [currentMonth, currentYear, user])

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
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-semibold text-foreground">Leave Management</h1>
            <p className="text-muted-foreground">Select dates on the calendar to apply for leave</p>
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
                <motion.div key={type} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <StatsCard
                    title={config.label}
                    value={remaining}
                    suffix={`/ ${total} days`}
                    icon={<Icon className={`w-4 h-4 ${config.color}`} />}
                    className={`${config.bgLight} border-border`}
                  />
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
              className="glass rounded-card border border-border overflow-hidden"
            >
              <Card>
                <CardContent className="p-0">
                  {/* Calendar Header */}
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (currentMonth === 0) {
                          setCurrentMonth(11)
                          setCurrentYear(currentYear - 1)
                        } else {
                          setCurrentMonth(currentMonth - 1)
                        }
                      }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <h2 className="text-lg font-display font-semibold text-foreground">
                      {MONTHS[currentMonth]} {currentYear}
                    </h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (currentMonth === 11) {
                          setCurrentMonth(0)
                          setCurrentYear(currentYear + 1)
                        } else {
                          setCurrentMonth(currentMonth + 1)
                        }
                      }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </div>

                  {/* Selection indicator */}
                  {selectingEnd && (
                    <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 border-b border-border flex items-center justify-between">
                      <span className="text-sm text-indigo-600 dark:text-indigo-400">
                        Select end date for your leave
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-indigo-600 hover:text-indigo-700"
                        onClick={clearSelection}
                      >
                        <X className="w-3 h-3 mr-1" /> Cancel
                      </Button>
                    </div>
                  )}

                  {/* Calendar Grid */}
                  <div className="p-4">
                    {/* Day headers */}
                    <div className="grid grid-cols-7 mb-2">
                      {DAYS.map(day => (
                        <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
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
                          <Button
                            key={index}
                            variant="ghost"
                            className={`
                              relative p-1 min-h-[70px] rounded-lg text-left h-auto font-normal justify-start transition-all
                              ${!isCurrentMonth ? 'opacity-30' : ''}
                              ${isPast ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}
                              ${isSelected ? 'bg-indigo-100 dark:bg-indigo-500/20 ring-2 ring-indigo-500' : ''}
                              ${isToday && !isSelected ? 'bg-muted ring-1 ring-indigo-300' : ''}
                            `}
                            onClick={() => !isPast && isCurrentMonth && handleDateClick(date)}
                            disabled={isPast || !isCurrentMonth}
                          >
                            <span
                              className={`
                                text-sm font-medium
                                ${isWeekend ? 'text-muted-foreground' : 'text-foreground'}
                                ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : ''}
                                ${isToday ? 'text-indigo-600' : ''}
                              `}
                            >
                              {date.getDate()}
                            </span>

                            {/* Event indicators */}
                            {events.length > 0 && (
                              <div className="mt-1 space-y-0.5 w-full">
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
                                  <div className="text-[10px] text-muted-foreground px-1">
                                    +{events.length - 2} more
                                  </div>
                                )}
                              </div>
                            )}
                          </Button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="px-4 py-3 border-t border-border bg-muted/50">
                    <div className="flex flex-wrap gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-amber-500" />
                        <span className="text-muted-foreground">Casual</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-red-500" />
                        <span className="text-muted-foreground">Sick</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-emerald-500" />
                        <span className="text-muted-foreground">Annual</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-gray-300 dark:bg-gray-600" />
                        <span className="text-muted-foreground">Team member</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Sidebar - My Requests */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-card border border-border overflow-hidden"
            >
              <Card>
                <CardContent className="p-0">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-display font-semibold text-foreground">My Leave Requests</h3>
                    <Button
                      variant="default"
                      size="icon"
                      onClick={() => setIsModalOpen(true)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto">
                    {requests.length === 0 ? (
                      <div className="p-6 text-center">
                        <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No requests yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Click on calendar dates to apply</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {requests.map((request) => {
                          const typeConfig = LEAVE_TYPE_CONFIG[request.leaveType]
                          const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.PENDING
                          const TypeIcon = typeConfig.icon
                          const days = getDaysCount(request.startDate, request.endDate)

                          return (
                            <div key={request.id} className="p-3 hover:bg-muted/50 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className={`w-8 h-8 rounded-lg ${typeConfig.bgLight} flex items-center justify-center flex-shrink-0`}>
                                  <TypeIcon className={`w-4 h-4 ${typeConfig.color}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-sm font-medium text-foreground">{typeConfig.label}</span>
                                    <Badge variant="secondary" className={`${statusConfig.bg} ${statusConfig.color} border-0`}>
                                      {statusConfig.label}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(request.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {' - '}
                                    {new Date(request.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {' • '}{days}d
                                  </p>

                                  {(request.status === 'PENDING' || request.status === 'LEAD_APPROVED' || request.status === 'HR_APPROVED') && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-[10px] text-red-600 hover:text-red-700 h-auto p-0 mt-1"
                                      onClick={() => handleCancel(request.id)}
                                    >
                                      Cancel request
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
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
                className="glass rounded-card border border-border overflow-hidden mt-4"
              >
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b border-border">
                      <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
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
                          <span className="text-muted-foreground text-xs">({LEAVE_TYPE_CONFIG[event.leaveType].label})</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      {/* Apply Leave Modal */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); clearSelection(); }} title="Apply for Leave" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Leave Type */}
          <div>
            <Label className="mb-2">Leave Type</Label>
            <div className="grid grid-cols-3 gap-3">
              {(['CASUAL', 'SICK', 'ANNUAL'] as const).map((type) => {
                const config = LEAVE_TYPE_CONFIG[type]
                const Icon = config.icon
                const remaining = balance?.remaining[type.toLowerCase() as 'casual' | 'sick' | 'annual'] || 0

                return (
                  <Button
                    key={type}
                    type="button"
                    variant="outline"
                    className={`h-auto flex flex-col gap-1 p-3 ${
                      formData.leaveType === type
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                        : ''
                    }`}
                    onClick={() => setFormData({ ...formData, leaveType: type })}
                  >
                    <Icon className={`w-5 h-5 ${config.color} mx-auto`} />
                    <span className="text-sm font-medium text-foreground">{config.label}</span>
                    <span className="text-xs text-muted-foreground">{remaining} days left</span>
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate" className="mb-2">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="endDate" className="mb-2">End Date</Label>
              <Input
                id="endDate"
                type="date"
                required
                value={formData.endDate}
                min={formData.startDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <Label htmlFor="reason" className="mb-2">Reason</Label>
            <Textarea
              id="reason"
              required
              rows={2}
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Brief description of why you need this leave..."
            />
          </div>

          {/* Transition Plan */}
          <div>
            <Label htmlFor="transitionPlan" className="mb-2">
              Transition Plan
              <span className="text-muted-foreground font-normal ml-1">(required)</span>
            </Label>
            <Textarea
              id="transitionPlan"
              required
              rows={3}
              value={formData.transitionPlan}
              onChange={(e) => setFormData({ ...formData, transitionPlan: e.target.value })}
              placeholder="List your current tasks and how they will be handled during your absence..."
            />
          </div>

          {/* Cover Person */}
          <div>
            <Label htmlFor="coverPerson" className="mb-2">
              Cover Person
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Select value={formData.coverPersonId || '__none__'} onValueChange={(v) => setFormData({ ...formData, coverPersonId: v === '__none__' ? '' : v })}>
              <SelectTrigger id="coverPerson">
                <SelectValue placeholder="Select who will cover your tasks..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No cover person</SelectItem>
                {users.filter(u => u.id !== user?.id).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} {u.department ? `(${u.department})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Additional notify (email only, not approval) */}
          <div>
            <Label className="mb-2">
              Notify additional team members
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              These people will receive an email notification. Approval still goes to your lead and HR only.
            </p>
            <div className="max-h-32 overflow-y-auto border border-input rounded-md p-2 bg-muted space-y-1.5">
              {users.filter(u => u.id !== user?.id).map((u) => (
                <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/80 rounded px-2 py-1.5">
                  <Checkbox
                    checked={formData.additionalNotifyIds.includes(u.id)}
                    onCheckedChange={(checked) => {
                      const ids = checked === true
                        ? [...formData.additionalNotifyIds, u.id]
                        : formData.additionalNotifyIds.filter(id => id !== u.id)
                      setFormData({ ...formData, additionalNotifyIds: ids })
                    }}
                  />
                  <span className="text-sm text-foreground">{u.name}</span>
                  {u.department && <span className="text-xs text-muted-foreground">({u.department})</span>}
                </label>
              ))}
              {users.filter(u => u.id !== user?.id).length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No other team members</p>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setIsModalOpen(false); clearSelection(); }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
