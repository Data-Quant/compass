import { PERSPECTIVE_ORDER, type Perspective } from './perspectives'

export interface DriftRow { evaluatorId: string; perspective: Perspective; difference: number; count: number }
export const DRIFT_THRESHOLD = 0.75
export const DRIFT_MIN_SCORES = 3

/** Evaluators whose average score sits far from everyone else's in the same perspective (at least 3 answers). */
export function evaluatorDrift(rows: ReadonlyArray<{ evaluatorId: string; perspective: Perspective; finalScore: number }>): DriftRow[] {
  const average = (list: ReadonlyArray<{ finalScore: number }>) => list.reduce((sum, r) => sum + r.finalScore, 0) / list.length
  const result: DriftRow[] = []
  for (const perspective of PERSPECTIVE_ORDER) {
    const group = rows.filter((r) => r.perspective === perspective)
    const evaluators = [...new Set(group.map((r) => r.evaluatorId))]
    if (evaluators.length < 2) continue
    const groupMean = average(group)
    for (const evaluatorId of evaluators) {
      const mine = group.filter((r) => r.evaluatorId === evaluatorId)
      if (mine.length < DRIFT_MIN_SCORES) continue
      const difference = average(mine) - groupMean
      if (Math.abs(difference) >= DRIFT_THRESHOLD) result.push({ evaluatorId, perspective, difference, count: mine.length })
    }
  }
  return result.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
}
