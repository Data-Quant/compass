import test from 'node:test'
import assert from 'node:assert/strict'
import { levelMeaning } from '../lib/weekly/levels'
import { sameDepartment } from '../lib/weekly/departments'
import { STANDARD_MCQ_BANK } from '../lib/weekly/content/mcq-bank'
import { fourRatingLimit, MCQ_LEVELS, noteRequired, optionsProblem, personalise, shuffleOptions, withOptionIds } from '../lib/weekly/mcq'

const eight = (scores: number[]) => scores.map((score, i) => ({ text: `Statement ${i}`, score }))
const VALID = eight([1, 1.5, 2, 2.5, 2.5, 3, 3.5, 4])

test('a question has 8 statements covering every level from 1 to 4 in half points', () => {
  assert.equal(optionsProblem(VALID), null)
  assert.match(optionsProblem(VALID.slice(0, 7)) ?? '', /8 statements/)
  assert.match(optionsProblem(eight([1, 1.5, 2, 2.5, 2.5, 3, 3, 4])) ?? '', /3\.5/)
  assert.match(optionsProblem(eight([1, 1.5, 2, 2.5, 2.7, 3, 3.5, 4])) ?? '', /half points/)
  assert.match(optionsProblem([...VALID.slice(0, 7), { text: '  ', score: 4 }]) ?? '', /empty/)
  assert.deepEqual(MCQ_LEVELS, [1, 1.5, 2, 2.5, 3, 3.5, 4])
})

test('the standard bank is valid: every question passes the same check HR edits do', () => {
  assert.ok(STANDARD_MCQ_BANK.length >= 20)
  for (const topic of STANDARD_MCQ_BANK) for (const q of topic.questions) assert.equal(optionsProblem(q.options), null, `${topic.key}: ${q.text}`)
  const keys = STANDARD_MCQ_BANK.map((t) => t.key)
  assert.equal(new Set(keys).size, keys.length)
})

test('a note is required for 1, 1.5 and 4 only', () => {
  assert.deepEqual(MCQ_LEVELS.filter(noteRequired), [1, 1.5, 4])
})

test('statements are shuffled per seed, the same way every time, and keep their ids', () => {
  const options = withOptionIds(VALID)
  const a = shuffleOptions(options, 'prompt-1')
  assert.deepEqual(shuffleOptions(options, 'prompt-1'), a)
  assert.deepEqual([...a].sort((x, y) => x.id.localeCompare(y.id)), [...options].sort((x, y) => x.id.localeCompare(y.id)))
  const orders = new Set(['p1', 'p2', 'p3', 'p4', 'p5'].map((seed) => shuffleOptions(options, seed).map((o) => o.id).join()))
  assert.ok(orders.size > 1, 'different questions get different orders')
  assert.equal(new Set(options.map((o) => o.id)).size, 8)
})

test('the 4-rating limit is 10% of the questions for that relationship, at least 1', () => {
  assert.deepEqual([fourRatingLimit(0), fourRatingLimit(5), fourRatingLimit(19), fourRatingLimit(20), fourRatingLimit(45)], [1, 1, 1, 2, 4])
})

test('[name] becomes the person’s first name', () => {
  assert.equal(personalise('When [name] commits, does [name] deliver?', 'Bilal Ahmed'), 'When Bilal commits, does Bilal deliver?')
})

test('every level has its Compass meaning for HR (section 8)', () => {
  assert.equal(levelMeaning(1.5), 'Below expectations; needs regular follow-up')
  assert.equal(levelMeaning(3.5), 'Exceeds, with impact beyond their own work')
  assert.ok(MCQ_LEVELS.every((l) => levelMeaning(l) !== ''))
})

test('a lead answers 3 common topics (2 questions each) and 2 topics for each department (1 question each) (section 9)', () => {
  const lead = STANDARD_MCQ_BANK.filter((t) => t.perspective === 'LEAD')
  const common = lead.filter((t) => t.departments === null)
  assert.deepEqual(common.map((t) => [t.name, t.questions.length]), [['Quality of Work', 2], ['Initiative & Proactivity', 2], ['Team Collaboration', 2]])
  const byDepartment = new Map<string, string[]>()
  for (const t of lead.filter((x) => x.departments !== null)) {
    assert.equal(t.questions.length, 1, t.name)
    for (const d of t.departments ?? []) byDepartment.set(d, [...(byDepartment.get(d) ?? []), t.key])
  }
  assert.deepEqual(Object.fromEntries(byDepartment), {
    Technology: ['LEAD.DEPT.D1', 'LEAD.DEPT.D2'], 'Human Resources': ['LEAD.DEPT.D3', 'LEAD.DEPT.D4'], Operations: ['LEAD.DEPT.D5', 'LEAD.DEPT.D6'],
    Product: ['LEAD.DEPT.D7', 'LEAD.DEPT.D8'], 'Growth and Strategy': ['LEAD.DEPT.D9', 'LEAD.DEPT.D10'], Design: ['LEAD.DEPT.D11', 'LEAD.DEPT.D12'],
    'Value Creation': ['LEAD.DEPT.D14', 'LEAD.DEPT.D15'], Executive: ['LEAD.DEPT.D14', 'LEAD.DEPT.D15'],
  })
})

test('department names match however they are written: case, spaces, "&" or "and"', () => {
  assert.equal(sameDepartment('Growth and Strategy', 'Growth & Strategy'), true)
  assert.equal(sameDepartment('Growth and Strategy', '  growth AND  strategy '), true)
  assert.equal(sameDepartment('Human Resources', 'HR Ops'), false)
  assert.equal(sameDepartment('Design', null), false)
})
