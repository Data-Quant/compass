'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Modal } from '@/components/ui/modal'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { EmptyState } from '@/components/composed/EmptyState'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import {
  FolderKanban, Plus, Users, CheckCircle2, Search, X, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ─── Types ───────────────────────────────────────────────────────────── */

interface Project {
  id: string
  name: string
  description: string | null
  color: string | null
  status: string
  owner: { id: string; name: string }
  members: Array<{ id: string; name: string; role: string }>
  taskCount: number
  completedTasks: number
  createdAt: string
  updatedAt: string
}

interface AllUser {
  id: string
  name: string
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  COMPLETED: { label: 'Completed', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  ARCHIVED: { label: 'Archived', className: 'bg-muted text-muted-foreground' },
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
]

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function ProjectsPage() {
  const user = useLayoutUser()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newColor, setNewColor] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Member picker
  const [allUsers, setAllUsers] = useState<AllUser[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      setProjects(data.projects || [])
    } catch {
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    setUsersLoading(true)
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
      setUsersLoading(false)
    }
  }

  const openCreateModal = () => {
    setShowCreate(true)
    setNewName('')
    setNewDesc('')
    setNewColor(null)
    setSelectedMemberIds([])
    setMemberSearch('')
    setUsersError(null)
    fetchUsers()
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          description: newDesc,
          color: newColor,
          memberIds: selectedMemberIds,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Project created')
        setShowCreate(false)
        loadProjects()
      } else {
        toast.error(data.error || 'Failed to create')
      }
    } catch {
      toast.error('Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  const toggleMember = (userId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  // Filtered projects
  const filteredProjects = projects.filter((p) => {
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const filteredUsers = allUsers.filter((u) =>
    u.name.toLowerCase().includes(memberSearch.toLowerCase())
  )

  if (loading) return <LoadingScreen message="Loading projects..." />

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
            Projects
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openCreateModal} className="gap-2">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </motion.div>

      {/* Search + Filters */}
      {projects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6"
        >
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-9 pr-3 py-2 bg-muted/30 border border-border/40 rounded-lg text-sm outline-none focus:border-primary/30 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
            {['ALL', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  statusFilter === s
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s === 'ALL' ? 'All' : STATUS_BADGE[s]?.label || s}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Project grid */}
      {filteredProjects.length === 0 ? (
        projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="h-12 w-12" />}
            title="No projects yet"
            description="Create your first project to start managing tasks."
          />
        ) : (
          <EmptyState
            icon={<Search className="h-12 w-12" />}
            title="No projects match your filters"
            description="Try adjusting your search or filter criteria."
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project, i) => {
            const pct = project.taskCount > 0 ? Math.round((project.completedTasks / project.taskCount) * 100) : 0
            const badge = STATUS_BADGE[project.status] || STATUS_BADGE.ACTIVE
            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Link href={`/projects/${project.id}`}>
                  <Card className="h-full hover:border-primary/30 transition-colors cursor-pointer group relative overflow-hidden">
                    {/* Color accent */}
                    {project.color && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l"
                        style={{ backgroundColor: project.color }}
                      />
                    )}

                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate pr-2">
                          {project.name}
                        </h3>
                        <Badge variant="secondary" className={badge.className}>
                          {badge.label}
                        </Badge>
                      </div>

                      {project.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{project.description}</p>
                      )}

                      <div className="flex items-center gap-3 mb-3">
                        <Progress value={pct} className="flex-1 h-1.5" />
                        <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{project.completedTasks}/{project.taskCount} tasks</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          <span>{project.members.length}</span>
                        </div>
                      </div>

                      {/* Member avatars */}
                      <div className="flex -space-x-2 mt-3">
                        {project.members.slice(0, 4).map((m) => (
                          <UserAvatar key={m.id} name={m.name} size="xs" className="ring-2 ring-card" />
                        ))}
                        {project.members.length > 4 && (
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground ring-2 ring-card">
                            +{project.members.length - 4}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Project">
        <div className="space-y-5">
          {/* Name */}
          <div>
            <Label>Project Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Q1 Marketing Campaign"
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Brief description of the project..."
              className="mt-1"
              rows={3}
            />
          </div>

          {/* Color */}
          <div>
            <Label>Color</Label>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setNewColor(null)}
                className={cn(
                  'w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center',
                  newColor === null ? 'border-foreground scale-110' : 'border-border/50 hover:border-border'
                )}
              >
                {newColor === null && <X className="w-3 h-3" />}
              </button>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full transition-all flex items-center justify-center',
                    newColor === c ? 'scale-110 ring-2 ring-offset-2 ring-offset-background' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c, ...(newColor === c ? { ringColor: c } : {}) }}
                >
                  {newColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Members */}
          <div>
            <Label>Add Members</Label>
            <div className="mt-2 border border-border/40 rounded-lg overflow-hidden">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search people..."
                  className="w-full pl-8 pr-3 py-2 bg-transparent border-b border-border/30 text-sm outline-none"
                />
              </div>
              <div className="max-h-40 overflow-y-auto p-1">
                {usersLoading ? (
                  <p className="text-xs text-muted-foreground text-center py-3">Loading people...</p>
                ) : usersError ? (
                  <p className="text-xs text-red-400/90 text-center py-3">{usersError}</p>
                ) : filteredUsers.map((u) => {
                  const selected = selectedMemberIds.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleMember(u.id)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm hover:bg-muted/30 transition-colors text-left',
                        selected && 'bg-primary/5'
                      )}
                    >
                      <UserAvatar name={u.name} size="xs" />
                      <span className="flex-1">{u.name}</span>
                      {selected && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  )
                })}
                {!usersLoading && !usersError && filteredUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 text-center py-3">No users found</p>
                )}
              </div>
            </div>
            {selectedMemberIds.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedMemberIds.length} member{selectedMemberIds.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
