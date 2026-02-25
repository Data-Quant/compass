import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hasCompletedAllModules, getOnboardingAttemptStats } from '@/lib/onboarding'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const modulesDone = await hasCompletedAllModules(user.id)
    if (!modulesDone) {
      return NextResponse.json({ error: 'Complete all onboarding modules before taking the quiz' }, { status: 403 })
    }

    const config = await prisma.onboardingConfig.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        quizPassPercent: 80,
        maxQuizAttempts: 3,
        welcomeMessage: 'Welcome to Compass onboarding.',
      },
    })

    const { attemptCount, latestAttempt } = await getOnboardingAttemptStats(user.id)
    if (attemptCount >= config.maxQuizAttempts && !latestAttempt?.passed) {
      return NextResponse.json(
        { error: 'Maximum quiz attempts reached. Please contact HR.' },
        { status: 403 }
      )
    }

    const questions = await prisma.onboardingQuizQuestion.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        questionText: true,
        optionsJson: true,
        orderIndex: true,
      },
    })

    return NextResponse.json({
      questions,
      config: {
        quizPassPercent: config.quizPassPercent,
        maxQuizAttempts: config.maxQuizAttempts,
      },
      attemptCount,
      attemptsRemaining: Math.max(0, config.maxQuizAttempts - attemptCount),
    })
  } catch (error) {
    console.error('Failed to fetch onboarding quiz:', error)
    return NextResponse.json({ error: 'Failed to fetch onboarding quiz' }, { status: 500 })
  }
}
