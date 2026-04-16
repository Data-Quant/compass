'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { calculateLeaveDuration } from '@/lib/leave-utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Calendar,
  CheckCircle2,
  XCircle,
  Filter,
  Home,
  Plus,
  Trash2,
  Sun,
  Thermometer,
  Palmtree,
  User,
  MessageSquare,
  FileText,
  Eye
} from 'lucide-react'
import { isThreeEDepartment } from '@/lib/company-branding'
import { calculateWfhDays } from '@/lib/wfh-utils'

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
  isHalfDay: boolean
  halfDaySession?: 'FIRST_HALF' | 'SECOND_HALF' | null
  unavailableStartTime?: string | null
  unavailableEndTime?: string | null
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
  coverPeople?: Array<{ id: string; name: string }>
  leadApprovedBy?: string
  leadApprovedAt?: string
  hrApprovedBy?: string
  hrApprovedAt?: string
  rejectedBy?: string
  rejectionReason?: string
  createdAt: string
}

interface WfhRequest {
  id: string
  startDate: string
  endDate: string
  reason: string
  workPlan?: string | null
  status: string
  employee: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
  leadApprovedBy?: string | null
  hrApprovedBy?: string | null
  rejectionReason?: string | null
  createdAt: string
}

interface TeamUser {
  id: string
  name: string
  department?: string | null
}

const LEAVE_TYPE_CONFIG = {
  CASUAL: { icon: Sun, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', label: 'Casual' },
  SICK: { icon: Thermometer, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10', label: 'Sick' },
  ANNUAL: { icon: Palmtree, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', label: 'Annual' },
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  PENDING: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-500/20', label: 'Pending' },
  LEAD_APPROVED: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-500/20', label: 'Lead Approved' },
  HR_APPROVED: { color: 'text-indigo-600', bg: 'bg-indigo-100 dark:bg-indigo-500/20', label: 'HR Approved' },
  APPROVED: { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-500/20', label: 'Approved' },
  REJECTED: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-500/20', label: 'Rejected' },
  CANCELLED: { color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-500/20', label: 'Cancelled' },
}

const HALF_DAY_SESSION_OPTIONS = [
  { value: 'FIRST_HALF', label: 'First Half' },
  { value: 'SECOND_HALF', label: 'Second Half' },
] as const

const isHalfDayEligibleLeaveType = (leaveType: 'CASUAL' | 'SICK' | 'ANNUAL') =>
  leaveType === 'CASUAL' || leaveType === 'SICK'

const getHalfDaySessionLabel = (session?: 'FIRST_HALF' | 'SECOND_HALF' | null) => {
  if (session === 'FIRST_HALF') return 'First half'
  if (session === 'SECOND_HALF') return 'Second half'
  return 'Half day'
}

const getHalfDayWindowLabel = (start?: string | null, end?: string | null) => {
  if (!start || !end) return 'Unavailable hours not provided'
  return `${start} - ${end}`
}

const getDurationLabel = (days: number) => (days === 0.5 ? '0.5 day' : `${days} days`)

const toDateKey = (value: string) => {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`
}

const parseInputDateAsLocal = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }
  return new Date(year, month - 1, day)
}

const formatApiDate = (value: string, options?: Intl.DateTimeFormatOptions) => {
  const key = toDateKey(value)
  const parsed = key ? parseInputDateAsLocal(key) : null
  if (!parsed) return value
  return parsed.toLocaleDateString('en-US', options)
}

const getRequestCoverPeople = (request: LeaveRequest) =>
  Array.isArray(request.coverPeople) && request.coverPeople.length > 0
    ? request.coverPeople
    : request.coverPerson
      ? [request.coverPerson]
      : []

export default function HRLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [wfhRequests, setWfhRequests] = useState<WfhRequest[]>([])
  const [users, setUsers] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('pending')
  const [wfhFilter, setWfhFilter] = useState<string>('pending')
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [actionModal, setActionModal] = useState<{ open: boolean; action: 'approve' | 'reject' | null }>({ open: false, action: null })
  const [comment, setComment] = useState('')
  const [processing, setProcessing] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [selectedWfhRequest, setSelectedWfhRequest] = useState<WfhRequest | null>(null)
  const [wfhActionModal, setWfhActionModal] = useState<{ open: boolean; action: 'approve' | 'reject' | null }>({ open: false, action: null })
  const [wfhComment, setWfhComment] = useState('')
  const [processingWfh, setProcessingWfh] = useState(false)
  const [isCreateWfhModalOpen, setIsCreateWfhModalOpen] = useState(false)
  const [creatingWfh, setCreatingWfh] = useState(false)
  const [removingWfhId, setRemovingWfhId] = useState<string | null>(null)
  const [sendingReminders, setSendingReminders] = useState(false)
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false)
  const [balanceEmployeeId, setBalanceEmployeeId] = useState('')
  const [balanceYear, setBalanceYear] = useState(new Date().getFullYear())
  const [selectedBalance, setSelectedBalance] = useState<LeaveBalance | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [savingBalance, setSavingBalance] = useState(false)
  const [balanceForm, setBalanceForm] = useState({
    casualDays: '',
    sickDays: '',
    annualDays: '',
  })
  const [createForm, setCreateForm] = useState({
    employeeId: '',
    leaveType: 'SICK' as 'CASUAL' | 'SICK' | 'ANNUAL',
    isHalfDay: false,
    halfDaySession: '' as '' | 'FIRST_HALF' | 'SECOND_HALF',
    unavailableStartTime: '',
    unavailableEndTime: '',
    startDate: '',
    endDate: '',
    reason: 'Sick leave entered by HR',
    transitionPlan: '',
  })
  const [createWfhForm, setCreateWfhForm] = useState({
    employeeId: '',
    startDate: '',
    endDate: '',
    reason: '',
    workPlan: '',
  })

  useEffect(() => {
    Promise.all([loadRequests(), loadUsers(), loadWfhRequests()])
  }, [])

  useEffect(() => {
    if (!loading) loadRequests()
  }, [filter])

  useEffect(() => {
    if (!loading) loadWfhRequests()
  }, [wfhFilter])

  useEffect(() => {
    if (!isBalanceModalOpen || !balanceEmployeeId) {
      if (!balanceEmployeeId) {
        setSelectedBalance(null)
      }
      return
    }

    void loadLeaveBalance(balanceEmployeeId, balanceYear)
  }, [isBalanceModalOpen, balanceEmployeeId, balanceYear])

  useEffect(() => {
    if (!selectedBalance) {
      setBalanceForm({
        casualDays: '',
        sickDays: '',
        annualDays: '',
      })
      return
    }

    setBalanceForm({
      casualDays: selectedBalance.casualDays.toString(),
      sickDays: selectedBalance.sickDays.toString(),
      annualDays: selectedBalance.annualDays.toString(),
    })
  }, [selectedBalance])

  const loadRequests = async () => {
    try {
      let url = '/api/leave/requests'
      if (filter === 'pending') {
        url += '?forApproval=true'
      } else if (filter !== 'all') {
        url += `?status=${filter}`
      }
      
      const res = await fetch(url)
      const data = await res.json()
      setRequests(data.requests || [])
    } catch {
      toast.error('Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  const loadWfhRequests = async () => {
    try {
      let url = '/api/wfh/requests'
      if (wfhFilter === 'pending') {
        url += '?forApproval=true'
      } else if (wfhFilter !== 'all') {
        url += `?status=${wfhFilter}`
      }

      const res = await fetch(url)
      const data = await res.json()
      setWfhRequests(data.requests || [])
    } catch {
      toast.error('Failed to load WFH requests')
    }
  }

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/auth/login')
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      toast.error('Failed to load team members')
    }
  }

  const loadLeaveBalance = async (employeeId: string, year: number) => {
    setLoadingBalance(true)
    try {
      const res = await fetch(`/api/leave/balance?employeeId=${employeeId}&year=${year}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to load leave balance')
      }
      setSelectedBalance(data.balance || null)
    } catch (error) {
      setSelectedBalance(null)
      toast.error(error instanceof Error ? error.message : 'Failed to load leave balance')
    } finally {
      setLoadingBalance(false)
    }
  }

  const handleAction = async () => {
    if (!selectedRequest || !actionModal.action) return
    
    setProcessing(true)
    try {
      const res = await fetch('/api/leave/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          action: actionModal.action,
          comment: comment || undefined,
        }),
      })
      
      const data = await res.json()
      
      if (data.success) {
        toast.success(actionModal.action === 'approve' ? 'Request approved' : 'Request rejected')
        setActionModal({ open: false, action: null })
        setSelectedRequest(null)
        setComment('')
        loadRequests()
      } else {
        toast.error(data.error || 'Action failed')
      }
    } catch {
      toast.error('Action failed')
    } finally {
      setProcessing(false)
    }
  }

  const openActionModal = (request: LeaveRequest, action: 'approve' | 'reject') => {
    setSelectedRequest(request)
    setActionModal({ open: true, action })
    setComment('')
  }

  const openWfhActionModal = (request: WfhRequest, action: 'approve' | 'reject') => {
    setSelectedWfhRequest(request)
    setWfhActionModal({ open: true, action })
    setWfhComment('')
  }

  const handleSaveBalance = async () => {
    if (!balanceEmployeeId) {
      toast.error('Select a team member first')
      return
    }

    const parsedTotals = {
      casualDays: Number(balanceForm.casualDays),
      sickDays: Number(balanceForm.sickDays),
      annualDays: Number(balanceForm.annualDays),
    }

    for (const [label, value] of Object.entries(parsedTotals)) {
      if (!Number.isInteger(value) || value < 0) {
        toast.error(`${label.replace('Days', '')} allocation must be a whole number 0 or higher`)
        return
      }
    }

    setSavingBalance(true)
    try {
      const res = await fetch('/api/leave/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: balanceEmployeeId,
          year: balanceYear,
          ...parsedTotals,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update leave allocation')
      }

      toast.success('Leave allocation updated')
      await loadLeaveBalance(balanceEmployeeId, balanceYear)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update leave allocation')
    } finally {
      setSavingBalance(false)
    }
  }

  const resetCreateForm = () => {
    setCreateForm({
      employeeId: '',
      leaveType: 'SICK',
      isHalfDay: false,
      halfDaySession: '',
      unavailableStartTime: '',
      unavailableEndTime: '',
      startDate: '',
      endDate: '',
      reason: 'Sick leave entered by HR',
      transitionPlan: '',
    })
  }

  const resetCreateWfhForm = () => {
    setCreateWfhForm({
      employeeId: '',
      startDate: '',
      endDate: '',
      reason: '',
      workPlan: '',
    })
  }

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    const isHalfDay = createForm.isHalfDay && isHalfDayEligibleLeaveType(createForm.leaveType)
    const endDate = isHalfDay ? createForm.startDate : createForm.endDate

    if (!createForm.employeeId || !createForm.startDate || !endDate || !createForm.reason.trim()) {
      toast.error('Please fill employee, dates, and reason')
      return
    }

    if (isHalfDay) {
      if (!createForm.halfDaySession) {
        toast.error('Select first half or second half')
        return
      }
      if (!createForm.unavailableStartTime || !createForm.unavailableEndTime) {
        toast.error('Enter unavailable start and end time for half-day leave')
        return
      }
      if (createForm.unavailableStartTime >= createForm.unavailableEndTime) {
        toast.error('Unavailable end time must be after start time')
        return
      }
    }

    setCreating(true)
    try {
      const res = await fetch('/api/leave/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: createForm.employeeId,
          leaveType: createForm.leaveType,
          isHalfDay,
          halfDaySession: isHalfDay ? createForm.halfDaySession : undefined,
          unavailableStartTime: isHalfDay ? createForm.unavailableStartTime : undefined,
          unavailableEndTime: isHalfDay ? createForm.unavailableEndTime : undefined,
          startDate: createForm.startDate,
          endDate,
          reason: createForm.reason,
          transitionPlan: createForm.transitionPlan || 'Entered by HR on behalf of employee',
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to add leave')
      }

      toast.success('Leave added successfully')
      setIsCreateModalOpen(false)
      resetCreateForm()
      await loadRequests()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add leave')
    } finally {
      setCreating(false)
    }
  }

  const handleCreateWfh = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!createWfhForm.employeeId || !createWfhForm.startDate || !createWfhForm.endDate || !createWfhForm.reason.trim()) {
      toast.error('Please fill employee, dates, and reason')
      return
    }

    setCreatingWfh(true)
    try {
      const res = await fetch('/api/wfh/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: createWfhForm.employeeId,
          startDate: createWfhForm.startDate,
          endDate: createWfhForm.endDate,
          reason: createWfhForm.reason,
          workPlan: createWfhForm.workPlan || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to add WFH')
      }

      toast.success('WFH added successfully')
      setIsCreateWfhModalOpen(false)
      resetCreateWfhForm()
      await loadWfhRequests()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add WFH')
    } finally {
      setCreatingWfh(false)
    }
  }

  const handleWfhAction = async () => {
    if (!selectedWfhRequest || !wfhActionModal.action) return

    setProcessingWfh(true)
    try {
      const res = await fetch('/api/wfh/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedWfhRequest.id,
          action: wfhActionModal.action,
          comment: wfhComment || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Action failed')
      }

      toast.success(wfhActionModal.action === 'approve' ? 'WFH request approved' : 'WFH request rejected')
      setWfhActionModal({ open: false, action: null })
      setSelectedWfhRequest(null)
      setWfhComment('')
      await loadWfhRequests()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed')
    } finally {
      setProcessingWfh(false)
    }
  }

  const handleRemoveLeave = async (request: LeaveRequest) => {
    if (!confirm(`Remove leave for ${request.employee.name}?`)) return

    setRemovingId(request.id)
    try {
      const res = await fetch(`/api/leave/requests?id=${request.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to remove leave')
      }
      toast.success('Leave removed')
      await loadRequests()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove leave')
    } finally {
      setRemovingId(null)
    }
  }

  const handleRemoveWfh = async (request: WfhRequest) => {
    if (!confirm(`Remove WFH request for ${request.employee.name}?`)) return

    setRemovingWfhId(request.id)
    try {
      const res = await fetch(`/api/wfh/requests?id=${request.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to remove WFH')
      }
      toast.success('WFH removed')
      await loadWfhRequests()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove WFH')
    } finally {
      setRemovingWfhId(null)
    }
  }

  const handleSendTransitionPlanReminders = async () => {
    setSendingReminders(true)
    try {
      const res = await fetch('/api/leave/transition-plan-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBeforeStart: 3 }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to send transition plan reminders')
      }

      toast.success(`Transition plan reminders sent: ${data.sent} (eligible: ${data.eligible})`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send transition plan reminders')
    } finally {
      setSendingReminders(false)
    }
  }

  const getDaysCount = (start: string, end: string, isHalfDay = false) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    return calculateLeaveDuration(startDate, endDate, isHalfDay)
  }

  const openBalanceModal = (employeeId = balanceEmployeeId, year = balanceYear) => {
    setBalanceEmployeeId(employeeId)
    setBalanceYear(year)
    setIsBalanceModalOpen(true)
  }

  const selectedBalanceEmployee = useMemo(
    () => users.find((user) => user.id === balanceEmployeeId) || null,
    [users, balanceEmployeeId]
  )
  const threeEUsers = useMemo(
    () => users.filter((user) => isThreeEDepartment(user.department)),
    [users]
  )

  const totalRemainingLeave = selectedBalance
    ? selectedBalance.remaining.casual + selectedBalance.remaining.sick + selectedBalance.remaining.annual
    : 0

  const formatLeaveValue = (value: number) =>
    Number.isInteger(value) ? value.toString() : value.toFixed(1)

  // Filter counts
  const pendingCount = requests.filter(r => r.status === 'PENDING' || r.status === 'LEAD_APPROVED').length
  const wfhPendingCount = wfhRequests.filter(r => r.status === 'PENDING' || r.status === 'LEAD_APPROVED').length

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-semibold text-foreground">Leave Management</h1>
            <p className="text-muted-foreground">Approve, add, or remove leave entries.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => openBalanceModal()}
            >
              <Eye className="w-4 h-4" />
              Manage Leave Balance
            </Button>
            <Button
              variant="outline"
              onClick={handleSendTransitionPlanReminders}
              disabled={sendingReminders}
            >
              <MessageSquare className="w-4 h-4" />
              {sendingReminders ? 'Sending...' : 'Send Reminders'}
            </Button>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Add Leave
            </Button>
            <Button variant="outline" onClick={() => setIsCreateWfhModalOpen(true)}>
              <Home className="w-4 h-4" />
              Add WFH
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Pending Approval', value: requests.filter(r => r.status === 'PENDING' || r.status === 'LEAD_APPROVED').length, color: 'amber' },
            { label: 'Approved', value: requests.filter(r => r.status === 'APPROVED').length, color: 'emerald' },
            { label: 'Rejected', value: requests.filter(r => r.status === 'REJECTED').length, color: 'red' },
            { label: 'Total Requests', value: requests.length, color: 'indigo' },
          ].map((stat, i) => (
            <div key={i} className="glass rounded-xl p-4 border border-border">
              <p className="text-sm text-muted">{stat.label}</p>
              <p className={`text-2xl font-bold text-${stat.color}-600`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-6">
          <Filter className="w-4 h-4 text-muted" />
          <div className="flex gap-2">
            {[
              { value: 'pending', label: 'Pending' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'REJECTED', label: 'Rejected' },
              { value: 'all', label: 'All' },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  filter === f.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-surface hover:bg-surface-hover text-foreground'
                }`}
              >
                {f.label}
                {f.value === 'pending' && pendingCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-white/20 rounded">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Requests Table */}
        <Card>
          {requests.length === 0 ? (
            <CardContent className="p-12 text-center">
              <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No leave requests found</p>
            </CardContent>
          ) : (
            <div className="divide-y divide-border">
              {requests.map((request) => {
                const typeConfig = LEAVE_TYPE_CONFIG[request.leaveType]
                const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.PENDING
                const TypeIcon = typeConfig.icon
                const days = getDaysCount(request.startDate, request.endDate, request.isHalfDay)
                const needsHRApproval = request.status === 'PENDING' || request.status === 'LEAD_APPROVED'
                const leadNotRequired = !request.leadApprovedBy && request.status === 'APPROVED' && !!request.hrApprovedBy
                
                return (
                  <div key={request.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg ${typeConfig.bg} flex items-center justify-center flex-shrink-0`}>
                          <TypeIcon className={`w-5 h-5 ${typeConfig.color}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-foreground">{request.employee.name}</span>
                            <span className="text-muted-foreground text-sm">-</span>
                            <span className="text-sm text-muted-foreground">{request.employee.department || 'No dept'}</span>
                            <Badge variant="outline" className={`${statusConfig.bg} ${statusConfig.color} border-0`}>
                              {statusConfig.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground">
                            <span className="font-medium">{typeConfig.label} Leave</span>
                            <span className="mx-2">-</span>
                            {formatApiDate(request.startDate)} - {formatApiDate(request.endDate)}
                            <span className="mx-2">-</span>
                            <span className="font-medium">{getDurationLabel(days)}</span>
                          </p>
                          {request.isHalfDay && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {getHalfDaySessionLabel(request.halfDaySession)} - {getHalfDayWindowLabel(request.unavailableStartTime, request.unavailableEndTime)}
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground mt-1">{request.reason}</p>
                          
                          {/* Transition Plan */}
                          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-500/10 rounded-lg">
                            <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mb-1">
                              <FileText className="w-3 h-3" />
                              Transition Plan
                            </div>
                            <p className="text-sm text-amber-800 dark:text-amber-300">{request.transitionPlan}</p>
                          </div>
                          
                          {getRequestCoverPeople(request).length > 0 && (
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Cover: {getRequestCoverPeople(request).map((coverPerson) => coverPerson.name).join(', ')}
                            </p>
                          )}
                          
                          {/* Approval status */}
                          <div className="flex gap-4 mt-2 text-xs">
                            <span className={request.leadApprovedBy ? 'text-emerald-600' : 'text-muted-foreground'}>
                              {request.leadApprovedBy ? 'Lead approved' : leadNotRequired ? 'Lead not required' : 'Lead pending'}
                            </span>
                            <span className={request.hrApprovedBy ? 'text-emerald-600' : 'text-muted-foreground'}>
                              {request.hrApprovedBy ? 'HR approved' : 'HR pending'}
                            </span>
                          </div>
                          
                          {request.rejectionReason && (
                            <p className="text-sm text-red-600 mt-2">
                              Rejection reason: {request.rejectionReason}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-shrink-0">
                        {needsHRApproval && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openActionModal(request, 'approve')}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openActionModal(request, 'reject')}
                            >
                              <XCircle className="w-4 h-4" />
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openBalanceModal(
                              request.employee.id,
                              parseInputDateAsLocal(toDateKey(request.startDate))?.getFullYear() ??
                                new Date().getFullYear()
                            )
                          }
                        >
                          <Eye className="w-4 h-4" />
                          Balance
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveLeave(request)}
                          disabled={removingId === request.id}
                          className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                          {removingId === request.id ? 'Removing...' : 'Remove'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-semibold text-foreground">WFH Requests</h2>
            <p className="text-sm text-muted-foreground">
              Separate from leave balances and available only for 3E team members.
            </p>
          </div>
          <Button variant="outline" onClick={() => setIsCreateWfhModalOpen(true)}>
            <Home className="w-4 h-4" />
            Add WFH
          </Button>
        </div>

        <div className="flex items-center gap-2 mt-4 mb-6">
          <Filter className="w-4 h-4 text-muted" />
          <div className="flex gap-2">
            {[
              { value: 'pending', label: 'Pending' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'REJECTED', label: 'Rejected' },
              { value: 'all', label: 'All' },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setWfhFilter(f.value)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  wfhFilter === f.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-surface hover:bg-surface-hover text-foreground'
                }`}
              >
                {f.label}
                {f.value === 'pending' && wfhPendingCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-white/20 rounded">
                    {wfhPendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <Card className="mb-8">
          {wfhRequests.length === 0 ? (
            <CardContent className="p-12 text-center">
              <Home className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No WFH requests found</p>
            </CardContent>
          ) : (
            <div className="divide-y divide-border">
              {wfhRequests.map((request) => {
                const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.PENDING
                const days = calculateWfhDays(new Date(request.startDate), new Date(request.endDate))
                const needsHRApproval = request.status === 'PENDING' || request.status === 'LEAD_APPROVED'
                const leadNotRequired = !request.leadApprovedBy && request.status === 'APPROVED' && !!request.hrApprovedBy

                return (
                  <div key={request.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                          <Home className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium text-foreground">{request.employee.name}</span>
                            <span className="text-muted-foreground text-sm">-</span>
                            <span className="text-sm text-muted-foreground">{request.employee.department || 'No dept'}</span>
                            <Badge variant="outline" className={`${statusConfig.bg} ${statusConfig.color} border-0`}>
                              {statusConfig.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground">
                            <span className="font-medium">Work From Home</span>
                            <span className="mx-2">-</span>
                            {formatApiDate(request.startDate)} - {formatApiDate(request.endDate)}
                            <span className="mx-2">-</span>
                            <span className="font-medium">{getDurationLabel(days)}</span>
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">{request.reason}</p>
                          {request.workPlan && (
                            <div className="mt-2 p-2 bg-sky-50 dark:bg-sky-500/10 rounded-lg">
                              <div className="flex items-center gap-1 text-xs text-sky-700 dark:text-sky-400 mb-1">
                                <FileText className="w-3 h-3" />
                                Work Plan
                              </div>
                              <p className="text-sm text-sky-800 dark:text-sky-300 whitespace-pre-wrap">{request.workPlan}</p>
                            </div>
                          )}
                          <div className="flex gap-4 mt-2 text-xs">
                            <span className={request.leadApprovedBy ? 'text-emerald-600' : 'text-muted-foreground'}>
                              {request.leadApprovedBy ? 'Lead approved' : leadNotRequired ? 'Lead not required' : 'Lead pending'}
                            </span>
                            <span className={request.hrApprovedBy ? 'text-emerald-600' : 'text-muted-foreground'}>
                              {request.hrApprovedBy ? 'HR approved' : 'HR pending'}
                            </span>
                          </div>
                          {request.rejectionReason && (
                            <p className="text-sm text-red-600 mt-2">
                              Rejection reason: {request.rejectionReason}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        {needsHRApproval && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openWfhActionModal(request, 'approve')}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openWfhActionModal(request, 'reject')}
                            >
                              <XCircle className="w-4 h-4" />
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveWfh(request)}
                          disabled={removingWfhId === request.id}
                          className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                          {removingWfhId === request.id ? 'Removing...' : 'Remove'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
         
      {/* Action Modal */}
      <Modal 
        isOpen={actionModal.open} 
        onClose={() => setActionModal({ open: false, action: null })} 
        title={actionModal.action === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
        size="sm"
      >
        {selectedRequest && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-3">
                <p className="font-medium text-foreground">{selectedRequest.employee.name}</p>
                <p className="text-sm text-muted-foreground">
                  {LEAVE_TYPE_CONFIG[selectedRequest.leaveType].label} Leave - 
                  {getDurationLabel(getDaysCount(selectedRequest.startDate, selectedRequest.endDate, selectedRequest.isHalfDay))}
                </p>
              </CardContent>
            </Card>
            
            <div className="space-y-2">
              <Label>
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Comment {actionModal.action === 'reject' ? '(recommended)' : '(optional)'}
              </Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder={actionModal.action === 'reject' ? 'Please provide a reason for rejection...' : 'Add a comment...'}
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setActionModal({ open: false, action: null })}>
                Cancel
              </Button>
              <Button
                onClick={handleAction}
                disabled={processing}
                variant={actionModal.action === 'approve' ? 'default' : 'destructive'}
              >
                {processing ? 'Processing...' : actionModal.action === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={wfhActionModal.open}
        onClose={() => setWfhActionModal({ open: false, action: null })}
        title={wfhActionModal.action === 'approve' ? 'Approve WFH Request' : 'Reject WFH Request'}
        size="sm"
      >
        {selectedWfhRequest && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-3">
                <p className="font-medium text-foreground">{selectedWfhRequest.employee.name}</p>
                <p className="text-sm text-muted-foreground">
                  Work From Home -
                  {getDurationLabel(calculateWfhDays(new Date(selectedWfhRequest.startDate), new Date(selectedWfhRequest.endDate)))}
                </p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label>
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Comment {wfhActionModal.action === 'reject' ? '(recommended)' : '(optional)'}
              </Label>
              <Textarea
                value={wfhComment}
                onChange={(e) => setWfhComment(e.target.value)}
                rows={3}
                placeholder={wfhActionModal.action === 'reject' ? 'Please provide a reason for rejection...' : 'Add a comment...'}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setWfhActionModal({ open: false, action: null })}>
                Cancel
              </Button>
              <Button
                onClick={handleWfhAction}
                disabled={processingWfh}
                variant={wfhActionModal.action === 'approve' ? 'default' : 'destructive'}
              >
                {processingWfh ? 'Processing...' : wfhActionModal.action === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isBalanceModalOpen}
        onClose={() => setIsBalanceModalOpen(false)}
        title="Employee Leave Balance"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_140px] gap-4">
            <div>
              <Label className="mb-2">Team Member</Label>
              <Select
                value={balanceEmployeeId || '__none__'}
                onValueChange={(value) => setBalanceEmployeeId(value === '__none__' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select team member...</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{u.department ? ` (${u.department})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="leave-balance-year" className="mb-2">Year</Label>
              <Input
                id="leave-balance-year"
                type="number"
                min={2020}
                max={2100}
                value={balanceYear}
                onChange={(e) => setBalanceYear(Number(e.target.value) || new Date().getFullYear())}
              />
            </div>
          </div>

          {!balanceEmployeeId ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Select a team member to view their leave balance.
              </CardContent>
            </Card>
          ) : loadingBalance ? (
            <Card>
              <CardContent className="p-6">
                <LoadingScreen message="Loading leave balance..." variant="section" />
              </CardContent>
            </Card>
          ) : selectedBalance ? (
            <>
              <Card className="border-border/80 bg-muted/20">
                <CardContent className="p-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      {selectedBalanceEmployee?.name || 'Selected employee'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedBalanceEmployee?.department || 'No department'} • {balanceYear} balance snapshot
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total Remaining</p>
                    <p className="text-3xl font-bold text-foreground">{formatLeaveValue(totalRemainingLeave)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-muted/20">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-foreground">Edit Yearly Allocation</p>
                      <p className="text-sm text-muted-foreground">
                        Defaults start at the standard company allocation. HR can override this employee&apos;s totals for contract-specific leave.
                      </p>
                    </div>
                    <Button onClick={handleSaveBalance} disabled={savingBalance}>
                      {savingBalance ? 'Saving...' : 'Save Allocation'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="casual-allocation" className="mb-2">Casual Total</Label>
                      <Input
                        id="casual-allocation"
                        type="number"
                        min={0}
                        step={1}
                        value={balanceForm.casualDays}
                        onChange={(e) =>
                          setBalanceForm((prev) => ({ ...prev, casualDays: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="sick-allocation" className="mb-2">Sick Total</Label>
                      <Input
                        id="sick-allocation"
                        type="number"
                        min={0}
                        step={1}
                        value={balanceForm.sickDays}
                        onChange={(e) =>
                          setBalanceForm((prev) => ({ ...prev, sickDays: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="annual-allocation" className="mb-2">Annual Total</Label>
                      <Input
                        id="annual-allocation"
                        type="number"
                        min={0}
                        step={1}
                        value={balanceForm.annualDays}
                        onChange={(e) =>
                          setBalanceForm((prev) => ({ ...prev, annualDays: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Used leave stays intact. Totals cannot be set below already-used leave for the selected year.
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    key: 'casual',
                    label: 'Casual',
                    total: selectedBalance.casualDays,
                    used: selectedBalance.casualUsed,
                    remaining: selectedBalance.remaining.casual,
                    config: LEAVE_TYPE_CONFIG.CASUAL,
                  },
                  {
                    key: 'sick',
                    label: 'Sick',
                    total: selectedBalance.sickDays,
                    used: selectedBalance.sickUsed,
                    remaining: selectedBalance.remaining.sick,
                    config: LEAVE_TYPE_CONFIG.SICK,
                  },
                  {
                    key: 'annual',
                    label: 'Annual',
                    total: selectedBalance.annualDays,
                    used: selectedBalance.annualUsed,
                    remaining: selectedBalance.remaining.annual,
                    config: LEAVE_TYPE_CONFIG.ANNUAL,
                  },
                ].map((item) => {
                  const Icon = item.config.icon
                  return (
                    <Card key={item.key}>
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${item.config.bg} flex items-center justify-center`}>
                            <Icon className={`w-5 h-5 ${item.config.color}`} />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{balanceYear} allowance</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-muted-foreground">Total</p>
                            <p className="mt-1 text-lg font-semibold text-foreground">{formatLeaveValue(item.total)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-muted-foreground">Used</p>
                            <p className="mt-1 text-lg font-semibold text-foreground">{formatLeaveValue(item.used)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-muted-foreground">Remaining</p>
                            <p className="mt-1 text-lg font-semibold text-foreground">{formatLeaveValue(item.remaining)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No leave balance data found.
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsBalanceModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false)
          resetCreateForm()
        }}
        title="Add Leave (HR)"
        size="lg"
      >
        <form onSubmit={handleCreateLeave} className="space-y-4">
          <div>
            <Label className="mb-2">Team Member</Label>
            <Select
              value={createForm.employeeId || '__none__'}
              onValueChange={(v) => setCreateForm((prev) => ({ ...prev, employeeId: v === '__none__' ? '' : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select team member..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select team member...</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}{u.department ? ` (${u.department})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2">Leave Type</Label>
            <Select
              value={createForm.leaveType}
              onValueChange={(v: 'CASUAL' | 'SICK' | 'ANNUAL') => {
                setCreateForm((prev) => ({
                  ...prev,
                  leaveType: v,
                  reason: v === 'SICK' ? 'Sick leave entered by HR' : prev.reason,
                  ...(v === 'ANNUAL'
                    ? {
                        isHalfDay: false,
                        halfDaySession: '',
                        unavailableStartTime: '',
                        unavailableEndTime: '',
                      }
                    : {}),
                }))
              }}
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

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="mb-1">Half-Day Leave</Label>
                <p className="text-xs text-muted-foreground">
                  Available for Casual and Sick only. Half-day leave counts as 0.5 day.
                </p>
              </div>
              <Checkbox
                checked={createForm.isHalfDay}
                disabled={!isHalfDayEligibleLeaveType(createForm.leaveType)}
                onCheckedChange={(checked) => {
                  const nextChecked = checked === true
                  setCreateForm((prev) => ({
                    ...prev,
                    isHalfDay: nextChecked,
                    endDate: nextChecked && prev.startDate ? prev.startDate : prev.endDate,
                    halfDaySession: nextChecked ? prev.halfDaySession : '',
                    unavailableStartTime: nextChecked ? prev.unavailableStartTime : '',
                    unavailableEndTime: nextChecked ? prev.unavailableEndTime : '',
                  }))
                }}
              />
            </div>

            {createForm.isHalfDay && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="mb-2">Session</Label>
                  <Select
                    value={createForm.halfDaySession}
                    onValueChange={(value: 'FIRST_HALF' | 'SECOND_HALF') =>
                      setCreateForm((prev) => ({
                        ...prev,
                        halfDaySession: value,
                        unavailableStartTime:
                          prev.unavailableStartTime ||
                          (value === 'FIRST_HALF' ? '09:00' : '14:00'),
                        unavailableEndTime:
                          prev.unavailableEndTime ||
                          (value === 'FIRST_HALF' ? '13:00' : '18:00'),
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select session" />
                    </SelectTrigger>
                    <SelectContent>
                      {HALF_DAY_SESSION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="hr-unavailable-start-time" className="mb-2">Unavailable From</Label>
                  <Input
                    id="hr-unavailable-start-time"
                    type="time"
                    required={createForm.isHalfDay}
                    value={createForm.unavailableStartTime}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, unavailableStartTime: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="hr-unavailable-end-time" className="mb-2">Unavailable To</Label>
                  <Input
                    id="hr-unavailable-end-time"
                    type="time"
                    required={createForm.isHalfDay}
                    value={createForm.unavailableEndTime}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, unavailableEndTime: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="hr-start-date" className="mb-2">Start Date</Label>
              <Input
                id="hr-start-date"
                type="date"
                required
                value={createForm.startDate}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    startDate: e.target.value,
                    ...(prev.isHalfDay ? { endDate: e.target.value } : {}),
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="hr-end-date" className="mb-2">End Date</Label>
              <Input
                id="hr-end-date"
                type="date"
                required
                min={createForm.startDate}
                value={createForm.isHalfDay ? createForm.startDate : createForm.endDate}
                disabled={createForm.isHalfDay}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="hr-reason" className="mb-2">Reason</Label>
            <Textarea
              id="hr-reason"
              required
              rows={2}
              value={createForm.reason}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Reason for leave"
            />
          </div>

          <div>
            <Label htmlFor="hr-transition-plan" className="mb-2">
              Transition Plan
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Textarea
              id="hr-transition-plan"
              rows={3}
              value={createForm.transitionPlan}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, transitionPlan: e.target.value }))}
              placeholder="Optional handover notes"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateModalOpen(false)
                resetCreateForm()
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? 'Adding...' : 'Add Leave'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isCreateWfhModalOpen}
        onClose={() => {
          setIsCreateWfhModalOpen(false)
          resetCreateWfhForm()
        }}
        title="Add WFH (HR)"
        size="lg"
      >
        <form onSubmit={handleCreateWfh} className="space-y-4">
          <div>
            <Label className="mb-2">3E Team Member</Label>
            <Select
              value={createWfhForm.employeeId || '__none__'}
              onValueChange={(v) => setCreateWfhForm((prev) => ({ ...prev, employeeId: v === '__none__' ? '' : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select 3E team member..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select 3E team member...</SelectItem>
                {threeEUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}{u.department ? ` (${u.department})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="hr-wfh-start-date" className="mb-2">Start Date</Label>
              <Input
                id="hr-wfh-start-date"
                type="date"
                required
                value={createWfhForm.startDate}
                onChange={(e) => setCreateWfhForm((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="hr-wfh-end-date" className="mb-2">End Date</Label>
              <Input
                id="hr-wfh-end-date"
                type="date"
                required
                min={createWfhForm.startDate}
                value={createWfhForm.endDate}
                onChange={(e) => setCreateWfhForm((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="hr-wfh-reason" className="mb-2">Reason</Label>
            <Textarea
              id="hr-wfh-reason"
              required
              rows={2}
              value={createWfhForm.reason}
              onChange={(e) => setCreateWfhForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Reason for WFH"
            />
          </div>

          <div>
            <Label htmlFor="hr-wfh-work-plan" className="mb-2">
              Work Plan
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Textarea
              id="hr-wfh-work-plan"
              rows={3}
              value={createWfhForm.workPlan}
              onChange={(e) => setCreateWfhForm((prev) => ({ ...prev, workPlan: e.target.value }))}
              placeholder="Optional availability or delivery notes"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateWfhModalOpen(false)
                resetCreateWfhForm()
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creatingWfh}>
              {creatingWfh ? 'Adding...' : 'Add WFH'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}




