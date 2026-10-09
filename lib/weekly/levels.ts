/** The four Compass rating levels used on the quarter-end forms. */
export type LevelKey = '1' | '2' | '3' | '4'

export const LEVEL_LABELS: Record<LevelKey, string> = {
  '4': 'Transforming The Business',
  '3': 'Exceeds Expectations',
  '2': 'Meets Expectations',
  '1': 'Does Not Meet Expectations',
}

/** What each weekly level means in Compass (UX spec, section 8, score mapping). HR sees it; evaluators never do. */
export const MCQ_LEVEL_MEANINGS: Readonly<Record<string, string>> = {
  '1': 'Does Not Meet Expectations',
  '1.5': 'Below expectations; needs regular follow-up',
  '2': 'Meets Expectations',
  '2.5': 'Meets, with some strengths above the role',
  '3': 'Exceeds Expectations',
  '3.5': 'Exceeds, with impact beyond their own work',
  '4': 'Transforming The Business',
}

export function levelMeaning(level: number): string {
  return MCQ_LEVEL_MEANINGS[String(level)] ?? ''
}
