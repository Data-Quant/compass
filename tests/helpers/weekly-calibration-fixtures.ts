import type { PrismaClient } from '@prisma/client'
import { ModelError, type ModelRequest, type StructuredModel } from '../../lib/weekly/ai/model'
import { W } from './weekly-test-db'

/** A valid Fireworks-style id for a test double; nothing is ever sent to Fireworks. */
export const SCRIPTED_MODEL = 'accounts/compass-tests/models/scripted'
export const SCRIPTED_TOKENS = { inputTokens: 1000, outputTokens: 100 }
export type ScriptedModel = StructuredModel & { requests: ModelRequest[] }

/**
 * Scores what the answer says it deserves: "[L3]" in the situation gives a 3, "[L0]" not enough evidence, no marker a 2.
 * A situation containing "[fail]" fails with a provider error, the retry included.
 */
export function scriptedModel(name: string = SCRIPTED_MODEL): ScriptedModel {
  const requests: ModelRequest[] = []
  return {
    name,
    requests,
    async complete(request) {
      requests.push(request)
      const situation = String((JSON.parse(request.user) as { answer?: { situation?: string } }).answer?.situation ?? '')
      if (situation.includes('[fail]')) throw new ModelError('PROVIDER_ERROR')
      const level = Number(/\[L([0-4])\]/.exec(situation)?.[1] ?? 2)
      const value = level === 0
        ? { sufficiency: 'INSUFFICIENT', score: null, confidence: 'HIGH', criteriaMet: [], criteriaNotDemonstrated: ['No example'], evidenceQuotes: [], rationale: 'Not enough.', flags: [] }
        : { sufficiency: 'SUFFICIENT', score: level, confidence: 'HIGH', criteriaMet: ['Specific'], criteriaNotDemonstrated: [], evidenceQuotes: [], rationale: `Level ${level}.`, flags: [] }
      return { value, ...SCRIPTED_TOKENS }
    },
  }
}

/** HR's judgement for item i: every fifth has not enough evidence; the rest cycle through 1–4. */
export function judgementFor(index: number): { hrSufficiency: 'SUFFICIENT' | 'INSUFFICIENT'; hrScore: number | null } {
  return index % 5 === 4 ? { hrSufficiency: 'INSUFFICIENT', hrScore: null } : { hrSufficiency: 'SUFFICIENT', hrScore: (index % 4) + 1 }
}

/** `count` active items on one topic. `markerFor(i)` is the level the scripted model will give item i (0 = not enough evidence); by default it agrees with HR. */
export async function seedCalibrationSet(db: PrismaClient, input: { count: number; competencyId: string; markerFor?: (index: number) => number }): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < input.count; i += 1) {
    const judgement = judgementFor(i)
    const marker = input.markerFor ? input.markerFor(i) : judgement.hrScore ?? 0
    const item = await db.weeklyCalibrationItem.create({
      data: {
        competencyId: input.competencyId,
        question: 'Describe a recent situation that shows this topic. What did they do, and what happened?',
        situation: `Item ${i} [L${marker}]: the person took over a client handover when the plan changed.`,
        action: 'They rebuilt the plan and agreed an owner for each deliverable.',
        result: 'The handover finished on the new date.',
        ...judgement, createdById: W.hr.id,
      },
    })
    ids.push(item.id)
  }
  return ids
}

/** A global topic with an approved profile (startedCycle approves every topic). */
export async function approvedTopicId(db: PrismaClient): Promise<string> {
  const topic = await db.weeklyCompetency.findFirstOrThrow({ where: { isActive: true, cycleId: null, profiles: { some: { status: 'APPROVED' } } }, orderBy: { key: 'asc' } })
  return topic.id
}
