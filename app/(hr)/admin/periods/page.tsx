'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar, Plus, Edit2, Trash2, Lock, Unlock, Bell, CheckCircle, Clock } from 'lucide-react'

interface Period {
  id: string; name: string; startDate: string; endDate: string; isActive: boolean; isLocked?: boolean; reminderSent?: boolean; createdAt: string
  _count?: { evaluations: number; reports: number }
}

export default function PeriodsPage() {
  const router = useRouter()
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null)
  const [periodToDelete, setPeriodToDelete] = useState<Period | null>(null)
  const [formData, setFormData] = useState({ name: '', startDate: '', endDate: '', isActive: false, isLocked: false })
  const [saving, setSaving] = useState(false)
  const [sendingReminders, setSendingReminders] = useState<string | null>(null)

  useEffect(() => { checkAuth() }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (!data.user || data.user.role !== 'HR') { router.push('/login'); return }
      loadPeriods()
    } catch { router.push('/login') }
  }

  const loadPeriods = async () => {
    try {
      const res = await fetch('/api/admin/periods')
      const data = await res.json()
      setPeriods(data.periods || [])
    } catch { toast.error('Failed to load periods') }
    finally { setLoading(false) }
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const formatDateForInput = (d: string) => new Date(d).toISOString().split('T')[0]

  const handleOpenModal = (period?: Period) => {
    if (period) {
      setSelectedPeriod(period)
      setFormData({ name: period.name, startDate: formatDateForInput(period.startDate), endDate: formatDateForInput(period.endDate), isActive: period.isActive, isLocked: period.isLocked || false })
    } else {
      setSelectedPeriod(null)
      setFormData({ name: '', startDate: '', endDate: '', isActive: false, isLocked: false })
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.startDate || !formData.endDate) { toast.error('All fields required'); return }
    setSaving(true)
    try {
      const method = selectedPeriod ? 'PUT' : 'POST'
      const body = selectedPeriod ? { ...formData, id: selectedPeriod.id } : formData
      const res = await fetch('/api/admin/periods', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success(selectedPeriod ? 'Period updated' : 'Period created'); setIsModalOpen(false); loadPeriods() }
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!periodToDelete) return
    try {
      const res = await fetch('/api/admin/periods', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: periodToDelete.id }) })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success('Period deleted'); loadPeriods() }
    } catch { toast.error('Failed to delete') }
    finally { setIsDeleteDialogOpen(false); setPeriodToDelete(null) }
  }

  const handleToggleLock = async (period: Period) => {
    try {
      const res = await fetch('/api/admin/periods', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: period.id, isLocked: !period.isLocked }) })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success(period.isLocked ? 'Period unlocked' : 'Period locked'); loadPeriods() }
    } catch { toast.error('Failed to update') }
  }

  const handleSendReminders = async (periodId: string) => {
    setSendingReminders(periodId)
    try {
      const res = await fetch('/api/admin/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ periodId }) })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success(`Sent ${data.sent} reminders`); loadPeriods() }
    } catch { toast.error('Failed to send reminders') }
    finally { setSendingReminders(null) }
  }

  if (loading) {
    return (
      <PageContainer>
        <LoadingScreen />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Periods" />
      
      <PageContent>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-foreground font-display">Evaluation Periods</h1>
            <p className="text-muted-foreground mt-1">{periods.length} periods configured</p>
          </div>
          <Button onClick={() => handleOpenModal()} className="mt-4 md:mt-0">
            <Plus className="w-4 h-4" /> Add Period
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {periods.map((period, index) => (
            <motion.div key={period.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index }}>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-foreground text-lg">{period.name}</h3>
                      <p className="text-sm text-muted-foreground">{formatDate(period.startDate)} - {formatDate(period.endDate)}</p>
                    </div>
                    <div className="flex gap-1">
                      {period.isActive && (
                        <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                          <CheckCircle className="w-3 h-3 mr-1" />Active
                        </Badge>
                      )}
                      {period.isLocked && (
                        <Badge variant="default" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                          <Lock className="w-3 h-3 mr-1" />Locked
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm text-muted-foreground mb-4">
                    <div className="flex justify-between"><span>Evaluations</span><span className="font-medium text-foreground">{period._count?.evaluations || 0}</span></div>
                    <div className="flex justify-between"><span>Reports</span><span className="font-medium text-foreground">{period._count?.reports || 0}</span></div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-border">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(period)} className="text-muted-foreground hover:text-foreground" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleToggleLock(period)} className={period.isLocked ? 'text-red-500 hover:bg-red-500/10' : 'text-muted-foreground hover:text-foreground'} title={period.isLocked ? 'Unlock' : 'Lock'}>
                      {period.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleSendReminders(period.id)} disabled={sendingReminders === period.id} className="text-muted-foreground hover:text-primary hover:bg-primary/10" title="Send Reminders">
                      <Bell className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setPeriodToDelete(period); setIsDeleteDialogOpen(true) }} className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {periods.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <CardContent className="p-12 text-center">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No evaluation periods yet</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <PageFooter />
      </PageContent>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedPeriod ? 'Edit Period' : 'Add Period'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="period-name" className="mb-1">Name *</Label>
            <Input id="period-name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Q1 2026" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start-date" className="mb-1">Start Date *</Label>
              <Input id="start-date" type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="end-date" className="mb-1">End Date *</Label>
              <Input id="end-date" type="date" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked === true })} />
              <span className="text-sm text-foreground">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={formData.isLocked} onCheckedChange={(checked) => setFormData({ ...formData, isLocked: checked === true })} />
              <span className="text-sm text-foreground">Locked</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} onConfirm={handleDelete} title="Delete Period" message={`Are you sure you want to delete "${periodToDelete?.name}"?`} confirmText="Delete" variant="danger" />
    </PageContainer>
  )
}
