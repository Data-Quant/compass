// Spec 9.5 and 13.4: Amina's worked example, run through the weekly module and the unchanged classic scorer.
import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { calculateWeightedScore } from '../lib/scoring'
import { fakeModel } from '../lib/weekly/ai/model'
import { loadAnswerRecords } from '../lib/weekly/service/answer-states'
import { closeCycle } from '../lib/weekly/service/close'
import { ensureLeadCustomCompetencies } from '../lib/weekly/service/content'
import { decideAnswer } from '../lib/weekly/service/decisions'
import { submitForm } from '../lib/weekly/service/form-submit'
import { formDetail, openForms } from '../lib/weekly/service/forms'
import { requestMoreEvidence } from '../lib/weekly/service/more-evidence'
import { releaseWeek } from '../lib/weekly/service/release'
import { runScoring } from '../lib/weekly/service/scoring'
import { toCategorySetKey } from '../types'
import { answerAs } from './helpers/weekly-answers'
import { F, seedFormFixtures } from './helpers/weekly-form-fixtures'
import { approveAllContent, at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

/** The spec's Amina is played by the fixture Ana Torvik. */
const AMINA = W.ana.id
const CUSTOM = ['Owns client escalations', 'Mentors juniors'] as const
/** The weekly scores HR confirms, by evaluator and question: Lead 2.60; Peer 3/3, 3/2, 3/3 = 2.83. */
const WEEKLY: Record<string, Record<string, number>> = {
  [W.lead.id]: { 'Quality of Work': 3, 'Initiative & Proactivity': 2, 'Team Collaboration': 3, 'Owns client escalations': 3, 'Mentors juniors': 2 },
  [W.ben.id]: { 'Collaboration & Teamwork': 3, Communication: 3, Reliability: 3 },
  [W.cara.id]: { 'Collaboration & Teamwork': 3, Communication: 2, Reliability: 3 },
}
/** Form ratings by question: C-Level 2.40 over five questions, Department 2.50, HR 3.00. */
const FORMS: Record<'C_LEVEL' | 'DEPT' | 'HR', Record<string, number>> = {
  C_LEVEL: { 'Strategic contribution': 3, Ownership: 2, 'Client impact': 3, Judgement: 2, 'Growth mindset': 2 },
  DEPT: { 'Contribution to the department': 3, 'Department culture': 2 },
  HR: { 'Policy adherence': 3, 'Attendance and punctuality': 3 },
}
const descriptions = (text: string) => ({
  rating1Description: `${text}: falls short.`, rating2Description: `${text}: as expected.`,
  rating3Description: `${text}: above expectations.`, rating4Description: `${text}: changes the standard.`,
})

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
  // A second peer, two more C-Level questions (five in all) and the lead's two custom questions.
  await prisma.evaluatorMapping.create({ data: { evaluatorId: W.cara.id, evaluateeId: AMINA, relationshipType: 'PEER' } })
  await prisma.evaluationQuestion.createMany({
    data: [
      { relationshipType: 'C_LEVEL', questionText: 'Judgement', questionType: 'RATING', orderIndex: 970 },
      { relationshipType: 'C_LEVEL', questionText: 'Growth mindset', questionType: 'RATING', orderIndex: 971 },
    ],
  })
  await prisma.preEvaluationLeadPrep.create({
    data: {
      periodId, leadId: W.lead.id, questionsSubmittedAt: new Date('2026-09-20T00:00:00.000Z'),
      questions: { create: CUSTOM.map((text, orderIndex) => ({ orderIndex, questionText: text, ...descriptions(text) })) },
    },
  })
  ;({ cycleId } = await startedCycle(periodId))
  await ensureLeadCustomCompetencies({ id: cycleId, periodId })
  await approveAllContent()
})
after(async () => {
  await prisma.$disconnect()
})

/** Topic id → the question it came from (a bank question or a lead's custom question). */
async function questionTextByTopic(): Promise<Map<string, string>> {
  const topics = await prisma.weeklyCompetency.findMany({ select: { id: true, sourceQuestionId: true, sourceLeadQuestionId: true } })
  const [bank, custom] = await Promise.all([
    prisma.evaluationQuestion.findMany({ where: { id: { in: topics.flatMap((t) => (t.sourceQuestionId ? [t.sourceQuestionId] : [])) } }, select: { id: true, questionText: true } }),
    prisma.preEvaluationLeadQuestion.findMany({ where: { id: { in: topics.flatMap((t) => (t.sourceLeadQuestionId ? [t.sourceLeadQuestionId] : [])) } }, select: { id: true, questionText: true } }),
  ])
  const text = new Map([...bank, ...custom].map((q) => [q.id, q.questionText]))
  return new Map(topics.map((t) => [t.id, text.get(t.sourceQuestionId ?? t.sourceLeadQuestionId ?? '') ?? '']))
}

/** The C-Level, Department and HR forms, as the chief and HR fill them in the catch-up weeks. */
async function submitForms(): Promise<void> {
  await openForms(HR_ACTOR, cycleId, at(1, 4))
  const fill = async (actor: ReturnType<typeof weeklyActor>, relationshipType: 'C_LEVEL' | 'DEPT' | 'HR') => {
    const { questions } = await formDetail(actor, { relationshipType, evaluateeId: AMINA }, at(1, 4))
    const responses = questions.map((q) => {
      if (q.type === 'TEXT') return { questionId: q.id, questionSource: q.source, textResponse: null }
      const rating = FORMS[relationshipType][q.text]
      assert.ok(rating !== undefined, `Unexpected ${relationshipType} question “${q.text}”: the test database holds another ${relationshipType} question`)
      return { questionId: q.id, questionSource: q.source, ratingValue: rating }
    })
    await submitForm(actor, { relationshipType, evaluateeId: AMINA, responses }, at(1, 4))
  }
  await fill(weeklyActor(F.chief), 'C_LEVEL')
  await fill(weeklyActor(F.chief), 'DEPT')
  await fill(HR_ACTOR, 'HR')
}

test('Amina’s quarter from the spec scores 63.8% through the unchanged scorer', WEEKLY_DB_TEST, async () => {
  assert.equal(
    await prisma.weightProfile.count({ where: { categorySetKey: toCategorySetKey(['C_LEVEL', 'DEPT', 'HR', 'PEER', 'TEAM_LEAD']) } }), 0,
    'This database has a weight profile for Amina’s category set; the golden test needs the default weights',
  )
  // Every lead and peer topic about Amina is asked now: "ask again" ignores pacing and the weekly cap.
  await releaseWeek(cycleId, 1, at(1))
  for (const perspective of ['LEAD', 'PEER'] as const) {
    await requestMoreEvidence(HR_ACTOR, cycleId, { evaluateeId: AMINA, perspective }, at(1), async () => undefined, 'https://compass.example')
  }
  const questionText = await questionTextByTopic()
  const open = await prisma.weeklyPrompt.findMany({ where: { cycleId, evaluateeId: AMINA, kind: 'STANDARD', status: 'OPEN' }, include: { slot: true } })
  const wanted = open.filter((p) => p.slot && WEEKLY[p.evaluatorId]?.[questionText.get(p.slot.competencyId) ?? ''] !== undefined)
  assert.equal(wanted.length, 11, 'five lead topics and three topics from each of two peers')
  for (const prompt of wanted) await answerAs(prompt, 'solid', at(1, 2))
  await runScoring({ model: fakeModel(), budgetMs: 60_000, clock: () => at(1, 2) })
  for (const record of (await loadAnswerRecords({ cycleId })).filter((r) => r.evaluateeId === AMINA)) {
    const score = WEEKLY[record.evaluatorId][questionText.get(record.competencyId ?? '') ?? '']
    await decideAnswer(HR_ACTOR, record.responseId, {
      action: 'SET_SCORE', score, reason: 'The spec’s worked example',
      basedOn: { aiScoreId: record.aiScore?.id ?? null, reviewId: record.latestReview?.id ?? null },
    }, at(1, 3))
  }
  await submitForms()
  const closed = await closeCycle(HR_ACTOR, cycleId, { drops: [], formsAcknowledged: true }, at(13))

  const weeklyRows = await prisma.evaluation.findMany({ where: { periodId, evaluateeId: AMINA, source: 'AI_WEEKLY' } })
  assert.equal(weeklyRows.length, 11)
  assert.ok(weeklyRows.every((r) => r.aggregationRunId === closed.runId && r.submittedAt !== null))
  const report = await calculateWeightedScore(AMINA, periodId)
  const byType = new Map(report.breakdown.map((b) => [b.relationshipType as string, b]))
  const near = (actual: number | undefined, expected: number, precision: number) => actual !== undefined && Math.abs(actual - expected) <= precision
  for (const [type, expected] of [['TEAM_LEAD', 2.6], ['PEER', 2.8333], ['C_LEVEL', 2.4], ['DEPT', 2.5], ['HR', 3]] as const) {
    assert.ok(near(byType.get(type)?.normalizedScore, expected, 0.001), `${type}: ${byType.get(type)?.normalizedScore}`)
  }
  assert.ok(near(byType.get('C_LEVEL')?.weight, 0.35 / 0.85, 1e-9), 'the default weights are redistributed over the five groups')
  assert.ok(near(report.overallScore, 63.8, 0.05), `overall ${report.overallScore}`)
})
