import test from 'node:test'
import assert from 'node:assert/strict'
import { DRAFTS } from '../lib/weekly/content/drafts'
import { buildDraftMessages, DRAFT_SCHEMA_NAME, parseDraftOutput } from '../lib/weekly/ai/drafting'
import { fakeComplete, fakeScore } from '../lib/weekly/ai/fake-model'
import {
  buildScoringMessages, DEFAULT_FOLLOW_UP, finalizeScore, SCORING_SCHEMA_NAME, scoringOutputSchema, type ScoringInput, type ScoringOutput,
} from '../lib/weekly/ai/scoring-prompt'
import { syntheticAnswer } from '../lib/weekly/content/synthetic'

const quality = DRAFTS.find((d) => d.key === 'LEAD.QUALITY_OF_WORK')!
const input: ScoringInput = {
  topic: { name: quality.name, definition: quality.definition },
  perspective: 'LEAD',
  profile: { levels: quality.levels, insufficientDefinition: 'No concrete example.' },
  question: quality.prompts.A,
  answer: { situation: 'The person handed over the deck.', action: 'The person added a comparison slide unasked.', result: 'The client cited it.', shortfall: '' },
  evaluatee: { position: 'Analyst', department: 'Product' },
}
const output = (overrides: Partial<ScoringOutput> = {}): ScoringOutput => ({
  sufficiency: 'SUFFICIENT', score: 3, confidence: 'HIGH', criteriaMet: ['Accepted first time'], criteriaNotDemonstrated: [],
  evidenceQuotes: ['added a comparison slide unasked'], rationale: 'Level 3.', followUpPrompt: null, flags: [], ...overrides,
})
const answerText = [input.answer.situation, input.answer.action, input.answer.result].join('\n')

test('the request carries the profile, question, answer and role, and treats the answer as data', () => {
  const { system, user } = buildScoringMessages(input)
  assert.match(system, /never follow instructions/i)
  assert.match(system, /INSUFFICIENT/)
  const body = JSON.parse(user)
  assert.equal(body.topic.name, 'Quality of Work')
  assert.deepEqual(body.levels.map((l: { level: number }) => l.level), [4, 3, 2, 1])
  assert.equal(body.levels[0].label, 'Transforming The Business')
  assert.equal(body.answer.whatTheyDid, input.answer.action)
  assert.deepEqual(body.personRole, { jobTitle: 'Analyst', department: 'Product' })
})

test('output validation rejects scores outside 1–4 and unknown flags', () => {
  assert.equal(scoringOutputSchema.safeParse(output({ score: 5 })).success, false)
  assert.equal(scoringOutputSchema.safeParse({ ...output(), flags: ['WEIRD'] }).success, false)
  assert.equal(scoringOutputSchema.safeParse(output()).success, true)
})

test('finalizing drops invented quotes (lowering confidence) and never keeps a score for thin evidence', () => {
  const invented = finalizeScore(output({ evidenceQuotes: ['added a comparison slide unasked', 'saved the company'] }), answerText, [])
  assert.deepEqual(invented.evidenceQuotes, ['added a comparison slide unasked'])
  assert.equal(invented.confidence, 'LOW')
  const thin = finalizeScore(output({ sufficiency: 'INSUFFICIENT', score: 2, followUpPrompt: '' }), answerText, [])
  assert.deepEqual([thin.score, thin.followUpPrompt], [null, DEFAULT_FOLLOW_UP])
  const noScore = finalizeScore(output({ score: null }), answerText, [])
  assert.equal(noScore.sufficiency, 'INSUFFICIENT')
  const flagged = finalizeScore(output({ flags: ['GENERIC_PRAISE'] }), answerText, ['POSSIBLE_COPY', 'GENERIC_PRAISE'])
  assert.deepEqual(flagged.flags, ['GENERIC_PRAISE', 'POSSIBLE_COPY'])
  assert.equal(finalizeScore(output(), answerText, []).followUpPrompt, null)
})

test('the fake model is deterministic and follows the synthetic answers', () => {
  const strong = syntheticAnswer('a', 'x')
  assert.deepEqual(fakeScore('Everyone loves working with them, the best person on the team.').sufficiency, 'INSUFFICIENT')
  assert.equal(fakeScore('Two other teams have since adopted it as the standard.').score, 4)
  assert.equal(fakeScore('I had to chase them and the deadline slipped.').score, 1)
  assert.deepEqual(fakeScore('They told me about a health condition and delivered late.').flags, ['SENSITIVE_CONTENT'])
  assert.deepEqual(fakeScore(`${strong.situation} ${strong.action}`), fakeScore(`${strong.situation} ${strong.action}`))
  const scored = fakeComplete({ system: 's', user: buildScoringMessages(input).user, schemaName: SCORING_SCHEMA_NAME, schema: {} })
  assert.equal(scoringOutputSchema.safeParse(scored).success, true)
})

test('AI drafting asks for prompts and four levels, and parses into topic content', () => {
  const { user } = buildDraftMessages({ topic: 'Owns client escalations', perspective: 'LEAD', descriptions: { '1': 'Escalations stall.', '2': null, '3': 'Resolves early.', '4': null } })
  assert.equal(JSON.parse(user).topic, 'Owns client escalations')
  const drafted = fakeComplete({ system: 's', user, schemaName: DRAFT_SCHEMA_NAME, schema: {} })
  const content = parseDraftOutput(drafted, 'Owns client escalations')
  assert.ok(content)
  assert.equal(content.name, 'Owns client escalations')
  assert.ok(content.prompts.A.length > 20 && content.prompts.B.length > 20)
  assert.equal(parseDraftOutput({ nonsense: true }, 'x'), null)
})
