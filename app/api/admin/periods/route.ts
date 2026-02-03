import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET - List all evaluation periods
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const periods = await prisma.evaluationPeriod.findMany({
      include: {
        _count: {
          select: {
            evaluations: true,
            reports: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    })

    return NextResponse.json({ periods })
  } catch (error) {
    console.error('Failed to fetch periods:', error)
    return NextResponse.json(
      { error: 'Failed to fetch periods' },
      { status: 500 }
    )
  }
}

// POST - Create a new evaluation period
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, startDate, endDate, isActive } = await request.json()

    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Name, start date, and end date are required' },
        { status: 400 }
      )
    }

    // If setting this period as active, deactivate all others
    if (isActive) {
      await prisma.evaluationPeriod.updateMany({
        data: { isActive: false },
      })
    }

    const period = await prisma.evaluationPeriod.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: isActive || false,
      },
    })

    return NextResponse.json({ success: true, period })
  } catch (error) {
    console.error('Failed to create period:', error)
    return NextResponse.json(
      { error: 'Failed to create period' },
      { status: 500 }
    )
  }
}

// PUT - Update an evaluation period
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, name, startDate, endDate, isActive, isLocked } = await request.json()

    if (!id || !name || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'ID, name, start date, and end date are required' },
        { status: 400 }
      )
    }

    // If setting this period as active, deactivate all others
    if (isActive) {
      await prisma.evaluationPeriod.updateMany({
        where: { id: { not: id } },
        data: { isActive: false },
      })
    }

    const period = await prisma.evaluationPeriod.update({
      where: { id },
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: isActive || false,
        isLocked: isLocked || false,
      },
    })

    return NextResponse.json({ success: true, period })
  } catch (error) {
    console.error('Failed to update period:', error)
    return NextResponse.json(
      { error: 'Failed to update period' },
      { status: 500 }
    )
  }
}

// DELETE - Delete an evaluation period
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Period ID is required' }, { status: 400 })
    }

    // Check if period has evaluations
    const period = await prisma.evaluationPeriod.findUnique({
      where: { id },
      include: {
        _count: {
          select: { evaluations: true },
        },
      },
    })

    if (period && period._count.evaluations > 0) {
      return NextResponse.json(
        { error: 'Cannot delete period with existing evaluations. Archive it instead.' },
        { status: 400 }
      )
    }

    await prisma.evaluationPeriod.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete period:', error)
    return NextResponse.json(
      { error: 'Failed to delete period' },
      { status: 500 }
    )
  }
}
