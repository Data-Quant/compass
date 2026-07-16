import type { QuestionType } from '@prisma/client'
import { getEvaluationQuestionMeta } from '@/lib/pre-evaluation'

/**
 * The minimum shape the scoring math needs from an evaluation row. Kept
 * structural (not a Prisma type) so analytics fixtures and Prisma rows both fit.
 */
export interface NormalizableEvaluation {
  evaluatorId: string
  ratingValue: number | null
  questionId: string | null
  question?: {
    questionText: string
    maxRating: number
    questionType: QuestionType
  } | null
  leadQuestionId?: string | null
  leadQuestion?: {
    questionText: string
    orderIndex: number
  } | null
}

export interface LensNormalization {
  rawScore: number
  maxScore: number
  /** 0-4 scale. */
  normalizedScore: number
  evaluatorCount: number
}

/**
 * Normalize one relationship lens to a 0-4 score.
 *
 * Each question is first averaged across the evaluators who answered it, so a
 * lens with many evaluators is not weighted more heavily than a lens with one.
 * The per-question averages are then summed and divided by the summed max
 * ratings.
 *
 * This mirrors the inline math in `lib/scoring.ts`, which is deliberately left
 * untouched (it drives real reports and has no test coverage). The two are held
 * together empirically by `scripts/verify-analytics-scores.ts`, which asserts
 * both produce identical overall scores against real data. Re-run it if
 * `lib/scoring.ts` ever changes.
 */
export function normalizeLensEvaluations(
  evaluations: readonly NormalizableEvaluation[]
): LensNormalization {
  const questionGroups = new Map<string, NormalizableEvaluation[]>()
  for (const evaluation of evaluations) {
    const meta = getEvaluationQuestionMeta(evaluation)
    if (!meta) continue
    questionGroups.set(meta.key, [...(questionGroups.get(meta.key) || []), evaluation])
  }

  let rawScore = 0
  let maxScore = 0
  const evaluatorIds = new Set<string>()

  for (const group of questionGroups.values()) {
    const meta = getEvaluationQuestionMeta(group[0])
    if (!meta || meta.questionType !== 'RATING') continue

    let questionTotal = 0
    let questionCount = 0
    for (const evaluation of group) {
      if (evaluation.ratingValue !== null) {
        questionTotal += evaluation.ratingValue
        questionCount++
        evaluatorIds.add(evaluation.evaluatorId)
      }
    }

    if (questionCount > 0) {
      rawScore += questionTotal / questionCount
      maxScore += meta.maxRating
    }
  }

  return {
    rawScore,
    maxScore,
    normalizedScore: maxScore > 0 ? (rawScore / maxScore) * 4 : 0,
    evaluatorCount: evaluatorIds.size,
  }
}

/**
 * Convert weighted 0-4 lens contributions into a 0-100 overall score.
 */
export function computeOverallScorePercent(
  contributions: ReadonlyArray<{ normalizedScore: number; weight: number }>
): number {
  const total = contributions.reduce(
    (sum, contribution) => sum + contribution.normalizedScore * contribution.weight,
    0
  )
  return (total / 4) * 100
}
