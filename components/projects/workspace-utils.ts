import type { LucideIcon } from 'lucide-react'
import { AlertOctagon, SignalHigh, SignalLow, SignalMedium } from 'lucide-react'
import type {
  AssigneeFilter,
  KanbanColumnId,
  ProjectStatusFilter,
  SortDirection,
  WorkspaceAssigneeTaskGroup,
  WorkspacePerson,
  WorkspacePriority,
  WorkspaceProject,
  WorkspaceProgress,
  WorkspaceSection,
  WorkspaceSortKey,
  WorkspaceTask,
  WorkspaceTaskItem,
  WorkspaceTaskStatus,
} from './workspace-types'
import {
  PROJECT_TASK_TIME_ZONE,
  projectTaskCalendarDayKey,
} from '@/lib/project-progress'

const DAY_MS = 86_400_000
const PROJECT_TASK_DISPLAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  timeZone: PROJECT_TASK_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export const PRIORITY_ORDER: Record<WorkspacePriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

export const PRIORITY_LABEL: Record<WorkspacePriority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
}

export const PRIORITY_ICON: Record<WorkspacePriority, { icon: LucideIcon; className: string }> = {
  URGENT: { icon: AlertOctagon, className: 'text-red-500' },
  HIGH: { icon: SignalHigh, className: 'text-orange-500' },
  MEDIUM: { icon: SignalMedium, className: 'text-foreground/60' },
  LOW: { icon: SignalLow, className: 'text-muted-foreground' },
}

const TASK_STATUS_ORDER: Record<WorkspaceTaskStatus, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  DONE: 2,
}

export function normalizeAssigneeFilter(
  value: string | null | undefined,
  viewerId: string,
  people: WorkspacePerson[],
): AssigneeFilter {
  if (!value || value === viewerId) return 'ME'
  if (value === 'ALL' || value === 'ME') return value
  return people.some((person) => person.id === value) ? value : 'ME'
}

export function assigneeIdForFilter(filter: AssigneeFilter, viewerId: string) {
  if (filter === 'ALL') return null
  return filter === 'ME' ? viewerId : filter
}

export function taskMatchesAssignee(task: WorkspaceTask, filter: AssigneeFilter, viewerId: string) {
  const assigneeId = assigneeIdForFilter(filter, viewerId)
  return assigneeId === null
    || task.assigneeId === assigneeId
    || Boolean(task.assistants?.some((assistant) => assistant.user.id === assigneeId))
}

export function taskAssignedPeople(task: WorkspaceTask) {
  const people = [task.assignee, ...(task.assistants || []).map((assistant) => assistant.user)]
    .filter((person): person is WorkspacePerson => Boolean(person))
  return people.filter((person, index) => (
    people.findIndex((candidate) => candidate.id === person.id) === index
  ))
}

export function groupWorkspaceTaskItemsByAssignee(
  items: WorkspaceTaskItem[],
  scopeAssigneeId: string | null,
): WorkspaceAssigneeTaskGroup[] {
  const groups = new Map<string, WorkspaceAssigneeTaskGroup & { itemIds: Set<string> }>()

  const addToGroup = (person: WorkspacePerson | null, item: WorkspaceTaskItem) => {
    const id = person?.id || '__UNASSIGNED__'
    const group = groups.get(id) || { id, person, items: [], itemIds: new Set<string>() }
    const itemId = `${item.project.id}:${item.task.id}`
    if (!group.itemIds.has(itemId)) {
      group.itemIds.add(itemId)
      group.items.push(item)
    }
    groups.set(id, group)
  }

  for (const item of items) {
    const assignedPeople = taskAssignedPeople(item.task)
    if (scopeAssigneeId) {
      const scopedPerson = assignedPeople.find((person) => person.id === scopeAssigneeId)
      if (scopedPerson) addToGroup(scopedPerson, item)
      continue
    }
    if (assignedPeople.length === 0) addToGroup(null, item)
    else assignedPeople.forEach((person) => addToGroup(person, item))
  }

  return [...groups.values()]
    .sort((left, right) => {
      if (!left.person && !right.person) return 0
      if (!left.person) return 1
      if (!right.person) return -1
      const nameResult = left.person.name.localeCompare(right.person.name, undefined, { sensitivity: 'base' })
      return nameResult || left.person.id.localeCompare(right.person.id)
    })
    .map(({ itemIds: _itemIds, ...group }) => group)
}

export function taskMatchesSearch(task: WorkspaceTask, search: string) {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return true
  return task.title.toLocaleLowerCase().includes(query)
    || (task.description || '').toLocaleLowerCase().includes(query)
}

export function projectMatchesSearch(
  project: Pick<WorkspaceProject, 'name' | 'description'>,
  search: string,
) {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return true
  return project.name.toLocaleLowerCase().includes(query)
    || (project.description || '').toLocaleLowerCase().includes(query)
}

export function projectMatchesStatus(project: WorkspaceProject, filter: ProjectStatusFilter) {
  if (filter === 'ALL') return true
  if (filter === 'CURRENT') return project.status !== 'ARCHIVED'
  return project.status === filter
}

export function isBacklogTask(project: WorkspaceProject, task: WorkspaceTask) {
  if (task.section?.isBacklog) return true
  return project.sections.some((section) => section.id === task.sectionId && section.isBacklog)
}

export function isDoneTask(project: WorkspaceProject, task: WorkspaceTask) {
  if (task.status === 'DONE' || task.section?.isDone) return true
  return project.sections.some((section) => section.id === task.sectionId && section.isDone)
}

export function calculateProgress(project: WorkspaceProject, scopedTasks: WorkspaceTask[]): WorkspaceProgress {
  const activeTasks = scopedTasks.filter((task) => !isBacklogTask(project, task))
  const completed = activeTasks.filter((task) => isDoneTask(project, task)).length
  return {
    completed,
    total: activeTasks.length,
    percent: activeTasks.length === 0 ? null : Math.round((completed / activeTasks.length) * 100),
  }
}

export function calculateOverallProgress(project: WorkspaceProject): WorkspaceProgress {
  return calculateProgress(project, project.tasks)
}

export function parseTaskDate(value: string | null | undefined) {
  if (!value) return null
  const dayKey = projectTaskCalendarDayKey(value)
  if (dayKey === null) return null
  const date = new Date(dayKey)
  // DatePicker consumes a browser-local Date. Recreate the Karachi calendar
  // components at local noon so clients in other time zones see the same day.
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12)
}

export function dateInputValue(value: string | null | undefined) {
  if (!value) return ''
  const dayKey = projectTaskCalendarDayKey(value)
  if (dayKey === null) return ''
  const date = new Date(dayKey)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function daysFromToday(value: string | null | undefined, now: Date = new Date()) {
  if (!value) return null
  const dueDay = projectTaskCalendarDayKey(value)
  const today = projectTaskCalendarDayKey(now)
  if (dueDay === null || today === null) return null
  return Math.round((dueDay - today) / DAY_MS)
}

export function isTaskOverdue(project: WorkspaceProject, task: WorkspaceTask) {
  if (isBacklogTask(project, task) || isDoneTask(project, task)) return false
  const days = daysFromToday(task.dueDate)
  return days !== null && days < 0
}

export function relativeDueDate(value: string | null | undefined, now: Date = new Date()) {
  const days = daysFromToday(value, now)
  if (days === null) return 'No due date'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return days > 1 ? `in ${days} days` : `${Math.abs(days)} days ago`
}

export function displayDueDate(value: string | null | undefined) {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No due date'
  return PROJECT_TASK_DISPLAY_FORMATTER.format(date)
}

const SHORT_DUE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PROJECT_TASK_TIME_ZONE,
  month: 'short',
  day: 'numeric',
})

function calendarYear(value: string | Date) {
  const key = projectTaskCalendarDayKey(value)
  return key === null ? null : new Date(key).getUTCFullYear()
}

// "Oct 24", or "Oct 24, 2027" when the year is not the current one (project time zone).
export function formatShortDue(value: string, now: Date = new Date()) {
  const dayKey = projectTaskCalendarDayKey(value)
  if (dayKey === null) return 'No date'
  const short = SHORT_DUE_FORMATTER.format(new Date(dayKey))
  const year = calendarYear(value)
  return year === calendarYear(now) ? short : `${short}, ${year}`
}

export type DueStateKind = 'none' | 'normal' | 'soon' | 'overdue' | 'done'

export function dueState(
  dueDate: string | null,
  opts: { done: boolean; overdue: boolean; now?: Date }
): { kind: DueStateKind; label: string; lateLabel?: string; title: string } {
  const now = opts.now ?? new Date()
  const days = daysFromToday(dueDate, now)
  if (!dueDate || days === null) return { kind: 'none', label: 'No date', title: 'No due date' }
  const title = `${displayDueDate(dueDate)}, ${relativeDueDate(dueDate, now)}`
  const short = formatShortDue(dueDate, now)
  if (opts.done) return { kind: 'done', label: short, title }
  if (opts.overdue) return { kind: 'overdue', label: short, lateLabel: `${Math.abs(days)}d late`, title }
  if (days >= 0 && days <= 2) {
    return { kind: 'soon', label: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : short, title }
  }
  return { kind: 'normal', label: short, title }
}

export function toLocalDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function shiftDate(value: string | null | undefined, days: number) {
  if (!value) return null
  const dayKey = projectTaskCalendarDayKey(value)
  if (dayKey === null) return value
  const date = new Date(dayKey + days * DAY_MS)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function compareNullableString(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: SortDirection = 'asc',
) {
  const a = left?.trim() || null
  const b = right?.trim() || null
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  const result = a.localeCompare(b, undefined, { sensitivity: 'base' })
  return direction === 'asc' ? result : -result
}

export function sortTasksByDeadline<T>(
  items: T[],
  getDueDate: (item: T) => string | null = (item) => (item as { dueDate: string | null }).dueDate,
): T[] {
  return [...items].sort((left, right) =>
    compareNullableString(dateInputValue(getDueDate(left)), dateInputValue(getDueDate(right))))
}

export const DONE_RECENT_DAYS = 14

// Done columns: completed within the last `days` days (inclusive) vs the rest, both newest first.
// Missing or unparseable completedAt counts as older and sorts last.
export function splitDoneTasks<T>(
  items: T[],
  getCompletedAt: (item: T) => string | null | undefined,
  now: Date = new Date(),
  days = DONE_RECENT_DAYS,
): { recent: T[]; older: T[] } {
  const cutoff = now.getTime() - days * DAY_MS
  const time = (item: T) => {
    const value = getCompletedAt(item)
    const ms = value ? new Date(value).getTime() : NaN
    return Number.isNaN(ms) ? -Infinity : ms
  }
  const sorted = items.map((item) => ({ item, ms: time(item) })).sort((a, b) => b.ms - a.ms || 0)
  return {
    recent: sorted.filter(({ ms }) => ms >= cutoff).map(({ item }) => item),
    older: sorted.filter(({ ms }) => ms < cutoff).map(({ item }) => item),
  }
}

export function sortWorkspaceTaskItems(
  items: WorkspaceTaskItem[],
  key: WorkspaceSortKey,
  direction: SortDirection,
) {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...items].sort((leftItem, rightItem) => {
    const { project: leftProject, task: left } = leftItem
    const { project: rightProject, task: right } = rightItem
    let result = 0
    if (key === 'status') {
      const leftStatus = left.section?.canonicalStatus || left.status
      const rightStatus = right.section?.canonicalStatus || right.status
      result = TASK_STATUS_ORDER[leftStatus] - TASK_STATUS_ORDER[rightStatus]
      if (result === 0) {
        result = (left.section?.orderIndex ?? Number.MAX_SAFE_INTEGER)
          - (right.section?.orderIndex ?? Number.MAX_SAFE_INTEGER)
      }
      if (result === 0) {
        result = (left.section?.name || left.status).localeCompare(
          right.section?.name || right.status,
          undefined,
          { sensitivity: 'base' },
        )
      }
    }
    if (key === 'title') result = left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    if (key === 'project') result = leftProject.name.localeCompare(rightProject.name, undefined, { sensitivity: 'base' })
    if (key === 'priority') result = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
    if (key === 'dueDate') result = compareNullableString(dateInputValue(left.dueDate), dateInputValue(right.dueDate), direction)
    if (key === 'assignee') result = compareNullableString(left.assignee?.name, right.assignee?.name, direction)
    if (key === 'notes') result = compareNullableString(left.description, right.description, direction)
    if (key === 'variance') result = Number(isTaskOverdue(rightProject, right)) - Number(isTaskOverdue(leftProject, left))

    if (result !== 0) {
      // Empty cells stay at the bottom in both directions; the nullable comparators
      // have already applied the requested direction to non-empty values.
      if (key === 'dueDate' || key === 'assignee' || key === 'notes') return result
      return result * multiplier
    }

    // The default secondary order is always priority, then nearest due date.
    const priorityResult = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
    if (priorityResult !== 0) return priorityResult
    const dueResult = compareNullableString(dateInputValue(left.dueDate), dateInputValue(right.dueDate))
    if (dueResult !== 0) return dueResult
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  })
}

export function sortTasks(
  project: WorkspaceProject,
  tasks: WorkspaceTask[],
  key: WorkspaceSortKey,
  direction: SortDirection,
) {
  return sortWorkspaceTaskItems(
    tasks.map((task) => ({ project, task })),
    key,
    direction,
  ).map(({ task }) => task)
}

export function sectionForColumn(project: WorkspaceProject, column: KanbanColumnId): WorkspaceSection | null {
  const ordered = [...project.sections].sort((a, b) => a.orderIndex - b.orderIndex)
  if (column === 'BACKLOG') return ordered.find((section) => section.isBacklog) || null
  if (column === 'DONE') return ordered.find((section) => section.isDone || section.canonicalStatus === 'DONE') || null
  if (column === 'TODO') {
    return ordered.find((section) => !section.isBacklog && section.canonicalStatus === 'TODO' && section.isDefault)
      || ordered.find((section) => !section.isBacklog && section.canonicalStatus === 'TODO')
      || null
  }
  return ordered.find((section) => !section.isBacklog && section.canonicalStatus === 'IN_PROGRESS' && section.isDefault)
    || ordered.find((section) => !section.isBacklog && section.canonicalStatus === 'IN_PROGRESS')
    || null
}

// Subtasks inherit their parent's section; new top-level tasks go to the column's section.
export function targetSectionForNewTask(
  project: WorkspaceProject,
  column: KanbanColumnId,
  parentTask?: WorkspaceTask | null,
): WorkspaceSection | null {
  return parentTask?.section || sectionForColumn(project, column)
}

export function columnForTask(project: WorkspaceProject, task: WorkspaceTask): KanbanColumnId {
  if (isBacklogTask(project, task)) return 'BACKLOG'
  if (isDoneTask(project, task)) return 'DONE'
  return task.status === 'TODO' || task.section?.canonicalStatus === 'TODO' ? 'TODO' : 'IN_PROGRESS'
}

export function plainTextPreview(value: string | null | undefined) {
  if (!value) return ''
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '[image]')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const ROW_INTERACTIVE_SELECTOR =
  'a,button,input,textarea,select,label,[role="checkbox"],[role="combobox"],[role="menuitem"],[data-row-nav-ignore]'

// React events from portaled popovers/menus bubble to the row, so require the DOM target to be inside it.
export function isRowNavigationClick(
  target: { closest(selector: string): unknown } | null,
  row: { contains(node: unknown): boolean },
): boolean {
  if (!target || !row.contains(target)) return false
  return !target.closest(ROW_INTERACTIVE_SELECTOR)
}

const foldText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function filterPeopleByQuery<T extends { name: string; email?: string | null }>(people: T[], query: string): T[] {
  const needle = foldText(query.trim())
  if (!needle) return people
  return people.filter((person) => foldText(person.name).includes(needle) || foldText(person.email || '').includes(needle))
}

// Index of the item to focus next in a list whose first item is the search input.
export function nextFocusIndex(current: number, count: number, key: 'ArrowDown' | 'ArrowUp'): number {
  return key === 'ArrowDown' ? Math.min(current + 1, count - 1) : Math.max(current - 1, 0)
}

// Per-project board card: the sortable wrapper is the only tab stop. Enter opens the task,
// other keys (Space) go to the dnd-kit keyboard drag. Keys from inner controls never start a drag.
export function sortableCardKeyDown<E extends { key: string; target: unknown; currentTarget: unknown }>(
  event: E,
  { isDragging, onOpen, onDragKey }: { isDragging: boolean; onOpen: () => void; onDragKey?: (event: E) => void },
) {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter') {
    if (!isDragging) onOpen()
    return
  }
  onDragKey?.(event)
}
