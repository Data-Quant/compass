'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import { ListView } from '@/components/projects/ListView'
import { BoardView } from '@/components/projects/BoardView'
import { TaskDetailPanel, type PanelTask } from '@/components/projects/TaskDetailPanel'
import { MemberManager } from '@/components/projects/MemberManager'
import {
  List, LayoutGrid, UserPlus, Settings, ListTodo,
  ChevronLeft, MoreHorizontal, Pencil, Archive, Trash2, Tag, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ─── Types ───────────────────────────────────────────────────────────── */

interface Section { id: string; name: string; orderIndex: number }
interface Label { id: string; name: string; color: string }
interface Member { id: string; name: string; role: string }

interface Project {
  id: string
  name: string
  description: string | null
  color: string | null
  status: string
  owner: { id: string; name: string }
  members: Array<{ user: { id: string; name: string }; role: string }>
  sections: Section[]
  labels: Label[]
  tasks: PanelTask[]
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
]

const LABEL_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
]

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const user = useLayoutUser()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'board'>('list')
  const [selectedTask, setSelectedTask] = useState<PanelTask | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [memberModalOpen, setMemberModalOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  // Label management
  const [showLabelInput, setShowLabelInput] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && panelOpen) {
        setPanelOpen(false)
        setSelectedTask(null)
      }
      // Switch views with number keys (when not in an input)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '1') setView('list')
      if (e.key === '2') setView('board')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [panelOpen])

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`)
      const data = await res.json()
      if (data.project) setProject(data.project)
    } catch {
      toast.error('Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadProject() }, [loadProject])

  const handleTaskClick = (task: PanelTask) => {
    setSelectedTask(task)
    setPanelOpen(true)
  }

  const handleTaskUpdate = (updatedTask: PanelTask) => {
    setSelectedTask(updatedTask)
    loadProject()
  }

  const handleTaskDelete = (taskId: string) => {
    setPanelOpen(false)
    setSelectedTask(null)
    loadProject()
  }

  const handleDeleteProject = async () => {
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      toast.success('Project deleted')
      router.push('/projects')
    } catch {
      toast.error('Failed to delete project')
    }
  }

  const handleArchiveProject = async () => {
    try {
      await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: project?.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' }),
      })
      loadProject()
      toast.success(project?.status === 'ARCHIVED' ? 'Project restored' : 'Project archived')
    } catch {
      toast.error('Failed to update project')
    }
  }

  const handleAddLabel = async () => {
    if (!newLabelName.trim()) { setShowLabelInput(false); return }
    try {
      const res = await fetch(`/api/projects/${id}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newLabelName.trim(), color: newLabelColor }),
      })
      const data = await res.json()
      if (data.success) {
        loadProject()
        setNewLabelName('')
        setShowLabelInput(false)
      } else {
        toast.error(data.error || 'Failed to create label')
      }
    } catch {
      toast.error('Failed to create label')
    }
  }

  const handleDeleteLabel = async (labelId: string) => {
    try {
      await fetch(`/api/projects/${id}/labels?labelId=${labelId}`, { method: 'DELETE' })
      loadProject()
    } catch {
      toast.error('Failed to delete label')
    }
  }

  if (loading) return <LoadingScreen message="Loading project..." />
  if (!project) return <EmptyState icon={<ListTodo className="h-12 w-12" />} title="Project not found" />

  const members = project.members.map((m) => ({ ...m.user, role: m.role }))
  const todoCount = project.tasks.filter((t) => t.status === 'TODO').length
  const inProgressCount = project.tasks.filter((t) => t.status === 'IN_PROGRESS').length
  const doneCount = project.tasks.filter((t) => t.status === 'DONE').length

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push('/projects')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Projects
      </button>

      {/* Project Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {project.color && (
              <span className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
            )}
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{project.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Members */}
            <button
              onClick={() => setMemberModalOpen(true)}
              className="flex items-center -space-x-1.5 hover:opacity-80 transition-opacity"
            >
              {members.slice(0, 4).map((m) => (
                <UserAvatar key={m.id} name={m.name} size="xs" className="ring-2 ring-background" />
              ))}
              {members.length > 4 && (
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium ring-2 ring-background">
                  +{members.length - 4}
                </span>
              )}
              <span className="ml-2 p-1 rounded-full bg-muted/50 hover:bg-muted transition-colors">
                <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
              </span>
            </button>

            {/* Settings menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border/60 bg-card shadow-xl"
                    onClick={() => setShowMenu(false)}
                  >
                    <div className="p-1">
                      <button
                        onClick={handleArchiveProject}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors"
                      >
                        <Archive className="w-4 h-4" />
                        {project.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
                      </button>
                      <button
                        onClick={handleDeleteProject}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete project
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Stats + Labels row */}
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{todoCount} to do</span>
            <span className="text-blue-400">{inProgressCount} in progress</span>
            <span className="text-emerald-400">{doneCount} done</span>
          </div>

          <div className="flex-1" />

          {/* Labels */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {project.labels.map((l) => (
              <span
                key={l.id}
                className="group relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium cursor-default"
                style={{ backgroundColor: l.color + '20', color: l.color }}
              >
                {l.name}
                <button
                  onClick={() => handleDeleteLabel(l.id)}
                  className="hidden group-hover:inline-flex w-3 h-3 items-center justify-center rounded-full hover:bg-black/10"
                >
                  ×
                </button>
              </span>
            ))}
            {showLabelInput ? (
              <div className="flex items-center gap-1">
                <div className="flex gap-0.5">
                  {LABEL_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewLabelColor(c)}
                      className={cn(
                        'w-4 h-4 rounded-full transition-transform',
                        newLabelColor === c && 'scale-125 ring-2 ring-white/30'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <input
                  autoFocus
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddLabel()
                    if (e.key === 'Escape') { setShowLabelInput(false); setNewLabelName('') }
                  }}
                  onBlur={handleAddLabel}
                  placeholder="Label name"
                  className="w-20 bg-transparent border-b border-primary/40 outline-none text-[10px] py-0.5"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowLabelInput(true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                <Tag className="w-3 h-3" />
                Label
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* View Toggle */}
      <div className="flex items-center gap-1 mb-4 p-1 bg-muted/50 rounded-lg w-fit">
        <button
          onClick={() => setView('list')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            view === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <List className="w-3.5 h-3.5" />
          List
        </button>
        <button
          onClick={() => setView('board')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            view === 'board' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Board
        </button>
      </div>

      {/* View Content */}
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {view === 'list' ? (
          <ListView
            projectId={id}
            tasks={project.tasks}
            sections={project.sections}
            onTaskClick={handleTaskClick}
            onTasksChange={loadProject}
          />
        ) : (
          <BoardView
            projectId={id}
            tasks={project.tasks}
            onTaskClick={handleTaskClick}
            onTasksChange={loadProject}
          />
        )}
      </motion.div>

      {/* Task Detail Panel */}
      <TaskDetailPanel
        task={selectedTask}
        projectId={id}
        members={members}
        sections={project.sections}
        labels={project.labels}
        open={panelOpen}
        onClose={() => { setPanelOpen(false); setSelectedTask(null) }}
        onTaskUpdate={handleTaskUpdate}
        onTaskDelete={handleTaskDelete}
      />

      {/* Member Manager Modal */}
      <MemberManager
        projectId={id}
        members={members}
        ownerId={project.owner.id}
        open={memberModalOpen}
        onClose={() => setMemberModalOpen(false)}
        onMembersChange={loadProject}
      />
    </div>
  )
}
