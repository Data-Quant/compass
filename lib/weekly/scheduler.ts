// Spec 7.2: build one evaluator's weekly batch. Pure: the release service supplies the slots.
import { questionWeekCount } from './calendar'
import type { Perspective } from './perspectives'

export interface SchedulableSlot {
  id: string
  evaluateeId: string
  perspective: Perspective
  status: 'OPEN' | 'SATISFIED' | 'CLOSED_NOT_OBSERVED' | 'CLOSED_INSUFFICIENT' | 'CANCELLED'
  /** Confirmed (accepted, adjusted, auto-accepted or manual) answers so far. */
  confirmedSamples: number
  /** A standard or follow-up question for this slot is still open or in draft. */
  hasOpenPrompt: boolean
  lastAskedWeek: number | null
  snoozedUntilWeek: number | null
}

export interface BatchInput {
  week: number
  totalWeeks: number
  cap: number
  /** Questions this evaluator still has open; they count toward the cap (D7). */
  openPromptCount: number
  slots: readonly SchedulableSlot[]
  /** Evidence gathered so far per evaluatee, across all evaluators. */
  evidenceByEvaluatee: ReadonlyMap<string, number>
}

export const MAX_PER_EVALUATEE_PER_BATCH = 2
export const MIN_WEEKS_BETWEEN_ASKS = 3

type Sample = 'FIRST' | 'SECOND'

function wantedSample(slot: SchedulableSlot): Sample | null {
  if (slot.status === 'OPEN' && slot.confirmedSamples === 0) return 'FIRST'
  const leadSecond = slot.perspective === 'LEAD' && slot.confirmedSamples === 1
  if (leadSecond && (slot.status === 'OPEN' || slot.status === 'SATISFIED')) return 'SECOND'
  return null
}

function askableThisWeek(slot: SchedulableSlot, week: number): boolean {
  if (slot.hasOpenPrompt) return false
  if (slot.snoozedUntilWeek !== null && week < slot.snoozedUntilWeek) return false
  return slot.lastAskedWeek === null || week - slot.lastAskedWeek >= MIN_WEEKS_BETWEEN_ASKS
}

export function planBatch(input: BatchInput): string[] {
  if (input.week < 1 || input.week > input.totalWeeks) return []
  const questionWeeks = questionWeekCount(input.totalWeeks)
  const catchUp = input.week > questionWeeks
  const weeksLeft = (catchUp ? input.totalWeeks : questionWeeks) - input.week + 1
  const wanted = input.slots
    .map((slot) => ({ slot, sample: wantedSample(slot) }))
    .filter((entry): entry is { slot: SchedulableSlot; sample: Sample } => entry.sample !== null && !(catchUp && entry.sample === 'SECOND'))
  const target = Math.min(input.cap, Math.ceil(wanted.length / Math.max(1, weeksLeft)))
  const capacity = target - input.openPromptCount
  if (capacity <= 0) return []
  const evidence = (id: string) => input.evidenceByEvaluatee.get(id) ?? 0
  const ranked = wanted
    .filter(({ slot }) => askableThisWeek(slot, input.week))
    .sort((a, b) =>
      (a.sample === b.sample ? 0 : a.sample === 'FIRST' ? -1 : 1) ||
      (a.slot.perspective === b.slot.perspective ? 0 : a.slot.perspective === 'LEAD' ? -1 : b.slot.perspective === 'LEAD' ? 1 : 0) ||
      evidence(a.slot.evaluateeId) - evidence(b.slot.evaluateeId) ||
      Number(a.slot.lastAskedWeek !== null) - Number(b.slot.lastAskedWeek !== null) ||
      a.slot.id.localeCompare(b.slot.id),
    )
  const perEvaluatee = new Map<string, number>()
  const batch: string[] = []
  for (const { slot } of ranked) {
    if (batch.length >= capacity) break
    const count = perEvaluatee.get(slot.evaluateeId) ?? 0
    if (count >= MAX_PER_EVALUATEE_PER_BATCH) continue
    perEvaluatee.set(slot.evaluateeId, count + 1)
    batch.push(slot.id)
  }
  return batch
}

/** Rotate A/B: the variant asked least for this slot, ties broken by variant letter. */
export function nextVariant<T extends { id: string; variant: string }>(variants: readonly T[], askedVariantIds: readonly string[]): T | null {
  if (variants.length === 0) return null
  const uses = (id: string) => askedVariantIds.filter((asked) => asked === id).length
  return [...variants].sort((a, b) => uses(a.id) - uses(b.id) || a.variant.localeCompare(b.variant))[0]
}
