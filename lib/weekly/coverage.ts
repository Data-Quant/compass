import type { Perspective } from './perspectives'

/** Spec 7.6: a group is scored only with at least 60% of its topics satisfied and one evaluator contributing. */
export const LOW_EVIDENCE_THRESHOLD = 0.6

export interface CoverageSlot { evaluateeId: string; evaluatorId: string; perspective: Perspective; status: string }
export interface CoverageRow {
  evaluateeId: string
  perspective: Perspective
  satisfied: number
  total: number
  evaluatorsContributing: number
  share: number
  lowEvidence: boolean
}

export function categoryCoverage(slots: readonly CoverageSlot[]): CoverageRow[] {
  const groups = new Map<string, CoverageSlot[]>()
  for (const slot of slots) {
    if (slot.status === 'CANCELLED') continue
    const key = `${slot.evaluateeId}|${slot.perspective}`
    groups.set(key, [...(groups.get(key) ?? []), slot])
  }
  return [...groups.values()].map((group) => {
    const satisfied = group.filter((s) => s.status === 'SATISFIED')
    const contributors = new Set(satisfied.map((s) => s.evaluatorId)).size
    const share = group.length ? satisfied.length / group.length : 0
    return {
      evaluateeId: group[0].evaluateeId, perspective: group[0].perspective, satisfied: satisfied.length, total: group.length,
      evaluatorsContributing: contributors, share, lowEvidence: share < LOW_EVIDENCE_THRESHOLD || contributors === 0,
    }
  })
}
