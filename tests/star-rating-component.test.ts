import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StarRating } from '../components/composed/StarRating'
import { scoreToStars, STAR_COUNT } from '../lib/stars'

function render(...stars: number[]) {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      ...stars.map((value, index) => createElement(StarRating, { key: index, stars: value }))
    )
  )
}

test('renders one glyph per star', () => {
  const html = render(scoreToStars(75))

  assert.equal(html.match(/<svg/g)?.length, STAR_COUNT)
})

test('gradient ids are unique across every instance on the page', () => {
  // The reports page renders one of these per employee. SVG gradient ids are
  // document-global, so a shared id would make every card display the first
  // card's fill -- silently, and only once there is more than one report.
  const html = render(scoreToStars(25), scoreToStars(75), scoreToStars(100))
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1])

  assert.equal(ids.length, STAR_COUNT * 3)
  assert.equal(new Set(ids).size, ids.length, 'duplicate gradient id across instances')
})

test('every gradient the paths reference actually exists', () => {
  const html = render(scoreToStars(82.5), scoreToStars(67))
  const defined = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
  const referenced = [...html.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])

  assert.ok(referenced.length > 0)
  for (const reference of referenced) {
    assert.ok(defined.has(reference), `path references missing gradient ${reference}`)
  }
})

test('fill offsets carry the fractional score', () => {
  const html = render(scoreToStars(82.5)) // 3.30 stars

  assert.ok(html.includes('offset="30.00%"'), 'fourth star not filled 30%')
})

test('exposes the score to screen readers', () => {
  const html = render(scoreToStars(75))

  assert.ok(html.includes('aria-label="3.00 out of 4 stars"'))
})
