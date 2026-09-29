import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { weekStartsAt } from '../lib/weekly/calendar'
import { WeeklyError } from '../lib/weekly/service/errors'
import { formDetail, formsView, openForms } from '../lib/weekly/service/forms'
import { F, seedFormFixtures } from './helpers/weekly-form-fixtures'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
const chief = weeklyActor(F.chief)
let cycleId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  await seedFormFixtures(prisma)
  ;({ cycleId } = await startedCycle(periodId))
})
after(async () => {
  await prisma.$disconnect()
})

const summary = (forms: Awaited<ReturnType<typeof formsView>>['forms']) => forms.map((f) => `${f.relationshipType}:${f.evaluatee.id}:${f.memberCount}:${f.status}`)

test('each form evaluator sees their own forms; a department is one form for all its members', WEEKLY_DB_TEST, async () => {
  assert.deepEqual(summary((await formsView(chief, at(12))).forms), [
    `C_LEVEL:${W.ana.id}:1:NOT_STARTED`, `C_LEVEL:${W.ben.id}:1:NOT_STARTED`, `DEPT:${W.ana.id}:2:NOT_STARTED`,
  ])
  assert.deepEqual(summary((await formsView(HR_ACTOR, at(12))).forms), [`HR:${W.ana.id}:1:NOT_STARTED`])
  assert.deepEqual((await formsView(weeklyActor(W.lead), at(12))).forms, [])
})

test('forms stay closed until the catch-up weeks, unless HR opens them early', WEEKLY_DB_TEST, async () => {
  const early = await formsView(chief, at(3))
  const cycle = await prisma.weeklyCycle.findUniqueOrThrow({ where: { id: cycleId } })
  assert.equal(early.open, false)
  assert.equal(early.opensAt, weekStartsAt(cycle.weekOneStartsOn, 12).toISOString())
  assert.equal((await formsView(chief, at(12))).open, true)
  await assert.rejects(openForms(weeklyActor(W.lead), cycleId, at(3)), isStatus(403))
  await openForms(HR_ACTOR, cycleId, at(3))
  assert.equal((await formsView(chief, at(3))).open, true)
  assert.equal(await prisma.weeklyAuditEvent.count({ where: { action: 'FORMS_OPEN', objectId: cycleId } }), 1)
})

test('a form shows its questions, ratings first, and the evaluator’s allowance of 4s', WEEKLY_DB_TEST, async () => {
  const detail = await formDetail(chief, { relationshipType: 'C_LEVEL', evaluateeId: W.ana.id }, at(12))
  assert.deepEqual(detail.questions.map((q) => `${q.type}:${q.text}`), [
    'RATING:Strategic contribution', 'RATING:Ownership', 'RATING:Client impact', 'TEXT:Comments for the person',
  ])
  assert.deepEqual([detail.status, detail.open, detail.fourRatings], ['NOT_STARTED', true, { max: 1, used: 0 }])
  assert.equal((await formDetail(HR_ACTOR, { relationshipType: 'HR', evaluateeId: W.ana.id }, at(12))).fourRatings, null)
  await assert.rejects(formDetail(chief, { relationshipType: 'HR', evaluateeId: W.ana.id }, at(12)), isStatus(404))
})
