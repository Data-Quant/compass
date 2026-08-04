import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type {
  WorkspaceProject,
  WorkspaceProjectView,
  WorkspaceSection,
  WorkspaceTask,
} from '../components/projects/workspace-types'

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
  orderIndex: 2,
}

const task: WorkspaceTask = {
  id: 'task-1',
  title: 'Draft the investment memo',
  description: 'Open the task details',
  status: 'TODO',
  priority: 'HIGH',
  assigneeId: 'user-1',
  assignee: { id: 'user-1', name: 'Areebah' },
  startDate: null,
  dueDate: '2026-08-15',
  sectionId: todo.id,
  section: todo,
  orderIndex: 0,
  completedLate: false,
  parentTaskId: null,
  assistants: [{ id: 'assistant-link-1', user: { id: 'user-2', name: 'Shoaib' } }],
  childTasks: [],
  labelAssignments: [],
  _count: { comments: 0 },
}

const subtask: WorkspaceTask = {
  ...task,
  id: 'task-2',
  title: 'Confirm the legal clauses',
  parentTaskId: task.id,
  assigneeId: 'user-2',
  assignee: { id: 'user-2', name: 'Shoaib' },
  assistants: [{ id: 'assistant-link-2', user: { id: 'user-1', name: 'Areebah' } }],
  dueDate: '2026-08-12',
}

const nestedSubtask: WorkspaceTask = {
  ...task,
  id: 'task-3',
  title: 'Attach the signed schedule',
  parentTaskId: subtask.id,
  dueDate: null,
  assistants: [],
}

const project: WorkspaceProject = {
  id: 'project-1',
  name: 'Harbor paperwork',
  description: 'Close the remaining diligence work',
  color: '#2563eb',
  status: 'ACTIVE',
  owner: { id: 'owner-1', name: 'Project owner' },
  members: [{ id: 'user-1', name: 'Areebah', role: 'EMPLOYEE' }],
  canManage: true,
  canUseBacklog: true,
  sections: [todo, done],
  labels: [],
  tasks: [task, subtask, nestedSubtask],
}

const view: WorkspaceProjectView = {
  project,
  scopedTasks: [task, subtask, nestedSubtask],
  visibleActiveTasks: [task, subtask, nestedSubtask],
  visibleBacklogTasks: [],
  progress: { completed: 0, total: 3, percent: 0 },
}

async function render(options: { groupMode?: 'project' | 'assignee'; assigneeFilter?: string } = {}) {
  // The repository's test runner preserves the classic JSX transform, while
  // Next supplies the JSX runtime during application builds.
  ;(globalThis as typeof globalThis & { React: typeof React }).React = React
  const { WorkspaceTaskTable } = await import('../components/projects/WorkspaceTaskTable')

  return renderToStaticMarkup(React.createElement(WorkspaceTaskTable, {
    projectViews: [view],
    viewerId: 'user-1',
    people: [project.owner, ...project.members],
    progressScopeLabel: 'Your tasks',
    assigneeFilter: options.assigneeFilter || 'ME',
    groupMode: options.groupMode || 'project',
    sortKey: 'priority',
    sortDirection: 'asc',
    selectedIds: new Set<string>(),
    pendingTaskIds: new Set<string>(),
    backlogCollapsed: true,
    quickAddProjects: [project],
    quickAddProjectId: project.id,
    quickAdding: false,
    creatingTaskProjectIds: new Set<string>(),
    creatingProject: false,
    onSort: () => undefined,
    onToggleBacklog: () => undefined,
    onToggleSelected: () => undefined,
    onToggleManySelected: () => undefined,
    onPatchTask: async () => true,
    onOpenTask: () => undefined,
    onFilterByAssignee: () => undefined,
    onRenameProject: () => undefined,
    onArchiveProject: () => undefined,
    onQuickAddProjectChange: () => undefined,
    onQuickAdd: async () => true,
    onCreateActiveTask: async () => true,
    onCreateProject: async () => true,
  }))
}

test('project matrix keeps task rows and the task composer out until its project popover opens', async () => {
  const html = await render()

  assert.match(html, /Harbor paperwork/)
  assert.doesNotMatch(html, /Draft the investment memo/)
  assert.doesNotMatch(html, /Confirm the legal clauses/)
  assert.equal(html.match(/>Project</g)?.length, 1)
  assert.equal(html.match(/>Tasks</g)?.length, 1)
  assert.equal(html.match(/>Deadline</g)?.length, 1)
  assert.equal(html.match(/>Assignee</g)?.length, 1)
  assert.equal(html.match(/>Priority</g)?.length, 1)
  assert.match(html, /aria-expanded="false"/)
  assert.doesNotMatch(html, /aria-label="Add a task to Harbor paperwork"/)
  assert.ok(html.indexOf('New project') < html.indexOf('Backlog'))
})

test('inline task composer exposes a Notion-style new task action', async () => {
  const { InlineTaskComposer } = await import('../components/projects/WorkspaceTaskTable')
  const html = renderToStaticMarkup(React.createElement(InlineTaskComposer, {
    projectName: 'Harbor paperwork',
    creating: false,
    onCreate: async () => true,
  }))

  assert.match(html, /aria-label="Add a task to Harbor paperwork"/)
  assert.match(html, />New task</)
})

test('task tree preserves recursively nested subtasks from the flat workspace response', async () => {
  const { buildWorkspaceTaskTree } = await import('../components/projects/WorkspaceTaskTable')
  const tree = buildWorkspaceTaskTree([task, subtask, nestedSubtask])

  assert.deepEqual(tree.map((node) => node.task.id), [task.id])
  assert.deepEqual(tree[0].children.map((node) => node.task.id), [subtask.id])
  assert.deepEqual(tree[0].children[0].children.map((node) => node.task.id), [nestedSubtask.id])
})

test('task assignment summary includes a unique primary and every co-assignee', async () => {
  const { taskAssignees } = await import('../components/projects/WorkspaceTaskTable')

  assert.deepEqual(taskAssignees(task).map((person) => person.id), ['user-1', 'user-2'])
  assert.deepEqual(taskAssignees({
    ...task,
    assistants: [
      { id: 'duplicate-primary', user: { id: 'user-1', name: 'Areebah' } },
      { id: 'assistant-link-1', user: { id: 'user-2', name: 'Shoaib' } },
    ],
  }).map((person) => person.id), ['user-1', 'user-2'])
})

test('person grouping renders shared tasks under every assigned person', async () => {
  const html = await render({ groupMode: 'assignee', assigneeFilter: 'ALL' })

  assert.match(html, /data-group-mode="assignee"/)
  assert.match(html, /data-assignee-group-id="user-1"/)
  assert.match(html, /data-assignee-group-id="user-2"/)
  assert.equal(html.match(/data-person-task-id="task-1"/g)?.length, 2)
  assert.equal(html.match(/data-person-task-id="task-2"/g)?.length, 2)
  assert.equal(html.match(/data-person-task-id="task-3"/g)?.length, 1)
  assert.equal(html.match(/data-task-depth="0"/g)?.length, 2)
  assert.equal(html.match(/data-task-depth="1"/g)?.length, 2)
  assert.equal(html.match(/data-task-depth="2"/g)?.length, 1)
  assert.match(html, /aria-label="Collapse tasks for Areebah"/)
  assert.match(html, /aria-label="Collapse tasks for Shoaib"/)
  assert.equal(html.match(/aria-label="Collapse subtasks for Draft the investment memo"/g)?.length, 2)
})
