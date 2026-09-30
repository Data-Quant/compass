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
  // Its own deadline: the 28th of the current month (Karachi).
  const month = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 7)
  await page.getByLabel('Deadline').fill(`${month}-28`)
  await page.getByRole('button', { name: 'Save KPI' }).click()
  await expect(page.getByText('Qualified outreach', { exact: true })).toBeVisible()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()
  for (const header of ['Goal', 'KPI', 'Deadline', 'Notes', 'Completed', 'Verified']) await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /Qualified outreach/ })).toContainText('28 ')

  const context = await browser.newContext({ baseURL: base })
  const member = await context.newPage()
  await login(member, 'kpie-member')
  await member.goto('/kpis')
  await expect(member.getByText('Qualified outreach', { exact: true })).toBeVisible()
  await expect(member.getByText('Target: Send 40 qualified outreach emails')).toBeVisible()
  await member.getByRole('button', { name: 'Comments on Qualified outreach' }).click()
  await member.getByLabel('Add a comment').fill('I will share the tracker on Friday.')
  await member.getByRole('button', { name: 'Post comment' }).click()
  // Posted once the box clears and the comment shows in the thread.
  await expect(member.getByLabel('Add a comment')).toHaveValue('')
  await expect(member.getByRole('listitem').filter({ hasText: 'I will share the tracker on Friday.' })).toBeVisible()
  await context.close()
  await page.reload()
  await page.getByRole('tab', { name: 'Team' }).click()
  await expect(page.getByRole('button', { name: 'Comments on Qualified outreach' })).toContainText('Comments (1)')
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

async function openLastMonthTeam(page: Page): Promise<void> {
  await page.goto('/kpis')
  await page.getByRole('tab', { name: 'Team' }).click()
  await page.getByRole('button', { name: 'Previous' }).click()
  await expect(page.getByText('Close the quarter')).toBeVisible()
}

test('a lead claims a locked KPI, Execution rejects it, and the appeal is verified', async ({ page, browser }) => {
  await login(page, 'kpie-lead')
  await openLastMonthTeam(page)
  await page.getByRole('button', { name: 'Claim Signed proposals' }).click()
  await page.getByLabel('Link', { exact: true }).fill('https://example.com/proposals')
  await page.getByRole('button', { name: 'Submit claim' }).click()
  await expect(page.getByText('Claimed done', { exact: true })).toBeVisible()

  const context = await browser.newContext({ baseURL: base })
  const verifier = await context.newPage()
  await login(verifier, 'kpie-verifier')
  await verifier.goto('/kpis/verify')
  await verifier.getByRole('button', { name: 'Review Signed proposals' }).click()
  await expect(verifier.getByText('https://example.com/proposals')).toBeVisible()
  await verifier.getByLabel('Note').fill('Only two proposals are signed')
  await verifier.getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(verifier.getByText('No claims waiting.')).toBeVisible()

  await openLastMonthTeam(page)
  await expect(page.getByText('Only two proposals are signed')).toBeVisible()
  await page.getByRole('button', { name: 'Appeal Signed proposals' }).click()
  await page.getByLabel('Explanation').fill('The third was signed on the last day of the month')
  await page.getByRole('button', { name: 'Send appeal' }).click()
  await expect(page.getByText('Appealed', { exact: true })).toBeVisible()

  await verifier.reload()
  await verifier.getByRole('button', { name: 'Review Signed proposals' }).click()
  await verifier.getByRole('button', { name: 'Verified', exact: true }).click()
  await expect(verifier.getByText('No claims waiting.')).toBeVisible()
  await context.close()
})

test('Execution approves a lead’s change request to a locked KPI', async ({ page, browser }) => {
  await login(page, 'kpie-lead')
  await openLastMonthTeam(page)
  await page.getByRole('button', { name: 'Request change for Client demos' }).click()
  await page.getByLabel('Measurable target').fill('2 client demos')
  await page.getByLabel('Reason').fill('The client paused demos this month')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText('Change requested', { exact: true })).toBeVisible()

  const context = await browser.newContext({ baseURL: base })
  const verifier = await context.newPage()
  await login(verifier, 'kpie-verifier')
  await verifier.goto('/kpis/verify')
  await verifier.getByRole('tab', { name: 'Change requests' }).click()
  await verifier.getByRole('button', { name: 'Approve change to Client demos' }).click()
  await verifier.getByLabel('Decision note').fill('Confirmed with the client')
  await verifier.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(verifier.getByText('No change requests waiting.')).toBeVisible()
  await context.close()

  await openLastMonthTeam(page)
  await expect(page.getByText('Target: 2 client demos')).toBeVisible()
})

test('HR sees last month’s results and downloads the quarter export', async ({ page }) => {
  await login(page, 'kpie-hr')
  await page.goto('/admin/kpis')
  await page.getByRole('tab', { name: 'Results' }).click()
  await page.getByRole('button', { name: 'Previous' }).click()
  await expect(page.getByRole('row', { name: /Signed proposals/ })).toContainText('Verified')
  const now = new Date()
  const quarter = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`
  const exported = await page.request.get(`/api/admin/kpi/export?quarter=${quarter}`)
  expect(exported.status()).toBe(200)
  expect(exported.headers()['content-type']).toContain('spreadsheetml')
})

test('HR sees each lead’s claim history with their first-decision rejection rate', async ({ page }) => {
  await login(page, 'kpie-hr')
  await page.goto('/admin/kpis')
  await page.getByRole('tab', { name: 'Lead history' }).click()
  // Earlier in this file E2E Lead's "Signed proposals" was rejected at its first decision, then verified on appeal.
  await expect(page.getByRole('row', { name: /E2E Lead/ })).toContainText('1 of 1 (100%)')
})
