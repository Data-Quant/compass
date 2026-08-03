import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  WorkspaceProject,
  WorkspaceSection,
  WorkspaceTask,
} from '../components/projects/workspace-types'
import {
  calculateProgress,
  groupWorkspaceTaskItemsByAssignee,
  isTaskOverdue,
  progressBand,
  sortTasks,
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
