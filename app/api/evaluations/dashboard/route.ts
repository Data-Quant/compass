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
    const period = periodId === 'active'
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

    // Get evaluator mappings
    const mappings = await prisma.evaluatorMapping.findMany({
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
    })

    // Get completion status for each mapping
    const mappingsWithStatus = await Promise.all(
      mappings.map(async (mapping) => {
        // Get questions for this relationship type
        const questions = await prisma.evaluationQuestion.findMany({
          where: { relationshipType: mapping.relationshipType },
          orderBy: { orderIndex: 'asc' },
        })

        // Get evaluations
        const evaluations = await prisma.evaluation.findMany({
          where: {
            evaluatorId: user.id,
            evaluateeId: mapping.evaluateeId,
            periodId: period.id,
          },
        })

        const completed = evaluations.filter((e) => e.submittedAt !== null).length
        const total = questions.length
        const isComplete = completed === total && total > 0

        return {
          ...mapping,
          questionsCount: total,
          completedCount: completed,
          isComplete,
        }
      })
    )

    // Group by relationship type
    const grouped = mappingsWithStatus.reduce((acc, mapping) => {
      const type = mapping.relationshipType
      if (!acc[type]) {
        acc[type] = []
      }
      acc[type].push(mapping)
      return acc
    }, {} as Record<string, typeof mappingsWithStatus>)

    return NextResponse.json({
      period,
      mappings: grouped,
      totalMappings: mappings.length,
      completedMappings: mappingsWithStatus.filter((m) => m.isComplete).length,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
