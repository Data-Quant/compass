// The one scoring call, shared by live scoring and calibration runs, so a calibrated model is judged on exactly what it will do.
import { ModelError, type ModelResult, type StructuredModel } from './model'
import {
  buildScoringMessages, finalizeScore, SCORING_JSON_SCHEMA, SCORING_SCHEMA_NAME, scoringOutputSchema, type FinalScore, type ScoreFlag, type ScoringInput,
} from './scoring-prompt'

export interface ScoredOnce { final: FinalScore; usage: ModelResult; latencyMs: number }

/** Messages → model → schema check → finalize. Throws ModelError (INVALID_OUTPUT when the output does not fit the schema). */
export async function scoreOnce(model: StructuredModel, input: ScoringInput, systemFlags: readonly ScoreFlag[]): Promise<ScoredOnce> {
  const messages = buildScoringMessages(input)
  const started = Date.now()
  const usage = await model.complete({ ...messages, schemaName: SCORING_SCHEMA_NAME, schema: SCORING_JSON_SCHEMA })
  const latencyMs = Date.now() - started
  const parsed = scoringOutputSchema.safeParse(usage.value)
  if (!parsed.success) throw new ModelError('INVALID_OUTPUT')
  const answer = input.answer
  const answerText = [answer.situation, answer.action, answer.result, answer.shortfall].filter(Boolean).join('\n')
  return { final: finalizeScore(parsed.data, answerText, systemFlags), usage, latencyMs }
}
