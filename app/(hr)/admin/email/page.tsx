'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Mail, Send, Eye, RefreshCw, CheckCircle, Clock, AlertCircle, Plus } from 'lucide-react'

function EmailPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const periodId = searchParams.get('periodId') || 'active'
  const [queueEntries, setQueueEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [queuing, setQueuing] = useState(false)

  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewEmployee, setPreviewEmployee] = useState<string>('')
  const [loadingPreview, setLoadingPreview] = useState(false)

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [periodId])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (!data.user || data.user.role !== 'HR') {
        router.push('/login')
        return
      }
      loadEmailQueue()
    } catch (error) {
      router.push('/login')
    }
  }

  const loadEmailQueue = async () => {
    try {
      const response = await fetch(`/api/email?periodId=${periodId}`)
      const data = await response.json()
      setQueueEntries(data.queueEntries || [])
    } catch (error) {
      toast.error('Failed to load email queue')
    } finally {
      setLoading(false)
    }
  }

  const handleQueueEmails = async () => {
    setQueuing(true)
    try {
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'queue', periodId }),
      })
      const data = await response.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`Queued ${data.count} emails`)
        loadEmailQueue()
      }
    } catch (error) {
      toast.error('Failed to queue emails')
    } finally {
      setQueuing(false)
    }
  }

  const handleSendAll = async () => {
    setConfirmDialogOpen(false)
    setSending(true)
    try {
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-all', periodId }),
      })
      const data = await response.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`Sent ${data.sent} emails`)
        loadEmailQueue()
      }
    } catch (error) {
      toast.error('Failed to send emails')
    } finally {
      setSending(false)
    }
  }

  const handleSendSingle = async (queueId: string) => {
    try {
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-single', queueId }),
      })
      const data = await response.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success('Email sent!')
        loadEmailQueue()
      }
    } catch (error) {
      toast.error('Failed to send email')
    }
  }

  const handlePreview = async (employeeId: string, employeeName: string) => {
    setPreviewEmployee(employeeName)
    setPreviewModalOpen(true)
    setLoadingPreview(true)
    try {
      const response = await fetch(`/api/reports?employeeId=${employeeId}&periodId=${periodId}&format=html`)
      const html = await response.text()
      setPreviewHtml(html)
    } catch (error) {
      toast.error('Failed to load preview')
      setPreviewModalOpen(false)
    } finally {
      setLoadingPreview(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SENT': return <CheckCircle className="w-4 h-4 text-emerald-500" />
      case 'PENDING': return <Clock className="w-4 h-4 text-amber-500" />
      case 'FAILED': return <AlertCircle className="w-4 h-4 text-red-500" />
      default: return <Clock className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'SENT': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
      case 'PENDING': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
      case 'FAILED': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const pendingCount = queueEntries.filter(e => e.status === 'PENDING').length
  const sentCount = queueEntries.filter(e => e.status === 'SENT').length

  if (loading) {
    return (
      <PageContainer>
        <LoadingScreen message="Loading email queue..." />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Email" />

      <PageContent>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">Email Distribution</h1>
            <p className="text-muted-foreground mt-1">Send performance reports to employees</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardContent className="p-5">
                <Mail className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mb-2" />
                <div className="text-3xl font-bold text-foreground">{queueEntries.length}</div>
                <div className="text-sm text-muted-foreground">Total in Queue</div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardContent className="p-5">
                <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400 mb-2" />
                <div className="text-3xl font-bold text-foreground">{pendingCount}</div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardContent className="p-5">
                <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mb-2" />
                <div className="text-3xl font-bold text-foreground">{sentCount}</div>
                <div className="text-sm text-muted-foreground">Sent</div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Actions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleQueueEmails} disabled={queuing}>
                  <Plus className="w-4 h-4" />
                  {queuing ? 'Queuing...' : 'Queue New Emails'}
                </Button>
                <Button
                  onClick={() => setConfirmDialogOpen(true)}
                  disabled={sending || pendingCount === 0}
                  variant="default"
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Send className="w-4 h-4" />
                  {sending ? 'Sending...' : `Send All (${pendingCount})`}
                </Button>
                <Button variant="outline" onClick={loadEmailQueue}>
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Queue Table */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="px-6 py-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Employee</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueEntries.map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-muted/50">
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                            {entry.employee?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{entry.employee?.name}</div>
                            <div className="text-xs text-muted-foreground">{entry.employee?.department}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-muted-foreground">{entry.employee?.email}</TableCell>
                      <TableCell className="px-6 py-4">
                        <Badge variant="outline" className={`inline-flex items-center gap-1.5 border ${getStatusBadgeVariant(entry.status)}`}>
                          {getStatusIcon(entry.status)}
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePreview(entry.employeeId, entry.employee?.name)}
                            title="Preview Report"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {entry.status === 'PENDING' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSendSingle(entry.id)}
                              title="Send Email"
                              className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {queueEntries.length === 0 && (
              <div className="p-12 text-center">
                <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No emails in queue. Click &quot;Queue New Emails&quot; to generate report emails.</p>
              </div>
            )}
          </Card>
        </motion.div>

        <PageFooter />
      </PageContent>

      {/* Preview Modal */}
      <Modal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title={`Report Preview: ${previewEmployee}`}
        size="xl"
      >
        {loadingPreview ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 rounded-full gradient-primary animate-pulse" />
          </div>
        ) : (
          <div className="bg-white rounded-lg overflow-hidden dark:bg-card" style={{ height: '70vh' }}>
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              title="Report Preview"
            />
          </div>
        )}
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={handleSendAll}
        title="Send All Emails"
        message={`Are you sure you want to send ${pendingCount} emails? This action cannot be undone.`}
        confirmText="Send All"
        variant="info"
      />
    </PageContainer>
  )
}

export default function EmailPage() {
  return (
    <Suspense fallback={
      <PageContainer>
        <LoadingScreen message="Loading email queue..." />
      </PageContainer>
    }>
      <EmailPageContent />
    </Suspense>
  )
}
