import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import {
  addSurveyQuestion, DEFAULT_SURVEY, loadDefaultSurvey, scrubSmallDepartments, surveyDueWeeks, mySurvey, removeSurveyQuestion, submitSurvey, surveyBank, surveyResults,
} from '../lib/weekly/service/survey'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
const ana = weeklyActor(W.ana)
const ben = weeklyActor(W.ben)
let periodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  await startedCycle(periodId)
})
after(async () => {
  await prisma.$disconnect()
})

test('HR loads the standard twelve questions plus the end-of-quarter eNPS repeat, and can add and remove questions', WEEKLY_DB_TEST, async () => {
  await assert.rejects(loadDefaultSurvey(ana, periodId), isStatus(403))
  await loadDefaultSurvey(HR_ACTOR, periodId)
  let bank = await surveyBank(HR_ACTOR, periodId)
  assert.equal(bank.length, 13)
  assert.deepEqual(bank.slice(0, 12).map((q) => q.kind), DEFAULT_SURVEY.map((q) => q.kind))
  assert.deepEqual([bank[12].kind, bank[12].text], ['NPS', bank[0].text], 'week 13 repeats the eNPS question')
  assert.equal(bank[0].text, 'How likely are you to recommend Plutus 21 as a place to work to a friend?')
  assert.equal(bank[11].required, false)
  await assert.rejects(loadDefaultSurvey(HR_ACTOR, periodId), /already has questions/)
  await addSurveyQuestion(HR_ACTOR, periodId, { text: 'I have the tools I need to do my job well.', kind: 'AGREE' }, at(1))
  await removeSurveyQuestion(HR_ACTOR, bank[3].id)
  bank = await surveyBank(HR_ACTOR, periodId)
  assert.equal(bank.length, 13)
  assert.equal(bank.at(-1)?.text, 'I have the tools I need to do my job well.')
})

test('one question a week across the round’s 13 weeks, with the eNPS repeated in the last week', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const week1 = await mySurvey(ana, at(1))
  assert.deepEqual(week1.questions.map((q) => q.orderIndex), [0])
  assert.match(week1.notice, /^Your answer is confidential to HR\. It is never shared with your lead, your colleagues or anyone outside HR, and it does not affect your performance evaluation\./)
  await submitSurvey(ana, { answers: [{ questionId: week1.questions[0].id, value: 9 }] }, at(1))
  assert.deepEqual((await mySurvey(ana, at(1))).questions, [])
  // A missed week stays open: in week 3 Ben sees weeks 1 to 3.
  assert.deepEqual((await mySurvey(ben, at(3))).questions.map((q) => q.orderIndex), [0, 1, 2])
  const bank = await prisma.surveyQuestion.findMany({ where: { periodId }, orderBy: { orderIndex: 'asc' } })
  assert.deepEqual(bank.map((q) => q.dueWeek), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
})

test('a shorter round drops the eNPS repeat first, then asks more than one a week', () => {
  assert.deepEqual(surveyDueWeeks(12, 13), { weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], repeatWeek: 13 })
  assert.deepEqual(surveyDueWeeks(12, 12), { weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], repeatWeek: null })
  assert.deepEqual(surveyDueWeeks(12, 8), { weeks: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6], repeatWeek: null })
})

test('a disagree answer needs a reason, the improvement question needs an explanation, and the last question is optional', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const all = (await mySurvey(ana, at(12))).questions
  const happy = all.find((q) => q.orderIndex === 1)!
  const improve = all.find((q) => q.orderIndex === 10)!
  const ideas = all.find((q) => q.orderIndex === 11)!
  await assert.rejects(submitSurvey(ana, { answers: [{ questionId: happy.id, value: 2 }] }, at(12)), /why/i)
  await assert.rejects(submitSurvey(ana, { answers: [{ questionId: improve.id, choice: 'Career growth' }] }, at(12)), /explain/i)
  await assert.rejects(submitSurvey(ana, { answers: [{ questionId: improve.id, choice: 'Free lunch', text: 'x' }] }, at(12)), /option/i)
  await submitSurvey(ana, {
    answers: [
      { questionId: happy.id, value: 2, text: 'Too much context switching' },
      { questionId: improve.id, choice: 'Career growth', text: 'A clear path to senior roles' },
      { questionId: ideas.id, text: '' },
    ],
  }, at(12))
  await assert.rejects(submitSurvey(ana, { answers: [{ questionId: happy.id, value: 4 }] }, at(12)), isStatus(409))
})

test('anonymous is chosen per answer and stored without a name; HR sees counts, eNPS with its optional reason, and comments', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const [nps, happy] = (await mySurvey(ana, at(2))).questions
  await submitSurvey(ana, { answers: [{ questionId: nps.id, value: 10, text: 'Great team' }, { questionId: happy.id, value: 1, text: 'Workload', anonymous: true }] }, at(2))
  await submitSurvey(ben, { answers: [{ questionId: nps.id, value: 3 }, { questionId: happy.id, value: 5 }] }, at(2))
  const happyRows = await prisma.surveyResponse.findMany({ where: { questionId: happy.id } })
  assert.deepEqual(happyRows.map((r) => r.userId).sort(), [null, W.ben.id].sort(), 'no trace of Ana on her anonymous answer')
  const npsRows = await prisma.surveyResponse.findMany({ where: { questionId: nps.id } })
  assert.deepEqual(npsRows.map((r) => r.userId).sort(), [W.ana.id, W.ben.id].sort(), 'her named answer that week keeps her name')
  await assert.rejects(surveyResults(ana, periodId), isStatus(403))
  const results = await surveyResults(HR_ACTOR, periodId)
  const npsResult = results.questions.find((q) => q.id === nps.id)!
  assert.equal(npsResult.responses, 2)
  assert.equal(npsResult.enps, 0) // one promoter, one detractor
  assert.deepEqual(npsResult.comments.map((c) => [c.text, c.name]), [['Great team', W.ana.name]])
  const happyResult = results.questions.find((q) => q.id === happy.id)!
  assert.deepEqual(happyResult.comments.map((c) => [c.text, c.name, c.department]), [['Workload', null, null]], 'fewer than five from Product answered: no department')
  assert.deepEqual(happyResult.counts, { '1': 1, '2': 0, '3': 0, '4': 0, '5': 1 })
})

test('nothing stored can tie an anonymous answer to its author: no answer times, random ids, completions by week only', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const [nps] = (await mySurvey(ana, at(1))).questions
  await submitSurvey(ana, { answers: [{ questionId: nps.id, value: 8, text: 'Fine', anonymous: true }] }, at(1, 3))
  const response = await prisma.surveyResponse.findFirstOrThrow({ where: { questionId: nps.id } })
  assert.ok(!('createdAt' in response), 'answers carry no timestamp')
  assert.match(response.id, /^[0-9a-f-]{36}$/, 'a random id, not a time-ordered one')
  const completion = await prisma.surveyCompletion.findFirstOrThrow({ where: { questionId: nps.id } })
  assert.ok(!('answeredAt' in completion))
  assert.equal(completion.weekIndex, 1)
  const comment = (await surveyResults(HR_ACTOR, periodId)).questions.find((q) => q.id === nps.id)!.comments[0]
  assert.deepEqual(Object.keys(comment).sort(), ['choice', 'department', 'name', 'text'])
})

test('each question keeps the week it was scheduled for: adding one later does not pull others forward', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  await addSurveyQuestion(HR_ACTOR, periodId, { text: 'I have the tools I need to do my job well.', kind: 'AGREE' }, at(3))
  const due = (await mySurvey(ben, at(3))).questions
  // One a week over three weeks, plus the new question, due from the week it was added.
  assert.equal(due.length, 4)
  assert.equal(due.at(-1)?.text, 'I have the tools I need to do my job well.')
})

test('a blank optional answer is not counted as an answer', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const ideas = (await mySurvey(ana, at(12))).questions.find((q) => q.orderIndex === 11)!
  await submitSurvey(ana, { answers: [{ questionId: ideas.id, text: '' }] }, at(12))
  assert.equal((await surveyResults(HR_ACTOR, periodId)).questions.find((q) => q.id === ideas.id)!.responses, 0)
  assert.ok(!(await mySurvey(ana, at(12))).questions.some((q) => q.id === ideas.id), 'and it is no longer asked')
})

test('an anonymous answer keeps its department only when at least five from that department answered that week', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const product = Array.from({ length: 5 }, (_, i) => ({ id: `wkt-prod-${i}`, name: `Product Person ${i}`, role: 'EMPLOYEE' as const, position: 'Analyst', department: 'Product' }))
  for (const p of product) await prisma.user.create({ data: { id: p.id, name: p.name, email: `${p.id}@example.test`, role: 'EMPLOYEE', department: 'Product', position: 'Analyst' } })
  const [nps] = (await mySurvey(ana, at(1))).questions
  for (const p of product) await submitSurvey(weeklyActor(p), { answers: [{ questionId: nps.id, value: 8, text: `From ${p.id}`, anonymous: true }] }, at(1))
  await submitSurvey(weeklyActor(W.cara), { answers: [{ questionId: nps.id, value: 6, text: 'From design', anonymous: true }] }, at(1))
  const comments = (await surveyResults(HR_ACTOR, periodId)).questions.find((q) => q.id === nps.id)!.comments
  assert.ok(comments.filter((c) => c.text.startsWith('From wkt-prod')).every((c) => c.department === 'Product'))
  assert.equal(comments.find((c) => c.text === 'From design')?.department, null)
  // Once the week is over, the stored answer from a small department loses its department too.
  await scrubSmallDepartments(at(2))
  assert.equal(await prisma.surveyResponse.count({ where: { questionId: nps.id, userId: null, department: 'Design' } }), 0)
  assert.equal(await prisma.surveyResponse.count({ where: { questionId: nps.id, userId: null, department: 'Product' } }), 5)
})

test('the department shows only when five or more answered that question anonymously from it: named answers cannot be subtracted', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const people = Array.from({ length: 5 }, (_, i) => ({ id: `wkt-fin-${i}`, name: `Finance Person ${i}`, role: 'EMPLOYEE' as const, position: 'Analyst', department: 'Finance' }))
  for (const p of people) await prisma.user.create({ data: { id: p.id, name: p.name, email: `${p.id}@example.test`, role: 'EMPLOYEE', department: 'Finance', position: 'Analyst' } })
  const [nps] = (await mySurvey(ana, at(1))).questions
  // Four by name, one anonymously: five from Finance answered, but only one anonymous answer.
  for (const [i, p] of people.entries()) await submitSurvey(weeklyActor(p), { answers: [{ questionId: nps.id, value: 7, text: `Finance ${i}`, anonymous: i === 4 }] }, at(1))
  const anonymous = (await surveyResults(HR_ACTOR, periodId)).questions.find((q) => q.id === nps.id)!.comments.find((c) => c.name === null)!
  assert.equal(anonymous.department, null)
  await scrubSmallDepartments(at(2))
  assert.equal(await prisma.surveyResponse.count({ where: { questionId: nps.id, userId: null, department: { not: null } } }), 0)
})

test('the last week of a finished round is cleared too, and moving department later does not change it', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const product = Array.from({ length: 5 }, (_, i) => ({ id: `wkt-pr-${i}`, name: `Prod ${i}`, role: 'EMPLOYEE' as const, position: 'Analyst', department: 'Product' }))
  for (const p of product) await prisma.user.create({ data: { id: p.id, name: p.name, email: `${p.id}@example.test`, role: 'EMPLOYEE', department: 'Product', position: 'Analyst' } })
  const [nps] = (await mySurvey(ana, at(1))).questions
  for (const p of product) await submitSurvey(weeklyActor(p), { answers: [{ questionId: nps.id, value: 8, anonymous: true, text: 'x' }] }, at(1))
  await prisma.user.updateMany({ where: { id: { startsWith: 'wkt-pr-' } }, data: { department: 'Platform' } })
  await scrubSmallDepartments(at(2))
  assert.equal(await prisma.surveyResponse.count({ where: { questionId: nps.id, department: 'Product' } }), 5, 'counted by the department stored with the answer')
  // A late, lone anonymous answer in the round's last week is cleared once the round is closed.
  const last = await prisma.surveyQuestion.findFirstOrThrow({ where: { periodId, dueWeek: 13 } })
  await submitSurvey(weeklyActor(W.cara), { answers: [{ questionId: last.id, value: 5, anonymous: true }] }, at(13))
  await prisma.weeklyCycle.updateMany({ where: { periodId }, data: { status: 'CLOSED' } })
  await scrubSmallDepartments(at(13, 3))
  assert.equal(await prisma.surveyResponse.count({ where: { questionId: last.id, department: { not: null } } }), 0)
})
