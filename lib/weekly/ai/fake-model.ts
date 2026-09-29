// Deterministic stand-in for the model: local tests and preview runs with WEEKLY_AI_FAKE=true.
import { STANDARD_LEVELS } from '../content/drafts'
import { DRAFT_SCHEMA_NAME } from './drafting'
import { SCORING_SCHEMA_NAME, type ScoringOutput } from './scoring-prompt'

function firstSentence(text: string): string {
  return text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? ''
}

export function fakeScore(answerText: string): ScoringOutput {
  const text = answerText.toLowerCase()
  if (/best person on the team|everyone loves|always amazing/.test(text)) {
    return {
      sufficiency: 'INSUFFICIENT', score: null, confidence: 'HIGH', criteriaMet: [], criteriaNotDemonstrated: ['No specific situation, action or result'],
      evidenceQuotes: [], rationale: 'Praise without a concrete example.', flags: ['GENERIC_PRAISE'],
      followUpPrompt: 'Could you describe one specific recent example of what they did and what happened?',
    }
  }
  const score = /other teams|now the standard|adopted/.test(text) ? 4 : /\bchase|slipped|\brebuil|\bredo\b|\blate\b/.test(text) ? 1 : /without being asked|went beyond/.test(text) ? 3 : 2
  const quote = firstSentence(answerText)
  return {
    sufficiency: 'SUFFICIENT', score, confidence: score === 2 ? 'HIGH' : 'MEDIUM', criteriaMet: ['Describes a specific situation and its result'],
    criteriaNotDemonstrated: [], evidenceQuotes: quote ? [quote] : [], rationale: `Stand-in model: level ${score}.`, followUpPrompt: null,
    flags: /health|hospital|medical/.test(text) ? ['SENSITIVE_CONTENT'] : [],
  }
}

/** Mirrors StructuredModel.complete for the two operations the module uses. */
export function fakeComplete(request: { system: string; user: string; schemaName: string; schema: object }): unknown {
  const body = JSON.parse(request.user) as Record<string, unknown>
  if (request.schemaName === SCORING_SCHEMA_NAME) {
    const answer = (body.answer ?? {}) as Record<string, string>
    return fakeScore([answer.situation, answer.whatTheyDid, answer.result, answer.whatDidNotGoWell].filter(Boolean).join('\n'))
  }
  if (request.schemaName === DRAFT_SCHEMA_NAME) {
    const topic = String(body.topic ?? 'this topic')
    return {
      definition: topic,
      promptA: `Describe a recent, specific situation that shows “${topic}”. What did they do, and what happened as a result?`,
      promptB: `Describe a time “${topic}” fell short of what you expected. What was missing, and how did they respond?`,
      levels: { '1': { ...STANDARD_LEVELS['1'], evidence: ['Example one.'] }, '2': { ...STANDARD_LEVELS['2'], evidence: ['Example two.'] }, '3': { ...STANDARD_LEVELS['3'], evidence: ['Example three.'] }, '4': { ...STANDARD_LEVELS['4'], evidence: ['Example four.'] } },
    }
  }
  throw new Error(`The fake model does not support ${request.schemaName}`)
}
