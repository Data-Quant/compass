// One evaluator's questions for a week. Pure: the release service supplies the pairs and topics.
//
// Each person an evaluator evaluates gets QUESTIONS_PER_PAIR questions a quarter, so an evaluator with y people has
// x = 5y questions, spread evenly over the question weeks (about x / 12 a week). Each week a different, random
// handful of people comes up, and nobody goes more than MAX_WEEKS_WITHOUT_ASKING weeks without a question.
import { questionWeekCount } from './calendar'
import { stableHash } from './hash'

export const QUESTIONS_PER_PAIR = 5
export const MAX_WEEKS_WITHOUT_ASKING = 3

export interface SchedulablePair {
  key: string
  /** Questions released about this person this quarter, answered or not (a "not observed" still counts). */
  asked: number
  lastAskedWeek: number | null
  /** A question about this person is still open or in draft: one at a time. */
  hasOpenPrompt: boolean
  /** At least one topic about this person can still be asked (see pickTopic). */
  hasAskableTopic: boolean
}

export interface WeekPlanInput {
  week: number
  totalWeeks: number
  /** Stable per cycle and evaluator, so each evaluator gets their own random order. */
  seed: string
  pairs: readonly SchedulablePair[]
}

const shuffleKey = (seed: string, week: number, key: string) => stableHash(`${seed}|${week}|${key}`)

/** How many questions this evaluator should have been asked by the end of `week`. */
function cumulativeTarget(quota: number, week: number, totalWeeks: number): number {
  const questionWeeks = questionWeekCount(totalWeeks)
  return week >= questionWeeks ? quota : Math.ceil((quota * week) / questionWeeks)
}

/** The people this evaluator is asked about this week, as pair keys. */
export function planWeek(input: WeekPlanInput): string[] {
  if (input.week < 1 || input.week > input.totalWeeks) return []
  const quota = QUESTIONS_PER_PAIR * input.pairs.length
  const askedSoFar = input.pairs.reduce((sum, p) => sum + Math.min(p.asked, QUESTIONS_PER_PAIR), 0)
  const due = cumulativeTarget(quota, input.week, input.totalWeeks) - askedSoFar
  const candidates = input.pairs.filter((p) => p.asked < QUESTIONS_PER_PAIR && !p.hasOpenPrompt && p.hasAskableTopic)
  const waited = (p: SchedulablePair) => input.week - (p.lastAskedWeek ?? 0)
  const overdue = candidates.filter((p) => waited(p) >= MAX_WEEKS_WITHOUT_ASKING).length
  const count = Math.min(candidates.length, Math.max(due, overdue))
  return [...candidates]
    .sort((a, b) => waited(b) - waited(a) || a.asked - b.asked || shuffleKey(input.seed, input.week, a.key) - shuffleKey(input.seed, input.week, b.key) || a.key.localeCompare(b.key))
    .slice(0, count)
    .map((p) => p.key)
}

export interface SchedulableTopic {
  id: string
  status: 'OPEN' | 'SATISFIED' | 'CLOSED_NOT_OBSERVED' | 'CANCELLED'
  /** Questions released on this topic for this pair. */
  asked: number
  snoozedUntilWeek: number | null
}

/** The topic to ask about next: the one asked least, uncovered before covered, then at random. */
export function pickTopic(topics: readonly SchedulableTopic[], week: number, seed: string): string | null {
  const askable = topics.filter((t) => (t.status === 'OPEN' || t.status === 'SATISFIED') && (t.snoozedUntilWeek === null || week >= t.snoozedUntilWeek))
  const covered = (t: SchedulableTopic) => Number(t.status === 'SATISFIED')
  const [next] = [...askable].sort((a, b) => a.asked - b.asked || covered(a) - covered(b) || shuffleKey(seed, week, a.id) - shuffleKey(seed, week, b.id))
  return next?.id ?? null
}

/** Rotate A/B: the variant asked least for this topic, ties broken by variant letter. */
export function nextVariant<T extends { id: string; variant: string }>(variants: readonly T[], askedVariantIds: readonly string[]): T | null {
  if (variants.length === 0) return null
  const uses = (id: string) => askedVariantIds.filter((asked) => asked === id).length
  return [...variants].sort((a, b) => uses(a.id) - uses(b.id) || a.variant.localeCompare(b.variant))[0]
}
