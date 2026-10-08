import test from 'node:test'
import assert from 'node:assert/strict'
import type { NavItem, SidebarConfig } from '../components/layout/AppSidebar'
import { withGroupItem, withItemAfter, withItemPatched } from '../components/layout/sidebar-nav'

const icon = (() => null) as unknown as NavItem['icon']
const item = (href: string): NavItem => ({ label: href, href, icon })
const config: SidebarConfig = {
  items: [item('/dashboard'), item('/evaluations/weekly'), item('/leave')],
  groups: [{ label: 'Performance', items: [item('/admin/periods')] }],
}

test('inserts after the anchor without mutating the input', () => {
  const next = withItemAfter(config, item('/kpis'), '/evaluations/weekly')
  assert.deepEqual(next.items.map((i) => i.href), ['/dashboard', '/evaluations/weekly', '/kpis', '/leave'])
  assert.deepEqual(config.items.map((i) => i.href), ['/dashboard', '/evaluations/weekly', '/leave'])
})

test('appends when the anchor is missing and never duplicates', () => {
  assert.deepEqual(withItemAfter(config, item('/kpis'), '/nowhere').items.at(-1)?.href, '/kpis')
  const once = withItemAfter(config, item('/kpis'), '/evaluations/weekly')
  assert.equal(withItemAfter(once, item('/kpis'), '/evaluations/weekly'), once)
})

test('adds to a named group only, once', () => {
  const next = withGroupItem(config, 'Performance', item('/admin/kpis'))
  assert.deepEqual(next.groups[0].items.map((i) => i.href), ['/admin/periods', '/admin/kpis'])
  assert.equal(config.groups[0].items.length, 1)
  assert.equal(withGroupItem(next, 'Performance', item('/admin/kpis')), next)
})

test('the Evaluations item gets the weekly badge in place, without touching the input', () => {
  const next = withItemPatched(config, '/evaluations/weekly', { badge: 3 })
  assert.deepEqual(next.items.map((i) => i.href), ['/dashboard', '/evaluations/weekly', '/leave'])
  assert.equal(next.items[1].badge, 3)
  assert.equal(config.items[1].badge, undefined)
  assert.equal(withItemPatched(config, '/nowhere', { badge: 1 }), config)
})

test('a group item can go first in its group', () => {
  const result = withGroupItem(config, 'Performance', item('/admin/evaluation-round'), 'start')
  assert.deepEqual(result.groups[0].items.map((i) => i.href), ['/admin/evaluation-round', '/admin/periods'])
})
