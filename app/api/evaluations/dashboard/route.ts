import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import { getResolvedQuestionCount } from '@/lib/pre-evaluation'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId')

    if (!periodId) {
      return NextResponse.json(
        { error: 'periodId is required' },
        { status: 400 }
      )
    }

    const period =
      periodId === 'active'
        ? await prisma.evaluationPeriod.findFirst({
            where: { isActive: true },
          })
        : await prisma.evaluationPeriod.findUnique({
            where: { id: periodId },
          })

    if (!period) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      )
    }

    const [mappings, allEvaluations] = await Promise.all([
      prisma.evaluatorMapping.findMany({
        where: { evaluatorId: user.id },
        include: {
          evaluatee: {
            select: {
              id: true,
              name: true,
              department: true,
              position: true,
            },
          },
        },
      }),
      prisma.evaluation.findMany({
        where: {
          evaluatorId: user.id,
          periodId: period.id,
          submittedAt: { not: null },
        },
        select: {
          evaluateeId: true,
        },
      }),
    ])

    const evalsByEvaluatee = new Map<string, number>()
    for (const evaluation of allEvaluations) {
      evalsByEvaluatee.set(
        evaluation.evaluateeId,
        (evalsByEvaluatee.get(evaluation.evaluateeId) || 0) + 1
      )
    }

    const questionCounts = await Promise.all(
      mappings.map(async (mapping) => ({
        mappingId: mapping.id,
        total: await getResolvedQuestionCount({
          relationshipType: mapping.relationshipType as RelationshipType,
          periodId: period.id,
          evaluatorId: user.id,
          evaluateeId: mapping.evaluatee.id,
        }),
      }))
    )
    const questionCountMap = new Map(questionCounts.map((entry) => [entry.mappingId, entry.total]))

    const mappingsWithStatus = mappings.map((mapping) => {
      const total = questionCountMap.get(mapping.id) || 0
      const completed = evalsByEvaluatee.get(mapping.evaluateeId) || 0
      const isComplete = completed >= total && total > 0

      return {
        ...mapping,
        questionsCount: total,
        completedCount: completed,
        isComplete,
      }
    })

    const grouped = mappingsWithStatus.reduce(
      (acc, mapping) => {
        const type = mapping.relationshipType
        if (!acc[type]) {
          acc[type] = []
        }
        acc[type].push(mapping)
        return acc
      },
      {} as Record<string, typeof mappingsWithStatus>
    )

    return NextResponse.json({
      period,
      mappings: grouped,
      totalMappings: mappings.length,
      completedMappings: mappingsWithStatus.filter((mapping) => mapping.isComplete).length,
    })
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
