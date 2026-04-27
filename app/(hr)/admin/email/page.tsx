'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Mail, Send, Eye, RefreshCw, CheckCircle, Clock, AlertCircle, Plus, Users } from 'lucide-react'

type EmailRecipient = {
  id: string
  name: string
  email: string | null
  department: string | null
  position: string | null
  queued: boolean
  emailStatus: string | null
}

function EmailPageContent() {
  const searchParams = useSearchParams()
  const periodId = searchParams.get('periodId') || 'active'
  const [queueEntries, setQueueEntries] = useState<any[]>([])
  const [recipients, setRecipients] = useState<EmailRecipient[]>([])
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([])
  const [recipientSearch, setRecipientSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [queuing, setQueuing] = useState(false)
  const [sendingCustom, setSendingCustom] = useState(false)
  const [customSubject, setCustomSubject] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [customExtraEmails, setCustomExtraEmails] = useState('')

  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewEmployee, setPreviewEmployee] = useState<string>('')
  const [loadingPreview, setLoadingPreview] = useState(false)

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  useEffect(() => {
    loadEmailQueue()
  }, [periodId])

  const getEntryStatus = (entry: any) => entry.emailStatus || entry.status || 'PENDING'

  const loadEmailQueue = async () => {
    try {
      const response = await fetch(`/api/email?periodId=${periodId}`)
      const data = await response.json()
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to load email queue')
      }
      setQueueEntries(data.queueEntries || [])
      setRecipients(data.recipients || [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load email queue'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleQueueEmails = async (mode: 'all' | 'selected') => {
    if (mode === 'selected' && selectedRecipientIds.length === 0) {
      toast.error('Select at least one recipient')
      return
    }

    setQueuing(true)
    try {
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'queue',
          periodId,
          employeeIds: mode === 'selected' ? selectedRecipientIds : undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to queue emails')
      }
      toast.success(`Queued ${data.count || 0} new emails`)
      loadEmailQueue()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue emails'
      toast.error(message)
    } finally {
      setQueuing(false)
    }
  }

  const handleSendCustom = async () => {
    setSendingCustom(true)
    try {
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-custom',
          employeeIds: selectedRecipientIds,
          subject: customSubject,
          message: customMessage,
          extraEmails: customExtraEmails,
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to send custom email')
      }
      toast.success(`Sent ${data.sent || 0} custom emails${data.failed ? `, ${data.failed} failed` : ''}`)
      if (!data.failed) {
        setCustomSubject('')
        setCustomMessage('')
        setCustomExtraEmails('')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send custom email'
      toast.error(message)
    } finally {
      setSendingCustom(false)
    }
  }

  const handleSendAll = async () => {
    setConfirmDialogOpen(false)
    setSending(true)
    try {
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-batch', periodId }),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to send emails')
      }
      toast.success(`Sent ${data.sent || 0} emails${data.failed ? `, ${data.failed} failed` : ''}`)
      loadEmailQueue()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send emails'
      toast.error(message)
    } finally {
      setSending(false)
    }
  }

  const handleSendSingle = async (queueId: string) => {
    try {
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', emailQueueId: queueId }),
      })
      const data = await response.json()
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to send email')
      }
      toast.success('Email sent!')
      loadEmailQueue()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send email'
      toast.error(message)
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

  const pendingCount = queueEntries.filter(e => getEntryStatus(e) === 'PENDING').length
  const sentCount = queueEntries.filter(e => getEntryStatus(e) === 'SENT').length
  const filteredRecipients = recipients.filter((recipient) => {
    const haystack = `${recipient.name} ${recipient.email || ''} ${recipient.department || ''}`.toLowerCase()
    return haystack.includes(recipientSearch.toLowerCase())
  })
  const selectedRecipientSet = new Set(selectedRecipientIds)
  const selectedWithEmailCount = recipients.filter(
    (recipient) => selectedRecipientSet.has(recipient.id) && recipient.email
  ).length
  const toggleRecipient = (recipientId: string) => {
    setSelectedRecipientIds((current) =>
      current.includes(recipientId)
        ? current.filter((id) => id !== recipientId)
        : [...current, recipientId]
    )
  }

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading email queue..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
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

        {/* Recipients */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="relative flex-1">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={recipientSearch}
                      onChange={(event) => setRecipientSearch(event.target.value)}
                      placeholder="Search recipients..."
                      className="pl-10"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedRecipientIds(recipients.map((recipient) => recipient.id))}
                    >
                      Select All
                    </Button>
                    <Button variant="outline" onClick={() => setSelectedRecipientIds([])}>
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                  {filteredRecipients.map((recipient) => (
                    <label
                      key={recipient.id}
                      className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Checkbox
                          checked={selectedRecipientSet.has(recipient.id)}
                          onCheckedChange={() => toggleRecipient(recipient.id)}
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{recipient.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[recipient.department, recipient.email || 'No email'].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                      {recipient.emailStatus && (
                        <Badge variant="outline" className={`shrink-0 border ${getStatusBadgeVariant(recipient.emailStatus)}`}>
                          {recipient.emailStatus}
                        </Badge>
                      )}
                    </label>
                  ))}
                  {filteredRecipients.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">No recipients found</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => handleQueueEmails('all')} disabled={queuing}>
                  <Plus className="w-4 h-4" />
                    {queuing ? 'Queuing...' : 'Queue All Reports'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleQueueEmails('selected')}
                    disabled={queuing || selectedRecipientIds.length === 0}
                  >
                    <Plus className="w-4 h-4" />
                    Queue Selected ({selectedRecipientIds.length})
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {selectedWithEmailCount} selected with email
                  </span>
                </div>

                <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                <Button
                  onClick={() => setConfirmDialogOpen(true)}
                  disabled={sending || pendingCount === 0}
                  variant="default"
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Send className="w-4 h-4" />
                  {sending ? 'Sending...' : `Send Queued Reports (${pendingCount})`}
                </Button>
                <Button variant="outline" onClick={loadEmailQueue}>
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Custom Email */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="custom-subject" className="mb-1 block">Custom Subject</Label>
                  <Input
                    id="custom-subject"
                    value={customSubject}
                    onChange={(event) => setCustomSubject(event.target.value)}
                    placeholder="Subject"
                  />
                </div>
                <div>
                  <Label htmlFor="custom-message" className="mb-1 block">Custom Message</Label>
                  <Textarea
                    id="custom-message"
                    value={customMessage}
                    onChange={(event) => setCustomMessage(event.target.value)}
                    rows={5}
                    placeholder="Write your message..."
                  />
                </div>
                <div>
                  <Label htmlFor="custom-extra-emails" className="mb-1 block">Additional Emails</Label>
                  <Input
                    id="custom-extra-emails"
                    value={customExtraEmails}
                    onChange={(event) => setCustomExtraEmails(event.target.value)}
                    placeholder="name@plutus21.com, name@example.com"
                  />
                </div>
                <div>
                  <Button
                    onClick={handleSendCustom}
                    disabled={sendingCustom || (!selectedRecipientIds.length && !customExtraEmails.trim())}
                  >
                    <Send className="w-4 h-4" />
                    {sendingCustom ? 'Sending...' : `Send Custom Email (${selectedWithEmailCount})`}
                  </Button>
                </div>
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
                  {queueEntries.map((entry) => {
                    const status = getEntryStatus(entry)

                    return (
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
                        <Badge variant="outline" className={`inline-flex items-center gap-1.5 border ${getStatusBadgeVariant(status)}`}>
                          {getStatusIcon(status)}
                          {status}
                        </Badge>
                        {entry.errorMessage && (
                          <div className="text-xs text-red-500 mt-1">{entry.errorMessage}</div>
                        )}
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
                          {status === 'PENDING' && (
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
                    )
                  })}
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
        title="Send Queued Reports"
        message={`Are you sure you want to send ${pendingCount} queued report emails? This action cannot be undone.`}
        confirmText="Send Reports"
        variant="info"
      />
    </div>
  )
}

export default function EmailPage() {
  return (
    <Suspense fallback={
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading email queue..." />
      </div>
    }>
      <EmailPageContent />
    </Suspense>
  )
}

