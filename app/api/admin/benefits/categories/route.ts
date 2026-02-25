import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const categories = await prisma.benefitCategory.findMany({
      include: {
        _count: {
          select: {
            benefits: true,
            users: true,
          },
        },
      },
      orderBy: [{ region: 'asc' }, { employeeType: 'asc' }],
    })

    return NextResponse.json({ categories })
  } catch (error) {
    console.error('Failed to fetch benefit categories:', error)
    return NextResponse.json({ error: 'Failed to fetch benefit categories' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const region = typeof body.region === 'string' ? body.region.trim() : ''
    const employeeType = typeof body.employeeType === 'string' ? body.employeeType.trim() : ''
    if (!name || !region || !employeeType) {
      return NextResponse.json({ error: 'name, region, and employeeType are required' }, { status: 400 })
    }

    const category = await prisma.benefitCategory.create({
      data: {
        name,
        region,
        employeeType,
        isActive: body.isActive !== false,
      },
    })

    return NextResponse.json({ success: true, category })
  } catch (error) {
    console.error('Failed to create benefit category:', error)
    return NextResponse.json({ error: 'Failed to create benefit category' }, { status: 500 })
  }
}
