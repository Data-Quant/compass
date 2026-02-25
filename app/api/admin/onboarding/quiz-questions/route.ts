import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'

function parseOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const options = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
  return options.length >= 2 ? options : null
}

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const questions = await prisma.onboardingQuizQuestion.findMany({
      orderBy: { orderIndex: 'asc' },
    })
    return NextResponse.json({ questions })
  } catch (error) {
    console.error('Failed to fetch quiz questions:', error)
    return NextResponse.json({ error: 'Failed to fetch quiz questions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const questionText = typeof body.questionText === 'string' ? body.questionText.trim() : ''
    const options = parseOptions(body.options)
    const correctAnswer = typeof body.correctAnswer === 'string' ? body.correctAnswer.trim() : ''
    const orderIndex = Number.isInteger(body.orderIndex) ? body.orderIndex : null

    if (!questionText || !options || !correctAnswer || !orderIndex) {
      return NextResponse.json(
        { error: 'questionText, options (>=2), correctAnswer, and orderIndex are required' },
        { status: 400 }
      )
    }

    if (!options.includes(correctAnswer)) {
      return NextResponse.json({ error: 'correctAnswer must match one of the options' }, { status: 400 })
    }

    const question = await prisma.onboardingQuizQuestion.create({
      data: {
        questionText,
        optionsJson: options,
        correctAnswer,
        orderIndex,
        isActive: body.isActive !== false,
      },
    })

    return NextResponse.json({ success: true, question })
  } catch (error) {
    console.error('Failed to create quiz question:', error)
    return NextResponse.json({ error: 'Failed to create quiz question' }, { status: 500 })
  }
}
