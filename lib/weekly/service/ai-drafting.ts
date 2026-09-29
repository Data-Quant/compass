import { prisma } from '@/lib/db'
import { buildDraftMessages, DRAFT_JSON_SCHEMA, DRAFT_SCHEMA_NAME, parseDraftOutput } from '../ai/drafting'
import { ModelError, type StructuredModel } from '../ai/model'
import { INSUFFICIENT_DEFINITION } from '../content/drafts'
import type { LevelKey } from '../profile'
import { recordAudit } from './audit'
import { descriptionsOf, saveProfileDraft } from './content'
import { assertHr, type WeeklyActor } from './context'
import { WeeklyError } from './errors'

const NO_DESCRIPTIONS: Record<LevelKey, string | null> = { '1': null, '2': null, '3': null, '4': null }

/** Spec 4.3: the AI expands HR's (or a lead's) 1–4 descriptions into two questions and a profile. HR reviews and approves it. */
export async function draftTopicWithAi(actor: WeeklyActor, competencyId: string, model: StructuredModel | null): Promise<{ profileId: string; version: number }> {
  assertHr(actor)
  const competency = await prisma.weeklyCompetency.findUnique({ where: { id: competencyId } })
  if (!competency) throw new WeeklyError('Topic not found', 404)
  if (!model) throw new WeeklyError('The AI model is not configured', 503)
  const source =
    (competency.sourceQuestionId ? await prisma.evaluationQuestion.findUnique({ where: { id: competency.sourceQuestionId } }) : null) ??
    (competency.sourceLeadQuestionId ? await prisma.preEvaluationLeadQuestion.findUnique({ where: { id: competency.sourceLeadQuestionId } }) : null)
  const messages = buildDraftMessages({ topic: competency.name, perspective: competency.perspective, descriptions: source ? descriptionsOf(source) : NO_DESCRIPTIONS })
  let value: unknown
  try {
    value = (await model.complete({ ...messages, schemaName: DRAFT_SCHEMA_NAME, schema: DRAFT_JSON_SCHEMA })).value
  } catch (error) {
    if (error instanceof ModelError) throw new WeeklyError('The AI could not draft this topic right now. Try again in a minute.', 502)
    throw error
  }
  const content = parseDraftOutput(value, competency.name)
  if (!content) throw new WeeklyError('The AI returned an unusable draft. Try again, or edit the profile by hand.', 502)
  const profile = await saveProfileDraft(actor, competencyId, { levels: content.levels, insufficientDefinition: INSUFFICIENT_DEFINITION })
  await prisma.$transaction(async (tx) => {
    for (const [variant, text] of [['A', content.prompts.A], ['B', content.prompts.B]] as const) {
      await tx.weeklyCompetencyPrompt.upsert({ where: { competencyId_variant: { competencyId, variant } }, create: { competencyId, variant, text }, update: { text } })
    }
    await tx.weeklyCompetency.update({ where: { id: competencyId }, data: { definition: content.definition } })
    await recordAudit(tx, {
      actorId: actor.id, actorRole: 'HR', action: 'PROFILE_AI_DRAFT', objectType: 'WeeklyProfile', objectId: profile.id,
      after: { version: profile.version, model: model.name, promptA: content.prompts.A, promptB: content.prompts.B },
    })
  })
  return { profileId: profile.id, version: profile.version }
}
