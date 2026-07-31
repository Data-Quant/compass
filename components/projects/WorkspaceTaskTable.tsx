'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { cn } from '@/lib/utils'
import type {
  SortDirection,
  TaskOptimisticPatch,
  TaskPatchRequest,
  WorkspacePriority,
  WorkspaceProject,
  WorkspaceProjectView,
  WorkspaceSortKey,
  WorkspaceTask,
} from './workspace-types'
import {
  dateInputValue,
  isDoneTask,
  isTaskOverdue,
  overdueDays,
  plainTextPreview,
  PRIORITY_CLASS,
  PRIORITY_LABEL,
  progressBand,
  relativeDueDate,
  sectionForColumn,
  sortTasks,
} from './workspace-utils'

interface WorkspaceTaskTableProps {
  projectViews: WorkspaceProjectView[]
  viewerId: string
  progressScopeLabel: string
  sortKey: WorkspaceSortKey
  sortDirection: SortDirection
  selectedIds: Set<string>
  pendingTaskIds: Set<string>
  collapsedProjectIds: Set<string>
  backlogCollapsed: boolean
  quickAddProjects: WorkspaceProject[]
  quickAddProjectId: string
  quickAdding: boolean
  onSort: (key: WorkspaceSortKey) => void
  onToggleProject: (projectId: string) => void
  onToggleBacklog: () => void
  onToggleSelected: (taskId: string, selected: boolean) => void
  onToggleManySelected: (taskIds: string[], selected: boolean) => void
  onPatchTask: (
    projectId: string,
    taskId: string,
    request: TaskPatchRequest,
    optimistic: TaskOptimisticPatch,
  ) => Promise<boolean>
  onOpenTask: (projectId: string, taskId: string) => void
  onFilterByAssignee: (assigneeId: string) => void
  onRenameProject: (project: WorkspaceProject) => void
  onArchiveProject: (project: WorkspaceProject) => void
  onQuickAddProjectChange: (projectId: string) => void
  onQuickAdd: (title: string) => Promise<boolean>
}

const PRIORITIES: WorkspacePriority[] = ['HIGH', 'MEDIUM', 'LOW']

function canEditTask(project: WorkspaceProject, task: WorkspaceTask, viewerId: string) {
  return project.canManage || task.assigneeId === viewerId
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  ON_HOLD: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  COMPLETED: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  ARCHIVED: 'border-border bg-muted text-muted-foreground',
}

export function WorkspaceTaskTable({
  projectViews,
  viewerId,
  progressScopeLabel,
  sortKey,
  sortDirection,
  selectedIds,
  pendingTaskIds,
  collapsedProjectIds,
  backlogCollapsed,
  quickAddProjects,
  quickAddProjectId,
  quickAdding,
  onSort,
  onToggleProject,
  onToggleBacklog,
  onToggleSelected,
  onToggleManySelected,
  onPatchTask,
  onOpenTask,
  onFilterByAssignee,
  onRenameProject,
  onArchiveProject,
  onQuickAddProjectChange,
  onQuickAdd,
}: WorkspaceTaskTableProps) {
  const backlogItems = projectViews
    .flatMap(({ project, visibleBacklogTasks }) => visibleBacklogTasks.map((task) => ({ project, task })))
    .sort((left, right) => {
      if (sortKey === 'project') {
        const result = left.project.name.localeCompare(right.project.name, undefined, { sensitivity: 'base' })
        if (result !== 0) return sortDirection === 'asc' ? result : -result
      }
      const taskSortKey = sortKey === 'project' ? 'priority' : sortKey
      const ordered = sortTasks(left.project, [left.task, right.task], taskSortKey, sortDirection)
      return ordered[0].id === left.task.id ? -1 : 1
    })

  return (
    <div className="space-y-4">
      {projectViews.map((view) => (
        <ProjectTaskGroup
          key={view.project.id}
          view={view}
          viewerId={viewerId}
          progressScopeLabel={progressScopeLabel}
          sortKey={sortKey}
          sortDirection={sortDirection}
          selectedIds={selectedIds}
          pendingTaskIds={pendingTaskIds}
          collapsed={collapsedProjectIds.has(view.project.id)}
          onSort={onSort}
          onToggleProject={onToggleProject}
          onToggleSelected={onToggleSelected}
          onToggleManySelected={onToggleManySelected}
          onPatchTask={onPatchTask}
          onOpenTask={onOpenTask}
          onFilterByAssignee={onFilterByAssignee}
          onRenameProject={onRenameProject}
          onArchiveProject={onArchiveProject}
        />
      ))}

      <BacklogGroup
        items={backlogItems}
        viewerId={viewerId}
        collapsed={backlogCollapsed}
        sortKey={sortKey}
        sortDirection={sortDirection}
        quickAddProjects={quickAddProjects}
        quickAddProjectId={quickAddProjectId}
        quickAdding={quickAdding}
        selectedIds={selectedIds}
        pendingTaskIds={pendingTaskIds}
        onToggle={onToggleBacklog}
        onSort={onSort}
        onToggleSelected={onToggleSelected}
        onToggleManySelected={onToggleManySelected}
        onPatchTask={onPatchTask}
        onOpenTask={onOpenTask}
        onFilterByAssignee={onFilterByAssignee}
        onQuickAddProjectChange={onQuickAddProjectChange}
        onQuickAdd={onQuickAdd}
      />
    </div>
  )
}

function ProjectTaskGroup({
  view,
  viewerId,
  progressScopeLabel,
  sortKey,
  sortDirection,
  selectedIds,
  pendingTaskIds,
  collapsed,
  onSort,
  onToggleProject,
  onToggleSelected,
  onToggleManySelected,
  onPatchTask,
  onOpenTask,
  onFilterByAssignee,
  onRenameProject,
  onArchiveProject,
}: {
  view: WorkspaceProjectView
  viewerId: string
  progressScopeLabel: string
  sortKey: WorkspaceSortKey
  sortDirection: SortDirection
  selectedIds: Set<string>
  pendingTaskIds: Set<string>
  collapsed: boolean
  onSort: (key: WorkspaceSortKey) => void
  onToggleProject: (projectId: string) => void
  onToggleSelected: (taskId: string, selected: boolean) => void
  onToggleManySelected: (taskIds: string[], selected: boolean) => void
  onPatchTask: WorkspaceTaskTableProps['onPatchTask']
  onOpenTask: (projectId: string, taskId: string) => void
  onFilterByAssignee: (assigneeId: string) => void
  onRenameProject: (project: WorkspaceProject) => void
  onArchiveProject: (project: WorkspaceProject) => void
}) {
  const { project, progress } = view
  const tasks = sortTasks(project, view.visibleActiveTasks, sortKey, sortDirection)
  const taskIds = tasks.filter((task) => canEditTask(project, task, viewerId)).map((task) => task.id)
  const selectedCount = taskIds.filter((id) => selectedIds.has(id)).length
  const hasOverdue = project.tasks.some((task) => isTaskOverdue(project, task))
  const band = progressBand(progress.percent)

  const progressText = progress.total === 0
    ? 'No tasks yet'
    : `${progressScopeLabel}: ${progress.completed}/${progress.total} · ${progress.percent}%`

  return (
    <Card
      className="overflow-hidden border-border/60 shadow-sm"
      style={{ borderLeftColor: project.color || undefined, borderLeftWidth: project.color ? 3 : undefined }}
    >
      <div className="flex flex-col gap-3 border-b border-border/50 bg-card/90 px-4 py-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleProject(project.id)}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${project.name}`}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', !collapsed && 'rotate-90')} />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/projects/${project.id}`}
                className="truncate font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                {project.name}
              </Link>
              <Badge variant="outline" className={cn('text-[10px]', STATUS_CLASS[project.status])}>
                {project.status.replace('_', ' ')}
              </Badge>
            </div>
            {project.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{project.description}</p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 lg:ml-auto lg:max-w-xl">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className={cn('truncate font-medium', band.text)}>{progressText}</span>
              {progress.percent === 100 && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Complete" />}
            </div>
            <div
              className={cn('h-2 overflow-hidden rounded-full', band.track)}
              role="progressbar"
              aria-label={`${project.name} ${progressScopeLabel.toLocaleLowerCase()} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent ?? 0}
              aria-valuetext={progressText}
            >
              <div
                className={cn('h-full rounded-full transition-[width] duration-300', band.fill)}
                style={{ width: `${progress.percent ?? 0}%` }}
              />
            </div>
          </div>
          {hasOverdue && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.14)]"
              title="This project has overdue tasks"
              role="img"
              aria-label="This project has overdue tasks"
            />
          )}
          {project.canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Manage ${project.name}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/projects/${project.id}`}>Open project</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onRenameProject(project)}>
                  <Pencil className="h-4 w-4" /> Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onArchiveProject(project)} className="text-red-600 focus:text-red-600 dark:text-red-300">
                  <Archive className="h-4 w-4" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {!collapsed && (
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {project.tasks.length === 0 ? 'No tasks yet' : 'No active tasks in this view'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {project.tasks.length === 0 ? 'Use the Backlog quick-add below to capture the first task.' : 'Try another assignee, status, or search filter.'}
              </p>
            </div>
          ) : (
            <Table className="min-w-[1060px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={taskIds.length > 0 && selectedCount === taskIds.length ? true : selectedCount > 0 ? 'indeterminate' : false}
                      onCheckedChange={(checked) => onToggleManySelected(taskIds, checked === true)}
                      aria-label={`Select all tasks in ${project.name}`}
                      disabled={taskIds.length === 0}
                    />
                  </TableHead>
                  <SortableHead label="Done" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-20" />
                  <SortableHead label="Task" sortKey="title" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="min-w-[260px]" />
                  <SortableHead label="Priority" sortKey="priority" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-36" />
                  <SortableHead label="Due date" sortKey="dueDate" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-44" />
                  <SortableHead label="Variance" sortKey="variance" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-32" />
                  <SortableHead label="Assignee" sortKey="assignee" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-48" />
                  <SortableHead label="Notes" sortKey="notes" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="min-w-[220px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <WorkspaceTaskRow
                    key={task.id}
                    project={project}
                    task={task}
                    viewerId={viewerId}
                    selected={selectedIds.has(task.id)}
                    pending={pendingTaskIds.has(task.id)}
                    onToggleSelected={onToggleSelected}
                    onPatchTask={onPatchTask}
                    onOpenTask={onOpenTask}
                    onFilterByAssignee={onFilterByAssignee}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string
  sortKey: WorkspaceSortKey
  activeKey: WorkspaceSortKey
  direction: SortDirection
  onSort: (key: WorkspaceSortKey) => void
  className?: string
}) {
  const active = activeKey === sortKey
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <TableHead className={className} aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 rounded px-1 py-1 text-left transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-45')} />
      </button>
    </TableHead>
  )
}

function WorkspaceTaskRow({
  project,
  task,
  viewerId,
  selected,
  pending,
  onToggleSelected,
  onPatchTask,
  onOpenTask,
  onFilterByAssignee,
}: {
  project: WorkspaceProject
  task: WorkspaceTask
  viewerId: string
  selected: boolean
  pending: boolean
  onToggleSelected: (taskId: string, selected: boolean) => void
  onPatchTask: WorkspaceTaskTableProps['onPatchTask']
  onOpenTask: (projectId: string, taskId: string) => void
  onFilterByAssignee: (assigneeId: string) => void
}) {
  const done = isDoneTask(project, task)
  const overdue = isTaskOverdue(project, task)
  const lateDays = overdueDays(project, task)
  const canEdit = canEditTask(project, task, viewerId)

  const toggleDone = async (checked: boolean) => {
    const section = sectionForColumn(project, checked ? 'DONE' : 'TODO')
    if (!section) {
      toast.error(`No ${checked ? 'Done' : 'To Do'} status is configured for ${project.name}`)
      return
    }
    await onPatchTask(
      project.id,
      task.id,
      { sectionId: section.id },
      {
        sectionId: section.id,
        section,
        status: section.canonicalStatus,
        completedLate: checked && overdue ? true : task.completedLate,
      },
    )
  }

  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      className={cn(overdue && 'bg-red-500/[0.07] hover:bg-red-500/[0.11]', pending && 'opacity-65')}
    >
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onToggleSelected(task.id, checked === true)}
          aria-label={`Select ${task.title}`}
          disabled={pending || !canEdit}
        />
      </TableCell>
      <TableCell>
        <Checkbox
          checked={done}
          onCheckedChange={(checked) => void toggleDone(checked === true)}
          aria-label={`Mark ${task.title} ${done ? 'incomplete' : 'complete'}`}
          disabled={pending || !canEdit}
          className="h-5 w-5 rounded-full"
        />
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 items-center gap-2">
          {task.parentTaskId && <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Child task" />}
          <InlineTitle project={project} task={task} pending={pending || !canEdit} onPatchTask={onPatchTask} />
          {task.completedLate && (
            <Badge variant="outline" className="shrink-0 border-orange-500/20 bg-orange-500/10 text-[10px] text-orange-600 dark:text-orange-300">
              Completed late
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Select
          value={task.priority}
          onValueChange={(value) => void onPatchTask(
            project.id,
            task.id,
            { priority: value as WorkspacePriority },
            { priority: value as WorkspacePriority },
          )}
          disabled={pending || !canEdit}
        >
          <SelectTrigger aria-label={`Priority for ${task.title}`} className={cn('h-8 border px-2 text-xs shadow-none', PRIORITY_CLASS[task.priority])}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>{PRIORITY_LABEL[priority]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <Input
            type="date"
            value={dateInputValue(task.dueDate)}
            onChange={(event) => void onPatchTask(
              project.id,
              task.id,
              { dueDate: event.target.value || null },
              { dueDate: event.target.value || null },
            )}
            aria-label={`Due date for ${task.title}`}
            disabled={pending || !canEdit}
            className={cn('h-8 min-w-[142px] border-transparent bg-transparent px-2 text-xs shadow-none hover:border-border focus:border-border', overdue && 'font-semibold text-red-600 dark:text-red-300')}
          />
          <p className={cn('px-2 text-[10px] text-muted-foreground', overdue && 'font-semibold text-red-600 dark:text-red-300')}>
            {relativeDueDate(task.dueDate)}
          </p>
        </div>
      </TableCell>
      <TableCell>
        {overdue ? (
          <Badge className="whitespace-nowrap border border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/10 dark:text-red-300">
            Overdue · {lateDays}d
          </Badge>
        ) : task.completedLate ? (
          <span className="text-xs text-orange-600 dark:text-orange-300">Completed late</span>
        ) : (
          <span className="text-xs text-muted-foreground">On track</span>
        )}
      </TableCell>
      <TableCell>
        <AssigneeCell
          project={project}
          task={task}
          pending={pending}
          onPatchTask={onPatchTask}
          onFilterByAssignee={onFilterByAssignee}
        />
      </TableCell>
      <TableCell>
        <button
          type="button"
          onClick={() => onOpenTask(project.id, task.id)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open notes and details for ${task.title}`}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{plainTextPreview(task.description) || 'Add notes'}</span>
        </button>
      </TableCell>
    </TableRow>
  )
}

function InlineTitle({
  project,
  task,
  pending,
  onPatchTask,
}: {
  project: WorkspaceProject
  task: WorkspaceTask
  pending: boolean
  onPatchTask: WorkspaceTaskTableProps['onPatchTask']
}) {
  const [value, setValue] = useState(task.title)
  useEffect(() => setValue(task.title), [task.title])

  const save = async () => {
    const title = value.trim()
    if (!title) {
      setValue(task.title)
      return
    }
    if (title === task.title) return
    const ok = await onPatchTask(project.id, task.id, { title }, { title })
    if (!ok) setValue(task.title)
  }

  return (
    <input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setValue(task.title)
          event.currentTarget.blur()
        }
      }}
      aria-label={`Task title: ${task.title}`}
      disabled={pending}
      className={cn(
        'min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors hover:border-border focus:border-primary/40',
        isDoneTask(project, task) && 'text-muted-foreground line-through',
      )}
    />
  )
}

function AssigneeCell({
  project,
  task,
  pending,
  onPatchTask,
  onFilterByAssignee,
}: {
  project: WorkspaceProject
  task: WorkspaceTask
  pending: boolean
  onPatchTask: WorkspaceTaskTableProps['onPatchTask']
  onFilterByAssignee: (assigneeId: string) => void
}) {
  if (!project.canManage) {
    return task.assignee ? (
      <button
        type="button"
        onClick={() => onFilterByAssignee(task.assigneeId!)}
        className="inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Show tasks assigned to ${task.assignee.name}`}
        title={`Filter by ${task.assignee.name}`}
      >
        <UserAvatar name={task.assignee.name} size="xs" />
        <span className="truncate">{task.assignee.name}</span>
      </button>
    ) : <span className="text-xs text-muted-foreground">Unassigned</span>
  }

  const people = [project.owner, ...project.members]
    .filter((person, index, list) => list.findIndex((candidate) => candidate.id === person.id) === index)

  return (
    <Select
      value={task.assigneeId || '__UNASSIGNED__'}
      onValueChange={(value) => {
        const assigneeId = value === '__UNASSIGNED__' ? null : value
        const assignee = people.find((person) => person.id === assigneeId) || null
        void onPatchTask(project.id, task.id, { assigneeId }, { assigneeId, assignee })
      }}
      disabled={pending}
    >
      <SelectTrigger aria-label={`Assignee for ${task.title}`} className="h-8 border-transparent bg-transparent px-2 text-xs shadow-none hover:border-border">
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__UNASSIGNED__">Unassigned</SelectItem>
        {people.map((person) => (
          <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function BacklogGroup({
  items,
  viewerId,
  collapsed,
  sortKey,
  sortDirection,
  quickAddProjects,
  quickAddProjectId,
  quickAdding,
  selectedIds,
  pendingTaskIds,
  onToggle,
  onSort,
  onToggleSelected,
  onToggleManySelected,
  onPatchTask,
  onOpenTask,
  onFilterByAssignee,
  onQuickAddProjectChange,
  onQuickAdd,
}: {
  items: Array<{ project: WorkspaceProject; task: WorkspaceTask }>
  viewerId: string
  collapsed: boolean
  sortKey: WorkspaceSortKey
  sortDirection: SortDirection
  quickAddProjects: WorkspaceProject[]
  quickAddProjectId: string
  quickAdding: boolean
  selectedIds: Set<string>
  pendingTaskIds: Set<string>
  onToggle: () => void
  onSort: (key: WorkspaceSortKey) => void
  onToggleSelected: (taskId: string, selected: boolean) => void
  onToggleManySelected: (taskIds: string[], selected: boolean) => void
  onPatchTask: WorkspaceTaskTableProps['onPatchTask']
  onOpenTask: (projectId: string, taskId: string) => void
  onFilterByAssignee: (assigneeId: string) => void
  onQuickAddProjectChange: (projectId: string) => void
  onQuickAdd: (title: string) => Promise<boolean>
}) {
  const [title, setTitle] = useState('')
  const ids = items
    .filter(({ project, task }) => canEditTask(project, task, viewerId))
    .map(({ task }) => task.id)
  const selectedCount = ids.filter((id) => selectedIds.has(id)).length

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    const ok = await onQuickAdd(cleanTitle)
    if (ok) setTitle('')
  }

  return (
    <Card className="overflow-hidden border-dashed border-border/70 bg-muted/10">
      <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3 lg:flex-row lg:items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', !collapsed && 'rotate-90')} />
          <span className="font-semibold">Backlog</span>
          <Badge variant="secondary">{items.length}</Badge>
          <span className="hidden text-xs text-muted-foreground sm:inline">Future work, excluded from progress</span>
        </button>

        <form onSubmit={submit} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row lg:ml-auto lg:max-w-2xl">
          <Select value={quickAddProjectId} onValueChange={onQuickAddProjectChange} disabled={quickAdding || quickAddProjects.length === 0}>
            <SelectTrigger aria-label="Project for new backlog task" className="h-9 sm:w-52">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {quickAddProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex min-w-0 flex-1 gap-2">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Capture an idea and press Enter"
              aria-label="New backlog task title"
              disabled={quickAdding || !quickAddProjectId}
              className="min-w-0 flex-1"
            />
            <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={quickAdding || !title.trim() || !quickAddProjectId}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add</span>
            </Button>
          </div>
        </form>
      </div>

      {!collapsed && (
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">Backlog is clear.</div>
          ) : (
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={ids.length > 0 && selectedCount === ids.length ? true : selectedCount > 0 ? 'indeterminate' : false}
                      onCheckedChange={(checked) => onToggleManySelected(ids, checked === true)}
                      aria-label="Select all backlog tasks"
                      disabled={ids.length === 0}
                    />
                  </TableHead>
                  <SortableHead label="Task" sortKey="title" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="min-w-[260px]" />
                  <SortableHead label="Project" sortKey="project" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-48" />
                  <SortableHead label="Priority" sortKey="priority" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-36" />
                  <SortableHead label="Due date" sortKey="dueDate" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-44" />
                  <SortableHead label="Assignee" sortKey="assignee" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-48" />
                  <SortableHead label="Notes" sortKey="notes" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="min-w-[220px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(({ project, task }) => (
                  <TableRow key={task.id} data-state={selectedIds.has(task.id) ? 'selected' : undefined} className={pendingTaskIds.has(task.id) ? 'opacity-65' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(task.id)}
                        onCheckedChange={(checked) => onToggleSelected(task.id, checked === true)}
                        aria-label={`Select ${task.title}`}
                        disabled={pendingTaskIds.has(task.id) || !canEditTask(project, task, viewerId)}
                      />
                    </TableCell>
                    <TableCell>
                      <InlineTitle
                        project={project}
                        task={task}
                        pending={pendingTaskIds.has(task.id) || !canEditTask(project, task, viewerId)}
                        onPatchTask={onPatchTask}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-2 text-xs font-medium hover:text-primary hover:underline">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color || '#94a3b8' }} />
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={task.priority}
                        onValueChange={(value) => void onPatchTask(project.id, task.id, { priority: value as WorkspacePriority }, { priority: value as WorkspacePriority })}
                        disabled={pendingTaskIds.has(task.id) || !canEditTask(project, task, viewerId)}
                      >
                        <SelectTrigger aria-label={`Priority for ${task.title}`} className={cn('h-8 border px-2 text-xs shadow-none', PRIORITY_CLASS[task.priority])}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{PRIORITY_LABEL[priority]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <Input
                          type="date"
                          value={dateInputValue(task.dueDate)}
                          onChange={(event) => void onPatchTask(
                            project.id,
                            task.id,
                            { dueDate: event.target.value || null },
                            { dueDate: event.target.value || null },
                          )}
                          aria-label={`Due date for ${task.title}`}
                          disabled={pendingTaskIds.has(task.id) || !canEditTask(project, task, viewerId)}
                          className="h-8 min-w-[142px] border-transparent bg-transparent px-2 text-xs shadow-none hover:border-border focus:border-border"
                        />
                        <p className="px-2 text-[10px] text-muted-foreground">
                          {task.dueDate ? relativeDueDate(task.dueDate) : 'Optional'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <AssigneeCell
                        project={project}
                        task={task}
                        pending={pendingTaskIds.has(task.id)}
                        onPatchTask={onPatchTask}
                        onFilterByAssignee={onFilterByAssignee}
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => onOpenTask(project.id, task.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Open notes and details for ${task.title}`}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="line-clamp-2">{plainTextPreview(task.description) || 'Add notes'}</span>
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  )
}
