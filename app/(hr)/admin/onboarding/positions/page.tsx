'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import { Plus, ArrowRight, Briefcase } from 'lucide-react'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

const STATUS_BORDER: Record<string, string> = {
  OPEN: 'border-l-4 border-l-blue-500',
  CLOSED: 'border-l-4 border-l-emerald-500',
  CANCELLED: 'border-l-4 border-l-slate-400',
}

interface PositionRow {
  id: string
  title: string
  location: string | null
  department: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'OPEN' | 'CLOSED' | 'CANCELLED'
  estimatedCloseDate: string | null
  teamLeadId: string | null
  teamLead?: { id: string; name: string; email: string | null } | null
  newHire?: { id: string; name: string; status: string } | null
}

interface TeamLeadOption {
  id: string
  name: string
}

export default function PositionsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [teamLeads, setTeamLeads] = useState<TeamLeadOption[]>([])
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED' | 'CANCELLED'>('ALL')
  const [form, setForm] = useState({
    title: '',
    location: '',
    department: '',
    teamLeadId: '',
    priority: 'MEDIUM',
    estimatedCloseDate: '',
  })

  const loadData = async () => {
    try {
      const [positionsRes, usersRes] = await Promise.all([
        fetch('/api/onboarding/positions'),
        fetch('/api/users'),
      ])
      const [positionsData, usersData] = await Promise.all([positionsRes.json(), usersRes.json()])

      if (!positionsRes.ok) throw new Error(positionsData.error || 'Failed to load positions')
      if (!usersRes.ok) throw new Error(usersData.error || 'Failed to load users')

      const allUsers = usersData.users || []
      setPositions(positionsData.positions || [])
      setTeamLeads(
        allUsers.map((user: any) => ({
          id: user.id,
          name: user.name,
        }))
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load positions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredPositions = useMemo(
    () => (statusFilter === 'ALL' ? positions : positions.filter((position) => position.status === statusFilter)),
    [positions, statusFilter]
  )

  const createPosition = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Position title is required')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          teamLeadId: form.teamLeadId || null,
          estimatedCloseDate: form.estimatedCloseDate || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create position')
      toast.success('Position created')
      setForm({
        title: '',
        location: '',
        department: '',
        teamLeadId: '',
        priority: 'MEDIUM',
        estimatedCloseDate: '',
      })
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create position')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading positions..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Positions</h1>
        <p className="text-muted-foreground mt-1">Track open and closed roles before user onboarding starts.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card className="mb-6">
        <CardContent className="p-6">
          <form onSubmit={createPosition} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">Title *</Label>
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
                onValueChange={(v) => setForm({ ...form, teamLeadId: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {teamLeads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.name}
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
              <Label className="mb-1">Estimated Close Date</Label>
              <Input
                type="date"
                value={form.estimatedCloseDate}
                onChange={(e) => setForm({ ...form, estimatedCloseDate: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={saving}>
                <Plus className="w-4 h-4" /> {saving ? 'Creating...' : 'Create Position'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-4">
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      <Card>
        <CardContent className="p-4">
          {filteredPositions.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="h-8 w-8" />}
              title="No positions found"
              description={statusFilter === 'ALL' ? 'Create your first position above to get started.' : `No ${statusFilter.toLowerCase()} positions.`}
            />
          ) : (
            <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-3">
              {filteredPositions.map((position) => (
                <motion.div key={position.id} variants={stagger.item}>
                  <div className={`rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40 ${STATUS_BORDER[position.status] || ''}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{position.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {[position.department, position.location, position.teamLead?.name].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{position.priority}</Badge>
                        <Badge
                          variant="secondary"
                          className={
                            position.status === 'OPEN'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : position.status === 'CLOSED'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                          }
                        >
                          {position.status}
                        </Badge>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/onboarding/positions/${position.id}`} className="gap-1.5">
                            Open <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
