'use client'

import { useState, useEffect } from 'react'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { Search, UserPlus, Crown, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'

interface MemberManagerProps {
  projectId: string
  members: { id: string; name: string; role: string }[]
  ownerId: string
  open: boolean
  onClose: () => void
  onMembersChange: () => void
}

interface AllUser {
  id: string
  name: string
}

export function MemberManager({
  projectId, members, ownerId, open, onClose, onMembersChange,
}: MemberManagerProps) {
  const [allUsers, setAllUsers] = useState<AllUser[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      fetchUsers()
      setSearch('')
    }
  }, [open])

  const fetchUsers = async () => {
    setLoading(true)
    setUsersError(null)
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (!res.ok) {
        const message = data?.error || 'Failed to load users'
        setAllUsers([])
        setUsersError(message)
        toast.error(message)
        return
      }
      setAllUsers(data.users || [])
    } catch {
      const message = 'Failed to load users'
      setAllUsers([])
      setUsersError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const addMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.success) {
        onMembersChange()
        toast.success('Member added')
      } else {
        toast.error(data.error || 'Failed to add member')
      }
    } catch {
      toast.error('Failed to add member')
    }
  }

  const removeMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${userId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        onMembersChange()
        toast.success('Member removed')
      } else {
        toast.error(data.error || 'Failed to remove member')
      }
    } catch {
      toast.error('Failed to remove member')
    }
  }

  const memberIds = members.map((m) => m.id)
  const filteredNonMembers = allUsers
    .filter((u) => !memberIds.includes(u.id))
    .filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Modal isOpen={open} onClose={onClose} title="Manage Members" size="sm">
      <div className="flex max-h-[65vh] flex-col">
          {/* Current members */}
          <div className="pb-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Members ({members.length})
            </h4>
            <div className="space-y-1 max-h-[160px] overflow-y-auto">
              {members.map((m) => (
                <div key={m.id} className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors">
                  <UserAvatar name={m.name} size="sm" />
                  <span className="text-sm flex-1">{m.name}</span>
                  {m.id === ownerId || m.role === 'OWNER' ? (
                    <span title="Owner"><Crown className="w-4 h-4 text-amber-400" /></span>
                  ) : (
                    <button
                      onClick={() => removeMember(m.id)}
                      aria-label={`Remove ${m.name} from project`}
                      className="p-1 rounded hover:bg-red-400/10 text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="Remove member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border/40" />

          {/* Add members */}
          <div className="py-3 flex-1 overflow-hidden flex flex-col">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Add People
            </h4>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-8 pr-3 py-2 bg-muted/20 border border-border/30 rounded-lg text-sm outline-none focus:border-primary/30 transition-colors"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {loading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  Loading...
                </div>
              ) : usersError ? (
                <p className="text-sm text-red-400/90 text-center py-4">
                  {usersError}
                </p>
              ) : filteredNonMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground/50 text-center py-4">
                  {search ? 'No users found' : 'All users are members'}
                </p>
              ) : (
                filteredNonMembers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addMember(u.id)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/30 transition-colors text-left"
                  >
                    <UserAvatar name={u.name} size="sm" />
                    <span className="text-sm flex-1">{u.name}</span>
                    <UserPlus className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </div>
      </div>
    </Modal>
  )
}
