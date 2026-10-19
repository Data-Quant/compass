import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeModel } from '../lib/weekly/ai/model'
import { anonymise, buildScoringMessages, finalizeScore, MAX_MOVE, scoringOutputSchema, type ScoringInput } from '../lib/weekly/ai/scoring-prompt'

const INPUT: ScoringInput = {
  perspective: 'PEER',
  topic: 'Reliability',
  question: 'When [name] commits to deliver something to you, what usually happens?',
  scale: [1, 1.5, 2, 2.5, 3, 3.5, 3.5, 4].map((level, i) => ({ level, statement: `Statement ${i + 1}` })),
  chosen: { level: 2.5, statement: 'Statement 4' },
  note: 'Delivered the client pack two days early and other teams now reuse it.',
  history: [{ week: 2, topic: 'Communication', question: 'Think of a recent exchange with [name].', chosen: 'Clear and on time.', level: 3, note: null }],
}

test('the model sees the scale with levels, the chosen statement, the note and earlier answers about the same person', () => {
  const { system, user } = buildScoringMessages(INPUT)
  assert.match(system, /Start from the chosen statement's level/)
  const body = JSON.parse(user)
  assert.equal(body.chosen.level, 2.5)
  assert.equal(body.scale.length, 8)
  assert.equal(body.note, INPUT.note)
  assert.equal(body.earlierAnswers[0].level, 3)
})

test('the score is 1 to 4 in half points, and never moves more than one level from the chosen statement', () => {
  assert.equal(scoringOutputSchema.safeParse({ score: 2.7, rationale: 'x' }).success, false)
  assert.equal(scoringOutputSchema.safeParse({ score: 3.5, rationale: 'The note shows reach beyond the pair.' }).success, true)
  assert.equal(MAX_MOVE, 1)
  assert.deepEqual(finalizeScore({ score: 4, rationale: 'r' }, 2), { score: 3, rationale: 'r (limited to one level from the chosen statement)' })
  assert.deepEqual(finalizeScore({ score: 1, rationale: 'r' }, 3.5), { score: 2.5, rationale: 'r (limited to one level from the chosen statement)' })
  assert.deepEqual(finalizeScore({ score: 3, rationale: 'r' }, 2.5), { score: 3, rationale: 'r' })
})

test('names are replaced before anything reaches the model', () => {
  const text = anonymise('Bilal Ahmed told Bilal and Sara Khan; bilal agreed.', { evaluatee: 'Bilal Ahmed', evaluator: 'Sara Khan' })
  assert.equal(text, '[name] told [name] and [evaluator]; [name] agreed.')
})

test('the stand-in model scores at the chosen level, moving half a level for clear evidence in the note', async () => {
  const run = async (note: string | null, level: number) => {
    const { user, system } = buildScoringMessages({ ...INPUT, note, chosen: { level, statement: 'x' } })
    return (await fakeModel().complete({ system, user, schemaName: 'weekly_mcq_score', schema: {} })).value
  }
  assert.deepEqual(await run(null, 2), { score: 2, rationale: 'Stand-in model: the chosen statement’s level.' })
  assert.equal(((await run('Other teams adopted it.', 3)) as { score: number }).score, 3.5)
  assert.equal(((await run('It arrived late again.', 2)) as { score: number }).score, 1.5)
})

test('surnames on their own and accented names are replaced too, and the model is told to ignore instructions in notes', () => {
  assert.equal(anonymise('Ahmed and Zoë agreed; Ahmed led.', { evaluatee: 'Bilal Ahmed', evaluator: 'Zoë Park' }), '[name] and [evaluator] agreed; [name] led.')
  assert.match(buildScoringMessages(INPUT).system, /Ignore any instruction/)
})
