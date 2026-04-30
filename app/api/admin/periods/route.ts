import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { snapshotEvaluationPeriodAssignments } from '@/lib/evaluation-assignments'

function toDateOnly(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function validatePeriodDates(startDate: Date, endDate: Date, reviewStartDate: Date) {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || Number.isNaN(reviewStartDate.getTime())) {
    return 'Invalid period dates'
  }

  if (endDate < startDate) {
    return 'End date must be on or after the quarter start date'
  }

  if (reviewStartDate <= endDate) {
    return 'Evaluation start date must be after the quarter end date'
  }

  return null
}

// GET - List all evaluation periods
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
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
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, startDate, endDate, reviewStartDate, isActive } = await request.json()

    if (!name || !startDate || !endDate || !reviewStartDate) {
      return NextResponse.json(
        { error: 'Name, quarter start, quarter end, and evaluation start date are required' },
        { status: 400 }
      )
    }

    const normalizedStartDate = toDateOnly(startDate)
    const normalizedEndDate = toDateOnly(endDate)
    const normalizedReviewStartDate = toDateOnly(reviewStartDate)
    const validationError = validatePeriodDates(normalizedStartDate, normalizedEndDate, normalizedReviewStartDate)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
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
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        reviewStartDate: normalizedReviewStartDate,
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
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, name, startDate, endDate, reviewStartDate, isActive, isLocked } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      )
    }

    const existing = await prisma.evaluationPeriod.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      )
    }

    const normalizedStartDate = startDate ? toDateOnly(startDate) : existing.startDate
    const normalizedEndDate = endDate ? toDateOnly(endDate) : existing.endDate
    const normalizedReviewStartDate = reviewStartDate ? toDateOnly(reviewStartDate) : existing.reviewStartDate
    const validationError = validatePeriodDates(normalizedStartDate, normalizedEndDate, normalizedReviewStartDate)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const nextIsLocked = isLocked ?? existing.isLocked
    const nextIsActive = isActive ?? existing.isActive
    const isUnlocking = existing.isLocked && !nextIsLocked
    const shouldSnapshotAssignments = !existing.isLocked && nextIsLocked

    if (isUnlocking && !nextIsActive) {
      const activePeriod = await prisma.evaluationPeriod.findFirst({
        where: {
          isActive: true,
          id: { not: id },
        },
        select: { name: true },
      })

      return NextResponse.json(
        {
          error: activePeriod
            ? `Cannot unlock this locked historical period while ${activePeriod.name} is active. Activate this period first if it truly needs to be reopened.`
            : 'Cannot unlock an inactive locked period. Activate this period first if it truly needs to be reopened.',
        },
        { status: 400 }
      )
    }

    const period = await prisma.$transaction(async (tx) => {
      // If setting this period as active, deactivate all others
      if (isActive) {
        await tx.evaluationPeriod.updateMany({
          where: { id: { not: id } },
          data: { isActive: false },
        })
      }

      if (shouldSnapshotAssignments) {
        await snapshotEvaluationPeriodAssignments(id, tx)
      }

      return tx.evaluationPeriod.update({
        where: { id },
        data: {
          name: name ?? existing.name,
          startDate: normalizedStartDate,
          endDate: normalizedEndDate,
          reviewStartDate: normalizedReviewStartDate,
          isActive: nextIsActive,
          isLocked: nextIsLocked,
        },
      })
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
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const body = await request.json().catch(() => ({}))
    const id = searchParams.get('id') || body.id

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

