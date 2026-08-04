'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Plus,
  X,
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
  AssigneeFilter,
  CreateProjectInput,
  ProjectPatchRequest,
  SortDirection,
  TaskOptimisticPatch,
  TaskPatchRequest,
  WorkspaceAssigneeTaskGroup,
  WorkspaceGroupMode,
  WorkspacePriority,
  WorkspaceProject,
  WorkspacePerson,
  WorkspaceProjectView,
  WorkspaceSortKey,
  WorkspaceTask,
  WorkspaceTaskItem,
} from './workspace-types'
import {
  assigneeIdForFilter,
  dateInputValue,
  displayDueDate,
  groupWorkspaceTaskItemsByAssignee,
  isDoneTask,
  isTaskOverdue,
  overdueDays,
  plainTextPreview,
  PRIORITY_CLASS,
  PRIORITY_LABEL,
  progressBand,
  relativeDueDate,
  sectionForColumn,
  sortWorkspaceTaskItems,
  sortTasks,
  taskAssignedPeople,
} from './workspace-utils'

interface WorkspaceTaskTableProps {
  projectViews: WorkspaceProjectView[]
  viewerId: string
  people: WorkspacePerson[]
  progressScopeLabel: string
  assigneeFilter: AssigneeFilter
  groupMode: WorkspaceGroupMode
  sortKey: WorkspaceSortKey
  sortDirection: SortDirection
  selectedIds: Set<string>
  pendingTaskIds: Set<string>
  backlogCollapsed: boolean
  quickAddProjects: WorkspaceProject[]
  quickAddProjectId: string
  quickAdding: boolean
  creatingTaskProjectIds: Set<string>
  creatingProject: boolean
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
  onCreateActiveTask: (projectId: string, title: string) => Promise<boolean>
  onCreateSubtask: (projectId: string, parentTaskId: string, title: string) => Promise<boolean>
  onCreateProject: (input: CreateProjectInput) => Promise<boolean>
  onPatchProject: (projectId: string, request: ProjectPatchRequest) => Promise<boolean>
}

const PRIORITIES: WorkspacePriority[] = ['HIGH', 'MEDIUM', 'LOW']
const PROJECT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#06b6d4']
const PROJECT_STATUSES: Array<{ value: NonNullable<ProjectPatchRequest['status']>; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
]

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
  people,
  progressScopeLabel,
  assigneeFilter,
  groupMode,
  sortKey,
  sortDirection,
  selectedIds,
  pendingTaskIds,
  backlogCollapsed,
  quickAddProjects,
  quickAddProjectId,
  quickAdding,
  creatingTaskProjectIds,
  creatingProject,
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
  onCreateActiveTask,
  onCreateSubtask,
  onCreateProject,
  onPatchProject,
}: WorkspaceTaskTableProps) {
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const scopeAssigneeId = assigneeIdForFilter(assigneeFilter, viewerId)
  const activeItems = sortWorkspaceTaskItems(
    projectViews.flatMap(({ project, visibleActiveTasks }) => (
      visibleActiveTasks.map((task) => ({ project, task }))
    )),
    sortKey,
    sortDirection,
  )
  const backlogItems = sortWorkspaceTaskItems(
    projectViews
      .filter(({ project }) => project.canUseBacklog)
      .flatMap(({ project, visibleBacklogTasks }) => (
        visibleBacklogTasks.map((task) => ({ project, task }))
      )),
    sortKey,
    sortDirection,
  )
  const assigneeGroups = groupWorkspaceTaskItemsByAssignee(activeItems, scopeAssigneeId)

  const orderedProjectViews = sortKey === 'project'
    ? [...projectViews].sort((left, right) => {
      const result = left.project.name.localeCompare(right.project.name, undefined, { sensitivity: 'base' })
      return sortDirection === 'asc' ? result : -result
    })
    : projectViews

  return (
    <div className="space-y-2">
      {groupMode === 'assignee' ? (
        <PersonTaskGroups
          groups={assigneeGroups}
          viewerId={viewerId}
          sortKey={sortKey}
          sortDirection={sortDirection}
          selectedIds={selectedIds}
          pendingTaskIds={pendingTaskIds}
          onSort={onSort}
          onToggleSelected={onToggleSelected}
          onToggleManySelected={onToggleManySelected}
          onPatchTask={onPatchTask}
          onOpenTask={onOpenTask}
          onFilterByAssignee={onFilterByAssignee}
        />
      ) : (
        <Card className="overflow-hidden rounded-lg border-border/60 shadow-none">
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
                    creatingTask={creatingTaskProjectIds.has(view.project.id)}
                    onOpenChange={(open) => setOpenProjectId(open ? view.project.id : null)}
                    onToggleSelected={onToggleSelected}
                    onToggleManySelected={onToggleManySelected}
                    onPatchTask={onPatchTask}
                    onOpenTask={onOpenTask}
                    onFilterByAssignee={onFilterByAssignee}
                    onRenameProject={onRenameProject}
                    onArchiveProject={onArchiveProject}
                    onCreateActiveTask={onCreateActiveTask}
                    onCreateSubtask={onCreateSubtask}
                    onPatchProject={onPatchProject}
                  />
                ))}
                <InlineProjectRow
                  people={people}
                  viewerId={viewerId}
                  creating={creatingProject}
                  onCreate={onCreateProject}
                />
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
        groupMode={groupMode}
        scopeAssigneeId={scopeAssigneeId}
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

interface WorkspaceTaskItemNode {
  item: WorkspaceTaskItem
  children: WorkspaceTaskItemNode[]
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

export function buildWorkspaceTaskItemTree(items: WorkspaceTaskItem[]): WorkspaceTaskItemNode[] {
  const itemKey = (item: WorkspaceTaskItem) => `${item.project.id}:${item.task.id}`
  const nodes = new Map(items.map((item) => [itemKey(item), { item, children: [] as WorkspaceTaskItemNode[] }]))
  const roots: WorkspaceTaskItemNode[] = []

  const hasParentCycle = (item: WorkspaceTaskItem) => {
    const seen = new Set([item.task.id])
    let parentId = item.task.parentTaskId
    while (parentId) {
      if (seen.has(parentId)) return true
      seen.add(parentId)
      const parent = nodes.get(`${item.project.id}:${parentId}`)
      if (!parent) return false
      parentId = parent.item.task.parentTaskId
    }
    return false
  }

  for (const item of items) {
    const node = nodes.get(itemKey(item))!
    const parent = item.task.parentTaskId
      ? nodes.get(`${item.project.id}:${item.task.parentTaskId}`)
      : undefined
    if (parent && item.task.parentTaskId !== item.task.id && !hasParentCycle(item)) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}

export function taskAssignees(task: WorkspaceTask) {
  return taskAssignedPeople(task)
}

function PersonTaskGroups({
  groups,
  viewerId,
  sortKey,
  sortDirection,
  selectedIds,
  pendingTaskIds,
  onSort,
  onToggleSelected,
  onToggleManySelected,
  onPatchTask,
  onOpenTask,
  onFilterByAssignee,
}: {
  groups: WorkspaceAssigneeTaskGroup[]
  viewerId: string
  sortKey: WorkspaceSortKey
  sortDirection: SortDirection
  selectedIds: Set<string>
  pendingTaskIds: Set<string>
  onSort: (key: WorkspaceSortKey) => void
  onToggleSelected: (taskId: string, selected: boolean) => void
  onToggleManySelected: (taskIds: string[], selected: boolean) => void
  onPatchTask: WorkspaceTaskTableProps['onPatchTask']
  onOpenTask: (projectId: string, taskId: string) => void
  onFilterByAssignee: (assigneeId: string) => void
}) {
  const [collapsedGroupIds, setCollapsedGroupIds] = useState(new Set<string>())
  const [collapsedTaskKeys, setCollapsedTaskKeys] = useState(new Set<string>())

  const toggleGroup = (groupId: string) => setCollapsedGroupIds((current) => {
    const next = new Set(current)
    if (next.has(groupId)) next.delete(groupId)
    else next.add(groupId)
    return next
  })

  const toggleTask = (taskKey: string) => setCollapsedTaskKeys((current) => {
    const next = new Set(current)
    if (next.has(taskKey)) next.delete(taskKey)
    else next.add(taskKey)
    return next
  })

  if (groups.length === 0) return null

  return (
    <div className="space-y-4" data-group-mode="assignee">
      {groups.map((group) => {
        const collapsed = collapsedGroupIds.has(group.id)
        const taskTree = buildWorkspaceTaskItemTree(group.items)
        const selectableIds = group.items
          .filter(({ project, task }) => canEditTask(project, task, viewerId))
          .map(({ task }) => task.id)
        const selectedCount = selectableIds.filter((id) => selectedIds.has(id)).length
        const groupName = group.person?.name || 'Unassigned'

        return (
          <Card key={group.id} className="overflow-hidden border-border/60 shadow-sm" data-assignee-group-id={group.id}>
            <div className="flex items-center gap-3 border-b border-border/50 bg-muted/20 px-4 py-3">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? 'Expand' : 'Collapse'} tasks for ${groupName}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !collapsed && 'rotate-90')} />
                <UserAvatar name={groupName} size="sm" />
                <span className="truncate font-semibold">{groupName}</span>
                <Badge variant="secondary">{group.items.length}</Badge>
              </button>
              <Checkbox
                checked={selectableIds.length > 0 && selectedCount === selectableIds.length
                  ? true
                  : selectedCount > 0 ? 'indeterminate' : false}
                onCheckedChange={(checked) => onToggleManySelected(selectableIds, checked === true)}
                aria-label={`Select all tasks for ${groupName}`}
                disabled={selectableIds.length === 0}
              />
            </div>

            {!collapsed && (
              <CardContent className="overflow-x-auto p-0">
                <Table className="min-w-[1180px]">
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="Task" sortKey="title" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="min-w-[310px]" />
                      <SortableHead label="Priority" sortKey="priority" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-36" />
                      <SortableHead label="Status" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-40" />
                      <SortableHead label="Assignees" sortKey="assignee" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="min-w-[220px]" />
                      <SortableHead label="Project" sortKey="project" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-48" />
                      <SortableHead label="Due date" sortKey="dueDate" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-44" />
                      <SortableHead label="Notes" sortKey="notes" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="min-w-[180px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taskTree.map((node) => (
                      <PersonTaskRows
                        key={`${group.id}:${node.item.project.id}:${node.item.task.id}`}
                        node={node}
                        groupId={group.id}
                        depth={0}
                        viewerId={viewerId}
                        selectedIds={selectedIds}
                        pendingTaskIds={pendingTaskIds}
                        collapsedTaskKeys={collapsedTaskKeys}
                        onToggleTask={toggleTask}
                        onToggleSelected={onToggleSelected}
                        onPatchTask={onPatchTask}
                        onOpenTask={onOpenTask}
                        onFilterByAssignee={onFilterByAssignee}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function PersonTaskRows({
  node,
  groupId,
  depth,
  viewerId,
  selectedIds,
  pendingTaskIds,
  collapsedTaskKeys,
  onToggleTask,
  onToggleSelected,
  onPatchTask,
  onOpenTask,
  onFilterByAssignee,
}: {
  node: WorkspaceTaskItemNode
  groupId: string
  depth: number
  viewerId: string
  selectedIds: Set<string>
  pendingTaskIds: Set<string>
  collapsedTaskKeys: Set<string>
  onToggleTask: (taskKey: string) => void
  onToggleSelected: (taskId: string, selected: boolean) => void
  onPatchTask: WorkspaceTaskTableProps['onPatchTask']
  onOpenTask: (projectId: string, taskId: string) => void
  onFilterByAssignee: (assigneeId: string) => void
}) {
  const taskKey = `${groupId}:${node.item.project.id}:${node.item.task.id}`
  const expanded = !collapsedTaskKeys.has(taskKey)

  return (
    <Fragment>
      <PersonTaskRow
        item={node.item}
        depth={depth}
        hasChildren={node.children.length > 0}
        expanded={expanded}
        viewerId={viewerId}
        selected={selectedIds.has(node.item.task.id)}
        pending={pendingTaskIds.has(node.item.task.id)}
        onToggleChildren={() => onToggleTask(taskKey)}
        onToggleSelected={onToggleSelected}
        onPatchTask={onPatchTask}
        onOpenTask={onOpenTask}
        onFilterByAssignee={onFilterByAssignee}
      />
      {expanded && node.children.map((child) => (
        <PersonTaskRows
          key={`${groupId}:${child.item.project.id}:${child.item.task.id}`}
          node={child}
          groupId={groupId}
          depth={depth + 1}
          viewerId={viewerId}
          selectedIds={selectedIds}
          pendingTaskIds={pendingTaskIds}
          collapsedTaskKeys={collapsedTaskKeys}
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

function PersonTaskRow({
  item,
  depth,
  hasChildren,
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
  item: WorkspaceTaskItem
  depth: number
  hasChildren: boolean
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
  const { project, task } = item
  const canEdit = canEditTask(project, task, viewerId)
  const done = isDoneTask(project, task)
  const overdue = isTaskOverdue(project, task)

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
      data-person-task-id={task.id}
      data-task-depth={depth}
      data-state={selected ? 'selected' : undefined}
      className={cn(overdue && 'bg-red-500/[0.07] hover:bg-red-500/[0.11]', pending && 'opacity-65')}
    >
      <TableCell>
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onToggleSelected(task.id, checked === true)}
            aria-label={`Select ${task.title}`}
            disabled={pending || !canEdit}
          />
          <Checkbox
            checked={done}
            onCheckedChange={(checked) => void toggleDone(checked === true)}
            aria-label={`Mark ${task.title} ${done ? 'incomplete' : 'complete'}`}
            disabled={pending || !canEdit}
            className="h-5 w-5 rounded-full"
          />
          {hasChildren ? (
            <button
              type="button"
              onClick={onToggleChildren}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} subtasks for ${task.title}`}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
            </button>
          ) : <span className="w-[18px] shrink-0" aria-hidden="true" />}
          {task.parentTaskId && <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Subtask" />}
          <div className="flex min-w-0 flex-1 flex-col">
            <InlineTitle project={project} task={task} pending={pending || !canEdit} onPatchTask={onPatchTask} />
            {task.parentTaskId && depth === 0 && (
              <span className="truncate px-2 text-[10px] text-muted-foreground">
                Subtask of {task.parentTask?.title || 'another task'}
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Select
          value={task.priority}
          onValueChange={(value) => void onPatchTask(project.id, task.id, { priority: value as WorkspacePriority }, { priority: value as WorkspacePriority })}
          disabled={pending || !canEdit}
        >
          <SelectTrigger aria-label={`Priority for ${task.title}`} className={cn('h-8 border px-2 text-xs shadow-none', PRIORITY_CLASS[task.priority])}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{PRIORITY_LABEL[priority]}</SelectItem>)}</SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="max-w-36 gap-1.5 font-normal">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: task.section?.color || '#94a3b8' }} />
          <span className="truncate">{task.section?.name || task.status.replace('_', ' ')}</span>
        </Badge>
      </TableCell>
      <TableCell>
        <TaskAssignees project={project} task={task} pending={pending} onPatchTask={onPatchTask} onFilterByAssignee={onFilterByAssignee} />
      </TableCell>
      <TableCell>
        <Link href={`/projects/${project.id}`} className="inline-flex max-w-44 items-center gap-2 text-xs font-medium hover:text-primary hover:underline">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color || '#94a3b8' }} />
          <span className="truncate">{project.name}</span>
        </Link>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <Input
            type="date"
            value={dateInputValue(task.dueDate)}
            onChange={(event) => void onPatchTask(project.id, task.id, { dueDate: event.target.value || null }, { dueDate: event.target.value || null })}
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
  )
}

export function InlineTaskComposer({
  projectName,
  creating,
  onCreate,
}: {
  projectName: string
  creating: boolean
  onCreate: (title: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')

  const close = () => {
    if (creating) return
    setTitle('')
    setEditing(false)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle || creating) return
    if (await onCreate(cleanTitle)) close()
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={creating}
        aria-label={`Add a task to ${projectName}`}
        className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        <span>New task</span>
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 items-center gap-2">
      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
        }}
        placeholder="Task name"
        aria-label={`New task name for ${projectName}`}
        disabled={creating}
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent shadow-none hover:border-border focus:border-border"
      />
      <Button type="submit" size="sm" className="h-8" disabled={creating || !title.trim()}>
        {creating ? 'Adding...' : 'Add'}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={close} disabled={creating}>
        Cancel
      </Button>
    </form>
  )
}

function ProjectColorPicker({
  value,
  disabled = false,
  label,
  onChange,
}: {
  value: string | null
  disabled?: boolean
  label: string
  onChange: (color: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          className="h-4 w-4 shrink-0 rounded-full border border-border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
          style={{ backgroundColor: value || '#94a3b8' }}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex items-center gap-1.5">
          {PROJECT_COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                onChange(preset)
                setOpen(false)
              }}
              aria-label={`Use project color ${preset}`}
              className="flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ backgroundColor: preset }}
            >
              {value === preset ? <Check className="h-3.5 w-3.5 text-white" /> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function InlineProjectRow({
  people,
  viewerId,
  creating,
  onCreate,
}: {
  people: WorkspacePerson[]
  viewerId: string
  creating: boolean
  onCreate: (input: CreateProjectInput) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const availablePeople = people.filter((person) => person.id !== viewerId)

  const close = () => {
    if (creating) return
    setEditing(false)
    setName('')
    setDescription('')
    setColor(null)
    setMemberIds([])
  }

  const submit = async () => {
    const cleanName = name.trim()
    if (!cleanName || creating) return
    const ok = await onCreate({
      name: cleanName,
      description: description.trim(),
      color,
      memberIds,
    })
    if (ok) close()
  }

  const toggleMember = (personId: string) => {
    setMemberIds((current) => current.includes(personId)
      ? current.filter((id) => id !== personId)
      : [...current, personId])
  }

  if (!editing) {
    return (
      <TableRow data-row-kind="new-project" className="border-dashed hover:bg-muted/30">
        <TableCell colSpan={5} className="p-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New project</span>
          </button>
        </TableCell>
      </TableRow>
    )
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') close()
    if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <TableRow data-row-kind="new-project" className="border-dashed bg-muted/10 hover:bg-muted/20 [&>td]:px-2 [&>td]:py-1">
      <TableCell>
        <div className="flex min-w-0 items-center gap-1.5">
          <ProjectColorPicker
            value={color}
            disabled={creating}
            label="Choose project color"
            onChange={setColor}
          />
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Project name"
            aria-label="New project name"
            disabled={creating}
            className="h-7 min-w-0 border-transparent bg-transparent px-1.5 text-sm font-medium shadow-none hover:border-border focus:border-border"
          />
        </div>
      </TableCell>
      <TableCell>
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Description (optional)"
          aria-label="New project description"
          disabled={creating}
          className="h-7 border-transparent bg-transparent px-1.5 text-xs shadow-none hover:border-border focus:border-border"
        />
      </TableCell>
      <TableCell>
        <span className="px-1.5 text-[11px] text-muted-foreground">Set on tasks</span>
      </TableCell>
      <TableCell>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 justify-start px-1.5 text-xs font-normal" disabled={creating}>
              {memberIds.length > 0 ? `${memberIds.length + 1} people` : 'Just me'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-1">
            <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Project members</p>
            <div className="max-h-48 overflow-y-auto">
              {availablePeople.map((person) => {
                const selected = memberIds.includes(person.id)
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => toggleMember(person.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UserAvatar name={person.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{person.name}</span>
                    {selected ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                  </button>
                )
              })}
              {availablePeople.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">No teammates available.</p>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={() => void submit()} disabled={creating || !name.trim()}>
            {creating ? 'Creating...' : 'Create'}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={close} disabled={creating} aria-label="Cancel new project">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
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
  creatingTask,
  onOpenChange,
  onToggleSelected,
  onToggleManySelected,
  onPatchTask,
  onOpenTask,
  onFilterByAssignee,
  onRenameProject,
  onArchiveProject,
  onCreateActiveTask,
  onCreateSubtask,
  onPatchProject,
}: {
  view: WorkspaceProjectView
  viewerId: string
  progressScopeLabel: string
  sortKey: WorkspaceSortKey
  sortDirection: SortDirection
  selectedIds: Set<string>
  pendingTaskIds: Set<string>
  open: boolean
  creatingTask: boolean
  onOpenChange: (open: boolean) => void
  onToggleSelected: (taskId: string, selected: boolean) => void
  onToggleManySelected: (taskIds: string[], selected: boolean) => void
  onPatchTask: WorkspaceTaskTableProps['onPatchTask']
  onOpenTask: (projectId: string, taskId: string) => void
  onFilterByAssignee: (assigneeId: string) => void
  onRenameProject: (project: WorkspaceProject) => void
  onArchiveProject: (project: WorkspaceProject) => void
  onCreateActiveTask: (projectId: string, title: string) => Promise<boolean>
  onCreateSubtask: WorkspaceTaskTableProps['onCreateSubtask']
  onPatchProject: WorkspaceTaskTableProps['onPatchProject']
}) {
  const { project, progress } = view
  const tasks = sortTasks(project, view.visibleActiveTasks, sortKey, sortDirection)
  const [nameDraft, setNameDraft] = useState(project.name)
  const [colorDraft, setColorDraft] = useState(project.color)
  const [statusDraft, setStatusDraft] = useState(project.status)
  const [savingName, setSavingName] = useState(false)
  const [savingColor, setSavingColor] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
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

  useEffect(() => setNameDraft(project.name), [project.name])
  useEffect(() => setColorDraft(project.color), [project.color])
  useEffect(() => setStatusDraft(project.status), [project.status])

  const saveName = async () => {
    const name = nameDraft.trim()
    if (!project.canManage || savingName || name === project.name) return
    if (!name) {
      setNameDraft(project.name)
      return
    }
    setSavingName(true)
    const ok = await onPatchProject(project.id, { name })
    if (!ok) setNameDraft(project.name)
    setSavingName(false)
  }

  const saveColor = async (color: string) => {
    if (!project.canManage || savingColor || color === project.color) return
    setColorDraft(color)
    setSavingColor(true)
    const ok = await onPatchProject(project.id, { color })
    if (!ok) setColorDraft(project.color)
    setSavingColor(false)
  }

  const saveStatus = async (status: NonNullable<ProjectPatchRequest['status']>) => {
    if (!project.canManage || savingStatus || status === project.status) return
    setStatusDraft(status)
    setSavingStatus(true)
    const ok = await onPatchProject(project.id, { status })
    if (!ok) setStatusDraft(project.status)
    setSavingStatus(false)
  }

  return (
    <TableRow data-row-kind="project" className="bg-muted/10 hover:bg-muted/30 [&>td]:py-1">
      <TableCell
        className="py-1"
        style={{ borderLeftColor: project.color || 'transparent', borderLeftStyle: 'solid', borderLeftWidth: 3 }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
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
                className="group flex h-6 w-6 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform group-hover:text-foreground', open && 'rotate-90')} />
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

              <OpenedProjectTaskTable
                project={project}
                tasks={tasks}
                viewerId={viewerId}
                selectedIds={selectedIds}
                pendingTaskIds={pendingTaskIds}
                creatingTask={creatingTask}
                emptyMessage={project.tasks.length === 0
                  ? 'No active tasks yet. Add the first task below.'
                  : 'No active tasks match this view. Add one below or try another teammate, status, or search filter.'}
                scrollClassName="max-h-[70vh]"
                onToggleSelected={onToggleSelected}
                onPatchTask={onPatchTask}
                onOpenTask={onOpenTask}
                onFilterByAssignee={onFilterByAssignee}
                onCreateTask={(parentTaskId, title) => parentTaskId
                  ? onCreateSubtask(project.id, parentTaskId, title)
                  : onCreateActiveTask(project.id, title)}
              />
            </PopoverContent>
          </Popover>

          {project.canManage ? (
            <ProjectColorPicker
              value={colorDraft}
              disabled={savingColor}
              label={`Change color for ${project.name}`}
              onChange={(color) => void saveColor(color)}
            />
          ) : (
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: project.color || '#94a3b8' }}
              aria-label={`${project.name} color`}
              role="img"
            />
          )}

          {project.canManage ? (
            <Input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
                if (event.key === 'Escape') {
                  setNameDraft(project.name)
                  event.currentTarget.blur()
                }
              }}
              aria-label={`Project name for ${project.name}`}
              disabled={savingName}
              className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-border focus:border-border disabled:opacity-70"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate px-1 font-semibold text-foreground">{project.name}</span>
          )}

          {project.canManage ? (
            <Select
              value={statusDraft}
              onValueChange={(status) => void saveStatus(status as NonNullable<ProjectPatchRequest['status']>)}
              disabled={savingStatus}
            >
              <SelectTrigger
                aria-label={`Project status for ${project.name}`}
                className={cn('h-7 w-[104px] shrink-0 border px-2 text-[10px] font-medium uppercase shadow-none', STATUS_CLASS[statusDraft])}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className={cn('shrink-0 px-1.5 py-0 text-[9px]', STATUS_CLASS[project.status])}>
              {project.status.replace('_', ' ')}
            </Badge>
          )}

          {hasOverdue && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.14)]"
              title="This project has overdue tasks"
              role="img"
              aria-label="This project has overdue tasks"
            />
          )}

          <ProjectActions project={project} onRenameProject={onRenameProject} onArchiveProject={onArchiveProject} />
        </div>

        <div className="mt-0.5 flex max-w-sm items-center gap-1.5 pl-[4.65rem]">
          <div
            className={cn('h-1 min-w-0 flex-1 overflow-hidden rounded-full', band.track)}
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
      </TableCell>
      <TableCell>
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={`Open tasks for ${project.name}`}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Badge variant="secondary" className="px-2 py-0 text-[10px] font-normal hover:bg-primary/15">{tasks.length} active</Badge>
        </button>
      </TableCell>
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

export function OpenedProjectTaskTable({
  project,
  tasks,
  viewerId,
  selectedIds = new Set<string>(),
  pendingTaskIds = new Set<string>(),
  creatingTask = false,
  defaultExpandAll = false,
  emptyMessage = 'No tasks yet. Add the first task below.',
  scrollClassName,
  onToggleSelected = () => undefined,
  onPatchTask,
  onOpenTask,
  onFilterByAssignee = () => undefined,
  onCreateTask,
}: {
  project: WorkspaceProject
  tasks: WorkspaceTask[]
  viewerId: string
  selectedIds?: Set<string>
  pendingTaskIds?: Set<string>
  creatingTask?: boolean
  defaultExpandAll?: boolean
  emptyMessage?: string
  scrollClassName?: string
  onToggleSelected?: (taskId: string, selected: boolean) => void
  onPatchTask: WorkspaceTaskTableProps['onPatchTask']
  onOpenTask: (projectId: string, taskId: string) => void
  onFilterByAssignee?: (assigneeId: string) => void
  onCreateTask: (parentTaskId: string | null, title: string) => Promise<boolean>
}) {
  const taskTree = buildWorkspaceTaskTree(tasks)
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => (
    defaultExpandAll
      ? new Set(tasks
        .filter((task) => tasks.some((candidate) => candidate.parentTaskId === task.id))
        .map((task) => task.id))
      : new Set()
  ))

  const toggleTask = (taskId: string) => setExpandedTaskIds((current) => {
    const next = new Set(current)
    if (next.has(taskId)) next.delete(taskId)
    else next.add(taskId)
    return next
  })

  return (
    <div className="min-w-0">
      {tasks.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <div className={cn('overflow-auto', scrollClassName)}>
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
                  onCreateTask={onCreateTask}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {project.status !== 'ARCHIVED' && (
        <div className="border-t border-border/60 px-4 py-2">
          <InlineTaskComposer
            projectName={project.name}
            creating={creatingTask}
            onCreate={(title) => onCreateTask(null, title)}
          />
        </div>
      )}
    </div>
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
  onCreateTask,
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
  onCreateTask: (parentTaskId: string | null, title: string) => Promise<boolean>
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
      {project.status !== 'ARCHIVED' && canEditTask(project, task, viewerId) && (
        <InlineSubtaskComposerRow
          parentTask={task}
          depth={depth + 1}
          onCreate={async (title) => {
            const ok = await onCreateTask(task.id, title)
            if (ok && !expanded) onToggleTask(task.id)
            return ok
          }}
        />
      )}
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
          onCreateTask={onCreateTask}
        />
      ))}
    </Fragment>
  )
}

export function InlineSubtaskComposerRow({
  parentTask,
  depth,
  onCreate,
}: {
  parentTask: Pick<WorkspaceTask, 'id' | 'title'>
  depth: number
  onCreate: (title: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const close = () => {
    if (creating) return
    setEditing(false)
    setTitle('')
  }

  const submit = async () => {
    const cleanTitle = title.trim()
    if (!cleanTitle || creating) return
    setCreating(true)
    const ok = await onCreate(cleanTitle)
    setCreating(false)
    if (ok) close()
  }

  return (
    <TableRow
      data-row-kind="new-subtask"
      data-parent-task-id={parentTask.id}
      data-task-depth={depth}
      className="border-0 bg-popover hover:bg-muted/20"
    >
      <TableCell colSpan={4} className="h-7 py-0" style={{ paddingLeft: `${24 + depth * 24}px` }}>
        {editing ? (
          <div className="flex min-w-0 items-center gap-1.5 py-1">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void submit()
                }
                if (event.key === 'Escape') close()
              }}
              placeholder="Subtask name"
              aria-label={`New subtask under ${parentTask.title}`}
              disabled={creating}
              className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-xs shadow-none hover:border-border focus:border-border"
            />
            <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={() => void submit()} disabled={creating || !title.trim()}>
              {creating ? 'Adding...' : 'Add'}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={close} disabled={creating} aria-label={`Cancel subtask under ${parentTask.title}`}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Add subtask under ${parentTask.title}`}
            className="flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Plus className="h-3 w-3" />
            <span>New subtask</span>
          </button>
        )}
      </TableCell>
    </TableRow>
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
    <TableHead className={cn('h-8 px-2 text-xs', className)} aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  groupMode,
  scopeAssigneeId,
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
  items: WorkspaceTaskItem[]
  viewerId: string
  collapsed: boolean
  sortKey: WorkspaceSortKey
  sortDirection: SortDirection
  groupMode: WorkspaceGroupMode
  scopeAssigneeId: string | null
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
  const [collapsedGroupIds, setCollapsedGroupIds] = useState(new Set<string>())
  const assigneeGroups = groupWorkspaceTaskItemsByAssignee(items, scopeAssigneeId)
  const ids = items
    .filter(({ project, task }) => canEditTask(project, task, viewerId))
    .map(({ task }) => task.id)
  const selectedCount = ids.filter((id) => selectedIds.has(id)).length

  const toggleGroup = (groupId: string) => setCollapsedGroupIds((current) => {
    const next = new Set(current)
    if (next.has(groupId)) next.delete(groupId)
    else next.add(groupId)
    return next
  })
  const backlogRows = groupMode === 'assignee'
    ? assigneeGroups.flatMap((group) => [
      { type: 'group' as const, group },
      ...(collapsedGroupIds.has(group.id) ? [] : group.items.map((item) => ({
        type: 'task' as const,
        groupId: group.id,
        item,
      }))),
    ])
    : items.map((item) => ({ type: 'task' as const, groupId: 'all', item }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    const ok = await onQuickAdd(cleanTitle)
    if (ok) setTitle('')
  }

  return (
    <Card className="overflow-hidden rounded-lg border-dashed border-border/70 bg-muted/10 shadow-none">
      <div className="flex flex-col gap-2 border-b border-border/50 px-3 py-2 lg:flex-row lg:items-center">
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
                {backlogRows.map((row) => {
                  if (row.type === 'group') {
                    const groupName = row.group.person?.name || 'Unassigned'
                    const groupCollapsed = collapsedGroupIds.has(row.group.id)
                    return (
                      <TableRow key={`group:${row.group.id}`} className="bg-muted/30 hover:bg-muted/40" data-backlog-assignee-group-id={row.group.id}>
                        <TableCell colSpan={7} className="py-2">
                          <button
                            type="button"
                            onClick={() => toggleGroup(row.group.id)}
                            aria-expanded={!groupCollapsed}
                            aria-label={`${groupCollapsed ? 'Expand' : 'Collapse'} backlog tasks for ${groupName}`}
                            className="flex items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', !groupCollapsed && 'rotate-90')} />
                            <UserAvatar name={groupName} size="xs" />
                            <span className="font-semibold">{groupName}</span>
                            <Badge variant="secondary">{row.group.items.length}</Badge>
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  }
                  const { project, task } = row.item
                  return (
                  <TableRow key={`${row.groupId}:${project.id}:${task.id}`} data-state={selectedIds.has(task.id) ? 'selected' : undefined} className={pendingTaskIds.has(task.id) ? 'opacity-65' : undefined}>
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
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  )
}
