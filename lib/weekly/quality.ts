import { PERSPECTIVE_ORDER, type Perspective } from './perspectives'
import type { QualityView } from './view-types'

export interface QualityRow {
  aiScore: number | null
  finalScore: number | null
  humanReviewed: boolean
  wordCount: number
  flags: readonly string[]
  topic: string
  perspective: Perspective
  evaluatorId: string
  tokens: number
}

export const LENGTH_ALERT_THRESHOLD = 0.3

export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  const mean = (values: readonly number[]) => values.slice(0, n).reduce((a, b) => a + b, 0) / n
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2
    dy += (ys[i] - my) ** 2
  }
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy)
}

export function qualityReport(rows: readonly QualityRow[]): QualityView {
  const scored = rows.filter((r) => r.aiScore !== null)
  const compared = scored.filter((r) => r.humanReviewed && r.finalScore !== null)
  const share = (count: number, total: number) => (total ? count / total : null)
  const topics = new Map<string, { adjusted: number; reviewed: number }>()
  for (const row of compared) {
    const current = topics.get(row.topic) ?? { adjusted: 0, reviewed: 0 }
    topics.set(row.topic, { adjusted: current.adjusted + (row.finalScore !== row.aiScore ? 1 : 0), reviewed: current.reviewed + 1 })
  }
  const flagCounts: Record<string, number> = {}
  for (const row of rows) for (const flag of row.flags) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1
  const final = rows.filter((r) => r.finalScore !== null)
  const correlation = pearson(scored.map((r) => r.wordCount), scored.map((r) => r.aiScore as number))
  return {
    scored: scored.length,
    reviewedByHuman: compared.length,
    exactAgreement: share(compared.filter((r) => r.finalScore === r.aiScore).length, compared.length),
    withinOneAgreement: share(compared.filter((r) => Math.abs((r.finalScore as number) - (r.aiScore as number)) <= 1).length, compared.length),
    adjustmentsByTopic: [...topics.entries()].map(([topic, counts]) => ({ topic, ...counts })).sort((a, b) => b.adjusted - a.adjusted || a.topic.localeCompare(b.topic)),
    lengthScoreCorrelation: correlation,
    lengthAlert: correlation !== null && correlation > LENGTH_ALERT_THRESHOLD,
    flagCounts,
    foursShare: Object.fromEntries(
      PERSPECTIVE_ORDER.map((p) => {
        const inGroup = final.filter((r) => r.perspective === p)
        return [p, share(inGroup.filter((r) => (r.finalScore as number) >= 4).length, inGroup.length)]
      }),
    ) as Record<Perspective, number | null>,
    tokens: rows.reduce((sum, r) => sum + r.tokens, 0),
  }
}

export interface DriftRow { evaluatorId: string; perspective: Perspective; difference: number; count: number }
export const DRIFT_THRESHOLD = 0.75
export const DRIFT_MIN_SCORES = 3

/** Spec 8.2: evaluators whose confirmed scores sit about a level above or below their group's mean. */
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
