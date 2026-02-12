import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

    // Get active period if not specified
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

    // ── Batch queries (4 DB calls instead of 42) ──

    const [mappings, questionsByType, allEvaluations] = await Promise.all([
      // 1. Get evaluator mappings with evaluatee info
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

      // 2. All questions grouped by relationship type (was repeated per mapping)
      prisma.evaluationQuestion.groupBy({
        by: ['relationshipType'],
        _count: { id: true },
      }),

      // 3. All evaluations for this user + period in one query
      prisma.evaluation.findMany({
        where: {
          evaluatorId: user.id,
          periodId: period.id,
          submittedAt: { not: null },
        },
        select: { evaluateeId: true },
      }),
    ])

    // ── Join in-memory ──

    const questionCountMap = new Map(
      questionsByType.map((q) => [q.relationshipType, q._count.id])
    )

    // Group evaluations by evaluateeId
    const evalsByEvaluatee = new Map<string, number>()
    for (const ev of allEvaluations) {
      evalsByEvaluatee.set(
        ev.evaluateeId,
        (evalsByEvaluatee.get(ev.evaluateeId) || 0) + 1
      )
    }

    const mappingsWithStatus = mappings.map((mapping) => {
      const total = questionCountMap.get(mapping.relationshipType) || 0
      const completed = evalsByEvaluatee.get(mapping.evaluateeId) || 0
      const isComplete = completed >= total && total > 0

      return {
        ...mapping,
        questionsCount: total,
        completedCount: completed,
        isComplete,
      }
    })

    // Group by relationship type
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
      completedMappings: mappingsWithStatus.filter((m) => m.isComplete).length,
    })
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
