import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('categoryId')

    const benefits = await prisma.benefit.findMany({
      where: categoryId ? { categoryId } : {},
      include: {
        category: {
          select: { id: true, name: true, region: true, employeeType: true, isActive: true },
        },
      },
      orderBy: [{ categoryId: 'asc' }, { orderIndex: 'asc' }, { title: 'asc' }],
    })

    return NextResponse.json({ benefits })
  } catch (error) {
    console.error('Failed to fetch benefits:', error)
    return NextResponse.json({ error: 'Failed to fetch benefits' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const orderIndex = Number.isInteger(body.orderIndex) ? body.orderIndex : 0

    if (!categoryId || !title || !description) {
      return NextResponse.json(
        { error: 'categoryId, title, and description are required' },
        { status: 400 }
      )
    }

    const category = await prisma.benefitCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    })
    if (!category) {
      return NextResponse.json({ error: 'Benefit category not found' }, { status: 404 })
    }

    const benefit = await prisma.benefit.create({
      data: {
        categoryId,
        title,
        description,
        orderIndex,
        isActive: body.isActive !== false,
      },
    })

    return NextResponse.json({ success: true, benefit })
  } catch (error) {
    console.error('Failed to create benefit:', error)
    return NextResponse.json({ error: 'Failed to create benefit' }, { status: 500 })
  }
}
