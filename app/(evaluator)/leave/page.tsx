'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Palmtree,
  Plus,
  Sun,
  Thermometer,
  TriangleAlert,
  Users,
  X,
  XCircle,
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
import { calculateLeaveDays } from '@/lib/leave-utils'

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
  additionalNotifyIds?: string[]
  leadApprovedBy?: string
  hrApprovedBy?: string
  rejectionReason?: string
  createdAt: string
}

interface ApprovalRequest extends LeaveRequest {
  employee: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
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
  const [approvalQueue, setApprovalQueue] = useState<ApprovalRequest[]>([])
  const [approvalProcessingId, setApprovalProcessingId] = useState<string | null>(null)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDayEventsModalOpen, setIsDayEventsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null)
  const [selectedDayEvents, setSelectedDayEvents] = useState<CalendarEvent[]>([])
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL')
  const [reminderNoticeShown, setReminderNoticeShown] = useState(false)

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

  const [editFormData, setEditFormData] = useState({
    id: '',
    leaveType: 'CASUAL' as 'CASUAL' | 'SICK' | 'ANNUAL',
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
      const [balanceRes, requestsRes, usersRes, approvalsRes] = await Promise.all([
        fetch('/api/leave/balance'),
        fetch('/api/leave/requests?employeeId=me'),
        fetch('/api/auth/login'),
        fetch('/api/leave/requests?forApproval=true'),
      ])

      const balanceData = await balanceRes.json()
      const requestsData = await requestsRes.json()
      const usersData = await usersRes.json()
      const approvalsData = await approvalsRes.json()

      setBalance(balanceData.balance)
      setRequests(requestsData.requests || [])
      setUsers(usersData.users || [])
      setApprovalQueue(approvalsData.requests || [])
    } catch (error) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleApprovalDecision = async (requestId: string, action: 'approve' | 'reject') => {
    setApprovalProcessingId(requestId)
    try {
      const res = await fetch('/api/leave/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to process request')
      }

      toast.success(action === 'approve' ? 'Leave approved' : 'Leave rejected')
      await Promise.all([loadData(), loadCalendarEvents()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to process request')
    } finally {
      setApprovalProcessingId(null)
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

  const editableStatuses = new Set(['PENDING', 'LEAD_APPROVED', 'HR_APPROVED'])

  const calendarDepartments = useMemo(() => {
    const values = new Set<string>()
    for (const event of calendarEvents) {
      if (event.department) values.add(event.department)
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [calendarEvents])

  const filteredCalendarEvents = useMemo(() => {
    if (departmentFilter === 'ALL') return calendarEvents
    return calendarEvents.filter((event) => event.isCurrentUser || event.department === departmentFilter)
  }, [calendarEvents, departmentFilter])

  const transitionPlanReminderRequests = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    return requests.filter((request) => {
      if (!editableStatuses.has(request.status) && request.status !== 'APPROVED') return false
      if (request.transitionPlan?.trim()) return false
      const start = new Date(request.startDate)
      start.setHours(0, 0, 0, 0)
      const dayDiff = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return dayDiff >= 0 && dayDiff <= 3
    })
  }, [requests])

  useEffect(() => {
    if (transitionPlanReminderRequests.length > 0 && !reminderNoticeShown) {
      toast.warning('Add transition plan for upcoming leave(s) before time off starts.')
      setReminderNoticeShown(true)
    }
  }, [transitionPlanReminderRequests, reminderNoticeShown])

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

  // Get events for a specific date (timezone-safe: compare calendar dates only)
  const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const getEventsForDate = (date: Date) => {
    const ymd = toYMD(date)
    return filteredCalendarEvents.filter(event => {
      const start = new Date(event.startDate)
      const end = new Date(event.endDate)
      const startYmd = toYMD(start)
      const endYmd = toYMD(end)
      return ymd >= startYmd && ymd <= endYmd
    })
  }

  const getReturnDateLabel = (endDate: string) => {
    const value = new Date(endDate)
    value.setDate(value.getDate() + 1)
    return value.toLocaleDateString()
  }

  const openDayEventsModal = (date: Date, events: CalendarEvent[]) => {
    const sortedEvents = [...events].sort((a, b) => {
      if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1
      return a.employeeName.localeCompare(b.employeeName)
    })
    setSelectedDayDate(new Date(date))
    setSelectedDayEvents(sortedEvents)
    setIsDayEventsModalOpen(true)
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
      const payload = {
        leaveType: formData.leaveType,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason,
        transitionPlan: formData.transitionPlan || undefined,
        coverPersonId: formData.coverPersonId || undefined,
        additionalNotifyIds: formData.additionalNotifyIds,
      }

      const res = await fetch('/api/leave/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  const openRequestDetails = (request: LeaveRequest) => {
    setSelectedRequest(request)
    setIsDetailsModalOpen(true)
  }

  const openEditModal = (request: LeaveRequest) => {
    setSelectedRequest(request)
    setEditFormData({
      id: request.id,
      leaveType: request.leaveType,
      startDate: request.startDate.split('T')[0],
      endDate: request.endDate.split('T')[0],
      reason: request.reason || '',
      transitionPlan: request.transitionPlan || '',
      coverPersonId: request.coverPerson?.id || '',
      additionalNotifyIds: Array.isArray(request.additionalNotifyIds) ? request.additionalNotifyIds : [],
    })
    setIsEditModalOpen(true)
  }

  const handleUpdateRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setUpdating(true)

    try {
      const res = await fetch('/api/leave/requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editFormData.id,
          leaveType: editFormData.leaveType,
          startDate: editFormData.startDate,
          endDate: editFormData.endDate,
          reason: editFormData.reason,
          transitionPlan: editFormData.transitionPlan || undefined,
          coverPersonId: editFormData.coverPersonId || undefined,
          additionalNotifyIds: editFormData.additionalNotifyIds,
        }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Leave request updated')
        setIsEditModalOpen(false)
        setSelectedRequest(null)
        loadData()
        loadCalendarEvents()
      } else {
        toast.error(data.error || 'Failed to update leave request')
      }
    } catch {
      toast.error('Failed to update leave request')
    } finally {
      setUpdating(false)
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
    return calculateLeaveDays(startDate, endDate)
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
            <p className="text-muted-foreground">
              Pick your start date and end date (last day off). Return date is the next day.
            </p>
          </div>
        </div>

        {transitionPlanReminderRequests.length > 0 && (
          <Card className="mb-6 border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <TriangleAlert className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-900 dark:text-amber-300">
                    Transition plan reminder
                  </p>
                  <p className="text-sm text-amber-800/90 dark:text-amber-200 mt-1">
                    {transitionPlanReminderRequests.length} upcoming leave request(s) are missing a transition plan.
                    Please add it before your leave starts.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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

                  <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Department filter</Label>
                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="All departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All departments</SelectItem>
                        {calendarDepartments.map((department) => (
                          <SelectItem key={department} value={department}>
                            {department}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Selection indicator */}
                  {selectingEnd && (
                    <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 border-b border-border flex items-center justify-between">
                      <span className="text-sm text-indigo-600 dark:text-indigo-400">
                        Select end date (last day off). You return the next day.
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
                        const canApplyOnDate = !isPast && isCurrentMonth

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
                            onClick={() => {
                              if (canApplyOnDate) {
                                handleDateClick(date)
                              }
                            }}
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
                                  <div
                                    className="text-[10px] text-muted-foreground px-1 underline-offset-2 hover:underline cursor-pointer"
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      openDayEventsModal(date, events)
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        openDayEventsModal(date, events)
                                      }
                                    }}
                                  >
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
                          const canEdit = editableStatuses.has(request.status)

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
                                  <p className="text-[11px] text-muted-foreground">
                                    Return date: {getReturnDateLabel(request.endDate)}
                                  </p>

                                  <div className="flex gap-3 mt-1 flex-wrap">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-[10px] h-auto p-0 text-primary hover:text-primary/80"
                                      onClick={() => openRequestDetails(request)}
                                    >
                                      <Eye className="w-3 h-3 mr-1" />
                                      View details
                                    </Button>

                                    {canEdit && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-[10px] h-auto p-0 text-amber-600 hover:text-amber-700"
                                        onClick={() => openEditModal(request)}
                                      >
                                        <Edit3 className="w-3 h-3 mr-1" />
                                        Edit
                                      </Button>
                                    )}

                                    {canEdit && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-[10px] text-red-600 hover:text-red-700 h-auto p-0"
                                        onClick={() => handleCancel(request.id)}
                                      >
                                        Cancel request
                                      </Button>
                                    )}
                                  </div>
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

            {/* Team Approval Queue */}
            {approvalQueue.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass rounded-card border border-border overflow-hidden mt-4"
              >
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b border-border">
                      <h3 className="font-display font-semibold text-foreground">Team Approval Queue</h3>
                      <p className="text-xs text-muted-foreground mt-1">Requests waiting for your lead approval</p>
                    </div>
                    <div className="divide-y divide-border">
                      {approvalQueue.map((request) => {
                        const typeConfig = LEAVE_TYPE_CONFIG[request.leaveType]
                        const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.PENDING
                        const TypeIcon = typeConfig.icon
                        const days = getDaysCount(request.startDate, request.endDate)
                        const processing = approvalProcessingId === request.id

                        return (
                          <div key={request.id} className="p-3">
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-lg ${typeConfig.bgLight} flex items-center justify-center flex-shrink-0`}>
                                <TypeIcon className={`w-4 h-4 ${typeConfig.color}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-sm font-medium text-foreground">{request.employee.name}</span>
                                  <Badge variant="secondary" className={`${statusConfig.bg} ${statusConfig.color} border-0`}>
                                    {statusConfig.label}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {typeConfig.label} • {new Date(request.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {' - '}
                                  {new Date(request.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {' • '}{days}d
                                </p>
                                <p className="text-[11px] text-muted-foreground truncate">{request.reason}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700"
                                    disabled={processing}
                                    onClick={() => handleApprovalDecision(request.id, 'approve')}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 px-2.5 text-xs"
                                    disabled={processing}
                                    onClick={() => handleApprovalDecision(request.id, 'reject')}
                                  >
                                    <XCircle className="w-3.5 h-3.5 mr-1" />
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Team on Leave Today */}
            {filteredCalendarEvents.filter(e => {
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
                      {filteredCalendarEvents.filter(e => {
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
              <Label htmlFor="startDate" className="mb-2">Start Date (first day off)</Label>
              <Input
                id="startDate"
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="endDate" className="mb-2">End Date (last day off)</Label>
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
          {formData.endDate && (
            <p className="text-xs text-muted-foreground -mt-2">
              Expected return date: {getReturnDateLabel(formData.endDate)}
            </p>
          )}

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
              <span className="text-muted-foreground font-normal ml-1">(optional, can be added later)</span>
            </Label>
            <Textarea
              id="transitionPlan"
              rows={3}
              value={formData.transitionPlan}
              onChange={(e) => setFormData({ ...formData, transitionPlan: e.target.value })}
              placeholder="List your current tasks and handover plan (you can fill this later)."
            />
          </div>

          {/* Cover Person */}
          <div>
            <Label htmlFor="coverPerson" className="mb-2">
              Cover Person
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              If selected, the cover person will be notified by email.
            </p>
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

      <Modal
        isOpen={isDayEventsModalOpen}
        onClose={() => {
          setIsDayEventsModalOpen(false)
          setSelectedDayDate(null)
          setSelectedDayEvents([])
        }}
        title={
          selectedDayDate
            ? `Team on leave - ${selectedDayDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}`
            : 'Team on leave'
        }
        size="md"
      >
        <div className="space-y-4">
          {selectedDayEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave events for this date.</p>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {selectedDayEvents.map((event) => {
                const typeConfig = LEAVE_TYPE_CONFIG[event.leaveType]
                const statusConfig = STATUS_CONFIG[event.status] || STATUS_CONFIG.PENDING
                return (
                  <div
                    key={`${event.id}-${event.employeeId}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {event.isCurrentUser ? 'You' : event.employeeName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {typeConfig.label}
                        {event.department ? ` - ${event.department}` : ''}
                      </p>
                    </div>
                    <Badge variant="secondary" className={`${statusConfig.bg} ${statusConfig.color} border-0`}>
                      {statusConfig.label}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsDayEventsModalOpen(false)
                setSelectedDayDate(null)
                setSelectedDayEvents([])
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false)
          setSelectedRequest(null)
        }}
        title="Leave Request Details"
        size="lg"
      >
        {selectedRequest && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Leave Type</Label>
                <p className="text-sm font-medium text-foreground mt-1">
                  {LEAVE_TYPE_CONFIG[selectedRequest.leaveType].label}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <p className="text-sm font-medium text-foreground mt-1">
                  {(STATUS_CONFIG[selectedRequest.status] || STATUS_CONFIG.PENDING).label}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Start Date (first day off)</Label>
                <p className="text-sm font-medium text-foreground mt-1">
                  {new Date(selectedRequest.startDate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">End Date (last day off)</Label>
                <p className="text-sm font-medium text-foreground mt-1">
                  {new Date(selectedRequest.endDate).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">Expected Return Date</Label>
              <p className="text-sm font-medium text-foreground mt-1">
                {getReturnDateLabel(selectedRequest.endDate)}
              </p>
            </div>

            <div>
              <Label className="text-muted-foreground">Reason</Label>
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">
                {selectedRequest.reason || 'No reason provided'}
              </p>
            </div>

            <div>
              <Label className="text-muted-foreground">Transition Plan</Label>
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">
                {selectedRequest.transitionPlan?.trim() || 'Not added yet'}
              </p>
            </div>

            <div>
              <Label className="text-muted-foreground">Cover Person</Label>
              <p className="text-sm text-foreground mt-1">
                {selectedRequest.coverPerson?.name || 'None selected'}
              </p>
            </div>

            {Array.isArray(selectedRequest.additionalNotifyIds) && selectedRequest.additionalNotifyIds.length > 0 && (
              <div>
                <Label className="text-muted-foreground">Additional Notifications</Label>
                <p className="text-sm text-foreground mt-1">
                  {users
                    .filter((u) => selectedRequest.additionalNotifyIds?.includes(u.id))
                    .map((u) => u.name)
                    .join(', ') || 'None'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              {editableStatuses.has(selectedRequest.status) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDetailsModalOpen(false)
                    openEditModal(selectedRequest)
                  }}
                >
                  Edit Request
                </Button>
              )}
              <Button onClick={() => setIsDetailsModalOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedRequest(null)
        }}
        title="Edit Leave Request"
        size="lg"
      >
        <form onSubmit={handleUpdateRequest} className="space-y-4">
          <div>
            <Label className="mb-2">Leave Type</Label>
            <Select
              value={editFormData.leaveType}
              onValueChange={(value: 'CASUAL' | 'SICK' | 'ANNUAL') =>
                setEditFormData((prev) => ({ ...prev, leaveType: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASUAL">Casual</SelectItem>
                <SelectItem value="SICK">Sick</SelectItem>
                <SelectItem value="ANNUAL">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-start-date" className="mb-2">Start Date (first day off)</Label>
              <Input
                id="edit-start-date"
                type="date"
                required
                value={editFormData.startDate}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-end-date" className="mb-2">End Date (last day off)</Label>
              <Input
                id="edit-end-date"
                type="date"
                required
                min={editFormData.startDate}
                value={editFormData.endDate}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          {editFormData.endDate && (
            <p className="text-xs text-muted-foreground -mt-2">
              Expected return date: {getReturnDateLabel(editFormData.endDate)}
            </p>
          )}

          <div>
            <Label htmlFor="edit-reason" className="mb-2">Reason</Label>
            <Textarea
              id="edit-reason"
              required
              rows={2}
              value={editFormData.reason}
              onChange={(e) => setEditFormData((prev) => ({ ...prev, reason: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="edit-transition-plan" className="mb-2">
              Transition Plan
              <span className="text-muted-foreground font-normal ml-1">(optional, can be added later)</span>
            </Label>
            <Textarea
              id="edit-transition-plan"
              rows={3}
              value={editFormData.transitionPlan}
              onChange={(e) => setEditFormData((prev) => ({ ...prev, transitionPlan: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="edit-cover-person" className="mb-2">
              Cover Person
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              If selected, the cover person will be notified by email.
            </p>
            <Select
              value={editFormData.coverPersonId || '__none__'}
              onValueChange={(v) => setEditFormData((prev) => ({ ...prev, coverPersonId: v === '__none__' ? '' : v }))}
            >
              <SelectTrigger id="edit-cover-person">
                <SelectValue placeholder="Select who will cover your tasks..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No cover person</SelectItem>
                {users.filter((u) => u.id !== user?.id).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} {u.department ? `(${u.department})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2">
              Notify additional team members
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <div className="max-h-32 overflow-y-auto border border-input rounded-md p-2 bg-muted space-y-1.5">
              {users.filter((u) => u.id !== user?.id).map((u) => (
                <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/80 rounded px-2 py-1.5">
                  <Checkbox
                    checked={editFormData.additionalNotifyIds.includes(u.id)}
                    onCheckedChange={(checked) => {
                      const ids = checked === true
                        ? [...editFormData.additionalNotifyIds, u.id]
                        : editFormData.additionalNotifyIds.filter((id) => id !== u.id)
                      setEditFormData((prev) => ({ ...prev, additionalNotifyIds: ids }))
                    }}
                  />
                  <span className="text-sm text-foreground">{u.name}</span>
                  {u.department && <span className="text-xs text-muted-foreground">({u.department})</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updating}>
              {updating ? 'Updating...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}


