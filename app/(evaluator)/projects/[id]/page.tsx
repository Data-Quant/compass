'use client'

import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import { ListView } from '@/components/projects/ListView'
import { BoardView } from '@/components/projects/BoardView'
import { TaskDetailPanel, type PanelTask, type ProjectStatusSection } from '@/components/projects/TaskDetailPanel'
import type { WorkspaceProject } from '@/components/projects/workspace-types'
import { MemberManager } from '@/components/projects/MemberManager'
import { SprintPicker, SprintReviewBanner, filterTasksBySprint, sprintStats, type ProjectSprint, type SprintFilter } from '@/components/projects/SprintPicker'
import { CompleteSprintDialog, SprintFormDialog } from '@/components/projects/SprintDialogs'
import {
  List, LayoutGrid, UserPlus, ListTodo,
  ChevronLeft, MoreHorizontal, Pencil, Archive, Trash2, Tag,
  CheckCircle2, RotateCcw, AlertTriangle, PauseCircle, Lock, ChartColumn,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { projectLoadFailure, readSharedTaskId } from '@/lib/project-task-utils'
import { calculateTaskVariance } from '@/lib/project-progress'
import { addSprintDays, pickDefaultSprint, sprintDateKey, sprintNeedsReview, todaySprintDate } from '@/lib/project-sprints'

/* ─── Types ───────────────────────────────────────────────────────────── */

interface Label { id: string; name: string; color: string }
interface Member { id: string; name: string; role: string }

interface Project {
  id: string
  name: string
  description: string | null
  color: string | null
  status: string
  priority: WorkspaceProject['priority']
  owner: { id: string; name: string }
  members: Array<{ user: { id: string; name: string }; role: string }>
  sections: ProjectStatusSection[]
  labels: Label[]
  tasks: PanelTask[]
  sprints: ProjectSprint[]
  canManage?: boolean
  canUseBacklog?: boolean
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

// useSearchParams needs a Suspense boundary or `next build` fails
export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ProjectDetail />
    </Suspense>
  )
}

function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sharedTaskId = readSharedTaskId(searchParams)
  const openedSharedTaskRef = useRef<string | null>(null)
  const viewer = useLayoutUser()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailure, setLoadFailure] = useState<ReturnType<typeof projectLoadFailure> | null>(null)
  // Board on a first visit; after that, whichever view the person last picked.
  const [view, setViewState] = useState<'list' | 'board'>('board')
  const setView = useCallback((next: 'list' | 'board') => {
    setViewState(next)
    window.localStorage.setItem('compass-project-view', next)
  }, [])
  useEffect(() => {
    const savedView = window.localStorage.getItem('compass-project-view')
    if (savedView === 'list' || savedView === 'board') setViewState(savedView)
  }, [])
  // Sprint filter per project; null until the saved choice is read, then the default applies.
  const [savedSprintFilter, setSavedSprintFilter] = useState<SprintFilter | null>(null)
  const setSprintFilter = useCallback((next: SprintFilter) => {
    setSavedSprintFilter(next)
    window.localStorage.setItem(`compass-project-sprint:${id}`, next)
  }, [id])
  useEffect(() => {
    setSavedSprintFilter(window.localStorage.getItem(`compass-project-sprint:${id}`))
  }, [id])
  const [sprintForm, setSprintForm] = useState<{ open: boolean; sprint: ProjectSprint | null }>({ open: false, sprint: null })
  const [completeSprintId, setCompleteSprintId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<PanelTask | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [memberModalOpen, setMemberModalOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [savingDescription, setSavingDescription] = useState(false)

  // Label management
  const [showLabelInput, setShowLabelInput] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0])

  // Keep ?task= in the URL so the open task can be shared
  const setTaskParam = useCallback((taskId: string | null) => {
    router.replace(taskId ? `/projects/${id}?task=${encodeURIComponent(taskId)}` : `/projects/${id}`, { scroll: false })
  }, [router, id])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setSelectedTask(null)
    setTaskParam(null)
  }, [setTaskParam])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && panelOpen) {
        closePanel()
      }
      // Switch views with number keys (when not in an input)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '1') setView('list')
      if (e.key === '2') setView('board')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [panelOpen, closePanel, setView])

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (!res.ok) setLoadFailure(projectLoadFailure(res.status))
      const data = await res.json()
      if (data.project) {
        setLoadFailure(null)
        setProject(data.project)
        setSelectedTask((current) => {
          if (!current) return current
          return data.project.tasks.find((task: PanelTask) => task.id === current.id) || current
        })
      }
    } catch {
      toast.error('Failed to load project')
      setLoadFailure((current) => current ?? 'error')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadProject() }, [loadProject])

  // Open the task from a shared link once per ?task= value
  useEffect(() => {
    if (!project || !sharedTaskId || openedSharedTaskRef.current === sharedTaskId) return
    openedSharedTaskRef.current = sharedTaskId
    const task = project.tasks.find((t) => t.id === sharedTaskId)
    if (!task) {
      toast.error('That task no longer exists or you do not have access to it')
      setTaskParam(null)
      return
    }
    setSelectedTask(task)
    setPanelOpen(true)
  }, [project, sharedTaskId, setTaskParam])

  useEffect(() => {
    if (!editingDescription) setDescriptionDraft(project?.description || '')
  }, [editingDescription, project?.description])

  const handleTaskClick = (task: PanelTask) => {
    setSelectedTask(task)
    setPanelOpen(true)
    setTaskParam(task.id)
  }

  const handleTaskUpdate = (updatedTask: PanelTask) => {
    setSelectedTask(updatedTask)
  }

  const handleTaskDelete = (taskId: string) => {
    closePanel()
  }

  const handleOpenTaskById = (taskId: string) => {
    const nextTask = project?.tasks.find((task) => task.id === taskId)
    if (!nextTask) return
    setSelectedTask(nextTask)
    setPanelOpen(true)
    setTaskParam(nextTask.id)
  }

  const handleDeleteProject = async () => {
    if (!window.confirm('Delete this project and all of its tasks? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete project')
      toast.success('Project deleted')
      router.push('/projects')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete project')
    }
  }

  const handleArchiveProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: project?.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update project')
      loadProject()
      toast.success(project?.status === 'ARCHIVED' ? 'Project restored' : 'Project archived')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update project')
    }
  }

  const handleToggleComplete = async () => {
    const nextStatus = project?.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED'
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update project')
      loadProject()
      toast.success(nextStatus === 'COMPLETED' ? 'Project marked complete' : 'Project reopened')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update project')
    }
  }

  const handleToggleOnHold = async () => {
    const nextStatus = project?.status === 'ON_HOLD' ? 'ACTIVE' : 'ON_HOLD'
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update project')
      await loadProject()
      toast.success(nextStatus === 'ON_HOLD' ? 'Project put on hold' : 'Project resumed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update project')
    }
  }

  const startDescriptionEdit = () => {
    setDescriptionDraft(project?.description || '')
    setEditingDescription(true)
  }

  const cancelDescriptionEdit = () => {
    setDescriptionDraft(project?.description || '')
    setEditingDescription(false)
  }

  const saveDescription = async () => {
    if (!project || savingDescription) return
    setSavingDescription(true)
    try {
      const description = descriptionDraft.trim()
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update project description')
      const savedDescription = data.project?.description ?? (description || null)
      setProject((current) => current ? { ...current, description: savedDescription } : current)
      setDescriptionDraft(savedDescription || '')
      setEditingDescription(false)
      toast.success('Project description updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update project description')
    } finally {
      setSavingDescription(false)
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
  if (!project) {
    const copy = {
      forbidden: { icon: <Lock className="h-12 w-12" />, title: "You don't have access to this project", description: 'Ask a project lead to add you, then open the link again.' },
      not_found: { icon: <ListTodo className="h-12 w-12" />, title: 'Project not found', description: 'It may have been deleted, or the link is incomplete.' },
      error: { icon: <ListTodo className="h-12 w-12" />, title: "Couldn't load this project", description: 'Check your connection and try again.' },
    }[loadFailure ?? 'not_found']
    return (
      <EmptyState
        icon={copy.icon}
        title={copy.title}
        description={copy.description}
        action={
          <div className="flex items-center gap-2">
            {loadFailure === 'error' && (
              <Button variant="outline" size="sm" onClick={() => { setLoading(true); loadProject() }}>Try again</Button>
            )}
            <Button size="sm" asChild><Link href="/projects">Back to Projects</Link></Button>
          </div>
        }
      />
    )
  }

  const members = project.members.map((m) => ({ ...m.user, role: m.role }))
  const canManage = project.canManage ?? (
    viewer?.role === 'HR' ||
    project.owner.id === viewer?.id ||
    members.some((member) => member.id === viewer?.id && ['OWNER', 'LEAD'].includes(member.role))
  )
  const canUseBacklog = project.canUseBacklog !== false
  const sprints = project.sprints || []
  const sprintFilter: SprintFilter = savedSprintFilter === 'all' || savedSprintFilter === 'none'
    || sprints.some((sprint) => sprint.id === savedSprintFilter)
    ? savedSprintFilter as SprintFilter
    : pickDefaultSprint(sprints)?.id || 'all'
  const selectedSprint = sprints.find((sprint) => sprint.id === sprintFilter) || null
  const sprintTasks = filterTasksBySprint(project.tasks, sprintFilter)
  // Managers' new tasks land in the sprint they are looking at, unless it is already completed.
  const newTaskSprintId = canManage && selectedSprint && !selectedSprint.completedAt ? selectedSprint.id : null
  const reviewSprints = sprints.filter((sprint) => sprintNeedsReview(sprint))
  const completeSprint = sprints.find((sprint) => sprint.id === completeSprintId) || null
  const lastSprintEnd = sprints.reduce<string | null>((latest, sprint) =>
    !latest || sprintDateKey(sprint.endDate) > sprintDateKey(latest) ? sprint.endDate : latest, null)
  const today = todaySprintDate()
  const nextSprintStart = lastSprintEnd && sprintDateKey(addSprintDays(lastSprintEnd, 1)) > sprintDateKey(today)
    ? addSprintDays(lastSprintEnd, 1)
    : today
  const visibleSections = canUseBacklog
    ? project.sections
    : project.sections.filter((section) => !section.isBacklog)
  const workspaceSections = visibleSections.map((section) => ({
    ...section,
    isBacklog: Boolean(section.isBacklog),
  }))
  const workspaceProject: WorkspaceProject = {
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    status: project.status,
    priority: project.priority,
    owner: project.owner,
    members,
    canManage,
    canUseBacklog,
    sections: workspaceSections,
    labels: project.labels,
    tasks: sprintTasks.map((task) => ({
      ...task,
      completedLate: Boolean(task.completedLate),
      parentTaskId: task.parentTaskId || null,
      section: workspaceSections.find((section) => section.id === task.sectionId) || null,
    })),
  }
  const statusCounts = visibleSections.map((section) => ({
    section,
    count: project.tasks.filter((task) => task.sectionId === section.id).length,
  }))
  const activeTasks = project.tasks.filter((task) => !task.section?.isBacklog)
  const completedTasks = activeTasks.filter((task) => task.status === 'DONE')
  const overdueTasks = activeTasks.filter((task) => calculateTaskVariance({
    status: task.status,
    dueDate: task.dueDate,
    section: { isBacklog: Boolean(task.section?.isBacklog) },
  }).isOverdue)
  const progressPercent = activeTasks.length > 0
    ? Math.round((completedTasks.length / activeTasks.length) * 100)
    : 0
  const progressColor = progressPercent === 100
    ? '#22c55e'
    : progressPercent >= 67
      ? '#3b82f6'
      : progressPercent >= 34
        ? '#f59e0b'
        : '#ef4444'

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {project.color && (
              <span className="w-3 h-10 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
                  {project.name}
                </h1>
                {project.status !== 'ACTIVE' && (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      project.status === 'COMPLETED'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : project.status === 'ON_HOLD'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {project.status === 'COMPLETED'
                      ? 'Completed'
                      : project.status === 'ON_HOLD'
                        ? 'On hold'
                        : 'Archived'}
                  </span>
                )}
              </div>
              {editingDescription && canManage ? (
                <div className="mt-2 max-w-2xl space-y-2">
                  <textarea
                    autoFocus
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                        event.preventDefault()
                        void saveDescription()
                      }
                      if (event.key === 'Escape') cancelDescriptionEdit()
                    }}
                    maxLength={2000}
                    rows={3}
                    aria-label="Project description"
                    placeholder="Describe the project’s purpose, scope, or outcome..."
                    disabled={savingDescription}
                    className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-muted-foreground">Ctrl/⌘ + Enter to save</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelDescriptionEdit}
                        disabled={savingDescription}
                        className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveDescription()}
                        disabled={savingDescription}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {savingDescription ? 'Saving...' : 'Save description'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : canManage ? (
                <button
                  type="button"
                  onClick={startDescriptionEdit}
                  className="group/description mt-1 flex max-w-2xl items-start gap-1.5 rounded-md text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="whitespace-pre-wrap break-words">
                    {project.description || 'Add a project description'}
                  </span>
                  <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover/description:opacity-70 group-focus-visible/description:opacity-70" />
                </button>
              ) : project.description ? (
                <p className="mt-1 max-w-2xl whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {project.description}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canManage && (
              <Button variant="outline" size="sm" className="px-2 sm:px-3" asChild>
                <Link href={`/projects/${id}/analytics`} title="Visible to this project's leads and HR only">
                  <ChartColumn aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Analytics</span>
                </Link>
              </Button>
            )}
            {/* Members */}
            <button
              onClick={() => canManage && setMemberModalOpen(true)}
              disabled={!canManage}
              aria-label={canManage ? 'Manage project members' : 'Project members'}
              title={canManage ? 'Manage project members' : 'Project members'}
              className="flex items-center -space-x-1.5 hover:opacity-80 transition-opacity disabled:cursor-default"
            >
              {members.slice(0, 4).map((m) => (
                <UserAvatar key={m.id} name={m.name} size="xs" className="ring-2 ring-background" />
              ))}
              {members.length > 4 && (
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium ring-2 ring-background">
                  +{members.length - 4}
                </span>
              )}
              {canManage && (
                <span className="ml-2 p-1 rounded-full bg-muted/50 hover:bg-muted transition-colors">
                  <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
                </span>
              )}
            </button>

            {/* Settings menu */}
            {canManage && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  aria-label="Project actions"
                  aria-expanded={showMenu}
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
                      {project.status !== 'ARCHIVED' && (
                        <>
                          <button
                            onClick={handleToggleComplete}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors"
                          >
                            {project.status === 'COMPLETED' ? (
                              <>
                                <RotateCcw className="w-4 h-4" />
                                Reopen project
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                Mark complete
                              </>
                            )}
                          </button>
                          <button
                            onClick={handleToggleOnHold}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors"
                          >
                            {project.status === 'ON_HOLD' ? (
                              <>
                                <RotateCcw className="w-4 h-4" />
                                Resume project
                              </>
                            ) : (
                              <>
                                <PauseCircle className="w-4 h-4" />
                                Put on hold
                              </>
                            )}
                          </button>
                        </>
                      )}
                      <button
                        onClick={startDescriptionEdit}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit description
                      </button>
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
            )}
          </div>
        </div>

        {/* Stats + Labels row */}
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <div className="min-w-[220px] max-w-sm flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="font-medium tabular-nums text-foreground">
                {activeTasks.length === 0 ? 'No tasks yet' : (
                  <>
                    {completedTasks.length} of {activeTasks.length}
                    <span className="ml-1.5 font-normal text-muted-foreground">{progressPercent}%</span>
                  </>
                )}
              </span>
              {overdueTasks.length > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-red-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {overdueTasks.length} overdue
                </span>
              )}
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted/60"
              role="progressbar"
              aria-label="Project progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${progressPercent}%`, backgroundColor: progressColor }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {statusCounts.map(({ section, count }) => (
              <span key={section.id} style={{ color: section.color }}>
                {count} {section.name.toLowerCase()}
              </span>
            ))}
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
                {canManage && (
                  <button
                    onClick={() => handleDeleteLabel(l.id)}
                    aria-label={`Delete ${l.name} label`}
                    className="inline-flex h-3 w-3 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {canManage && (
              showLabelInput ? (
                <div className="flex items-center gap-1">
                  <div className="flex gap-0.5">
                    {LABEL_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewLabelColor(c)}
                        aria-label={`Use ${c} for the new label`}
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
              )
            )}
          </div>
        </div>
      </motion.div>

      {/* View Toggle + Sprint */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit">
          <button
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
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
            aria-pressed={view === 'board'}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              view === 'board' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Board
          </button>
        </div>
        {(sprints.length > 0 || canManage) && (
          <SprintPicker
            sprints={sprints}
            tasks={project.tasks}
            value={sprintFilter}
            totalTaskCount={project.tasks.length}
            canManage={canManage}
            onChange={setSprintFilter}
            onNewSprint={() => setSprintForm({ open: true, sprint: null })}
            onEditSprint={(sprint) => setSprintForm({ open: true, sprint })}
          />
        )}
      </div>

      {reviewSprints.map((sprint) => (
        <SprintReviewBanner
          key={sprint.id}
          sprint={sprint}
          unfinished={sprintStats(project.tasks, sprint.id).unfinished}
          canManage={canManage}
          onReview={() => setCompleteSprintId(sprint.id)}
        />
      ))}

      {/* View Content */}
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {view === 'list' ? (
          <ListView
            project={workspaceProject}
            viewerId={viewer?.id || ''}
            newTaskSprintId={newTaskSprintId}
            onTaskClick={handleTaskClick}
            onTasksChange={loadProject}
          />
        ) : (
          <BoardView
            projectId={id}
            tasks={sprintTasks}
            sections={visibleSections}
            viewerId={viewer?.id || ''}
            canManage={canManage}
            newTaskSprintId={newTaskSprintId}
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
        sections={visibleSections}
        labels={project.labels}
        sprints={sprints}
        open={panelOpen}
        onClose={closePanel}
        onTaskUpdate={handleTaskUpdate}
        onTaskDelete={handleTaskDelete}
        onTasksChange={loadProject}
        onOpenTask={handleOpenTaskById}
        canManage={canManage}
        canEdit={canManage
          || selectedTask?.assigneeId === viewer?.id
          || Boolean(selectedTask?.assistants?.some((assistant) => assistant.user.id === viewer?.id))}
      />

      {canManage && (
        <SprintFormDialog
          open={sprintForm.open}
          onOpenChange={(open) => setSprintForm((current) => ({ ...current, open }))}
          projectId={id}
          sprint={sprintForm.sprint}
          sprintTaskCount={sprintForm.sprint ? project.tasks.filter((task) => task.sprintId === sprintForm.sprint?.id).length : 0}
          suggestedName={`Sprint ${sprints.length + 1}`}
          suggestedStart={nextSprintStart}
          onSaved={async (sprintId) => {
            setSprintFilter(sprintId)
            await loadProject()
          }}
          onDeleted={loadProject}
        />
      )}
      {canManage && completeSprint && (
        <CompleteSprintDialog
          open={Boolean(completeSprintId)}
          onOpenChange={(open) => { if (!open) setCompleteSprintId(null) }}
          projectId={id}
          sprint={completeSprint}
          sprints={sprints}
          stats={sprintStats(project.tasks, completeSprint.id)}
          unfinishedTasks={project.tasks.filter((task) =>
            task.sprintId === completeSprint.id && task.status !== 'DONE' && !task.section?.isBacklog)}
          onCompleted={loadProject}
        />
      )}

      {/* Member Manager Modal */}
      {canManage && (
        <MemberManager
          projectId={id}
          members={members}
          ownerId={project.owner.id}
          open={memberModalOpen}
          onClose={() => setMemberModalOpen(false)}
          onMembersChange={loadProject}
        />
      )}
    </div>
  )
}
