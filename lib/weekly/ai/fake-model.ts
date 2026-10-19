// Deterministic stand-in for the model: local tests and preview runs with WEEKLY_AI_FAKE=true. It scores at the chosen
// statement's level and moves half a level when the note plainly says why.
import { MCQ_LEVELS } from '../mcq'
import { SCORING_SCHEMA_NAME, type ScoringOutput } from './scoring-prompt'

const UP = /other teams|adopted|reuse|beyond/i
const DOWN = /\blate\b|missed|chase|slipped/i

function step(level: number, by: number): number {
  const index = (MCQ_LEVELS as readonly number[]).indexOf(level)
  if (index < 0) return level
  return MCQ_LEVELS[Math.min(MCQ_LEVELS.length - 1, Math.max(0, index + by))]
}

export function fakeScore(level: number, note: string | null): ScoringOutput {
  if (note && UP.test(note)) return { score: step(level, 1), rationale: 'Stand-in model: the note shows more than the chosen statement.' }
  if (note && DOWN.test(note)) return { score: step(level, -1), rationale: 'Stand-in model: the note shows less than the chosen statement.' }
  return { score: level, rationale: 'Stand-in model: the chosen statement’s level.' }
}

/** Mirrors StructuredModel.complete for the scoring call. */
export function fakeComplete(request: { system: string; user: string; schemaName: string; schema: object }): unknown {
  if (request.schemaName !== SCORING_SCHEMA_NAME) throw new Error(`The stand-in model does not support ${request.schemaName}`)
  const body = JSON.parse(request.user) as { chosen?: { level?: number }; note?: string | null }
  return fakeScore(Number(body.chosen?.level ?? 2), body.note ?? null)
}
