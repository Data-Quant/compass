// HR's weekly question bank: add topics and questions, edit them, remove questions, and remove or restore whole topics.
// A question that was already asked is archived, not deleted, so earlier answers keep the question they answered.
import { prisma } from '@/lib/db'
import type { McqStatement } from '../mcq'
import type { Perspective } from '../perspectives'
import { recordAudit } from './audit'
import { createBankQuestion, storedOptions } from './content'
import { assertHr, type WeeklyActor } from './context'
import { WeeklyError } from './errors'

const LAST_QUESTION = 'Keep at least one active question for each topic'

/** The next free variant: A–Z, then Q27, Q28 … */
function nextVariantName(used: readonly string[]): string {
  for (let code = 65; code <= 90; code += 1) {
    const letter = String.fromCharCode(code)
    if (!used.includes(letter)) return letter
  }
  let n = 27
  while (used.includes(`Q${n}`)) n += 1
  return `Q${n}`
}

const cleanDepartments = (departments: readonly string[]) => [...new Set(departments.map((d) => d.trim()).filter(Boolean))]
const required = (text: string, message: string) => {
  if (!text.trim()) throw new WeeklyError(message)
  return text.trim()
}

export async function addQuestion(actor: WeeklyActor, competencyId: string, input: { text: string; options: McqStatement[] }): Promise<{ id: string; variant: string }> {
  assertHr(actor)
  const text = required(input.text, 'Write the question')
  const options = storedOptions(input.options)
  return prisma.$transaction(async (tx) => {
    const topic = await tx.weeklyCompetency.findUnique({ where: { id: competencyId }, include: { prompts: { select: { variant: true } } } })
    if (!topic) throw new WeeklyError('Topic not found', 404)
    const variant = nextVariantName(topic.prompts.map((p) => p.variant))
    const created = await tx.weeklyCompetencyPrompt.create({ data: { competencyId, variant, text, options } })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: 'PROMPT_ADD', objectType: 'WeeklyCompetencyPrompt', objectId: created.id, after: { competencyId, variant, text } })
    return { id: created.id, variant }
  })
}

/** A new topic, with its first question; its scores are written against a new question in the perspective's bank. */
export async function createTopic(
  actor: WeeklyActor,
  input: { perspective: Perspective; name: string; departments: string[]; text: string; options: McqStatement[] },
): Promise<{ id: string }> {
  assertHr(actor)
  const name = required(input.name, 'Name the topic')
  const text = required(input.text, 'Write the question')
  const options = storedOptions(input.options)
  return prisma.$transaction(async (tx) => {
    const sourceQuestionId = await createBankQuestion(tx, input.perspective, name)
    const topic = await tx.weeklyCompetency.create({
      data: {
        key: `${input.perspective}.HR.${sourceQuestionId}`, perspective: input.perspective, name, definition: '', departments: cleanDepartments(input.departments), sourceQuestionId,
        prompts: { create: [{ variant: 'A', text, options }] },
      },
    })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: 'TOPIC_CREATE', objectType: 'WeeklyCompetency', objectId: topic.id, after: { name, perspective: input.perspective } })
    return { id: topic.id }
  })
}

/** Renames a topic (and the question its scores are reported under) or changes the departments it is asked about. */
export async function updateTopic(actor: WeeklyActor, competencyId: string, input: { name?: string; departments?: string[] }): Promise<void> {
  assertHr(actor)
  const topic = await prisma.weeklyCompetency.findUnique({ where: { id: competencyId } })
  if (!topic) throw new WeeklyError('Topic not found', 404)
  const name = input.name !== undefined ? required(input.name, 'Name the topic') : undefined
  await prisma.$transaction(async (tx) => {
    await tx.weeklyCompetency.update({
      where: { id: competencyId },
      data: { ...(name !== undefined ? { name } : {}), ...(input.departments !== undefined ? { departments: cleanDepartments(input.departments) } : {}) },
    })
    // Only a question HR made for this topic follows its name; the classic bank's own questions keep their wording.
    if (name !== undefined && topic.sourceQuestionId && topic.key.includes('.HR.')) await tx.evaluationQuestion.update({ where: { id: topic.sourceQuestionId }, data: { questionText: name } })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: 'TOPIC_EDIT', objectType: 'WeeklyCompetency', objectId: competencyId, before: { name: topic.name, departments: topic.departments }, after: input })
  })
}

export async function removeQuestion(actor: WeeklyActor, promptId: string, now: Date = new Date()): Promise<{ archived: boolean }> {
  assertHr(actor)
  return prisma.$transaction(async (tx) => {
    const prompt = await tx.weeklyCompetencyPrompt.findUnique({ where: { id: promptId } })
    if (!prompt || prompt.archivedAt) throw new WeeklyError('Question not found', 404)
    const others = await tx.weeklyCompetencyPrompt.count({ where: { competencyId: prompt.competencyId, isActive: true, archivedAt: null, id: { not: prompt.id } } })
    if (others === 0) throw new WeeklyError(LAST_QUESTION, 409)
    const asked = await tx.weeklyPrompt.count({ where: { promptVariantId: prompt.id } })
    if (asked > 0) await tx.weeklyCompetencyPrompt.update({ where: { id: prompt.id }, data: { isActive: false, archivedAt: now } })
    else await tx.weeklyCompetencyPrompt.delete({ where: { id: prompt.id } })
    await recordAudit(tx, {
      actorId: actor.id, actorRole: 'HR', action: asked > 0 ? 'PROMPT_ARCHIVE' : 'PROMPT_DELETE', objectType: 'WeeklyCompetencyPrompt', objectId: prompt.id,
      before: { competencyId: prompt.competencyId, variant: prompt.variant, text: prompt.text },
    })
    return { archived: asked > 0 }
  })
}

/** Stops asking about a topic: open questions already sent stay answerable; nothing new is asked. */
export async function removeTopic(actor: WeeklyActor, competencyId: string, now: Date = new Date()): Promise<void> {
  assertHr(actor)
  const topic = await prisma.weeklyCompetency.findUnique({ where: { id: competencyId } })
  if (!topic) throw new WeeklyError('Topic not found', 404)
  await prisma.$transaction(async (tx) => {
    await tx.weeklyCompetency.update({ where: { id: competencyId }, data: { isActive: false, removedAt: now } })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: 'TOPIC_REMOVE', objectType: 'WeeklyCompetency', objectId: competencyId, before: { name: topic.name } })
  })
}

export async function restoreTopic(actor: WeeklyActor, competencyId: string): Promise<void> {
  assertHr(actor)
  const topic = await prisma.weeklyCompetency.findUnique({ where: { id: competencyId } })
  if (!topic || !topic.removedAt) throw new WeeklyError('Topic not found', 404)
  await prisma.$transaction(async (tx) => {
    await tx.weeklyCompetency.update({ where: { id: competencyId }, data: { isActive: true, removedAt: null } })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: 'TOPIC_RESTORE', objectType: 'WeeklyCompetency', objectId: competencyId, after: { name: topic.name } })
  })
}
