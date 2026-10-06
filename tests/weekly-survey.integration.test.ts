import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import {
  addSurveyQuestion, DEFAULT_SURVEY, loadDefaultSurvey, mySurvey, removeSurveyQuestion, submitSurvey, surveyBank, surveyResults,
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

test('HR loads the standard twelve questions for the quarter, and can add and remove questions', WEEKLY_DB_TEST, async () => {
  await assert.rejects(loadDefaultSurvey(ana, periodId), isStatus(403))
  await loadDefaultSurvey(HR_ACTOR, periodId)
  let bank = await surveyBank(HR_ACTOR, periodId)
  assert.equal(bank.length, 12)
  assert.deepEqual(bank.map((q) => q.kind), DEFAULT_SURVEY.map((q) => q.kind))
  assert.equal(bank[0].text, 'How likely are you to recommend Plutus 21 as a place to work to a friend?')
  assert.equal(bank[11].required, false)
  await assert.rejects(loadDefaultSurvey(HR_ACTOR, periodId), /already has questions/)
  await addSurveyQuestion(HR_ACTOR, periodId, { text: 'I have the tools I need to do my job well.', kind: 'AGREE' }, at(1))
  await removeSurveyQuestion(HR_ACTOR, bank[3].id)
  bank = await surveyBank(HR_ACTOR, periodId)
  assert.equal(bank.length, 12)
  assert.equal(bank.at(-1)?.text, 'I have the tools I need to do my job well.')
})

test('each week brings the next one or two questions: bank size over the question weeks', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  // 12 questions over 11 question weeks: two a week.
  const week1 = await mySurvey(ana, at(1))
  assert.deepEqual(week1.questions.map((q) => q.orderIndex), [0, 1])
  assert.match(week1.notice, /confidential to HR/)
  await submitSurvey(ana, { anonymous: false, answers: [{ questionId: week1.questions[0].id, value: 9 }, { questionId: week1.questions[1].id, value: 4 }] }, at(1))
  assert.deepEqual((await mySurvey(ana, at(1))).questions, [])
  // A missed week stays open: in week 3 Ben sees weeks 1 to 3.
  assert.deepEqual((await mySurvey(ben, at(3))).questions.map((q) => q.orderIndex), [0, 1, 2, 3, 4, 5])
})

test('a disagree answer needs a reason, the improvement question needs an explanation, and the last question is optional', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const all = (await mySurvey(ana, at(11))).questions
  const happy = all.find((q) => q.orderIndex === 1)!
  const improve = all.find((q) => q.orderIndex === 10)!
  const ideas = all.find((q) => q.orderIndex === 11)!
  await assert.rejects(submitSurvey(ana, { anonymous: false, answers: [{ questionId: happy.id, value: 2 }] }, at(11)), /why/i)
  await assert.rejects(submitSurvey(ana, { anonymous: false, answers: [{ questionId: improve.id, choice: 'Career growth' }] }, at(11)), /explain/i)
  await assert.rejects(submitSurvey(ana, { anonymous: false, answers: [{ questionId: improve.id, choice: 'Free lunch', text: 'x' }] }, at(11)), /option/i)
  await submitSurvey(ana, {
    anonymous: false,
    answers: [
      { questionId: happy.id, value: 2, text: 'Too much context switching' },
      { questionId: improve.id, choice: 'Career growth', text: 'A clear path to senior roles' },
      { questionId: ideas.id, text: '' },
    ],
  }, at(11))
  await assert.rejects(submitSurvey(ana, { anonymous: false, answers: [{ questionId: happy.id, value: 4 }] }, at(11)), isStatus(409))
})

test('anonymous answers are stored without a name, and HR sees counts, eNPS and comments', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const [nps, happy] = (await mySurvey(ana, at(1))).questions
  await submitSurvey(ana, { anonymous: true, answers: [{ questionId: nps.id, value: 10 }, { questionId: happy.id, value: 1, text: 'Workload' }] }, at(1))
  await submitSurvey(ben, { anonymous: false, answers: [{ questionId: nps.id, value: 3 }, { questionId: happy.id, value: 5 }] }, at(1))
  const rows = await prisma.surveyResponse.findMany({ where: { questionId: nps.id } })
  assert.deepEqual(rows.map((r) => r.userId).sort(), [null, W.ben.id].sort(), 'no trace of Ana on her answers')
  await assert.rejects(surveyResults(ana, periodId), isStatus(403))
  const results = await surveyResults(HR_ACTOR, periodId)
  const npsResult = results.questions.find((q) => q.id === nps.id)!
  assert.equal(npsResult.responses, 2)
  assert.equal(npsResult.enps, 0) // one promoter, one detractor
  const happyResult = results.questions.find((q) => q.id === happy.id)!
  assert.deepEqual(happyResult.comments.map((c) => [c.text, c.name]), [['Workload', null]])
  assert.deepEqual(happyResult.counts, { '1': 1, '2': 0, '3': 0, '4': 0, '5': 1 })
})

test('nothing stored can tie an anonymous answer to its author: no answer times, random ids, completions by week only', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const [nps] = (await mySurvey(ana, at(1))).questions
  await submitSurvey(ana, { anonymous: true, answers: [{ questionId: nps.id, value: 8, text: 'Fine' }] }, at(1, 3))
  const response = await prisma.surveyResponse.findFirstOrThrow({ where: { questionId: nps.id } })
  assert.ok(!('createdAt' in response), 'answers carry no timestamp')
  assert.match(response.id, /^[0-9a-f-]{36}$/, 'a random id, not a time-ordered one')
  const completion = await prisma.surveyCompletion.findFirstOrThrow({ where: { questionId: nps.id } })
  assert.ok(!('answeredAt' in completion))
  assert.equal(completion.weekIndex, 1)
  const comment = (await surveyResults(HR_ACTOR, periodId)).questions.find((q) => q.id === nps.id)!.comments[0]
  assert.deepEqual(Object.keys(comment).sort(), ['choice', 'name', 'text'])
})

test('each question keeps the week it was scheduled for: adding one later does not pull others forward', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  await addSurveyQuestion(HR_ACTOR, periodId, { text: 'I have the tools I need to do my job well.', kind: 'AGREE' }, at(3))
  const due = (await mySurvey(ben, at(3))).questions
  // Two a week over three weeks, plus the new question, due from the week it was added.
  assert.equal(due.length, 7)
  assert.equal(due.at(-1)?.text, 'I have the tools I need to do my job well.')
})

test('a blank optional answer is not counted as an answer', WEEKLY_DB_TEST, async () => {
  await loadDefaultSurvey(HR_ACTOR, periodId)
  const ideas = (await mySurvey(ana, at(11))).questions.find((q) => q.orderIndex === 11)!
  await submitSurvey(ana, { anonymous: false, answers: [{ questionId: ideas.id, text: '' }] }, at(11))
  assert.equal((await surveyResults(HR_ACTOR, periodId)).questions.find((q) => q.id === ideas.id)!.responses, 0)
  assert.ok(!(await mySurvey(ana, at(11))).questions.some((q) => q.id === ideas.id), 'and it is no longer asked')
})
