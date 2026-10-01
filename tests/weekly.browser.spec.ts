import { test, expect, type Page } from '@playwright/test'

const base = process.env.WEEKLY_TEST_URL || 'http://127.0.0.1:3231'
test.use({ baseURL: base })
test.setTimeout(120000)
test.skip(process.env.WEEKLY_BROWSER_TEST !== 'true', 'Explicit local weekly browser run only')
test.describe.configure({ mode: 'serial' })

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

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

async function answerFirstCard(page: Page): Promise<void> {
  await page.getByLabel('Situation').first().fill(`The client moved the launch forward a week ${words(8)}`)
  await page.getByLabel('What they did').first().fill(`They rebuilt the plan the same afternoon ${words(10)}`)
  await page.getByLabel('Result').first().fill(`We delivered on time with no rework ${words(10)}`)
  await page.getByRole('button', { name: 'Submit', exact: true }).first().click()
  await expect(page.getByText('Answer submitted')).toBeVisible()
}

test('HR loads the topics, approves them and starts a weekly quarter', async ({ page }) => {
  await login(page, 'wkle-hr')
  await page.goto('/admin/weekly')
  await page.getByRole('tab', { name: 'Topics and profiles' }).click()
  await page.getByRole('button', { name: 'Sync from the question bank' }).click()
  await expect(page.getByText('Quality of Work', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Test tools' }).click()
  await page.getByRole('button', { name: 'Approve all drafts' }).click()
  await expect(page.getByText('10 profiles approved')).toBeVisible()
  await page.getByRole('tab', { name: 'Setup' }).click()
  await page.getByRole('combobox', { name: 'Quarter' }).click()
  await page.getByRole('option', { name: 'Q4 2026 (weekly e2e)' }).click()
  await page.getByLabel('Week 1 starts (a Monday)').fill(thisMondayKarachi())
  await page.getByRole('button', { name: 'Create cycle' }).click()
  await expect(page.getByText('In setup', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('button', { name: 'Start now' }).click()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
})

test('HR releases week 1 and answers as the lead through the test tools', async ({ page }) => {
  await login(page, 'wkle-hr')
  await page.goto('/admin/weekly')
  await page.getByRole('tab', { name: 'Test tools' }).click()
  await page.getByRole('button', { name: 'Release next week now' }).click()
  await expect(page.getByText(/^Week 1 released/)).toBeVisible()
  await page.getByRole('combobox', { name: 'Open inbox as' }).click()
  await page.getByRole('option', { name: 'E2E Weekly Lead' }).click()
  await expect(page.getByText(/As their lead/).first()).toBeVisible()
  await answerFirstCard(page)
})

test('an evaluator answers their own question and sees it in their history', async ({ page }) => {
  await login(page, 'wkle-ana')
  await page.goto('/dashboard')
  await expect(page.getByText('This week’s evaluation questions')).toBeVisible()
  await page.goto('/evaluations/weekly')
  // One Evaluations item in the sidebar opens the weekly questions; a switcher reaches the quarterly evaluations.
  await expect(page.getByRole('link', { name: /^Weekly evaluations/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Evaluations/ }).first()).toHaveAttribute('href', '/evaluations/weekly')
  await expect(page.getByRole('navigation', { name: 'Evaluations' }).getByRole('link', { name: 'Quarterly evaluations' })).toBeVisible()
  await answerFirstCard(page)
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByText('Submitted').first()).toBeVisible()
  // Progress moves on submitting, before HR accepts anything.
  await page.getByRole('tab', { name: 'Progress' }).click()
  await expect(page.getByText(/[1-9] of \d+ topics answered/).first()).toBeVisible()
})

test('HR fills the rest with synthetic answers', async ({ page }) => {
  await login(page, 'wkle-hr')
  await page.goto('/admin/weekly')
  await page.getByRole('tab', { name: 'Test tools' }).click()
  await page.getByRole('button', { name: 'Fill synthetic answers' }).click()
  await expect(page.getByText(/answers written$/)).toBeVisible()
})
