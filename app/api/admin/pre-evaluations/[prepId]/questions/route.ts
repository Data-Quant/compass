import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import {
  PRE_EVALUATION_QUESTION_COUNT,
  saveDraftQuestions,
  syncPrepStatus,
} from '@/lib/pre-evaluation'
import { normalizeRatingDescriptions } from '@/lib/rating-descriptions'

const leadQuestionSchema = z.object({
  questionText: z.string().max(1000),
  ratingDescriptions: z
    .object({
      1: z.string().max(1000).optional(),
      2: z.string().max(1000).optional(),
      3: z.string().max(1000).optional(),
      4: z.string().max(1000).optional(),
    })
    .partial()
    .optional(),
})

const submitSchema = z.object({
  questions: z
    .array(z.union([z.string().trim().min(1).max(1000), leadQuestionSchema]))
    .length(PRE_EVALUATION_QUESTION_COUNT),
})

const draftSchema = z.object({
  questions: z
    .array(z.union([z.string().max(1000), leadQuestionSchema]))
    .max(PRE_EVALUATION_QUESTION_COUNT),
})

function normalizeQuestions(
  questions: Array<string | z.infer<typeof leadQuestionSchema>>
) {
  return questions.map((question, index) => {
    if (typeof question === 'string') {
      return {
        orderIndex: index + 1,
        questionText: question,
        ratingDescriptions: normalizeRatingDescriptions(),
      }
    }

    return {
      orderIndex: index + 1,
      questionText: question.questionText,
      ratingDescriptions: normalizeRatingDescriptions(question.ratingDescriptions),
    }
  })
}

async function getPrep(prepId: string) {
  return prisma.preEvaluationLeadPrep.findUnique({
    where: { id: prepId },
    include: {
      period: {
        select: {
          reviewStartDate: true,
        },
      },
      questions: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ prepId: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prepId } = await params
    const prep = await getPrep(prepId)
    if (!prep) {
      return NextResponse.json({ error: 'Pre-evaluation prep not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = draftSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    await saveDraftQuestions(
      prep.id,
      normalizeQuestions(parsed.data.questions)
    )

    const questions = await prisma.preEvaluationLeadQuestion.findMany({
      where: { prepId: prep.id },
      orderBy: { orderIndex: 'asc' },
    })

    return NextResponse.json({ success: true, questions })
  } catch (error) {
    console.error('Failed to save admin pre-evaluation questions:', error)
    return NextResponse.json(
      { error: 'Failed to save questions' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ prepId: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prepId } = await params
    const prep = await getPrep(prepId)
    if (!prep) {
      return NextResponse.json({ error: 'Pre-evaluation prep not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = submitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: `You must submit exactly ${PRE_EVALUATION_QUESTION_COUNT} questions`,
          details: parsed.error.errors,
        },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await saveDraftQuestions(
        prep.id,
        normalizeQuestions(parsed.data.questions),
        tx
      )

      await tx.preEvaluationLeadPrep.update({
        where: { id: prep.id },
        data: {
          questionsSubmittedAt: prep.questionsSubmittedAt || new Date(),
        },
      })
    })

    const synced = await syncPrepStatus(prisma, prep.id)
    return NextResponse.json({ success: true, prep: synced })
  } catch (error) {
    console.error('Failed to submit admin pre-evaluation questions:', error)
    return NextResponse.json(
      { error: 'Failed to submit questions' },
      { status: 500 }
    )
  }
}
