import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  WorkspaceProject,
  WorkspaceSection,
  WorkspaceTask,
} from '../components/projects/workspace-types'
import {
  calculateProgress,
  filterPeopleByQuery,
  nextFocusIndex,
  calculateOverallProgress,
  dueState,
  formatShortDue,
  groupWorkspaceTaskItemsByAssignee,
  isRowNavigationClick,
  isTaskOverdue,
  projectMatchesSearch,
  progressBand,
  sortTasks,
  sortTasksByDeadline,
  sortWorkspaceTaskItems,
  taskMatchesAssignee,
  taskMatchesSearch,
} from '../components/projects/workspace-utils'

const backlog: WorkspaceSection = {
  id: 'backlog',
  name: 'Backlog',
  color: '#64748b',
  canonicalStatus: 'TODO',
  isDefault: true,
  isDone: false,
  isBacklog: true,
  orderIndex: 0,
}

const todo: WorkspaceSection = {
  id: 'todo',
  name: 'To Do',
  color: '#94a3b8',
  canonicalStatus: 'TODO',
  isDefault: true,
  isDone: false,
  isBacklog: false,
  orderIndex: 1,
}

const done: WorkspaceSection = {
  id: 'done',
  name: 'Done',
  color: '#22c55e',
  canonicalStatus: 'DONE',
  isDefault: true,
  isDone: true,
  isBacklog: false,
  orderIndex: 3,
}

function task(input: Partial<WorkspaceTask> & Pick<WorkspaceTask, 'id' | 'title'>): WorkspaceTask {
  return {
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeId: 'u1',
    assignee: { id: 'u1', name: 'Areebah' },
    startDate: null,
    dueDate: null,
    sectionId: todo.id,
    section: todo,
    orderIndex: 0,
    completedLate: false,
    labelAssignments: [],
    _count: { comments: 0 },
    ...input,
  }
}

function project(tasks: WorkspaceTask[], input: Partial<WorkspaceProject> = {}): WorkspaceProject {
  return {
    id: 'project',
    name: 'Compass upgrade',
    description: null,
    color: null,
    status: 'ACTIVE',
    owner: { id: 'owner', name: 'Owner' },
    members: [],
    canManage: true,
    canUseBacklog: true,
    sections: [backlog, todo, done],
    labels: [],
    ...input,
    tasks,
  }
}

test('workspace progress excludes backlog and uses the done section', () => {
  const tasks = [
    task({ id: 'open', title: 'Open' }),
    task({ id: 'done', title: 'Done', status: 'DONE', sectionId: done.id, section: done }),
    task({ id: 'idea', title: 'Idea', sectionId: backlog.id, section: backlog }),
  ]

  assert.deepEqual(calculateProgress(project(tasks), tasks), {
    completed: 1,
    total: 2,
    percent: 50,
  })
})

test('project-row progress ignores the assignee view and counts every non-backlog task', () => {
  const tasks = [
    task({ id: 'mine', title: 'Mine', status: 'DONE', sectionId: done.id, section: done }),
    task({ id: 'shared', title: 'Shared', status: 'DONE', sectionId: done.id, section: done,
      assigneeId: 'u2', assistants: [{ id: 'assistant-u1', user: { id: 'u1', name: 'Areebah' } }] }),
    task({ id: 'other', title: 'Other', status: 'TODO', assigneeId: 'u2' }),
    task({ id: 'idea', title: 'Idea', sectionId: backlog.id, section: backlog }),
  ]
  const value = project(tasks)
  const myTasks = tasks.filter((candidate) => taskMatchesAssignee(candidate, 'ME', 'u1'))

  assert.deepEqual(calculateProgress(value, myTasks), { completed: 2, total: 2, percent: 100 })
  assert.deepEqual(calculateOverallProgress(value), { completed: 2, total: 3, percent: 67 })
})

test('due-date sorting keeps undated tasks last in both directions', () => {
  const tasks = [
    task({ id: 'none', title: 'No date' }),
    task({ id: 'early', title: 'Early', dueDate: '2026-08-01' }),
    task({ id: 'late', title: 'Late', dueDate: '2026-08-10' }),
  ]
  const value = project(tasks)

  assert.deepEqual(sortTasks(value, tasks, 'dueDate', 'asc').map(({ id }) => id), ['early', 'late', 'none'])
  assert.deepEqual(sortTasks(value, tasks, 'dueDate', 'desc').map(({ id }) => id), ['late', 'early', 'none'])
})

test('search includes rich notes as well as task titles', () => {
  const candidate = task({
    id: 'notes',
    title: 'Prepare materials',
    description: '**Confirm** the investment committee agenda',
  })

  assert.equal(taskMatchesSearch(candidate, 'materials'), true)
  assert.equal(taskMatchesSearch(candidate, 'investment committee'), true)
  assert.equal(taskMatchesSearch(candidate, 'payroll'), false)
})

test('project search includes project names and descriptions', () => {
  const candidate = project([], {
    name: 'ERPNext rollout',
    description: 'Migrate the finance workflow',
  })

  assert.equal(projectMatchesSearch(candidate, 'erpnext'), true)
  assert.equal(projectMatchesSearch(candidate, 'finance workflow'), true)
  assert.equal(projectMatchesSearch(candidate, 'website revamp'), false)
})

test('assignee filtering includes primary and co-assigned people', () => {
  const candidate = task({
    id: 'shared',
    title: 'Shared task',
    assistants: [{ id: 'assistant-link', user: { id: 'u2', name: 'Hira' } }],
  })

  assert.equal(taskMatchesAssignee(candidate, 'u1', 'viewer'), true)
  assert.equal(taskMatchesAssignee(candidate, 'u2', 'viewer'), true)
  assert.equal(taskMatchesAssignee(candidate, 'u3', 'viewer'), false)
})

test('person grouping fans shared tasks out once per assigned person and keeps unassigned last', () => {
  const shared = task({
    id: 'shared',
    title: 'Shared',
    assistants: [
      { id: 'assistant-u2', user: { id: 'u2', name: 'Raveeha' } },
      { id: 'duplicate-primary', user: { id: 'u1', name: 'Areebah' } },
    ],
  })
  const assistantOnly = task({
    id: 'assistant-only',
    title: 'Assistant only',
    assigneeId: null,
    assignee: null,
    assistants: [{ id: 'assistant-u2-only', user: { id: 'u2', name: 'Raveeha' } }],
  })
  const sameName = task({
    id: 'same-name',
    title: 'Same name',
    assigneeId: 'u3',
    assignee: { id: 'u3', name: 'Raveeha' },
    assistants: [],
  })
  const unassigned = task({
    id: 'unassigned',
    title: 'Unassigned',
    assigneeId: null,
    assignee: null,
    assistants: [],
  })
  const value = project([shared, assistantOnly, sameName, unassigned])
  const items = value.tasks.map((candidate) => ({ project: value, task: candidate }))
  const groups = groupWorkspaceTaskItemsByAssignee(items, null)

  assert.deepEqual(groups.map((group) => group.id), ['u1', 'u2', 'u3', '__UNASSIGNED__'])
  assert.deepEqual(groups[0].items.map(({ task: candidate }) => candidate.id), ['shared'])
  assert.deepEqual(groups[1].items.map(({ task: candidate }) => candidate.id), ['shared', 'assistant-only'])
  assert.deepEqual(groups[2].items.map(({ task: candidate }) => candidate.id), ['same-name'])
  assert.deepEqual(groups[3].items.map(({ task: candidate }) => candidate.id), ['unassigned'])

  const scoped = groupWorkspaceTaskItemsByAssignee(items, 'u2')
  assert.deepEqual(scoped.map((group) => group.id), ['u2'])
  assert.deepEqual(scoped[0].items.map(({ task: candidate }) => candidate.id), ['shared', 'assistant-only'])
})

test('cross-project task sorting uses each item project and supports project order', () => {
  const alphaTask = task({ id: 'alpha-task', title: 'Second title' })
  const betaTask = task({ id: 'beta-task', title: 'First title' })
  const alpha = project([alphaTask], { id: 'alpha', name: 'Alpha' })
  const beta = project([betaTask], { id: 'beta', name: 'Beta' })
  const items = [
    { project: beta, task: betaTask },
    { project: alpha, task: alphaTask },
  ]

  assert.deepEqual(
    sortWorkspaceTaskItems(items, 'project', 'asc').map(({ project: candidate }) => candidate.id),
    ['alpha', 'beta'],
  )
  assert.deepEqual(
    sortWorkspaceTaskItems(items, 'title', 'asc').map(({ task: candidate }) => candidate.id),
    ['beta-task', 'alpha-task'],
  )
})

test('status sorting orders todo, in-progress, and done tasks instead of only separating done rows', () => {
  const inProgressSection = {
    ...todo,
    id: 'in-progress',
    name: 'In Progress',
    canonicalStatus: 'IN_PROGRESS' as const,
    orderIndex: 2,
  }
  const tasks = [
    task({ id: 'done-status', title: 'Done', status: 'DONE', sectionId: done.id, section: done }),
    task({ id: 'progress-status', title: 'In progress', status: 'IN_PROGRESS', sectionId: inProgressSection.id, section: inProgressSection }),
    task({ id: 'todo-status', title: 'To do' }),
  ]
  const value = project(tasks, { sections: [backlog, todo, inProgressSection, done] })

  assert.deepEqual(sortTasks(value, tasks, 'status', 'asc').map(({ id }) => id), [
    'todo-status',
    'progress-status',
    'done-status',
  ])
})

test('variance excludes backlog and completed tasks, and progress bands meet the specification', () => {
  const oldDueDate = '2000-01-01'
  const open = task({ id: 'open', title: 'Open', dueDate: oldDueDate })
  const idea = task({ id: 'idea', title: 'Idea', dueDate: oldDueDate, sectionId: backlog.id, section: backlog })
  const complete = task({ id: 'complete', title: 'Complete', dueDate: oldDueDate, status: 'DONE', sectionId: done.id, section: done })
  const value = project([open, idea, complete])

  assert.equal(isTaskOverdue(value, open), true)
  assert.equal(isTaskOverdue(value, idea), false)
  assert.equal(isTaskOverdue(value, complete), false)
  assert.equal(progressBand(33).fill, 'bg-red-500')
  assert.equal(progressBand(34).fill, 'bg-amber-500')
  assert.equal(progressBand(67).fill, 'bg-blue-500')
  assert.equal(progressBand(100).fill, 'bg-emerald-500')
})

const fakeTarget = (matches: boolean) => ({ closest: () => (matches ? {} : null) })
const fakeRow = (contains: boolean) => ({ contains: () => contains })

test('a click on plain row space opens the project', () => {
  assert.equal(isRowNavigationClick(fakeTarget(false), fakeRow(true)), true)
})
test('a click on a control in the row does not navigate', () => {
  assert.equal(isRowNavigationClick(fakeTarget(true), fakeRow(true)), false)
})
test('a click inside portal content does not navigate', () => {
  assert.equal(isRowNavigationClick(fakeTarget(false), fakeRow(false)), false)
})
test('no target does not navigate', () => {
  assert.equal(isRowNavigationClick(null, fakeRow(true)), false)
})

const deadlineTask = (id: string, dueDate: string | null) => ({ id, dueDate })

test('earlier deadlines come first and undated tasks go last', () => {
  const sorted = sortTasksByDeadline([deadlineTask('none', null), deadlineTask('late', '2026-11-20'), deadlineTask('soon', '2026-10-25')])
  assert.deepEqual(sorted.map((task) => task.id), ['soon', 'late', 'none'])
})

test('tasks with the same deadline keep their existing order', () => {
  const sorted = sortTasksByDeadline([deadlineTask('b', '2026-10-25'), deadlineTask('a', '2026-10-25'), deadlineTask('x', null), deadlineTask('y', null)])
  assert.deepEqual(sorted.map((task) => task.id), ['b', 'a', 'x', 'y'])
})

test('sorts wrapped items through the accessor', () => {
  const sorted = sortTasksByDeadline(
    [{ task: deadlineTask('late', '2026-11-20') }, { task: deadlineTask('soon', '2026-10-25') }],
    ({ task }) => task.dueDate,
  )
  assert.deepEqual(sorted.map(({ task }) => task.id), ['soon', 'late'])
})

test('sortTasksByDeadline does not mutate the input', () => {
  const input = [deadlineTask('late', '2026-11-20'), deadlineTask('soon', '2026-10-25')]
  sortTasksByDeadline(input)
  assert.deepEqual(input.map((task) => task.id), ['late', 'soon'])
})

const searchablePeople = [
  { id: '1', name: 'Fakayha Jamil', email: 'fakayha@plutus21.com' },
  { id: '2', name: 'Amjad Ali', email: 'amjad@plutus21.com' },
  { id: '3', name: 'José Núñez', email: null },
]
const ids = (query: string) => filterPeopleByQuery(searchablePeople, query).map((p) => p.id)

test('an empty or blank query keeps everyone in order', () => {
  assert.deepEqual(ids(''), ['1', '2', '3'])
  assert.deepEqual(ids('   '), ['1', '2', '3'])
})
test('matches part of a name, ignoring case', () => {
  assert.deepEqual(ids('ALI'), ['2'])
})
test('matches by email', () => {
  assert.deepEqual(ids('fakayha@'), ['1'])
})
test('ignores accents', () => {
  assert.deepEqual(ids('jose nunez'), ['3'])
})
test('no match returns an empty list', () => {
  assert.deepEqual(filterPeopleByQuery(searchablePeople, 'zzz'), [])
})

test('nextFocusIndex moves down and up and stops at the ends', () => {
  assert.equal(nextFocusIndex(0, 3, 'ArrowDown'), 1)
  assert.equal(nextFocusIndex(2, 3, 'ArrowDown'), 2)
  assert.equal(nextFocusIndex(2, 3, 'ArrowUp'), 1)
  assert.equal(nextFocusIndex(0, 3, 'ArrowUp'), 0)
  assert.equal(nextFocusIndex(0, 1, 'ArrowDown'), 0)
})

// Fixed clock: Oct 22 2026, noon in Karachi (UTC+5).
const NOW = new Date('2026-10-22T07:00:00Z')

test('formatShortDue shows month and day, adds the year when it differs', () => {
  assert.equal(formatShortDue('2026-10-24T00:00:00Z', NOW), 'Oct 24')
  assert.equal(formatShortDue('2027-01-05T00:00:00Z', NOW), 'Jan 5, 2027')
})

test('dueState: no date', () => {
  const s = dueState(null, { done: false, overdue: false, now: NOW })
  assert.equal(s.kind, 'none')
  assert.equal(s.label, 'No date')
})

test('dueState: more than 2 days out is normal', () => {
  const s = dueState('2026-10-25T00:00:00Z', { done: false, overdue: false, now: NOW })
  assert.equal(s.kind, 'normal')
  assert.equal(s.label, 'Oct 25')
  assert.match(s.title, /in 3 days/)
})

test('dueState: today, tomorrow and 2 days out are soon', () => {
  const o = { done: false, overdue: false, now: NOW }
  assert.deepEqual([dueState('2026-10-22T00:00:00Z', o).kind, dueState('2026-10-22T00:00:00Z', o).label], ['soon', 'Today'])
  assert.equal(dueState('2026-10-23T00:00:00Z', o).label, 'Tomorrow')
  const two = dueState('2026-10-24T00:00:00Z', o)
  assert.deepEqual([two.kind, two.label], ['soon', 'Oct 24'])
})

test('dueState: overdue carries a late label', () => {
  const s = dueState('2026-10-20T00:00:00Z', { done: false, overdue: true, now: NOW })
  assert.equal(s.kind, 'overdue')
  assert.equal(s.label, 'Oct 20')
  assert.equal(s.lateLabel, '2d late')
})

test('dueState: done is never overdue or soon', () => {
  const late = dueState('2026-10-20T00:00:00Z', { done: true, overdue: true, now: NOW })
  assert.equal(late.kind, 'done')
  assert.equal(late.lateLabel, undefined)
  assert.equal(dueState('2026-10-22T00:00:00Z', { done: true, overdue: false, now: NOW }).kind, 'done')
})

test('dueState: different year appends the year', () => {
  const s = dueState('2025-12-30T00:00:00Z', { done: true, overdue: false, now: NOW })
  assert.equal(s.label, 'Dec 30, 2025')
})
