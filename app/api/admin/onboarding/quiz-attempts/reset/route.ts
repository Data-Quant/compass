import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const userId = typeof body.userId === 'string' ? body.userId : ''
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    await prisma.$transaction([
      prisma.quizAttempt.deleteMany({
        where: { userId },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { onboardingCompleted: false },
      }),
      prisma.newHire.updateMany({
        where: { userId },
        data: { status: 'ONBOARDING' },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to reset quiz attempts:', error)
    return NextResponse.json({ error: 'Failed to reset quiz attempts' }, { status: 500 })
  }
}
