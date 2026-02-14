import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { toCategorySetKey, RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'

/**
 * GET - List all weight profiles
 */
export async function GET() {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profiles = await prisma.weightProfile.findMany({
      orderBy: { displayName: 'asc' },
    })

    // Also get employee counts per profile
    const mappings = await prisma.evaluatorMapping.findMany({
      select: { evaluateeId: true, relationshipType: true },
    })

    // Group by evaluatee to determine their category sets
    const employeeSets = new Map<string, Set<string>>()
    for (const m of mappings) {
      if (m.relationshipType === 'SELF') continue
      if (!employeeSets.has(m.evaluateeId)) {
        employeeSets.set(m.evaluateeId, new Set())
      }
      employeeSets.get(m.evaluateeId)!.add(m.relationshipType)
    }

    // Count employees per category set key
    const employeeCounts: Record<string, number> = {}
    for (const [, types] of employeeSets) {
      const key = toCategorySetKey([...types])
      employeeCounts[key] = (employeeCounts[key] || 0) + 1
    }

    const profilesWithCounts = profiles.map(p => ({
      ...p,
      employeeCount: employeeCounts[p.categorySetKey] || 0,
    }))

    return NextResponse.json({ profiles: profilesWithCounts })
  } catch (error) {
    console.error('Failed to fetch weight profiles:', error)
    return NextResponse.json({ error: 'Failed to fetch weight profiles' }, { status: 500 })
  }
}

/**
 * POST - Create or update a weight profile
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { categoryTypes, weights, displayName } = await request.json()

    if (!categoryTypes || !Array.isArray(categoryTypes) || !weights) {
      return NextResponse.json(
        { error: 'categoryTypes (array) and weights (object) are required' },
        { status: 400 }
      )
    }

    // Validate weights sum to 1.0
    const total = Object.values(weights as Record<string, number>).reduce((s, w) => s + w, 0)
    if (Math.abs(total - 1.0) > 0.01) {
      return NextResponse.json(
        { error: `Weights must sum to 100%. Current total: ${(total * 100).toFixed(2)}%` },
        { status: 400 }
      )
    }

    const categorySetKey = toCategorySetKey(categoryTypes)
    const name = displayName || categoryTypes
      .map((t: string) => RELATIONSHIP_TYPE_LABELS[t as RelationshipType] || t)
      .join(', ')

    const profile = await prisma.weightProfile.upsert({
      where: { categorySetKey },
      update: { weights, displayName: name },
      create: { categorySetKey, displayName: name, weights },
    })

    return NextResponse.json({ success: true, profile })
  } catch (error) {
    console.error('Failed to save weight profile:', error)
    return NextResponse.json({ error: 'Failed to save weight profile' }, { status: 500 })
  }
}

/**
 * DELETE - Delete a weight profile by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Profile id is required' }, { status: 400 })
    }

    await prisma.weightProfile.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete weight profile:', error)
    return NextResponse.json({ error: 'Failed to delete weight profile' }, { status: 500 })
  }
}

