import test from 'node:test'
import assert from 'node:assert/strict'
import { ALL_TEAMS, INTERNAL_TEAMS } from '../lib/handbook/teams'
import {
  computeCoverage,
  summarizeCoverage,
  matchGroup,
  type AdminPageInput,
} from '../lib/handbook/coverage'

// Bodies are invented. Real policy text never enters this repo -- it is public.
const base = {
  icon: 'FileText',
  category: 'POLICIES' as const,
  orderIndex: 0,
  linkHref: null,
  linkLabel: null,
  isPublished: true,
  description: null,
  layout: null,
}

// Universal page: one variant, all seven teams.
const universal: AdminPageInput = {
  ...base,
  id: 'p1',
  slug: 'universal',
  title: 'Universal',
  intentionalGapTeams: [],
  variants: [{ id: 'v1', bodyMarkdown: 'BODY_A', orderIndex: 0, audiences: [...ALL_TEAMS] }],
}

// Pakistan-only, with the other six recorded as intentional gaps.
const pakistanOnly: AdminPageInput = {
  ...base,
  id: 'p2',
  slug: 'pakistan-only',
  title: 'Pakistan Only',
  intentionalGapTeams: [
    'MOROCCO',
    'COLOMBIA',
    'INDONESIA',
    'NOBLE',
    'THREE_E_PAKISTAN',
    'THREE_E_MOROCCO',
  ],
  variants: [{ id: 'v2', bodyMarkdown: 'BODY_B', orderIndex: 0, audiences: ['PAKISTAN'] }],
}

// Covers five; two gaps with NO decision recorded -> unreviewed.
const unreviewedGaps: AdminPageInput = {
  ...base,
  id: 'p3',
  slug: 'unreviewed-gaps',
  title: 'Unreviewed Gaps',
  intentionalGapTeams: [],
  variants: [
    {
      id: 'v3',
      bodyMarkdown: 'BODY_C',
      orderIndex: 0,
      audiences: ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
    },
  ],
}

const pages = [universal, pakistanOnly, unreviewedGaps]

test('every row has one cell per team, in ALL_TEAMS order', () => {
  const rows = computeCoverage(pages)
  assert.equal(rows.length, 3)
  for (const row of rows) {
    assert.equal(row.cells.length, 7)
    assert.deepEqual(
      row.cells.map((c) => c.team),
      [...ALL_TEAMS]
    )
  }
})

test('a team addressed by a variant is COVERED and carries that variant id', () => {
  const row = computeCoverage(pages).find((r) => r.slug === 'universal')!
  for (const cell of row.cells) {
    assert.equal(cell.state, 'COVERED')
    assert.equal(cell.variantId, 'v1')
  }
})

test('a gap listed in intentionalGapTeams is INTENTIONAL, not UNREVIEWED', () => {
  const row = computeCoverage(pages).find((r) => r.slug === 'pakistan-only')!
  const pk = row.cells.find((c) => c.team === 'PAKISTAN')!
  const ma = row.cells.find((c) => c.team === 'MOROCCO')!
  assert.equal(pk.state, 'COVERED')
  assert.equal(ma.state, 'INTENTIONAL')
  assert.equal(ma.variantId, null)
})

test('a gap with no decision recorded is UNREVIEWED', () => {
  const row = computeCoverage(pages).find((r) => r.slug === 'unreviewed-gaps')!
  assert.equal(row.cells.find((c) => c.team === 'INDONESIA')!.state, 'UNREVIEWED')
  assert.equal(row.cells.find((c) => c.team === 'NOBLE')!.state, 'UNREVIEWED')
  assert.equal(row.cells.find((c) => c.team === 'PAKISTAN')!.state, 'COVERED')
})

test('COVERED wins over an intentional gap claiming the same team', () => {
  // Contradictory data: a team both addressed and marked as an intentional gap.
  // Reality beats the annotation -- the person can see the content.
  const contradictory: AdminPageInput = {
    ...base,
    id: 'p4',
    slug: 'contradictory',
    title: 'Contradictory',
    intentionalGapTeams: ['PAKISTAN'],
    variants: [{ id: 'v4', bodyMarkdown: 'BODY_D', orderIndex: 0, audiences: ['PAKISTAN'] }],
  }
  const row = computeCoverage([contradictory])[0]
  assert.equal(row.cells.find((c) => c.team === 'PAKISTAN')!.state, 'COVERED')
})

test('summarize counts every cell exactly once', () => {
  const s = summarizeCoverage(computeCoverage(pages))
  assert.equal(s.total, 21) // 3 pages x 7 teams
  assert.equal(s.covered, 7 + 1 + 5)
  assert.equal(s.intentional, 6)
  assert.equal(s.unreviewed, 2)
  assert.equal(s.covered + s.intentional + s.unreviewed, s.total)
})

test('matchGroup recognises EVERYONE and PLUTUS21_INTERNAL', () => {
  assert.equal(matchGroup([...ALL_TEAMS]), 'EVERYONE')
  assert.equal(matchGroup([...INTERNAL_TEAMS]), 'PLUTUS21_INTERNAL')
  assert.equal(matchGroup(['PAKISTAN']), null)
})

test('matchGroup ignores ordering', () => {
  assert.equal(matchGroup([...ALL_TEAMS].reverse()), 'EVERYONE')
})
