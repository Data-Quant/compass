import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { RelationshipType } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')

    if (!employeeId) {
      return NextResponse.json(
        { error: 'employeeId is required' },
        { status: 400 }
      )
    }

    const weightages = await prisma.weightage.findMany({
      where: { employeeId },
    })

    return NextResponse.json({ weightages })
  } catch (error) {
    console.error('Failed to fetch weightages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch weightages' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { employeeId, weightages } = await request.json()

    if (!employeeId || !weightages || !Array.isArray(weightages)) {
      return NextResponse.json(
        { error: 'employeeId and weightages array are required' },
        { status: 400 }
      )
    }

    // Validate that weightages sum to 100%
    const total = weightages.reduce(
      (sum: number, w: any) => sum + (w.weightagePercentage || 0),
      0
    )

    if (Math.abs(total - 1.0) > 0.01) {
      return NextResponse.json(
        { error: `Weightages must sum to 100%. Current total: ${(total * 100).toFixed(2)}%` },
        { status: 400 }
      )
    }

    // Delete existing weightages for this employee
    await prisma.weightage.deleteMany({
      where: { employeeId },
    })

    // Create new weightages
    const created = await Promise.all(
      weightages.map((w: any) =>
        prisma.weightage.create({
          data: {
            employeeId,
            relationshipType: w.relationshipType as RelationshipType,
            weightagePercentage: w.weightagePercentage,
          },
        })
      )
    )

    return NextResponse.json({ success: true, weightages: created })
  } catch (error) {
    console.error('Failed to save weightages:', error)
    return NextResponse.json(
      { error: 'Failed to save weightages' },
      { status: 500 }
    )
  }
}

