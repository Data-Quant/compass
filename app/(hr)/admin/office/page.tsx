'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Building2, DoorClosed, Grid3X3, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type AdminOfficeUser = {
  id: string
  name: string
  department: string | null
  position: string | null
  office: {
    cubicleId: string | null
    leadershipOfficeId: string | null
    seniorOfficeEligible: boolean
  }
}

export default function AdminOfficePage() {
  const [loading, setLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [drafts, setDrafts] = useState<Record<string, { cubicleId: string; leadershipOfficeId: string }>>({})
  const [query, setQuery] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/office')
        const payload = await res.json()
        if (!res.ok) throw new Error(payload.error || 'Failed to load office admin')
        setData(payload)
        const nextDrafts: Record<string, { cubicleId: string; leadershipOfficeId: string }> = {}
        for (const user of payload.users as AdminOfficeUser[]) {
          nextDrafts[user.id] = {
            cubicleId: user.office.cubicleId || '',
            leadershipOfficeId: user.office.leadershipOfficeId || '',
          }
        }
        setDrafts(nextDrafts)
      } catch (error: any) {
        toast.error(error.message || 'Failed to load office admin')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const users = useMemo(() => {
    const allUsers = (data?.users || []) as AdminOfficeUser[]
    if (!query.trim()) return allUsers
    const needle = query.toLowerCase()
    return allUsers.filter((user) => `${user.name} ${user.department} ${user.position}`.toLowerCase().includes(needle))
  }, [data, query])

  async function saveAssignment(userId: string) {
    const draft = drafts[userId]
    if (!draft) return
    setSavingUserId(userId)
    try {
      const res = await fetch('/api/admin/office', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'assignment',
          userId,
          cubicleId: draft.cubicleId || null,
          leadershipOfficeId: draft.leadershipOfficeId || null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Failed to save assignment')
      toast.success('Office assignment saved')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save assignment')
    } finally {
      setSavingUserId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-light tracking-tight text-foreground">Office Management</h1>
          <p className="text-sm text-muted-foreground">Cubicles, leadership offices, rooms, decor, and avatar catalogs.</p>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search employees..."
          className="sm:w-72"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Grid3X3 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xl font-semibold">{data?.world?.cubicles?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Cubicles</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <DoorClosed className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xl font-semibold">{data?.world?.leadershipOffices?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Private Offices</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xl font-semibold">{data?.world?.zones?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Zones</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Save className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xl font-semibold">{(data?.catalog?.decor || []).length}</p>
              <p className="text-xs text-muted-foreground">Decor Items</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assignments</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[820px] space-y-2">
            {users.map((user) => (
              <div key={user.id} className="grid grid-cols-[1.4fr_1fr_160px_160px_90px] items-center gap-3 rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.department || '-'} · {user.position || '-'}</p>
                </div>
                <div className="text-xs">
                  <span className={user.office.seniorOfficeEligible ? 'text-emerald-500' : 'text-muted-foreground'}>
                    {user.office.seniorOfficeEligible ? 'Leadership eligible' : 'Cubicle only'}
                  </span>
                </div>
                <div>
                  <Label className="sr-only">Cubicle</Label>
                  <Input
                    value={drafts[user.id]?.cubicleId || ''}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || { leadershipOfficeId: '' }), cubicleId: event.target.value } }))}
                    placeholder="cubicle-01"
                  />
                </div>
                <div>
                  <Label className="sr-only">Leadership office</Label>
                  <Input
                    value={drafts[user.id]?.leadershipOfficeId || ''}
                    onChange={(event) => setDrafts((prev) => ({ ...prev, [user.id]: { ...(prev[user.id] || { cubicleId: '' }), leadershipOfficeId: event.target.value } }))}
                    placeholder="office-01"
                  />
                </div>
                <Button size="sm" onClick={() => saveAssignment(user.id)} disabled={savingUserId === user.id}>
                  {savingUserId === user.id ? 'Saving' : 'Save'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
