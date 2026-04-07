import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { toCategorySetKey, RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import { analyzeWeightProfileAssignments, buildWeightProfileDisplayName } from '@/lib/weight-profiles'

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

    const [users, mappings] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          department: true,
        },
      }),
      prisma.evaluatorMapping.findMany({
        select: { evaluateeId: true, relationshipType: true },
      }),
    ])

    const diagnostics = analyzeWeightProfileAssignments({
      profiles: profiles.map((profile) => ({
        categorySetKey: profile.categorySetKey,
        displayName: profile.displayName,
        weights: profile.weights as Record<string, number>,
      })),
      users,
      mappings,
    })

    const profilesWithCounts = profiles.map(p => ({
      ...p,
      employeeCount: diagnostics.employeeCounts[p.categorySetKey] || 0,
    }))

    return NextResponse.json({
      profiles: profilesWithCounts,
      warnings: {
        unmatchedCategorySets: diagnostics.unmatchedCategorySets,
        mismatchedEmployees: diagnostics.mismatchedEmployees,
      },
    })
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
    const normalizedTypes = categoryTypes.map((type: string) => type as RelationshipType)
    const name =
      displayName ||
      buildWeightProfileDisplayName(normalizedTypes) ||
      normalizedTypes
        .map((t) => RELATIONSHIP_TYPE_LABELS[t] || t)
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

