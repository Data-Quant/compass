'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { Mail, Send, Eye, RefreshCw, CheckCircle, Clock, AlertCircle, Plus } from 'lucide-react'

export default function EmailPage() {
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
      default: return <Clock className="w-4 h-4 text-muted" />
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      SENT: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      PENDING: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      FAILED: 'bg-red-500/10 text-red-600 dark:text-red-400',
    }
    return styles[status] || 'bg-surface text-muted'
  }

  const pendingCount = queueEntries.filter(e => e.status === 'PENDING').length
  const sentCount = queueEntries.filter(e => e.status === 'SENT').length

  if (loading) {
    return (
      <PageContainer>
        <div className="min-h-screen flex items-center justify-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
            <p className="text-muted text-sm">Loading email queue...</p>
          </motion.div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Email" />
      
      <PageContent>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Email Distribution</h1>
            <p className="text-muted mt-1">Send performance reports to employees</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-5">
            <Mail className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mb-2" />
            <div className="text-3xl font-bold text-foreground">{queueEntries.length}</div>
            <div className="text-sm text-muted">Total in Queue</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-5">
            <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400 mb-2" />
            <div className="text-3xl font-bold text-foreground">{pendingCount}</div>
            <div className="text-sm text-muted">Pending</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-5">
            <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mb-2" />
            <div className="text-3xl font-bold text-foreground">{sentCount}</div>
            <div className="text-sm text-muted">Sent</div>
          </motion.div>
        </div>

        {/* Actions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-4 mb-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleQueueEmails}
              disabled={queuing}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {queuing ? 'Queuing...' : 'Queue New Emails'}
            </button>
            <button
              onClick={() => setConfirmDialogOpen(true)}
              disabled={sending || pendingCount === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending...' : `Send All (${pendingCount})`}
            </button>
            <button
              onClick={loadEmailQueue}
              className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-surface text-foreground transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </motion.div>

        {/* Queue Table */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queueEntries.map((entry, index) => (
                  <motion.tr
                    key={entry.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.02 * index }}
                    className="hover:bg-surface/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                          {entry.employee?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{entry.employee?.name}</div>
                          <div className="text-xs text-muted">{entry.employee?.department}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">{entry.employee?.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(entry.status)}`}>
                        {getStatusIcon(entry.status)}
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePreview(entry.employeeId, entry.employee?.name)}
                          className="p-2 text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"
                          title="Preview Report"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {entry.status === 'PENDING' && (
                          <button
                            onClick={() => handleSendSingle(entry.id)}
                            className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                            title="Send Email"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {queueEntries.length === 0 && (
            <div className="p-12 text-center">
              <Mail className="w-12 h-12 text-muted mx-auto mb-4" />
              <p className="text-muted">No emails in queue. Click "Queue New Emails" to generate report emails.</p>
            </div>
          )}
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
          <div className="bg-white rounded-lg overflow-hidden" style={{ height: '70vh' }}>
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
        variant="primary"
      />
    </PageContainer>
  )
}
