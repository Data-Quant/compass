import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import type { RelationshipType } from '@/types'

const evaluationSchema = z.object({
  evaluateeId: z.string().trim().min(1),
  periodId: z.string().trim().min(1),
  responses: z.array(
    z.object({
      questionId: z.string().trim().min(1),
      ratingValue: z.number().min(1).max(4).optional(),
      textResponse: z.string().max(5000).optional(),
    })
  ).min(1),
})

const evaluationDraftSchema = z.object({
  evaluateeId: z.string().trim().min(1),
  periodId: z.string().trim().min(1),
  questionId: z.string().trim().min(1),
  ratingValue: z.number().min(1).max(4).nullable().optional(),
  textResponse: z.string().max(5000).nullable().optional(),
})

async function getAllowedQuestionIds(relationshipType: RelationshipType) {
  const questions = await prisma.evaluationQuestion.findMany({
    where: { relationshipType },
    select: { id: true },
  })
  return new Set(questions.map((q) => q.id))
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = evaluationSchema.parse(body)

    // Check if period is locked
    const period = await prisma.evaluationPeriod.findUnique({
      where: { id: data.periodId },
    })

    if (period?.isLocked) {
      return NextResponse.json(
        { error: 'This evaluation period is locked. Submissions are no longer accepted.' },
        { status: 403 }
      )
    }

    // Validate that evaluator has permission to evaluate this person
    const mapping = await prisma.evaluatorMapping.findFirst({
      where: {
        evaluatorId: user.id,
        evaluateeId: data.evaluateeId,
      },
    })

    if (!mapping) {
      return NextResponse.json(
        { error: 'You are not authorized to evaluate this person' },
        { status: 403 }
      )
    }

    const allowedQuestionIds = await getAllowedQuestionIds(mapping.relationshipType as RelationshipType)
    if (allowedQuestionIds.size === 0) {
      return NextResponse.json(
        { error: 'No evaluation questions configured for this relationship type' },
        { status: 400 }
      )
    }

    const seenQuestionIds = new Set<string>()
    for (const response of data.responses) {
      if (!allowedQuestionIds.has(response.questionId)) {
        return NextResponse.json(
          { error: 'One or more questions are not valid for this evaluation relationship' },
          { status: 400 }
        )
      }
      if (seenQuestionIds.has(response.questionId)) {
        return NextResponse.json(
          { error: 'Duplicate question responses are not allowed' },
          { status: 400 }
        )
      }
      seenQuestionIds.add(response.questionId)
    }

    // Save or update evaluations
    const evaluations = []
    for (const response of data.responses) {
      const evaluation = await prisma.evaluation.upsert({
        where: {
          evaluatorId_evaluateeId_questionId_periodId: {
            evaluatorId: user.id,
            evaluateeId: data.evaluateeId,
            questionId: response.questionId,
            periodId: data.periodId,
          },
        },
        create: {
          evaluatorId: user.id,
          evaluateeId: data.evaluateeId,
          questionId: response.questionId,
          periodId: data.periodId,
          ratingValue: response.ratingValue ?? null,
          textResponse: response.textResponse ?? null,
          submittedAt: new Date(),
        },
        update: {
          ratingValue: response.ratingValue ?? null,
          textResponse: response.textResponse ?? null,
          submittedAt: new Date(),
        },
      })
      evaluations.push(evaluation)
    }

    return NextResponse.json({ success: true, evaluations })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Failed to submit evaluation:', error)
    return NextResponse.json(
      { error: 'Failed to submit evaluation' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = evaluationDraftSchema.parse(body)
    const { evaluateeId, periodId, questionId, ratingValue, textResponse } = data

    // Check if period is locked
    const period = await prisma.evaluationPeriod.findUnique({
      where: { id: periodId },
    })

    if (period?.isLocked) {
      return NextResponse.json(
        { error: 'This evaluation period is locked. Submissions are no longer accepted.' },
        { status: 403 }
      )
    }

    // Validate that evaluator has permission to evaluate this person
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

    const allowedQuestionIds = await getAllowedQuestionIds(mapping.relationshipType as RelationshipType)
    if (!allowedQuestionIds.has(questionId)) {
      return NextResponse.json(
        { error: 'Question is not valid for this evaluation relationship' },
        { status: 400 }
      )
    }

    // Save as draft (no submittedAt)
    const evaluation = await prisma.evaluation.upsert({
      where: {
        evaluatorId_evaluateeId_questionId_periodId: {
          evaluatorId: user.id,
          evaluateeId,
          questionId,
          periodId,
        },
      },
      create: {
        evaluatorId: user.id,
        evaluateeId,
        questionId,
        periodId,
        ratingValue: ratingValue ?? null,
        textResponse: textResponse ?? null,
      },
      update: {
        ratingValue: ratingValue ?? null,
        textResponse: textResponse ?? null,
      },
    })

    return NextResponse.json({ success: true, evaluation })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Failed to save draft:', error)
    return NextResponse.json(
      { error: 'Failed to save draft' },
      { status: 500 }
    )
  }
}
