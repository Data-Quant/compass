// Expands a question and HR's (or a lead's) 1–4 descriptions into two example-based questions and a
// four-level profile, following the spec's pattern. HR reviews and approves the result.
import { z } from 'zod'
import type { CompetencyContent } from '../content/drafts'
import type { Perspective } from '../perspectives'
import { LEVEL_KEYS, parseProfileLevels, type LevelKey } from '../profile'

export const DRAFT_SCHEMA_NAME = 'weekly_profile_draft'

const LEVEL_SCHEMA = {
  type: 'object',
  properties: { behaviours: { type: 'string' }, consistency: { type: 'string' }, outcome: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } },
  required: ['behaviours', 'consistency', 'outcome', 'evidence'],
  additionalProperties: false,
} as const

export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    definition: { type: 'string' },
    promptA: { type: 'string' },
    promptB: { type: 'string' },
    levels: { type: 'object', properties: { '1': LEVEL_SCHEMA, '2': LEVEL_SCHEMA, '3': LEVEL_SCHEMA, '4': LEVEL_SCHEMA }, required: ['1', '2', '3', '4'], additionalProperties: false },
  },
  required: ['definition', 'promptA', 'promptB', 'levels'],
  additionalProperties: false,
} as const

const DRAFT_SYSTEM_PROMPT = [
  'You help HR turn one performance-evaluation question into weekly, evidence-based questions and a four-level profile.',
  'Scale: 4 Transforming The Business (changed an outcome, process or standard beyond their remit, repeatable), 3 Exceeds Expectations (consistently above what the role requires, others rely on them), 2 Meets Expectations (fully does what the role requires with normal guidance), 1 Does Not Meet Expectations (falls short often enough to affect others; needs repeated correction).',
  'promptA asks for one specific recent situation, what the person did and what happened. promptB asks about a time it fell short. Never mention levels, ratings or scores in the prompts.',
  'For each level write behaviours, consistency, outcome and one or two short example quotes of evidence that fits that level. Where HR supplied a description for a level, keep its meaning.',
  'Respond with JSON only, matching the schema.',
].join(' ')

export function buildDraftMessages(input: { topic: string; perspective: Perspective; descriptions: Record<LevelKey, string | null> }): { system: string; user: string } {
  return { system: DRAFT_SYSTEM_PROMPT, user: JSON.stringify({ topic: input.topic, evaluatorPerspective: input.perspective, hrDescriptions: input.descriptions }) }
}

const draftOutputSchema = z.object({
  definition: z.string().trim().min(3).max(500),
  promptA: z.string().trim().min(20).max(600),
  promptB: z.string().trim().min(20).max(600),
  levels: z.unknown(),
})

export function parseDraftOutput(raw: unknown, topic: string): CompetencyContent | null {
  const parsed = draftOutputSchema.safeParse(raw)
  if (!parsed.success) return null
  const levels = parseProfileLevels(parsed.data.levels)
  if (!levels || LEVEL_KEYS.some((key) => !levels[key].behaviours)) return null
  return { name: topic, definition: parsed.data.definition, prompts: { A: parsed.data.promptA, B: parsed.data.promptB }, levels, incomplete: false }
}
