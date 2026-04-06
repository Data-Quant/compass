import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  PRE_EVALUATION_QUESTION_COUNT,
  saveDraftQuestions,
  syncPrepStatus,
  getCurrentLeadPrep,
} from '@/lib/pre-evaluation'

const submitSchema = z.object({
  questions: z.array(z.string().trim().min(1).max(1000)).length(PRE_EVALUATION_QUESTION_COUNT),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prep = await getCurrentLeadPrep(user.id)
    if (!prep) {
      return NextResponse.json({ error: 'No active pre-evaluation task found' }, { status: 404 })
    }
    if (!prep.editable) {
      return NextResponse.json(
        { error: 'This pre-evaluation task is no longer editable' },
        { status: 403 }
      )
    }
    if (prep.questionsSubmittedAt) {
      return NextResponse.json(
        { error: 'Evaluation questions have already been submitted' },
        { status: 400 }
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
          questionsSubmittedAt: new Date(),
        },
      })
    })

    const synced = await syncPrepStatus(prisma, prep.id)
    return NextResponse.json({ success: true, prep: synced })
  } catch (error) {
    console.error('Failed to submit pre-evaluation questions:', error)
    return NextResponse.json(
      { error: 'Failed to submit evaluation questions' },
      { status: 500 }
    )
  }
}
