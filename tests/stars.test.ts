import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STAR_COUNT,
  scoreToStars,
  starFills,
  ratingBandFor,
  renderStars,
  starAriaLabel,
} from '../lib/stars'

// Star fills are fractional, so compare with a tolerance rather than exactly.
function close(actual: number, expected: number, message?: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    message ?? `expected ${actual} to be about ${expected}`
  )
}

test('overallScore percentages convert back to their native 0-4 value', () => {
  // lib/scoring.ts derives overallScore as (aggregate / 4) * 100, so this is the
  // inverse of that and must round-trip exactly at the anchor points.
  close(scoreToStars(0), 0)
  close(scoreToStars(25), 1)
  close(scoreToStars(50), 2)
  close(scoreToStars(75), 3)
  close(scoreToStars(100), 4)
})

test('scores outside the scale are clamped rather than overflowing the widget', () => {
  close(scoreToStars(-10), 0)
  close(scoreToStars(140), STAR_COUNT)
  // A non-finite score means "no usable value", so it falls to 0 rather than
  // clamping up to a perfect 4 -- an error that showed someone full marks would be
  // far worse than one that showed none.
  close(scoreToStars(Number.NaN), 0)
  close(scoreToStars(Number.POSITIVE_INFINITY), 0)
})

test('a 3.3 fills three stars and 30% of the fourth', () => {
  const fills = starFills(3.3)

  assert.equal(fills.length, STAR_COUNT)
  close(fills[0], 1)
  close(fills[1], 1)
  close(fills[2], 1)
  close(fills[3], 0.3)
})

test('fills stay within 0-1 per star across the range', () => {
  for (const stars of [0, 0.4, 1, 2.5, 3.75, 4]) {
    for (const fill of starFills(stars)) {
      assert.ok(fill >= 0 && fill <= 1, `fill ${fill} out of range for ${stars}`)
    }
  }

  assert.deepEqual(starFills(0), [0, 0, 0, 0])
  assert.deepEqual(starFills(4), [1, 1, 1, 1])
})

test('total fill always equals the score, so the picture is the number', () => {
  for (const stars of [0, 0.75, 1.6, 2.4, 3.3, 3.99, 4]) {
    const total = starFills(stars).reduce((sum, fill) => sum + fill, 0)
    close(total, stars, `fills for ${stars} summed to ${total}`)
  }
})

test('the label comes from the solid stars, so words match the picture', () => {
  assert.equal(ratingBandFor(4)?.label, 'Transforming The Business')
  assert.equal(ratingBandFor(3)?.label, 'Exceeds Expectations')
  assert.equal(ratingBandFor(3.99)?.label, 'Exceeds Expectations')
  assert.equal(ratingBandFor(2)?.label, 'Meets Expectations')
  assert.equal(ratingBandFor(1)?.label, 'Does Not Meet Expectations')
})

test('an unrated report gets no label instead of a false negative', () => {
  // A 0 aggregate means no ratings were submitted, since any real rating is >= 1.
  // Calling that "Does Not Meet Expectations" would accuse someone of a bad review
  // they never received.
  assert.equal(ratingBandFor(0), null)
  assert.equal(ratingBandFor(0.75), null)
})

test('the label never disagrees with the number of solid stars', () => {
  for (let raw = 0; raw <= 100; raw += 0.5) {
    const stars = scoreToStars(raw)
    const solid = starFills(stars).filter((fill) => fill === 1).length
    const band = ratingBandFor(stars)

    if (band === null) {
      assert.equal(solid, 0, `no label but ${solid} solid stars at ${raw}%`)
    } else {
      assert.ok(solid >= 1, `label "${band.label}" with no solid star at ${raw}%`)
    }
  }
})

test('renders one glyph per star with the fill encoded as gradient stops', () => {
  const html = renderStars(3.3, { idPrefix: 'overall' })

  assert.equal(html.match(/<svg/g)?.length, STAR_COUNT)
  // Three solid, then a hard edge at 30% on the fourth.
  assert.ok(html.includes('offset="100.00%"'))
  assert.ok(html.includes('offset="30.00%"'))
})

test('gradient ids are unique so glyphs cannot share a fill', () => {
  const html = renderStars(2.5, { idPrefix: 'overall' })
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1])

  assert.equal(ids.length, STAR_COUNT)
  assert.equal(new Set(ids).size, STAR_COUNT)
})

test('star markup carries no unescaped interpolation', () => {
  const html = renderStars(3, { idPrefix: 'a"b<c' })

  // idPrefix is caller-supplied and never user input, but the output still has to
  // be well-formed if someone passes something odd.
  assert.ok(!html.includes('<c'), 'raw angle bracket leaked into markup')
})

test('aria label states the score in words', () => {
  assert.equal(starAriaLabel(3.3), '3.30 out of 4 stars')
  assert.equal(starAriaLabel(4), '4.00 out of 4 stars')
})
