import { test, expect, type Page } from '@playwright/test'

const base = process.env.WEEKLY_TEST_URL || 'http://127.0.0.1:3231'
test.use({ baseURL: base })
test.setTimeout(180000)
test.skip(process.env.WEEKLY_BROWSER_TEST !== 'true', 'Explicit local weekly browser run only')
test.describe.configure({ mode: 'serial' })

async function login(page: Page, id: string): Promise<void> {
  const token = await (await page.request.get('/api/auth/csrf')).json()
  const result = await page.request.post('/api/auth/login', {
    headers: { 'x-csrf-token': token.token },
    data: { email: `${id}@example.test`, password: process.env.KPI_FIXTURE_PASSWORD },
  })
  expect(result.status()).toBe(200)
}

function thisMondayKarachi(): string {
  const karachi = new Date(Date.now() + 5 * 60 * 60 * 1000)
  const back = (karachi.getUTCDay() + 6) % 7
  return new Date(Date.UTC(karachi.getUTCFullYear(), karachi.getUTCMonth(), karachi.getUTCDate() - back)).toISOString().slice(0, 10)
}

/** Uses the running cycle, or sets one up through the API (sync, approve, create, start). */
async function ensureRunningCycle(page: Page): Promise<void> {
  const headers = { origin: base }
  const cycles = await (await page.request.get('/api/admin/weekly/cycles')).json()
  if (cycles.cycles.some((c: { status: string }) => c.status === 'RUNNING')) return
  expect((await page.request.post('/api/admin/weekly/content/sync', { headers })).status()).toBe(200)
  expect((await page.request.post('/api/admin/weekly/test-tools', { headers, data: { action: 'approve-all-drafts' } })).status()).toBe(200)
  const period = cycles.periods.find((p: { name: string }) => p.name === 'Q4 2026 (weekly e2e)')
  const created = await page.request.post('/api/admin/weekly/cycles', { headers, data: { periodId: period.id, weekOneStartsOn: thisMondayKarachi(), weeklyCap: 5 } })
  expect(created.status()).toBe(200)
  const { cycleId } = await created.json()
  expect((await page.request.patch(`/api/admin/weekly/cycles/${cycleId}`, { headers, data: { action: 'start' } })).status()).toBe(200)
}

test('HR opens the forms early and the C-Level evaluator submits one', async ({ page }) => {
  await login(page, 'wkle-hr')
  await ensureRunningCycle(page)
  await page.goto('/admin/weekly?tab=close')
  await page.getByRole('button', { name: 'Open forms now' }).click()
  await expect(page.getByText('Forms are open')).toBeVisible()
  await login(page, 'wkle-chief')
  await page.goto('/evaluations/weekly')
  await expect(page.getByRole('heading', { name: 'End-of-quarter forms' })).toBeVisible()
  await page.getByRole('button', { name: 'Open the C-Level form for E2E Weekly Ana' }).click()
  const ratings = page.getByRole('button', { name: /^3 · / })
  await expect(ratings.first()).toBeVisible()
  const count = await ratings.count()
  for (let i = 0; i < count; i += 1) await ratings.nth(i).click()
  await page.getByLabel('Comments for the person').fill('A steady quarter with clear ownership of the handover.')
  await page.getByRole('button', { name: 'Submit form' }).click()
  await expect(page.getByText('Form submitted')).toBeVisible()
})

test('HR settles the queue, drops empty groups, closes the quarter and publishes results', async ({ page }) => {
  await login(page, 'wkle-hr')
  await page.goto('/admin/weekly')
  await page.getByRole('tab', { name: 'Test tools' }).click()
  await page.getByRole('button', { name: 'Settle everything for close' }).click()
  await expect(page.getByText(/ scored by hand$/)).toBeVisible({ timeout: 90000 })
  await page.getByRole('tab', { name: 'Close quarter' }).click()
  const selectAll = page.getByRole('button', { name: 'Select all' })
  if (await selectAll.isVisible()) await selectAll.click()
  await page.getByRole('button', { name: 'Close the quarter' }).click()
  await page.getByRole('button', { name: 'Close quarter', exact: true }).click()
  await expect(page.getByText(/^Quarter closed: /)).toBeVisible({ timeout: 90000 })
  await page.getByRole('button', { name: 'Mark results published' }).click()
  await page.getByRole('button', { name: 'Publish results', exact: true }).click()
  await expect(page.getByText(/^Results published\. Challenges close /)).toBeVisible()
})

test('Ana raises a challenge from her dashboard and HR resolves it', async ({ page }) => {
  await login(page, 'wkle-ana')
  await page.goto('/dashboard')
  await page.getByLabel('Why are you challenging your results?').fill('My C-Level rating does not reflect the client work I led this quarter.')
  await page.getByRole('button', { name: 'Raise a challenge' }).click()
  await expect(page.getByText('Challenge raised')).toBeVisible()
  await login(page, 'wkle-hr')
  await page.goto('/admin/weekly?tab=challenges')
  await page.getByRole('button', { name: 'Open the challenge from E2E Weekly Ana' }).click()
  await page.getByLabel('Resolution').fill('The C-Level rating reflects the evidence we have for this quarter.')
  await page.getByRole('button', { name: 'Resolve challenge' }).click()
  await expect(page.getByText('Challenge resolved')).toBeVisible()
})
