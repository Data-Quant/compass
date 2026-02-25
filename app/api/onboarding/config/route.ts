import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'

async function getOrCreateConfig() {
  return prisma.onboardingConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      quizPassPercent: 80,
      maxQuizAttempts: 3,
      welcomeMessage: 'Welcome to Compass onboarding.',
    },
  })
}

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = await getOrCreateConfig()
    return NextResponse.json({ config })
  } catch (error) {
    console.error('Failed to fetch onboarding config:', error)
    return NextResponse.json({ error: 'Failed to fetch onboarding config' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const quizPassPercent = typeof body.quizPassPercent === 'number' ? body.quizPassPercent : undefined
    const maxQuizAttempts = typeof body.maxQuizAttempts === 'number' ? body.maxQuizAttempts : undefined
    const welcomeMessage = typeof body.welcomeMessage === 'string' ? body.welcomeMessage : undefined

    if (quizPassPercent !== undefined && (quizPassPercent < 1 || quizPassPercent > 100)) {
      return NextResponse.json({ error: 'quizPassPercent must be between 1 and 100' }, { status: 400 })
    }
    if (maxQuizAttempts !== undefined && (!Number.isInteger(maxQuizAttempts) || maxQuizAttempts < 1)) {
      return NextResponse.json({ error: 'maxQuizAttempts must be an integer >= 1' }, { status: 400 })
    }

    const config = await prisma.onboardingConfig.upsert({
      where: { id: 'singleton' },
      update: {
        ...(quizPassPercent !== undefined ? { quizPassPercent } : {}),
        ...(maxQuizAttempts !== undefined ? { maxQuizAttempts } : {}),
        ...(welcomeMessage !== undefined ? { welcomeMessage } : {}),
      },
      create: {
        id: 'singleton',
        quizPassPercent: quizPassPercent ?? 80,
        maxQuizAttempts: maxQuizAttempts ?? 3,
        welcomeMessage: welcomeMessage ?? 'Welcome to Compass onboarding.',
      },
    })

    return NextResponse.json({ success: true, config })
  } catch (error) {
    console.error('Failed to update onboarding config:', error)
    return NextResponse.json({ error: 'Failed to update onboarding config' }, { status: 500 })
  }
}
