import assert from 'node:assert/strict'
import test from 'node:test'
import { filterTasksForBacklogAccess, taskSubtreeContainsBacklog } from '../lib/project-task-data'

type TaskFixture = {
  id: string
  title: string
  section: { isBacklog: boolean }
  parentTaskId: string | null
  parentTask: { id: string; title: string } | null
  childTasks: Array<{ id: string; title: string }>
}

test('workspace backlog filtering removes top-level rows and embedded parent/child summaries', () => {
  const tasks: TaskFixture[] = [
    {
      id: 'active-parent',
      title: 'Visible active parent',
      section: { isBacklog: false },
      parentTaskId: null,
      parentTask: null,
      childTasks: [
        { id: 'active-child', title: 'Visible active child' },
        { id: 'backlog-child', title: 'Hidden backlog child' },
      ],
    },
    {
      id: 'active-child',
      title: 'Visible active child',
      section: { isBacklog: false },
      parentTaskId: 'backlog-parent',
      parentTask: { id: 'backlog-parent', title: 'Hidden backlog parent' },
      childTasks: [],
    },
    {
      id: 'backlog-child',
      title: 'Hidden backlog child',
      section: { isBacklog: true },
      parentTaskId: 'active-parent',
      parentTask: { id: 'active-parent', title: 'Visible active parent' },
      childTasks: [],
    },
    {
      id: 'backlog-parent',
      title: 'Hidden backlog parent',
      section: { isBacklog: true },
      parentTaskId: null,
      parentTask: null,
      childTasks: [{ id: 'active-child', title: 'Visible active child' }],
    },
  ]

  const visible = filterTasksForBacklogAccess(tasks, false)

  assert.deepEqual(visible.map(({ id }) => id), ['active-parent', 'active-child'])
  assert.deepEqual(visible[0].childTasks.map(({ id }) => id), ['active-child'])
  assert.equal(visible[1].parentTaskId, null)
  assert.equal(visible[1].parentTask, null)
  assert.doesNotMatch(JSON.stringify(visible), /Hidden backlog|backlog-child|backlog-parent/)
})

test('project participants retain the complete backlog task graph', () => {
  const tasks: TaskFixture[] = [{
    id: 'backlog',
    title: 'Backlog task',
    section: { isBacklog: true },
    parentTaskId: null,
    parentTask: null,
    childTasks: [],
  }]

  assert.equal(filterTasksForBacklogAccess(tasks, true), tasks)
})

test('single-task mutation responses use the complete project visibility scope', () => {
  const responseTask: TaskFixture = {
    id: 'active',
    title: 'Visible active task',
    section: { isBacklog: false },
    parentTaskId: 'backlog-parent',
    parentTask: { id: 'backlog-parent', title: 'Hidden backlog parent' },
    childTasks: [{ id: 'backlog-child', title: 'Hidden backlog child' }],
  }
  const visibilityScope = [
    { id: 'active', section: { isBacklog: false } },
    { id: 'backlog-parent', section: { isBacklog: true } },
    { id: 'backlog-child', section: { isBacklog: true } },
  ]

  const [visible] = filterTasksForBacklogAccess([responseTask], false, visibilityScope)
  assert.equal(visible.parentTaskId, null)
  assert.equal(visible.parentTask, null)
  assert.deepEqual(visible.childTasks, [])
})

test('cascade protection detects backlog tasks anywhere in a task subtree', () => {
  const tasks = [
    { id: 'active-parent', parentTaskId: null, section: { isBacklog: false } },
    { id: 'active-child', parentTaskId: 'active-parent', section: { isBacklog: false } },
    { id: 'backlog-grandchild', parentTaskId: 'active-child', section: { isBacklog: true } },
    { id: 'independent', parentTaskId: null, section: { isBacklog: false } },
  ]

  assert.equal(taskSubtreeContainsBacklog('active-parent', tasks), true)
  assert.equal(taskSubtreeContainsBacklog('active-child', tasks), true)
  assert.equal(taskSubtreeContainsBacklog('independent', tasks), false)
})
