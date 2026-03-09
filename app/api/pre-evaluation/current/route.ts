import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getCurrentLeadPrep, PRE_EVALUATION_QUESTION_COUNT } from '@/lib/pre-evaluation'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prep = await getCurrentLeadPrep(user.id)
    if (!prep) {
      return NextResponse.json({ prep: null })
    }

    const progressCount = Number(Boolean(prep.questionsSubmittedAt)) + Number(Boolean(prep.evaluateesSubmittedAt))

    return NextResponse.json({
      prep: {
        ...prep,
        requiredQuestionCount: PRE_EVALUATION_QUESTION_COUNT,
        progressCount,
        totalSections: 2,
      },
    })
  } catch (error) {
    console.error('Failed to fetch pre-evaluation prep:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pre-evaluation prep' },
      { status: 500 }
    )
  }
}
