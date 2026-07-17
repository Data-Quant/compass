import test from 'node:test'
import assert from 'node:assert/strict'
import type { TeamTag } from '@prisma/client'
import { ALL_TEAMS, expandGroup } from '../lib/handbook/teams'
import {
  selectVariant,
  toHubResponse,
  toDetailResponse,
  findAudienceOverlap,
  type PageInput,
} from '../lib/handbook/audience'

// ─── fixtures ────────────────────────────────────────────────────────────────
// Mirrors the real shape: one universal page, one multi-variant page.

const welcome: PageInput = {
  id: 'p1',
  slug: 'welcome',
  title: 'Welcome',
  icon: 'Hand',
  category: 'START_HERE',
  orderIndex: 0,
  linkHref: null,
  linkLabel: null,
  isPublished: true,
  description: null,
  layout: null,
  variants: [
    { id: 'v1', bodyMarkdown: 'UNIVERSAL_BODY', orderIndex: 0, audiences: [...ALL_TEAMS] },
  ],
}

const leave: PageInput = {
  id: 'p2',
  slug: 'leave-policy',
  title: 'Leave Policy',
  icon: 'Calendar',
  category: 'POLICIES',
  orderIndex: 1,
  linkHref: '/leave',
  linkLabel: 'Apply for leave',
  isPublished: true,
  description: null,
  layout: null,
  variants: [
    {
      id: 'v2',
      bodyMarkdown: 'INTERNAL_LEAVE_BODY',
      orderIndex: 0,
      audiences: ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA'],
    },
    { id: 'v3', bodyMarkdown: 'THREE_E_MA_LEAVE_BODY', orderIndex: 1, audiences: ['THREE_E_MOROCCO'] },
    { id: 'v4', bodyMarkdown: 'THREE_E_PK_LEAVE_BODY', orderIndex: 2, audiences: ['THREE_E_PAKISTAN'] },
    { id: 'v5', bodyMarkdown: 'NOBLE_LEAVE_BODY', orderIndex: 3, audiences: ['NOBLE'] },
  ],
}

const draft: PageInput = { ...welcome, id: 'p3', slug: 'draft-page', isPublished: false }

const pages = [welcome, leave, draft]

// ─── groups ──────────────────────────────────────────────────────────────────

test('expandGroup EVERYONE is all seven teams', () => {
  assert.deepEqual([...expandGroup('EVERYONE')].sort(), [...ALL_TEAMS].sort())
  assert.equal(expandGroup('EVERYONE').length, 7)
})

test('expandGroup PLUTUS21_INTERNAL excludes both 3E teams', () => {
  const internal = expandGroup('PLUTUS21_INTERNAL')
  assert.equal(internal.length, 5)
  assert.ok(!internal.includes('THREE_E_PAKISTAN'))
  assert.ok(!internal.includes('THREE_E_MOROCCO'))
})

// ─── selectVariant ───────────────────────────────────────────────────────────

test('selectVariant returns the variant addressed to the tag', () => {
  assert.equal(selectVariant(leave, 'PAKISTAN')?.bodyMarkdown, 'INTERNAL_LEAVE_BODY')
  assert.equal(selectVariant(leave, 'THREE_E_MOROCCO')?.bodyMarkdown, 'THREE_E_MA_LEAVE_BODY')
  assert.equal(selectVariant(leave, 'NOBLE')?.bodyMarkdown, 'NOBLE_LEAVE_BODY')
})

test('selectVariant returns null when no variant addresses the tag', () => {
  const pakistanOnly: PageInput = {
    ...welcome,
    id: 'p4',
    slug: 'travel-policy',
    variants: [{ id: 'v6', bodyMarkdown: 'TRAVEL_BODY', orderIndex: 0, audiences: ['PAKISTAN'] }],
  }
  assert.equal(selectVariant(pakistanOnly, 'NOBLE'), null)
})

test('untagged user gets a variant only when ONE variant covers all seven teams', () => {
  assert.equal(selectVariant(welcome, null)?.bodyMarkdown, 'UNIVERSAL_BODY')
})

test('untagged user gets NOTHING from a page that reaches seven teams across variants', () => {
  // Leave reaches all 7 collectively, but only by telling each team something
  // different. An untagged user has no team, so there is no right answer.
  assert.equal(selectVariant(leave, null), null)
})

// ─── hub ─────────────────────────────────────────────────────────────────────

test('hub excludes unpublished pages', () => {
  const slugs = toHubResponse(pages, 'PAKISTAN').pages.map((p) => p.slug)
  assert.ok(!slugs.includes('draft-page'))
})

test('hub for an untagged user is universal pages only, and flags untagged', () => {
  const res = toHubResponse(pages, null)
  assert.deepEqual(
    res.pages.map((p) => p.slug),
    ['welcome']
  )
  assert.equal(res.untagged, true)
})

test('hub for a tagged user includes pages addressed to them', () => {
  const res = toHubResponse(pages, 'THREE_E_PAKISTAN')
  assert.deepEqual(res.pages.map((p) => p.slug).sort(), ['leave-policy', 'welcome'])
  assert.equal(res.untagged, false)
})

// ─── leakage: the load-bearing guarantee ─────────────────────────────────────

test('LEAKAGE: hub response carries no bodies at all', () => {
  for (const tag of [...ALL_TEAMS, null] as (TeamTag | null)[]) {
    const json = JSON.stringify(toHubResponse(pages, tag))
    assert.ok(!json.includes('BODY'), `hub leaked a body for tag=${tag}`)
  }
})

test('LEAKAGE: detail response contains only the requesting team body', () => {
  const cases: Array<[TeamTag, string, string[]]> = [
    [
      'PAKISTAN',
      'INTERNAL_LEAVE_BODY',
      ['THREE_E_MA_LEAVE_BODY', 'THREE_E_PK_LEAVE_BODY', 'NOBLE_LEAVE_BODY'],
    ],
    [
      'THREE_E_MOROCCO',
      'THREE_E_MA_LEAVE_BODY',
      ['INTERNAL_LEAVE_BODY', 'THREE_E_PK_LEAVE_BODY', 'NOBLE_LEAVE_BODY'],
    ],
    [
      'NOBLE',
      'NOBLE_LEAVE_BODY',
      ['INTERNAL_LEAVE_BODY', 'THREE_E_MA_LEAVE_BODY', 'THREE_E_PK_LEAVE_BODY'],
    ],
  ]
  for (const [tag, own, foreign] of cases) {
    const json = JSON.stringify(toDetailResponse(leave, tag))
    assert.ok(json.includes(own), `${tag} did not receive its own body`)
    for (const f of foreign) {
      assert.ok(!json.includes(f), `${tag} LEAKED ${f}`)
    }
  }
})

test('LEAKAGE: untagged user receives no team-specific body', () => {
  assert.equal(toDetailResponse(leave, null), null)
})

test('detail returns null for an unpublished page', () => {
  assert.equal(toDetailResponse(draft, 'PAKISTAN'), null)
})

// ─── overlap ─────────────────────────────────────────────────────────────────

test('findAudienceOverlap returns teams claimed by more than one variant', () => {
  assert.deepEqual(findAudienceOverlap(leave.variants), [])
  const clashing = [
    { id: 'a', bodyMarkdown: 'x', orderIndex: 0, audiences: ['PAKISTAN', 'INDONESIA'] as TeamTag[] },
    { id: 'b', bodyMarkdown: 'y', orderIndex: 1, audiences: ['INDONESIA'] as TeamTag[] },
  ]
  assert.deepEqual(findAudienceOverlap(clashing), ['INDONESIA'])
})
