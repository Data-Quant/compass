'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Handshake, Plus, Trash2, Inbox, Search } from 'lucide-react'

type ClientRole = 'MANAGER' | 'MEMBER'

interface Assignment {
  id: string
  role: ClientRole
  user: { id: string; name: string; email: string | null; department: string | null; position: string | null }
}

interface ClientRecord {
  id: string
  name: string
  description: string | null
  status: 'ACTIVE' | 'INACTIVE'
  assignments: Assignment[]
}

interface RosterRequest {
  id: string
  note: string | null
  status: 'PENDING' | 'COMPLETED' | 'DISMISSED'
  createdAt: string
  client: { id: string; name: string }
  requestedBy: { id: string; name: string }
  items: Array<{ id: string; action: 'ADD' | 'REMOVE'; role: ClientRole | null; user: { id: string; name: string } }>
}

interface DirectoryUser {
  id: string
  name: string
  department?: string | null
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [requests, setRequests] = useState<RosterRequest[]>([])
  const [directory, setDirectory] = useState<DirectoryUser[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)
  const [assignTarget, setAssignTarget] = useState<Record<string, { userId: string; role: ClientRole }>>({})

  const load = async () => {
    try {
      const [clientRes, requestRes, userRes] = await Promise.all([
        fetch('/api/admin/clients').then((r) => r.json()),
        fetch('/api/admin/clients/requests').then((r) => r.json()),
        fetch('/api/users').then((r) => r.json()),
      ])
      setClients(clientRes.clients || [])
      setRequests(requestRes.requests || [])
      setDirectory(userRes.users || [])
    } catch {
      toast.error('Failed to load clients')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return clients
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(term) ||
        client.assignments.some((a) => a.user.name.toLowerCase().includes(term))
    )
  }, [clients, query])

  const createClient = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create client')
      toast.success('Client added')
      setForm({ name: '', description: '' })
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create client')
    } finally {
      setCreating(false)
    }
  }

  const setStatus = async (client: ClientRecord, status: 'ACTIVE' | 'INACTIVE') => {
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update client')
      toast.success(status === 'ACTIVE' ? 'Client reactivated' : 'Client marked inactive')
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update client')
    }
  }

  const assign = async (clientId: string) => {
    const target = assignTarget[clientId]
    if (!target?.userId) {
      toast.error('Select someone to assign')
      return
    }
    try {
      const res = await fetch('/api/admin/clients/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, userId: target.userId, role: target.role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to assign')
      toast.success('Roster updated')
      setAssignTarget((prev) => ({ ...prev, [clientId]: { userId: '', role: 'MEMBER' } }))
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign')
    }
  }

  const unassign = async (clientId: string, userId: string, force = false) => {
    try {
      const res = await fetch(
        `/api/admin/clients/assignments?clientId=${clientId}&userId=${userId}${force ? '&force=true' : ''}`,
        { method: 'DELETE' }
      )
      const data = await res.json()

      // The server refuses to silently leave a client without a manager.
      if (res.status === 409 && data.requiresConfirmation) {
        if (window.confirm(`${data.error}\n\nRemove them anyway?`)) {
          return unassign(clientId, userId, true)
        }
        return
      }

      if (!res.ok) throw new Error(data.error || 'Failed to remove')
      toast.success('Removed from client')
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove')
    }
  }

  const resolveRequest = async (id: string, status: 'COMPLETED' | 'DISMISSED') => {
    try {
      const res = await fetch('/api/admin/clients/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update request')
      toast.success(status === 'COMPLETED' ? 'Marked as done' : 'Request dismissed')
      load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update request')
    }
  }

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading clients..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold text-foreground">Clients</h1>
        <p className="text-muted-foreground">
          Manage the client list and who works on each one. Only people assigned here see the
          Clientele section.
        </p>
      </div>

      {/* Pending requests first: they are the thing needing action. */}
      {requests.length > 0 && (
        <Card className="border-amber-500/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Inbox className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-foreground">
                Pending Roster Requests ({requests.length})
              </h2>
            </div>
            <div className="space-y-3">
              {requests.map((request) => (
                <div key={request.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {request.client.name}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          requested by {request.requestedBy.name}
                        </span>
                      </p>
                      <div className="mt-2 space-y-1 text-sm">
                        {request.items.map((item) => (
                          <div key={item.id}>
                            <span
                              className={
                                item.action === 'ADD'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }
                            >
                              {item.action === 'ADD' ? 'Add' : 'Remove'}
                            </span>{' '}
                            <span className="text-foreground">{item.user.name}</span>
                            {item.role && (
                              <span className="text-muted-foreground"> as {item.role.toLowerCase()}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {request.note && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          &ldquo;{request.note}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={() => resolveRequest(request.id, 'COMPLETED')}>
                        Mark Done
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => resolveRequest(request.id, 'DISMISSED')}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Add a Client</h2>
          <form onSubmit={createClient} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="client-description">Description (optional)</Label>
              <Input
                id="client-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What the engagement covers"
              />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <Button type="submit" disabled={creating}>
                <Plus className="w-4 h-4" />
                {creating ? 'Adding...' : 'Add Client'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search clients or people..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Handshake className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {clients.length === 0 ? 'No clients yet.' : 'No clients match that search.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((client) => {
            const managers = client.assignments.filter((a) => a.role === 'MANAGER')
            const target = assignTarget[client.id] || { userId: '', role: 'MEMBER' as ClientRole }
            const assignable = directory.filter(
              (candidate) => !client.assignments.some((a) => a.user.id === candidate.id)
            )

            return (
              <Card key={client.id} className={client.status === 'INACTIVE' ? 'opacity-60' : ''}>
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">{client.name}</h3>
                        {client.status === 'INACTIVE' && <Badge variant="outline">Inactive</Badge>}
                        {managers.length === 0 && client.status === 'ACTIVE' && (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                            No manager
                          </Badge>
                        )}
                      </div>
                      {client.description && (
                        <p className="text-sm text-muted-foreground mt-1">{client.description}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStatus(client, client.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
                    >
                      {client.status === 'ACTIVE' ? 'Mark Inactive' : 'Reactivate'}
                    </Button>
                  </div>

                  <div className="space-y-2 mb-4">
                    {client.assignments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nobody assigned yet.</p>
                    ) : (
                      client.assignments.map((assignment) => (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-foreground">
                              {assignment.user.name}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {assignment.user.position || assignment.user.department || '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Select
                              value={assignment.role}
                              onValueChange={(role) =>
                                fetch('/api/admin/clients/assignments', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    clientId: client.id,
                                    userId: assignment.user.id,
                                    role,
                                  }),
                                })
                                  .then((r) => r.json())
                                  .then(() => {
                                    toast.success('Role updated')
                                    load()
                                  })
                                  .catch(() => toast.error('Failed to update role'))
                              }
                            >
                              <SelectTrigger className="h-8 w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MANAGER">Manager</SelectItem>
                                <SelectItem value="MEMBER">Member</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => unassign(client.id, assignment.user.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
                    <div className="space-y-1.5 min-w-[220px] flex-1">
                      <Label className="text-xs">Assign someone</Label>
                      <Select
                        value={target.userId || '__none__'}
                        onValueChange={(value) =>
                          setAssignTarget((prev) => ({
                            ...prev,
                            [client.id]: { ...target, userId: value === '__none__' ? '' : value },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a team member..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select a team member...</SelectItem>
                          {assignable.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {candidate.name}
                              {candidate.department ? ` (${candidate.department})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Role</Label>
                      <Select
                        value={target.role}
                        onValueChange={(role) =>
                          setAssignTarget((prev) => ({
                            ...prev,
                            [client.id]: { ...target, role: role as ClientRole },
                          }))
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEMBER">Member</SelectItem>
                          <SelectItem value="MANAGER">Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="outline" onClick={() => assign(client.id)}>
                      <Plus className="w-4 h-4" />
                      Assign
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
