// UX spec, section 8: each weekly question offers 8 statements. Seven map to levels 1, 1.5, 2, 2.5, 3, 3.5 and 4; the
// eighth repeats one of those levels in other words. The chosen statement's level guides the model's score, which HR
// reviews (HR's decision); evaluators never see levels.
import type { Perspective } from './perspectives'
import { shuffleHash } from './hash'

export const MCQ_LEVELS = [1, 1.5, 2, 2.5, 3, 3.5, 4] as const
export const MCQ_OPTION_COUNT = 8
/** A note is required for the extreme statements; the model reads it when scoring. */
const NOTE_REQUIRED = new Set<number>([1, 1.5, 4])
/** The 10% cap on 4s (D-Q4), per evaluator and relationship for the quarter, applied when HR confirms scores. */
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
  if (options.some((o) => !(MCQ_LEVELS as readonly number[]).includes(o.score))) return 'Levels go from 1 to 4 in half points'
  const missing = MCQ_LEVELS.filter((level) => !options.some((o) => o.score === level))
  if (missing.length) return `No statement at level ${missing.join(', ')}`
  return null
}

/** The repeated level belongs between these (UX spec, 10.3: "spread repeats across 1.5 to 3.5"). */
const REPEAT_RANGE = [1.5, 3.5] as const
/** A statement this many times the typical length stands out once shuffled (10.3: "same length, same tone"). */
const LENGTH_FACTOR = 2

/**
 * Section 10.3's checkable writing rules, as warnings: HR can still save. The rest (describe what is seen, one idea per
 * step, reach at 4) need a person's judgement and are shown to HR as a checklist.
 */
export function statementWarnings(options: readonly McqStatement[]): string[] {
  const warnings: string[] = []
  const repeated = [...new Set(options.map((o) => o.score))].filter((level) => options.filter((o) => o.score === level).length > 1)
  for (const level of repeated) {
    if (level < REPEAT_RANGE[0] || level > REPEAT_RANGE[1]) warnings.push(`Repeat a level between ${REPEAT_RANGE[0]} and ${REPEAT_RANGE[1]}, not ${level}`)
  }
  const lengths = options.map((o) => o.text.trim().length).sort((a, b) => a - b)
  const median = lengths.length ? (lengths[Math.floor((lengths.length - 1) / 2)] + lengths[Math.ceil((lengths.length - 1) / 2)]) / 2 : 0
  options.forEach((o, i) => {
    if (median > 0 && o.text.trim().length > LENGTH_FACTOR * median) warnings.push(`Statement ${i + 1} is much longer than the others; keep them a similar length so none stands out`)
  })
  const seen = new Map<string, number>()
  options.forEach((o, i) => {
    const key = o.text.trim().toLowerCase()
    if (!key) return
    const first = seen.get(key)
    if (first !== undefined) warnings.push(`Statements ${first + 1} and ${i + 1} say the same thing; the repeat should describe the level in other words`)
    else seen.set(key, i)
  })
  return warnings
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
  return [...options].sort((a, b) => shuffleHash(`${seed}|${a.id}`) - shuffleHash(`${seed}|${b.id}`) || a.id.localeCompare(b.id))
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
