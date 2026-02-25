import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendOnboardingCompletedNotification } from '@/lib/email'
import { hasCompletedAllModules, getOnboardingAttemptStats } from '@/lib/onboarding'

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const modulesDone = await hasCompletedAllModules(user.id)
    if (!modulesDone) {
      return NextResponse.json(
        { error: 'Complete all onboarding modules before submitting the quiz' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const answers = body.answers
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return NextResponse.json({ error: 'answers object is required' }, { status: 400 })
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
        correctAnswer: true,
      },
    })

    if (questions.length === 0) {
      return NextResponse.json({ error: 'No active quiz questions found' }, { status: 400 })
    }

    const normalizedAnswers: Record<string, Prisma.InputJsonValue | null> = {}
    const answerLookup = answers as Record<string, unknown>
    let correctCount = 0
    for (const question of questions) {
      const submitted = answerLookup[question.id]
      if (typeof submitted === 'string' && submitted === question.correctAnswer) {
        correctCount += 1
      }
      if (typeof submitted === 'string') {
        normalizedAnswers[question.id] = submitted
      } else {
        normalizedAnswers[question.id] = null
      }
    }

    const totalQuestions = questions.length
    const scorePercent = (correctCount / totalQuestions) * 100
    const passed = scorePercent >= config.quizPassPercent

    await prisma.quizAttempt.create({
      data: {
        userId: user.id,
        score: correctCount,
        totalQuestions,
        passed,
        answersJson: normalizedAnswers as Prisma.InputJsonValue,
      },
    })

    if (passed) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { onboardingCompleted: true },
        }),
        prisma.newHire.updateMany({
          where: { userId: user.id },
          data: { status: 'COMPLETED' },
        }),
      ])

      try {
        await sendOnboardingCompletedNotification(user.id)
      } catch (emailError) {
        console.error('Failed to send onboarding completed notification:', emailError)
      }
    }

    const attemptsUsed = attemptCount + 1
    const attemptsRemaining = Math.max(0, config.maxQuizAttempts - attemptsUsed)

    return NextResponse.json({
      success: true,
      result: {
        correctCount,
        totalQuestions,
        scorePercent: Math.round(scorePercent),
        passPercent: config.quizPassPercent,
        passed,
        attemptsUsed,
        attemptsRemaining,
        lockedOut: !passed && attemptsRemaining === 0,
      },
    })
  } catch (error) {
    console.error('Failed to submit onboarding quiz:', error)
    return NextResponse.json({ error: 'Failed to submit onboarding quiz' }, { status: 500 })
  }
}
