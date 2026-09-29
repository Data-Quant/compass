import test from 'node:test'
import assert from 'node:assert/strict'
import { DRAFTS, findDraft, normalizeTitle, STANDARD_LEVELS } from '../lib/weekly/content/drafts'
import { draftFromDescriptions } from '../lib/weekly/content/templates'
import { LEVEL_KEYS, parseProfileLevels } from '../lib/weekly/profile'

test('the ten spec drafts are complete and valid profiles', () => {
  assert.equal(DRAFTS.length, 10)
  assert.deepEqual(DRAFTS.map((d) => d.perspective).filter((p, i, all) => all.indexOf(p) === i), ['LEAD', 'UPWARD', 'PEER'])
  for (const draft of DRAFTS) {
    assert.ok(parseProfileLevels(draft.levels), `${draft.key} levels are valid`)
    for (const key of LEVEL_KEYS) assert.ok(draft.levels[key].evidence.length >= 1, `${draft.key} level ${key} has an example`)
    assert.equal(draft.incomplete, false)
  }
})

test('questions never mention levels, ratings or scale labels', () => {
  const banned = /\b(level|rating|score|exceeds|meets expectations|transforming)\b/i
  for (const draft of DRAFTS) {
    assert.doesNotMatch(draft.prompts.A, banned, draft.key)
    assert.doesNotMatch(draft.prompts.B, banned, draft.key)
  }
})

test('live questions match drafts by title within the same perspective', () => {
  assert.equal(normalizeTitle(' Initiative &  Proactivity! '), 'initiative and proactivity')
  assert.equal(findDraft('LEAD', 'Quality of Work')?.key, 'LEAD.QUALITY_OF_WORK')
  assert.equal(findDraft('LEAD', 'initiative and proactivity')?.key, 'LEAD.INITIATIVE')
  assert.equal(findDraft('PEER', 'Communication')?.key, 'PEER.COMMUNICATION')
  assert.equal(findDraft('UPWARD', 'Communication'), null)
  assert.equal(findDraft('UPWARD', 'Clarity in Communication')?.key, 'UPWARD.CLARITY')
})

test('a question without a draft is drafted from HR descriptions, falling back to the standard', () => {
  const content = draftFromDescriptions({ questionText: 'Client Communication', descriptions: { '1': 'Clients chase for updates.', '2': '', '3': null, '4': 'Clients cite their updates as a model.' } })
  assert.equal(content.name, 'Client Communication')
  assert.equal(content.incomplete, true)
  assert.equal(content.levels['1'].behaviours, 'Clients chase for updates.')
  assert.equal(content.levels['2'].behaviours, STANDARD_LEVELS['2'].behaviours)
  assert.equal(content.levels['4'].behaviours, 'Clients cite their updates as a model.')
  assert.ok(parseProfileLevels(content.levels))
  assert.match(content.prompts.A, /Client Communication/)
  const complete = draftFromDescriptions({ questionText: 'Ownership', descriptions: { '1': 'a', '2': 'b', '3': 'c', '4': 'd' } })
  assert.equal(complete.incomplete, false)
})
