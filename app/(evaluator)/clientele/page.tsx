'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Handshake, Users, Send } from 'lucide-react'

interface RosterEntry {
  userId: string
  name: string
  department: string | null
  position: string | null
  role: 'MANAGER' | 'MEMBER'
}

interface ClientEntry {
  id: string
  name: string
  description: string | null
  myRole: 'MANAGER' | 'MEMBER'
  roster: RosterEntry[]
}

interface DirectoryUser {
  id: string
  name: string
  department?: string | null
}

type PendingChange = { userId: string; action: 'ADD' | 'REMOVE'; role?: 'MANAGER' | 'MEMBER' }

export default function ClientelePage() {
  const [clients, setClients] = useState<ClientEntry[]>([])
  const [directory, setDirectory] = useState<DirectoryUser[]>([])
  const [loading, setLoading] = useState(true)
  const [requestClient, setRequestClient] = useState<ClientEntry | null>(null)
  const [changes, setChanges] = useState<PendingChange[]>([])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/clientele').then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
    ])
      .then(([clientData, userData]) => {
        setClients(clientData.clients || [])
        setDirectory(userData.users || [])
      })
      .catch(() => toast.error('Failed to load your clients'))
      .finally(() => setLoading(false))
  }, [])

  const rosterIds = useMemo(
    () => new Set((requestClient?.roster || []).map((entry) => entry.userId)),
    [requestClient]
  )

  // Only people not already on the roster can be added, which keeps the request
  // valid against the same rule the server applies.
  const addableUsers = useMemo(
    () => directory.filter((candidate) => !rosterIds.has(candidate.id)),
    [directory, rosterIds]
  )

  const openRequest = (client: ClientEntry) => {
    setRequestClient(client)
    setChanges([])
    setNote('')
  }

  const toggleChange = (userId: string, action: 'ADD' | 'REMOVE') => {
    setChanges((prev) => {
      const existing = prev.find((change) => change.userId === userId && change.action === action)
      if (existing) return prev.filter((change) => change !== existing)
      return [...prev, action === 'ADD' ? { userId, action, role: 'MEMBER' } : { userId, action }]
    })
  }

  const setAddRole = (userId: string, role: 'MANAGER' | 'MEMBER') => {
    setChanges((prev) =>
      prev.map((change) =>
        change.userId === userId && change.action === 'ADD' ? { ...change, role } : change
      )
    )
  }

  const isSelected = (userId: string, action: 'ADD' | 'REMOVE') =>
    changes.some((change) => change.userId === userId && change.action === action)

  const submitRequest = async () => {
    if (!requestClient) return
    if (changes.length === 0) {
      toast.error('Select at least one person to add or remove')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/clientele/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: requestClient.id, items: changes, note: note.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit request')

      toast.success(
        data.emailed
          ? 'Request sent to HR'
          : 'Request saved. HR will see it, though the email notification failed.'
      )
      setRequestClient(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-6xl mx-auto">
        <LoadingScreen message="Loading your clients..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-semibold text-foreground">Clientele</h1>
        <p className="text-muted-foreground">
          The clients you work on, and who else is working on them.
        </p>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Handshake className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              You are not assigned to any clients yet. HR manages these assignments.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {clients.map((client, index) => (
            <motion.div
              key={client.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 6) * 0.05 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-foreground">{client.name}</h2>
                      {client.description && (
                        <p className="text-sm text-muted-foreground mt-1">{client.description}</p>
                      )}
                    </div>
                    {/* Managers can ask HR for roster changes; members cannot. */}
                    {client.myRole === 'MANAGER' && (
                      <Button variant="outline" onClick={() => openRequest(client)}>
                        <Send className="w-4 h-4" />
                        Request Roster Change
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                    <Users className="w-4 h-4" />
                    {client.roster.length} {client.roster.length === 1 ? 'person' : 'people'}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {client.roster.map((entry) => (
                      <div
                        key={entry.userId}
                        className="rounded-lg border border-border bg-muted/30 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {entry.name}
                          </span>
                          {entry.role === 'MANAGER' && (
                            <Badge variant="outline" className="shrink-0 border-indigo-500/30 text-indigo-500">
                              Lead
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {entry.position || entry.department || '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        isOpen={Boolean(requestClient)}
        onClose={() => setRequestClient(null)}
        title={`Request Roster Change — ${requestClient?.name ?? ''}`}
        size="lg"
      >
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Choose who should be added or removed. HR receives this and applies the changes; the
            roster does not change until they do.
          </p>

          <div>
            <Label className="mb-2">Remove from this client</Label>
            <div className="flex flex-wrap gap-1.5">
              {(requestClient?.roster || [])
                .filter((entry) => entry.userId !== undefined)
                .map((entry) => (
                  <button
                    key={entry.userId}
                    type="button"
                    onClick={() => toggleChange(entry.userId, 'REMOVE')}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      isSelected(entry.userId, 'REMOVE')
                        ? 'border-red-500 bg-red-500 text-white'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {entry.name}
                  </button>
                ))}
            </div>
          </div>

          <div>
            <Label className="mb-2">Add to this client</Label>
            <div className="max-h-[180px] overflow-y-auto rounded-lg border border-border p-2">
              <div className="flex flex-wrap gap-1.5">
                {addableUsers.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => toggleChange(candidate.id, 'ADD')}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      isSelected(candidate.id, 'ADD')
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {candidate.name}
                  </button>
                ))}
              </div>
            </div>

            {changes.some((change) => change.action === 'ADD') && (
              <div className="mt-3 space-y-2">
                {changes
                  .filter((change) => change.action === 'ADD')
                  .map((change) => {
                    const person = directory.find((candidate) => candidate.id === change.userId)
                    return (
                      <div key={change.userId} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-foreground">{person?.name}</span>
                        <div className="flex gap-1 shrink-0">
                          {(['MEMBER', 'MANAGER'] as const).map((role) => (
                            <button
                              key={role}
                              type="button"
                              onClick={() => setAddRole(change.userId, role)}
                              className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                                change.role === role
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : 'border-border bg-background text-foreground hover:bg-muted'
                              }`}
                            >
                              {role === 'MANAGER' ? 'Lead' : 'Member'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="roster-note" className="mb-2">Note for HR (optional)</Label>
            <Textarea
              id="roster-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything HR should know about this change"
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {changes.length} change{changes.length === 1 ? '' : 's'} selected
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRequestClient(null)}>
                Cancel
              </Button>
              <Button onClick={submitRequest} disabled={submitting || changes.length === 0}>
                {submitting ? 'Sending...' : 'Send to HR'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
