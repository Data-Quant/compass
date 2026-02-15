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
  FolderKanban,
  Plus,
  Users,
  CheckCircle2,
  Archive,
} from 'lucide-react'

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  owner: { id: string; name: string }
  members: Array<{ id: string; name: string; role: string }>
  taskCount: number
  completedTasks: number
  createdAt: string
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  COMPLETED: { label: 'Completed', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  ARCHIVED: { label: 'Archived', className: 'bg-muted text-muted-foreground' },
}

export default function ProjectsPage() {
  const user = useLayoutUser()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

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

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDesc }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Project created')
        setShowCreate(false)
        setNewName('')
        setNewDesc('')
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

  if (loading) return <LoadingScreen message="Loading projects..." />

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
            Projects
          </h1>
          <p className="text-muted-foreground mt-1">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </motion.div>

      {/* Project grid */}
      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-12 w-12" />}
          title="No projects yet"
          description="Create your first project to start managing tasks."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project, i) => {
            const pct = project.taskCount > 0 ? Math.round((project.completedTasks / project.taskCount) * 100) : 0
            const badge = STATUS_BADGE[project.status] || STATUS_BADGE.ACTIVE
            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link href={`/projects/${project.id}`}>
                  <Card className="h-full hover:border-primary/30 transition-colors cursor-pointer group">
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
        <div className="space-y-4">
          <div>
            <Label>Project Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Q1 Marketing Campaign"
              className="mt-1"
            />
          </div>
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
