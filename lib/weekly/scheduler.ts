// One evaluator's questions for a week. Pure: the release service supplies the pairs and topics.
//
// Each person an evaluator evaluates gets QUESTIONS_PER_PAIR questions a quarter, so an evaluator with y people has
// x = 5y questions, spread evenly over the question weeks (about x / 12 a week). Each week a different, random
// handful of people comes up, and nobody goes more than MAX_WEEKS_WITHOUT_ASKING weeks without a question.
// A week holds at most WEEKLY_QUESTION_CAP new questions, unless that could not finish everyone by the end of the
// quarter (see weeklyCap).
import { questionWeekCount } from './calendar'
import { shuffleHash } from './hash'

export const QUESTIONS_PER_PAIR = 5
export const MAX_WEEKS_WITHOUT_ASKING = 3
/** UX spec, sections 1 and 8: at most 5 questions per evaluator per week, counting those carried over. */
export const WEEKLY_QUESTION_CAP = 5
/** Section 8: the same topic comes back for the same person at least this many weeks later. */
export const TOPIC_GAP_WEEKS = 3

export interface SchedulablePair {
  key: string
  /** Questions released about this person this quarter, answered or not (a "not observed" still counts). */
  asked: number
  lastAskedWeek: number | null
  /** A question about this person is still open or in draft: one at a time. */
  hasOpenPrompt: boolean
  /** At least one topic about this person can still be asked (see pickTopic). */
  hasAskableTopic: boolean
  /** Added mid-quarter: the five questions are spread over these weeks instead of the whole quarter. */
  window?: PairWindow
}

export interface PairWindow { startWeek: number; weeks: number }

export interface WeekPlanInput {
  week: number
  totalWeeks: number
  /** Stable per cycle and evaluator, so each evaluator gets their own random order. */
  seed: string
  pairs: readonly SchedulablePair[]
}

const shuffleKey = (seed: string, week: number, key: string) => shuffleHash(`${seed}|${week}|${key}`)

const startOf = (p: SchedulablePair) => p.window?.startWeek ?? 1

/** How many questions about this person should have been asked by the end of `week` (a fraction). */
function pairTarget(p: SchedulablePair, week: number, questionWeeks: number): number {
  if (week < startOf(p)) return 0
  if (week >= questionWeeks) return QUESTIONS_PER_PAIR
  const weeks = Math.max(1, p.window?.weeks ?? questionWeeks)
  return QUESTIONS_PER_PAIR * Math.min(1, (week - startOf(p) + 1) / weeks)
}

/**
 * The most new questions this week: WEEKLY_QUESTION_CAP, unless that cannot finish everyone's five by the end of the
 * quarter; then just enough a week to finish (the questions still owed over the weeks left, this one included).
 */
export function weeklyCap(pairs: readonly SchedulablePair[], week: number, totalWeeks: number): number {
  const questionWeeks = questionWeekCount(totalWeeks)
  const weeksLeft = Math.max(1, (week <= questionWeeks ? questionWeeks : totalWeeks) - week + 1)
  const owed = pairs.reduce((sum, p) => sum + Math.max(0, QUESTIONS_PER_PAIR - p.asked), 0)
  return Math.max(WEEKLY_QUESTION_CAP, Math.ceil(owed / weeksLeft))
}

/** The people this evaluator is asked about this week, as pair keys. */
export function planWeek(input: WeekPlanInput): string[] {
  if (input.week < 1 || input.week > input.totalWeeks) return []
  const questionWeeks = questionWeekCount(input.totalWeeks)
  const target = input.pairs.reduce((sum, p) => sum + pairTarget(p, input.week, questionWeeks), 0)
  const askedSoFar = input.pairs.reduce((sum, p) => sum + Math.min(p.asked, QUESTIONS_PER_PAIR), 0)
  // The small allowance keeps a sum of fractions that should be whole (e.g. 35 * 4 / 12) from rounding up a whole question.
  const due = Math.ceil(target - 1e-9) - askedSoFar
  const candidates = input.pairs.filter((p) => input.week >= startOf(p) && p.asked < QUESTIONS_PER_PAIR && !p.hasOpenPrompt && p.hasAskableTopic)
  const waited = (p: SchedulablePair) => input.week - (p.lastAskedWeek ?? startOf(p) - 1)
  const overdue = candidates.filter((p) => waited(p) >= MAX_WEEKS_WITHOUT_ASKING).length
  // Questions still open from earlier weeks count toward the cap, so a missed week never doubles the next (section 8).
  const carried = input.pairs.filter((p) => p.hasOpenPrompt).length
  const room = Math.max(0, weeklyCap(input.pairs, input.week, input.totalWeeks) - carried)
  const count = Math.min(candidates.length, Math.max(due, overdue), room)
  // Anyone at the three-week limit first, then whoever is furthest behind their own pace (someone added mid-quarter
  // has fewer weeks), then whoever has waited longest, then at random.
  const isOverdue = (p: SchedulablePair) => Number(waited(p) >= MAX_WEEKS_WITHOUT_ASKING)
  const behind = (p: SchedulablePair) => Math.ceil(pairTarget(p, input.week, questionWeeks) - 1e-9) - p.asked
  return [...candidates]
    .sort((a, b) =>
      isOverdue(b) - isOverdue(a) || behind(b) - behind(a) || waited(b) - waited(a) || a.asked - b.asked ||
      shuffleKey(input.seed, input.week, a.key) - shuffleKey(input.seed, input.week, b.key) || a.key.localeCompare(b.key))
    .slice(0, count)
    .map((p) => p.key)
}

export interface SchedulableTopic {
  id: string
  status: 'OPEN' | 'SATISFIED' | 'CLOSED_NOT_OBSERVED' | 'CANCELLED'
  /** Questions released on this topic for this pair. */
  asked: number
  /** The week this topic was last asked about this person, if ever. */
  lastAskedWeek?: number | null
  snoozedUntilWeek: number | null
}

/** The topic to ask about next: the one asked least, uncovered before covered, then at random; never one asked in the last 3 weeks. */
export function pickTopic(topics: readonly SchedulableTopic[], week: number, seed: string): string | null {
  const rested = (t: SchedulableTopic) => t.lastAskedWeek === null || t.lastAskedWeek === undefined || week - t.lastAskedWeek >= TOPIC_GAP_WEEKS
  const askable = topics.filter((t) => (t.status === 'OPEN' || t.status === 'SATISFIED') && (t.snoozedUntilWeek === null || week >= t.snoozedUntilWeek) && rested(t))
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
