// HR's weekly question bank: add questions to a topic, remove questions, and remove or restore whole topics.
// A question that was already asked is archived, not deleted, so earlier answers keep the question they answered.
import { prisma } from '@/lib/db'
import { recordAudit } from './audit'
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

export async function addQuestion(actor: WeeklyActor, competencyId: string, input: { text: string }): Promise<{ id: string; variant: string }> {
  assertHr(actor)
  return prisma.$transaction(async (tx) => {
    const topic = await tx.weeklyCompetency.findUnique({ where: { id: competencyId }, include: { prompts: { select: { variant: true } } } })
    if (!topic) throw new WeeklyError('Topic not found', 404)
    const variant = nextVariantName(topic.prompts.map((p) => p.variant))
    const created = await tx.weeklyCompetencyPrompt.create({ data: { competencyId, variant, text: input.text.trim() } })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: 'PROMPT_ADD', objectType: 'WeeklyCompetencyPrompt', objectId: created.id, after: { competencyId, variant, text: created.text } })
    return { id: created.id, variant }
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
