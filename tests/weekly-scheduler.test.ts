import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_WEEKS_WITHOUT_ASKING, nextVariant, WEEKLY_QUESTION_CAP, pickTopic, planWeek, QUESTIONS_PER_PAIR,
  type SchedulablePair, type SchedulableTopic, type WeekPlanInput,
} from '../lib/weekly/scheduler'

const pair = (key: string, overrides: Partial<SchedulablePair> = {}): SchedulablePair => ({
  key, asked: 0, lastAskedWeek: null, hasOpenPrompt: false, hasAskableTopic: true, ...overrides,
})
const pairs = (n: number) => Array.from({ length: n }, (_, i) => pair(`p${String(i).padStart(2, '0')}`))
const input = (list: SchedulablePair[], overrides: Partial<WeekPlanInput> = {}): WeekPlanInput => ({ week: 1, totalWeeks: 14, seed: 'cycle|evaluator', pairs: list, ...overrides })

/** Runs a whole quarter for one evaluator who answers every question the week it arrives. */
function simulate(n: number, totalWeeks = 14, seed = 'cycle|evaluator') {
  let state = pairs(n)
  const weeks: string[][] = []
  for (let week = 1; week <= totalWeeks; week += 1) {
    const chosen = planWeek({ week, totalWeeks, seed, pairs: state })
    weeks.push(chosen)
    state = state.map((p) => (chosen.includes(p.key) ? { ...p, asked: p.asked + 1, lastAskedWeek: week } : p))
  }
  const asksOf = (key: string) => weeks.flatMap((chosen, i) => (chosen.includes(key) ? [i + 1] : []))
  return { weeks, state, asksOf }
}

test('each pair gets five questions a quarter, spread over the twelve question weeks (5y = x, x / 12 a week)', () => {
  const { weeks, state } = simulate(7)
  assert.equal(QUESTIONS_PER_PAIR, 5)
  assert.ok(state.every((p) => p.asked === 5), 'five each')
  const perWeek = weeks.slice(0, 12).map((w) => w.length)
  assert.equal(perWeek.reduce((a, b) => a + b, 0), 35)
  assert.ok(perWeek.every((count) => count >= 2 && count <= 4), `about 35 / 12 a week, got ${perWeek.join(',')}`)
  assert.deepEqual(weeks.slice(12), [[], []], 'nothing left for the catch-up weeks')
})

test('every person comes up at least once every three weeks', () => {
  for (const n of [1, 2, 3, 7, 12, 25]) {
    const { asksOf } = simulate(n)
    for (const key of pairs(n).map((p) => p.key)) {
      const asks = asksOf(key)
      assert.equal(asks.length, 5, `${n} pairs: ${key} asked ${asks.length} times`)
      const gaps = [asks[0], ...asks.slice(1).map((w, i) => w - asks[i])]
      assert.ok(gaps.every((gap) => gap <= MAX_WEEKS_WITHOUT_ASKING), `${n} pairs: ${key} asked in weeks ${asks.join(',')}`)
      assert.ok(12 - asks[4] < MAX_WEEKS_WITHOUT_ASKING, `${n} pairs: ${key} last asked in week ${asks[4]}`)
    }
  }
})

test('one question about a person per week, and who comes first is random per evaluator', () => {
  const { weeks } = simulate(7)
  assert.ok(weeks.every((chosen) => new Set(chosen).size === chosen.length))
  const firstWeeks = ['a', 'b', 'c', 'd', 'e'].map((seed) => planWeek(input(pairs(7), { seed })).join(','))
  assert.ok(new Set(firstWeeks).size > 1, 'different evaluators start with different people')
  assert.deepEqual(planWeek(input(pairs(7))), planWeek(input(pairs(7))), 'the same evaluator gets the same plan every time')
})

test('people not asked recently come first', () => {
  // Week 4: ceil(10 * 4 / 12) = 4 due, 3 asked, so one question.
  const list = [pair('recent', { asked: 2, lastAskedWeek: 3 }), pair('waiting', { asked: 1, lastAskedWeek: 2 })]
  assert.deepEqual(planWeek(input(list, { week: 4 })), ['waiting'])
})

test('a person not asked for three weeks is asked even when the weekly number is already met', () => {
  const list = [pair('a', { asked: 2, lastAskedWeek: 3 }), pair('b', { asked: 2, lastAskedWeek: 3 }), pair('c', { asked: 1, lastAskedWeek: 1 })]
  // Week 4 of 12: ceil(15 * 4 / 12) = 5 questions due, 5 already asked; c's three weeks are up.
  assert.deepEqual(planWeek(input(list, { week: 4 })), ['c'])
})

test('a person with an open question, five questions already, or no topic left is not asked', () => {
  const list = [
    pair('open', { hasOpenPrompt: true }),
    pair('done', { asked: QUESTIONS_PER_PAIR, lastAskedWeek: 1 }),
    pair('no-topic', { hasAskableTopic: false }),
    pair('ready'),
  ]
  assert.deepEqual(planWeek(input(list, { week: 12 })), ['ready'])
})

test('nothing is released outside the cycle, and catch-up weeks ask what is left', () => {
  assert.deepEqual(planWeek(input(pairs(3), { week: 0 })), [])
  assert.deepEqual(planWeek(input(pairs(3), { week: 15 })), [])
  const behind = pairs(3).map((p) => ({ ...p, asked: 4, lastAskedWeek: 12 }))
  assert.equal(planWeek(input(behind, { week: 13 })).length, 3)
})

test('within a person, the topic asked least comes next; closed, cancelled and snoozed topics are skipped', () => {
  const topic = (id: string, overrides: Partial<SchedulableTopic> = {}): SchedulableTopic => ({ id, status: 'OPEN', asked: 0, snoozedUntilWeek: null, ...overrides })
  assert.equal(pickTopic([topic('twice', { asked: 2 }), topic('once', { asked: 1 })], 5, 's'), 'once')
  assert.equal(pickTopic([topic('covered', { status: 'SATISFIED' }), topic('open')], 5, 's'), 'open')
  assert.equal(pickTopic([topic('covered', { status: 'SATISFIED', asked: 1 })], 5, 's'), 'covered', 'a covered topic can take a second answer')
  const skipped = [topic('closed', { status: 'CLOSED_NOT_OBSERVED' }), topic('gone', { status: 'CANCELLED' }), topic('snoozed', { snoozedUntilWeek: 6 })]
  assert.equal(pickTopic(skipped, 5, 's'), null)
  assert.equal(pickTopic(skipped, 6, 's'), 'snoozed')
})

test('prompt variants rotate: the least-used variant first, A before B', () => {
  const variants = [{ id: 'a', variant: 'A' }, { id: 'b', variant: 'B' }]
  assert.equal(nextVariant(variants, [])?.id, 'a')
  assert.equal(nextVariant(variants, ['a'])?.id, 'b')
  assert.equal(nextVariant(variants, ['a', 'b'])?.id, 'a')
  assert.equal(nextVariant([], []), null)
})

test('someone added mid-quarter gets their five questions over the weeks HR gave them, starting then', () => {
  // Week 7 of 12: HR added a new team member with 6 weeks left.
  let state = [...pairs(3).map((p) => ({ ...p, asked: 3, lastAskedWeek: 6 })), pair('new', { window: { startWeek: 7, weeks: 6 } })]
  assert.deepEqual(planWeek(input([pair('new', { window: { startWeek: 7, weeks: 6 } })], { week: 6 })), [], 'nothing before the start week')
  const asks: number[] = []
  for (let week = 7; week <= 12; week += 1) {
    const chosen = planWeek(input(state, { week }))
    if (chosen.includes('new')) asks.push(week)
    state = state.map((p) => (chosen.includes(p.key) ? { ...p, asked: p.asked + 1, lastAskedWeek: week } : p))
  }
  assert.equal(asks.length, 5, `asked in weeks ${asks.join(',')}`)
  assert.ok(asks[0] <= 7 + MAX_WEEKS_WITHOUT_ASKING - 1)
})

test('an evaluator gets at most 5 new questions a week when the quarter allows it', () => {
  assert.equal(WEEKLY_QUESTION_CAP, 5)
  for (const n of [10, 12]) {
    const { weeks, state } = simulate(n)
    assert.ok(weeks.every((w) => w.length <= 5), `${n} people: ${weeks.map((w) => w.length).join(',')}`)
    assert.ok(state.every((p) => p.asked === 5), `${n} people: everyone still gets five`)
  }
})

test('when 5 a week cannot cover everyone, a week holds only as many as it takes to finish', () => {
  // 15 people need 75 questions in 12 question weeks: 6.25 a week, so 7 at most.
  const { weeks, state } = simulate(15)
  assert.ok(state.every((p) => p.asked === 5), 'everyone gets five')
  const most = Math.max(...weeks.map((w) => w.length))
  assert.ok(most > 5 && most <= 7, `at most 7 a week, got ${weeks.map((w) => w.length).join(',')}`)
})

test('questions carried over count toward the 5 a week, so the week is never doubled (section 8)', () => {
  // Four people still have an open question from earlier weeks: only one new question fits.
  // 10 people (46 questions still owed over 11 weeks) fit in 5 a week, so the plain cap applies.
  const list = [...pairs(10).slice(0, 4).map((p) => ({ ...p, asked: 1, lastAskedWeek: 1, hasOpenPrompt: true })), ...pairs(10).slice(4)]
  assert.equal(planWeek(input(list, { week: 2 })).length, 1)
})

test('the same topic is not asked about the same person within 3 weeks (section 8)', () => {
  const topic = (id: string, overrides: Partial<SchedulableTopic> = {}): SchedulableTopic => ({ id, status: 'OPEN', asked: 0, snoozedUntilWeek: null, ...overrides })
  const recent = topic('recent', { asked: 1, lastAskedWeek: 4 })
  assert.equal(pickTopic([recent], 5, 's'), null, 'one week later')
  assert.equal(pickTopic([recent], 6, 's'), null, 'two weeks later')
  assert.equal(pickTopic([recent], 7, 's'), 'recent', 'three weeks later')
  assert.equal(pickTopic([recent, topic('other', { asked: 1, lastAskedWeek: 1 })], 5, 's'), 'other')
})
