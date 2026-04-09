import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Navigation & Sidebar Tests
 * 
 * These tests validate the sidebar configuration structures
 * and ensure nav items have valid hrefs.
 */

// Import the sidebar configs (they're pure data, no React needed)
// We need to test the structure without importing React components
// So we duplicate the config data here for structural testing

const EMPLOYEE_NAV_ITEMS = [
  { label: 'Home', href: '/dashboard' },
  { label: 'My Tasks', href: '/my-tasks' },
  { label: 'Evaluations', href: '/evaluations' },
  { label: 'Leave', href: '/leave' },
  { label: 'Projects', href: '/projects' },
  { label: 'Device Support', href: '/device-support' },
  { label: 'Office', href: '/office' },
  { label: 'Profile', href: '/profile' },
]

const ADMIN_NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin' },
]

const ADMIN_NAV_GROUPS = [
  {
    label: 'People',
    items: [
      { label: 'Users', href: '/admin/users' },
      { label: 'Org Chart', href: '/admin/org-chart' },
    ],
  },
  {
    label: 'Performance',
    items: [
      { label: 'Periods', href: '/admin/periods' },
      { label: 'Questions', href: '/admin/questions' },
      { label: 'Mappings', href: '/admin/mappings' },
      { label: 'Weightages', href: '/admin/settings' },
      { label: 'Reports', href: '/admin/reports' },
      { label: 'Email', href: '/admin/email' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Leave', href: '/admin/leave' },
      { label: 'Device Tickets', href: '/admin/device-tickets' },
      { label: 'Assets', href: '/admin/assets' },
      { label: 'Payroll', href: '/admin/payroll' },
      { label: 'Subscription Management', href: '/admin/subscriptions' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Analytics', href: '/admin/analytics' },
    ],
  },
  {
    label: 'Onboarding',
    items: [
      { label: 'Dashboard', href: '/admin/onboarding' },
      { label: 'Positions', href: '/admin/onboarding/positions' },
      { label: 'New Hires', href: '/admin/onboarding/new-hires' },
      { label: 'Modules', href: '/admin/onboarding/modules' },
      { label: 'Quiz', href: '/admin/onboarding/quiz' },
      { label: 'Benefits', href: '/admin/onboarding/benefits' },
      { label: 'Settings', href: '/admin/onboarding/config' },
    ],
  },
]

// ─── Employee Nav Tests ──────────────────────────────────────────────────────

test('employee nav items all have non-empty labels', () => {
  for (const item of EMPLOYEE_NAV_ITEMS) {
    assert.ok(item.label.length > 0, `Empty label found`)
  }
})

test('employee nav items all have valid href paths', () => {
  for (const item of EMPLOYEE_NAV_ITEMS) {
    assert.ok(item.href.startsWith('/'), `Invalid href: ${item.href}`)
  }
})

test('employee nav has no duplicate hrefs', () => {
  const hrefs = EMPLOYEE_NAV_ITEMS.map((i) => i.href)
  const unique = new Set(hrefs)
  assert.equal(hrefs.length, unique.size, 'Duplicate hrefs found')
})

test('employee nav has Home as first item', () => {
  assert.equal(EMPLOYEE_NAV_ITEMS[0].label, 'Home')
  assert.equal(EMPLOYEE_NAV_ITEMS[0].href, '/dashboard')
})

test('employee nav includes all required sections', () => {
  const labels = EMPLOYEE_NAV_ITEMS.map((i) => i.label)
  assert.ok(labels.includes('My Tasks'), 'Missing My Tasks')
  assert.ok(labels.includes('Evaluations'), 'Missing Evaluations')
  assert.ok(labels.includes('Leave'), 'Missing Leave')
  assert.ok(labels.includes('Projects'), 'Missing Projects')
  assert.ok(labels.includes('Office'), 'Missing Office')
  assert.ok(labels.includes('Profile'), 'Missing Profile')
})

// ─── Admin Nav Tests ─────────────────────────────────────────────────────────

test('admin nav has Dashboard as top-level item', () => {
  assert.equal(ADMIN_NAV_ITEMS[0].label, 'Dashboard')
  assert.equal(ADMIN_NAV_ITEMS[0].href, '/admin')
})

test('admin nav groups all have non-empty labels', () => {
  for (const group of ADMIN_NAV_GROUPS) {
    assert.ok(group.label.length > 0, `Empty group label`)
    assert.ok(group.items.length > 0, `Empty group: ${group.label}`)
  }
})

test('admin nav group items all have valid admin hrefs', () => {
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      assert.ok(
        item.href.startsWith('/admin/'),
        `Invalid admin href: ${item.href} in group ${group.label}`
      )
    }
  }
})

test('admin nav has no duplicate hrefs across all groups', () => {
  const allHrefs = [
    ...ADMIN_NAV_ITEMS.map((i) => i.href),
    ...ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)),
  ]
  const unique = new Set(allHrefs)
  assert.equal(allHrefs.length, unique.size, 'Duplicate admin hrefs found')
})

test('admin nav Performance group includes all PE management tools', () => {
  const perfGroup = ADMIN_NAV_GROUPS.find((g) => g.label === 'Performance')
  assert.ok(perfGroup, 'Performance group not found')
  const labels = perfGroup!.items.map((i) => i.label)
  assert.ok(labels.includes('Periods'), 'Missing Periods')
  assert.ok(labels.includes('Questions'), 'Missing Questions')
  assert.ok(labels.includes('Mappings'), 'Missing Mappings')
  assert.ok(labels.includes('Reports'), 'Missing Reports')
  assert.ok(labels.includes('Email'), 'Missing Email')
})

test('admin nav People group includes Users', () => {
  const peopleGroup = ADMIN_NAV_GROUPS.find((g) => g.label === 'People')
  assert.ok(peopleGroup, 'People group not found')
  const labels = peopleGroup!.items.map((i) => i.label)
  assert.ok(labels.includes('Users'), 'Missing Users')
})

test('admin nav Operations group includes Leave, Assets, Payroll, and Subscriptions', () => {
  const opsGroup = ADMIN_NAV_GROUPS.find((g) => g.label === 'Operations')
  assert.ok(opsGroup, 'Operations group not found')
  const labels = opsGroup!.items.map((i) => i.label)
  assert.ok(labels.includes('Leave'), 'Missing Leave')
  assert.ok(labels.includes('Assets'), 'Missing Assets')
  assert.ok(labels.includes('Payroll'), 'Missing Payroll')
  assert.ok(labels.includes('Subscription Management'), 'Missing Subscription Management')
})

test('admin nav Onboarding group includes all onboarding routes', () => {
  const onboardingGroup = ADMIN_NAV_GROUPS.find((g) => g.label === 'Onboarding')
  assert.ok(onboardingGroup, 'Onboarding group not found')
  const labels = onboardingGroup!.items.map((i) => i.label)
  assert.ok(labels.includes('Dashboard'), 'Missing onboarding dashboard')
  assert.ok(labels.includes('Positions'), 'Missing onboarding positions')
  assert.ok(labels.includes('New Hires'), 'Missing onboarding new hires')
  assert.ok(labels.includes('Modules'), 'Missing onboarding modules')
  assert.ok(labels.includes('Quiz'), 'Missing onboarding quiz')
  assert.ok(labels.includes('Benefits'), 'Missing onboarding benefits')
  assert.ok(labels.includes('Settings'), 'Missing onboarding settings')
})
