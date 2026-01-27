import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { evaluateeId: string } }
) {
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

    const evaluateeId = params.evaluateeId

    // Get relationship type
    const mapping = await prisma.evaluatorMapping.findFirst({
      where: {
        evaluatorId: user.id,
        evaluateeId,
      },
    })

    if (!mapping) {
      return NextResponse.json(
        { error: 'You are not authorized to evaluate this person' },
        { status: 403 }
      )
    }

    // Get questions for this relationship type
    const questions = await prisma.evaluationQuestion.findMany({
      where: { relationshipType: mapping.relationshipType },
      orderBy: { orderIndex: 'asc' },
    })

    // Get existing evaluations
    const evaluations = await prisma.evaluation.findMany({
      where: {
        evaluatorId: user.id,
        evaluateeId,
        periodId,
      },
    })

    // Map evaluations to questions
    const questionsWithResponses = questions.map((question) => {
      const evaluation = evaluations.find((e) => e.questionId === question.id)
      return {
        ...question,
        ratingValue: evaluation?.ratingValue ?? null,
        textResponse: evaluation?.textResponse ?? null,
        submittedAt: evaluation?.submittedAt,
      }
    })

    return NextResponse.json({
      evaluatee: await prisma.user.findUnique({
        where: { id: evaluateeId },
        select: {
          id: true,
          name: true,
          department: true,
          position: true,
        },
      }),
      relationshipType: mapping.relationshipType,
      questions: questionsWithResponses,
      isSubmitted: evaluations.some((e) => e.submittedAt !== null),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch evaluation data' },
      { status: 500 }
    )
  }
}
