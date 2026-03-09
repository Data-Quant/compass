import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import { getResolvedEvaluationQuestions, getEvaluationQuestionMeta } from '@/lib/pre-evaluation'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ evaluateeId: string }> }
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

    const { evaluateeId } = await params

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

    const resolved = await getResolvedEvaluationQuestions({
      relationshipType: mapping.relationshipType as RelationshipType,
      periodId,
      evaluatorId: user.id,
      evaluateeId,
    })

    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }

    // Get existing evaluations
    const evaluations = await prisma.evaluation.findMany({
      where: {
        evaluatorId: user.id,
        evaluateeId,
        periodId,
      },
      include: {
        question: true,
        leadQuestion: true,
      },
    })

    // Map evaluations to questions
    const evaluationMap = new Map(
      evaluations
        .map((evaluation) => {
          const meta = getEvaluationQuestionMeta(evaluation)
          if (!meta) return null
          return [meta.key, evaluation] as const
        })
        .filter(Boolean) as Array<readonly [string, (typeof evaluations)[number]]>
    )

    const questionsWithResponses = resolved.questions.map((question) => {
      const evaluation = evaluationMap.get(`${question.sourceType}:${question.id}`)
      return {
        ...question,
        id: question.id,
        questionSource: question.sourceType,
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
  } catch (error) {
    console.error('Failed to fetch evaluation data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch evaluation data' },
      { status: 500 }
    )
  }
}
