import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { historyView } from '../lib/weekly/service/inbox'
import { releaseWeek } from '../lib/weekly/service/release'
import { runScoring } from '../lib/weekly/service/scoring'
import { answerAs, answerFor, personFor, releaseWeekOne, scoringClock, spyModel } from './helpers/weekly-answers'
import { at, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

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

const score = (model: Parameters<typeof runScoring>[0]['model'] = fakeModel(), seconds = 0) =>
  runScoring({ model, budgetMs: 30_000, clock: () => scoringClock(seconds) })
const leadPrompt = async () => (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
const aiScoreFor = (responseId: string) => prisma.weeklyAiScore.findFirstOrThrow({ where: { responseId }, orderBy: { createdAt: 'desc' } })

test('an answer is scored against the approved profile, with both names removed before it is sent', WEEKLY_DB_TEST, async () => {
  const prompt = await leadPrompt()
  const responseId = await answerAs(prompt, 'strong')
  const spy = spyModel()
  const summary = await score(spy)
  assert.deepEqual({ scored: summary.scored, remaining: summary.remaining }, { scored: 1, remaining: 0 })
  const ai = await aiScoreFor(responseId)
  const slot = await prisma.weeklySlot.findUniqueOrThrow({ where: { id: prompt.slotId! } })
  const approved = await prisma.weeklyProfile.findFirstOrThrow({ where: { competencyId: slot.competencyId, status: 'APPROVED' } })
  assert.deepEqual([ai.score, ai.sufficiency, ai.profileId, ai.model, ai.promptVersion, ai.revision], [4, 'SUFFICIENT', approved.id, 'spy', 'weekly-1', 1])
  assert.equal(ai.createdAt.getTime(), scoringClock().getTime())
  assert.equal((await prisma.weeklyScoringJob.findFirstOrThrow({ where: { responseId } })).status, 'DONE')
  const sent = spy.requests[0].user
  const evaluatee = personFor(prompt.evaluateeId)
  // Whole words only: "Analyst" legitimately contains "Ana".
  for (const name of [...W.lead.name.split(' '), ...evaluatee.name.split(' ')]) assert.doesNotMatch(sent, new RegExp(`\\b${name}\\b`), `${name} was sent`)
  assert.match(sent, /the person/)
  assert.match(sent, /Project Kestrel/)
  assert.equal(JSON.parse(sent).personRole.jobTitle, evaluatee.position)
})

test('a thin answer asks the evaluator for more detail, at most twice, then closes the slot', WEEKLY_DB_TEST, async () => {
  const first = await leadPrompt()
  const firstResponse = await answerAs(first, 'praise')
  assert.equal((await score()).insufficient, 1)
  assert.equal((await aiScoreFor(firstResponse)).score, null)
  const followUps = () => prisma.weeklyPrompt.findMany({ where: { slotId: first.slotId, kind: 'FOLLOW_UP' }, orderBy: { createdAt: 'asc' } })
  const [followUp] = await followUps()
  assert.deepEqual([followUp.evaluatorId, followUp.evaluateeId, followUp.status, followUp.weekIndex], [W.lead.id, first.evaluateeId, 'OPEN', 1])
  assert.match(followUp.textSnapshot, /specific recent example/)
  const history = await historyView(W.lead.id)
  assert.ok(history.groups.flatMap((g) => g.entries).some((e) => e.id === first.id && e.status === 'ADD_DETAIL'))

  await answerAs(followUp, 'praise')
  await score()
  const second = (await followUps())[1]
  assert.ok(second, 'a second follow-up is asked')
  await answerAs(second, 'praise')
  await score()
  assert.equal((await followUps()).length, 2)
  const slot = await prisma.weeklySlot.findUniqueOrThrow({ where: { id: first.slotId! } })
  assert.deepEqual([slot.status, slot.followUpCount], ['CLOSED_INSUFFICIENT', 2])
})

test('copied answers and sensitive details are flagged by the system even when the model does not flag them', WEEKLY_DB_TEST, async () => {
  const weekOne = await leadPrompt()
  const text = answerFor('solid', weekOne)
  // Answer first: an open question counts toward the lead's paced batch, which would leave no room in week 2.
  await answerAs(weekOne, text)
  await releaseWeek(cycleId, 2, at(2))
  const weekTwo = await prisma.weeklyPrompt.findFirstOrThrow({ where: { cycleId, evaluatorId: W.lead.id, weekIndex: 2, kind: 'STANDARD' } })
  const copyId = await answerAs(weekTwo, text, at(2, 2))
  const plain = { sufficiency: 'SUFFICIENT', score: 2, confidence: 'HIGH', criteriaMet: [], criteriaNotDemonstrated: [], evidenceQuotes: [], rationale: 'Meets.', followUpPrompt: null, flags: [] }
  await score(spyModel(plain))
  assert.deepEqual((await aiScoreFor(copyId)).flags, ['POSSIBLE_COPY'])

  const ana = (await prisma.weeklyPrompt.findFirstOrThrow({ where: { cycleId, evaluatorId: W.ana.id, weekIndex: 1 } }))
  const sensitiveId = await answerAs(ana, 'sensitive')
  await score(spyModel(plain))
  assert.deepEqual((await aiScoreFor(sensitiveId)).flags, ['SENSITIVE_CONTENT'])
})

test('quotes that are not in the answer are dropped and the score is marked low confidence', WEEKLY_DB_TEST, async () => {
  const prompt = await leadPrompt()
  const responseId = await answerAs(prompt, 'solid')
  const invented = {
    sufficiency: 'SUFFICIENT', score: 3, confidence: 'HIGH', criteriaMet: ['Goes beyond'], criteriaNotDemonstrated: [],
    evidenceQuotes: ['raised one data question with me', 'saved the whole account single-handedly'], rationale: 'Level 3.', followUpPrompt: null, flags: [],
  }
  await score(spyModel(invented))
  const ai = await aiScoreFor(responseId)
  assert.deepEqual(ai.evidenceQuotes, ['raised one data question with me'])
  assert.equal(ai.confidence, 'LOW')
})
