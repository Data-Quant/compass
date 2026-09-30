import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import {
  approveProfile, contentView, ensureLeadCustomCompetencies, loadReadyCompetencies, saveProfileDraft, syncFromQuestionBank, updatePrompt,
} from '../lib/weekly/service/content'
import { WeeklyError } from '../lib/weekly/service/errors'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const hr = weeklyActor(W.hr)
const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
let periodId = ''

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
})
after(async () => {
  await prisma.$disconnect()
})

test('sync makes one topic per rating question: spec drafts by title, HR-description drafts otherwise', WEEKLY_DB_TEST, async () => {
  assert.deepEqual(await syncFromQuestionBank(hr), { created: 11, relinked: 0, deactivated: 0 })
  const topics = await prisma.weeklyCompetency.findMany({ include: { profiles: true, prompts: true } })
  assert.equal(topics.length, 11)
  const client = topics.find((t) => t.name === 'Client Communication')
  assert.equal(client?.perspective, 'LEAD')
  assert.equal(client?.profiles[0].incomplete, true)
  assert.ok(topics.every((t) => t.prompts.length === 2 && t.profiles.length === 1 && t.profiles[0].status === 'DRAFT'))
  assert.deepEqual(await syncFromQuestionBank(hr), { created: 0, relinked: 0, deactivated: 0 })
})

test('only HR manages content', WEEKLY_DB_TEST, async () => {
  await assert.rejects(syncFromQuestionBank(weeklyActor(W.ana)), isStatus(403))
  await assert.rejects(contentView(weeklyActor(W.ana)), isStatus(403))
})

test('a topic is ready once approved; approving a new version retires the old one', WEEKLY_DB_TEST, async () => {
  await syncFromQuestionBank(hr)
  const quality = (await contentView(hr)).competencies.find((c) => c.key === 'LEAD.QUALITY_OF_WORK')
  assert.ok(quality?.draft)
  assert.equal(quality.ready, false)
  await approveProfile(hr, quality.draft.id)
  const approved = (await contentView(hr)).competencies.find((c) => c.key === 'LEAD.QUALITY_OF_WORK')
  assert.ok(approved?.approved)
  assert.equal(approved.ready, true)
  assert.equal(approved.draft, null)
  const levels = { ...approved.approved.levels, '4': { ...approved.approved.levels['4'], behaviours: 'Sets the standard for the whole firm.' } }
  const draft = await saveProfileDraft(hr, approved.id, { levels, insufficientDefinition: 'No concrete example of what they did.' })
  assert.equal(draft.version, 2)
  await approveProfile(hr, draft.id)
  const statuses = (await prisma.weeklyProfile.findMany({ where: { competencyId: approved.id }, orderBy: { version: 'asc' } })).map((p) => p.status)
  assert.deepEqual(statuses, ['RETIRED', 'APPROVED'])
  await assert.rejects(approveProfile(hr, draft.id), isStatus(409))
  const ready = await loadReadyCompetencies('any-cycle')
  assert.deepEqual(ready.global.get('LEAD')?.map((c) => c.key), ['LEAD.QUALITY_OF_WORK'])
})

test('HR sees its own 1–4 descriptions beside each draft', WEEKLY_DB_TEST, async () => {
  await syncFromQuestionBank(hr)
  const client = (await contentView(hr)).competencies.find((c) => c.name === 'Client Communication')
  assert.equal(client?.hrDescriptions['1'], 'Clients chase for updates.')
  assert.equal(client?.hrDescriptions['3'], null)
})

test('a topic keeps at least one active question', WEEKLY_DB_TEST, async () => {
  await syncFromQuestionBank(hr)
  const topic = (await contentView(hr)).competencies[0]
  await updatePrompt(hr, topic.prompts[0].id, { isActive: false })
  await assert.rejects(updatePrompt(hr, topic.prompts[1].id, { isActive: false }), isStatus(409))
  await updatePrompt(hr, topic.prompts[1].id, { text: 'Describe one recent handover they led. What happened next?' })
  const prompts = await prisma.weeklyCompetencyPrompt.findMany({ where: { competencyId: topic.id }, orderBy: { variant: 'asc' } })
  assert.deepEqual(prompts.map((p) => p.isActive), [false, true])
})

test('leads’ custom questions become draft topics for that quarter', WEEKLY_DB_TEST, async () => {
  await prisma.preEvaluationLeadPrep.create({
    data: {
      periodId, leadId: W.lead.id, questionsSubmittedAt: new Date(),
      questions: {
        create: [
          { orderIndex: 0, questionText: 'Owns client escalations', rating1Description: 'Escalations stall.', rating2Description: 'Handles them when asked.', rating3Description: 'Resolves them early.', rating4Description: 'Prevents them across accounts.' },
          { orderIndex: 1, questionText: 'Mentors juniors' },
        ],
      },
    },
  })
  assert.equal(await ensureLeadCustomCompetencies({ id: 'cycle-x', periodId }), 2)
  assert.equal(await ensureLeadCustomCompetencies({ id: 'cycle-x', periodId }), 0)
  const custom = await prisma.weeklyCompetency.findMany({ where: { leadId: W.lead.id }, include: { profiles: true } })
  assert.deepEqual(custom.map((c) => c.perspective), ['LEAD', 'LEAD'])
  assert.equal(custom.find((c) => c.name === 'Mentors juniors')?.profiles[0].incomplete, true)
  assert.equal(custom.find((c) => c.name === 'Owns client escalations')?.profiles[0].incomplete, false)
})

test('the rewritten bank questions get the spec topic, and the generic topic made for them earlier is retired', WEEKLY_DB_TEST, async () => {
  const question = await prisma.evaluationQuestion.findFirstOrThrow({ where: { questionText: 'Quality of Work' } })
  const rewritten = "Does this team member's output reflect careful thinking, attention to details, and a standard they would be proud to put their name on, or does their work require frequent correction and follow-up?"
  await prisma.evaluationQuestion.update({ where: { id: question.id }, data: { questionText: rewritten } })
  // What an earlier sync made before the spec knew this wording: a generic topic keyed by the question.
  await prisma.weeklyCompetency.create({
    data: {
      key: `LEAD.Q_${question.id}`, perspective: 'LEAD', name: rewritten, definition: rewritten, sourceQuestionId: question.id,
      prompts: { create: [{ variant: 'A', text: 'Generic A' }, { variant: 'B', text: 'Generic B' }] },
    },
  })
  await syncFromQuestionBank(hr)
  const active = await prisma.weeklyCompetency.findMany({ where: { sourceQuestionId: question.id, isActive: true }, include: { prompts: true } })
  assert.deepEqual(active.map((t) => [t.key, t.name]), [['LEAD.QUALITY_OF_WORK', 'Quality of Work']])
  assert.match(active[0].prompts.find((p) => p.variant === 'A')!.text, /^Pick one piece of work they delivered/)
})
