import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [attempts, config] = await Promise.all([
      prisma.quizAttempt.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.onboardingConfig.upsert({
        where: { id: 'singleton' },
        update: {},
        create: {
          id: 'singleton',
          quizPassPercent: 80,
          maxQuizAttempts: 3,
          welcomeMessage: 'Welcome to Compass onboarding.',
        },
      }),
    ])

    const attemptsRemaining = Math.max(0, config.maxQuizAttempts - attempts.length)
    return NextResponse.json({
      attempts,
      attemptCount: attempts.length,
      attemptsRemaining,
      maxQuizAttempts: config.maxQuizAttempts,
    })
  } catch (error) {
    console.error('Failed to fetch quiz attempts:', error)
    return NextResponse.json({ error: 'Failed to fetch quiz attempts' }, { status: 500 })
  }
}
