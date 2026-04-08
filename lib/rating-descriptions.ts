export const RATING_VALUES = [1, 2, 3, 4] as const

export type RatingValue = (typeof RATING_VALUES)[number]

export type RatingDescriptions = Record<RatingValue, string>

export type RatingDescriptionFields = {
  rating1Description: string | null
  rating2Description: string | null
  rating3Description: string | null
  rating4Description: string | null
}

type RatingDescriptionSource = Partial<
  RatingDescriptionFields & {
    '1'?: string | null
    '2'?: string | null
    '3'?: string | null
    '4'?: string | null
  }
>

export function createEmptyRatingDescriptions(): RatingDescriptions {
  return {
    1: '',
    2: '',
    3: '',
    4: '',
  }
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim() || ''
}

export function normalizeRatingDescriptions(
  source?: RatingDescriptionSource | null
): RatingDescriptions {
  return {
    1: normalizeValue(source?.[1] ?? source?.['1'] ?? source?.rating1Description),
    2: normalizeValue(source?.[2] ?? source?.['2'] ?? source?.rating2Description),
    3: normalizeValue(source?.[3] ?? source?.['3'] ?? source?.rating3Description),
    4: normalizeValue(source?.[4] ?? source?.['4'] ?? source?.rating4Description),
  }
}

export function hasAnyRatingDescriptions(
  source?: RatingDescriptionSource | RatingDescriptions | null
) {
  const normalized = normalizeRatingDescriptions(source)
  return RATING_VALUES.some((rating) => Boolean(normalized[rating]))
}

export function toRatingDescriptionFields(
  source?: RatingDescriptionSource | RatingDescriptions | null
): RatingDescriptionFields {
  const normalized = normalizeRatingDescriptions(source)

  return {
    rating1Description: normalized[1] || null,
    rating2Description: normalized[2] || null,
    rating3Description: normalized[3] || null,
    rating4Description: normalized[4] || null,
  }
}
