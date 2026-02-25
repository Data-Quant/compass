import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true' && user.role === 'HR'

    const where = includeInactive ? {} : { isActive: true }
    const modules = await prisma.onboardingModule.findMany({
      where,
      orderBy: { orderIndex: 'asc' },
    })

    const progressRows = await prisma.onboardingProgress.findMany({
      where: {
        userId: user.id,
        moduleId: { in: modules.map((m) => m.id) },
      },
      select: {
        moduleId: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    })
    const progressByModuleId = new Map(progressRows.map((row) => [row.moduleId, row]))

    const payload = modules.map((module) => ({
      ...module,
      progress: progressByModuleId.get(module.id) || null,
      status: progressByModuleId.get(module.id)?.status ?? 'LOCKED',
    }))

    const total = payload.length
    const completed = payload.filter((m) => m.status === 'COMPLETED').length

    return NextResponse.json({
      modules: payload,
      summary: {
        total,
        completed,
      },
    })
  } catch (error) {
    console.error('Failed to fetch onboarding modules:', error)
    return NextResponse.json({ error: 'Failed to fetch onboarding modules' }, { status: 500 })
  }
}
