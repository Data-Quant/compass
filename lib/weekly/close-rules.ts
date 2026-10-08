import { questionWeekCount } from './calendar'
import type { Perspective, WeeklyRelationshipType } from './perspectives'
/** The assignments a category covers. Dropping PEER must remove cross-department assignments too (the scorer treats them as PEER). */
export const RELATIONSHIP_TYPES_BY_PERSPECTIVE: Record<Perspective, readonly WeeklyRelationshipType[]> = {
  LEAD: ['TEAM_LEAD'],
  UPWARD: ['DIRECT_REPORT'],
  PEER: ['PEER', 'CROSS_DEPARTMENT'],
}

export const categoryKey = (evaluateeId: string, perspective: Perspective): string => `${evaluateeId}|${perspective}`

/** D8: categories with no accepted evidence at all; HR confirms each before it is dropped. */
export function dropCandidates(
  categories: ReadonlyArray<{ evaluateeId: string; perspective: Perspective }>,
  confirmedByCategory: ReadonlyMap<string, number>,
): Array<{ evaluateeId: string; perspective: Perspective }> {
  return categories
    .filter((c) => (confirmedByCategory.get(categoryKey(c.evaluateeId, c.perspective)) ?? 0) === 0)
    .map((c) => ({ evaluateeId: c.evaluateeId, perspective: c.perspective }))
}

/** Spec 9: the end-of-quarter forms open in the two catch-up weeks, or earlier when HR opens them. */
export function formsAreOpen(input: { status: string; formsOpenAt: Date | null; week: number; totalWeeks: number; now: Date }): boolean {
  if (input.status !== 'RUNNING') return false
  if (input.formsOpenAt !== null && input.formsOpenAt <= input.now) return true
  return input.week > questionWeekCount(input.totalWeeks)
}
