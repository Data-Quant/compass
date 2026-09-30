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

test('HR sets the active model and a price, and builds the calibration set by hand and from a decided answer', async ({ page }) => {
  await login(page, 'wkle-hr')
  await ensureRunningCycle(page)
  await page.goto('/admin/weekly?tab=ai')
  await page.getByLabel('Active model').fill('accounts/fireworks/models/e2e-model')
  await page.getByRole('button', { name: 'Save active model' }).click()
  await expect(page.getByText('Active model saved')).toBeVisible()
  await page.getByLabel('Priced model').fill('accounts/fireworks/models/e2e-model')
  await page.getByLabel('Input $ per million tokens').fill('0.9')
  await page.getByLabel('Output $ per million tokens').fill('0.9')
  await page.getByRole('button', { name: 'Save price' }).click()
  await expect(page.getByText('Price saved')).toBeVisible()
  await expect(page.getByRole('row', { name: /accounts\/fireworks\/models\/e2e-model/ })).toContainText('Not calibrated')

  await page.getByRole('button', { name: 'Add an item' }).click()
  await page.getByRole('combobox', { name: 'Topic' }).click()
  await page.getByRole('option').first().click()
  await page.getByLabel('Question').fill('Describe a recent situation that shows how they share plans early.')
  await page.getByLabel('Situation').fill('The client moved the launch forward a week and the person owned the handover plan.')
  await page.getByLabel('What they did').fill('They split the work between named owners the same afternoon and checked each deliverable.')
  await page.getByLabel('Result', { exact: true }).fill('The launch went out on the new date with no rework.')
  await page.getByRole('button', { name: 'Save item' }).click()
  await expect(page.getByText('Item added')).toBeVisible()
  await expect(page.getByText('1 of 40 active items')).toBeVisible()

  await page.getByRole('tab', { name: 'Review' }).click()
  await page.getByRole('button', { name: /^Decided/ }).click()
  const card = page.locator('article', { hasText: 'Project Kestrel' })
  await card.getByRole('button', { name: 'Add to calibration set' }).click()
  await page.getByRole('button', { name: 'Add to set' }).click()
  await expect(page.getByText('Added to the calibration set')).toBeVisible()
  await expect(card.getByText('In the calibration set')).toBeVisible()
})

test('HR runs the calibration set with the stand-in and reads why it has not passed', async ({ page }) => {
  await login(page, 'wkle-hr')
  await page.goto('/admin/weekly?tab=ai')
  await page.getByLabel('Model to test').fill('stand-in')
  await page.getByRole('button', { name: 'Start run' }).click()
  await expect(page.getByText(/^Run started/)).toBeVisible()
  const row = page.getByRole('row', { name: /stand-in.*Calibration set/ })
  // The run is scored after the response; refresh until it is done.
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh runs' }).click()
    await expect(row).toContainText('Done', { timeout: 2000 })
  }).toPass({ timeout: 60000 })
  await expect(row).toContainText('Not passed')
  await row.getByRole('button', { name: /^Open the stand-in run/ }).click()
  await expect(page.getByRole('heading', { name: 'Per topic' })).toBeVisible()
  await expect(page.getByText(/Not passed: Only 2 items were scored; at least 40 are needed/)).toBeVisible()
})

test('HR sees cost and standards, asks a low-evidence group again, and reopens then closes the classic questionnaire', async ({ page }) => {
  await login(page, 'wkle-hr')
  await page.goto('/admin/weekly?tab=dashboard')
  await expect(page.getByRole('heading', { name: 'AI cost this quarter' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Standards used this quarter' })).toBeVisible()
  await page.getByRole('button', { name: /^Ask again about / }).first().click()
  await page.getByRole('button', { name: 'Ask again', exact: true }).click()
  await expect(page.getByText(/^Asked again: /)).toBeVisible()
  await page.getByRole('tab', { name: 'Close quarter' }).click()
  await page.getByRole('button', { name: 'Reopen the classic questionnaire for this quarter' }).click()
  await page.getByRole('button', { name: 'Reopen classic questionnaire', exact: true }).click()
  await expect(page.getByText('The classic questionnaire is open for this quarter')).toBeVisible()
  await page.getByRole('button', { name: 'Close it again' }).click()
  await expect(page.getByText('The classic questionnaire is closed again')).toBeVisible()
})

test('the live demo: HR asks a pair now, the lead answers, the AI scores it and the running score moves', async ({ page }) => {
  await login(page, 'wkle-hr')
  await ensureRunningCycle(page)
  await page.goto('/admin/weekly?tab=test')
  await page.getByRole('combobox', { name: 'Evaluator' }).click()
  await page.getByRole('option', { name: 'E2E Weekly Lead' }).click()
  await page.getByRole('combobox', { name: 'About' }).click()
  await page.getByRole('option', { name: 'E2E Weekly Ana · As their lead' }).click()
  await page.getByRole('button', { name: 'Ask this pair now' }).click()
  await expect(page.getByText(/questions asked/)).toBeVisible()
  await page.getByRole('combobox', { name: 'Open inbox as' }).click()
  await page.getByRole('option', { name: 'E2E Weekly Lead' }).click()
  await page.getByRole('button', { name: 'Fill their open questions' }).click()
  await expect(page.getByText(/answers written/)).toBeVisible()
  await page.getByRole('combobox', { name: 'Scoring model' }).click()
  await page.getByRole('option', { name: 'Stand-in model (no AI call)' }).click()
  await page.getByRole('button', { name: 'Score now' }).click()
  await expect(page.getByText(/scored,/)).toBeVisible()

  await page.getByRole('tab', { name: 'Live scores' }).click()
  await page.getByRole('combobox', { name: 'Person' }).click()
  await page.getByRole('option', { name: 'E2E Weekly Ana' }).click()
  await expect(page.getByText('Running score for E2E Weekly Ana')).toBeVisible()
  const fromLead = page.getByRole('row', { name: /E2E Weekly Lead/ }).first()
  await expect(fromLead).toContainText('As their lead')
  await expect(fromLead.getByText(/confidence|Not enough evidence/)).toBeVisible()

  await page.getByRole('tab', { name: 'Test tools' }).click()
  // Uncalibrated scores wait for HR; settling decides every one, as HR would on the Review tab.
  await page.getByRole('button', { name: 'Settle everything for close' }).click()
  await expect(page.getByText(/accepted,/)).toBeVisible()
  await page.getByRole('tab', { name: 'Live scores' }).click()
  await expect(page.getByText('Running score for E2E Weekly Ana')).toBeVisible()
  // The running score ("3.00 / 4") appears once an accepted answer counts; the page refreshes itself.
  await expect(page.getByText(/^[1-4]\.\d\d \/ 4$/)).toBeVisible({ timeout: 15000 })
})

test('HR adds a question to a topic and removes it again', async ({ page }) => {
  await login(page, 'wkle-hr')
  await ensureRunningCycle(page)
  await page.goto('/admin/weekly')
  await page.getByRole('tab', { name: 'Topics and profiles' }).click()
  const text = 'Describe a handover they owned this month. What did the next person still need to ask?'
  await page.getByLabel('New question for Quality of Work').fill(text)
  await page.getByRole('button', { name: 'Add question' }).click()
  await expect(page.getByText('Question added')).toBeVisible()
  await expect(page.getByLabel('Question C', { exact: true })).toHaveValue(text)
  await page.getByRole('button', { name: 'Remove question C' }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).last().click()
  await expect(page.getByText('Question removed')).toBeVisible()
  await expect(page.getByLabel('Question C', { exact: true })).toHaveCount(0)
})
