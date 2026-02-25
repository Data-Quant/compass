import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hasCompletedAllModules } from '@/lib/onboarding'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const progress = await prisma.onboardingProgress.findMany({
      where: { userId: user.id },
      include: {
        module: {
          select: {
            id: true,
            slug: true,
            title: true,
            orderIndex: true,
            isActive: true,
          },
        },
      },
      orderBy: {
        module: { orderIndex: 'asc' },
      },
    })

    return NextResponse.json({
      progress,
      allModulesCompleted: await hasCompletedAllModules(user.id),
    })
  } catch (error) {
    console.error('Failed to fetch onboarding progress:', error)
    return NextResponse.json({ error: 'Failed to fetch onboarding progress' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const moduleId = typeof body.moduleId === 'string' ? body.moduleId : ''
    const moduleSlug = typeof body.moduleSlug === 'string' ? body.moduleSlug : ''
    if (!moduleId && !moduleSlug) {
      return NextResponse.json({ error: 'moduleId or moduleSlug is required' }, { status: 400 })
    }

    const module = await prisma.onboardingModule.findFirst({
      where: {
        OR: [{ id: moduleId }, { slug: moduleSlug }],
      },
      select: { id: true, orderIndex: true },
    })
    if (!module) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 })
    }

    const current = await prisma.onboardingProgress.findUnique({
      where: {
        userId_moduleId: {
          userId: user.id,
          moduleId: module.id,
        },
      },
      include: {
        module: { select: { orderIndex: true } },
      },
    })

    if (!current) {
      return NextResponse.json({ error: 'Progress not initialized for this user' }, { status: 400 })
    }
    if (current.status !== 'IN_PROGRESS') {
      return NextResponse.json({ error: 'Only in-progress modules can be completed' }, { status: 400 })
    }

    const now = new Date()
    const result = await prisma.$transaction(async (tx) => {
      await tx.onboardingProgress.update({
        where: {
          userId_moduleId: {
            userId: user.id,
            moduleId: module.id,
          },
        },
        data: {
          status: 'COMPLETED',
          completedAt: now,
        },
      })

      const next = await tx.onboardingProgress.findFirst({
        where: {
          userId: user.id,
          status: 'LOCKED',
          module: {
            isActive: true,
            orderIndex: { gt: current.module.orderIndex },
          },
        },
        include: {
          module: { select: { id: true, slug: true, orderIndex: true } },
        },
        orderBy: {
          module: { orderIndex: 'asc' },
        },
      })

      if (next) {
        await tx.onboardingProgress.update({
          where: { id: next.id },
          data: {
            status: 'IN_PROGRESS',
            startedAt: next.startedAt ?? now,
          },
        })
      }

      return next?.module ?? null
    })

    return NextResponse.json({
      success: true,
      nextModule: result,
      allModulesCompleted: await hasCompletedAllModules(user.id),
    })
  } catch (error) {
    console.error('Failed to update onboarding progress:', error)
    return NextResponse.json({ error: 'Failed to update onboarding progress' }, { status: 500 })
  }
}
