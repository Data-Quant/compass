import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function findModuleByIdOrSlug(idOrSlug: string) {
  return prisma.onboardingModule.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
  })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const module = await findModuleByIdOrSlug(id)
    if (!module) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 })
    }

    let progress = null as null | {
      status: string
      startedAt: Date | null
      completedAt: Date | null
    }

    if (!canManageOnboarding(user.role)) {
      const userProgress = await prisma.onboardingProgress.findUnique({
        where: {
          userId_moduleId: {
            userId: user.id,
            moduleId: module.id,
          },
        },
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
        },
      })
      if (!userProgress || userProgress.status === 'LOCKED') {
        return NextResponse.json({ error: 'Module is locked' }, { status: 403 })
      }
      progress = userProgress
    }

    return NextResponse.json({
      module,
      progress,
    })
  } catch (error) {
    console.error('Failed to fetch onboarding module:', error)
    return NextResponse.json({ error: 'Failed to fetch onboarding module' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const module = await findModuleByIdOrSlug(id)
    if (!module) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 })
    }

    const body = await request.json()
    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const content = typeof body.content === 'string' ? body.content : undefined
    const isActive = typeof body.isActive === 'boolean' ? body.isActive : undefined
    const orderIndex =
      typeof body.orderIndex === 'number' && Number.isInteger(body.orderIndex) ? body.orderIndex : undefined

    if (orderIndex !== undefined && orderIndex < 1) {
      return NextResponse.json({ error: 'orderIndex must be >= 1' }, { status: 400 })
    }

    if (orderIndex !== undefined && orderIndex !== module.orderIndex) {
      const progressedCount = await prisma.onboardingProgress.count({
        where: {
          userId: { not: '' },
          status: { not: 'LOCKED' },
        },
      })
      if (progressedCount > 0) {
        return NextResponse.json(
          { error: 'Cannot reorder modules after onboarding has started for users' },
          { status: 400 }
        )
      }
    }

    const updated = await prisma.onboardingModule.update({
      where: { id: module.id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(orderIndex !== undefined ? { orderIndex } : {}),
      },
    })

    return NextResponse.json({ success: true, module: updated })
  } catch (error) {
    console.error('Failed to update onboarding module:', error)
    return NextResponse.json({ error: 'Failed to update onboarding module' }, { status: 500 })
  }
}
