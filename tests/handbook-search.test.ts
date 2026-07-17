import test from 'node:test'
import assert from 'node:assert/strict'
import { filterPages } from '../lib/handbook/search'
import type { HubPage } from '../lib/handbook/audience'

// Content is invented. Real policy text never enters this repo -- it is public.
const page = (slug: string, title: string, description: string | null): HubPage => ({
  slug,
  title,
  icon: 'FileText',
  category: 'POLICIES',
  orderIndex: 0,
  linkHref: null,
  linkLabel: null,
  description,
})

const pages: HubPage[] = [
  page('leave-policy', 'Leave Policy', 'Time off and how to ask for it'),
  page('core-hours', 'Core Hours', 'When we overlap'),
  page('welcome', 'Welcome', null),
]

test('an empty query returns everything', () => {
  assert.equal(filterPages(pages, '').length, 3)
  assert.equal(filterPages(pages, '   ').length, 3)
})

test('matches on title, case-insensitively', () => {
  assert.deepEqual(
    filterPages(pages, 'leave').map((p) => p.slug),
    ['leave-policy']
  )
  assert.deepEqual(
    filterPages(pages, 'LEAVE').map((p) => p.slug),
    ['leave-policy']
  )
})

test('matches on description', () => {
  assert.deepEqual(
    filterPages(pages, 'overlap').map((p) => p.slug),
    ['core-hours']
  )
})

test('a page with a null description is still searchable by title', () => {
  assert.deepEqual(
    filterPages(pages, 'welcome').map((p) => p.slug),
    ['welcome']
  )
})

test('surrounding whitespace is ignored', () => {
  assert.deepEqual(
    filterPages(pages, '  core  ').map((p) => p.slug),
    ['core-hours']
  )
})

test('no match returns empty, never everything', () => {
  assert.deepEqual(filterPages(pages, 'zzzz'), [])
})

test('the result preserves input order', () => {
  // 'o' appears in every title or description.
  assert.deepEqual(
    filterPages(pages, 'o').map((p) => p.slug),
    ['leave-policy', 'core-hours', 'welcome']
  )
})

test('does not mutate its input', () => {
  const before = pages.map((p) => p.slug)
  filterPages(pages, 'leave')
  assert.deepEqual(
    pages.map((p) => p.slug),
    before
  )
})
