import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { contentView, syncFromQuestionBank } from '../lib/weekly/service/content'
import { WeeklyError } from '../lib/weekly/service/errors'
import { addQuestion, removeQuestion, removeTopic, restoreTopic } from '../lib/weekly/service/question-bank'
import { releaseWeekOne } from './helpers/weekly-answers'
import { startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const hr = weeklyActor(W.hr)
const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
let periodIdForTest = ''
const seedWeeklyPeriod = async () => ({ periodId: periodIdForTest })
const QUESTION = 'Describe a handover they owned this month. What did they pass on, and what did the next person still need to ask?'

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  periodIdForTest = (await seedWeeklyBase(prisma)).periodId
  await syncFromQuestionBank(hr)
})
after(async () => {
  await prisma.$disconnect()
})

async function qualityTopic() {
  return prisma.weeklyCompetency.findUniqueOrThrow({ where: { key: 'LEAD.QUALITY_OF_WORK' }, include: { prompts: { orderBy: { variant: 'asc' } } } })
}

test('HR adds a question to a topic; it joins the rotation as the next variant', WEEKLY_DB_TEST, async () => {
  const topic = await qualityTopic()
  await addQuestion(hr, topic.id, { text: QUESTION })
  const after = await qualityTopic()
  assert.deepEqual(after.prompts.map((p) => [p.variant, p.isActive]), [['A', true], ['B', true], ['C', true]])
  assert.equal(after.prompts[2].text, QUESTION)
  await assert.rejects(addQuestion(weeklyActor(W.lead), topic.id, { text: QUESTION }), isStatus(403))
})

test('removing a question deletes it if never asked, archives it if asked, and never leaves a topic empty', WEEKLY_DB_TEST, async () => {
  const { periodId } = await seedWeeklyPeriod()
  const { cycleId } = await startedCycle(periodId)
  const asked = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id && p.promptVariantId)!
  const variant = await prisma.weeklyCompetencyPrompt.findUniqueOrThrow({ where: { id: asked.promptVariantId! } })
  const topic = await prisma.weeklyCompetency.findUniqueOrThrow({ where: { id: variant.competencyId }, include: { prompts: true } })
  const other = topic.prompts.find((p) => p.id !== variant.id)!
  await removeQuestion(hr, other.id)
  assert.equal(await prisma.weeklyCompetencyPrompt.count({ where: { id: other.id } }), 0, 'never asked: deleted')
  await assert.rejects(removeQuestion(hr, variant.id), isStatus(409), 'the last question stays')
  await addQuestion(hr, topic.id, { text: QUESTION })
  await removeQuestion(hr, variant.id)
  const kept = await prisma.weeklyCompetencyPrompt.findUniqueOrThrow({ where: { id: variant.id } })
  assert.deepEqual([kept.isActive, kept.archivedAt !== null], [false, true], 'asked: archived, so the answer keeps its question')
  const view = await contentView(hr)
  assert.deepEqual(view.competencies.find((c) => c.id === topic.id)?.prompts.map((p) => p.text), [QUESTION])
})

test('HR removes a topic; sync does not bring it back until HR restores it', WEEKLY_DB_TEST, async () => {
  const topic = await qualityTopic()
  await removeTopic(hr, topic.id)
  await syncFromQuestionBank(hr)
  let view = await contentView(hr)
  assert.equal(view.competencies.some((c) => c.id === topic.id), false)
  assert.deepEqual(view.removed.map((c) => c.name), ['Quality of Work'])
  await restoreTopic(hr, topic.id)
  view = await contentView(hr)
  assert.equal(view.competencies.some((c) => c.id === topic.id), true)
  assert.deepEqual(view.removed, [])
})
