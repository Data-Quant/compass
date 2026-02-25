'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
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
import { ArrowLeft, Save } from 'lucide-react'

interface PositionDetail {
  id: string
  title: string
  location: string | null
  department: string | null
  teamLeadId: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  estimatedCloseDate: string | null
  status: 'OPEN' | 'CLOSED' | 'CANCELLED'
  newHire?: {
    id: string
    name: string
    status: string
  } | null
}

interface UserOption {
  id: string
  name: string
}

export default function PositionDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const positionId = params?.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [position, setPosition] = useState<PositionDetail | null>(null)
  const [users, setUsers] = useState<UserOption[]>([])
  const [form, setForm] = useState({
    title: '',
    location: '',
    department: '',
    teamLeadId: '',
    priority: 'MEDIUM',
    estimatedCloseDate: '',
    status: 'OPEN',
  })
  const [newHireForm, setNewHireForm] = useState({
    name: '',
    title: '',
    company: 'Plutus21',
    department: '',
    teamLeadId: '',
    email: '',
    onboardingDate: '',
    buddyId: '',
  })

  const loadData = async () => {
    if (!positionId) return
    try {
      const [positionRes, usersRes] = await Promise.all([
        fetch(`/api/onboarding/positions/${positionId}`),
        fetch('/api/users'),
      ])
      const [positionData, usersData] = await Promise.all([positionRes.json(), usersRes.json()])
      if (!positionRes.ok) throw new Error(positionData.error || 'Failed to load position')
      if (!usersRes.ok) throw new Error(usersData.error || 'Failed to load users')

      const detail = positionData.position
      setPosition(detail)
      setForm({
        title: detail.title || '',
        location: detail.location || '',
        department: detail.department || '',
        teamLeadId: detail.teamLeadId || '',
        priority: detail.priority || 'MEDIUM',
        estimatedCloseDate: detail.estimatedCloseDate ? new Date(detail.estimatedCloseDate).toISOString().slice(0, 10) : '',
        status: detail.status || 'OPEN',
      })
      setNewHireForm((prev) => ({
        ...prev,
        name: detail.newHire?.name || '',
        title: detail.title || '',
        department: detail.department || '',
        teamLeadId: detail.teamLeadId || '',
      }))
      setUsers(usersData.users || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load position')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [positionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const savePosition = async () => {
    if (!positionId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/onboarding/positions/${positionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          teamLeadId: form.teamLeadId || null,
          estimatedCloseDate: form.estimatedCloseDate || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update position')
      toast.success('Position updated')
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update position')
    } finally {
      setSaving(false)
    }
  }

  const createNewHire = async () => {
    if (!positionId) return
    if (!newHireForm.name.trim() || !newHireForm.email.trim() || !newHireForm.onboardingDate) {
      toast.error('Name, email, and onboarding date are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/new-hires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newHireForm,
          positionId,
          teamLeadId: newHireForm.teamLeadId || null,
          buddyId: newHireForm.buddyId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create new hire')
      toast.success('New hire created')
      router.push(`/admin/onboarding/new-hires/${data.newHire.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create new hire')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading position..." />
  }

  if (!position) {
    return null
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/onboarding/positions" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to Positions
          </Link>
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card className="mb-6">
        <CardContent className="p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Position Detail</h1>
            <Badge variant="secondary">{position.status}</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1">Location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1">Department</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
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
              <Label className="mb-1">Priority</Label>
              <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
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
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Estimated Close Date</Label>
              <Input
                type="date"
                value={form.estimatedCloseDate}
                onChange={(e) => setForm({ ...form, estimatedCloseDate: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={savePosition} disabled={saving}>
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
      </motion.div>

      {position.newHire ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              This position is linked to new hire{' '}
              <Link className="text-primary underline-offset-2 hover:underline" href={`/admin/onboarding/new-hires/${position.newHire.id}`}>
                {position.newHire.name}
              </Link>.
            </p>
          </CardContent>
        </Card>
      ) : form.status === 'CLOSED' ? (
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Create New Hire From Position</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1">Name *</Label>
                <Input value={newHireForm.name} onChange={(e) => setNewHireForm({ ...newHireForm, name: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1">Title *</Label>
                <Input value={newHireForm.title} onChange={(e) => setNewHireForm({ ...newHireForm, title: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1">Company</Label>
                <Input value={newHireForm.company} onChange={(e) => setNewHireForm({ ...newHireForm, company: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1">Department</Label>
                <Input value={newHireForm.department} onChange={(e) => setNewHireForm({ ...newHireForm, department: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1">Email *</Label>
                <Input value={newHireForm.email} onChange={(e) => setNewHireForm({ ...newHireForm, email: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1">Onboarding Date *</Label>
                <Input
                  type="date"
                  value={newHireForm.onboardingDate}
                  onChange={(e) => setNewHireForm({ ...newHireForm, onboardingDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Team Lead</Label>
                <Select
                  value={newHireForm.teamLeadId || '__none__'}
                  onValueChange={(value) => setNewHireForm({ ...newHireForm, teamLeadId: value === '__none__' ? '' : value })}
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
                  value={newHireForm.buddyId || '__none__'}
                  onValueChange={(value) => setNewHireForm({ ...newHireForm, buddyId: value === '__none__' ? '' : value })}
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
            </div>

            <div className="flex justify-end">
              <Button onClick={createNewHire} disabled={saving}>
                {saving ? 'Creating...' : 'Create New Hire'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Close this position first to create a linked new hire record.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
