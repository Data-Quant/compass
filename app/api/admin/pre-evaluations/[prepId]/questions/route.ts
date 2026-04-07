import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import {
  isPrepEditable,
  PRE_EVALUATION_QUESTION_COUNT,
  saveDraftQuestions,
  syncPrepStatus,
} from '@/lib/pre-evaluation'

const draftSchema = z.object({
  questions: z.array(z.string().max(1000)).max(PRE_EVALUATION_QUESTION_COUNT),
})

const submitSchema = z.object({
  questions: z.array(z.string().trim().min(1).max(1000)).length(PRE_EVALUATION_QUESTION_COUNT),
})

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
    if (!isPrepEditable(prep.period.reviewStartDate)) {
      return NextResponse.json(
        { error: 'This pre-evaluation task is no longer editable' },
        { status: 403 }
      )
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
      parsed.data.questions.map((questionText, index) => ({
        orderIndex: index + 1,
        questionText,
      }))
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
    if (!isPrepEditable(prep.period.reviewStartDate)) {
      return NextResponse.json(
        { error: 'This pre-evaluation task is no longer editable' },
        { status: 403 }
      )
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
        parsed.data.questions.map((questionText, index) => ({
          orderIndex: index + 1,
          questionText,
        })),
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
