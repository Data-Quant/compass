import { test, expect, type Page } from '@playwright/test'

const base = process.env.WEEKLY_TEST_URL || 'http://127.0.0.1:3231'
test.use({ baseURL: base })
test.setTimeout(180000)
test.skip(process.env.WEEKLY_BROWSER_TEST !== 'true', 'Explicit local weekly browser run only')
test.describe.configure({ mode: 'serial' })

const STRONG = {
  situation: 'Project Kestrel: the client moved the launch forward by a full week and the handover plan had to be rebuilt quickly.',
  action: 'Without being asked, they rebuilt the plan that afternoon, split the work between named owners and checked every deliverable against the brief.',
  result: 'We delivered on the new date with no rework, and two other teams have since adopted the plan for their own launches.',
}
const PRAISE = {
  situation: 'Project Osprey: working with them in general over the last few weeks, across every project we have shared.',
  action: 'They are honestly amazing, always positive, the best person on the team, and everyone loves working with them every single day.',
  result: 'Everything is always great when they are around and the whole team feels happy and motivated all of the time.',
}

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

/** Answers the first open question; answers still in their 24-hour edit window are listed too, with locked boxes. */
async function answerFirstCardAs(page: Page, person: string, answer: typeof STRONG): Promise<void> {
  await page.getByRole('combobox', { name: 'Open inbox as' }).click()
  await page.getByRole('option', { name: person }).click()
  const situation = page.getByLabel('Situation').and(page.locator(':enabled')).first()
  const card = situation.locator('xpath=ancestor::*[.//button[normalize-space()="Submit"]][1]')
  await situation.fill(answer.situation)
  await card.getByLabel('What they did').fill(answer.action)
  await card.getByLabel('Result').fill(answer.result)
  await card.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.getByText('Answer submitted')).toBeVisible()
}

test('HR scores an answer written through the test tools and accepts the proposed 4', async ({ page }) => {
  await login(page, 'wkle-hr')
  await ensureRunningCycle(page)
  await page.goto('/admin/weekly')
  await page.getByRole('tab', { name: 'Test tools' }).click()
  await page.getByRole('button', { name: 'Release next week now' }).click()
  await expect(page.getByText(/^Week \d+ released/)).toBeVisible()
  await answerFirstCardAs(page, 'E2E Weekly Lead', STRONG)
  await page.getByRole('button', { name: 'Score now' }).click()
  await expect(page.getByText(/ scored, /)).toBeVisible({ timeout: 60000 })
  await page.getByRole('tab', { name: 'Review' }).click()
  const card = page.locator('article', { hasText: 'Project Kestrel' })
  // Scoring after submit runs in the background; refresh until the card is in the queue.
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(card).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 60000 })
  await expect(card.getByText(/AI proposes 4/)).toBeVisible()
  await expect(card.getByText('Proposed 1 or 4')).toBeVisible()
  await card.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.getByText('Decision saved')).toBeVisible()
  await page.getByRole('button', { name: /^Decided/ }).click()
  await expect(page.locator('article', { hasText: 'Project Kestrel' }).getByText(/^Accepted/)).toBeVisible()
})

test('the evaluator sees “Accepted”, never the score', async ({ page }) => {
  await login(page, 'wkle-lead')
  await page.goto('/evaluations/weekly')
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByText('Accepted').first()).toBeVisible()
  await expect(page.getByText(/AI proposes|Transforming The Business/)).toHaveCount(0)
})

test('a thin answer sends the evaluator a follow-up, and HR sees the dashboard', async ({ page }) => {
  await login(page, 'wkle-hr')
  await page.goto('/admin/weekly')
  await page.getByRole('tab', { name: 'Test tools' }).click()
  await answerFirstCardAs(page, 'E2E Weekly Ana', PRAISE)
  await page.getByRole('button', { name: 'Score now' }).click()
  await expect(page.getByText(/ scored, /)).toBeVisible({ timeout: 60000 })
  await page.getByRole('tab', { name: 'Review' }).click()
  await page.getByRole('button', { name: /^Waiting for detail/ }).click()
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(page.locator('article', { hasText: 'Project Osprey' })).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 60000 })
  await page.getByRole('tab', { name: 'Dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'AI quality' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Low evidence' })).toBeVisible()
  await login(page, 'wkle-ana')
  await page.goto('/evaluations/weekly')
  await expect(page.getByText('Follow-up').first()).toBeVisible()
})
