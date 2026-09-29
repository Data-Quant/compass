import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { approveProfile, contentView, saveProfileDraft, syncFromQuestionBank } from '../lib/weekly/service/content'
import { draftTopicWithAi } from '../lib/weekly/service/ai-drafting'
import { WeeklyError } from '../lib/weekly/service/errors'
import { spyModel } from './helpers/weekly-answers'
import { HR_ACTOR } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  await seedWeeklyBase(prisma)
  await syncFromQuestionBank(HR_ACTOR)
})
after(async () => {
  await prisma.$disconnect()
})

const clientTopic = async () => (await contentView(HR_ACTOR)).competencies.find((c) => c.name === 'Client Communication')!

test('the AI drafts both questions and a four-level profile from HR’s descriptions, as a draft for HR to approve', WEEKLY_DB_TEST, async () => {
  const topic = await clientTopic()
  const spy = spyModel()
  const result = await draftTopicWithAi(HR_ACTOR, topic.id, spy)
  const sent = JSON.parse(spy.requests[0].user)
  assert.equal(sent.topic, 'Client Communication')
  assert.deepEqual(sent.hrDescriptions, { '1': 'Clients chase for updates.', '2': 'Updates clients when asked.', '3': null, '4': 'Clients cite their updates as a model.' })
  const after = await clientTopic()
  assert.equal(after.draft?.id, result.profileId)
  assert.deepEqual(after.draft?.levels['4'].evidence, ['Example four.'])
  assert.equal(after.draft?.incomplete, false)
  assert.match(after.prompts.find((p) => p.variant === 'A')!.text, /Client Communication/)
  assert.equal(await prisma.weeklyAuditEvent.count({ where: { action: 'PROFILE_AI_DRAFT', objectId: result.profileId } }), 1)
})

test('drafting an approved topic starts a new version and leaves the approved one in use', WEEKLY_DB_TEST, async () => {
  const topic = await clientTopic()
  await approveProfile(HR_ACTOR, topic.draft!.id)
  const result = await draftTopicWithAi(HR_ACTOR, topic.id, spyModel())
  assert.equal(result.version, 2)
  const after = await clientTopic()
  assert.deepEqual([after.approved?.version, after.draft?.version, after.ready], [1, 2, true])
})

test('only HR can draft; no model or an unusable answer is reported clearly', WEEKLY_DB_TEST, async () => {
  const topic = await clientTopic()
  await assert.rejects(draftTopicWithAi(weeklyActor(W.lead), topic.id, spyModel()), isStatus(403))
  await assert.rejects(draftTopicWithAi(HR_ACTOR, topic.id, null), isStatus(503))
  await assert.rejects(draftTopicWithAi(HR_ACTOR, topic.id, spyModel({ nonsense: true })), isStatus(502))
  await assert.rejects(draftTopicWithAi(HR_ACTOR, 'missing', spyModel()), isStatus(404))
})

test('drafting an approved topic keeps its definition and HR’s insufficient-evidence text, and records the draft it replaced', WEEKLY_DB_TEST, async () => {
  const topic = await clientTopic()
  await approveProfile(HR_ACTOR, topic.draft!.id)
  const approved = (await clientTopic()).approved!
  const hrDraft = await saveProfileDraft(HR_ACTOR, topic.id, { levels: approved.levels, insufficientDefinition: 'No example that names a client conversation.' })
  const liveDefinition = 'How clearly and early they keep clients informed.'
  await prisma.weeklyCompetency.update({ where: { id: topic.id }, data: { definition: liveDefinition } })
  const result = await draftTopicWithAi(HR_ACTOR, topic.id, spyModel())
  assert.equal(result.profileId, hrDraft.id)
  assert.equal((await prisma.weeklyCompetency.findUniqueOrThrow({ where: { id: topic.id } })).definition, liveDefinition)
  assert.equal((await prisma.weeklyProfile.findUniqueOrThrow({ where: { id: result.profileId } })).insufficientDefinition, 'No example that names a client conversation.')
  const audit = await prisma.weeklyAuditEvent.findFirstOrThrow({ where: { action: 'PROFILE_AI_DRAFT', objectId: result.profileId } })
  assert.match(JSON.stringify(audit.before), /No example that names a client conversation/)
})
