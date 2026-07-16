import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import {
  computePeriodScoreMatrix,
  type PeriodScoreMatrix,
} from '@/lib/analytics/period-score-matrix'
import { computeTrends } from '@/lib/analytics/trends'
import { computeTalentGrid } from '@/lib/analytics/talent-grid'
import { computeBlindSpots } from '@/lib/analytics/blind-spots'
import { computeCalibration, type CapUsage } from '@/lib/analytics/calibration'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { getResolvedQuestionCount } from '@/lib/pre-evaluation'
import {
  getFourRatingQuotaScopeType,
  getMaxAllowedFourRatings,
  isExemptFromFourRatingCapByTitle,
  shouldCountAssignmentTowardsFourRatingQuota,
} from '@/lib/evaluation-rating-quota'
import { HAMIZ_EVALUATOR } from '@/lib/config'

/**
 * Evaluators whose four-rating budget is unlimited: any partner-level title,
 * plus the configured C-level evaluator. Mirrors lib/evaluation-rating-quota.
 */
async function getExemptEvaluatorIds(): Promise<Set<string>> {
  const users = await prisma.user.findMany({ select: { id: true, name: true, position: true } })
  const exemptName = HAMIZ_EVALUATOR.trim().toLowerCase()

  return new Set(
    users
      .filter(
        (user) =>
          isExemptFromFourRatingCapByTitle(user.position) ||
          (user.name || '').trim().toLowerCase() === exemptName
      )
      .map((user) => user.id)
  )
}

/**
 * Build per-(evaluator, quota scope) four-rating usage for the period.
 *
 * Question counts are resolved per assignment exactly as the existing analytics
 * route does, then grouped into the same quota scopes the submit-time validator
 * uses, so "at cap" here means what it means at submit time.
 */
async function buildCapUsage(periodId: string): Promise<CapUsage[]> {
  const assignments = await getResolvedEvaluationAssignments(periodId)
  const quotaAssignments = assignments.filter((assignment) =>
    shouldCountAssignmentTowardsFourRatingQuota({
      assignment: {
        evaluatorId: assignment.evaluatorId,
        evaluateeId: assignment.evaluateeId,
        relationshipType: assignment.relationshipType as RelationshipType,
      },
    })
  )

  const questionCounts = await Promise.all(
    quotaAssignments.map(async (assignment) => ({
      evaluatorId: assignment.evaluatorId,
      evaluateeId: assignment.evaluateeId,
      scope: getFourRatingQuotaScopeType(assignment.relationshipType as RelationshipType),
      total: await getResolvedQuestionCount({
        relationshipType: assignment.relationshipType as RelationshipType,
        periodId,
        evaluatorId: assignment.evaluatorId,
        evaluateeId: assignment.evaluateeId,
      }),
    }))
  )

  const totalsByKey = new Map<string, { evaluatorId: string; scope: string; total: number }>()
  for (const entry of questionCounts) {
    const key = `${entry.evaluatorId}:${entry.scope}`
    const existing = totalsByKey.get(key)
    totalsByKey.set(key, {
      evaluatorId: entry.evaluatorId,
      scope: entry.scope,
      total: (existing?.total ?? 0) + entry.total,
    })
  }

  const scopeByPair = new Map(
    quotaAssignments.map((assignment) => [
      `${assignment.evaluatorId}:${assignment.evaluateeId}`,
      getFourRatingQuotaScopeType(assignment.relationshipType as RelationshipType),
    ])
  )
  const submittedFours = await prisma.evaluation.findMany({
    where: { periodId, submittedAt: { not: null }, ratingValue: 4 },
    select: { evaluatorId: true, evaluateeId: true },
  })

  const usedByKey = new Map<string, number>()
  for (const evaluation of submittedFours) {
    const scope = scopeByPair.get(`${evaluation.evaluatorId}:${evaluation.evaluateeId}`)
    if (!scope) continue
    const key = `${evaluation.evaluatorId}:${scope}`
    usedByKey.set(key, (usedByKey.get(key) ?? 0) + 1)
  }

  return [...totalsByKey.entries()].map(([key, entry]) => ({
    evaluatorId: entry.evaluatorId,
    scope: entry.scope,
    usedFours: usedByKey.get(key) ?? 0,
    maxAllowed: getMaxAllowedFourRatings(entry.total),
  }))
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const periods = await prisma.evaluationPeriod.findMany({ orderBy: { startDate: 'asc' } })
    if (periods.length === 0) {
      return NextResponse.json({ error: 'No period found' }, { status: 404 })
    }

    // Only periods with submitted evaluations can produce scores.
    const periodsWithData = await prisma.evaluation.groupBy({
      by: ['periodId'],
      where: { submittedAt: { not: null } },
    })
    const withDataIds = new Set(periodsWithData.map((entry) => entry.periodId))
    const scorablePeriods = periods.filter((period) => withDataIds.has(period.id))

    if (scorablePeriods.length === 0) {
      return NextResponse.json({ error: 'No evaluation data found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const requestedPeriodId = searchParams.get('periodId')
    const activePeriod = scorablePeriods.find((period) => period.isActive)
    const latestPeriod = scorablePeriods[scorablePeriods.length - 1]
    const currentPeriod =
      (requestedPeriodId && requestedPeriodId !== 'active'
        ? scorablePeriods.find((period) => period.id === requestedPeriodId)
        : undefined) ||
      activePeriod ||
      latestPeriod

    const currentIndex = scorablePeriods.findIndex((period) => period.id === currentPeriod.id)
    const comparisonPeriod = currentIndex > 0 ? scorablePeriods[currentIndex - 1] : null

    const matrices = (
      await Promise.all(
        scorablePeriods.map(async (period) => {
          try {
            return await computePeriodScoreMatrix(period.id)
          } catch (error) {
            console.error(`Failed to compute score matrix for period ${period.id}:`, error)
            return null
          }
        })
      )
    ).filter((matrix): matrix is PeriodScoreMatrix => matrix !== null)

    const currentMatrix = matrices.find((matrix) => matrix.periodId === currentPeriod.id)
    if (!currentMatrix) {
      return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 })
    }
    const comparisonMatrix =
      matrices.find((matrix) => matrix.periodId === comparisonPeriod?.id) || null

    const [exemptEvaluatorIds, capUsage, ratingRows] = await Promise.all([
      getExemptEvaluatorIds(),
      buildCapUsage(currentPeriod.id),
      prisma.evaluation.findMany({
        where: {
          periodId: currentPeriod.id,
          submittedAt: { not: null },
          ratingValue: { not: null },
        },
        select: { evaluatorId: true, ratingValue: true },
      }),
    ])

    return NextResponse.json({
      currentPeriod: { id: currentPeriod.id, name: currentPeriod.name },
      comparisonPeriod: comparisonPeriod
        ? { id: comparisonPeriod.id, name: comparisonPeriod.name }
        : null,
      periods: scorablePeriods.map((period) => ({ id: period.id, name: period.name })),
      trends: computeTrends({
        matrices,
        currentPeriodId: currentPeriod.id,
        comparisonPeriodId: comparisonPeriod?.id ?? null,
      }),
      talentGrid: computeTalentGrid({ current: currentMatrix, comparison: comparisonMatrix }),
      blindSpots: computeBlindSpots(currentMatrix),
      calibration: computeCalibration({
        ratings: ratingRows.map((row) => ({
          evaluatorId: row.evaluatorId,
          ratingValue: row.ratingValue as number,
        })),
        capUsage,
        exemptEvaluatorIds,
      }),
    })
  } catch (error) {
    console.error('Failed to fetch analytics insights:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics insights' }, { status: 500 })
  }
}
