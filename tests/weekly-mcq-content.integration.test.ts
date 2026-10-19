import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { STANDARD_MCQ_BANK } from '../lib/weekly/content/mcq-bank'
import { addQuestion, createTopic, updateTopic } from '../lib/weekly/service/question-bank'
import { contentView, loadReadyCompetencies, loadStandardBank, updatePrompt } from '../lib/weekly/service/content'
import { WeeklyError } from '../lib/weekly/service/errors'
import { HR_ACTOR } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
const eight = (scores = [1, 1.5, 2, 2.5, 2.5, 3, 3.5, 4]) => scores.map((score, i) => ({ text: `Statement ${i + 1}`, score }))

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  await seedWeeklyBase(prisma)
})
after(async () => {
  await prisma.$disconnect()
})

test('HR loads the standard bank: every topic, its rotating questions with 8 statements each, linked to a scoring question', WEEKLY_DB_TEST, async () => {
  await assert.rejects(loadStandardBank(weeklyActor(W.ana)), isStatus(403))
  const result = await loadStandardBank(HR_ACTOR)
  assert.equal(result.created, STANDARD_MCQ_BANK.length)
  const view = await contentView(HR_ACTOR)
  const quality = view.competencies.find((c) => c.key === 'LEAD.QUALITY_OF_WORK')!
  assert.deepEqual([quality.perspective, quality.name, quality.ready, quality.prompts.length], ['LEAD', 'Quality of Work', true, 2])
  assert.equal(quality.prompts[0].options.length, 8)
  assert.ok(quality.prompts[0].options.every((o) => typeof o.score === 'number' && o.text.length > 0))
  const question = await prisma.evaluationQuestion.findUniqueOrThrow({ where: { id: (await prisma.weeklyCompetency.findUniqueOrThrow({ where: { key: 'LEAD.QUALITY_OF_WORK' } })).sourceQuestionId! } })
  assert.deepEqual([question.relationshipType, question.questionType, question.questionText], ['DIRECT_REPORT', 'RATING', 'Quality of Work'])
  // The classic bank's own "Quality of Work" is reused, not duplicated.
  assert.equal(await prisma.evaluationQuestion.count({ where: { relationshipType: 'DIRECT_REPORT', questionText: { equals: 'Quality of Work', mode: 'insensitive' } } }), 1)
  const peer = await prisma.weeklyCompetency.findUniqueOrThrow({ where: { key: 'PEER.RELIABILITY' } })
  assert.equal((await prisma.evaluationQuestion.findUniqueOrThrow({ where: { id: peer.sourceQuestionId! } })).relationshipType, 'PEER')
  assert.deepEqual(view.competencies.find((c) => c.key === 'LEAD.DEPT.D1')?.departments, ['Technology'])
})

test('loading again keeps HR’s edits and adds nothing twice', WEEKLY_DB_TEST, async () => {
  await loadStandardBank(HR_ACTOR)
  const prompt = (await contentView(HR_ACTOR)).competencies.find((c) => c.key === 'PEER.COMMUNICATION')!.prompts[0]
  await updatePrompt(HR_ACTOR, prompt.id, { text: 'Edited by HR' })
  const again = await loadStandardBank(HR_ACTOR)
  assert.equal(again.created, 0)
  assert.equal((await prisma.weeklyCompetencyPrompt.findUniqueOrThrow({ where: { id: prompt.id } })).text, 'Edited by HR')
  assert.equal(await prisma.weeklyCompetency.count({ where: { key: 'PEER.COMMUNICATION' } }), 1)
})

test('only topics whose questions have 8 valid statements are asked; older free-text topics are switched off', WEEKLY_DB_TEST, async () => {
  const old = await prisma.weeklyCompetency.create({ data: { key: 'PEER.OLD', perspective: 'PEER', name: 'Old topic', definition: '', prompts: { create: [{ variant: 'A', text: 'Describe a time…' }] } } })
  await loadStandardBank(HR_ACTOR)
  assert.equal((await prisma.weeklyCompetency.findUniqueOrThrow({ where: { id: old.id } })).isActive, false)
  const ready = await loadReadyCompetencies('')
  assert.equal(ready.global.get('PEER')?.length, 3)
  assert.equal(ready.global.get('UPWARD')?.length, 4)
  assert.ok(ready.global.get('LEAD')!.some((t) => t.departments.includes('Design')))
})

test('HR edits statements and scores; a question must keep 8 statements covering every level', WEEKLY_DB_TEST, async () => {
  await loadStandardBank(HR_ACTOR)
  const prompt = (await contentView(HR_ACTOR)).competencies.find((c) => c.key === 'PEER.RELIABILITY')!.prompts[0]
  await assert.rejects(updatePrompt(HR_ACTOR, prompt.id, { options: eight().slice(0, 7) }), /8 statements/)
  await assert.rejects(updatePrompt(HR_ACTOR, prompt.id, { options: eight([1, 1, 2, 2.5, 2.5, 3, 3.5, 4]) }), /1\.5/)
  await updatePrompt(HR_ACTOR, prompt.id, { options: eight([1, 1.5, 2, 2, 2.5, 3, 3.5, 4]) })
  const saved = (await contentView(HR_ACTOR)).competencies.find((c) => c.key === 'PEER.RELIABILITY')!.prompts[0]
  assert.deepEqual(saved.options.map((o) => o.score), [1, 1.5, 2, 2, 2.5, 3, 3.5, 4])
  assert.equal(saved.options[0].text, 'Statement 1')
})

test('HR adds a question to a topic, and a new topic for chosen departments', WEEKLY_DB_TEST, async () => {
  await loadStandardBank(HR_ACTOR)
  const topic = await prisma.weeklyCompetency.findUniqueOrThrow({ where: { key: 'PEER.RELIABILITY' } })
  await assert.rejects(addQuestion(HR_ACTOR, topic.id, { text: 'New question about [name]?', options: eight().slice(1) }), /8 statements/)
  const added = await addQuestion(HR_ACTOR, topic.id, { text: 'New question about [name]?', options: eight() })
  assert.equal(added.variant, 'C')
  const created = await createTopic(HR_ACTOR, { perspective: 'LEAD', name: 'Client care', departments: ['Operations'], text: 'How does [name] treat clients?', options: eight() })
  const view = (await contentView(HR_ACTOR)).competencies.find((c) => c.id === created.id)!
  assert.deepEqual([view.name, view.departments, view.ready], ['Client care', ['Operations'], true])
  await updateTopic(HR_ACTOR, created.id, { name: 'Client care and follow-up', departments: [] })
  const renamed = (await contentView(HR_ACTOR)).competencies.find((c) => c.id === created.id)!
  assert.deepEqual([renamed.name, renamed.departments], ['Client care and follow-up', []])
})

test('a department topic never takes over a classic question, and renaming a topic leaves a shared classic question alone', WEEKLY_DB_TEST, async () => {
  // A classic question with a department topic's name.
  await prisma.evaluationQuestion.create({ data: { relationshipType: 'DIRECT_REPORT', questionText: 'Creative range', questionType: 'RATING', orderIndex: 990 } })
  await loadStandardBank(HR_ACTOR)
  const dept = await prisma.weeklyCompetency.findUniqueOrThrow({ where: { key: 'LEAD.DEPT.D11' } })
  assert.notEqual((await prisma.evaluationQuestion.findUniqueOrThrow({ where: { id: dept.sourceQuestionId! } })).orderIndex, 990, 'its own question')
  const quality = await prisma.weeklyCompetency.findUniqueOrThrow({ where: { key: 'LEAD.QUALITY_OF_WORK' } })
  await updateTopic(HR_ACTOR, quality.id, { name: 'Quality and care' })
  assert.equal((await prisma.evaluationQuestion.findUniqueOrThrow({ where: { id: quality.sourceQuestionId! } })).questionText, 'Quality of Work', 'the classic bank keeps its wording')
  const created = await createTopic(HR_ACTOR, { perspective: 'PEER', name: 'Handovers', departments: [], text: 'How does [name] hand over?', options: eight() })
  await updateTopic(HR_ACTOR, created.id, { name: 'Clean handovers' })
  const own = await prisma.weeklyCompetency.findUniqueOrThrow({ where: { id: created.id } })
  assert.equal((await prisma.evaluationQuestion.findUniqueOrThrow({ where: { id: own.sourceQuestionId! } })).questionText, 'Clean handovers', 'a question made for the topic follows it')
})

test('an older free-text topic with a standard key is upgraded with the standard questions, not skipped and switched off', WEEKLY_DB_TEST, async () => {
  const old = await prisma.weeklyCompetency.create({
    data: { key: 'LEAD.QUALITY_OF_WORK', perspective: 'LEAD', name: 'Quality of Work', definition: '', prompts: { create: [{ variant: 'A', text: 'Describe a piece of work they handed over.' }] } },
  })
  await loadStandardBank(HR_ACTOR)
  const topic = await prisma.weeklyCompetency.findUniqueOrThrow({ where: { id: old.id }, include: { prompts: { orderBy: { variant: 'asc' } } } })
  assert.equal(topic.isActive, true)
  const bank = STANDARD_MCQ_BANK.find((t) => t.key === 'LEAD.QUALITY_OF_WORK')!
  const active = topic.prompts.filter((p) => p.isActive)
  assert.deepEqual(active.map((p) => p.text), bank.questions.map((q) => q.text))
  assert.ok(active.every((p) => Array.isArray(p.options) && (p.options as unknown[]).length === 8))
  assert.ok((await contentView(HR_ACTOR)).competencies.some((c) => c.key === 'LEAD.QUALITY_OF_WORK' && c.ready))
})
