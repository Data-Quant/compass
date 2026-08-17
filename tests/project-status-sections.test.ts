import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_STATUS_SECTIONS,
  findExistingDefaultStatusSection,
  getStatusSectionDefaults,
  selectSectionDeletionTarget,
  selectPreferredStatusSection,
} from '../lib/project-status-sections'

test('Backlog is the first default project section', () => {
  assert.equal(DEFAULT_STATUS_SECTIONS[0].name, 'Backlog')
  assert.equal(DEFAULT_STATUS_SECTIONS[0].isBacklog, true)
  assert.equal(DEFAULT_STATUS_SECTIONS[0].canonicalStatus, 'TODO')
})

test('renamed legacy defaults are reclaimed by canonical status without reusing Backlog', () => {
  const sections = [
    {
      id: 'backlog',
      name: 'Backlog',
      color: '#64748b',
      canonicalStatus: 'TODO' as const,
      isDefault: true,
      isDone: false,
      isBacklog: false,
      orderIndex: 0,
    },
    {
      id: 'legacy-todo',
      name: 'Queue',
      color: '#94a3b8',
      canonicalStatus: 'TODO' as const,
      isDefault: true,
      isDone: false,
      isBacklog: false,
      orderIndex: 1,
    },
  ]
  const claimed = new Set<string>()
  const backlog = findExistingDefaultStatusSection(sections, DEFAULT_STATUS_SECTIONS[0], claimed)
  claimed.add(backlog!.id)
  const todo = findExistingDefaultStatusSection(sections, DEFAULT_STATUS_SECTIONS[1], claimed)

  assert.equal(backlog?.id, 'backlog')
  assert.equal(todo?.id, 'legacy-todo')
})

test('default TODO resolution prefers non-backlog To Do', () => {
  const sections = [
    {
      id: 'backlog',
      name: 'Backlog',
      color: '#64748b',
      canonicalStatus: 'TODO' as const,
      isDefault: true,
      isDone: false,
      isBacklog: true,
      orderIndex: 0,
    },
    {
      id: 'todo',
      name: 'To Do',
      color: '#94a3b8',
      canonicalStatus: 'TODO' as const,
      isDefault: true,
      isDone: false,
      isBacklog: false,
      orderIndex: 1,
    },
  ]

  assert.equal(selectPreferredStatusSection(sections, 'TODO')?.id, 'todo')
})

test('TODO status defaults never resolve to Backlog', () => {
  const defaults = getStatusSectionDefaults('TODO')

  assert.equal(defaults.canonicalStatus, 'TODO')
  assert.equal(defaults.isBacklog, false)
})

test('section deletion prefers a compatible remaining status, including for defaults', () => {
  const sections = DEFAULT_STATUS_SECTIONS.map((definition, index) => ({
    id: definition.name.toLowerCase().replaceAll(' ', '-'),
    name: definition.name,
    color: definition.color,
    canonicalStatus: definition.canonicalStatus,
    isDefault: true,
    isDone: definition.isDone,
    isBacklog: definition.isBacklog,
    orderIndex: index,
  }))

  const todo = sections.find((section) => section.name === 'To Do')!
  const backlog = sections.find((section) => section.name === 'Backlog')!
  const done = sections.find((section) => section.name === 'Done')!

  assert.equal(selectSectionDeletionTarget(sections, backlog.id)?.id, todo.id)
  assert.equal(selectSectionDeletionTarget(sections, done.id)?.id, todo.id)
})

test('the last remaining section cannot be deleted', () => {
  const section = {
    id: 'only',
    name: 'My workflow',
    color: '#6366f1',
    canonicalStatus: 'IN_PROGRESS' as const,
    isDefault: false,
    isDone: false,
    isBacklog: false,
    orderIndex: 0,
  }

  assert.equal(selectSectionDeletionTarget([section], section.id), null)
})
