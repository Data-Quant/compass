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
  questionText: z.string().trim().min(1).max(1000),
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

const overrideSchema = z.object({
  note: z.string().trim().max(1000).optional(),
  questions: z
    .array(z.union([z.string().trim().min(1).max(1000), leadQuestionSchema]))
    .length(PRE_EVALUATION_QUESTION_COUNT)
    .optional(),
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
    const body = await request.json().catch(() => ({}))
    const parsed = overrideSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const prep = await prisma.preEvaluationLeadPrep.findUnique({
      where: { id: prepId },
      include: {
        period: {
          select: {
            reviewStartDate: true,
          },
        },
      },
    })

    if (!prep) {
      return NextResponse.json({ error: 'Pre-evaluation prep not found' }, { status: 404 })
    }

    const overrideQuestions = parsed.data.questions

    if (overrideQuestions) {
      await prisma.$transaction(async (tx) => {
        await saveDraftQuestions(
          prep.id,
          normalizeQuestions(overrideQuestions),
          tx
        )

        await tx.preEvaluationLeadPrep.update({
          where: { id: prep.id },
          data: {
            questionsSubmittedAt: prep.questionsSubmittedAt || new Date(),
            overriddenAt: new Date(),
            overriddenById: user.id,
            overrideNote: parsed.data.note || null,
          },
        })
      })

      const synced = await syncPrepStatus(prisma, prep.id)
      return NextResponse.json({ success: true, prep: synced })
    }

    const reviewStartDate = new Date(prep.period.reviewStartDate)
    reviewStartDate.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (reviewStartDate > today) {
      return NextResponse.json(
        { error: 'Overrides are only available after evaluations begin' },
        { status: 400 }
      )
    }

    const updated = await prisma.preEvaluationLeadPrep.update({
      where: { id: prepId },
      data: {
        overdueAt: prep.overdueAt || new Date(),
        overriddenAt: new Date(),
        overriddenById: user.id,
        overrideNote: parsed.data.note || null,
        status: 'OVERRIDDEN',
      },
    })

    return NextResponse.json({ success: true, prep: updated })
  } catch (error) {
    console.error('Failed to override pre-evaluation prep:', error)
    return NextResponse.json(
      { error: 'Failed to override pre-evaluation prep' },
      { status: 500 }
    )
  }
}
