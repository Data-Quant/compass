'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Calendar,
  CheckCircle2,
  XCircle,
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
        <LoadingScreen message="Loading..." />
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
                              {request.leadApprovedBy ? '✓ Lead approved' : '○ Lead pending'}
                            </span>
                            <span className={request.hrApprovedBy ? 'text-emerald-600' : 'text-muted-foreground'}>
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
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
        
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
    </PageContainer>
  )
}

