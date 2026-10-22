// The scores HR can give in the quarter-end tables: 1 to 4 in quarter steps (2.5, 2.75, 3, 3.25 ...).
export const TABLE_SCORE_STEP = 0.25
export const TABLE_SCORES: readonly number[] = Array.from({ length: (4 - 1) / TABLE_SCORE_STEP + 1 }, (_, i) => 1 + i * TABLE_SCORE_STEP)

export const isTableScore = (value: number): boolean => TABLE_SCORES.includes(value)

/** A score or total as people write it: 3, 2.5, 3.25, never 3.0 or 2.50. */
export const formatScore = (value: number): string => String(Math.round(value * 100) / 100)
