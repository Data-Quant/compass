import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { challengeDeadlineFor } from '../lib/weekly/service/challenge-window'
import { adjustForChallenge, challengeDetail, challengesView, myChallenge, raiseChallenge, resolveChallenge } from '../lib/weekly/service/challenges'
import { closeCycle, publishResults } from '../lib/weekly/service/close'
import { WeeklyError } from '../lib/weekly/service/errors'
import { personFor } from './helpers/weekly-answers'
import { leadEvidenceIn } from './helpers/weekly-close-fixtures'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const PUBLISHED = at(13, 2)
const REASON = 'The Project Kestrel handover was shared work across the whole team, not one person.'
const isError = (status: number, pattern?: RegExp) => (e: unknown) => e instanceof WeeklyError && e.status === status && (!pattern || pattern.test(e.message))
function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}
let cycleId = ''
let periodId = ''
let evaluateeId = ''
let responseId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  ;({ cycleId } = await startedCycle(periodId))
  ;({ evaluateeId, responseId } = await leadEvidenceIn(cycleId))
  await closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13))
  await publishResults(HR_ACTOR, cycleId, PUBLISHED)
  process.env.WEEKLY_SEND_EMAILS = 'true'
})
afterEach(() => {
  delete process.env.WEEKLY_SEND_EMAILS
})
after(async () => {
  await prisma.$disconnect()
})

const person = () => weeklyActor(personFor(evaluateeId))
const weeklyRating = () => prisma.evaluation.findFirstOrThrow({ where: { periodId, evaluateeId, source: 'AI_WEEKLY', ratingValue: { not: null } } })

test('a person with results can raise one challenge within the window, and HR is told', WEEKLY_DB_TEST, async () => {
  const mine = await myChallenge(person(), at(13, 3))
  assert.deepEqual([mine.available, mine.canRaise, mine.deadline], [true, true, (await challengeDeadlineFor(PUBLISHED)).toISOString()])
  const mail = mailbox()
  const raised = await raiseChallenge(person(), { reason: REASON }, at(13, 3), mail.send, APP)
  assert.equal(raised.status, 'OPEN')
  assert.ok(mail.sent.some((m) => m.to === 'wkt-hr@example.test' && m.subject.includes(personFor(evaluateeId).name)))
  await assert.rejects(raiseChallenge(person(), { reason: REASON }, at(13, 4), mail.send, APP), isError(409, /already raised/))
  const after = await myChallenge(person(), at(13, 4))
  assert.deepEqual([after.canRaise, after.challenge?.status], [false, 'OPEN'])
  assert.equal((await myChallenge(weeklyActor(W.cara), at(13, 3))).available, false)
  await assert.rejects(raiseChallenge(weeklyActor(W.cara), { reason: REASON }, at(13, 3), mail.send, APP), isError(404))
})

test('after 10 working days nobody can raise a challenge', WEEKLY_DB_TEST, async () => {
  const late = new Date((await challengeDeadlineFor(PUBLISHED)).getTime() + 1000)
  assert.equal((await myChallenge(person(), late)).available, false)
  await assert.rejects(raiseChallenge(person(), { reason: REASON }, late, mailbox().send, APP), isError(409, /closed on/))
})

test('HR adjusts a score with a reason; resolving re-aggregates only that person and clears their cached report', WEEKLY_DB_TEST, async () => {
  const challenge = await raiseChallenge(person(), { reason: REASON }, at(13, 3), mailbox().send, APP)
  const detail = await challengeDetail(HR_ACTOR, challenge.id)
  const answer = detail.answers.find((a) => a.responseId === responseId)!
  assert.deepEqual([answer.evaluator.name, answer.decision?.finalScore, detail.challenge.reason], [W.lead.name, 4, REASON])
  await prisma.report.create({ data: { employeeId: evaluateeId, periodId, overallScore: 90, breakdownJson: {} } })
  await prisma.report.create({ data: { employeeId: W.lead.id, periodId, overallScore: 80, breakdownJson: {} } })
  await adjustForChallenge(HR_ACTOR, challenge.id, { responseId, score: 3, reason: 'A team effort' }, at(13, 4))
  assert.equal((await weeklyRating()).ratingValue, 4, 'rows change only when the challenge is resolved')
  const mail = mailbox()
  const resolved = await resolveChallenge(HR_ACTOR, challenge.id, { outcome: 'UPHELD', resolution: 'Quality of Work adjusted to 3 after review.' }, at(13, 5), mail.send, APP)
  assert.equal(resolved.reaggregated, true)
  assert.equal((await weeklyRating()).ratingValue, 3)
  assert.equal(await prisma.report.count({ where: { periodId, employeeId: evaluateeId } }), 0)
  assert.equal(await prisma.report.count({ where: { periodId, employeeId: W.lead.id } }), 1)
  const stored = await prisma.weeklyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })
  assert.deepEqual([stored.status, stored.resolvedById], ['UPHELD', W.hr.id])
  assert.ok(mail.sent.some((m) => m.to === `${evaluateeId}@example.test`))
})

test('only HR sees, adjusts or resolves; answers must be the person’s; a resolved challenge is final', WEEKLY_DB_TEST, async () => {
  const challenge = await raiseChallenge(person(), { reason: REASON }, at(13, 3), mailbox().send, APP)
  const lead = weeklyActor(W.lead)
  await assert.rejects(challengesView(lead, cycleId), isError(403))
  await assert.rejects(challengeDetail(lead, challenge.id), isError(403))
  await assert.rejects(adjustForChallenge(lead, challenge.id, { responseId, score: 3, reason: 'No' }, at(13, 4)), isError(403))
  await assert.rejects(adjustForChallenge(HR_ACTOR, challenge.id, { responseId: 'missing', score: 3, reason: 'Nope' }, at(13, 4)), isError(404))
  const resolved = await resolveChallenge(HR_ACTOR, challenge.id, { outcome: 'NOT_UPHELD', resolution: 'The scores reflect the accepted evidence.' }, at(13, 4), mailbox().send, APP)
  assert.equal(resolved.reaggregated, false)
  await assert.rejects(resolveChallenge(HR_ACTOR, challenge.id, { outcome: 'UPHELD', resolution: 'Changed my mind entirely.' }, at(13, 5), mailbox().send, APP), isError(409))
  await assert.rejects(adjustForChallenge(HR_ACTOR, challenge.id, { responseId, score: 3, reason: 'Too late' }, at(13, 5)), isError(409))
  const list = await challengesView(HR_ACTOR, cycleId)
  assert.deepEqual(list.challenges.map((c) => [c.status, c.resolvedBy]), [['NOT_UPHELD', W.hr.name]])
})

test('someone who leaves after the close keeps their weekly results when their challenge is resolved', WEEKLY_DB_TEST, async () => {
  const challenge = await raiseChallenge(person(), { reason: REASON }, at(13, 3), mailbox().send, APP)
  await adjustForChallenge(HR_ACTOR, challenge.id, { responseId, score: 3, reason: 'A team effort' }, at(13, 4))
  // Their exit is recorded after the quarter closed (week 13, Monday) and before HR resolves.
  await prisma.payrollEmployeeProfile.create({ data: { userId: evaluateeId, isPayrollActive: false, exitDate: at(13, 4) } })
  await resolveChallenge(HR_ACTOR, challenge.id, { outcome: 'UPHELD', resolution: 'Quality of Work adjusted to 3 after review.' }, at(13, 5), mailbox().send, APP)
  assert.equal((await weeklyRating()).ratingValue, 3)
})

test('the outcome must match what HR did: upheld means scores changed, not upheld means none did', WEEKLY_DB_TEST, async () => {
  const challenge = await raiseChallenge(person(), { reason: REASON }, at(13, 3), mailbox().send, APP)
  await assert.rejects(
    resolveChallenge(HR_ACTOR, challenge.id, { outcome: 'UPHELD', resolution: 'We agree with your challenge.' }, at(13, 4), mailbox().send, APP),
    isError(409, /Change at least one score/),
  )
  await adjustForChallenge(HR_ACTOR, challenge.id, { responseId, score: 3, reason: 'A team effort' }, at(13, 4))
  const mail = mailbox()
  await assert.rejects(
    resolveChallenge(HR_ACTOR, challenge.id, { outcome: 'NOT_UPHELD', resolution: 'The scores reflect the evidence.' }, at(13, 5), mail.send, APP),
    isError(409, /resolve it as upheld/),
  )
  assert.deepEqual([(await prisma.weeklyChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status, mail.sent.length], ['OPEN', 0])
})
