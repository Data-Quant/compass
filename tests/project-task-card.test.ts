import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PanelTask } from '../components/projects/TaskDetailPanel'

const DAY_MS = 24 * 60 * 60 * 1000

const task: PanelTask = {
  id: 'task-1',
  title: 'Draft the investment memo',
  description: null,
  status: 'TODO',
  priority: 'HIGH',
  assigneeId: 'user-1',
  assignee: { id: 'user-1', name: 'Areebah Khan' },
  startDate: null,
  dueDate: null,
  sectionId: 'todo',
  section: null,
  orderIndex: 0,
  assistants: [{ id: 'link-1', user: { id: 'user-2', name: 'Shoaib Ali' } }],
  childTasks: [],
  labelAssignments: [],
  _count: { comments: 0 },
}

async function render(props: Record<string, unknown> = {}) {
  ;(globalThis as typeof globalThis & { React: typeof React }).React = React
  const { TaskCard } = await import('../components/projects/TaskCard')
  const { AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime')
  const router = { push: () => undefined, prefetch: () => undefined } as never
  return renderToStaticMarkup(React.createElement(
    AppRouterContext.Provider,
    { value: router },
    React.createElement(TaskCard, { task, overdue: false, done: false, onOpen: () => undefined, ...props }),
  ))
}

test('task card shows the assignee first name and co-assignee avatars', async () => {
  const html = await render()
  assert.match(html, />Areebah</)
  assert.match(html, /title="Assignee: Areebah Khan"/)
  assert.match(html, /title="Co-assignee: Shoaib Ali"/)
})

test('task card shows No date when there is no due date', async () => {
  const html = await render()
  assert.match(html, />No date</)
})

test('task card shows the days late on an overdue task', async () => {
  const dueDate = new Date(Date.now() - 2 * DAY_MS).toISOString()
  const html = await render({ task: { ...task, dueDate }, overdue: true })
  assert.match(html, /2d late/)
})

test('task card shows the project chip only when a project is passed', async () => {
  assert.doesNotMatch(await render(), /href="\/projects\/project-1"/)
  const html = await render({ project: { id: 'project-1', name: 'Harbor paperwork', color: '#2563eb' } })
  assert.match(html, /href="\/projects\/project-1"/)
  assert.match(html, />Harbor paperwork</)
})
