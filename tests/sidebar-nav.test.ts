import test from 'node:test'
import assert from 'node:assert/strict'
import type { NavItem, SidebarConfig } from '../components/layout/AppSidebar'
import { withGroupItem, withItemAfter, withItemPatched, withSecurityChecksNav } from '../components/layout/sidebar-nav'

const icon = (() => null) as unknown as NavItem['icon']
const item = (href: string): NavItem => ({ label: href, href, icon })
const config: SidebarConfig = {
  items: [item('/dashboard'), item('/evaluations/weekly'), item('/leave')],
  groups: [{ label: 'Performance', items: [item('/admin/periods')] }],
}

test('adds to a named group only, once', () => {
  const next = withGroupItem(config, 'Performance', item('/admin/evaluation-round'))
  assert.deepEqual(next.groups[0].items.map((i) => i.href), ['/admin/periods', '/admin/evaluation-round'])
  assert.equal(config.groups[0].items.length, 1)
  assert.equal(withGroupItem(next, 'Performance', item('/admin/evaluation-round')), next)
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

test('inserts after the anchor without mutating the input', () => {
  const next = withItemAfter(config, item('/office'), '/evaluations/weekly')
  assert.deepEqual(next.items.map((i) => i.href), ['/dashboard', '/evaluations/weekly', '/office', '/leave'])
  assert.deepEqual(config.items.map((i) => i.href), ['/dashboard', '/evaluations/weekly', '/leave'])
})

test('appends when the anchor is missing and never duplicates', () => {
  assert.deepEqual(withItemAfter(config, item('/office'), '/nowhere').items.at(-1)?.href, '/office')
  const once = withItemAfter(config, item('/office'), '/evaluations/weekly')
  assert.equal(withItemAfter(once, item('/office'), '/evaluations/weekly'), once)
})

const employeeSidebar: SidebarConfig = { items: [item('/dashboard'), item('/my-tasks'), item('/device-support'), item('/office')], groups: [] }
const securitySidebar: SidebarConfig = { items: [item('/security'), item('/security/device-tickets'), item('/security/assets')], groups: [] }
const hrefs = (config: SidebarConfig) => config.items.map((i) => i.href)

test('security nav is absent while the module is off', () => {
  assert.equal(withSecurityChecksNav(employeeSidebar, { enabled: false, console: true }, icon), employeeSidebar)
})

test('one Security entry takes the place of Device Support on the employee sidebar', () => {
  assert.deepEqual(hrefs(withSecurityChecksNav(employeeSidebar, { enabled: true, console: false }, icon)), ['/dashboard', '/my-tasks', '/security-checks', '/office'])
  assert.deepEqual(hrefs(withSecurityChecksNav(employeeSidebar, { enabled: true, console: true }, icon)), ['/dashboard', '/my-tasks', '/security-checks', '/office'])
})

test('on the Security sidebar it takes the place of Device Tickets', () => {
  assert.deepEqual(hrefs(withSecurityChecksNav(securitySidebar, { enabled: true, console: true }, icon)), ['/security', '/security-checks', '/security/assets'])
})

test('without a device entry it follows My Tasks, once', () => {
  const plain: SidebarConfig = { items: [item('/dashboard'), item('/my-tasks'), item('/leave')], groups: [] }
  const once = withSecurityChecksNav(plain, { enabled: true, console: false }, icon)
  assert.deepEqual(hrefs(once), ['/dashboard', '/my-tasks', '/security-checks', '/leave'])
  assert.deepEqual(hrefs(withSecurityChecksNav(once, { enabled: true, console: false }, icon)), hrefs(once))
})

test('the admin console gets Security under Operations only with console access', () => {
  const adminSidebar: SidebarConfig = { items: [item('/admin')], groups: [{ label: 'Operations', items: [item('/admin/leave')] }] }
  const next = withSecurityChecksNav(adminSidebar, { enabled: true, console: true }, icon)
  assert.deepEqual(hrefs(next), ['/admin'])
  assert.deepEqual(next.groups[0].items.map((i) => i.href), ['/admin/leave', '/security-checks'])
  assert.equal(withSecurityChecksNav(adminSidebar, { enabled: true, console: false }, icon), adminSidebar)
})
