'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ArrowLeft, Save, CheckCircle2, Clock } from 'lucide-react'

interface NewHireDetail {
  id: string
  name: string
  title: string
  company: string | null
  department: string | null
  teamLeadId: string | null
  buddyId: string | null
  email: string
  onboardingDate: string
  status: 'PENDING' | 'ONBOARDING' | 'COMPLETED'
  teamLead?: { id: string; name: string } | null
  buddy?: { id: string; name: string } | null
  user?: { id: string; name: string; onboardingCompleted: boolean } | null
  teamLeadForm?: {
    emailGroups: string | null
    discordChannels: string | null
    tools: string | null
    earlyKpis: string | null
    availableOnDate: string | null
    resources: string | null
    submittedAt: string | null
  } | null
  securityChecklist?: {
    equipmentReady: boolean
    equipmentReceived: boolean
    securityOnboarding: boolean
    addedToEmailGroups: boolean
    discordSetup: boolean
    completedAt: string | null
  } | null
}

interface UserOption {
  id: string
  name: string
}

export default function NewHireDetailPage() {
  const params = useParams<{ id: string }>()
  const newHireId = params?.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newHire, setNewHire] = useState<NewHireDetail | null>(null)
  const [users, setUsers] = useState<UserOption[]>([])
  const [form, setForm] = useState({
    name: '',
    title: '',
    company: '',
    department: '',
    teamLeadId: '',
    buddyId: '',
    email: '',
    onboardingDate: '',
    status: 'PENDING',
  })

  const loadData = async () => {
    if (!newHireId) return
    try {
      const [newHireRes, usersRes] = await Promise.all([
        fetch(`/api/onboarding/new-hires/${newHireId}`),
        fetch('/api/users'),
      ])
      const [newHireData, usersData] = await Promise.all([newHireRes.json(), usersRes.json()])
      if (!newHireRes.ok) throw new Error(newHireData.error || 'Failed to load new hire')
      if (!usersRes.ok) throw new Error(usersData.error || 'Failed to load users')

      const detail = newHireData.newHire
      setNewHire(detail)
      setUsers(usersData.users || [])
      setForm({
        name: detail.name || '',
        title: detail.title || '',
        company: detail.company || '',
        department: detail.department || '',
        teamLeadId: detail.teamLeadId || '',
        buddyId: detail.buddyId || '',
        email: detail.email || '',
        onboardingDate: detail.onboardingDate ? new Date(detail.onboardingDate).toISOString().slice(0, 10) : '',
        status: detail.status || 'PENDING',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load new hire')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [newHireId]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveChanges = async () => {
    if (!newHireId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/onboarding/new-hires/${newHireId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          teamLeadId: form.teamLeadId || null,
          buddyId: form.buddyId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update new hire')
      toast.success('New hire updated')
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update new hire')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading new hire..." />
  }

  if (!newHire) {
    return null
  }

  const checklist = newHire.securityChecklist
  const checklistDone =
    checklist &&
    checklist.equipmentReady &&
    checklist.equipmentReceived &&
    checklist.securityOnboarding &&
    checklist.addedToEmailGroups &&
    checklist.discordSetup

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/onboarding/new-hires" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to New Hires
          </Link>
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card className="mb-6">
        <CardContent className="p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">New Hire Detail</h1>
            <Badge variant="secondary">{newHire.status}</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1">Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1">Company</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1">Department</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1">Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1">Onboarding Date</Label>
              <Input
                type="date"
                value={form.onboardingDate}
                onChange={(e) => setForm({ ...form, onboardingDate: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Team Lead</Label>
              <Select
                value={form.teamLeadId || '__none__'}
                onValueChange={(value) => setForm({ ...form, teamLeadId: value === '__none__' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Buddy</Label>
              <Select
                value={form.buddyId || '__none__'}
                onValueChange={(value) => setForm({ ...form, buddyId: value === '__none__' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select buddy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="ONBOARDING">Onboarding</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveChanges} disabled={saving}>
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={`border-l-4 ${newHire.teamLeadForm?.submittedAt ? 'border-l-emerald-500' : 'border-l-amber-500'}`}>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              {newHire.teamLeadForm?.submittedAt ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Clock className="h-4 w-4 text-amber-500" />}
              <h2 className="text-lg font-semibold text-foreground">Team Lead Form</h2>
            </div>
            {newHire.teamLeadForm?.submittedAt ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong className="text-foreground">Email Groups:</strong> {newHire.teamLeadForm.emailGroups || '—'}</p>
                <p><strong className="text-foreground">Discord Channels:</strong> {newHire.teamLeadForm.discordChannels || '—'}</p>
                <p><strong className="text-foreground">Tools:</strong> {newHire.teamLeadForm.tools || '—'}</p>
                <p><strong className="text-foreground">Early KPIs:</strong> {newHire.teamLeadForm.earlyKpis || '—'}</p>
                <p><strong className="text-foreground">Availability:</strong> {newHire.teamLeadForm.availableOnDate || '—'}</p>
                <p><strong className="text-foreground">Resources:</strong> {newHire.teamLeadForm.resources || '—'}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Pending submission by team lead.</p>
            )}
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${checklistDone ? 'border-l-emerald-500' : 'border-l-amber-500'}`}>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              {checklistDone ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Clock className="h-4 w-4 text-amber-500" />}
              <h2 className="text-lg font-semibold text-foreground">Security Checklist</h2>
            </div>
            {checklist ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Equipment ready: {checklist.equipmentReady ? 'Yes' : 'No'}</p>
                <p>Equipment received: {checklist.equipmentReceived ? 'Yes' : 'No'}</p>
                <p>Security onboarding: {checklist.securityOnboarding ? 'Yes' : 'No'}</p>
                <p>Email groups: {checklist.addedToEmailGroups ? 'Yes' : 'No'}</p>
                <p>Discord setup: {checklist.discordSetup ? 'Yes' : 'No'}</p>
                <Badge
                  variant="secondary"
                  className={
                    checklistDone
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }
                >
                  {checklistDone ? 'Completed' : 'Pending'}
                </Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Checklist not initialized.</p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
