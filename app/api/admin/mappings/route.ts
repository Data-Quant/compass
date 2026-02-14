import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'

// GET - List all evaluator mappings
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const evaluateeId = searchParams.get('evaluateeId')
    const evaluatorId = searchParams.get('evaluatorId')

    const where: any = {}
    if (evaluateeId) where.evaluateeId = evaluateeId
    if (evaluatorId) where.evaluatorId = evaluatorId

    const mappings = await prisma.evaluatorMapping.findMany({
      where,
      include: {
        evaluator: {
          select: { id: true, name: true, department: true, position: true },
        },
        evaluatee: {
          select: { id: true, name: true, department: true, position: true },
        },
      },
      orderBy: [
        { evaluatee: { name: 'asc' } },
        { relationshipType: 'asc' },
      ],
    })

    return NextResponse.json({ mappings })
  } catch (error) {
    console.error('Failed to fetch mappings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch mappings' },
      { status: 500 }
    )
  }
}

// POST - Create a new mapping
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { evaluatorId, evaluateeId, relationshipType } = await request.json()

    if (!evaluatorId || !evaluateeId || !relationshipType) {
      return NextResponse.json(
        { error: 'Evaluator, evaluatee, and relationship type are required' },
        { status: 400 }
      )
    }

    // Check if mapping already exists
    const existing = await prisma.evaluatorMapping.findFirst({
      where: { evaluatorId, evaluateeId, relationshipType },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'This mapping already exists' },
        { status: 400 }
      )
    }

    const mapping = await prisma.evaluatorMapping.create({
      data: {
        evaluatorId,
        evaluateeId,
        relationshipType,
      },
      include: {
        evaluator: {
          select: { id: true, name: true, department: true },
        },
        evaluatee: {
          select: { id: true, name: true, department: true },
        },
      },
    })

    return NextResponse.json({ success: true, mapping })
  } catch (error) {
    console.error('Failed to create mapping:', error)
    return NextResponse.json(
      { error: 'Failed to create mapping' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a mapping
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Mapping ID is required' }, { status: 400 })
    }

    await prisma.evaluatorMapping.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete mapping:', error)
    return NextResponse.json(
      { error: 'Failed to delete mapping' },
      { status: 500 }
    )
  }
}

// PUT - Bulk import mappings
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { mappings } = await request.json()

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return NextResponse.json({ error: 'Mappings array is required' }, { status: 400 })
    }

    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
    }

    for (const mapping of mappings) {
      try {
        // Find users by name or email
        let evaluator = await prisma.user.findFirst({
          where: {
            OR: [
              { name: { contains: mapping.evaluatorName, mode: 'insensitive' } },
              { email: { equals: mapping.evaluatorEmail, mode: 'insensitive' } },
            ],
          },
        })

        let evaluatee = await prisma.user.findFirst({
          where: {
            OR: [
              { name: { contains: mapping.evaluateeName, mode: 'insensitive' } },
              { email: { equals: mapping.evaluateeEmail, mode: 'insensitive' } },
            ],
          },
        })

        if (!evaluator) {
          results.errors.push(`Evaluator not found: ${mapping.evaluatorName || mapping.evaluatorEmail}`)
          continue
        }

        if (!evaluatee) {
          results.errors.push(`Evaluatee not found: ${mapping.evaluateeName || mapping.evaluateeEmail}`)
          continue
        }

        // Check if mapping already exists
        const existing = await prisma.evaluatorMapping.findFirst({
          where: {
            evaluatorId: evaluator.id,
            evaluateeId: evaluatee.id,
            relationshipType: mapping.relationshipType,
          },
        })

        if (existing) {
          results.skipped++
          continue
        }

        await prisma.evaluatorMapping.create({
          data: {
            evaluatorId: evaluator.id,
            evaluateeId: evaluatee.id,
            relationshipType: mapping.relationshipType,
          },
        })

        results.created++
      } catch (error) {
        console.error('Error processing mapping:', error)
        results.errors.push('Error processing mapping')
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Failed to import mappings:', error)
    return NextResponse.json(
      { error: 'Failed to import mappings' },
      { status: 500 }
    )
  }
}

