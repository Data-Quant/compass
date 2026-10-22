'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronRight,
  FileText,
  ListChecks,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PeopleSearchList } from './PeopleSearchList'
import { PriorityPill } from './PriorityPill'
import { PeopleStack } from './PeopleStack'
import { DueDatePicker } from './DueDatePicker'
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
  daysFromToday,
  displayDueDate,
  groupWorkspaceTaskItemsByAssignee,
  isDoneTask,
  isRowNavigationClick,
  isTaskOverdue,
  plainTextPreview,
  PRIORITY_CLASS,
  PRIORITY_LABEL,
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

function TaskLabelBadges({ task, className }: { task: WorkspaceTask; className?: string }) {
  if (task.labelAssignments.length === 0) return null

  return (
    <div className={cn('flex min-w-0 flex-wrap gap-1', className)} aria-label={`Labels for ${task.title}`}>
      {task.labelAssignments.map((assignment) => (
        <span
          key={assignment.label.id}
          title={assignment.label.name}
          className="max-w-32 truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-none"
          style={{
            backgroundColor: `${assignment.label.color}20`,
            color: assignment.label.color,
          }}
        >
          {assignment.label.name}
        </span>
      ))}
    </div>
  )
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
        <Card className="overflow-hidden rounded-xl border-border shadow-none">
          <CardContent className="overflow-x-auto p-0">
            {/* 360px for the name plus the fixed columns; below that the table scrolls sideways. */}
            <Table className="min-w-[1220px] table-fixed">
              <TableHeader>
                <TableRow>
                  <SortableHead label="Project" sortKey="project" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="min-w-[360px]" />
                  <TableHead className="h-9 w-[120px] px-2 text-xs font-medium text-muted-foreground">Status</TableHead>
                  <TableHead className="h-9 w-[160px] px-2 text-xs font-medium text-muted-foreground">{progressScopeLabel} progress</TableHead>
                  <SortableHead label="Tasks" sortKey="title" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-24" />
                  <SortableHead label="Deadline" sortKey="dueDate" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-[150px]" />
                  <SortableHead label="People" sortKey="assignee" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-[170px]" />
                  <SortableHead label="Priority" sortKey="priority" activeKey={sortKey} direction={sortDirection} onSort={onSort} className="w-[120px]" />
                  <TableHead className="h-9 w-11 px-2"><span className="sr-only">Actions</span></TableHead>
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
            <TaskLabelBadges task={task} className="px-2 pt-0.5" />
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
        <DueDatePicker
          dueDate={task.dueDate}
          done={done}
          overdue={overdue}
          disabled={pending || !canEdit}
          ariaLabel={`Due date for ${task.title}`}
          onChange={(dueDate) => void onPatchTask(project.id, task.id, { dueDate }, { dueDate })}
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
          className="group flex h-5 w-5 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
        >
          <span
            className="h-2.5 w-2.5 rounded-full border border-border transition-transform group-hover:scale-125"
            style={{ backgroundColor: value || '#94a3b8' }}
          />
        </button>
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
        <TableCell colSpan={8} className="p-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
      <TableCell colSpan={3}>
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
      <TableCell colSpan={2}>
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
  const [priorityDraft, setPriorityDraft] = useState(project.priority)
  const [savingPriority, setSavingPriority] = useState(false)
  const selectableTaskIds = tasks.filter((task) => canEditTask(project, task, viewerId)).map((task) => task.id)
  const selectedCount = selectableTaskIds.filter((id) => selectedIds.has(id)).length
  const hasOverdue = tasks.some((task) => isTaskOverdue(project, task))
  const progressText = progress.total === 0 ? 'No tasks' : `${progress.completed} of ${progress.total}`
  const nearestDeadline = tasks
    .map((task) => task.dueDate)
    .filter((dueDate): dueDate is string => Boolean(dueDate))
    .sort()[0] || null
  const assignedPeople = tasks
    .flatMap(taskAssignees)
    .filter((person, index, people) => people.findIndex((candidate) => candidate.id === person.id) === index)

  const router = useRouter()

  useEffect(() => setNameDraft(project.name), [project.name])
  useEffect(() => setPriorityDraft(project.priority), [project.priority])
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

  const savePriority = async (priority: WorkspacePriority) => {
    if (!project.canManage || savingPriority || priority === project.priority) return
    setPriorityDraft(priority)
    setSavingPriority(true)
    const ok = await onPatchProject(project.id, { priority })
    if (!ok) setPriorityDraft(project.priority)
    setSavingPriority(false)
  }

  return (
    <TableRow
      data-row-kind="project"
      className={cn('group/row h-12 cursor-pointer bg-card hover:bg-muted/40 [&>td]:px-2 [&>td]:py-1.5', selectedCount > 0 && 'bg-primary/[0.04]')}
      onClick={(event) => {
        if (isRowNavigationClick(event.target as Element, event.currentTarget)) router.push(`/projects/${project.id}`)
      }}
    >
      <TableCell>
        <div className="flex min-w-0 items-center gap-1.5">
          <Checkbox
            checked={selectableTaskIds.length > 0 && selectedCount === selectableTaskIds.length
              ? true
              : selectedCount > 0 ? 'indeterminate' : false}
            onCheckedChange={(checked) => onToggleManySelected(selectableTaskIds, checked === true)}
            aria-label={`Select all visible tasks in ${project.name}`}
            disabled={selectableTaskIds.length === 0}
            className="rounded"
          />

          <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${open ? 'Close' : 'Open'} tasks for ${project.name}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
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
                    {tasks.length} active {tasks.length === 1 ? 'task' : 'tasks'}. Expand a task to see its subtasks.
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
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: project.color || '#94a3b8' }}
              aria-label={`${project.name} color`}
              role="img"
            />
          )}

          {project.canManage ? (
            // The clamped text shows the full name (2 lines); the transparent input on top takes clicks and is the editor.
            <div className="group/name relative min-w-0 flex-1 rounded-md hover:bg-muted/60" title={project.name}>
              <span
                aria-hidden
                className={cn('line-clamp-2 break-words px-2 py-1.5 text-sm font-medium leading-5 group-focus-within/name:invisible', savingName && 'opacity-70')}
              >
                {nameDraft || ' '}
              </span>
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
                className="absolute inset-0 h-full min-w-0 border-transparent bg-transparent px-2 text-sm font-medium opacity-0 shadow-none focus:border-input focus:bg-background focus:opacity-100"
              />
            </div>
          ) : (
            <Link
              href={`/projects/${project.id}`}
              title={project.name}
              className="line-clamp-2 min-w-0 flex-1 break-words px-2 text-sm font-medium text-foreground hover:underline"
            >
              {project.name}
            </Link>
          )}
        </div>
      </TableCell>
      <TableCell>
        {project.canManage ? (
          <Select
            value={statusDraft}
            onValueChange={(status) => void saveStatus(status as NonNullable<ProjectPatchRequest['status']>)}
            disabled={savingStatus}
          >
            <SelectTrigger
              aria-label={`Project status for ${project.name}`}
              className="h-7 w-auto gap-1.5 border-transparent bg-transparent px-2 text-xs font-normal shadow-none hover:bg-muted data-[state=open]:bg-muted [&>svg]:opacity-0 group-hover/row:[&>svg]:opacity-50 focus-visible:[&>svg]:opacity-50"
            >
              <ProjectStatusLabel status={statusDraft} />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}><ProjectStatusLabel status={status.value} /></SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="inline-flex h-7 items-center px-2 text-xs"><ProjectStatusLabel status={project.status} /></span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div
            className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${project.name} ${progressScopeLabel.toLocaleLowerCase()} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent ?? 0}
            aria-valuetext={`${progressScopeLabel}: ${progressText}`}
          >
            <div
              className={cn('h-full rounded-full transition-[width] duration-300', progress.percent === 100 ? 'bg-emerald-500' : 'bg-foreground/60')}
              style={{ width: `${progress.percent ?? 0}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{progressText}</span>
        </div>
      </TableCell>
      <TableCell>
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={`Open tasks for ${project.name}`}
          className="rounded-sm text-xs tabular-nums text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tasks.length} active
        </button>
      </TableCell>
      <TableCell>
        {nearestDeadline ? (
          <div className="flex items-center gap-1.5">
            {hasOverdue && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                title="This project has overdue tasks"
                role="img"
                aria-label="This project has overdue tasks"
              />
            )}
            <div className="min-w-0">
              <p className={cn('text-[13px] tabular-nums', (daysFromToday(nearestDeadline) ?? 0) < 0 && 'text-red-600 dark:text-red-400')}>
                {displayDueDate(nearestDeadline)}
              </p>
              <p className="text-xs text-muted-foreground">{relativeDueDate(nearestDeadline)}</p>
            </div>
          </div>
        ) : <span className="text-xs text-muted-foreground">No deadline</span>}
      </TableCell>
      <TableCell>
        {assignedPeople.length > 0 ? (
          <div className="flex min-w-0 items-center gap-1.5" title={assignedPeople.map((person) => person.name).join(', ')}>
            <div className="flex -space-x-1.5">
              {assignedPeople.slice(0, 3).map((person) => (
                <UserAvatar key={person.id} name={person.name} size="xs" className="h-6 w-6 text-[10px] ring-2 ring-card" />
              ))}
            </div>
            {assignedPeople.length > 3 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">+{assignedPeople.length - 3}</span>
            )}
            {assignedPeople.length === 1 && (
              <span className="truncate text-xs">{assignedPeople[0].name.split(' ')[0]}</span>
            )}
          </div>
        ) : <span className="text-xs text-muted-foreground">Unassigned</span>}
      </TableCell>
      <TableCell>
        <PriorityPill
          priority={project.canManage ? priorityDraft : project.priority}
          editable={project.canManage}
          disabled={savingPriority}
          onChange={(priority) => void savePriority(priority)}
          ariaLabel={`Project priority for ${project.name}`}
        />
      </TableCell>
      <TableCell className="text-right">
        <ProjectActions project={project} onRenameProject={onRenameProject} onArchiveProject={onArchiveProject} />
      </TableCell>
    </TableRow>
  )
}

const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'bg-emerald-500',
  ON_HOLD: 'bg-amber-500',
  COMPLETED: 'bg-sky-500',
  ARCHIVED: 'bg-slate-400',
}

function ProjectStatusLabel({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[status] || 'bg-slate-400')} />
      {PROJECT_STATUSES.find((option) => option.value === status)?.label || status}
    </span>
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
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label={`Project actions for ${project.name}`}
        >
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
          <Table className="min-w-[760px] table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-popover">
              <TableRow className="hover:bg-transparent [&>th]:h-9 [&>th]:px-2 [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground">
                <TableHead>Task</TableHead>
                <TableHead className="w-36">Due</TableHead>
                <TableHead className="w-52">Assignees</TableHead>
                <TableHead className="w-32">Priority</TableHead>
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
        <div className="border-t px-3 py-2">
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
  const canAddSubtask = project.status !== 'ARCHIVED' && canEditTask(project, task, viewerId)
  // The hover "+" opens the composer in edit mode; expanded parents also keep an idle one after their children.
  const [composing, setComposing] = useState(false)
  const composer = canAddSubtask && (expanded || composing) ? (
    <InlineSubtaskComposerRow
      parentTask={task}
      depth={depth + 1}
      editing={composing}
      onEditingChange={setComposing}
      onCreate={async (title) => {
        const ok = await onCreateTask(task.id, title)
        if (ok && !expanded) onToggleTask(task.id)
        return ok
      }}
    />
  ) : null
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
        onAddSubtask={canAddSubtask ? () => setComposing(true) : undefined}
      />
      {!expanded && composer}
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
      {expanded && composer}
    </Fragment>
  )
}

export function InlineSubtaskComposerRow({
  parentTask,
  depth,
  onCreate,
  editing: editingProp,
  onEditingChange,
}: {
  parentTask: Pick<WorkspaceTask, 'id' | 'title'>
  depth: number
  onCreate: (title: string) => Promise<boolean>
  /** Optional control from the parent row's hover "+" button. */
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
}) {
  const [localEditing, setLocalEditing] = useState(false)
  const editing = editingProp ?? localEditing
  const setEditing = onEditingChange ?? setLocalEditing
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
      {/* Lines up with the child title: select gutter (20) + chevron spacer (24) + toggle (16) + gaps. */}
      <TableCell colSpan={4} className="h-8 py-0" style={{ paddingLeft: `${8 + 20 + depth * 20 + 52}px` }}>
        {editing ? (
          <div className="flex min-w-0 items-center gap-1.5">
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
            className="flex h-7 w-full items-center gap-1.5 rounded px-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
  onAddSubtask,
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
  onAddSubtask?: () => void
}) {
  const done = isDoneTask(project, task)
  const overdue = isTaskOverdue(project, task)
  const canEdit = canEditTask(project, task, viewerId)
  const labels = task.labelAssignments
  const hiddenLabels = labels.slice(2)

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
      aria-busy={pending || undefined}
      className={cn(
        'group/row h-10 bg-popover hover:bg-muted/40 data-[state=selected]:bg-primary/[0.04] [&>td]:px-2 [&>td]:py-1',
        pending && 'opacity-60',
      )}
    >
      <TableCell>
        <div className="flex min-w-0 items-center gap-1">
          <span className="flex w-5 shrink-0 justify-center">
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onToggleSelected(task.id, checked === true)}
              aria-label={`Select ${task.title}`}
              disabled={pending || !canEdit}
              className="rounded opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=checked]:opacity-100 [@media(hover:none)]:opacity-100"
            />
          </span>
          {depth > 0 && <span className="shrink-0" style={{ width: `${depth * 20}px` }} aria-hidden="true" />}
          {depth > 0 && <span className="sr-only">Subtask</span>}
          {childCount > 0 ? (
            <button
              type="button"
              onClick={onToggleChildren}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} subtasks for ${task.title}`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
            </button>
          ) : <span className="h-6 w-6 shrink-0" aria-hidden="true" />}
          <Checkbox
            checked={done}
            onCheckedChange={(checked) => void toggleDone(checked === true)}
            aria-label={`Mark ${task.title} ${done ? 'incomplete' : 'complete'}`}
            disabled={pending || !canEdit}
            className="h-4 w-4 rounded-full border-[1.5px] border-muted-foreground/50 shadow-none hover:border-emerald-500 data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white [&_svg]:h-3 [&_svg]:w-3"
          />
          <InlineTitle project={project} task={task} pending={pending || !canEdit} onPatchTask={onPatchTask} />
          {labels.length > 0 && (
            <span className="flex shrink-0 items-center gap-1" aria-label={`Labels for ${task.title}`}>
              {labels.slice(0, 2).map((assignment) => (
                <span
                  key={assignment.label.id}
                  title={assignment.label.name}
                  className="max-w-24 truncate rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium leading-none"
                  style={{ backgroundColor: `${assignment.label.color}20`, color: assignment.label.color }}
                >
                  {assignment.label.name}
                </span>
              ))}
              {hiddenLabels.length > 0 && (
                <span className="text-[11px] tabular-nums text-muted-foreground" title={hiddenLabels.map((assignment) => assignment.label.name).join(', ')}>
                  +{hiddenLabels.length}
                </span>
              )}
            </span>
          )}
          {childCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground" title={`${childCount} subtasks`}>
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
              {childCount}
            </span>
          )}
          {task.completedLate && (
            <span className="shrink-0 whitespace-nowrap text-[11px] text-orange-600 dark:text-orange-400">Completed late</span>
          )}
          {onAddSubtask && (
            <button
              type="button"
              onClick={onAddSubtask}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100 [@media(hover:none)]:opacity-100"
              aria-label={`Add subtask under ${task.title}`}
              title="Add subtask"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenTask(project.id, task.id)}
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              !task.description && 'opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100',
            )}
            aria-label={`Open notes and details for ${task.title}`}
            title={plainTextPreview(task.description) || 'Open notes and details'}
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
        </div>
      </TableCell>
      <TableCell>
        <DueDatePicker
          dueDate={task.dueDate}
          done={done}
          overdue={overdue}
          disabled={pending || !canEdit}
          ariaLabel={`Due date for ${task.title}`}
          onChange={(dueDate) => void onPatchTask(project.id, task.id, { dueDate }, { dueDate })}
        />
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
        <PriorityPill
          priority={task.priority}
          editable
          disabled={pending || !canEdit}
          ariaLabel={`Priority for ${task.title}`}
          onChange={(priority) => void onPatchTask(project.id, task.id, { priority }, { priority })}
        />
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

  const summary = (
    <PeopleStack
      assignee={task.assignee || null}
      assistants={(task.assistants || []).filter((assistant) => assistant.user.id !== task.assignee?.id)}
      size="md"
    />
  )

  if (!project.canManage) {
    if (assignedPeople.length === 0) return summary
    const hidden = assignedPeople.slice(3)
    return (
      <span className="inline-flex min-w-0 items-center">
        <span className="flex -space-x-1.5">
          {assignedPeople.slice(0, 3).map((person, index) => (
            <button
              key={person.id}
              type="button"
              onClick={() => onFilterByAssignee(person.id)}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Show tasks assigned to ${person.name}`}
              title={`${index === 0 && task.assignee?.id === person.id ? 'Primary assignee' : 'Co-assignee'}: ${person.name}`}
            >
              <UserAvatar name={person.name} size="xs" className="ring-2 ring-card" title={`${index === 0 && task.assignee?.id === person.id ? 'Primary assignee' : 'Co-assignee'}: ${person.name}`} />
            </button>
          ))}
        </span>
        {hidden.length > 0 && (
          <span className="ml-1 text-[11px] tabular-nums text-muted-foreground" title={hidden.map((person) => person.name).join(', ')}>
            +{hidden.length}
          </span>
        )}
        {assignedPeople.length === 1 && (
          <span className="ml-1.5 max-w-[96px] truncate text-xs text-foreground">{assignedPeople[0].name.split(' ')[0]}</span>
        )}
      </span>
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
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-8 max-w-full justify-start px-2 py-1 font-normal"
          aria-label={`Edit assignees for ${task.title}`}
          disabled={pending}
        >
          {summary}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        <div className="px-2 py-1.5 text-sm font-semibold">Assigned people</div>
        <PeopleSearchList people={projectPeople}>
          {(filtered) => (
            <div className="max-h-60 overflow-y-auto">
              {filtered.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  role="checkbox"
                  data-person-option
                  aria-checked={assignedIds.has(person.id)}
                  disabled={pending}
                  onClick={() => togglePerson(person.id)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-50"
                >
                  <Check className={cn('h-4 w-4 shrink-0', !assignedIds.has(person.id) && 'opacity-0')} />
                  <UserAvatar name={person.name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-left">{person.name}</span>
                  {task.assigneeId === person.id && (
                    <Badge variant="outline" className="ml-auto px-1.5 text-[9px]">Primary</Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </PeopleSearchList>
      </PopoverContent>
    </Popover>
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
    <TableHead className={cn('h-9 px-2 text-xs font-medium text-muted-foreground', className)} aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="group inline-flex items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60')} />
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
        'h-8 min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition-colors hover:bg-muted/60 focus:border-input focus:bg-background disabled:hover:bg-transparent',
        isDoneTask(project, task) && 'text-muted-foreground',
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
          <span className="text-sm font-medium">Backlog</span>
          <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>
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
                      <DueDatePicker
                        dueDate={task.dueDate}
                        disabled={pendingTaskIds.has(task.id) || !canEditTask(project, task, viewerId)}
                        ariaLabel={`Due date for ${task.title}`}
                        onChange={(dueDate) => void onPatchTask(project.id, task.id, { dueDate }, { dueDate })}
                      />
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
