'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { 
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
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
  const router = useRouter()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('pending')
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [actionModal, setActionModal] = useState<{ open: boolean; action: 'approve' | 'reject' | null }>({ open: false, action: null })
  const [comment, setComment] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (!loading) loadRequests()
  }, [filter])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (!data.user || data.user.role !== 'HR') {
        router.push('/login')
        return
      }
      loadRequests()
    } catch {
      router.push('/login')
    }
  }

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

  const getDaysCount = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  // Filter counts
  const pendingCount = requests.filter(r => r.status === 'PENDING' || r.status === 'LEAD_APPROVED').length

  if (loading) {
    return (
      <PageContainer>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
            <p className="text-muted text-sm">Loading...</p>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Dashboard" badge="Leave Requests" />
      
      <PageContent>
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
        <div className="glass rounded-xl border border-border overflow-hidden">
          {requests.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="w-12 h-12 text-muted/30 mx-auto mb-3" />
              <p className="text-muted">No leave requests found</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {requests.map((request) => {
                const typeConfig = LEAVE_TYPE_CONFIG[request.leaveType]
                const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.PENDING
                const TypeIcon = typeConfig.icon
                const days = getDaysCount(request.startDate, request.endDate)
                const needsHRApproval = request.status === 'PENDING' || request.status === 'LEAD_APPROVED'
                
                return (
                  <div key={request.id} className="p-4 hover:bg-surface/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg ${typeConfig.bg} flex items-center justify-center flex-shrink-0`}>
                          <TypeIcon className={`w-5 h-5 ${typeConfig.color}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-foreground">{request.employee.name}</span>
                            <span className="text-muted text-sm">•</span>
                            <span className="text-sm text-muted">{request.employee.department || 'No dept'}</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
                              {statusConfig.label}
                            </span>
                          </div>
                          <p className="text-sm text-foreground">
                            <span className="font-medium">{typeConfig.label} Leave</span>
                            <span className="mx-2">•</span>
                            {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                            <span className="mx-2">•</span>
                            <span className="font-medium">{days} day{days > 1 ? 's' : ''}</span>
                          </p>
                          <p className="text-sm text-muted mt-1">{request.reason}</p>
                          
                          {/* Transition Plan */}
                          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-500/10 rounded-lg">
                            <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mb-1">
                              <FileText className="w-3 h-3" />
                              Transition Plan
                            </div>
                            <p className="text-sm text-amber-800 dark:text-amber-300">{request.transitionPlan}</p>
                          </div>
                          
                          {request.coverPerson && (
                            <p className="text-xs text-muted mt-2 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Cover: {request.coverPerson.name}
                            </p>
                          )}
                          
                          {/* Approval status */}
                          <div className="flex gap-4 mt-2 text-xs">
                            <span className={request.leadApprovedBy ? 'text-emerald-600' : 'text-muted'}>
                              {request.leadApprovedBy ? '✓ Lead approved' : '○ Lead pending'}
                            </span>
                            <span className={request.hrApprovedBy ? 'text-emerald-600' : 'text-muted'}>
                              {request.hrApprovedBy ? '✓ HR approved' : '○ HR pending'}
                            </span>
                          </div>
                          
                          {request.rejectionReason && (
                            <p className="text-sm text-red-600 mt-2">
                              Rejection reason: {request.rejectionReason}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {needsHRApproval && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => openActionModal(request, 'approve')}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Approve
                          </button>
                          <button
                            onClick={() => openActionModal(request, 'reject')}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        
        <PageFooter />
      </PageContent>

      {/* Action Modal */}
      <Modal 
        isOpen={actionModal.open} 
        onClose={() => setActionModal({ open: false, action: null })} 
        title={actionModal.action === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
        size="sm"
      >
        {selectedRequest && (
          <div className="space-y-4">
            <div className="p-3 bg-surface rounded-lg">
              <p className="font-medium text-foreground">{selectedRequest.employee.name}</p>
              <p className="text-sm text-muted">
                {LEAVE_TYPE_CONFIG[selectedRequest.leaveType].label} Leave • 
                {getDaysCount(selectedRequest.startDate, selectedRequest.endDate)} days
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Comment {actionModal.action === 'reject' ? '(recommended)' : '(optional)'}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder={actionModal.action === 'reject' ? 'Please provide a reason for rejection...' : 'Add a comment...'}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setActionModal({ open: false, action: null })}
                className="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
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
    </PageContainer>
  )
}
