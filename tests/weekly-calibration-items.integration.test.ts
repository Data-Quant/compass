import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { calibrationItemSchema } from '../lib/weekly/schemas'
import { addCalibrationItem, ALREADY_IN_SET, calibrationItemsView, updateCalibrationItem } from '../lib/weekly/service/calibration-items'
import { WeeklyError } from '../lib/weekly/service/errors'
import { reviewQueue } from '../lib/weekly/service/review-queue'
import { approvedTopicId } from './helpers/weekly-calibration-fixtures'
import { leadEvidenceIn } from './helpers/weekly-close-fixtures'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isError = (status: number, pattern?: RegExp) => (e: unknown) => e instanceof WeeklyError && e.status === status && (!pattern || pattern.test(e.message))
const HAND = {
  question: 'Describe a time they shared a plan before it was final. What happened?',
  situation: 'The person shared a draft launch plan with two teams a week early.',
  action: 'They asked each team for the risks they saw and changed the order of work.',
  result: 'Both teams started on time and nobody had to redo work.',
  shortfall: null,
}
let cycleId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  ;({ cycleId } = await startedCycle(periodId))
})
after(async () => {
  await prisma.$disconnect()
})

test('an answer is copied with both names replaced, only once, and its review card knows it is in the set', WEEKLY_DB_TEST, async () => {
  const { responseId } = await leadEvidenceIn(cycleId)
  const add = () => addCalibrationItem(HR_ACTOR, { source: 'answer', responseId, hrSufficiency: 'SUFFICIENT', hrScore: 4 }, at(1, 4))
  const results = await Promise.allSettled([add(), add()])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const loser = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  assert.ok(isError(409, new RegExp(ALREADY_IN_SET))(loser?.reason), String(loser?.reason))
  const item = await prisma.weeklyCalibrationItem.findUniqueOrThrow({ where: { sourceResponseId: responseId } })
  const text = [item.question, item.situation, item.action, item.result].join(' ')
  for (const name of ['Layla', 'Mercer', 'Ana', 'Torvik', 'Ben', 'Okafor']) assert.doesNotMatch(text, new RegExp(`\\b${name}\\b`), `${name} was copied`)
  assert.match(item.situation, /^the evaluator asked the person/)
  assert.deepEqual([item.hrSufficiency, item.hrScore, item.createdAt.getTime()], ['SUFFICIENT', 4, at(1, 4).getTime()])
  assert.equal(await prisma.weeklyAuditEvent.count({ where: { action: 'CALIBRATION_ITEM_ADD' } }), 1)
  const decided = await reviewQueue(HR_ACTOR, { cycleId, filter: 'DECIDED' })
  assert.equal(decided.items.find((i) => i.responseId === responseId)?.calibrationItemId, item.id)
  await assert.rejects(addCalibrationItem(weeklyActor(W.lead), { source: 'answer', responseId, hrSufficiency: 'SUFFICIENT', hrScore: 4 }, at(1, 4)), isError(403))
  await assert.rejects(addCalibrationItem(HR_ACTOR, { source: 'answer', responseId: 'missing', hrSufficiency: 'SUFFICIENT', hrScore: 2 }, at(1, 4)), isError(404))
})

test('HR writes an item by hand, edits, archives and restores it; the judgement must match the evidence', WEEKLY_DB_TEST, async () => {
  const competencyId = await approvedTopicId(prisma)
  const input = { source: 'manual' as const, ...HAND, competencyId, hrSufficiency: 'SUFFICIENT' as const, hrScore: 3 }
  assert.equal(calibrationItemSchema.safeParse({ ...input, hrScore: null }).success, false)
  assert.equal(calibrationItemSchema.safeParse({ ...input, hrSufficiency: 'INSUFFICIENT' }).success, false)
  assert.equal(calibrationItemSchema.safeParse({ ...input, hrSufficiency: 'INSUFFICIENT', hrScore: null }).success, true)
  await assert.rejects(addCalibrationItem(HR_ACTOR, { ...input, competencyId: 'missing' }, at(1)), isError(404))
  const { id } = await addCalibrationItem(HR_ACTOR, input, at(1))
  const added = await calibrationItemsView(HR_ACTOR)
  assert.deepEqual([added.active, added.needed, added.items[0].fromAnswer, added.items[0].hrScore], [1, 40, false, 3])
  assert.ok(added.topics.some((t) => t.id === competencyId))
  await updateCalibrationItem(HR_ACTOR, id, { op: 'edit', ...HAND, competencyId, hrSufficiency: 'INSUFFICIENT', hrScore: null, note: 'No result described' }, at(1, 2))
  await updateCalibrationItem(HR_ACTOR, id, { op: 'archive' }, at(1, 3))
  const archived = await calibrationItemsView(HR_ACTOR)
  assert.deepEqual([archived.active, archived.items[0].archived, archived.items[0].hrSufficiency, archived.items[0].hrScore, archived.items[0].note], [0, true, 'INSUFFICIENT', null, 'No result described'])
  await updateCalibrationItem(HR_ACTOR, id, { op: 'restore' }, at(1, 4))
  assert.equal((await calibrationItemsView(HR_ACTOR)).active, 1)
  const actions = (await prisma.weeklyAuditEvent.findMany({ where: { objectId: id } })).map((e) => e.action).sort()
  assert.deepEqual(actions, ['CALIBRATION_ITEM_ADD', 'CALIBRATION_ITEM_ARCHIVE', 'CALIBRATION_ITEM_EDIT', 'CALIBRATION_ITEM_RESTORE'])
  await assert.rejects(updateCalibrationItem(HR_ACTOR, 'missing', { op: 'archive' }, at(1)), isError(404))
})
