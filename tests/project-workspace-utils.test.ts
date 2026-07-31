import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  WorkspaceProject,
  WorkspaceSection,
  WorkspaceTask,
} from '../components/projects/workspace-types'
import {
  calculateProgress,
  isTaskOverdue,
  progressBand,
  sortTasks,
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

function project(tasks: WorkspaceTask[]): WorkspaceProject {
  return {
    id: 'project',
    name: 'Compass upgrade',
    description: null,
    color: null,
    status: 'ACTIVE',
    owner: { id: 'owner', name: 'Owner' },
    members: [],
    canManage: true,
    sections: [backlog, todo, done],
    labels: [],
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
