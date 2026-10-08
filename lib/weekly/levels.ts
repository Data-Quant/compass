/** The four Compass rating levels used on the quarter-end forms. */
export type LevelKey = '1' | '2' | '3' | '4'

export const LEVEL_LABELS: Record<LevelKey, string> = {
  '4': 'Transforming The Business',
  '3': 'Exceeds Expectations',
  '2': 'Meets Expectations',
  '1': 'Does Not Meet Expectations',
}
