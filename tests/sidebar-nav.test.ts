import test from 'node:test'
import assert from 'node:assert/strict'
import type { NavItem, SidebarConfig } from '../components/layout/AppSidebar'
import { withGroupItem, withItemAfter, withItemPatched } from '../components/layout/sidebar-nav'

const icon = (() => null) as unknown as NavItem['icon']
const item = (href: string): NavItem => ({ label: href, href, icon })
const config: SidebarConfig = {
  items: [item('/dashboard'), item('/evaluations'), item('/leave')],
  groups: [{ label: 'Performance', items: [item('/admin/periods')] }],
}

test('inserts after the anchor without mutating the input', () => {
  const next = withItemAfter(config, item('/kpis'), '/evaluations')
  assert.deepEqual(next.items.map((i) => i.href), ['/dashboard', '/evaluations', '/kpis', '/leave'])
  assert.deepEqual(config.items.map((i) => i.href), ['/dashboard', '/evaluations', '/leave'])
})

test('appends when the anchor is missing and never duplicates', () => {
  assert.deepEqual(withItemAfter(config, item('/kpis'), '/nowhere').items.at(-1)?.href, '/kpis')
  const once = withItemAfter(config, item('/kpis'), '/evaluations')
  assert.equal(withItemAfter(once, item('/kpis'), '/evaluations'), once)
})

test('adds to a named group only, once', () => {
  const next = withGroupItem(config, 'Performance', item('/admin/kpis'))
  assert.deepEqual(next.groups[0].items.map((i) => i.href), ['/admin/periods', '/admin/kpis'])
  assert.equal(config.groups[0].items.length, 1)
  assert.equal(withGroupItem(next, 'Performance', item('/admin/kpis')), next)
})

test('weekly evaluations live inside the one Evaluations item: its link, badge and highlight change in place', () => {
  const next = withItemPatched(config, '/evaluations', { href: '/evaluations/weekly', activePrefix: '/evaluations', badge: 3 })
  assert.deepEqual(next.items.map((i) => i.href), ['/dashboard', '/evaluations/weekly', '/leave'])
  assert.deepEqual([next.items[1].badge, next.items[1].activePrefix, next.items[1].label], [3, '/evaluations', '/evaluations'])
  assert.equal(config.items[1].href, '/evaluations')
  assert.equal(withItemPatched(config, '/nowhere', { badge: 1 }), config)
})
