'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { calculateLeaveDays } from '@/lib/leave-utils'
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
  Plus,
  Trash2,
  Sun,
  Thermometer,
  Palmtree,
  User,
  MessageSquare,
  FileText
} from 'lucide-react'

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
  leadApprovedAt?: string
  hrApprovedBy?: string
  hrApprovedAt?: string
  rejectedBy?: string
  rejectionReason?: string
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

export default function HRLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [users, setUsers] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('pending')
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [actionModal, setActionModal] = useState<{ open: boolean; action: 'approve' | 'reject' | null }>({ open: false, action: null })
  const [comment, setComment] = useState('')
  const [processing, setProcessing] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [sendingReminders, setSendingReminders] = useState(false)
  const [createForm, setCreateForm] = useState({
    employeeId: '',
    leaveType: 'SICK' as 'CASUAL' | 'SICK' | 'ANNUAL',
    startDate: '',
    endDate: '',
    reason: 'Sick leave entered by HR',
    transitionPlan: '',
  })

  useEffect(() => {
    Promise.all([loadRequests(), loadUsers()])
  }, [])

  useEffect(() => {
    if (!loading) loadRequests()
  }, [filter])

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

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/auth/login')
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      toast.error('Failed to load team members')
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

  const resetCreateForm = () => {
    setCreateForm({
      employeeId: '',
      leaveType: 'SICK',
      startDate: '',
      endDate: '',
      reason: 'Sick leave entered by HR',
      transitionPlan: '',
    })
  }

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.employeeId || !createForm.startDate || !createForm.endDate || !createForm.reason.trim()) {
      toast.error('Please fill employee, dates, and reason')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/leave/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: createForm.employeeId,
          leaveType: createForm.leaveType,
          startDate: createForm.startDate,
          endDate: createForm.endDate,
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

  const getDaysCount = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    return calculateLeaveDays(startDate, endDate)
  }

  // Filter counts
  const pendingCount = requests.filter(r => r.status === 'PENDING' || r.status === 'LEAD_APPROVED').length

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
                const days = getDaysCount(request.startDate, request.endDate)
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
                            <span className="text-muted-foreground text-sm">•</span>
                            <span className="text-sm text-muted-foreground">{request.employee.department || 'No dept'}</span>
                            <Badge variant="outline" className={`${statusConfig.bg} ${statusConfig.color} border-0`}>
                              {statusConfig.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground">
                            <span className="font-medium">{typeConfig.label} Leave</span>
                            <span className="mx-2">•</span>
                            {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                            <span className="mx-2">•</span>
                            <span className="font-medium">{days} day{days > 1 ? 's' : ''}</span>
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">{request.reason}</p>
                          
                          {/* Transition Plan */}
                          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-500/10 rounded-lg">
                            <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mb-1">
                              <FileText className="w-3 h-3" />
                              Transition Plan
                            </div>
                            <p className="text-sm text-amber-800 dark:text-amber-300">{request.transitionPlan}</p>
                          </div>
                          
                          {request.coverPerson && (
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Cover: {request.coverPerson.name}
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
                  {LEAVE_TYPE_CONFIG[selectedRequest.leaveType].label} Leave • 
                  {getDaysCount(selectedRequest.startDate, selectedRequest.endDate)} days
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="hr-start-date" className="mb-2">Start Date</Label>
              <Input
                id="hr-start-date"
                type="date"
                required
                value={createForm.startDate}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="hr-end-date" className="mb-2">End Date</Label>
              <Input
                id="hr-end-date"
                type="date"
                required
                min={createForm.startDate}
                value={createForm.endDate}
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
    </div>
  )
}


