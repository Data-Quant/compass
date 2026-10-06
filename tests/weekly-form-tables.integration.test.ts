import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { formsProgress, formTables, saveTableRow } from '../lib/weekly/service/form-tables'
import { formsView } from '../lib/weekly/service/forms'
import { releaseWeek } from '../lib/weekly/service/release'
import { F, seedFormFixtures } from './helpers/weekly-form-fixtures'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
const hr2 = weeklyActor(F.hr2)
let cycleId = ''
let periodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  await seedFormFixtures(prisma)
  ;({ cycleId } = await startedCycle(periodId))
})
afterEach(() => {
  delete process.env.WEEKLY_HR_FILLED_PARTNERS
})
after(async () => {
  await prisma.$disconnect()
})

const ids = async (relationshipType: 'HR' | 'C_LEVEL' | 'DEPT') =>
  (await prisma.evaluationQuestion.findMany({ where: { relationshipType, questionType: 'RATING', orderIndex: { gte: 950 } }, orderBy: { orderIndex: 'asc' } })).map((q) => q.id)

test('HR fills its evaluations in one table: a row per person, a 1 to 4 column per question, and a total', WEEKLY_DB_TEST, async () => {
  const view = await formTables(HR_ACTOR, 'HR', at(12))
  assert.equal(view.open, true)
  assert.equal(view.tables.length, 1)
  const [table] = view.tables
  assert.equal(table.relationshipType, 'HR')
  assert.deepEqual(table.questions.map((q) => q.text), ['Policy adherence', 'Attendance and punctuality'])
  assert.deepEqual(table.rows.map((r) => [r.evaluateeId, r.name, r.designation, r.department, r.status, r.total]), [[W.ana.id, W.ana.name, W.ana.position, W.ana.department, 'NOT_STARTED', null]])
  // HR's own forms leave the end-of-quarter card.
  assert.deepEqual((await formsView(HR_ACTOR, at(12))).forms, [])
})

test('a row saves as a draft, submits only when every question is scored, and closes the HR slot for other HR people', WEEKLY_DB_TEST, async () => {
  const [q1, q2] = await ids('HR')
  const row = { kind: 'HR' as const, evaluatorId: W.hr.id, relationshipType: 'HR' as const, evaluateeId: W.ana.id }
  await saveTableRow(HR_ACTOR, { ...row, ratings: [{ questionId: q1, ratingValue: 3 }, { questionId: q2, ratingValue: null }], submit: false }, at(12))
  let [table] = (await formTables(HR_ACTOR, 'HR', at(12))).tables
  assert.deepEqual([table.rows[0].status, table.rows[0].ratings[q1], table.rows[0].total], ['DRAFT', 3, 3])
  await assert.rejects(saveTableRow(HR_ACTOR, { ...row, ratings: [{ questionId: q1, ratingValue: 3 }, { questionId: q2, ratingValue: null }], submit: true }, at(12)), /Score every question/)
  await saveTableRow(HR_ACTOR, { ...row, ratings: [{ questionId: q1, ratingValue: 3 }, { questionId: q2, ratingValue: 4 }], submit: true }, at(12))
  ;[table] = (await formTables(HR_ACTOR, 'HR', at(12))).tables
  assert.deepEqual([table.rows[0].status, table.rows[0].total], ['SUBMITTED', 7])
  const saved = await prisma.evaluation.findMany({ where: { evaluateeId: W.ana.id, questionId: { in: [q1, q2] } } })
  assert.ok(saved.every((e) => e.evaluatorId === W.hr.id && e.submittedAt !== null))
  assert.equal((await formTables(hr2, 'HR', at(12))).tables[0].rows[0].status, 'CLOSED_BY_OTHER')
  await assert.rejects(saveTableRow(hr2, { ...row, evaluatorId: F.hr2.id, ratings: [{ questionId: q1, ratingValue: 2 }, { questionId: q2, ratingValue: 2 }], submit: true }, at(12)), isStatus(409))
})

test('the table opens with the end-of-quarter forms, refuses edits once the quarter is locked, and is HR only', WEEKLY_DB_TEST, async () => {
  const [q1] = await ids('HR')
  const row = { kind: 'HR' as const, evaluatorId: W.hr.id, relationshipType: 'HR' as const, evaluateeId: W.ana.id, ratings: [{ questionId: q1, ratingValue: 2 }], submit: false }
  assert.equal((await formTables(HR_ACTOR, 'HR', at(3))).open, false)
  await assert.rejects(saveTableRow(HR_ACTOR, row, at(3)), /open on/)
  await assert.rejects(formTables(weeklyActor(W.ana), 'HR', at(12)), isStatus(403))
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isLocked: true } })
  await assert.rejects(saveTableRow(HR_ACTOR, row, at(12)), /locked/)
})

test('partners: their own account has no forms or weekly questions; HR fills every evaluation of theirs in tables', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_HR_FILLED_PARTNERS = F.chief.name
  await prisma.evaluatorMapping.create({ data: { evaluatorId: F.chief.id, evaluateeId: W.lead.id, relationshipType: 'TEAM_LEAD' } })
  assert.deepEqual((await formsView(weeklyActor(F.chief), at(12))).forms, [])
  await releaseWeek(cycleId, 1, at(1))
  assert.equal(await prisma.weeklyPrompt.count({ where: { evaluatorId: F.chief.id } }), 0, 'no weekly questions')

  const view = await formTables(HR_ACTOR, 'PARTNER', at(12))
  const shape = view.tables.map((t) => [t.evaluator.id, t.relationshipType, t.rows.map((r) => `${r.evaluateeId}:${r.memberCount}`)])
  assert.deepEqual(shape, [
    [F.chief.id, 'C_LEVEL', [`${W.ana.id}:1`, `${W.ben.id}:1`]],
    [F.chief.id, 'DEPT', [`${W.ana.id}:2`]],
    [F.chief.id, 'TEAM_LEAD', [`${W.lead.id}:1`]],
  ])
  const lead = view.tables.find((t) => t.relationshipType === 'TEAM_LEAD')!
  assert.deepEqual(lead.questions.map((q) => q.text), ['Quality of Work', 'Initiative & Proactivity', 'Team Collaboration', 'Client Communication'])

  const cLevel = await ids('C_LEVEL')
  await saveTableRow(HR_ACTOR, { kind: 'PARTNER', evaluatorId: F.chief.id, relationshipType: 'C_LEVEL', evaluateeId: W.ana.id, ratings: cLevel.map((questionId) => ({ questionId, ratingValue: 3 })), submit: true }, at(12))
  const rows = await prisma.evaluation.findMany({ where: { evaluateeId: W.ana.id, questionId: { in: cLevel } } })
  assert.ok(rows.length === 3 && rows.every((r) => r.evaluatorId === F.chief.id && r.submittedAt))
  // Only for real partners, and only by HR.
  await assert.rejects(saveTableRow(HR_ACTOR, { kind: 'PARTNER', evaluatorId: W.lead.id, relationshipType: 'C_LEVEL', evaluateeId: W.ana.id, ratings: [], submit: false }, at(12)), isStatus(404))
  await assert.rejects(formTables(weeklyActor(F.chief), 'PARTNER', at(12)), isStatus(403))
})

test('a partner with unfinished evaluations makes HR, not the partner, the one reminded', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_HR_FILLED_PARTNERS = F.chief.name
  const { pendingEvaluatorIds } = await formsProgress(periodId)
  assert.ok(!pendingEvaluatorIds.includes(F.chief.id))
  assert.ok(pendingEvaluatorIds.includes(W.hr.id) && pendingEvaluatorIds.includes(F.hr2.id))
})
