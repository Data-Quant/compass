import test from 'node:test'
import assert from 'node:assert/strict'
import type { NavItem, SidebarConfig } from '../components/layout/AppSidebar'
import { withGroupItem, withItemAfter, withSecurityChecksNav } from '../components/layout/sidebar-nav'

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

const icons = { tasks: icon, console: icon }
const employeeSidebar: SidebarConfig = { items: [item('/dashboard'), item('/my-tasks'), item('/leave')], groups: [] }
const securitySidebar: SidebarConfig = { items: [item('/security'), item('/security/onboarding'), item('/office')], groups: [] }

test('security checks nav is absent while the module is off', () => {
  assert.equal(withSecurityChecksNav(employeeSidebar, { enabled: false, console: true }, icons), employeeSidebar)
})

test('everyone gets Security Checks; console access adds the console after it', () => {
  const employee = withSecurityChecksNav(employeeSidebar, { enabled: true, console: false }, icons)
  assert.deepEqual(employee.items.map((i) => i.href), ['/dashboard', '/my-tasks', '/security-checks', '/leave'])
  const consoleAdmin = withSecurityChecksNav(employeeSidebar, { enabled: true, console: true }, icons)
  assert.deepEqual(consoleAdmin.items.map((i) => i.href), ['/dashboard', '/my-tasks', '/security-checks', '/security-checks/console', '/leave'])
})

test('on the Security sidebar both entries follow Onboarding', () => {
  const next = withSecurityChecksNav(securitySidebar, { enabled: true, console: true }, icons)
  assert.deepEqual(next.items.map((i) => i.href), ['/security', '/security/onboarding', '/security-checks/console', '/security-checks', '/office'])
})
