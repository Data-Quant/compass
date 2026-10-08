// UX spec, section 8: each weekly question offers 8 statements. Seven map to 1, 1.5, 2, 2.5, 3, 3.5 and 4; the eighth
// repeats one of those levels in other words, so position never reveals the score. The chosen statement is the score.
import type { Perspective } from './perspectives'
import { stableHash } from './hash'

export const MCQ_LEVELS = [1, 1.5, 2, 2.5, 3, 3.5, 4] as const
export const MCQ_OPTION_COUNT = 8
/** A note is required for the extreme scores; it never changes the score. */
const NOTE_REQUIRED = new Set<number>([1, 1.5, 4])
/** The 10% cap on 4s (D-Q4), per evaluator and relationship for the quarter. */
const FOUR_RATING_SHARE = 0.1

export interface McqStatement { text: string; score: number }
export interface McqOption extends McqStatement { id: string }
export interface McqBankTopic {
  key: string
  perspective: Perspective
  name: string
  /** Asked only about people in these departments; null for every department. */
  departments: string[] | null
  questions: Array<{ text: string; options: McqStatement[] }>
}

/** Why these statements cannot be used as a question, or null when they can. */
export function optionsProblem(options: readonly McqStatement[]): string | null {
  if (options.length !== MCQ_OPTION_COUNT) return `A question needs ${MCQ_OPTION_COUNT} statements`
  if (options.some((o) => !o.text.trim())) return 'A statement is empty'
  if (options.some((o) => !(MCQ_LEVELS as readonly number[]).includes(o.score))) return 'Scores go from 1 to 4 in half points'
  const missing = MCQ_LEVELS.filter((level) => !options.some((o) => o.score === level))
  if (missing.length) return `No statement scores ${missing.join(', ')}`
  return null
}

export function noteRequired(score: number): boolean {
  return NOTE_REQUIRED.has(score)
}

/** Gives statements stable ids (o1…o8) so an answer survives HR reordering or editing their text. */
export function withOptionIds(options: readonly McqStatement[]): McqOption[] {
  return options.map((o, i) => ({ id: `o${i + 1}`, text: o.text.trim(), score: o.score }))
}

/** The order one evaluator sees for one question: shuffled by the seed, the same every time. */
export function shuffleOptions<T extends { id: string }>(options: readonly T[], seed: string): T[] {
  return [...options].sort((a, b) => stableHash(`${seed}|${a.id}`) - stableHash(`${seed}|${b.id}`) || a.id.localeCompare(b.id))
}

export function fourRatingLimit(questions: number): number {
  return Math.max(1, Math.floor(questions * FOUR_RATING_SHARE))
}

/** "[name]" in a question becomes the person's first name. */
export function personalise(text: string, fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || fullName
  return text.replace(/\[name\]/g, first)
}

/** Reads statements stored as JSON, dropping anything malformed. */
export function parseOptions(value: unknown): McqOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((o) =>
    o && typeof o === 'object' && typeof o.id === 'string' && typeof o.text === 'string' && typeof o.score === 'number' ? [{ id: o.id, text: o.text, score: o.score }] : [],
  )
}
