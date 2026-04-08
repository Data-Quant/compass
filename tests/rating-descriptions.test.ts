import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createEmptyRatingDescriptions,
  normalizeRatingDescriptions,
  toRatingDescriptionFields,
} from '../lib/rating-descriptions'

test('normalizeRatingDescriptions supports both object and prisma field shapes', () => {
  assert.deepEqual(
    normalizeRatingDescriptions({
      1: 'Needs support',
      2: 'Meets baseline',
      3: 'Strong delivery',
      4: 'Transforms outcomes',
    }),
    {
      1: 'Needs support',
      2: 'Meets baseline',
      3: 'Strong delivery',
      4: 'Transforms outcomes',
    }
  )

  assert.deepEqual(
    normalizeRatingDescriptions({
      rating1Description: 'Needs support',
      rating2Description: 'Meets baseline',
      rating3Description: 'Strong delivery',
      rating4Description: 'Transforms outcomes',
    }),
    {
      1: 'Needs support',
      2: 'Meets baseline',
      3: 'Strong delivery',
      4: 'Transforms outcomes',
    }
  )
})

test('toRatingDescriptionFields converts empty values to nullable prisma payload fields', () => {
  assert.deepEqual(toRatingDescriptionFields(createEmptyRatingDescriptions()), {
    rating1Description: null,
    rating2Description: null,
    rating3Description: null,
    rating4Description: null,
  })

  assert.deepEqual(
    toRatingDescriptionFields({
      1: 'Needs support',
      2: '',
      3: 'Strong delivery',
      4: 'Transforms outcomes',
    }),
    {
      rating1Description: 'Needs support',
      rating2Description: null,
      rating3Description: 'Strong delivery',
      rating4Description: 'Transforms outcomes',
    }
  )
})
