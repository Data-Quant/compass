import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  getCurrentLeadPrep,
  PRE_EVALUATION_QUESTION_COUNT,
  saveDraftQuestions,
} from '@/lib/pre-evaluation'

const draftSchema = z.object({
  questions: z.array(z.string().max(1000)).max(PRE_EVALUATION_QUESTION_COUNT),
})

export async function PUT(request: NextRequest) {
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
    console.error('Failed to save draft pre-evaluation questions:', error)
    return NextResponse.json(
      { error: 'Failed to save draft questions' },
      { status: 500 }
    )
  }
}
