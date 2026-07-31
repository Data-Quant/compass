'use client'

import { Fragment, useEffect, useState } from 'react'
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  displayDueDate,
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
  backlogCollapsed: boolean
  quickAddProjects: WorkspaceProject[]
  quickAddProjectId: string
  quickAdding: boolean
  onSort: (key: WorkspaceSortKey) => void
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
  return project.canManage
    || task.assigneeId === viewerId
    || Boolean(task.assistants?.some((assistant) => assistant.user.id === viewerId))
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
  backlogCollapsed,
  quickAddProjects,
  quickAddProjectId,
  quickAdding,
  onSort,
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
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
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

  const orderedProjectViews = sortKey === 'project'
    ? [...projectViews].sort((left, right) => {
      const result = left.project.name.localeCompare(right.project.name, undefined, { sensitivity: 'base' })
      return sortDirection === 'asc' ? result : -result
    })
    : projectViews

  return (
    <div className="space-y-4">
      {orderedProjectViews.length > 0 && (
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <CardContent className="p-0">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <SortableHead label="Project" sortKey="project" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-[30%] min-w-[290px]" />
                  <SortableHead label="Tasks" sortKey="title" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-[28%] min-w-[280px]" />
                  <SortableHead label="Deadline" sortKey="dueDate" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-[16%] min-w-[170px]" />
                  <SortableHead label="Assignee" sortKey="assignee" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-[15%] min-w-[170px]" />
                  <SortableHead label="Priority" sortKey="priority" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-[11%] min-w-[130px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedProjectViews.map((view) => (
                  <ProjectMatrixRow
                    key={view.project.id}
                    view={view}
                    viewerId={viewerId}
                    progressScopeLabel={progressScopeLabel}
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                    selectedIds={selectedIds}
                    pendingTaskIds={pendingTaskIds}
                    open={openProjectId === view.project.id}
                    onOpenChange={(open) => setOpenProjectId(open ? view.project.id : null)}
                    onToggleSelected={onToggleSelected}
                    onToggleManySelected={onToggleManySelected}
                    onPatchTask={onPatchTask}
                    onOpenTask={onOpenTask}
                    onFilterByAssignee={onFilterByAssignee}
                    onRenameProject={onRenameProject}
                    onArchiveProject={onArchiveProject}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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

interface WorkspaceTaskNode {
  task: WorkspaceTask
  children: WorkspaceTaskNode[]
}

export function buildWorkspaceTaskTree(tasks: WorkspaceTask[]): WorkspaceTaskNode[] {
  const taskIds = new Set(tasks.map((task) => task.id))
  const nodes = new Map(tasks.map((task) => [task.id, { task, children: [] as WorkspaceTaskNode[] }]))
  const roots: WorkspaceTaskNode[] = []

  const hasParentCycle = (task: WorkspaceTask) => {
    const seen = new Set([task.id])
    let parentId = task.parentTaskId
    while (parentId && taskIds.has(parentId)) {
      if (seen.has(parentId)) return true
      seen.add(parentId)
      parentId = nodes.get(parentId)?.task.parentTaskId
    }
    return false
  }

  for (const task of tasks) {
    const node = nodes.get(task.id)!
    const parent = task.parentTaskId ? nodes.get(task.parentTaskId) : undefined
    if (parent && task.parentTaskId !== task.id && !hasParentCycle(task)) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}

export function taskAssignees(task: WorkspaceTask) {
  const people = [task.assignee, ...(task.assistants || []).map((assistant) => assistant.user)]
    .filter((person): person is NonNullable<typeof person> => Boolean(person))
  return people.filter((person, index) => people.findIndex((candidate) => candidate.id === person.id) === index)
}

function ProjectMatrixRow({
  view,
  viewerId,
  progressScopeLabel,
  sortKey,
  sortDirection,
  selectedIds,
  pendingTaskIds,
  open,
  onOpenChange,
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
  open: boolean
  onOpenChange: (open: boolean) => void
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
  const taskTree = buildWorkspaceTaskTree(tasks)
  const [expandedTaskIds, setExpandedTaskIds] = useState(new Set<string>())
  const selectableTaskIds = tasks.filter((task) => canEditTask(project, task, viewerId)).map((task) => task.id)
  const selectedCount = selectableTaskIds.filter((id) => selectedIds.has(id)).length
  const hasOverdue = tasks.some((task) => isTaskOverdue(project, task))
  const band = progressBand(progress.percent)
  const progressText = progress.total === 0
    ? 'No tasks yet'
    : `${progressScopeLabel}: ${progress.completed}/${progress.total} · ${progress.percent}%`
  const nearestDeadline = tasks
    .map((task) => task.dueDate)
    .filter((dueDate): dueDate is string => Boolean(dueDate))
    .sort()[0] || null
  const priorityOrder: Record<WorkspacePriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  const highestPriority = tasks.reduce<WorkspacePriority | null>((current, task) => (
    current === null || priorityOrder[task.priority] < priorityOrder[current] ? task.priority : current
  ), null)
  const assignedPeople = tasks
    .flatMap(taskAssignees)
    .filter((person, index, people) => people.findIndex((candidate) => candidate.id === person.id) === index)

  const toggleTask = (taskId: string) => setExpandedTaskIds((current) => {
    const next = new Set(current)
    if (next.has(taskId)) next.delete(taskId)
    else next.add(taskId)
    return next
  })

  return (
    <TableRow data-row-kind="project" className="bg-muted/20 hover:bg-muted/35">
      <TableCell
        className="py-2"
        style={{ borderLeftColor: project.color || 'transparent', borderLeftStyle: 'solid', borderLeftWidth: 3 }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Checkbox
            checked={selectableTaskIds.length > 0 && selectedCount === selectableTaskIds.length
              ? true
              : selectedCount > 0 ? 'indeterminate' : false}
            onCheckedChange={(checked) => onToggleManySelected(selectableTaskIds, checked === true)}
            aria-label={`Select all visible tasks in ${project.name}`}
            disabled={selectableTaskIds.length === 0}
          />

          <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${open ? 'Close' : 'Open'} tasks for ${project.name}`}
                className="group min-w-0 flex-1 rounded-md px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                  <span className="truncate font-semibold text-foreground group-hover:text-primary">{project.name}</span>
                  <Badge variant="outline" className={cn('shrink-0 text-[10px]', STATUS_CLASS[project.status])}>
                    {project.status.replace('_', ' ')}
                  </Badge>
                  {hasOverdue && (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.14)]"
                      title="This project has overdue tasks"
                      role="img"
                      aria-label="This project has overdue tasks"
                    />
                  )}
                </div>
                <div className="mt-1.5 flex max-w-sm items-center gap-2 pl-6">
                  <div
                    className={cn('h-1.5 min-w-0 flex-1 overflow-hidden rounded-full', band.track)}
                    role="progressbar"
                    aria-label={`${project.name} ${progressScopeLabel.toLocaleLowerCase()} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress.percent ?? 0}
                    aria-valuetext={progressText}
                  >
                    <div className={cn('h-full rounded-full transition-[width] duration-300', band.fill)} style={{ width: `${progress.percent ?? 0}%` }} />
                  </div>
                  <span className={cn('whitespace-nowrap text-[10px] font-medium', band.text)}>{progressText}</span>
                  {progress.percent === 100 && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Complete" />}
                </div>
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={8}
              collisionPadding={16}
              className="w-[min(96vw,1120px)] max-w-none overflow-hidden p-0"
            >
              <div className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tasks.length} active {tasks.length === 1 ? 'task' : 'tasks'} · expand any task to see its subtasks
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">{selectedCount} selected</Badge>
              </div>

              {tasks.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {project.tasks.length === 0
                    ? 'No tasks yet. Use the Backlog quick-add below to capture the first task.'
                    : 'No active tasks match this view. Try another teammate, status, or search filter.'}
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-auto">
                  <Table className="min-w-[920px]">
                    <TableHeader className="sticky top-0 z-10 bg-popover">
                      <TableRow>
                        <TableHead className="min-w-[390px]">Task</TableHead>
                        <TableHead className="w-44">Deadline</TableHead>
                        <TableHead className="min-w-[230px]">Assignees</TableHead>
                        <TableHead className="w-36">Priority</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taskTree.map((node) => (
                        <WorkspacePopupTaskRows
                          key={node.task.id}
                          node={node}
                          depth={0}
                          project={project}
                          viewerId={viewerId}
                          selectedIds={selectedIds}
                          pendingTaskIds={pendingTaskIds}
                          expandedTaskIds={expandedTaskIds}
                          onToggleTask={toggleTask}
                          onToggleSelected={onToggleSelected}
                          onPatchTask={onPatchTask}
                          onOpenTask={onOpenTask}
                          onFilterByAssignee={onFilterByAssignee}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <ProjectActions project={project} onRenameProject={onRenameProject} onArchiveProject={onArchiveProject} />
        </div>
      </TableCell>
      <TableCell><Badge variant="secondary" className="font-normal">{tasks.length} active</Badge></TableCell>
      <TableCell>
        {nearestDeadline ? (
          <div className="text-xs">
            <p className="font-medium">{displayDueDate(nearestDeadline)}</p>
            <p className="text-[10px] text-muted-foreground">{relativeDueDate(nearestDeadline)}</p>
          </div>
        ) : <span className="text-xs text-muted-foreground">No deadline</span>}
      </TableCell>
      <TableCell>
        {assignedPeople.length > 0 ? (
          <div className="flex items-center gap-2" title={assignedPeople.map((person) => person.name).join(', ')}>
            <div className="flex -space-x-2">
              {assignedPeople.slice(0, 3).map((person) => (
                <UserAvatar key={person.id} name={person.name} size="xs" className="ring-2 ring-background" />
              ))}
            </div>
            <span className="truncate text-xs">{assignedPeople.length === 1 ? assignedPeople[0].name : `${assignedPeople.length} people`}</span>
          </div>
        ) : <span className="text-xs text-muted-foreground">Unassigned</span>}
      </TableCell>
      <TableCell>
        {highestPriority ? (
          <Badge variant="outline" className={cn('font-normal', PRIORITY_CLASS[highestPriority])}>{PRIORITY_LABEL[highestPriority]}</Badge>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>
    </TableRow>
  )
}

function ProjectActions({
  project,
  onRenameProject,
  onArchiveProject,
}: {
  project: WorkspaceProject
  onRenameProject: (project: WorkspaceProject) => void
  onArchiveProject: (project: WorkspaceProject) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Project actions for ${project.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link href={`/projects/${project.id}`}>Open project</Link></DropdownMenuItem>
        {project.canManage && (
          <>
            <DropdownMenuItem onSelect={() => onRenameProject(project)}><Pencil className="h-4 w-4" /> Rename</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onArchiveProject(project)} className="text-red-600 focus:text-red-600 dark:text-red-300">
              <Archive className="h-4 w-4" /> Archive
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WorkspacePopupTaskRows({
  node,
  depth,
  project,
  viewerId,
  selectedIds,
  pendingTaskIds,
  expandedTaskIds,
  onToggleTask,
  onToggleSelected,
  onPatchTask,
  onOpenTask,
  onFilterByAssignee,
}: {
  node: WorkspaceTaskNode
  depth: number
  project: WorkspaceProject
  viewerId: string
  selectedIds: Set<string>
  pendingTaskIds: Set<string>
  expandedTaskIds: Set<string>
  onToggleTask: (taskId: string) => void
  onToggleSelected: (taskId: string, selected: boolean) => void
  onPatchTask: WorkspaceTaskTableProps['onPatchTask']
  onOpenTask: (projectId: string, taskId: string) => void
  onFilterByAssignee: (assigneeId: string) => void
}) {
  const { task, children } = node
  const expanded = children.length > 0 && expandedTaskIds.has(task.id)
  return (
    <Fragment>
      <WorkspacePopupTaskRow
        project={project}
        task={task}
        depth={depth}
        childCount={children.length}
        expanded={expanded}
        viewerId={viewerId}
        selected={selectedIds.has(task.id)}
        pending={pendingTaskIds.has(task.id)}
        onToggleChildren={() => onToggleTask(task.id)}
        onToggleSelected={onToggleSelected}
        onPatchTask={onPatchTask}
        onOpenTask={onOpenTask}
        onFilterByAssignee={onFilterByAssignee}
      />
      {expanded && children.map((child) => (
        <WorkspacePopupTaskRows
          key={child.task.id}
          node={child}
          depth={depth + 1}
          project={project}
          viewerId={viewerId}
          selectedIds={selectedIds}
          pendingTaskIds={pendingTaskIds}
          expandedTaskIds={expandedTaskIds}
          onToggleTask={onToggleTask}
          onToggleSelected={onToggleSelected}
          onPatchTask={onPatchTask}
          onOpenTask={onOpenTask}
          onFilterByAssignee={onFilterByAssignee}
        />
      ))}
    </Fragment>
  )
}

function WorkspacePopupTaskRow({
  project,
  task,
  depth,
  childCount,
  expanded,
  viewerId,
  selected,
  pending,
  onToggleChildren,
  onToggleSelected,
  onPatchTask,
  onOpenTask,
  onFilterByAssignee,
}: {
  project: WorkspaceProject
  task: WorkspaceTask
  depth: number
  childCount: number
  expanded: boolean
  viewerId: string
  selected: boolean
  pending: boolean
  onToggleChildren: () => void
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
    await onPatchTask(project.id, task.id, { sectionId: section.id }, {
      sectionId: section.id,
      section,
      status: section.canonicalStatus,
      completedLate: checked && overdue ? true : task.completedLate,
    })
  }

  return (
    <TableRow
      data-row-kind="task"
      data-task-depth={depth}
      data-parent-task-id={task.parentTaskId || undefined}
      data-state={selected ? 'selected' : undefined}
      className={cn('bg-popover', overdue && 'bg-red-500/[0.07] hover:bg-red-500/[0.11]', pending && 'opacity-65')}
    >
      <TableCell style={{ paddingLeft: `${12 + depth * 24}px` }}>
        <div className="flex min-w-0 items-center gap-2">
          {childCount > 0 ? (
            <button
              type="button"
              onClick={onToggleChildren}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} subtasks for ${task.title}`}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
            </button>
          ) : <span className="h-7 w-7 shrink-0" aria-hidden="true" />}
          <Checkbox checked={selected} onCheckedChange={(checked) => onToggleSelected(task.id, checked === true)} aria-label={`Select ${task.title}`} disabled={pending || !canEdit} />
          <Checkbox
            checked={done}
            onCheckedChange={(checked) => void toggleDone(checked === true)}
            aria-label={`Mark ${task.title} ${done ? 'incomplete' : 'complete'}`}
            disabled={pending || !canEdit}
            className="h-5 w-5 rounded-full"
          />
          {depth > 0 && <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Subtask" />}
          <InlineTitle project={project} task={task} pending={pending || !canEdit} onPatchTask={onPatchTask} />
          {childCount > 0 && <Badge variant="secondary" className="shrink-0 px-1.5 text-[9px]">{childCount}</Badge>}
          {task.completedLate && (
            <Badge variant="outline" className="shrink-0 border-orange-500/20 bg-orange-500/10 text-[10px] text-orange-600 dark:text-orange-300">Completed late</Badge>
          )}
          <button
            type="button"
            onClick={() => onOpenTask(project.id, task.id)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open notes and details for ${task.title}`}
            title={plainTextPreview(task.description) || 'Open notes and details'}
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          <Input
            type="date"
            value={dateInputValue(task.dueDate)}
            onChange={(event) => void onPatchTask(project.id, task.id, { dueDate: event.target.value || null }, { dueDate: event.target.value || null })}
            aria-label={`Due date for ${task.title}`}
            disabled={pending || !canEdit}
            className={cn('h-8 min-w-[142px] border-transparent bg-transparent px-2 text-xs shadow-none hover:border-border focus:border-border', overdue && 'font-semibold text-red-600 dark:text-red-300')}
          />
          <div className="flex min-h-4 items-center gap-1.5 px-2">
            <span className={cn('text-[10px] text-muted-foreground', overdue && 'font-semibold text-red-600 dark:text-red-300')}>{relativeDueDate(task.dueDate)}</span>
            {overdue && <Badge className="border border-red-500/20 bg-red-500/10 px-1.5 py-0 text-[9px] text-red-600 hover:bg-red-500/10 dark:text-red-300">{lateDays}d overdue</Badge>}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <TaskAssignees
          project={project}
          task={task}
          pending={pending}
          onPatchTask={onPatchTask}
          onFilterByAssignee={onFilterByAssignee}
        />
      </TableCell>
      <TableCell>
        <Select
          value={task.priority}
          onValueChange={(value) => void onPatchTask(project.id, task.id, { priority: value as WorkspacePriority }, { priority: value as WorkspacePriority })}
          disabled={pending || !canEdit}
        >
          <SelectTrigger aria-label={`Priority for ${task.title}`} className={cn('h-8 border px-2 text-xs shadow-none', PRIORITY_CLASS[task.priority])}><SelectValue /></SelectTrigger>
          <SelectContent>{PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{PRIORITY_LABEL[priority]}</SelectItem>)}</SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  )
}

function TaskAssignees({
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
  const assignedPeople = taskAssignees(task)
  const projectPeople = [project.owner, ...project.members]
    .filter((person, index, people) => people.findIndex((candidate) => candidate.id === person.id) === index)
  const assignedIds = new Set(assignedPeople.map((person) => person.id))

  const summary = assignedPeople.length === 0 ? (
    <span className="text-xs text-muted-foreground">Unassigned</span>
  ) : (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex shrink-0 -space-x-1.5">
        {assignedPeople.slice(0, 3).map((person) => (
          <UserAvatar key={person.id} name={person.name} size="xs" className="ring-2 ring-background" />
        ))}
      </span>
      <span className="truncate text-xs">
        {assignedPeople.length === 1 ? assignedPeople[0].name : `${assignedPeople.length} people`}
      </span>
    </span>
  )

  if (!project.canManage) {
    if (assignedPeople.length === 0) return summary
    return (
      <div className="flex flex-wrap gap-1.5">
        {assignedPeople.map((person, index) => (
          <button
            key={person.id}
            type="button"
            onClick={() => onFilterByAssignee(person.id)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background px-2 py-1 text-[11px] transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Show tasks assigned to ${person.name}`}
            title={`${index === 0 && task.assignee?.id === person.id ? 'Primary assignee' : 'Co-assignee'}: ${person.name}`}
          >
            <UserAvatar name={person.name} size="xs" />
            <span className="max-w-28 truncate">{person.name}</span>
          </button>
        ))}
      </div>
    )
  }

  const togglePerson = (personId: string) => {
    const currentAssistantIds = (task.assistants || []).map((assistant) => assistant.user.id)
    let assigneeId = task.assigneeId
    let assistantIds = [...currentAssistantIds]

    if (personId === task.assigneeId) {
      assigneeId = assistantIds[0] || null
      assistantIds = assistantIds.slice(1)
    } else if (assistantIds.includes(personId)) {
      assistantIds = assistantIds.filter((id) => id !== personId)
    } else if (!assigneeId) {
      assigneeId = personId
    } else {
      assistantIds.push(personId)
    }

    const assignee = projectPeople.find((person) => person.id === assigneeId) || null
    const existingAssistants = new Map((task.assistants || []).map((assistant) => [assistant.user.id, assistant]))
    const assistants = assistantIds.flatMap((id) => {
      const person = projectPeople.find((candidate) => candidate.id === id)
      if (!person) return []
      return [existingAssistants.get(id) || {
        id: `optimistic-${task.id}-${id}`,
        user: person,
      }]
    })

    void onPatchTask(
      project.id,
      task.id,
      { assigneeId, assistantIds },
      { assigneeId, assignee, assistants },
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-8 w-full justify-start px-2 py-1 font-normal"
          aria-label={`Edit assignees for ${task.title}`}
          disabled={pending}
        >
          {summary}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Assigned people</DropdownMenuLabel>
        {projectPeople.map((person) => (
          <DropdownMenuCheckboxItem
            key={person.id}
            checked={assignedIds.has(person.id)}
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault()
              togglePerson(person.id)
            }}
            className="gap-2"
          >
            <UserAvatar name={person.name} size="xs" />
            <span className="min-w-0 flex-1 truncate">{person.name}</span>
            {task.assigneeId === person.id && (
              <Badge variant="outline" className="ml-auto px-1.5 text-[9px]">Primary</Badge>
            )}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  return (
    <TaskAssignees
      project={project}
      task={task}
      pending={pending}
      onPatchTask={onPatchTask}
      onFilterByAssignee={onFilterByAssignee}
    />
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
