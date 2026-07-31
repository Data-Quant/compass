'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Columns3,
  FolderKanban,
  LayoutList,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/composed/EmptyState'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { TaskDetailPanel } from './TaskDetailPanel'
import { ProjectCreationModal } from './ProjectCreationModal'
import { WorkspaceBulkActions } from './WorkspaceBulkActions'
import { WorkspaceKanban } from './WorkspaceKanban'
import { WorkspaceTaskTable } from './WorkspaceTaskTable'
import type {
  AssigneeFilter,
  KanbanColumnId,
  ProjectsWorkspaceResponse,
  ProjectStatusFilter,
  SortDirection,
  TaskOptimisticPatch,
  TaskPatchRequest,
  WorkspaceBulkAction,
  WorkspaceProject,
  WorkspaceProjectView,
  WorkspaceSortKey,
  WorkspaceTask,
  WorkspaceView,
} from './workspace-types'
import {
  calculateProgress,
  dateInputValue,
  isBacklogTask,
  isTaskOverdue,
  normalizeAssigneeFilter,
  projectMatchesStatus,
  sectionForColumn,
  shiftDate,
  taskMatchesAssignee,
  taskMatchesSearch,
} from './workspace-utils'

const STATUS_OPTIONS: Array<{ value: ProjectStatusFilter; label: string }> = [
  { value: 'CURRENT', label: 'Current projects' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'ALL', label: 'All statuses' },
]

interface PromotionState {
  projectId: string
  taskId: string
  column: KanbanColumnId
  assigneeId: string
  dueDate: string
}

interface CreateProjectInput {
  name: string
  description: string
  color: string | null
  memberIds: string[]
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function errorMessage(data: Record<string, unknown>, fallback: string) {
  return typeof data.error === 'string' && data.error ? data.error : fallback
}

function normalizeTask(
  project: Pick<WorkspaceProject, 'sections'>,
  task: Partial<WorkspaceTask>,
  fallback?: WorkspaceTask,
): WorkspaceTask {
  const merged = { ...fallback, ...task } as WorkspaceTask
  const section = project.sections.find((candidate) => candidate.id === merged.sectionId)
    || (merged.section ? {
      ...merged.section,
      isBacklog: Boolean(merged.section.isBacklog),
    } : null)

  return {
    ...merged,
    completedLate: Boolean(merged.completedLate),
    section,
    labelAssignments: merged.labelAssignments || [],
    assistants: merged.assistants || [],
    childTasks: merged.childTasks || [],
    _count: merged._count || { comments: 0 },
  }
}

function normalizeProject(project: WorkspaceProject): WorkspaceProject {
  const sections = (project.sections || []).map((section) => ({
    ...section,
    isBacklog: Boolean(section.isBacklog),
  }))
  const base = {
    ...project,
    description: project.description || null,
    color: project.color || null,
    members: project.members || [],
    labels: project.labels || [],
    sections,
    canManage: Boolean(project.canManage),
  }
  return {
    ...base,
    tasks: (project.tasks || []).map((task) => normalizeTask(base, task)),
  }
}

function updateProjectTask(
  workspace: ProjectsWorkspaceResponse,
  projectId: string,
  taskId: string,
  update: (task: WorkspaceTask, project: WorkspaceProject) => WorkspaceTask,
  projectStatus?: unknown,
) {
  return {
    ...workspace,
    projects: workspace.projects.map((project) => project.id !== projectId ? project : {
      ...project,
      ...(typeof projectStatus === 'string' ? { status: projectStatus } : {}),
      tasks: project.tasks.map((task) => task.id === taskId ? update(task, project) : task),
    }),
  }
}

export function ProjectsWorkspace() {
  const [workspace, setWorkspace] = useState<ProjectsWorkspaceResponse | null>(null)
  const workspaceRef = useRef<ProjectsWorkspaceResponse | null>(null)
  const filterInitializedRef = useRef(false)
  const pendingTaskRef = useRef(new Set<string>())

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('ME')
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('CURRENT')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<WorkspaceView>('table')
  const [sortKey, setSortKey] = useState<WorkspaceSortKey>('priority')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [collapsedProjectIds, setCollapsedProjectIds] = useState(new Set<string>())
  const [backlogCollapsed, setBacklogCollapsed] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set<string>())
  const [pendingTaskIds, setPendingTaskIds] = useState(new Set<string>())
  const [quickAddProjectId, setQuickAddProjectId] = useState('')
  const [quickAdding, setQuickAdding] = useState(false)
  const [bulkApplying, setBulkApplying] = useState(false)

  const [selectedTaskKey, setSelectedTaskKey] = useState<{ projectId: string; taskId: string } | null>(null)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [renameProject, setRenameProject] = useState<WorkspaceProject | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [archiveProject, setArchiveProject] = useState<WorkspaceProject | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [promotion, setPromotion] = useState<PromotionState | null>(null)
  const [promoting, setPromoting] = useState(false)

  const commitWorkspace = (update: (current: ProjectsWorkspaceResponse) => ProjectsWorkspaceResponse) => {
    setWorkspace((current) => {
      if (!current) return current
      const next = update(current)
      workspaceRef.current = next
      return next
    })
  }

  const loadWorkspace = async (initial = false) => {
    if (initial) setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch('/api/projects/workspace', { cache: 'no-store' })
      const data = await responseJson(response)
      if (!response.ok) throw new Error(errorMessage(data, 'Failed to load the project workspace'))

      const raw = data as unknown as ProjectsWorkspaceResponse
      const next: ProjectsWorkspaceResponse = {
        viewer: raw.viewer,
        preference: raw.preference || { assigneeFilter: 'ME' },
        people: raw.people || [],
        projects: (raw.projects || []).map(normalizeProject),
      }
      workspaceRef.current = next
      setWorkspace(next)

      if (!filterInitializedRef.current) {
        setAssigneeFilter(normalizeAssigneeFilter(
          next.preference.assigneeFilter,
          next.viewer.id,
          next.people,
        ))
        filterInitializedRef.current = true
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load the project workspace'
      setLoadError(message)
      if (!workspaceRef.current) toast.error(message)
    } finally {
      if (initial) setLoading(false)
    }
  }

  useEffect(() => {
    const savedView = window.localStorage.getItem('compass-project-workspace-view')
    if (savedView === 'table' || savedView === 'kanban') setView(savedView)
    void loadWorkspace(true)
    // The workspace load is intentionally mount-only. Subsequent refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const quickAddProjects = useMemo(
    () => (workspace?.projects || []).filter((project) => project.status !== 'ARCHIVED'),
    [workspace],
  )

  useEffect(() => {
    if (quickAddProjects.length === 0) {
      setQuickAddProjectId('')
      return
    }
    if (!quickAddProjects.some((project) => project.id === quickAddProjectId)) {
      setQuickAddProjectId(quickAddProjects[0].id)
    }
  }, [quickAddProjectId, quickAddProjects])

  const projectViews = useMemo<WorkspaceProjectView[]>(() => {
    if (!workspace) return []
    return workspace.projects.flatMap((project) => {
      if (!projectMatchesStatus(project, statusFilter)) return []

      const scopedTasks = project.tasks.filter((task) => taskMatchesAssignee(task, assigneeFilter, workspace.viewer.id))
      const searchedTasks = scopedTasks.filter((task) => taskMatchesSearch(task, search))
      const hasSearch = Boolean(search.trim())
      const canShowSetupProject = project.canManage && project.tasks.length === 0
      const shouldShow = hasSearch
        ? searchedTasks.length > 0
        : assigneeFilter === 'ALL' || scopedTasks.length > 0 || canShowSetupProject
      if (!shouldShow) return []

      return [{
        project,
        scopedTasks,
        visibleActiveTasks: searchedTasks.filter((task) => !isBacklogTask(project, task)),
        visibleBacklogTasks: searchedTasks.filter((task) => isBacklogTask(project, task)),
        progress: calculateProgress(project, scopedTasks),
      }]
    })
  }, [assigneeFilter, search, statusFilter, workspace])

  const visibleTaskIds = useMemo(
    () => new Set(projectViews.flatMap(({ visibleActiveTasks, visibleBacklogTasks }) => (
      [...visibleActiveTasks, ...visibleBacklogTasks].map((task) => task.id)
    ))),
    [projectViews],
  )

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visibleTaskIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [visibleTaskIds])

  const selectedItems = useMemo(() => {
    if (!workspace) return []
    return workspace.projects.flatMap((project) => project.tasks
      .filter((task) => selectedIds.has(task.id))
      .map((task) => ({ project, task })))
  }, [selectedIds, workspace])

  const selectedProject = selectedTaskKey
    ? workspace?.projects.find((project) => project.id === selectedTaskKey.projectId) || null
    : null
  const selectedTask = selectedTaskKey && selectedProject
    ? selectedProject.tasks.find((task) => task.id === selectedTaskKey.taskId) || null
    : null

  const promotionProject = promotion
    ? workspace?.projects.find((project) => project.id === promotion.projectId) || null
    : null
  const promotionTask = promotion && promotionProject
    ? promotionProject.tasks.find((task) => task.id === promotion.taskId) || null
    : null
  const promotionPeople = promotionProject
    ? [promotionProject.owner, ...promotionProject.members]
      .filter((person, index, list) => list.findIndex((candidate) => candidate.id === person.id) === index)
    : []

  const progressScopeLabel = useMemo(() => {
    if (!workspace || assigneeFilter === 'ALL') return 'Overall'
    if (assigneeFilter === 'ME') return 'Your tasks'
    const person = workspace.people.find((candidate) => candidate.id === assigneeFilter)
    return person ? `${person.name}'s tasks` : 'Your tasks'
  }, [assigneeFilter, workspace])

  const changeAssigneeFilter = async (next: string) => {
    if (!workspace) return
    const normalized = normalizeAssigneeFilter(next, workspace.viewer.id, workspace.people)
    const previous = assigneeFilter
    setAssigneeFilter(normalized)
    try {
      const response = await fetch('/api/projects/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeFilter: normalized }),
      })
      const data = await responseJson(response)
      if (!response.ok) throw new Error(errorMessage(data, 'Could not save your task view'))
      commitWorkspace((current) => ({
        ...current,
        preference: { assigneeFilter: normalized },
      }))
    } catch (error) {
      setAssigneeFilter(previous)
      toast.error(error instanceof Error ? error.message : 'Could not save your task view')
    }
  }

  const setPending = (taskId: string, pending: boolean) => {
    if (pending) pendingTaskRef.current.add(taskId)
    else pendingTaskRef.current.delete(taskId)
    setPendingTaskIds(new Set(pendingTaskRef.current))
  }

  const patchTask = async (
    projectId: string,
    taskId: string,
    request: TaskPatchRequest,
    optimistic: TaskOptimisticPatch,
  ) => {
    if (pendingTaskRef.current.has(taskId)) return false
    const current = workspaceRef.current
    const project = current?.projects.find((candidate) => candidate.id === projectId)
    const previous = project?.tasks.find((candidate) => candidate.id === taskId)
    if (!current || !project || !previous) return false
    if (!project.canManage && previous.assigneeId !== current.viewer.id) {
      toast.error('Only the assignee, project lead, or HR admin can edit this task')
      return false
    }

    setPending(taskId, true)
    commitWorkspace((value) => updateProjectTask(value, projectId, taskId, (task) => normalizeTask(project, {
      ...task,
      ...optimistic,
    }, task)))

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, ...request }),
      })
      const data = await responseJson(response)
      if (!response.ok || data.success !== true) {
        throw new Error(errorMessage(data, 'Failed to update the task'))
      }
      commitWorkspace((value) => updateProjectTask(value, projectId, taskId, (task, latestProject) => (
        normalizeTask(latestProject, data.task as Partial<WorkspaceTask>, task)
      ), data.projectStatus))
      return true
    } catch (error) {
      commitWorkspace((value) => updateProjectTask(value, projectId, taskId, () => previous))
      toast.error(error instanceof Error ? error.message : 'Failed to update the task')
      return false
    } finally {
      setPending(taskId, false)
    }
  }

  const quickAdd = async (title: string) => {
    const project = workspaceRef.current?.projects.find((candidate) => candidate.id === quickAddProjectId)
    if (!project) return false
    const backlogSection = sectionForColumn(project, 'BACKLOG')
    if (!backlogSection) {
      toast.error(`${project.name} does not have a Backlog section`)
      return false
    }

    setQuickAdding(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          sectionId: backlogSection.id,
          priority: 'MEDIUM',
          ...(!project.canManage ? { assigneeId: workspaceRef.current?.viewer.id } : {}),
        }),
      })
      const data = await responseJson(response)
      if (!response.ok || data.success !== true) {
        throw new Error(errorMessage(data, 'Failed to add the backlog task'))
      }
      commitWorkspace((current) => ({
        ...current,
        projects: current.projects.map((candidate) => candidate.id !== project.id ? candidate : {
          ...candidate,
          ...(typeof data.projectStatus === 'string' ? { status: data.projectStatus } : {}),
          tasks: [normalizeTask(candidate, data.task as Partial<WorkspaceTask>), ...candidate.tasks],
        }),
      }))
      toast.success('Added to backlog')
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add the backlog task')
      return false
    } finally {
      setQuickAdding(false)
    }
  }

  const applyBulkAction = async (action: WorkspaceBulkAction) => {
    if (selectedItems.length === 0) return false
    const taskIds = selectedItems.map(({ task }) => task.id)
    const before = new Map(selectedItems.map(({ task }) => [task.id, task]))
    setBulkApplying(true)

    commitWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) => ({
        ...project,
        tasks: project.tasks.map((task) => {
          if (!selectedIds.has(task.id)) return task
          if (action.action === 'PRIORITY') return { ...task, priority: action.priority }
          if (action.action === 'SHIFT_DUE_DATE') {
            return task.dueDate ? { ...task, dueDate: shiftDate(task.dueDate, action.days) } : task
          }
          const person = action.assigneeId
            ? [project.owner, ...project.members].find((candidate) => candidate.id === action.assigneeId) || null
            : null
          return { ...task, assigneeId: action.assigneeId, assignee: person }
        }),
      })),
    }))

    try {
      const response = await fetch('/api/projects/tasks/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds, ...action }),
      })
      const data = await responseJson(response)
      if (!response.ok || data.success !== true) {
        throw new Error(errorMessage(data, 'Failed to update the selected tasks'))
      }

      const returnedTasks = Array.isArray(data.tasks) ? data.tasks as Partial<WorkspaceTask>[] : []
      if (returnedTasks.length > 0) {
        const byId = new Map(returnedTasks.map((task) => [task.id, task]))
        commitWorkspace((current) => ({
          ...current,
          projects: current.projects.map((project) => ({
            ...project,
            tasks: project.tasks.map((task) => {
              const returned = byId.get(task.id)
              return returned ? normalizeTask(project, returned, task) : task
            }),
          })),
        }))
      }

      const skipped = typeof data.skippedCount === 'number' ? data.skippedCount : 0
      toast.success(skipped > 0
        ? `Updated ${taskIds.length - skipped} tasks; ${skipped} undated task${skipped === 1 ? '' : 's'} skipped`
        : `Updated ${taskIds.length} task${taskIds.length === 1 ? '' : 's'}`)
      setSelectedIds(new Set())
      return true
    } catch (error) {
      commitWorkspace((current) => ({
        ...current,
        projects: current.projects.map((project) => ({
          ...project,
          tasks: project.tasks.map((task) => before.get(task.id) || task),
        })),
      }))
      toast.error(error instanceof Error ? error.message : 'Failed to update the selected tasks')
      return false
    } finally {
      setBulkApplying(false)
    }
  }

  const moveTask = (project: WorkspaceProject, task: WorkspaceTask, column: KanbanColumnId) => {
    if (!workspace || (!project.canManage && task.assigneeId !== workspace.viewer.id)) {
      toast.error('Only the assignee, project lead, or HR admin can move this task')
      return
    }
    const section = sectionForColumn(project, column)
    if (!section) {
      toast.error(`${project.name} does not have a compatible ${column.replace('_', ' ').toLocaleLowerCase()} section`)
      return
    }

    if (isBacklogTask(project, task) && !section.isBacklog && (!task.assigneeId || !task.dueDate)) {
      if (!task.assigneeId && !project.canManage) {
        toast.error('A project lead or HR admin must assign this task before it can leave the backlog')
        return
      }
      setPromotion({
        projectId: project.id,
        taskId: task.id,
        column,
        assigneeId: task.assigneeId || '',
        dueDate: dateInputValue(task.dueDate),
      })
      return
    }

    void patchTask(project.id, task.id, { sectionId: section.id }, {
      sectionId: section.id,
      section,
      status: section.canonicalStatus,
      completedLate: column === 'DONE' && isTaskOverdue(project, task) ? true : task.completedLate,
    })
  }

  const confirmPromotion = async () => {
    if (!promotion || !promotionProject || !promotionTask) return
    const section = sectionForColumn(promotionProject, promotion.column)
    if (!section || !promotion.assigneeId || !promotion.dueDate) return
    const assignee = promotionPeople.find((person) => person.id === promotion.assigneeId) || null
    setPromoting(true)
    const ok = await patchTask(promotion.projectId, promotion.taskId, {
      sectionId: section.id,
      assigneeId: promotion.assigneeId,
      dueDate: promotion.dueDate,
    }, {
      sectionId: section.id,
      section,
      status: section.canonicalStatus,
      assigneeId: promotion.assigneeId,
      assignee,
      dueDate: promotion.dueDate,
    })
    setPromoting(false)
    if (ok) {
      setPromotion(null)
      toast.success(`Moved to ${section.name}`)
    }
  }

  const createProject = async (input: CreateProjectInput) => {
    setCreatingProject(true)
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await responseJson(response)
      if (!response.ok || data.success !== true) {
        throw new Error(errorMessage(data, 'Failed to create the project'))
      }
      await loadWorkspace()
      toast.success('Project created')
      setShowCreateProject(false)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create the project')
      return false
    } finally {
      setCreatingProject(false)
    }
  }

  const openRename = (project: WorkspaceProject) => {
    setRenameProject(project)
    setRenameValue(project.name)
  }

  const confirmRename = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!renameProject || !renameValue.trim()) return
    setRenaming(true)
    try {
      const response = await fetch(`/api/projects/${renameProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      })
      const data = await responseJson(response)
      if (!response.ok || data.success !== true) throw new Error(errorMessage(data, 'Failed to rename the project'))
      commitWorkspace((current) => ({
        ...current,
        projects: current.projects.map((project) => project.id === renameProject.id
          ? { ...project, name: renameValue.trim() }
          : project),
      }))
      toast.success('Project renamed')
      setRenameProject(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename the project')
    } finally {
      setRenaming(false)
    }
  }

  const confirmArchive = async () => {
    if (!archiveProject) return
    setArchiving(true)
    try {
      const response = await fetch(`/api/projects/${archiveProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED' }),
      })
      const data = await responseJson(response)
      if (!response.ok || data.success !== true) throw new Error(errorMessage(data, 'Failed to archive the project'))
      commitWorkspace((current) => ({
        ...current,
        projects: current.projects.map((project) => project.id === archiveProject.id
          ? { ...project, status: 'ARCHIVED' }
          : project),
      }))
      toast.success('Project archived')
      setArchiveProject(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive the project')
    } finally {
      setArchiving(false)
    }
  }

  const handlePanelTaskUpdate = (task: Partial<WorkspaceTask>) => {
    if (!selectedTaskKey) return
    commitWorkspace((current) => updateProjectTask(
      current,
      selectedTaskKey.projectId,
      selectedTaskKey.taskId,
      (previous, project) => normalizeTask(project, task, previous),
    ))
  }

  const handlePanelTaskDelete = (taskId: string) => {
    if (!selectedTaskKey) return
    commitWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id !== selectedTaskKey.projectId ? project : {
        ...project,
        tasks: project.tasks.filter((task) => task.id !== taskId),
      }),
    }))
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(taskId)
      return next
    })
    setSelectedTaskKey(null)
  }

  const changeView = (next: WorkspaceView) => {
    setView(next)
    window.localStorage.setItem('compass-project-workspace-view', next)
  }

  const toggleSort = (key: WorkspaceSortKey) => {
    if (key === sortKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  if (loading) return <LoadingScreen />

  if (!workspace) {
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <EmptyState
          icon={<FolderKanban className="h-11 w-11" />}
          title="The project workspace could not be loaded"
          description={loadError || 'Please try again.'}
          action={<Button onClick={() => void loadWorkspace(true)}>Try again</Button>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Project command center
          </div>
          <h1 className="font-display text-2xl font-light tracking-tight text-foreground sm:text-3xl">Projects & tasks</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Plan by project, work from one task list, and keep every deadline visible.
          </p>
        </div>
        <Button onClick={() => setShowCreateProject(true)} className="gap-2 self-start xl:self-auto">
          <Plus className="h-4 w-4" /> New project
        </Button>
      </header>

      <section className="rounded-xl border border-border/60 bg-card/60 p-3 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1 xl:max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search task titles and notes..."
              aria-label="Search task titles and notes"
              className="pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:items-center">
            <Select value={assigneeFilter} onValueChange={(value) => void changeAssigneeFilter(value)}>
              <SelectTrigger aria-label="Filter tasks by assignee" className="min-w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ME">My view</SelectItem>
                <SelectItem value="ALL">All teammates</SelectItem>
                {workspace.people
                  .filter((person) => person.id !== workspace.viewer.id)
                  .map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ProjectStatusFilter)}>
              <SelectTrigger aria-label="Filter projects by status" className="min-w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-fit items-center rounded-lg border border-border/60 bg-muted/30 p-1" aria-label="Workspace view">
            <Button
              type="button"
              variant={view === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => changeView('table')}
              aria-pressed={view === 'table'}
              className="gap-1.5"
            >
              <LayoutList className="h-4 w-4" /> Table
            </Button>
            <Button
              type="button"
              variant={view === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => changeView('kanban')}
              aria-pressed={view === 'kanban'}
              className="gap-1.5"
            >
              <Columns3 className="h-4 w-4" /> Kanban
            </Button>
          </div>
        </div>
      </section>

      {loadError && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <span>{loadError}. Showing the last loaded workspace.</span>
          <Button variant="outline" size="sm" onClick={() => void loadWorkspace()}>Retry</Button>
        </div>
      )}

      <WorkspaceBulkActions
        selections={selectedItems}
        applying={bulkApplying}
        onApply={applyBulkAction}
        onClear={() => setSelectedIds(new Set())}
      />

      {workspace.projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-11 w-11" />}
          title="No projects yet"
          description="Create a project, then capture the first idea in its backlog."
          action={<Button onClick={() => setShowCreateProject(true)}><Plus className="mr-2 h-4 w-4" />Create project</Button>}
        />
      ) : view === 'table' ? (
        <div className="space-y-4">
          {projectViews.length === 0 && (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              No tasks match this view. You can still capture a new backlog item below, or change the teammate, status, or search filter.
            </div>
          )}
          <WorkspaceTaskTable
            projectViews={projectViews}
            viewerId={workspace.viewer.id}
            progressScopeLabel={progressScopeLabel}
            sortKey={sortKey}
            sortDirection={sortDirection}
            selectedIds={selectedIds}
            pendingTaskIds={pendingTaskIds}
            collapsedProjectIds={collapsedProjectIds}
            backlogCollapsed={backlogCollapsed}
            quickAddProjects={quickAddProjects}
            quickAddProjectId={quickAddProjectId}
            quickAdding={quickAdding}
            onSort={toggleSort}
            onToggleProject={(projectId) => setCollapsedProjectIds((current) => {
              const next = new Set(current)
              if (next.has(projectId)) next.delete(projectId)
              else next.add(projectId)
              return next
            })}
            onToggleBacklog={() => setBacklogCollapsed((current) => !current)}
            onToggleSelected={(taskId, selected) => setSelectedIds((current) => {
              const next = new Set(current)
              if (selected) next.add(taskId)
              else next.delete(taskId)
              return next
            })}
            onToggleManySelected={(taskIds, selected) => setSelectedIds((current) => {
              const next = new Set(current)
              for (const taskId of taskIds) {
                if (selected) next.add(taskId)
                else next.delete(taskId)
              }
              return next
            })}
            onPatchTask={patchTask}
            onOpenTask={(projectId, taskId) => setSelectedTaskKey({ projectId, taskId })}
            onFilterByAssignee={(assigneeId) => void changeAssigneeFilter(assigneeId)}
            onRenameProject={openRename}
            onArchiveProject={setArchiveProject}
            onQuickAddProjectChange={setQuickAddProjectId}
            onQuickAdd={quickAdd}
          />
        </div>
      ) : (
        <WorkspaceKanban
          projectViews={projectViews}
          quickAddProjects={quickAddProjects}
          quickAddProjectId={quickAddProjectId}
          quickAdding={quickAdding}
          viewerId={workspace.viewer.id}
          pendingTaskIds={pendingTaskIds}
          onOpenTask={(projectId, taskId) => setSelectedTaskKey({ projectId, taskId })}
          onMoveTask={moveTask}
          onQuickAddProjectChange={setQuickAddProjectId}
          onQuickAdd={quickAdd}
        />
      )}

      {selectedProject && (
        <TaskDetailPanel
          task={selectedTask}
          projectId={selectedProject.id}
          members={selectedProject.members}
          sections={selectedProject.sections}
          labels={selectedProject.labels}
          open={Boolean(selectedTaskKey && selectedTask)}
          onClose={() => setSelectedTaskKey(null)}
          onTaskUpdate={handlePanelTaskUpdate}
          onTaskDelete={handlePanelTaskDelete}
          onTasksChange={() => loadWorkspace()}
          onOpenTask={(taskId) => setSelectedTaskKey({ projectId: selectedProject.id, taskId })}
          canManage={selectedProject.canManage}
          canEdit={selectedProject.canManage || selectedTask?.assigneeId === workspace.viewer.id}
        />
      )}

      <ProjectCreationModal
        open={showCreateProject}
        people={workspace.people}
        viewerId={workspace.viewer.id}
        creating={creatingProject}
        onClose={() => setShowCreateProject(false)}
        onCreate={createProject}
      />

      <Modal isOpen={Boolean(renameProject)} onClose={() => setRenameProject(null)} title="Rename project" size="sm">
        <form onSubmit={confirmRename} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rename-project-name">Project name</Label>
            <Input
              id="rename-project-name"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              autoFocus
              disabled={renaming}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRenameProject(null)} disabled={renaming}>Cancel</Button>
            <Button type="submit" disabled={renaming || !renameValue.trim()}>{renaming ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <AlertDialog open={Boolean(archiveProject)} onOpenChange={(open) => !open && setArchiveProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveProject?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its tasks will leave the Current view. You can still find the project with the Archived or All statuses filter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmArchive()}
              disabled={archiving}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {archiving ? 'Archiving...' : 'Archive project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Modal
        isOpen={Boolean(promotion && promotionProject && promotionTask)}
        onClose={() => !promoting && setPromotion(null)}
        title="Ready this backlog task"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add an assignee and due date before moving <span className="font-medium text-foreground">{promotionTask?.title}</span> into active work.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="promotion-assignee">Assignee</Label>
            <Select
              value={promotion?.assigneeId || ''}
              onValueChange={(assigneeId) => setPromotion((current) => current ? { ...current, assigneeId } : current)}
              disabled={promoting || !promotionProject?.canManage}
            >
              <SelectTrigger id="promotion-assignee"><SelectValue placeholder="Choose a teammate" /></SelectTrigger>
              <SelectContent>
                {promotionPeople.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!promotionProject?.canManage && (
              <p className="text-xs text-muted-foreground">Only the project lead or HR can change the assignee.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promotion-due-date">Due date</Label>
            <Input
              id="promotion-due-date"
              type="date"
              value={promotion?.dueDate || ''}
              onChange={(event) => setPromotion((current) => current ? { ...current, dueDate: event.target.value } : current)}
              disabled={promoting}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPromotion(null)} disabled={promoting}>Cancel</Button>
            <Button
              type="button"
              onClick={() => void confirmPromotion()}
              disabled={promoting || !promotion?.assigneeId || !promotion?.dueDate}
            >
              {promoting ? 'Moving...' : 'Move task'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
