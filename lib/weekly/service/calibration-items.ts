// Part D §2: HR's calibration set — anonymised answers with HR's own judgement, the target a model is measured against.
import type { WeeklyCalibrationItem } from '@prisma/client'
import { prisma } from '@/lib/db'
import { CALIBRATION_MIN_ITEMS } from '../calibration-rules'
import type { CalibrationItemInput, CalibrationItemUpdate } from '../schemas'
import type { CalibrationItemsResponse, CalibrationItemView, SufficiencyValue } from '../view-types'
import { redactorFor } from './anonymise'
import { recordAudit } from './audit'
import { assertHr, type WeeklyActor } from './context'
import { isUniqueViolation } from './db'
import { WeeklyError } from './errors'

export const ALREADY_IN_SET = 'This answer is already in the calibration set'

interface Judgement { hrSufficiency: SufficiencyValue; hrScore: number | null; note?: string | null }
interface ItemText { competencyId: string; question: string; situation: string; action: string; result: string; shortfall: string | null }

function checkJudgement(judgement: Judgement): void {
  if (judgement.hrSufficiency === 'SUFFICIENT' && judgement.hrScore === null) throw new WeeklyError('Give your score (1–4) for an answer with enough evidence')
  if (judgement.hrSufficiency === 'INSUFFICIENT' && judgement.hrScore !== null) throw new WeeklyError('An answer without enough evidence has no score')
}

async function assertTopic(competencyId: string): Promise<void> {
  const topic = await prisma.weeklyCompetency.findUnique({ where: { id: competencyId }, select: { id: true } })
  if (!topic) throw new WeeklyError('Topic not found', 404)
}

/** The question and answer as scoring would send them: both names replaced (D15). */
async function copyOfAnswer(responseId: string): Promise<ItemText> {
  const response = await prisma.weeklyResponse.findUnique({ where: { id: responseId }, include: { prompt: { include: { slot: { select: { competencyId: true } } } } } })
  if (!response) throw new WeeklyError('Answer not found', 404)
  const { prompt } = response
  if (!response.submittedAt || prompt.kind === 'COMMENT' || !prompt.slot) throw new WeeklyError('Only submitted answers to a topic question can be added', 409)
  const { redact } = await redactorFor(prompt.evaluatorId, prompt.evaluateeId)
  return {
    competencyId: prompt.slot.competencyId, question: redact(prompt.textSnapshot),
    situation: redact(response.situation), action: redact(response.action), result: redact(response.result),
    shortfall: response.shortfall ? redact(response.shortfall) : null,
  }
}

async function insert(actor: WeeklyActor, text: ItemText, judgement: Judgement, sourceResponseId: string | null, now: Date): Promise<{ id: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.weeklyCalibrationItem.create({
        data: {
          ...text, hrSufficiency: judgement.hrSufficiency, hrScore: judgement.hrScore, note: judgement.note?.trim() || null,
          sourceResponseId, createdById: actor.id, createdAt: now, updatedAt: now,
        },
      })
      await recordAudit(tx, {
        actorId: actor.id, actorRole: 'HR', action: 'CALIBRATION_ITEM_ADD', objectType: 'WeeklyCalibrationItem', objectId: item.id,
        after: { competencyId: item.competencyId, hrSufficiency: item.hrSufficiency, hrScore: item.hrScore, sourceResponseId },
      })
      return { id: item.id }
    })
  } catch (error) {
    // Two HR users adding the same answer at once: the unique index decides, after the transaction has rolled back.
    if (isUniqueViolation(error)) throw new WeeklyError(ALREADY_IN_SET, 409)
    throw error
  }
}

export async function addCalibrationItem(actor: WeeklyActor, input: CalibrationItemInput, now: Date): Promise<{ id: string }> {
  assertHr(actor)
  checkJudgement(input)
  if (input.source === 'answer') {
    const existing = await prisma.weeklyCalibrationItem.findUnique({ where: { sourceResponseId: input.responseId }, select: { id: true } })
    if (existing) throw new WeeklyError(ALREADY_IN_SET, 409)
    return insert(actor, await copyOfAnswer(input.responseId), input, input.responseId, now)
  }
  await assertTopic(input.competencyId)
  const { competencyId, question, situation, action, result } = input
  return insert(actor, { competencyId, question, situation, action, result, shortfall: input.shortfall?.trim() || null }, input, null, now)
}

const snapshot = (item: WeeklyCalibrationItem) => ({
  competencyId: item.competencyId, question: item.question, situation: item.situation, action: item.action, result: item.result,
  shortfall: item.shortfall, hrSufficiency: item.hrSufficiency, hrScore: item.hrScore, note: item.note, archivedAt: item.archivedAt,
})
const UPDATE_ACTIONS = { edit: 'CALIBRATION_ITEM_EDIT', archive: 'CALIBRATION_ITEM_ARCHIVE', restore: 'CALIBRATION_ITEM_RESTORE' } as const

/** Archived items are left out of new runs; runs already started keep their copy of the target. */
export async function updateCalibrationItem(actor: WeeklyActor, id: string, input: CalibrationItemUpdate, now: Date): Promise<void> {
  assertHr(actor)
  const item = await prisma.weeklyCalibrationItem.findUnique({ where: { id } })
  if (!item) throw new WeeklyError('Calibration item not found', 404)
  if (input.op === 'edit') {
    checkJudgement(input)
    if (input.competencyId !== item.competencyId) await assertTopic(input.competencyId)
  }
  const data = input.op === 'edit'
    ? {
        competencyId: input.competencyId, question: input.question, situation: input.situation, action: input.action, result: input.result,
        shortfall: input.shortfall?.trim() || null, hrSufficiency: input.hrSufficiency, hrScore: input.hrScore, note: input.note?.trim() || null, updatedAt: now,
      }
    : { archivedAt: input.op === 'archive' ? now : null, updatedAt: now }
  await prisma.$transaction(async (tx) => {
    await tx.weeklyCalibrationItem.update({ where: { id }, data })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: UPDATE_ACTIONS[input.op], objectType: 'WeeklyCalibrationItem', objectId: id, before: snapshot(item), after: data })
  })
}

export async function calibrationItemsView(actor: WeeklyActor): Promise<CalibrationItemsResponse> {
  assertHr(actor)
  const items = await prisma.weeklyCalibrationItem.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  const [topics, itemTopics] = await Promise.all([
    prisma.weeklyCompetency.findMany({
      where: { isActive: true, profiles: { some: { status: 'APPROVED' } } },
      select: { id: true, name: true, perspective: true }, orderBy: [{ perspective: 'asc' }, { name: 'asc' }],
    }),
    prisma.weeklyCompetency.findMany({ where: { id: { in: [...new Set(items.map((i) => i.competencyId))] } }, select: { id: true, name: true, perspective: true } }),
  ])
  const byId = new Map(itemTopics.map((t) => [t.id, t]))
  const views = items.map((item): CalibrationItemView => {
    const topic = byId.get(item.competencyId)
    return {
      id: item.id, competencyId: item.competencyId, topic: topic?.name ?? 'Unknown topic', perspective: topic?.perspective ?? 'PEER',
      question: item.question, situation: item.situation, action: item.action, result: item.result, shortfall: item.shortfall,
      hrSufficiency: item.hrSufficiency === 'INSUFFICIENT' ? 'INSUFFICIENT' : 'SUFFICIENT', hrScore: item.hrScore, note: item.note,
      fromAnswer: item.sourceResponseId !== null, archived: item.archivedAt !== null, updatedAt: item.updatedAt.toISOString(),
    }
  })
  const active = views.filter((v) => !v.archived)
  return { items: [...active, ...views.filter((v) => v.archived)], active: active.length, needed: CALIBRATION_MIN_ITEMS, topics }
}
