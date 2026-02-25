import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()

    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const description = typeof body.description === 'string' ? body.description.trim() : undefined
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : undefined
    const orderIndex = Number.isInteger(body.orderIndex) ? body.orderIndex : undefined
    const isActive = typeof body.isActive === 'boolean' ? body.isActive : undefined

    if (categoryId) {
      const category = await prisma.benefitCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
      if (!category) {
        return NextResponse.json({ error: 'Benefit category not found' }, { status: 404 })
      }
    }

    const benefit = await prisma.benefit.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(orderIndex !== undefined ? { orderIndex } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    })

    return NextResponse.json({ success: true, benefit })
  } catch (error) {
    console.error('Failed to update benefit:', error)
    return NextResponse.json({ error: 'Failed to update benefit' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    await prisma.benefit.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete benefit:', error)
    return NextResponse.json({ error: 'Failed to delete benefit' }, { status: 500 })
  }
}
