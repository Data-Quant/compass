import { test, expect, type Page } from '@playwright/test'

const base = process.env.KPI_TEST_URL || 'http://127.0.0.1:3230'
test.use({ baseURL: base })
test.setTimeout(90000)
test.skip(process.env.KPI_BROWSER_TEST !== 'true', 'Explicit local KPI browser run only')
test.describe.configure({ mode: 'serial' })

async function login(page: Page, id: string): Promise<void> {
  const token = await (await page.request.get('/api/auth/csrf')).json()
  const result = await page.request.post('/api/auth/login', {
    headers: { 'x-csrf-token': token.token },
    data: { email: `${id}@example.test`, password: process.env.KPI_FIXTURE_PASSWORD },
  })
  expect(result.status()).toBe(200)
}

async function addGoalAndKpi(page: Page, goal: string, kpi: string, target: string): Promise<void> {
  await page.getByRole('button', { name: 'New goal' }).click()
  await page.getByLabel('Goal', { exact: true }).fill(goal)
  await page.getByRole('button', { name: 'Save goal' }).click()
  await expect(page.getByRole('heading', { name: goal })).toBeVisible()
  await page.getByRole('button', { name: 'Add KPI' }).click()
  await page.getByLabel('KPI', { exact: true }).fill(kpi)
  await page.getByLabel('Measurable target').fill(target)
}

test('a lead sets a team KPI and its owner sees it', async ({ page, browser }) => {
  await login(page, 'kpie-lead')
  await page.goto('/kpis')
  await page.getByRole('tab', { name: 'Team' }).click()
  await addGoalAndKpi(page, 'Grow the pipeline', 'Qualified outreach', 'Send 40 qualified outreach emails')
  await page.getByRole('checkbox', { name: 'E2E Member' }).check()
  await page.getByRole('button', { name: 'Save KPI' }).click()
  await expect(page.getByText('Qualified outreach', { exact: true })).toBeVisible()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()

  const context = await browser.newContext({ baseURL: base })
  const member = await context.newPage()
  await login(member, 'kpie-member')
  await member.goto('/kpis')
  await expect(member.getByText('Qualified outreach', { exact: true })).toBeVisible()
  await expect(member.getByText('Target: Send 40 qualified outreach emails')).toBeVisible()
  await context.close()
})

test('a Partner sets department KPIs owned by the department’s leads and JPs', async ({ page }) => {
  await login(page, 'kpie-partner')
  await page.goto('/kpis/department')
  await addGoalAndKpi(page, 'Ship the Q4 roadmap', 'Release v2', 'v2 live for all clients')
  await expect(page.getByRole('checkbox', { name: 'E2E Lead' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'E2E JP' })).toBeChecked()
  await page.getByRole('button', { name: 'Save KPI' }).click()
  await expect(page.getByText('Release v2', { exact: true })).toBeVisible()
})

test('people without a role cannot use team, department-setting or verification APIs', async ({ page }) => {
  await login(page, 'kpie-orphan')
  expect((await page.request.get('/api/kpi/team')).status()).toBe(403)
  expect((await page.request.get('/api/kpi/verify/kpis')).status()).toBe(403)
  const monthKey = new Date().toISOString().slice(0, 7)
  const forged = await page.request.post('/api/kpi/goals', {
    headers: { origin: base },
    data: { monthKey, scope: 'DEPARTMENT', departmentKey: 'product', title: 'Sneaky goal' },
  })
  expect(forged.status()).toBe(403)
  const crossSite = await page.request.post('/api/kpi/goals', {
    headers: { origin: 'https://evil.example' },
    data: { monthKey, scope: 'TEAM', title: 'Forged' },
  })
  expect(crossSite.status()).toBe(403)
  expect((await page.request.get('/api/kpi/team?month=2026-13')).status()).toBe(400)
})

test('HR assigns a setter to someone without one', async ({ page }) => {
  await login(page, 'kpie-hr')
  await page.goto('/admin/kpis')
  await page.getByRole('tab', { name: 'Setters' }).click()
  await page.getByRole('button', { name: 'Assign setter for E2E Orphan' }).click()
  await page.getByRole('combobox', { name: 'Setter' }).click()
  await page.getByRole('option', { name: 'E2E Lead' }).click()
  await page.getByLabel('Reason').fill('No lead mapping yet')
  await page.getByRole('button', { name: 'Assign', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'E2E Orphan' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Assign setter for E2E Orphan' })).toHaveCount(0)
})
