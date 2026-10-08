// The weekly multiple-choice bank (UX spec, sections 8 to 10). Each topic has rotating questions; each question has 8
// statements with fixed scores. A topic is asked once at least one of its active questions has valid statements. Every
// topic points at a RATING question in the classic bank, so close writes ordinary Evaluation rows the engine scores.
import type { Prisma, WeeklyCompetency, WeeklyCompetencyPrompt } from '@prisma/client'
import { prisma } from '@/lib/db'
import { STANDARD_MCQ_BANK } from '../content/mcq-bank'
import { optionsProblem, parseOptions, withOptionIds, type McqStatement } from '../mcq'
import { bankForPerspective, type Perspective } from '../perspectives'
import type { ContentCompetency, ContentResponse } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, type WeeklyActor } from './context'
import { toJson, type Db } from './db'
import { WeeklyError } from './errors'

export interface ReadyCompetency {
  id: string
  key: string
  name: string
  perspective: Perspective
  /** Asked only about people in these departments; empty for everyone. */
  departments: string[]
  prompts: Array<{ id: string; variant: string; text: string }>
}
export interface ReadyCompetencies { global: Map<Perspective, ReadyCompetency[]> }

/** Statements as stored: with ids, validated. Throws HR's message when they cannot be used. */
export function storedOptions(options: readonly McqStatement[]): Prisma.InputJsonValue {
  const problem = optionsProblem(options)
  if (problem) throw new WeeklyError(problem)
  return toJson(withOptionIds(options))
}

const usable = (p: Pick<WeeklyCompetencyPrompt, 'options'>) => optionsProblem(parseOptions(p.options)) === null

/** The classic RATING question a topic's scores are written against, created in its perspective's bank. */
export async function createBankQuestion(tx: Prisma.TransactionClient, perspective: Perspective, name: string): Promise<string> {
  const relationshipType = bankForPerspective(perspective)
  const last = await tx.evaluationQuestion.findFirst({ where: { relationshipType }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true } })
  const question = await tx.evaluationQuestion.create({ data: { relationshipType, questionText: name, questionType: 'RATING', maxRating: 4, orderIndex: (last?.orderIndex ?? 0) + 1 } })
  return question.id
}

/** The bank's RATING question of this name, if the classic bank already has it (e.g. Quality of Work), so scores land on it. */
async function existingBankQuestion(tx: Prisma.TransactionClient, perspective: Perspective, name: string): Promise<string | null> {
  const question = await tx.evaluationQuestion.findFirst({
    where: { relationshipType: bankForPerspective(perspective), questionType: 'RATING', questionText: { equals: name, mode: 'insensitive' } },
    orderBy: { orderIndex: 'asc' }, select: { id: true },
  })
  return question?.id ?? null
}

/**
 * Loads the spec's standard bank. Topics already loaded keep HR's edits; topics without multiple-choice questions (the
 * free-text model) are switched off so they are no longer asked.
 */
export async function loadStandardBank(actor: WeeklyActor): Promise<{ created: number; retired: number }> {
  assertHr(actor)
  let created = 0
  for (const topic of STANDARD_MCQ_BANK) {
    const existing = await prisma.weeklyCompetency.findUnique({ where: { key: topic.key }, select: { id: true } })
    if (existing) continue
    await prisma.$transaction(async (tx) => {
      const sourceQuestionId = (await existingBankQuestion(tx, topic.perspective, topic.name)) ?? (await createBankQuestion(tx, topic.perspective, topic.name))
      await tx.weeklyCompetency.create({
        data: {
          key: topic.key, perspective: topic.perspective, name: topic.name, definition: '', departments: topic.departments ?? [], sourceQuestionId,
          prompts: { create: topic.questions.map((q, i) => ({ variant: String.fromCharCode(65 + i), text: q.text, options: storedOptions(q.options) })) },
        },
      })
    })
    created += 1
  }
  const freeText = await prisma.weeklyCompetency.findMany({ where: { isActive: true }, include: { prompts: { where: { isActive: true } } } })
  const retireIds = freeText.filter((c) => !c.prompts.some(usable)).map((c) => c.id)
  if (retireIds.length) await prisma.weeklyCompetency.updateMany({ where: { id: { in: retireIds } }, data: { isActive: false } })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'CONTENT_LOAD_STANDARD', objectType: 'WeeklyCompetency', after: { created, retired: retireIds.length } })
  return { created, retired: retireIds.length }
}

type CompetencyWithPrompts = WeeklyCompetency & { prompts: WeeklyCompetencyPrompt[] }

function toContentCompetency(c: CompetencyWithPrompts): ContentCompetency {
  const prompts = c.prompts.map((p) => {
    const options = parseOptions(p.options)
    return { id: p.id, variant: p.variant, text: p.text, isActive: p.isActive, options, problem: optionsProblem(options) }
  })
  return {
    id: c.id, key: c.key, perspective: c.perspective, name: c.name, departments: c.departments,
    ready: prompts.some((p) => p.isActive && p.problem === null), prompts,
  }
}

export async function contentView(actor: WeeklyActor): Promise<ContentResponse> {
  assertHr(actor)
  const competencies = await prisma.weeklyCompetency.findMany({
    where: { isActive: true },
    include: { prompts: { where: { archivedAt: null }, orderBy: { variant: 'asc' } } },
    orderBy: [{ perspective: 'asc' }, { key: 'asc' }],
  })
  const removed = await prisma.weeklyCompetency.findMany({ where: { removedAt: { not: null } }, orderBy: [{ perspective: 'asc' }, { name: 'asc' }] })
  return {
    competencies: competencies.map(toContentCompetency),
    removed: removed.map((c) => ({ id: c.id, perspective: c.perspective, name: c.name, removedAt: (c.removedAt as Date).toISOString() })),
  }
}

export async function updatePrompt(actor: WeeklyActor, promptId: string, input: { text?: string; options?: McqStatement[]; isActive?: boolean }): Promise<void> {
  assertHr(actor)
  const prompt = await prisma.weeklyCompetencyPrompt.findUnique({ where: { id: promptId } })
  if (!prompt) throw new WeeklyError('Question not found', 404)
  if (input.isActive === false) {
    const others = await prisma.weeklyCompetencyPrompt.count({ where: { competencyId: prompt.competencyId, isActive: true, id: { not: prompt.id } } })
    if (others === 0) throw new WeeklyError('Keep at least one active question for each topic', 409)
  }
  if (input.text !== undefined && !input.text.trim()) throw new WeeklyError('Write the question')
  const options = input.options !== undefined ? storedOptions(input.options) : undefined
  await prisma.$transaction(async (tx) => {
    await tx.weeklyCompetencyPrompt.update({
      where: { id: prompt.id },
      data: {
        ...(input.text !== undefined ? { text: input.text.trim() } : {}),
        ...(options !== undefined ? { options } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    })
    await recordAudit(tx, {
      actorId: actor.id, actorRole: 'HR', action: 'PROMPT_EDIT', objectType: 'WeeklyCompetencyPrompt', objectId: prompt.id,
      before: { text: prompt.text, options: prompt.options, isActive: prompt.isActive }, after: { text: input.text, options, isActive: input.isActive },
    })
  })
}

export async function loadReadyCompetencies(cycleId: string, db: Db = prisma): Promise<ReadyCompetencies> {
  void cycleId
  const competencies = await db.weeklyCompetency.findMany({
    where: { isActive: true },
    include: { prompts: { where: { isActive: true }, orderBy: { variant: 'asc' } } },
    orderBy: { key: 'asc' },
  })
  const global = new Map<Perspective, ReadyCompetency[]>()
  for (const c of competencies) {
    const prompts = c.prompts.filter(usable)
    if (prompts.length === 0) continue
    const ready: ReadyCompetency = {
      id: c.id, key: c.key, name: c.name, perspective: c.perspective, departments: c.departments,
      prompts: prompts.map((p) => ({ id: p.id, variant: p.variant, text: p.text })),
    }
    global.set(c.perspective, [...(global.get(c.perspective) ?? []), ready])
  }
  return { global }
}

export async function readyCompetencyCount(db: Db = prisma): Promise<number> {
  const ready = await loadReadyCompetencies('', db)
  return [...ready.global.values()].reduce((sum, list) => sum + list.length, 0)
}
